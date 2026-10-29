import * as THREE from 'three';
import type { MonsterKind } from '../contracts';
import type { Monster } from '../actors/entities';
import type { LineId } from '../content/lines';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { sideCos, sideSin } from '../world/villages';
import { playingSpeakers } from './kit';
import { spawnAt } from './monsters';

/**
 * What villages and castles share (DESIGN.md «Villages», «Castles»): a square turned to face
 * home, someone who asks for help with a picture bubble, and the tasks' world parts — things
 * scattered around, a lost little one, a wave of monsters, music nearby, coins as thanks.
 */

/** A square in the world: its centre cell, the floor's top block and quarter turns (the front, local +Z, faces home). */
export interface Square {
  x: number;
  z: number;
  y: number;
  side: 0 | 1 | 2 | 3;
}

/** World position of square-local (lx, lz) (from the centre cell's middle), feet at the floor. */
export function sitePos(v: Square, lx: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = sideCos(v.side);
  const s = sideSin(v.side);
  return out.set(v.x + 0.5 + lx * c + lz * s, v.y + 1, v.z + 0.5 - lx * s + lz * c);
}

/** Turns (x, z) by quarter turns, the way three.js turns a model (rotation.y). */
export function turnXZ(x: number, z: number, turn: number): [number, number] {
  const c = sideCos(turn & 3);
  const s = sideSin(turn & 3);
  return [x * c + z * s, -x * s + z * c];
}

/** A dry, walkable spot `r0..r1` from `centre`; `fallback` when none is found. */
export function spotAround(ctx: Ctx, centre: THREE.Vector3, r0: number, r1: number, fallback: THREE.Vector3): THREE.Vector3 {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    const x = Math.floor(centre.x + Math.sin(a) * r);
    const z = Math.floor(centre.z + Math.cos(a) * r);
    const g = ctx.world.groundHeight(x, z);
    if (ctx.world.isWater(x, g, z) || ctx.world.isWater(x, g - 1, z)) continue;
    if (Math.abs(ctx.world.groundHeight(x + 1, z) - g) > 1 || Math.abs(ctx.world.groundHeight(x, z + 1) - g) > 1) continue;
    return new THREE.Vector3(x + 0.5, g, z + 0.5);
  }
  return fallback.clone();
}

/** Coins as thanks, bursting out above `at`. */
export function giveCoins(ctx: Ctx, n: number, at: THREE.Vector3): void {
  ctx.save.coins += n;
  events.emit('coins:changed', { coins: ctx.save.coins });
  ctx.effects.coinBurst(at.clone().setY(at.y + 1.2), Math.min(12, n));
  sfx.play('coin');
}

/** A speaker plays within `r` of `centre`. */
export const musicNear = (centre: THREE.Vector3, r: number) => playingSpeakers().some((sp) => Math.hypot(sp.centre.x - centre.x, sp.centre.z - centre.z) < r);

// ─── a defence wave ──────────────────────────────────────────────────────────

export interface Wave {
  wave: Set<Monster>;
  waveT: number;
}

export interface WaveRule {
  /** Monsters come from this far from the centre. */
  from: [number, number];
  /** It keeps going while the hero is this close. */
  near: number;
  /** At most this many at once. */
  atOnce: number;
  /** Said when it starts. */
  line: LineId;
}

/**
 * The defence: monsters come at `centre` a few at a time while the hero is near. Returns how
 * many of the wave were beaten since the last call; `left` is how many are still to beat.
 */
export function runWave(ctx: Ctx, w: Wave, centre: THREE.Vector3, left: number, rule: WaveRule, dt: number): number {
  let beaten = 0;
  for (const m of [...w.wave]) {
    if (m.alive && ctx.monsters.includes(m)) continue;
    w.wave.delete(m);
    if (m.hp <= 0) beaten++;
  }
  left -= beaten;
  if (left <= 0) return beaten;
  const near = Math.hypot(ctx.player.pos.x - centre.x, ctx.player.pos.z - centre.z) < rule.near;
  if (!near || ctx.sleeping) return beaten;
  if (w.waveT === 0 && w.wave.size === 0) voice.say(rule.line, { priority: 7 });
  w.waveT += dt;
  if (w.wave.size >= Math.min(rule.atOnce, left) || w.waveT < 1.6) return beaten;
  w.waveT = 0.01;
  const night = ctx.clock.daylight < 0.35;
  const kinds: MonsterKind[] = night ? ['zombie', 'skeleton', 'spider'] : ['zombie'];
  const at = spotAround(ctx, centre, rule.from[0], rule.from[1], centre);
  w.wave.add(spawnAt(ctx, kinds[Math.floor(Math.random() * kinds.length)], at.x, at.z));
  return beaten;
}

// ─── someone walking: the folk, a lost little one ────────────────────────────

export interface Walker {
  pos: THREE.Vector3;
  yaw: number;
}

export function faceTo(f: Walker, tx: number, tz: number, dt: number, k = 6): void {
  const want = Math.atan2(tx - f.pos.x, tz - f.pos.z);
  let d = want - f.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  f.yaw += d * Math.min(1, dt * k);
}

/** Walks towards (x, z) at `speed`; true when there. */
export function walkTo(ctx: Ctx, f: Walker, x: number, z: number, speed: number, dt: number): boolean {
  const dx = x - f.pos.x;
  const dz = z - f.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const step = Math.min(d, speed * dt);
  f.pos.x += (dx / d) * step;
  f.pos.z += (dz / d) * step;
  f.pos.y = ctx.world.groundHeight(Math.floor(f.pos.x), Math.floor(f.pos.z));
  faceTo(f, x, z, dt, 10);
  return false;
}

/** A found little one keeps up with the hero (jumps along when left far behind); returns its speed. */
export function followHero(ctx: Ctx, f: Walker, dt: number): number {
  const p = ctx.player.pos;
  const d = Math.hypot(p.x - f.pos.x, p.z - f.pos.z);
  if (d > 28) {
    f.pos.set(p.x - Math.sin(ctx.player.yaw) * 1.6, p.y, p.z - Math.cos(ctx.player.yaw) * 1.6);
    return 0;
  }
  if (d > 2.2) {
    const speed = Math.min(6.5, d * 2);
    walkTo(ctx, f, p.x, p.z, speed, dt);
    return speed;
  }
  faceTo(f, p.x, p.z, dt, 4);
  return 0;
}

// ─── the bubble ──────────────────────────────────────────────────────────────

interface Offer {
  /** The head's top, world. */
  at: THREE.Vector3;
  picture: string;
  lit: number;
  /** How far the hero is: the nearest offer wins. */
  d: number;
}

let offer: Offer | null = null;
const tmp = new THREE.Vector3();

/** A task-giver within sight offers its bubble this frame (the nearest one is shown). */
export function offerBubble(o: Offer): void {
  if (!offer || o.d < offer.d) offer = o;
}

/** Once a frame, after every offer: pins the bubble over the nearest head, or hides it. */
export function pushBubble(ctx: Ctx): void {
  const o = offer;
  offer = null;
  if (!o || !ctx.playing || ctx.sleeping) {
    ctx.hud.setBubble(null);
    return;
  }
  tmp.copy(o.at).project(ctx.camera);
  if (tmp.z > 1) {
    ctx.hud.setBubble(null);
    return;
  }
  ctx.hud.setBubble({ x: (tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-tmp.y * 0.5 + 0.5) * window.innerHeight, picture: o.picture, lit: o.lit });
}
