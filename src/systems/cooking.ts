import * as THREE from 'three';
import { yawOf, type Hero } from '../actors/entities';
import { buildCookPot, buildSpoon, stewOf } from '../assets/dishes';
import { TABLE_H } from '../assets/home';
import { buildItem } from '../assets/items';
import { Kit } from '../assets/parts/kit';
import type { HeroId, ItemId } from '../contracts';
import { BABUSIA_SPOTS, hostLine } from '../content/babusia';
import { ITEMS } from '../content/items';
import type { LineId } from '../content/lines';
import {
  bookOf,
  COOK,
  emptyLine,
  factKey,
  factLine,
  hintFor,
  hintLine,
  matchRecipe,
  missing,
  missLine,
  mixKey,
  nameLine,
  pantryOf,
  PRODUCTS,
  recipesOf,
  RECIPES,
  stirActOf,
  surpriseOf,
  type RecipeCard,
} from '../content/recipes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { CookBar, CookBook, PantryPlate, type Product } from '../ui/cooking';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { giveItem, herTable, insideHouse, joke, setHerCooking } from './babusia';
import { eating, sitDown, sitOn } from './food';
import { selectedBuilding } from './kit';

/**
 * The kitchen at the grandmothers' (DESIGN.md «Kitchen»). At the stove a pot piece breathes; a tap
 * opens the pantry: the children drop 1–3 of the products they carry into the pot (the hostess names
 * each, and the first time tells a simple fact about it), the book of recipes is there as a hint.
 * The spoon: everyone gathers at the table, six taps on the spoon are six acts of the party, it boils
 * for a moment, a bell, and they all taste it. A recipe's products make its dish; anything else is an
 * own dish («власна страва»), and Пупся hints at the nearest recipe. Three portions go into the box.
 * A step away cancels; the products are used up only when the dish is ready.
 */

type Stage = 'stir' | 'wait' | 'meal';

interface Cooking {
  products: ItemId[];
  /** The recipe they make, or none: an own dish. */
  r: RecipeCard | null;
  dish: ItemId;
  stage: Stage;
  /** Taps on the spoon. */
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
/** The products a book card puts in, one after another (ms). */
const BOOK_DROP = 160;
/** Пупся's hint after an own dish waits for the line before it, but not for ever (s). */
const HINT_WAIT = 12;

const ACT_LINE: Record<ReturnType<typeof stirActOf>, LineId> = {
  lyosha: 'cook_act_lyosha',
  solomiia: 'cook_act_solomiia',
  david: 'cook_act_david',
  pupsia: 'cook_act_pupsia',
};

let cook: Cooking | null = null;
let book: CookBook;
let pantry: PantryPlate;
let bar: CookBar;
let pot: THREE.Group | null = null;
let spoon: THREE.Group | null = null;
let dish: THREE.Object3D | null = null;
/** What is in the pantry's pot while the plate or the book is open. */
let mix: ItemId[] = [];
let hint: { line: LineId; t: number } | null = null;
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

/** The own dish on the table: the stew in the colours of what went in. */
function stewModel(ctx: Ctx, products: readonly ItemId[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'own-dish';
  const p = new Kit(`stew:${mixKey(products)}`, ctx.skin).part('stew', g);
  stewOf(products.map((id) => ITEMS[id].color))(p);
  p.done();
  return g;
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

/** The spoon in the pantry: to the table, the products go into the pot, and the stirring begins. */
function begin(ctx: Ctx, products: ItemId[]): void {
  const at = ctx.save.babusia.at!;
  potAt.set(at[0] + BABUSIA_SPOTS.table.dx, at[1] + 1 + TABLE_H + POT_LIFT, at[2] + BABUSIA_SPOTS.table.dz);
  const m = potModel(ctx);
  m.position.copy(potAt);
  m.visible = true;
  ctx.napping = true;
  setHerCooking(true);
  for (const h of ctx.heroes.values()) gather(ctx, h);
  const r = matchRecipe(products);
  cook = { products, r, dish: r ? (r.dish as ItemId) : surpriseOf(products), stage: 'stir', step: 0, t: 0, talked: false, steal: 0, steam: 0 };
  mix = [];
  ctx.effects.ring(puffAt.copy(potAt), 0xffe3a3, 1.6);
  puffAt.copy(potAt).setY(potAt.y + POT_TOP);
  for (const id of products) ctx.effects.poof(puffAt, ITEMS[id].color, 8);
  sfx.play('plop');
  say(ctx, 'babusia_cook_stir');
  showBar(cook);
}

function showBar(c: Cooking): void {
  if (c.stage === 'stir') bar.show(Math.round((c.step / COOK.stirs) * 8), true);
  else if (c.stage === 'wait') bar.show(Math.floor((c.t / COOK.wait) * 8), false);
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
  for (const id of c.products) ctx.save.inv[id] = Math.max(0, (ctx.save.inv[id] ?? 0) - 1);
  c.stage = 'meal';
  showBar(c);
  if (pot) pot.visible = false;
  sfx.play('clink', { pitch: 1 });
  sfx.play('sticker', { pitch: 1.3 });
  dish = c.r ? buildItem(c.dish, ctx.skin) : stewModel(ctx, c.products);
  dish.scale.setScalar(1.5);
  dish.position.copy(potAt);
  ctx.scene.add(dish);
  const table = herTable();
  sitDown(ctx, {
    ...table,
    snack: c.r?.snack ?? 'cocoa',
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
  giveItem(ctx, c.dish, COOK.portions);
  sfx.play('sticker', { pitch: 1.15 });
  ctx.effects.ring(puffAt.copy(ctx.player.pos).setY(ctx.player.pos.y + 0.1), 0xffd23a, 2);
  const save = ctx.save;
  let first: boolean;
  if (c.r) {
    first = !save.recipes.includes(c.r.id);
    if (first) {
      save.recipes.push(c.r.id);
      save.found.push(`r:${c.r.id}`);
    }
    voice.say(first ? 'cook_page' : 'cook_portions', { priority: 7 });
  } else {
    const k = save.kitchen;
    first = k.own.length === 0;
    const key = mixKey(c.products);
    if (!k.own.includes(key)) k.own.push(key);
    if (first) save.found.push('r:own');
    voice.say(first ? 'cook_own_page' : 'cook_portions', { priority: 7 });
    hint = { line: hintLine(hintFor(c.products)), t: 0 };
  }
  events.emit('cook:done', { recipe: c.r?.id ?? 'own', first });
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
  if (c.stage === 'stir' && tapped) {
    if (spoon) spoon.rotation.y += SPOON_SWING;
    act(ctx, c);
    c.step++;
    if (c.step === COOK.stirs) {
      c.stage = 'wait';
      c.t = 0;
      say(ctx, 'babusia_cook_wait');
    }
    showBar(c);
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
    showBar(c);
    if (c.t >= COOK.wait) toMeal(ctx, c);
  }
}

/** The products the party carries, in the order of PRODUCTS. */
function carried(ctx: Ctx): Product[] {
  return PRODUCTS.filter((id) => (ctx.save.inv[id] ?? 0) > 0).map((id) => ({ id, img: ctx.portraits.items[id], have: ctx.save.inv[id] ?? 0 }));
}

function openPantry(ctx: Ctx, greet: boolean): void {
  ctx.napping = true;
  const list = carried(ctx);
  pantry.open(list, mix, ctx.portraits.items);
  if (!greet) return;
  if (list.length) say(ctx, 'babusia_cook_start');
  else voice.say(emptyLine(ctx.save.babusia.host), { priority: 7, interrupt: true });
}

/** A product went in: the hostess names it, or the first time she sees it, tells a simple fact. */
function named(ctx: Ctx, id: ItemId): void {
  const host = ctx.save.babusia.host;
  const k = ctx.save.kitchen;
  const key = factKey(host, id);
  const fact = !k.facts.includes(key);
  if (fact) k.facts.push(key);
  voice.say(fact ? factLine(host, id) : nameLine(host, id), { priority: 7, interrupt: true });
}

/** The book, as a hint: a bright card puts its products into the pot, a pale one makes Пупся say what is short. */
function openBook(ctx: Ctx): void {
  mix = [...pantry.mix];
  pantry.hide();
  book.onClose = () => openPantry(ctx, false);
  book.open(bookOf(ctx.save.babusia.host), ctx.save.inv, (r) => pick(ctx, r));
}

function pick(ctx: Ctx, r: RecipeCard): void {
  const short = missing(r, ctx.save.inv);
  if (short.length) {
    sfx.play('click');
    voice.say(missLine(short[0]), { priority: 7, interrupt: true });
    return;
  }
  book.hide();
  mix = [];
  openPantry(ctx, false);
  voice.say(r.line, { priority: 7, interrupt: true });
  r.needs.forEach((id, n) => setTimeout(() => pantry.isOpen && pantry.put(id, true), 250 + n * BOOK_DROP));
}

/** Пупся's hint after an own dish, once the line before it has ended. */
function sayHint(dt: number): void {
  if (!hint) return;
  hint.t += dt;
  if (hint.t > HINT_WAIT) hint = null;
  else if (voice.quietSeconds() > 0.4) {
    voice.say(hint.line, { priority: 6 });
    hint = null;
  }
}

export function updateCooking(ctx: Ctx, dt: number): void {
  if (!ctx.playing) return;
  sayHint(dt);
  if (cook) {
    ctx.hud.setPot(false);
    run(ctx, cook, dt);
    return;
  }
  const b = ctx.save.babusia;
  const near = potNear(ctx);
  ctx.hud.setPot(near);
  const asked = ctx.input.take('prompt:pot');
  if (!near || book.isOpen || pantry.isOpen) return;
  stoveAt.set(b.at![0] + BABUSIA_SPOTS.stove.dx, b.at![1] + 2, b.at![2] + BABUSIA_SPOTS.stove.dz - 0.9);
  if (asked || tappedAt(ctx, stoveAt, STOVE_TAP)) {
    mix = [];
    openPantry(ctx, true);
  }
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

/** The first dinner must not wait for a search: with nothing at all to cook with, the products of her first recipe. */
export function starterProducts(ctx: Ctx): void {
  if (PRODUCTS.some((id) => (ctx.save.inv[id] ?? 0) > 0)) return;
  for (const id of recipesOf(ctx.save.babusia.host)[0].needs) giveItem(ctx, id, 1);
}

export function initCooking(ctx: Ctx, ui: HTMLElement): void {
  book = new CookBook(ui, ctx.portraits);
  pantry = new PantryPlate(ui);
  bar = new CookBar(ui);
  bar.onTap = () => ctx.input.press('cook:tap');
  pantry.onClose = () => {
    mix = [];
    ctx.napping = false;
  };
  pantry.onDrop = (id) => named(ctx, id);
  pantry.onBook = () => openBook(ctx);
  pantry.onStir = (m) => {
    pantry.hide();
    begin(ctx, m);
  };
  // For automated checks.
  (window as unknown as { __kotoCooking: object }).__kotoCooking = {
    get state() {
      return cook ? { recipe: cook.r?.id ?? null, dish: cook.dish, products: cook.products, stage: cook.stage, step: cook.step, t: +cook.t.toFixed(1) } : null;
    },
    get near() {
      return potNear(ctx);
    },
    get bookOpen() {
      return book.isOpen;
    },
    get pantryOpen() {
      return pantry.isOpen;
    },
    get mix() {
      return [...pantry.mix];
    },
    get kitchen() {
      const s = ctx.save;
      return { inv: { ...s.inv }, recipes: [...s.recipes], facts: [...s.kitchen.facts], own: [...s.kitchen.own], pages: s.found.filter((f) => f.startsWith('r:')) };
    },
    open: () => ctx.input.press('prompt:pot'),
    /** A tap on a product tile in the pantry. */
    drop: (id: ItemId) => {
      if (!pantry.isOpen) return false;
      const ok = pantry.put(id, true);
      if (ok) named(ctx, id);
      return ok;
    },
    book: () => pantry.isOpen && openBook(ctx),
    /** A tap on a card in the book. */
    card: (id: string) => {
      const r = (RECIPES as Record<string, RecipeCard>)[id];
      if (!r || !book.isOpen) return false;
      pick(ctx, r);
      return true;
    },
    /** A tap on the spoon in the pantry. */
    stir: () => {
      if (!pantry.isOpen || pantry.mix.length < COOK.least) return false;
      const m = [...pantry.mix];
      pantry.hide();
      begin(ctx, m);
      return true;
    },
    /** Straight to the table with these products (the old book pick, for older checks). */
    pick: (id: string) => {
      const r = (RECIPES as Record<string, RecipeCard>)[id];
      if (!r || missing(r, ctx.save.inv).length) return false;
      book.hide();
      pantry.hide();
      begin(ctx, [...r.needs]);
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
