import * as THREE from 'three';
import { turnTowards, yawOf, type Monster } from '../actors/entities';
import { placeOnGround, stepBody, type Body } from '../actors/physics';
import type { Ctx } from '../core/ctx';
import { nearestMonster } from './combat';
import { tuneOf } from './tune';

/**
 * Walking with the party and shooting like a helper: the robot helper's way (systems/prizes.ts),
 * shared with the companions (systems/companions.ts).
 */
export interface Follower {
  body: Body;
  yaw: number;
  moving: boolean;
  stuck: number;
  fireCd: number;
}

/** How far behind the player a follower comes to rest, how far the player may get before it walks. */
export const FOLLOW_REST = 2.6;
const FOLLOW_GO = 3.6;
const FOLLOW_SPEED = 6;
const FOLLOW_JUMP = 22;
const tmp = new THREE.Vector3();

/** Where follower `i` belongs: behind the player, the first in the middle, then right, left, … */
export function followSlot(ctx: Ctx, i: number, out: THREE.Vector3, rest = FOLLOW_REST): THREE.Vector3 {
  const p = ctx.player.pos;
  const fx = Math.sin(ctx.player.yaw);
  const fz = Math.cos(ctx.player.yaw);
  const side = i === 0 ? 0 : i % 2 ? 1 : -1;
  out.set(p.x - fx * rest + fz * side * 1.4, p.y, p.z - fz * rest - fx * side * 1.4);
  const fy = Math.floor(p.y + 0.01);
  // that spot is inside a wall: right next to the player instead
  if (ctx.world.isSolid(Math.floor(out.x), fy, Math.floor(out.z)) || ctx.world.isSolid(Math.floor(out.x), fy + 1, Math.floor(out.z))) out.set(p.x - fx * 0.8, p.y, p.z - fz * 0.8);
  return out;
}

/**
 * One frame of walking to `slot`: it pops over with a puff when left far behind or stuck, walks only
 * when the party has gone on a bit and stops in its place. Returns its walking speed.
 */
export function stepFollower(ctx: Ctx, f: Follower, slot: THREE.Vector3, dt: number, puff: number): number {
  const p = ctx.player.pos;
  const far = Math.hypot(p.x - f.body.pos.x, p.z - f.body.pos.z);
  const dx = slot.x - f.body.pos.x;
  const dz = slot.z - f.body.pos.z;
  const dist = Math.hypot(dx, dz);
  if (far > FOLLOW_JUMP || (f.stuck > 2.5 && dist > 3)) {
    ctx.effects.poof(tmp.copy(f.body.pos).setY(f.body.pos.y + 0.6), puff, 8);
    placeOnGround(ctx.world, f.body, slot.x, slot.z);
    f.stuck = 0;
    f.moving = false;
    ctx.effects.poof(tmp.copy(f.body.pos).setY(f.body.pos.y + 0.6), puff, 8);
  }
  // it walks only when the party has gone on a bit, and stops in its place behind them
  if (!f.moving && far > FOLLOW_GO) f.moving = true;
  if (f.moving && dist < 0.6) f.moving = false;
  let vx = 0;
  let vz = 0;
  if (f.moving && !ctx.sleeping) {
    const spd = Math.min(FOLLOW_SPEED, dist * 2.4 + 1);
    vx = (dx / dist) * spd;
    vz = (dz / dist) * spd;
    f.yaw = turnTowards(f.yaw, yawOf(dx, dz), dt * 10);
  }
  const k = 1 - Math.exp(-dt * 10);
  f.body.vel.x += (vx - f.body.vel.x) * k;
  f.body.vel.z += (vz - f.body.vel.z) * k;
  stepBody(ctx.world, f.body, dt);
  f.stuck = f.body.blocked && f.moving ? f.stuck + dt : 0;
  return Math.hypot(f.body.vel.x, f.body.vel.z);
}

/**
 * Shoots like a helper: the nearest monster in `reach`, never a dancing one; the boss only with its
 * mouth open. `fire` sends the shot at a world point. True when it fired this frame.
 */
export function shootStep(ctx: Ctx, f: Follower, reach: number, dancers: Set<Monster>, dt: number, fire: (to: THREE.Vector3) => void): boolean {
  f.fireCd -= dt;
  const target = nearestMonster(ctx, f.body.pos, reach, undefined, dancers);
  if (target) {
    const ty = yawOf(target.pos.x - f.body.pos.x, target.pos.z - f.body.pos.z);
    if (!f.moving) f.yaw = turnTowards(f.yaw, ty, dt * 12);
    if (f.fireCd <= 0 && Math.abs(wrapAngle(ty - f.yaw)) < 0.6) {
      const [lo, hi] = tuneOf(ctx).helperFireEvery;
      f.fireCd = lo + Math.random() * (hi - lo);
      fire(tmp.copy(target.pos).setY(target.pos.y + target.body.height * 0.5));
      return true;
    }
  } else if (f.fireCd <= 0 && ctx.boss?.isTarget(f.body.pos, 13)) {
    const [lo, hi] = tuneOf(ctx).helperFireEvery;
    f.fireCd = lo + Math.random() * (hi - lo);
    const m = ctx.boss.mouthPoint(tmp);
    f.yaw = yawOf(m.x - f.body.pos.x, m.z - f.body.pos.z);
    fire(m);
    return true;
  }
  return false;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
