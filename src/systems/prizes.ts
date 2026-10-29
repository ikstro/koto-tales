import * as THREE from 'three';
import type { Hero } from '../actors/entities';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';
import { standingWhere, working, type Standing } from './kit';

/**
 * The villages' prize buildings at work (DESIGN.md «Kit»). The garland is a light in the
 * power networks (systems/power.ts does it). On a working carousel the party, standing
 * still, sits on its animals and rides round (hearts come back fast); a step gets off.
 * A trampoline bounces whoever lands on it high up (the map opens wider up there). A
 * searchlight sweeps its beam at night; a monster caught in it freezes for a moment.
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

export function updatePrizes(ctx: Ctx, dt: number): void {
  t += dt;
  if (!ctx.playing || ctx.sleeping) {
    if (riders.size) {
      for (const h of riders) h.model.play('idle');
      riders.clear();
      ride = null;
    }
    return;
  }
  carousel(ctx, dt);
  trampolines(ctx, dt);
  searchlights(ctx);
}
