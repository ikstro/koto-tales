import * as THREE from 'three';
import { yawOf, type Hero } from '../actors/entities';
import { holdSnack, type SnackKind } from '../assets/food';
import { HERO_STATS } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { selectedBuilding, standingWhere, working, type Standing } from './kit';

/**
 * Food (DESIGN.md «Food»). Next to a picnic, while someone's hearts are not full, an apple
 * piece breathes by the bow; next to a working ice-cream kiosk, a cone. A tap: the party sits
 * down at the building's seats and eats for a moment (Пупся gets a fish), then every heart is
 * full and Пупся says «Смачно!». Ice cream also makes the party run fast for a while, with
 * sparkles at their feet. The kitchen at home is one more such place (warm pies, then fast
 * running like the ice cream): see `addFoodPlace`.
 */

const EAT_SECONDS = 3;
/** How close to the building's centre the piece shows (blocks). */
const NEAR = 3.6;
/** Running speed while the ice cream lasts. */
export const FAST = 1.5;

/**
 * Somewhere the party can sit down and eat: a picnic or a kiosk from the kit, or the kitchen
 * table at home (systems/house.ts registers it with `addFoodPlace`).
 */
export interface FoodPlace {
  /** Feet-level centre: the piece shows within NEAR of it. */
  centre: THREE.Vector3;
  seats: THREE.Object3D[];
  /** Seconds of fast running after the meal (the ice cream, the home kitchen). */
  fast?: number;
  /** What the children eat (Пупся always gets a fish). */
  snack: SnackKind;
  /** Only when someone is hurt, even with fast running to give (the home kitchen: it would breathe all the time). */
  hungryOnly?: boolean;
  /** Which piece breathes: the apple or the cone. */
  piece: 'food' | 'icecream';
  /** Open for a meal now (a kiosk needs power; a place may also want the hero on its side of a wall). */
  open(p: THREE.Vector3): boolean;
  /** Seconds into the meal, undefined when nobody eats (the model animates from it). */
  setEat(t: number | undefined): void;
  /** Gone in the middle of the meal (folded away): the meal ends. */
  gone(): boolean;
}

let meal: { s: FoodPlace; t: number; snacks: THREE.Object3D[]; bite: number } | null = null;
let sparkT = 0;
const at = new THREE.Vector3();
const fwd = new THREE.Vector3();
const extra: FoodPlace[] = [];

/** One more place to eat that is not a kit building (the kitchen at home). */
export function addFoodPlace(place: FoodPlace): void {
  extra.push(place);
}

/** Whether the party is sitting at a meal (the scene holds them; nothing bites). */
export const eating = () => !!meal;

/** Whether the party is eating at this place right now. */
export const eatingAt = (place: FoodPlace) => meal?.s === place;

const hungry = (ctx: Ctx) => [...ctx.heroes.values()].some((h) => h.hearts < HERO_STATS.maxHearts);

/** A kit building with `food` as a place to eat. */
function fromKit(s: Standing): FoodPlace | null {
  if (!s.model?.seats?.length) return null;
  const fast = s.card.food!.fast;
  return {
    centre: s.centre,
    seats: s.model.seats,
    fast,
    snack: fast ? 'icecream' : 'apple',
    piece: fast ? 'icecream' : 'food',
    open: () => working(s),
    setEat: (t) => (s.extra.eat = t),
    gone: () => s.folding,
  };
}
const kitPlaces = new WeakMap<Standing, FoodPlace | null>();

/** The place the piece is for, if any: food when someone is hurt, a kiosk with fast running while it is not on. */
function foodNear(ctx: Ctx): FoodPlace | null {
  const p = ctx.player.pos;
  let best: FoodPlace | null = null;
  let bd = NEAR;
  const places: (FoodPlace | null)[] = standingWhere((c) => !!c.food).map((s) => {
    if (!kitPlaces.has(s)) kitPlaces.set(s, fromKit(s));
    return kitPlaces.get(s)!;
  });
  for (const f of [...places, ...extra]) {
    if (!f || !f.seats.length) continue;
    const d = Math.hypot(p.x - f.centre.x, p.z - f.centre.z);
    if (d >= bd || Math.abs(p.y - f.centre.y) > 2 || !f.open(p)) continue;
    if (!hungry(ctx) && (f.hungryOnly || !(f.fast && ctx.fast <= 0))) continue;
    bd = d;
    best = f;
  }
  return best;
}

/** Puts a hero on a seat: hips on it, facing where it faces. */
function seat(h: Hero, place: THREE.Object3D): void {
  place.getWorldPosition(at);
  place.getWorldDirection(fwd);
  h.yaw = yawOf(fwd.x, fwd.z);
  h.body.pos.copy(at);
  h.body.vel.set(0, 0, 0);
  h.model.root.position.copy(at);
  h.model.root.rotation.y = h.yaw;
}

function sitDown(ctx: Ctx, s: FoodPlace): void {
  const seats = s.seats;
  // the last seat is the cat's (on the ground: by the basket, by the kiosk's stools); the player sits first
  const heroes = [...ctx.heroes.values()].sort((a, b) => (a === ctx.player ? -1 : b === ctx.player ? 1 : 0));
  const cat = heroes.find((h) => h.id === 'pupsia');
  const free = [...seats.slice(-1), ...seats.slice(0, -1)];
  const snacks: THREE.Object3D[] = [];
  const place = (h: Hero, o: THREE.Object3D) => {
    free.splice(free.indexOf(o), 1);
    seat(h, o);
    h.model.play('eat');
    snacks.push(holdSnack(h.model, h.id === 'pupsia' ? 'fish' : s.snack));
  };
  if (cat && free.length) place(cat, free[0]);
  for (const h of heroes) if (h !== cat && free.length) place(h, free[0]);
  ctx.napping = true;
  meal = { s, t: 0, snacks, bite: 0.4 };
  s.setEat(0);
  sfx.play('switch', { pitch: 1.4 });
}

function finish(ctx: Ctx): void {
  const m = meal!;
  meal = null;
  ctx.napping = false;
  m.s.setEat(undefined);
  for (const o of m.snacks) o.removeFromParent();
  for (const h of ctx.heroes.values()) {
    h.hearts = HERO_STATS.maxHearts;
    h.model.play('cheer');
    ctx.effects.poof(at.copy(h.pos).setY(h.pos.y + 1), 0xee6a82, 10);
  }
  sfx.play('sticker', { pitch: 1.2 });
  voice.say('eat_done', { priority: 7, interrupt: true });
  const fast = m.s.fast;
  if (fast) {
    ctx.fast = fast;
    setTimeout(() => voice.say('eat_fast', { priority: 7 }), 1600);
  }
}

export function updateFood(ctx: Ctx, dt: number): void {
  // the ice cream's fast running: sparkles at the feet while it lasts
  if (ctx.fast > 0) {
    ctx.fast = Math.max(0, ctx.fast - dt);
    sparkT -= dt;
    if (sparkT <= 0 && !ctx.napping) {
      sparkT = 0.14;
      for (const h of ctx.heroes.values()) if (Math.hypot(h.body.vel.x, h.body.vel.z) > 1) ctx.effects.sparkle(at.copy(h.pos).setY(h.pos.y + 0.15), 0xfff1c8);
    }
  }
  if (!ctx.playing) return;
  if (meal) {
    ctx.hud.setFood(null);
    meal.t += dt;
    meal.s.setEat(meal.t);
    meal.bite -= dt;
    if (meal.bite <= 0) {
      meal.bite = 0.55 + Math.random() * 0.2;
      sfx.play('click', { pitch: 1.6 + Math.random() * 0.4, volume: 0.45 });
    }
    if (meal.t >= EAT_SECONDS || meal.s.gone()) finish(ctx);
    return;
  }
  const s = ctx.sleeping || ctx.map.isOpen || selectedBuilding() ? null : foodNear(ctx);
  ctx.hud.setFood(s ? s.piece : null);
  if (ctx.input.take('prompt:food') && s) sitDown(ctx, s);
}

export function initFood(ctx: Ctx): void {
  // For automated checks.
  (window as unknown as { __kotoFood: object }).__kotoFood = {
    eat: () => ctx.input.press('prompt:food'),
    hurt: () => {
      for (const h of ctx.heroes.values()) h.hearts = 1;
    },
    get state() {
      return { eating: meal ? +meal.t.toFixed(1) : null, fast: +ctx.fast.toFixed(1), hearts: [...ctx.heroes.values()].map((h) => h.hearts) };
    },
  };
}
