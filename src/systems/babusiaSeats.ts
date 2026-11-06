import * as THREE from 'three';
import type { Hero } from '../actors/entities';
import { createFlowerField } from '../assets/babusia';
import { holdSnack } from '../assets/food';
import { CHAIR_FLOWERS, chairFlowerSpots } from '../content/babusia';
import { HERO_STATS } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { eating, sitDown, sitOn, type FoodPlace } from './food';
import { selectedBuilding } from './kit';

/**
 * The seats in Бабуся's yard (DESIGN.md «Бабуся»). Her wicker chair: standing still at it the hero
 * sits down and rocks, the lightning charges faster, flowers come up around it, and she brings a
 * cup of cocoa. The benches by the fire: the hero sits down and the party toasts marshmallows, a
 * meal run by systems/food.ts. Her side of it (walking over, jokes) stays in systems/babusia.ts.
 */

/** Standing still this long sits the hero down. */
const STILL = 0.4;
const CHAIR_REACH = 0.8;
const BENCH_REACH = 0.7;
/** In the chair the lightning charges this much faster. */
const CHARGE = 3;
const ROCK = 0.08;
const ROCK_PACE = 2.2;
const FLOWER_EVERY = 1.5;
const COCOA_AFTER = 4;
const SIP = 2;
const FLOWER_SPARK = 0xfff1c8;

/** The seats of her yard, built with her furniture. */
export interface YardSeats {
  /** The chair as a whole, to rock it. */
  rocker: THREE.Object3D;
  yaw: number;
  seat: THREE.Object3D;
  /** Where the chair's flowers grow (at the house corner). */
  patch: THREE.Group;
  /** The marshmallows, as a meal on the benches. */
  toast: FoodPlace;
}

/** What the seats ask of her. */
export interface Hostess {
  /** It is her coffee time: the chair is hers. */
  wantsChair(): boolean;
  inChair(): boolean;
  /** She is about, out of doors and in earshot. */
  near(): boolean;
  /** She sets out with a cup and calls `served` when she gets there; false: she is not in the yard. */
  bring(served: () => void): boolean;
  /** Nobody waits for the cup any more: back to her day. */
  recall(): void;
}

interface Sitting {
  by: Hero;
  flowerT: number;
  cocoa: 'wait' | 'coming' | 'done';
  cocoaT: number;
  cup: THREE.Object3D | null;
  sip: number;
}

let sat: Sitting | null = null;
let still = 0;
let benchStill = 0;
/** The hero has to step off a bench before sitting down again. */
let armed = true;
let rockT = 0;
let rockAmp = 0;
let rock = 0;
/** The day she last spoke of the child in her chair. */
let chairDay = -1;
const popping: { o: THREE.Object3D; t: number }[] = [];
const spots = chairFlowerSpots();
const seatAt = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Someone is rocking in her chair. */
export const sittingInChair = () => !!sat;

/** The chair's tilt now: whoever sits in it tilts with it. */
export const chairRock = () => rock;

export const seatsState = () => ({ sat: !!sat, rate: sat?.by.boltRate ?? null, cocoa: sat?.cocoa ?? null, cup: !!sat?.cup, armed });

function flower(ctx: Ctx, y: YardSeats, i: number): THREE.Object3D {
  const f = spots[i];
  const o = createFlowerField(ctx.skin, [{ x: 0, y: 0, z: 0, kind: f.kind }]);
  o.position.set(f.dx, 1, f.dz);
  y.patch.add(o);
  return o;
}

/** The flowers of this site, as they stood: none after a move, the same ones after a reload. */
export function plantChairFlowers(ctx: Ctx, y: YardSeats): void {
  for (const o of [...y.patch.children]) {
    o.removeFromParent();
    (o.children[0] as THREE.Mesh | undefined)?.geometry.dispose();
  }
  popping.length = 0;
  const n = Math.min(ctx.save.babusia.flowers || 0, CHAIR_FLOWERS);
  for (let i = 0; i < n; i++) flower(ctx, y, i);
}

function stand(ctx: Ctx, host: Hostess): void {
  const s = sat;
  if (!s) return;
  sat = null;
  if (s.cocoa === 'coming') host.recall();
  s.cup?.removeFromParent();
  s.by.boltRate = 1;
  s.by.model.root.rotation.set(0, s.by.yaw, 0);
  // a meal or the night has its own pose for them
  if (!eating() && !ctx.sleeping) s.by.model.play('idle');
}

/** She is here with the cup. */
function serve(ctx: Ctx): void {
  const s = sat;
  if (!s) return;
  s.cocoa = 'done';
  s.cup = holdSnack(s.by.model, s.by.id === 'pupsia' ? 'fish' : 'cocoa');
  s.sip = SIP;
  for (const h of ctx.heroes.values()) {
    h.hearts = HERO_STATS.maxHearts;
    ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1), 0xee6a82, 10);
  }
  sfx.play('sticker', { pitch: 1.2 });
  voice.say('babusia_cocoa', { priority: 7, interrupt: true });
}

function growFlower(ctx: Ctx, y: YardSeats): void {
  const b = ctx.save.babusia;
  if (b.flowers >= CHAIR_FLOWERS) return;
  const o = flower(ctx, y, b.flowers);
  b.flowers++;
  o.scale.setScalar(0.01);
  popping.push({ o, t: 0 });
  sfx.play('click', { pitch: 1.8, volume: 0.35 });
  o.getWorldPosition(tmp);
  ctx.effects.sparkle(tmp.setY(tmp.y + 0.3), FLOWER_SPARK);
}

function chair(ctx: Ctx, y: YardSeats, host: Hostess, dt: number): void {
  const h = ctx.player;
  const moving = Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
  if (sat && (moving || h !== sat.by || eating() || ctx.sleeping)) stand(ctx, host);
  if (!sat) {
    y.seat.getWorldPosition(seatAt);
    const at = Math.hypot(h.pos.x - seatAt.x, h.pos.z - seatAt.z) < CHAIR_REACH && Math.abs(h.pos.y - seatAt.y) < 1.2;
    const free = at && !moving && !host.wantsChair() && !eating() && !ctx.sleeping && !selectedBuilding();
    still = free ? still + dt : 0;
    if (still < STILL) return;
    still = 0;
    sat = { by: h, flowerT: 0.6, cocoa: 'wait', cocoaT: COCOA_AFTER, cup: null, sip: 0 };
    sfx.play('switch', { pitch: 1.5 });
    if (host.near() && chairDay !== ctx.save.day) {
      chairDay = ctx.save.day;
      voice.say('babusia_chair', { priority: 6 });
    }
  }
  const s = sat;
  sitOn(h, y.seat);
  h.model.play(s.cup ? 'eat' : 'sit');
  h.model.root.rotation.set(rock, h.yaw, 0, 'YXZ');
  h.boltRate = CHARGE;
  s.flowerT -= dt;
  if (s.flowerT <= 0) {
    s.flowerT = FLOWER_EVERY;
    growFlower(ctx, y);
  }
  if (s.cocoa === 'wait') {
    s.cocoaT -= dt;
    if (s.cocoaT <= 0) {
      s.cocoaT = 1;
      if (host.bring(() => serve(ctx))) s.cocoa = 'coming';
    }
  }
  if (s.cup) {
    s.sip -= dt;
    if (s.sip <= 0) {
      s.cup.removeFromParent();
      s.cup = null;
    }
  }
}

function benches(ctx: Ctx, y: YardSeats, dt: number): void {
  // a meal on them seats the party too, and leaves the hero on a bench
  if (eating()) armed = false;
  if (sat || eating() || ctx.sleeping || selectedBuilding()) {
    benchStill = 0;
    return;
  }
  const h = ctx.player;
  const on = y.toast.seats.some((o) => {
    o.getWorldPosition(seatAt);
    return Math.hypot(h.pos.x - seatAt.x, h.pos.z - seatAt.z) < BENCH_REACH && Math.abs(h.pos.y - seatAt.y) < 1.2;
  });
  if (!on) {
    armed = true;
    benchStill = 0;
    return;
  }
  benchStill = Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2 ? 0 : benchStill + dt;
  if (armed && benchStill >= STILL) sitDown(ctx, y.toast);
}

export function updateSeats(ctx: Ctx, y: YardSeats, host: Hostess, dt: number): void {
  rockT += dt;
  const target = sat ? ROCK : host.inChair() ? ROCK * 0.6 : 0;
  rockAmp += (target - rockAmp) * (1 - Math.exp(-dt * 3));
  rock = rockAmp * Math.sin(rockT * ROCK_PACE);
  y.rocker.rotation.set(rock, y.yaw, 0, 'YXZ');
  chair(ctx, y, host, dt);
  benches(ctx, y, dt);
  for (let i = popping.length - 1; i >= 0; i--) {
    const p = popping[i];
    p.t += dt;
    p.o.scale.setScalar(Math.max(0.01, 1 - Math.exp(-5 * p.t) * Math.cos(10 * p.t)));
    if (p.t < 1.3) continue;
    p.o.scale.setScalar(1);
    popping.splice(i, 1);
  }
}
