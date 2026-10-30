import * as THREE from 'three';
import type { Monster } from '../actors/entities';
import { holdSnack } from '../assets/food';
import { createPlane, createTaleThing, type PlaneModel, type TaleThing } from '../assets/tales';
import type { LineId } from '../content/lines';
import { SPAWN } from '../content/monsters';
import { entryOf, nextTale, PROLOGUE, stepGoal, taleById, TALE_ITEMS, TALES, type TaleCard, type TaleItem, type TalePlace, type TaleStep } from '../content/tales';
import { RACE_CARDS } from '../content/villages';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { setMapMarker } from '../ui/map';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { B } from '../world/blocks';
import type { LighthouseSite } from '../world/landmarks';
import { homeDistance } from './house';
import { owned, selectedBuilding } from './kit';
import { giveArtifact } from './artifacts';
import { giveCompanion } from './companions';
import { spawnAt } from './monsters';
import { giveCoins, musicNear, offerBubble, runWave, spotAround, type Wave, type WaveRule } from './tasks';

/**
 * The tales (DESIGN.md «Tales», cards in content/tales.ts): always one under way. The prologue
 * begins as the heroes wake; the friends' tales come by a paper plane that lands at the hero's
 * feet; Пупся's come as her dream after a night's sleep. Each step sets its things out in the
 * world (things to gather with sparkle columns, a thief with a fish, a place to reach), marks
 * the way on the map, and shows its picture on the tale piece by the minimap. A tale done:
 * thanks, coins, and its page in the book of tales (the album). The next one comes next day.
 */

/** Where a place step counts (blocks from the place). */
const NEAR: Record<'home' | 'village' | 'lighthouse', number> = { home: 8, village: 26, lighthouse: 10 };
/** One already standing this close to the place counts (one put up during the step counts anywhere). */
const PLACE_AT = 30;
const MUSIC_AT = 15;
const THIEF_FROM: [number, number] = [19, 24];
/** The thief comes out when the hero is this close to its spot. */
const THIEF_NEAR = 36;
const WAVE = (line: LineId): WaveRule => ({ from: [19, 25], near: 45, atOnce: 3, line });
/** A plane opens by itself this long after landing. */
const LETTER_WAIT = 15;
/** The prologue begins this long after the heroes wake. */
const PROLOGUE_AT = 6;
/** Seconds without progress before Пупся's thought becomes a reminder of the step. */
const REMIND_AFTER = 75;
const DREAM_BUBBLE = 6;

interface Thing {
  model: TaleThing;
  item: TaleItem;
  pos: THREE.Vector3;
  key: string;
}

/** The world part of the step under way (rebuilt on load and on every new step). */
interface Run {
  key: string;
  things: Thing[];
  thief: Monster | null;
  thiefSpot: THREE.Vector3 | null;
  target: THREE.Vector3;
  wave: Wave;
  /** visit: how far it was when the step began. */
  d0: number;
  checkT: number;
}

interface Plane {
  model: PlaneModel;
  tale: TaleCard;
  pos: THREE.Vector3;
  landed: boolean;
  wait: number;
}

let run: Run | null = null;
let plane: Plane | null = null;
/** A chest found keeps standing open a moment. */
const leaving: { model: TaleThing; t: number }[] = [];
let things = 0;
/** Lines said one after another (the voice has no queue of its own). */
const queue: LineId[] = [];
let holdT = 0;
let idle = 0;
let lastLit = -1;
let checkT = 0;
let dreamT = 0;
const tmp = new THREE.Vector3();

const has = (ctx: Ctx) => (b: Parameters<typeof owned>[1]) => owned(ctx, b) > 0;
const tale = (ctx: Ctx) => taleById(ctx.save.tales.cur);
const stepOf = (ctx: Ctx): TaleStep | null => tale(ctx)?.steps[ctx.save.tales.step] ?? null;

/** Says the lines in turn, each after the one before has ended. */
function tell(...ids: LineId[]): void {
  voice.preload(ids);
  queue.push(...ids);
}

/** The tale's asks not said yet are dropped: a step done needs no asking. */
function dropAsks(t: TaleCard): void {
  for (const st of t.steps) for (let i = queue.indexOf(st.ask); i >= 0; i = queue.indexOf(st.ask)) queue.splice(i, 1);
}

function pumpLines(dt: number): void {
  holdT -= dt;
  if (!queue.length || holdT > 0 || voice.isSpeaking() || voice.quietSeconds() < 0.4) return;
  voice.say(queue.shift()!, { priority: 7, interrupt: true });
  // a line still loading is not speaking yet: give it time to begin
  holdT = 1.2;
}

// ─── places ──────────────────────────────────────────────────────────────────

function villageOf(ctx: Ctx, race: string) {
  return (ctx.world.villages?.() ?? []).find((v) => v.race === race) ?? null;
}

const lighthouseAt = (l: LighthouseSite) => new THREE.Vector3(l.x + 1.5, l.y + 1, l.z + 1.5);

/** The nearest lighthouse not lit yet. */
function darkLighthouse(ctx: Ctx): LighthouseSite | null {
  const p = ctx.player.pos;
  const lit = new Set(ctx.save.lit);
  let best: LighthouseSite | null = null;
  let bd = Infinity;
  for (const l of ctx.world.lighthousesNear?.(p.x, p.z, 260) ?? []) {
    if (lit.has(l.id)) continue;
    const d = Math.hypot(l.x - p.x, l.z - p.z);
    if (d < bd) (best = l), (bd = d);
  }
  return best;
}

function placeOf(ctx: Ctx, at: TalePlace): THREE.Vector3 {
  const home = ctx.house?.centre ?? ctx.player.pos;
  if (at === 'home') return home.clone();
  if (at === 'here') return ctx.player.pos.clone();
  if (at === 'lighthouse') {
    const l = darkLighthouse(ctx);
    return l ? lighthouseAt(l) : ctx.player.pos.clone();
  }
  const v = villageOf(ctx, at);
  return v ? new THREE.Vector3(v.x + 0.5, v.y + 1, v.z + 0.5) : home.clone();
}

/** A dry, open spot `r0..r1` from `centre`: not on a tree, in water or by the house walls. */
function freeSpot(ctx: Ctx, centre: THREE.Vector3, r0: number, r1: number): THREE.Vector3 {
  const f = ctx.house?.footprint;
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    const x = Math.floor(centre.x + Math.sin(a) * r);
    const z = Math.floor(centre.z + Math.cos(a) * r);
    if (f && x >= f.x0 - 2 && x <= f.x1 + 2 && z >= f.z0 - 2 && z <= f.z1 + 2) continue;
    const g = ctx.world.groundHeight(x, z);
    const top = ctx.world.getBlock(x, g - 1, z);
    if (top === B.LEAVES || top === B.LOG) continue;
    if (ctx.world.isWater(x, g, z) || ctx.world.isWater(x, g - 1, z)) continue;
    if (Math.abs(ctx.world.groundHeight(x + 1, z) - g) > 1 || Math.abs(ctx.world.groundHeight(x, z + 1) - g) > 1) continue;
    return new THREE.Vector3(x + 0.5, g, z + 0.5);
  }
  return spotAround(ctx, centre, r0, r1, centre);
}

// ─── the step's world part ───────────────────────────────────────────────────

function addThing(ctx: Ctx, r: Run, item: TaleItem, pos: THREE.Vector3): void {
  const model = createTaleThing(ctx.skin, item);
  model.root.position.copy(pos);
  ctx.scene.add(model.root);
  r.things.push({ model, item, pos, key: `tale:i:${things++}` });
}

/** Things lying about are marks on the map; the nearest points the way. */
function markThings(ctx: Ctx, r: Run): void {
  const p = ctx.player.pos;
  let near: Thing | null = null;
  for (const th of r.things) if (!near || th.pos.distanceToSquared(p) < near.pos.distanceToSquared(p)) near = th;
  for (const th of r.things) setMapMarker(th.key, { pos: th.pos, icon: TALE_ITEMS[th.item].icon, pointer: th === near });
}

function clearRun(ctx: Ctx): void {
  if (!run) return;
  for (const th of run.things) {
    ctx.scene.remove(th.model.root);
    setMapMarker(th.key, null);
  }
  setMapMarker('tale:thief', null);
  setMapMarker('tale:goal', null);
  run = null;
}

function makeRun(ctx: Ctx, step: TaleStep, key: string): Run {
  const s = ctx.save.tales;
  const r: Run = { key, things: [], thief: null, thiefSpot: null, target: placeOf(ctx, step.at), wave: { wave: new Set(), waveT: 0 }, d0: 1, checkT: 0 };
  switch (step.kind) {
    case 'gather': {
      const [r0, r1] = step.spread ?? [8, 20];
      for (let i = s.got; i < stepGoal(step); i++) addThing(ctx, r, step.item!, freeSpot(ctx, r.target, r0, r1));
      break;
    }
    case 'thief':
      r.thiefSpot = freeSpot(ctx, r.target, ...THIEF_FROM);
      break;
    case 'place':
      ctx.hud.suggestKit(true);
      break;
    case 'visit':
      r.d0 = Math.max(1, Math.hypot(ctx.player.pos.x - r.target.x, ctx.player.pos.z - r.target.z));
      break;
  }
  return r;
}

/** The run matches the step in the save (a new step, a load, a tale begun or done). */
function syncRun(ctx: Ctx): void {
  const s = ctx.save.tales;
  const t = tale(ctx);
  const key = t ? `${t.id}:${s.step}` : '';
  if ((run?.key ?? '') === key) return;
  clearRun(ctx);
  idle = 0;
  lastLit = -1;
  const step = stepOf(ctx);
  if (step) run = makeRun(ctx, step, key);
}

// ─── beginning, steps, the end ───────────────────────────────────────────────

function begin(ctx: Ctx, t: TaleCard, how: 'wake' | 'dream' | 'letter'): void {
  const s = ctx.save.tales;
  s.cur = t.id;
  s.step = 0;
  s.got = 0;
  const lines: LineId[] = how === 'letter' ? ['tale_letter'] : [];
  if (t.lyosha) lines.push('tale_lyosha');
  tell(...lines, t.open, t.steps[0].ask);
  if (how === 'dream') dreamT = DREAM_BUBBLE;
  // the prologue's tent step teaches the kit box: the old 90-second tip is not needed
  if (t.id === PROLOGUE && !ctx.save.said.includes('tip_build')) ctx.save.said.push('tip_build');
  events.emit('tale:start', { id: t.id });
  syncRun(ctx);
}

function stepDone(ctx: Ctx, at?: THREE.Vector3): void {
  const t = tale(ctx);
  if (!t) return;
  const s = ctx.save.tales;
  const step = t.steps[s.step];
  if (step?.kind === 'place') ctx.hud.suggestKit(false);
  s.step++;
  s.got = 0;
  dropAsks(t);
  if (s.step >= t.steps.length) {
    complete(ctx, t, at);
    return;
  }
  sfx.play('sticker', { pitch: 1.2 });
  ctx.effects.ring(ctx.player.pos, 0xffd23a, 1.6);
  tell(t.steps[s.step].ask);
  syncRun(ctx);
}

function complete(ctx: Ctx, t: TaleCard, at?: THREE.Vector3): void {
  const s = ctx.save.tales;
  s.cur = null;
  s.step = 0;
  s.got = 0;
  if (!s.done.includes(t.id)) s.done.push(t.id);
  s.after = ctx.save.day + 1;
  const page = `t:${t.id}`;
  if (!ctx.save.found.includes(page)) ctx.save.found.push(page);
  giveCoins(ctx, t.coins, at ?? ctx.player.pos);
  sfx.play('sticker');
  ctx.effects.ring(ctx.player.pos, 0xffd23a, 2.4);
  ctx.effects.poof(ctx.player.pos.clone().setY(ctx.player.pos.y + 1.2), 0xffd23a, 24);
  for (const h of ctx.heroes.values()) h.model.play('cheer');
  tell(t.thanks, 'tale_page');
  // the tale's rare thing and a friend who joins, when the card has them
  if (t.artifact) giveArtifact(ctx, t.artifact);
  if (t.companion) giveCompanion(ctx, t.companion);
  events.emit('tale:done', { id: t.id });
  syncRun(ctx);
}

/** A thing picked up: a poof; a chest opens and stands a moment before it goes. */
function take(ctx: Ctx, r: Run, th: Thing): void {
  r.things.splice(r.things.indexOf(th), 1);
  setMapMarker(th.key, null);
  if (th.model.open) {
    th.model.open();
    leaving.push({ model: th.model, t: 3 });
  } else ctx.scene.remove(th.model.root);
  ctx.effects.poof(th.pos.clone().setY(th.pos.y + 0.8), 0xffd23a, 16);
  sfx.play('pickup');
}

/** Things within the hero's reach. */
function reach(ctx: Ctx, r: Run): Thing[] {
  const p = ctx.player.pos;
  return r.things.filter((th) => Math.hypot(th.pos.x - p.x, th.pos.z - p.z) < 1.4 && Math.abs(th.pos.y - p.y) < 2.5);
}

/** The step under way; returns how many of the eight studs are lit. */
function updateStep(ctx: Ctx, r: Run, step: TaleStep, dt: number): number {
  const s = ctx.save.tales;
  const p = ctx.player.pos;
  const goal = stepGoal(step);
  const part = (n: number) => Math.min(8, Math.floor((n / goal) * 8 + 1e-6));
  switch (step.kind) {
    case 'gather': {
      for (const th of reach(ctx, r)) {
        take(ctx, r, th);
        s.got++;
        if (s.got >= goal) {
          stepDone(ctx, th.pos);
          return 8;
        }
        idle = 0;
      }
      markThings(ctx, r);
      return part(s.got);
    }
    case 'thief': {
      // the monster beaten, the fish it carried lies where it fell
      if (r.things.length) {
        const th = reach(ctx, r)[0];
        if (th) {
          take(ctx, r, th);
          stepDone(ctx);
          return 8;
        }
        markThings(ctx, r);
        return 4;
      }
      const m = r.thief;
      if (m && (!m.alive || !ctx.monsters.includes(m))) {
        r.thief = null;
        if (m.hp <= 0) {
          const at = m.pos.clone();
          at.y = ctx.world.groundHeight(Math.floor(at.x), Math.floor(at.z));
          addThing(ctx, r, step.item ?? 'fish', at);
          setMapMarker('tale:thief', null);
          idle = 0;
          return 4;
        }
      }
      const spot = r.thiefSpot!;
      if (!r.thief && !ctx.sleeping && Math.hypot(p.x - spot.x, p.z - spot.z) < THIEF_NEAR) {
        r.thief = spawnAt(ctx, 'zombie', spot.x, spot.z);
        holdSnack(r.thief.model, 'fish', ctx.skin);
      }
      setMapMarker('tale:thief', { pos: r.thief ? r.thief.pos : spot, icon: 'mark-monster', pointer: true });
      return 0;
    }
    case 'place': {
      r.checkT -= dt;
      if (r.checkT > 0) return 0;
      r.checkT = 0.5;
      const at = step.at === 'here' ? p : r.target;
      if (ctx.save.placed.some((b) => b.id === step.building && Math.hypot(b.x + 0.5 - at.x, b.z + 0.5 - at.z) < PLACE_AT)) stepDone(ctx);
      // the box keeps calling now and then while nothing is being placed
      else if (idle > 20 && !selectedBuilding()) {
        ctx.hud.suggestKit(true);
        idle = 0;
      }
      return 0;
    }
    case 'visit': {
      const race = step.at === 'home' || step.at === 'here' || step.at === 'lighthouse' ? null : step.at;
      const isVillage = race !== null;
      if (race) setMapMarker('tale:goal', { pos: r.target, icon: RACE_CARDS[race].mark, pointer: true });
      const d = Math.hypot(p.x - r.target.x, p.z - r.target.z);
      if (d < (isVillage ? NEAR.village : step.at === 'lighthouse' ? NEAR.lighthouse : NEAR.home)) {
        stepDone(ctx);
        return 8;
      }
      return Math.max(0, Math.min(7, Math.floor((1 - d / r.d0) * 8)));
    }
    case 'music':
      if (musicNear(p, MUSIC_AT)) {
        s.got += dt;
        if (s.got >= goal) stepDone(ctx);
      }
      return part(s.got);
    case 'defend':
      s.got += runWave(ctx, r.wave, r.target, goal - s.got, WAVE(step.ask), dt);
      if (s.got >= goal) stepDone(ctx);
      return part(s.got);
    case 'light': {
      r.checkT -= dt;
      if (r.checkT <= 0) {
        r.checkT = 3;
        const l = darkLighthouse(ctx);
        setMapMarker('tale:goal', l ? { pos: lighthouseAt(l), icon: 'map-lighthouse', pointer: true } : null);
      }
      return 0;
    }
    case 'sleep':
      // done when the party wakes (sleep:done)
      return 0;
  }
}

// ─── the paper plane ─────────────────────────────────────────────────────────

/** Nothing else is going on: no line playing, the album closed, no boss, no monster near (home is safe anyway). */
function calm(ctx: Ctx): boolean {
  if (ctx.sleeping || ctx.napping || ctx.album.isOpen || voice.quietSeconds() < 1.5) return false;
  const p = ctx.player.pos;
  if (ctx.boss?.alive && ctx.boss.inZone(p.x, p.z)) return false;
  if (homeDistance(ctx, p) < SPAWN.houseSafeRadius + 2) return true;
  return !ctx.monsters.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 14);
}

const STAMP: Record<string, string> = { elves: '#3fa142', gnomes: '#e0583f', robots: '#2f7fd6', aliens: '#9b5fd0' };

/** A friend's letter flies in from the way of their village and lands in front of the hero. */
function launch(ctx: Ctx, t: TaleCard): void {
  const p = ctx.player.pos;
  const v = t.from === 'pupsia' ? null : villageOf(ctx, t.from);
  const a = v ? Math.atan2(v.x - p.x, v.z - p.z) : Math.random() * Math.PI * 2;
  const model = createPlane(ctx.skin, STAMP[t.from] ?? '#e0583f');
  const pos = new THREE.Vector3(p.x + Math.sin(a) * 30, p.y + 14, p.z + Math.cos(a) * 30);
  model.root.position.copy(pos);
  ctx.scene.add(model.root);
  plane = { model, tale: t, pos, landed: false, wait: LETTER_WAIT };
  sfx.play('pickup', { pitch: 1.5 });
}

function updatePlane(ctx: Ctx, dt: number): void {
  const pl = plane!;
  const p = ctx.player.pos;
  const night = 1 - ctx.clock.daylight;
  if (!pl.landed) {
    // aims a little ahead of the hero, wherever the hero has got to
    const to = tmp.set(p.x + Math.sin(ctx.player.yaw) * 2.2, 0, p.z + Math.cos(ctx.player.yaw) * 2.2);
    to.y = ctx.world.groundHeight(Math.floor(to.x), Math.floor(to.z));
    const d = pl.pos.distanceTo(to);
    const step = Math.min(d, Math.max(8, d * 0.9) * dt);
    if (d > 0.01) {
      const dir = to.clone().sub(pl.pos).normalize();
      pl.pos.addScaledVector(dir, step);
      pl.model.root.rotation.y = Math.atan2(dir.x, dir.z);
    }
    if (d < 0.25) {
      pl.landed = true;
      ctx.effects.poof(pl.pos.clone().setY(pl.pos.y + 0.3), 0xfff4d8, 10);
      sfx.play('click');
    }
  } else pl.wait -= dt;
  pl.model.root.position.copy(pl.pos);
  pl.model.update(dt, !pl.landed, night);
  if (pl.landed && (pl.wait <= 0 || Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 1.5)) {
    ctx.scene.remove(pl.model.root);
    ctx.effects.poof(pl.pos.clone().setY(pl.pos.y + 0.5), 0xffd23a, 18);
    sfx.play('sticker', { pitch: 1.3 });
    plane = null;
    begin(ctx, pl.tale, 'letter');
  }
}

// ─── the loop ────────────────────────────────────────────────────────────────

/** After a while with no progress the step's ask (for Пупся's thoughts, systems/narration.ts); null otherwise. */
export function taleReminder(ctx: Ctx): LineId | null {
  const step = stepOf(ctx);
  if (!step || idle < REMIND_AFTER || queue.length) return null;
  idle = 0;
  return step.ask;
}

export function initTales(ctx: Ctx): void {
  const s = ctx.save.tales;
  const forced = ctx.params.tale && taleById(ctx.params.tale);
  ctx.hud.onTaleTap = () => {
    const step = stepOf(ctx);
    if (!step) return;
    voice.say(step.ask, { priority: 7, interrupt: true });
    idle = 0;
  };
  events.on('sleep:done', () => {
    if (stepOf(ctx)?.kind === 'sleep') stepDone(ctx);
    // Пупся's dream comes as the party wakes
    const t = nextTale(s, has(ctx), ctx.save.day, true);
    if (t && entryOf(t) === 'dream') setTimeout(() => !s.cur && begin(ctx, t, 'dream'), 1500);
  });
  events.on('building:placed', ({ id }) => {
    const step = stepOf(ctx);
    if (step?.kind === 'place' && step.building === id) stepDone(ctx);
  });
  events.on('lighthouse:lit', () => {
    if (stepOf(ctx)?.kind === 'light') stepDone(ctx);
  });
  events.on('time:phase', ({ phase }) => {
    // the next tale is a dream: Пупся asks to go to bed
    const t = phase === 'evening' ? nextTale(s, has(ctx), ctx.save.day + 1, true) : null;
    if (t && entryOf(t) === 'dream') setTimeout(() => tell('tale_sleepy'), 6000);
  });
  // ?tale=<id> (test only): that tale begins at once
  if (forced) begin(ctx, forced, entryOf(forced));
  // For automated checks.
  (window as unknown as { __kotoTales: object }).__kotoTales = {
    get state() {
      return { ...s, done: [...s.done], run: run?.key ?? null, idle: Math.round(idle), lit: lastLit, plane: plane ? { landed: plane.landed, pos: plane.pos.toArray() } : null, queue: [...queue] };
    },
    /** Begins a tale at once (as a letter for a friend's, as a dream for Пупся's). */
    start: (id: string) => {
      const t = taleById(id);
      if (t) begin(ctx, t, entryOf(t));
    },
    /** Finishes the step under way. */
    finishStep: () => stepDone(ctx),
    /** The thief beaten at once. */
    beatThief: () => {
      if (!run?.thief) return;
      run.thief.hp = 0;
      run.thief.alive = false;
    },
    things: () => run?.things.map((th) => th.pos.toArray()) ?? [],
    /** Puts the party next to a thing to gather (or the thief, or the step's place; no fade). */
    go: (i = 0) => {
      const at = run?.things[i]?.pos ?? run?.thief?.pos ?? run?.target;
      if (!at) return;
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(at.x + (h === ctx.player ? 0.3 : 1.2), at.y + 0.2, at.z + 0.3);
        h.body.vel.set(0, 0, 0);
      }
    },
    thief: () => run?.thief?.pos.toArray() ?? run?.thiefSpot?.toArray() ?? null,
    /** Sends the next letter now (if the next tale is a letter). */
    letter: () => {
      const t = TALES.find((x) => !s.done.includes(x.id) && entryOf(x) === 'letter' && x.id !== s.cur);
      if (t && !plane) launch(ctx, t);
    },
  };
}

export function updateTales(ctx: Ctx, dt: number): void {
  for (let i = leaving.length - 1; i >= 0; i--) {
    const l = leaving[i];
    l.t -= dt;
    l.model.update(dt, 0);
    if (l.t <= 0) {
      ctx.scene.remove(l.model.root);
      leaving.splice(i, 1);
    }
  }
  const night = 1 - ctx.clock.daylight;
  if (run) for (const th of run.things) th.model.update(dt, night);
  if (!ctx.playing) return;
  pumpLines(dt);
  if (plane) updatePlane(ctx, dt);
  syncRun(ctx);

  const s = ctx.save.tales;
  const t = tale(ctx);
  const step = stepOf(ctx);
  if (!t || !step || !run) {
    ctx.hud.setTale(null);
    // the next tale: the prologue as the heroes wake, a friend's letter when all is calm
    checkT -= dt;
    if (plane || ctx.sleeping || checkT > 0) return;
    checkT = 1;
    const next = nextTale(s, has(ctx), ctx.save.day, false);
    if (!next) return;
    const how = entryOf(next);
    // the prologue's things are out at once; its lines wait their turn after the first tips
    if (how === 'wake' && ctx.clock.elapsed > PROLOGUE_AT) begin(ctx, next, 'wake');
    else if (how === 'letter' && calm(ctx)) launch(ctx, next);
    return;
  }

  idle += dt;
  const lit = ctx.sleeping ? lastLit : updateStep(ctx, run, step, dt);
  if (lit !== lastLit) {
    if (lit > lastLit) idle = 0;
    lastLit = lit;
  }
  // after a dream, its picture over Пупся's head for a moment
  if (dreamT > 0) {
    dreamT -= dt;
    const cat = ctx.heroes.get('pupsia');
    if (cat) offerBubble({ at: cat.pos.clone().setY(cat.pos.y + cat.model.height + 0.9), picture: step.picture, lit: 0, d: 0 });
  }
  const cur = stepOf(ctx);
  const from = tale(ctx)?.from;
  ctx.hud.setTale(ctx.sleeping || !cur || !from ? null : { face: from === 'pupsia' ? 'mark-pupsia' : RACE_CARDS[from].mark, picture: cur.picture, lit: Math.max(0, lit) });
}
