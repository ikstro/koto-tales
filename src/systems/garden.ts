import * as THREE from 'three';
import type { GardenLook } from '../assets/garden';
import type { LineId } from '../content/lines';
import { advance, bedKey, bedOf, CROPS, emptyBed, foldBack, GARDEN, isRipe, plant, plantable, stageOf, tapAct, water, type Bed, type Crop } from '../content/garden';
import { ITEMS } from '../content/items';
import { RAIN } from '../content/weather';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { giveItem } from './babusia';
import { pushCarried } from './effects';
import { eating } from './food';
import { selectedBuilding, standingWhere, type Standing } from './kit';
import { weatherNow } from './weather';

/**
 * The garden bed at work (building `garden`, rules content/garden.ts): one tap on a bed does the
 * next sensible thing (pick a ripe crop, plant the first carried one, water it, or a wiggle and a
 * word from Пупся); a ripe bed breathes when the party comes near and she says so once a day;
 * folded back into the box, what grows comes back. Beds are kept in `save.home.garden.beds` by
 * their footprint corner, as `save.placed` keeps them; a bed put up again starts bare.
 */

/** A tap counts this near the hero (blocks): on screen, within a few steps. */
const TAP_NEAR = 18;
const SOIL = 0x5b3a22;
const WATER = 0x7fcfff;

/** What the model is told, per bed (the counters start its motions). */
const looks = new Map<string, GardenLook>();
let wired = false;
let growsSaid = -1e9;
let hintSaid = -1e9;
const at = new THREE.Vector3();

const HARVEST_LINE: Record<Crop, LineId> = {
  potato: 'garden_harvest_potato',
  carrot: 'garden_harvest_carrot',
  cherry: 'garden_harvest_cherry',
  apple: 'garden_harvest_apple',
};

const keyOf = (s: Standing) => bedKey(s.rec.x, s.rec.z);
const beds = () => standingWhere((c) => c.id === 'garden');

function lookOf(key: string): GardenLook {
  let l = looks.get(key);
  if (!l) looks.set(key, (l = { crop: -1, stage: 0, near: false, harvests: 0, waters: 0, wiggles: 0 }));
  return l;
}

/** The bed as it stands today (days counted, rain taken in), written back to the save. */
function bedNow(ctx: Ctx, key: string): Bed {
  const g = ctx.save.home.garden;
  const b = advance(bedOf(g.beds[key], ctx.save.day), ctx.save.day, weatherNow(ctx) === RAIN);
  g.beds[key] = b;
  return b;
}

/** Tells the model what grows (and keeps the look for the next frame). */
function tell(ctx: Ctx, s: Standing): Bed {
  const key = keyOf(s);
  const b = bedNow(ctx, key);
  const l = lookOf(key);
  l.crop = b.crop ? CROPS.indexOf(b.crop) : -1;
  l.stage = Math.max(0, stageOf(b));
  s.extra.garden = l;
  return b;
}

const top = (s: Standing, y = 0.6) => at.copy(s.centre).setY(s.centre.y + y);

function say(id: LineId, interrupt = true): void {
  voice.say(id, { priority: 6, interrupt });
}

function tapped(ctx: Ctx, s: Standing): void {
  const key = keyOf(s);
  const g = ctx.save.home.garden;
  const b = bedNow(ctx, key);
  const l = lookOf(key);
  const now = ctx.clock.elapsed;
  switch (tapAct(b, ctx.save.inv)) {
    case 'harvest': {
      const crop = b.crop!;
      g.beds[key] = emptyBed(ctx.save.day);
      l.harvests++;
      giveItem(ctx, crop, GARDEN.harvest);
      for (let i = 0; i < 4; i++) ctx.effects.sparkle(top(s, 0.5 + i * 0.15).add(new THREE.Vector3((i - 1.5) * 0.6, 0, (i % 2) - 0.5)), 0xfff176);
      ctx.effects.poof(top(s, 0.6), ITEMS[crop].color, 14);
      sfx.play('pickup', { pitch: 1.1 });
      sfx.play('sticker');
      ctx.player.model.play('cheer');
      say(HARVEST_LINE[crop]);
      break;
    }
    case 'plant': {
      const crop = plantable(ctx.save.inv)!;
      ctx.save.inv[crop] = Math.max(0, (ctx.save.inv[crop] ?? 0) - GARDEN.seed);
      pushCarried(ctx);
      g.beds[key] = plant(crop, ctx.save.day);
      ctx.effects.poof(top(s, 0.45), SOIL, 12);
      ctx.effects.poof(top(s, 0.5), ITEMS[crop].color, 6);
      sfx.play('place', { pitch: 1.4 });
      ctx.player.model.play('happy');
      say('garden_plant');
      break;
    }
    case 'water':
      g.beds[key] = water(b);
      l.waters++;
      ctx.effects.ring(top(s, 0.4), WATER, 1.9);
      sfx.play('splash');
      setTimeout(() => sfx.play('splash', { pitch: 1.15, volume: 0.7 }), 600);
      ctx.player.model.play('happy');
      say('garden_water');
      break;
    case 'grows':
      l.wiggles++;
      sfx.play('click', { pitch: 1.3 });
      ctx.effects.sparkle(top(s, 0.8), 0x9ccc65);
      if (now - growsSaid > GARDEN.grows) {
        growsSaid = now;
        say(weatherNow(ctx) === RAIN ? 'garden_rain' : 'garden_grows');
      }
      break;
    case 'nothing':
      l.wiggles++;
      sfx.play('click');
      if (now - hintSaid > GARDEN.hint) {
        hintSaid = now;
        say('garden_what');
      }
      break;
  }
  tell(ctx, s);
}

/** Folded back into the box: what grows comes back into the box's row of things. */
function folded(ctx: Ctx, x: number, z: number): void {
  const g = ctx.save.home.garden;
  const key = bedKey(x, z);
  const b = g.beds[key] ? bedNow(ctx, key) : null;
  delete g.beds[key];
  looks.delete(key);
  const back = b && foldBack(b);
  if (!back) return;
  giveItem(ctx, back.item, back.n);
  ctx.effects.sparkle(at.set(x + 1.5, ctx.player.pos.y + 1, z + 1), ITEMS[back.item].color);
  sfx.play('pickup', { pitch: 1.2 });
}

export function initGarden(ctx: Ctx): void {
  looks.clear();
  // beds the world packed away (the house grew over them, a river came) went back into the box
  // like a fold: what grew comes back too, quietly (systems/kit.ts initKit)
  const g = ctx.save.home.garden;
  const standingKeys = new Set(ctx.save.placed.filter((p) => p.id === 'garden').map((p) => bedKey(p.x, p.z)));
  for (const key of Object.keys(g.beds)) {
    if (standingKeys.has(key)) continue;
    const back = foldBack(bedNow(ctx, key));
    delete g.beds[key];
    if (back) giveItem(ctx, back.item, back.n);
  }
  for (const s of beds()) tell(ctx, s);
  if (!wired) {
    wired = true;
    events.on('building:folded', ({ id, x, z }) => {
      if (id === 'garden') folded(ctx, x, z);
    });
    // a bed just put up is told at once, so it never shows another bed's crop for a frame
    events.on('building:placed', ({ id }) => {
      if (id !== 'garden') return;
      for (const s of beds()) {
        const key = keyOf(s);
        if (!s.extra.garden && !ctx.save.home.garden.beds[key]) ctx.save.home.garden.beds[key] = emptyBed(ctx.save.day);
        tell(ctx, s);
      }
    });
  }
  // For automated checks.
  (window as unknown as { __kotoGarden: object }).__kotoGarden = {
    /** Days go by (a new morning each). */
    day: (n = 1) => (ctx.save.day += n),
    /** One tap on the first bed (as if the child tapped it). */
    tap: (i = 0) => {
      const s = beds()[i];
      if (s) tapped(ctx, s);
    },
    /** Sets the first bed to a crop and stage (0 sprout, 1 growing, 2 ripe), for pictures. */
    grow: (crop: Crop, stage: number, i = 0) => {
      const s = beds()[i];
      if (s) ctx.save.home.garden.beds[keyOf(s)] = { crop, grown: stage, day: ctx.save.day, wet: false };
    },
    /** Where the first bed's tap point is on the screen (px), to tap it for real. */
    screen: (i = 0) => {
      const s = beds()[i];
      if (!s) return null;
      const v = top(s, 0.45).clone().project(ctx.camera);
      const r = ctx.renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    },
    get beds() {
      return JSON.parse(JSON.stringify(ctx.save.home.garden.beds)) as Record<string, Bed>;
    },
    get inv() {
      return { ...ctx.save.inv };
    },
  };
}

export function updateGarden(ctx: Ctx): void {
  const list = beds();
  if (!list.length) return;
  const p = ctx.player.pos;
  const g = ctx.save.home.garden;
  const free = ctx.playing && !ctx.sleeping && !ctx.napping && !eating() && !selectedBuilding() && !ctx.map.isOpen;
  let ripeNear = false;
  for (const s of list) {
    const b = tell(ctx, s);
    const d = Math.hypot(p.x - s.centre.x, p.z - s.centre.z);
    const near = isRipe(b) && d < GARDEN.near && Math.abs(p.y - s.centre.y) < 4;
    s.extra.garden!.near = near;
    ripeNear ||= near;
    if (!free || !ctx.input.taps.length || d > TAP_NEAR) continue;
    const [w, dd] = s.card.size;
    if (tappedAt(ctx, top(s, 0.45), Math.max(w, dd) / 2 + 0.2)) tapped(ctx, s);
  }
  if (ripeNear && free && g.ripeSaid !== ctx.save.day && !voice.isSpeaking()) {
    g.ripeSaid = ctx.save.day;
    say('garden_ripe', false);
  }
}
