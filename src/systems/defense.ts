import * as THREE from 'three';
import type { Monster } from '../actors/entities';
import { TRAFFIC } from '../content/buildings';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';
import { damageMonster } from './combat';
import { standingWhere, working, type Standing } from './kit';

/**
 * The defence buildings (DESIGN.md «Power»): a working traffic light goes green, yellow,
 * red (all of them together); on red, monsters close to it stop and wait. A working
 * tesla tower strikes the nearest monster in reach with lightning every second or so —
 * never a dancing one (music means peace).
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
}
