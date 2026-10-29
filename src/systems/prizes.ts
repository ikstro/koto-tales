import * as THREE from 'three';
import { Arrow, turnTowards, yawOf, type Hero } from '../actors/entities';
import { makeBody, placeOnGround, stepBody, type Body } from '../actors/physics';
import { HERO_STATS } from '../content/heroes';
import type { LineId } from '../content/lines';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { nearestMonster } from './combat';
import { landingSpot, moveFollower, nearestStanding, packAway, relocate, selectedBuilding, spotNear, standingWhere, working, type Standing } from './kit';
import { castleLanding } from './castles';
import { ARRIVE, travelTo } from './travel';
import { tuneOf } from './tune';
import { villageLanding } from './villages';

/**
 * The villages' prize buildings at work (DESIGN.md «Kit»). The garland is a light in the
 * power networks (systems/power.ts does it). On a working carousel the party, standing
 * still, sits on its animals and rides round (hearts come back fast); a step gets off.
 * A trampoline bounces whoever lands on it high up (the map opens wider up there). A
 * searchlight sweeps its beam at night; a monster caught in it freezes for a moment.
 *
 * The castles' prizes: round a tree house no monster appears at night and hearts come back
 * fast (the party sleeps in its hut: systems/sleep.ts). The robot helper walks with the party,
 * shoots like a helper and is never hurt; folded, it goes back into the box. Next to the flying
 * saucer a «fly» piece opens the big map in fly mode: a tap on an explored spot, a beam, a dark
 * fade, and the party lands there with the saucer next to them. (The golem: systems/defense.ts.)
 */

/** Physics' gravity (actors/physics.ts): a bounce of `h` blocks starts at √(2gh). */
const GRAVITY = 25;
const SWEEP = 1.3;
/** Half the beam's width (radians). */
const BEAM_HALF = 0.2;

const riders = new Set<Hero>();
let ride: Standing | null = null;
let stillOn = 0;
let t = 0;
const seat = new THREE.Vector3();
const bounceT = new WeakMap<Standing, number>();

/** Whether a hero sits on a carousel. */
export const riding = (h: Hero) => riders.has(h);

/** The swings: who sits on which seat, and how high it goes. */
let swing: { s: Standing; seat: number; t: number; by: Hero } | null = null;
let stillSwing = 0;
/** The swing's largest angle (radians) and its pace. */
const SWING_ARC = 0.6;
const SWING_PACE = 2.3;
/** On the swings the lightning charges this much faster. */
const SWING_CHARGE = 3;

function onPlatform(s: Standing, p: THREE.Vector3): boolean {
  return Math.hypot(p.x - s.centre.x, p.z - s.centre.z) < 1.45 && Math.abs(p.y - s.centre.y) < 0.9;
}

function getOff(ctx: Ctx): void {
  if (ride) {
    // a hop out to the side the hero was sitting
    const p = ctx.player.body.pos;
    const dx = p.x - ride.centre.x;
    const dz = p.z - ride.centre.z;
    const d = Math.hypot(dx, dz) || 1;
    p.set(ride.centre.x + (dx / d) * 2.1, ride.centre.y + 0.6, ride.centre.z + (dz / d) * 2.1);
  }
  for (const h of riders) h.model.play('idle');
  riders.clear();
  ride = null;
}

function carousel(ctx: Ctx, dt: number): void {
  const moving = Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
  if (ride && (moving || !working(ride) || ride.folding)) getOff(ctx);
  if (!ride) {
    const s = standingWhere((c) => !!c.ride).find((c) => working(c) && onPlatform(c, ctx.player.pos));
    stillOn = s && !moving ? stillOn + dt : 0;
    if (s && stillOn > 0.4 && s.model?.seats?.length) {
      ride = s;
      for (const h of ctx.heroes.values()) riders.add(h);
      sfx.play('switch', { pitch: 1.3 });
    }
    return;
  }
  const seats = ride.model!.seats!;
  let i = 0;
  for (const h of riders) {
    const st = seats[i++ % seats.length];
    st.getWorldPosition(seat);
    h.body.pos.set(seat.x, seat.y - 0.4, seat.z);
    h.body.vel.set(0, 0, 0);
    // facing along the turn
    h.yaw = Math.atan2(-(seat.z - ride.centre.z), seat.x - ride.centre.x);
    h.model.root.position.copy(h.body.pos);
    h.model.root.rotation.y = h.yaw;
  }
}

function offSwing(ctx: Ctx): void {
  if (!swing) return;
  swing.s.extra.swing = undefined;
  const h = swing.by;
  h.boltRate = 1;
  h.model.play('idle');
  h.model.root.rotation.set(0, h.yaw, 0);
  swing = null;
}

/** Standing still on a seat of the swings, the player sits and swings; a step gets off. The lightning charges faster meanwhile. */
function swings(ctx: Ctx, dt: number): void {
  const h = ctx.player;
  const moving = Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
  if (swing && (moving || swing.s.folding || h !== swing.by)) offSwing(ctx);
  if (!swing) {
    let found: { s: Standing; seat: number } | null = null;
    for (const s of standingWhere((c) => !!c.swing)) {
      (s.model?.seats ?? []).forEach((o, i) => {
        o.getWorldPosition(seat);
        if (Math.hypot(h.pos.x - seat.x, h.pos.z - seat.z) < 0.6 && Math.abs(h.pos.y - s.centre.y) < 0.9) found = { s, seat: i };
      });
    }
    stillSwing = found && !moving ? stillSwing + dt : 0;
    if (!found || stillSwing < 0.4) return;
    swing = { ...(found as { s: Standing; seat: number }), t: 0, by: h };
    sfx.play('switch', { pitch: 1.5 });
  }
  const sw = swing!;
  sw.t += dt;
  // it gets going over a couple of swings
  const a = SWING_ARC * Math.min(1, sw.t / 2.5) * Math.sin(sw.t * SWING_PACE);
  const angles = [0, 0];
  angles[sw.seat] = a;
  sw.s.extra.swing = angles;
  h.boltRate = SWING_CHARGE;
  const o = sw.s.model!.seats![sw.seat];
  o.getWorldPosition(seat);
  h.body.pos.copy(seat);
  h.body.vel.set(0, 0, 0);
  h.yaw = (sw.s.rec.rot * Math.PI) / 2;
  h.model.play('sit');
  h.model.root.position.copy(seat);
  h.model.root.rotation.set(-a, h.yaw, 0, 'YXZ');
}

function trampolines(ctx: Ctx, dt: number): void {
  for (const s of standingWhere((c) => !!c.bounce)) {
    let b = bounceT.get(s) ?? 0;
    b = Math.max(0, b - dt * 2.5);
    const [w, d] = s.rec.rot % 2 ? [s.card.size[1], s.card.size[0]] : s.card.size;
    for (const h of ctx.heroes.values()) {
      const p = h.body.pos;
      if (p.x < s.rec.x || p.x >= s.rec.x + w || p.z < s.rec.z || p.z >= s.rec.z + d) continue;
      if (Math.abs(p.y - s.centre.y) > 0.6 || h.body.vel.y > 0.5) continue;
      h.body.vel.y = Math.sqrt(2 * GRAVITY * s.card.bounce!.height);
      b = 1;
      if (h === ctx.player) sfx.play('switch', { pitch: 1.7 });
    }
    bounceT.set(s, b);
    s.extra.bounce = b;
  }
}

function searchlights(ctx: Ctx): void {
  const night = ctx.clock.daylight < 0.35;
  for (const s of standingWhere((c) => !!c.beam)) {
    const on = working(s);
    const phase = s.rec.x * 0.37 + s.rec.z * 0.21;
    const aim = on ? Math.sin(t * 0.45 + phase) * SWEEP : 0;
    s.extra.aim = aim;
    if (!on || !night) continue;
    const yaw = (s.rec.rot * Math.PI) / 2 + aim;
    for (const m of ctx.monsters) {
      if (!m.alive || m.state === 'dance') continue;
      const dx = m.pos.x - s.centre.x;
      const dz = m.pos.z - s.centre.z;
      const d = Math.hypot(dx, dz);
      if (d > s.card.beam!.reach || d < 0.5) continue;
      let a = Math.atan2(dx, dz) - yaw;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > BEAM_HALF + 0.6 / d) continue;
      if (m.frozen <= 0) sfx.play('click', { volume: 0.4 });
      m.frozen = s.card.beam!.freeze;
    }
  }
}

// ─── the castles' prizes ────────────────────────────────────────────────────

/** Whether (x, z) is close enough to a tree house that no monster appears there at night. */
export function sheltered(x: number, z: number): boolean {
  return standingWhere((c) => !!c.shelter).some((s) => Math.hypot(s.centre.x - x, s.centre.z - z) < s.card.shelter!.calm);
}

/** Whether a hero at `p` is close enough to a tree house for hearts to come back fast. */
export function healing(p: THREE.Vector3): boolean {
  return standingWhere((c) => !!c.shelter).some((s) => Math.hypot(s.centre.x - p.x, s.centre.z - p.z) < s.card.shelter!.heal && Math.abs(p.y - s.centre.y) < 4);
}

// the robot helper: walks with the party, shoots like a helper, cannot be hurt

interface Bot {
  body: Body;
  yaw: number;
  moving: boolean;
  stuck: number;
  fireCd: number;
  shot: number;
}
const bots = new WeakMap<Standing, Bot>();
/** How far behind the player the robot comes to rest, and how far the player may get before it walks. */
const BOT_REST = 2.6;
const BOT_GO = 3.6;
const BOT_SPEED = 6;
const BOT_JUMP = 22;
const boltGeo = new THREE.BoxGeometry(0.12, 0.12, 0.42);
const boltMat = new THREE.MeshBasicMaterial({ color: 0x7ff3ff, toneMapped: false });
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Where the robot belongs: behind the player, in the middle (the helpers walk at the sides). */
function botSlot(ctx: Ctx, i: number, out: THREE.Vector3): THREE.Vector3 {
  const p = ctx.player.pos;
  const fx = Math.sin(ctx.player.yaw);
  const fz = Math.cos(ctx.player.yaw);
  const side = i === 0 ? 0 : i % 2 ? 1 : -1;
  out.set(p.x - fx * BOT_REST + fz * side * 1.4, p.y, p.z - fz * BOT_REST - fx * side * 1.4);
  const fy = Math.floor(p.y + 0.01);
  // that spot is inside a wall: right next to the player instead
  if (ctx.world.isSolid(Math.floor(out.x), fy, Math.floor(out.z)) || ctx.world.isSolid(Math.floor(out.x), fy + 1, Math.floor(out.z))) out.set(p.x - fx * 0.8, p.y, p.z - fz * 0.8);
  return out;
}

function botOf(s: Standing): Bot {
  let b = bots.get(s);
  if (!b) {
    b = { body: makeBody(0.3, 1.2), yaw: 0, moving: false, stuck: 0, fireCd: 1.5, shot: 99 };
    b.body.pos.copy(s.centre);
    b.body.onGround = true;
    bots.set(s, b);
  }
  return b;
}

/** Brings the robots to the party at once (a portal, a flight, a night's sleep), with a poof. */
function snapBots(ctx: Ctx): void {
  standingWhere((c) => !!c.follow).forEach((s, i) => {
    const b = botOf(s);
    if (b.body.pos.distanceTo(ctx.player.pos) < 6) return;
    const at = botSlot(ctx, i, tmpA);
    placeOnGround(ctx.world, b.body, at.x, at.z);
    b.moving = false;
    b.yaw = ctx.player.yaw;
    moveFollower(s, b.body.pos, b.yaw);
    ctx.effects.poof(tmpB.copy(b.body.pos).setY(b.body.pos.y + 0.6), 0x7ff3ff, 8);
  });
}

function fireBolt(ctx: Ctx, b: Bot, to: THREE.Vector3): void {
  const from = new THREE.Vector3(b.body.pos.x + Math.sin(b.yaw) * 0.45, b.body.pos.y + 0.95, b.body.pos.z + Math.cos(b.yaw) * 0.45);
  const dir = tmpB.subVectors(to, from).normalize();
  const obj = new THREE.Mesh(boltGeo, boltMat);
  obj.position.copy(from);
  ctx.scene.add(obj);
  const a = new Arrow(obj, from);
  a.by = ctx.player;
  a.damage = HERO_STATS.arrowDamage * tuneOf(ctx).helperDamage;
  a.vel.copy(dir).multiplyScalar(HERO_STATS.arrowSpeed);
  a.vel.y += 1.2;
  ctx.arrows.push(a);
  b.shot = 0;
  sfx.play('arrow', { pitch: 1.8, volume: 0.4 });
}

function robots(ctx: Ctx, dt: number): void {
  const list = standingWhere((c) => !!c.follow);
  if (!list.length) return;
  const dancers = new Set(ctx.monsters.filter((m) => m.state === 'dance'));
  list.forEach((s, i) => {
    const b = botOf(s);
    b.shot += dt;
    s.extra.wake = s.age;
    s.extra.shot = b.shot;
    // still dropping in from the box: it stands where it lands
    if (s.age < 0.6) {
      b.body.pos.copy(s.centre);
      s.extra.walk = 0;
      return;
    }
    const p = ctx.player.pos;
    const slot = botSlot(ctx, i, tmpA);
    const far = Math.hypot(p.x - b.body.pos.x, p.z - b.body.pos.z);
    const dx = slot.x - b.body.pos.x;
    const dz = slot.z - b.body.pos.z;
    const dist = Math.hypot(dx, dz);
    if (far > BOT_JUMP || (b.stuck > 2.5 && dist > 3)) {
      ctx.effects.poof(tmpB.copy(b.body.pos).setY(b.body.pos.y + 0.6), 0x7ff3ff, 8);
      placeOnGround(ctx.world, b.body, slot.x, slot.z);
      b.stuck = 0;
      b.moving = false;
      ctx.effects.poof(tmpB.copy(b.body.pos).setY(b.body.pos.y + 0.6), 0x7ff3ff, 8);
    }
    // it walks only when the party has gone on a bit, and stops in its place behind them
    if (!b.moving && far > BOT_GO) b.moving = true;
    if (b.moving && dist < 0.6) b.moving = false;
    let vx = 0;
    let vz = 0;
    if (b.moving && !ctx.sleeping) {
      const spd = Math.min(BOT_SPEED, dist * 2.4 + 1);
      vx = (dx / dist) * spd;
      vz = (dz / dist) * spd;
      b.yaw = turnTowards(b.yaw, yawOf(dx, dz), dt * 10);
    }
    const k = 1 - Math.exp(-dt * 10);
    b.body.vel.x += (vx - b.body.vel.x) * k;
    b.body.vel.z += (vz - b.body.vel.z) * k;
    stepBody(ctx.world, b.body, dt);
    b.stuck = b.body.blocked && b.moving ? b.stuck + dt : 0;

    // it shoots like a helper: the nearest monster in reach, never a dancing one; the boss only with its mouth open
    b.fireCd -= dt;
    const target = nearestMonster(ctx, b.body.pos, s.card.follow!.reach, undefined, dancers);
    if (target) {
      const ty = yawOf(target.pos.x - b.body.pos.x, target.pos.z - b.body.pos.z);
      if (!b.moving) b.yaw = turnTowards(b.yaw, ty, dt * 12);
      if (b.fireCd <= 0 && Math.abs(wrapAngle(ty - b.yaw)) < 0.6) {
        const [lo, hi] = tuneOf(ctx).helperFireEvery;
        b.fireCd = lo + Math.random() * (hi - lo);
        fireBolt(ctx, b, tmpA.copy(target.pos).setY(target.pos.y + target.body.height * 0.5));
      }
    } else if (b.fireCd <= 0 && ctx.boss?.isTarget(b.body.pos, 13)) {
      const [lo, hi] = tuneOf(ctx).helperFireEvery;
      b.fireCd = lo + Math.random() * (hi - lo);
      const m = ctx.boss.mouthPoint(tmpA);
      b.yaw = yawOf(m.x - b.body.pos.x, m.z - b.body.pos.z);
      fireBolt(ctx, b, m);
    }
    s.extra.walk = Math.hypot(b.body.vel.x, b.body.vel.z);
    moveFollower(s, b.body.pos, b.yaw);
  });
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** A line said once the current one has finished (the robot's «hi» after the first-time narration). */
let after: { line: LineId; wait: number; until: number } | null = null;

function sayAfter(dt: number): void {
  if (!after) return;
  after.wait -= dt;
  after.until -= dt;
  if (after.wait > 0) return;
  if (voice.isSpeaking() && after.until > 0) return;
  voice.say(after.line, { priority: 6 });
  after = null;
}

// the flying saucer: a «fly» piece next to it, the big map in fly mode, a beam, a landing

interface Flight {
  s: Standing;
  /** 'up': lifting off where it stood; 'gone': the party is on its way; 'down': landing next to them. */
  phase: 'up' | 'gone' | 'down';
  lift: number;
}
let flight: Flight | null = null;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function saucerNear(ctx: Ctx): Standing | null {
  if (flight || selectedBuilding() || ctx.map.isOpen) return null;
  return nearestStanding(ctx, (c) => !!c.fly);
}

function houseCell(ctx: Ctx, x: number, z: number): boolean {
  const f = ctx.house?.footprint;
  return !!f && x >= f.x0 - 1 && x < f.x1 + 1 && z >= f.z0 - 1 && z < f.z1 + 1;
}

function pickLanding(ctx: Ctx, s: Standing): void {
  const opened = ctx.map.openFly((x, z) => void fly(ctx, s, x, z));
  if (opened) voice.say('saucer_pick', { priority: 7, interrupt: true });
}

async function fly(ctx: Ctx, s: Standing, x: number, z: number): Promise<void> {
  // a village or a castle: out in front of its portal, like a jump; elsewhere the nearest open ground
  const gate = villageLanding(ctx, x, z) ?? castleLanding(ctx, x, z);
  const spot = gate ? null : landingSpot(ctx.world, x, z, (cx, cz) => houseCell(ctx, cx, cz));
  const to = gate
    ? { x: gate.pos.x + Math.sin(gate.yaw) * ARRIVE, z: gate.pos.z + Math.cos(gate.yaw) * ARRIVE }
    : spot;
  if (!to || flight || ctx.sleeping) {
    sfx.play('click');
    return;
  }
  // lift-off: the beam comes down over the party, the saucer rises humming
  const f: Flight = (flight = { s, phase: 'up', lift: 0.01 });
  s.extra.lift = f.lift;
  for (const h of ctx.heroes.values()) h.invulnerable = Math.max(h.invulnerable, 3);
  sfx.play('switch', { pitch: 0.6 });
  setTimeout(() => sfx.play('wake', { pitch: 1.4 }), 500);
  for (let i = 0; i < 6; i++) setTimeout(() => {
    for (const h of ctx.heroes.values()) ctx.effects.sparkle(tmpB.copy(h.pos).setY(h.pos.y + 0.5 + i * 0.3), 0xb8fff0);
  }, 150 + i * 180);
  await wait(1400);
  if (flight !== f) return;
  f.phase = 'gone';
  // the party walks out on the landing point (travel steps out ARRIVE in front of what it is given)
  await travelTo(ctx, gate?.pos ?? new THREE.Vector3(spot!.x, spot!.y, spot!.z - ARRIVE), gate?.yaw ?? 0);
  if (flight !== f) return;
  const p = ctx.player.pos;
  if (Math.hypot(p.x - to.x, p.z - to.z) > 8) {
    // the trip didn't happen (a portal was busy): it settles back down where it was
    f.phase = 'down';
    return;
  }
  // the saucer comes down next to them, behind the party as the camera sees it; nowhere to stand: into the box
  const pad = spotNear(ctx, 'saucer', p.x, p.z, p.y, Math.PI) ?? spotNear(ctx, 'saucer', p.x, p.z, p.y, 0);
  if (!pad) {
    flight = null;
    s.extra.lift = 0;
    packAway(ctx, s);
    return;
  }
  relocate(ctx, s, pad);
  s.age = 99;
  f.phase = 'down';
  sfx.play('switch', { pitch: 0.7 });
}

function saucers(ctx: Ctx, dt: number): void {
  const f = flight;
  if (f) {
    if (f.s.folding) flight = null;
    else if (f.phase === 'up') f.lift = Math.min(1, f.lift + dt / 1.2);
    else if (f.phase === 'down') {
      f.lift = Math.max(0, f.lift - dt / 1.6);
      if (f.lift <= 0) {
        flight = null;
        ctx.effects.poof(tmpB.copy(f.s.centre).setY(f.s.centre.y + 0.2), 0xffe3a3, 14);
        sfx.play('place');
        voice.say('saucer_land', { priority: 7, interrupt: true });
      }
    }
    f.s.extra.lift = f.lift;
  }
  // one saucer, on the map wherever it stands
  const s = standingWhere((c) => !!c.fly)[0];
  if (s !== markedSaucer) {
    markedSaucer = s ?? null;
    ctx.map.setMarker('saucer', s ? { pos: s.centre, icon: 'map-saucer', pointer: false } : null);
  }
}
let markedSaucer: Standing | null = null;

let wired = false;
function wire(ctx: Ctx): void {
  if (wired) return;
  wired = true;
  events.on('hero:teleport', () => snapBots(ctx));
  events.on('sleep:done', () => snapBots(ctx));
  events.on('building:placed', ({ id }) => {
    // the robot wakes up and says hello (after the first-time narration, if that is playing)
    if (id === 'robohelper') after = { line: 'robohelper_hi', wait: 0.5, until: 8 };
  });
  events.on('building:folded', ({ id }) => {
    if (id === 'robohelper') voice.say('robohelper_bye', { priority: 7, interrupt: true });
  });
  // For automated checks: the fly mode without tapping the piece.
  (window as unknown as { __kotoPrizes: object }).__kotoPrizes = {
    fly: () => {
      const s = standingWhere((c) => !!c.fly)[0];
      if (s) pickLanding(ctx, s);
    },
    flyTo: (x: number, z: number) => {
      const s = standingWhere((c) => !!c.fly)[0];
      if (s) void fly(ctx, s, x, z);
    },
    /** Puts the player on the swings' first seat (then standing still swings). */
    toSwing: () => {
      const o = standingWhere((c) => !!c.swing)[0]?.model?.seats?.[0];
      if (!o) return;
      o.getWorldPosition(seat);
      ctx.player.body.pos.set(seat.x, standingWhere((c) => !!c.swing)[0].centre.y + 0.05, seat.z);
    },
    get state() {
      const bot = standingWhere((c) => !!c.follow)[0];
      const saucer = standingWhere((c) => !!c.fly)[0];
      return {
        robot: bot ? bot.centre.toArray().map((v) => +v.toFixed(2)) : null,
        saucer: saucer ? saucer.centre.toArray().map((v) => +v.toFixed(2)) : null,
        flight: flight?.phase ?? null,
        flyPiece: !!(saucer && saucerNear(ctx)),
        golem: standingWhere((c) => !!c.slam).map((s) => ({ slam: s.extra.slam, aim: s.extra.aim })),
        swing: swing ? { seat: swing.seat, t: +swing.t.toFixed(1), rate: swing.by.boltRate } : null,
        seats: standingWhere((c) => !!c.swing).flatMap((s) => (s.model?.seats ?? []).map((o) => o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)))),
      };
    },
  };
}

export function updatePrizes(ctx: Ctx, dt: number): void {
  t += dt;
  wire(ctx);
  saucers(ctx, dt);
  sayAfter(dt);
  if (!ctx.playing || ctx.sleeping) {
    ctx.hud.setFly(false);
    if (riders.size) {
      for (const h of riders) h.model.play('idle');
      riders.clear();
      ride = null;
    }
    offSwing(ctx);
    return;
  }
  carousel(ctx, dt);
  swings(ctx, dt);
  trampolines(ctx, dt);
  searchlights(ctx);
  robots(ctx, dt);
  const near = saucerNear(ctx);
  ctx.hud.setFly(!!near);
  if (ctx.input.take('prompt:fly') && near) pickLanding(ctx, near);
}
