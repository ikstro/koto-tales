import * as THREE from 'three';
import { yawOf, type Hero } from '../actors/entities';
import { buildCookPot, buildSpoon } from '../assets/dishes';
import { TABLE_H } from '../assets/home';
import { buildItem } from '../assets/items';
import { Kit } from '../assets/parts/kit';
import type { HeroId, ItemId } from '../contracts';
import { BABUSIA_SPOTS, hostLine } from '../content/babusia';
import { ITEMS } from '../content/items';
import type { LineId } from '../content/lines';
import { canCook, COOK, missing, pantryOf, recipesOf, stirActOf, type RecipeCard } from '../content/recipes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { CookBar, CookBook } from '../ui/cooking';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { giveItem, herTable, insideHouse, joke, setHerCooking } from './babusia';
import { eating, sitDown, sitOn } from './food';
import { selectedBuilding } from './kit';

/**
 * The kitchen at the grandmothers' (DESIGN.md «Kitchen»). At the stove a pot piece breathes; a tap
 * opens the book of recipes. A bright recipe: everyone gathers at the table, the products go into
 * the pot, six taps on the spoon are six acts of the party, it boils for a moment, a bell, and they
 * all taste it. Three portions go into the box. A step away cancels and gives the products back.
 */

type Stage = 'add' | 'stir' | 'wait' | 'meal';

interface Cooking {
  r: RecipeCard;
  stage: Stage;
  /** Products in, taps on the spoon. */
  step: number;
  t: number;
  talked: boolean;
  /** The cat is reaching for a bite: seconds left. */
  steal: number;
  steam: number;
}

/** Around the table, away from its chairs (from the table's centre); Пупся takes her own chair. */
const STANDS: Partial<Record<HeroId, [number, number]>> = { lyosha: [-1.3, 0], solomiia: [0.15, 1], david: [0.8, 1] };
const STEP_AWAY = 0.5;
const POT_LIFT = 0.04;
/** Big enough to read as a pot from the camera, over the plate of pies. */
const POT_SIZE = 1.4;
const SPOON_SIZE = 1.7;
/** Just over the soup. */
const POT_TOP = 0.7;
const SPOON_SWING = 1.5;
const STEAL_SECONDS = 1.1;
const TALK_AFTER = 1;
const STEAM_EVERY = 0.35;
const STOVE_TAP = 0.9;
const STAR = 0xee6a82;
const CHIP = 0xf08a24;
const STEAM = 0xffffff;
const PANTRY_SAY = 3;

const ACT_LINE: Record<ReturnType<typeof stirActOf>, LineId> = {
  lyosha: 'cook_act_lyosha',
  solomiia: 'cook_act_solomiia',
  david: 'cook_act_david',
  pupsia: 'cook_act_pupsia',
};

let cook: Cooking | null = null;
let book: CookBook;
let bar: CookBar;
let pot: THREE.Group | null = null;
let spoon: THREE.Group | null = null;
let dish: THREE.Object3D | null = null;
const potAt = new THREE.Vector3();
const stoveAt = new THREE.Vector3();
const puffAt = new THREE.Vector3();

const say = (ctx: Ctx, id: string, interrupt = true) => voice.say(hostLine(id as LineId, ctx.save.babusia.host), { priority: 7, interrupt });

/** Whether the party is cooking (the scene holds them; her day waits). */
export const cooking = () => !!cook;

/** The pot piece breathes: at the stove in her house, the hostess at home. */
function potNear(ctx: Ctx): boolean {
  const b = ctx.save.babusia;
  if (!b.at || b.moving || !b.met || cook || ctx.sleeping || ctx.napping || ctx.map.isOpen || eating() || selectedBuilding()) return false;
  const p = ctx.player.pos;
  if (!insideHouse(ctx, p)) return false;
  return Math.hypot(p.x - b.at[0] - BABUSIA_SPOTS.stove.dx, p.z - b.at[2] - BABUSIA_SPOTS.stove.dz) < COOK.near;
}

function potModel(ctx: Ctx): THREE.Group {
  if (pot) return pot;
  pot = new THREE.Group();
  pot.name = 'cook-pot';
  const body = new Kit('cook-pot', ctx.skin).part('cook-pot', pot);
  buildCookPot(body);
  body.done();
  spoon = new THREE.Group();
  spoon.name = 'cook-spoon';
  const held = new THREE.Group();
  held.position.set(0.1, 0.24, 0);
  held.rotation.z = -0.5;
  held.scale.setScalar(SPOON_SIZE);
  const hand = new Kit('cook-spoon', ctx.skin).part('cook-spoon', held);
  buildSpoon(hand);
  hand.done();
  spoon.add(held);
  pot.add(spoon);
  pot.scale.setScalar(POT_SIZE);
  pot.visible = false;
  ctx.scene.add(pot);
  return pot;
}

/** Everyone to the table, looking at the pot. */
function gather(ctx: Ctx, h: Hero): void {
  const stand = STANDS[h.id];
  if (!stand) {
    sitOn(h, herTable().seats.at(-1)!);
    h.model.play('sit');
    return;
  }
  h.body.pos.set(potAt.x + stand[0], ctx.save.babusia.at![1] + 1, potAt.z + stand[1]);
  h.body.vel.set(0, 0, 0);
  h.yaw = yawOf(-stand[0], -stand[1]);
  h.model.root.position.copy(h.body.pos);
  h.model.root.rotation.y = h.yaw;
  h.model.play('idle');
}

function begin(ctx: Ctx, r: RecipeCard): void {
  const at = ctx.save.babusia.at!;
  potAt.set(at[0] + BABUSIA_SPOTS.table.dx, at[1] + 1 + TABLE_H + POT_LIFT, at[2] + BABUSIA_SPOTS.table.dz);
  const m = potModel(ctx);
  m.position.copy(potAt);
  m.visible = true;
  ctx.napping = true;
  setHerCooking(true);
  for (const h of ctx.heroes.values()) gather(ctx, h);
  cook = { r, stage: 'add', step: 0, t: 0, talked: false, steal: 0, steam: 0 };
  ctx.effects.ring(puffAt.copy(potAt), 0xffe3a3, 1.6);
  sfx.play('switch', { pitch: 1.2 });
  say(ctx, 'babusia_cook_start');
  showBar(ctx, cook);
}

function showBar(ctx: Ctx, c: Cooking): void {
  if (c.stage === 'add') bar.show(ctx.portraits.items[c.r.needs[c.step]], c.step * 4, true);
  else if (c.stage === 'stir') bar.show(null, Math.round((c.step / COOK.stirs) * 8), true);
  else if (c.stage === 'wait') bar.show(null, Math.floor((c.t / COOK.wait) * 8), false);
  else bar.hide();
}

/** A step away: nothing is lost, the products are used up only when the dish is ready. */
function cancel(ctx: Ctx): void {
  cook = null;
  if (pot) pot.visible = false;
  bar.hide();
  ctx.napping = false;
  setHerCooking(false);
  for (const h of ctx.heroes.values()) h.model.play('idle');
  say(ctx, 'babusia_cook_cancel');
}

/** One tap on the spoon: someone's act, each said aloud the first time round. */
function act(ctx: Ctx, c: Cooking): void {
  const who = stirActOf(c.step);
  const h = ctx.heroes.get(who);
  puffAt.copy(potAt).setY(potAt.y + POT_TOP);
  switch (who) {
    case 'lyosha':
      h?.model.play('stir');
      sfx.play('step', { pitch: 1.5 });
      break;
    case 'solomiia':
      h?.model.play('cast');
      ctx.effects.sparkle(puffAt, STAR);
      sfx.play('sticker', { pitch: 1.6, volume: 0.6 });
      break;
    case 'david':
      h?.model.play('attack');
      ctx.effects.poof(puffAt, CHIP, 8);
      sfx.play('hit', { pitch: 1.5, volume: 0.7 });
      break;
    case 'pupsia':
      h?.model.play('eat');
      c.steal = STEAL_SECONDS;
      sfx.play('click', { pitch: 1.8 });
      break;
  }
  if (c.step < 4) voice.say(ACT_LINE[who], { priority: 6, interrupt: true });
}

function toMeal(ctx: Ctx, c: Cooking): void {
  for (const id of c.r.needs) ctx.save.inv[id] = (ctx.save.inv[id] ?? 0) - 1;
  c.stage = 'meal';
  showBar(ctx, c);
  if (pot) pot.visible = false;
  sfx.play('clink', { pitch: 1 });
  sfx.play('sticker', { pitch: 1.3 });
  dish = buildItem(c.r.dish as ItemId, ctx.skin);
  dish.scale.setScalar(1.5);
  dish.position.copy(potAt);
  ctx.scene.add(dish);
  const table = herTable();
  sitDown(ctx, {
    ...table,
    snack: c.r.snack,
    fast: undefined,
    onSit: () => say(ctx, 'babusia_cook_done'),
    onDone: () => served(ctx, c),
  });
}

/** Off the table and into the box; the first time a new page in the book of recipes. */
function served(ctx: Ctx, c: Cooking): void {
  dish?.removeFromParent();
  dish = null;
  cook = null;
  setHerCooking(false);
  giveItem(ctx, c.r.dish as ItemId, COOK.portions);
  sfx.play('sticker', { pitch: 1.15 });
  ctx.effects.ring(puffAt.copy(ctx.player.pos).setY(ctx.player.pos.y + 0.1), 0xffd23a, 2);
  const save = ctx.save;
  const first = !save.recipes.includes(c.r.id);
  if (first) {
    save.recipes.push(c.r.id);
    save.found.push(`r:${c.r.id}`);
  }
  voice.say(first ? 'cook_page' : 'cook_portions', { priority: 7 });
  events.emit('cook:done', { recipe: c.r.id, first });
}

function run(ctx: Ctx, c: Cooking, dt: number): void {
  if (c.stage === 'meal') return;
  const i = ctx.input;
  if (Math.hypot(i.moveX, i.moveY) > STEP_AWAY || selectedBuilding() || ctx.save.babusia.moving) return cancel(ctx);
  if (spoon) spoon.rotation.y += dt * (c.stage === 'stir' ? 0.6 : 0.2);
  if (c.steal > 0) {
    c.steal -= dt;
    if (c.steal <= 0) ctx.heroes.get('pupsia')?.model.play('sit');
  }
  const tapped = i.take('cook:tap');
  if (c.stage === 'add' && tapped) {
    puffAt.copy(potAt).setY(potAt.y + POT_TOP);
    ctx.effects.poof(puffAt, ITEMS[c.r.needs[c.step]].color, 10);
    sfx.play('poof', { pitch: 1.5 });
    c.step++;
    if (c.step === c.r.needs.length) {
      c.stage = 'stir';
      c.step = 0;
      say(ctx, 'babusia_cook_stir');
    }
    showBar(ctx, c);
  } else if (c.stage === 'stir' && tapped) {
    if (spoon) spoon.rotation.y += SPOON_SWING;
    act(ctx, c);
    c.step++;
    if (c.step === COOK.stirs) {
      c.stage = 'wait';
      c.t = 0;
      say(ctx, 'babusia_cook_wait');
    }
    showBar(ctx, c);
  } else if (c.stage === 'wait') {
    c.t += dt;
    c.steam -= dt;
    if (c.steam <= 0) {
      c.steam = STEAM_EVERY;
      ctx.effects.poof(puffAt.copy(potAt).setY(potAt.y + POT_TOP), STEAM, 3);
    }
    if (!c.talked && c.t > TALK_AFTER && voice.quietSeconds() > 0.2) {
      c.talked = true;
      joke(ctx);
    }
    showBar(ctx, c);
    if (c.t >= COOK.wait) toMeal(ctx, c);
  }
}

function openBook(ctx: Ctx): void {
  ctx.napping = true;
  book.onClose = () => {
    ctx.napping = false;
  };
  book.open(recipesOf(ctx.save.babusia.host), ctx.save.inv, (r) => {
    const short = missing(r, ctx.save.inv);
    if (short.length) {
      sfx.play('click');
      say(ctx, `babusia_cook_need_${short[0]}`);
      return;
    }
    book.hide();
    begin(ctx, r);
  });
}

export function updateCooking(ctx: Ctx, dt: number): void {
  if (!ctx.playing) return;
  if (cook) {
    ctx.hud.setPot(false);
    run(ctx, cook, dt);
    return;
  }
  const b = ctx.save.babusia;
  const near = potNear(ctx);
  ctx.hud.setPot(near);
  const asked = ctx.input.take('prompt:pot');
  if (!near || book.isOpen) return;
  stoveAt.set(b.at![0] + BABUSIA_SPOTS.stove.dx, b.at![1] + 2, b.at![2] + BABUSIA_SPOTS.stove.dz - 0.9);
  if (asked || tappedAt(ctx, stoveAt, STOVE_TAP)) openBook(ctx);
}

/** The hostess's product of the day, once a morning, after her hello. */
export function pantryGift(ctx: Ctx): void {
  const b = ctx.save.babusia;
  if (b.pantryDay === ctx.save.day) return;
  b.pantryDay = ctx.save.day;
  const item = pantryOf(b.host, ctx.save.day);
  giveItem(ctx, item, 1);
  setTimeout(() => {
    sfx.play('sticker', { pitch: 1.3 });
    say(ctx, 'babusia_pantry', false);
  }, PANTRY_SAY * 1000);
}

/** The first dinner must not wait for a search: the products of her first recipe, if nothing can be cooked yet. */
export function starterProducts(ctx: Ctx): void {
  const list = recipesOf(ctx.save.babusia.host);
  if (list.some((r) => canCook(r, ctx.save.inv))) return;
  for (const id of list[0].needs) giveItem(ctx, id, 1);
}

export function initCooking(ctx: Ctx, ui: HTMLElement): void {
  book = new CookBook(ui, ctx.portraits);
  bar = new CookBar(ui);
  bar.onTap = () => ctx.input.press('cook:tap');
  // For automated checks.
  (window as unknown as { __kotoCooking: object }).__kotoCooking = {
    get state() {
      return cook ? { recipe: cook.r.id, stage: cook.stage, step: cook.step, t: +cook.t.toFixed(1) } : null;
    },
    get near() {
      return potNear(ctx);
    },
    get bookOpen() {
      return book.isOpen;
    },
    open: () => ctx.input.press('prompt:pot'),
    pick: (id: string) => {
      const r = recipesOf(ctx.save.babusia.host).find((x) => x.id === id);
      if (!r) return false;
      book.hide();
      ctx.napping = false;
      if (!canCook(r, ctx.save.inv)) return false;
      begin(ctx, r);
      return true;
    },
    tap: () => ctx.input.press('cook:tap'),
    /** It has boiled long enough. */
    hurry: () => {
      if (cook) cook.t = COOK.wait;
    },
    /** The party stands at the stove. */
    stove: () => {
      const b = ctx.save.babusia;
      if (!b.at) return;
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(b.at[0] + BABUSIA_SPOTS.stove.dx, b.at[1] + 1.05, b.at[2] + BABUSIA_SPOTS.stove.dz + 0.4);
        h.body.vel.set(0, 0, 0);
      }
    },
  };
}
