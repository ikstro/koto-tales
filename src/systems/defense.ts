import * as THREE from 'three';
import type { Monster } from '../actors/entities';
import { TRAFFIC } from '../content/buildings';
import { GOLEM_HIT } from '../assets/castlePrizes';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';
import { damageMonster } from './combat';
import { standingWhere, working, type Standing } from './kit';
import { slamTarget } from './prizeRules';

/**
 * The defence buildings (DESIGN.md «Power»): a working traffic light goes green, yellow,
 * red (all of them together); on red, monsters close to it stop and wait. A working
 * tesla tower strikes the nearest monster in reach with lightning every second or so —
 * never a dancing one (music means peace). A golem (a castle's prize, no power) turns to the
 * nearest monster in reach every couple of seconds, raises its fists and slams the ground: a
 * dust ring, the tesla's damage and a small knock-back — never a dancing or a waiting monster.
 */

const TESLA_DAMAGE = 2;
const TESLA_TIP = new THREE.Vector3(0, 3.8, 0);
const CYCLE = TRAFFIC.green + TRAFFIC.yellow + TRAFFIC.red;

let clock = 0;
const since = new WeakMap<Standing, number>();
const cool = new WeakMap<Standing, number>();

/** The traffic lights' colour now: 0 green, 1 yellow, 2 red. */
export function signalNow(): 0 | 1 | 2 {
  const k = clock % CYCLE;
  return k < TRAFFIC.green ? 0 : k < TRAFFIC.green + TRAFFIC.yellow ? 1 : 2;
}

/** Whether a working traffic light shows red to a monster at (x, z). */
export function redLight(x: number, z: number): boolean {
  if (signalNow() !== 2) return false;
  for (const s of standingWhere((c) => !!c.traffic)) {
    if (working(s) && Math.hypot(s.centre.x - x, s.centre.z - z) < s.card.traffic!.reach) return true;
  }
  return false;
}

const centre = (m: Monster, out: THREE.Vector3) => out.copy(m.pos).setY(m.pos.y + m.body.height * 0.5);
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const dir = new THREE.Vector3();

function strike(ctx: Ctx, s: Standing): boolean {
  const reach = s.card.zap!.reach;
  let best: Monster | null = null;
  let bd = reach;
  for (const m of ctx.monsters) {
    if (!m.alive || m.state === 'dance') continue;
    const d = Math.hypot(m.pos.x - s.centre.x, m.pos.z - s.centre.z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (!best) return false;
  from.copy(s.model?.tip ?? TESLA_TIP).applyAxisAngle(THREE.Object3D.DEFAULT_UP, (s.rec.rot * Math.PI) / 2).add(s.centre);
  centre(best, to);
  ctx.effects.lightning(from, to);
  damageMonster(ctx, best, TESLA_DAMAGE, dir.subVectors(best.pos, s.centre).setY(0).normalize(), ctx.player);
  sfx.play('lightning', { volume: 0.5 });
  return true;
}

// ─── the golem (a castle's prize): a ground slam on the nearest monster ─────

interface Slam {
  /** Seconds since this slam began (Infinity: standing). */
  t: number;
  target: Monster | null;
  landed: boolean;
  cool: number;
  /** Where the golem looks (model space yaw). */
  aim: number;
}
const slams = new WeakMap<Standing, Slam>();
const front = new THREE.Vector3();

function golems(ctx: Ctx, dt: number): void {
  for (const s of standingWhere((c) => !!c.slam)) {
    let g = slams.get(s);
    if (!g) slams.set(s, (g = { t: Infinity, target: null, landed: true, cool: 0.5, aim: 0 }));
    const card = s.card.slam!;
    g.t += dt;
    g.cool -= dt;
    if (g.t === Infinity || g.t > GOLEM_HIT + 1) {
      if (g.cool <= 0) {
        const m = slamTarget(ctx.monsters, s.centre.x, s.centre.z, card.reach);
        if (m) {
          g.t = 0;
          g.target = m;
          g.landed = false;
          g.cool = card.every;
          sfx.play('rumble', { volume: 0.35, pitch: 1.4 });
        } else g.cool = 0.25;
      }
    }
    const m = g.target;
    if (m && g.t < GOLEM_HIT + 1) g.aim = Math.atan2(m.pos.x - s.centre.x, m.pos.z - s.centre.z) - (s.rec.rot * Math.PI) / 2;
    if (!g.landed && g.t >= GOLEM_HIT) {
      g.landed = true;
      // the fists hit the ground in front; dust rolls out and the monster gets the blow (if still there)
      const yaw = g.aim + (s.rec.rot * Math.PI) / 2;
      front.set(s.centre.x + Math.sin(yaw) * 1.3, s.centre.y + 0.1, s.centre.z + Math.cos(yaw) * 1.3);
      ctx.effects.ring(front, 0xd9c7a0, 2.6);
      ctx.effects.poof(front, 0xcbb994, 14);
      sfx.play('rumble', { volume: 0.8 });
      sfx.play('break', { volume: 0.5, pitch: 0.7 });
      if (m && m.alive && m.state !== 'dance' && m.state !== 'wait' && Math.hypot(m.pos.x - s.centre.x, m.pos.z - s.centre.z) < card.reach + 1.5) {
        ctx.effects.ring(m.pos, 0xd9c7a0, 1.4);
        damageMonster(ctx, m, card.damage, dir.subVectors(m.pos, s.centre).setY(0).normalize(), ctx.player);
      }
    }
    s.extra.slam = g.t;
    s.extra.aim = g.aim;
  }
}

/** For automated checks. */
export function exposeDefense(): void {
  (window as unknown as { __kotoDefense: object }).__kotoDefense = {
    get state() {
      return { clock: +clock.toFixed(2), signal: signalNow() };
    },
    /** Jumps the lights to red. */
    red: () => (clock = Math.ceil(clock / CYCLE) * CYCLE + TRAFFIC.green + TRAFFIC.yellow + 0.01),
  };
}

export function updateDefense(ctx: Ctx, dt: number): void {
  if (!ctx.playing || ctx.sleeping) return;
  clock += dt;
  const signal = signalNow();
  for (const s of standingWhere((c) => !!c.traffic)) s.extra.signal = working(s) ? signal : undefined;
  for (const s of standingWhere((c) => !!c.zap)) {
    const was = (since.get(s) ?? Infinity) + dt;
    since.set(s, was);
    s.extra.zap = was;
    if (!working(s)) continue;
    const c = (cool.get(s) ?? 0) - dt;
    if (c > 0) {
      cool.set(s, c);
      continue;
    }
    if (strike(ctx, s)) {
      since.set(s, 0);
      cool.set(s, s.card.zap!.every);
    } else cool.set(s, 0.2);
  }
  golems(ctx, dt);
}
