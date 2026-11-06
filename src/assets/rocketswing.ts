/**
 * The rocket swing: two A-frames of mint legs with a mustard top bar, a little ringed planet on one
 * end and a moon on the other, and hanging from the bar on two cream ropes a fat toy rocket lying
 * along the swing: a cream body with coral bands, a coral nose, round teal windows, mustard fins, a
 * coral saddle on its back. While it swings chunky warm flames come out of the nozzle, longest at
 * the bottom of the swing. Origin at the floor centre of the 2×1, front towards +Z; the seat swings
 * with `k.swing[0]` (+ = forward), the flames are own glow and only show while swinging.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL_DARK, TEAL, WOOD, setGlow } from './buildingParts';
import { Build, HP, finishShadows, fx } from './villages';

const MUSTARD_DARK = '#c98f1c';
const HULL = '#fff1d6';
const WINDOW = '#8fd0f5';

const BAR_Y = 2.4;
const FRAME_X = 0.86;
/** The rocket's centre under the bar, its radius; the ropes' x. */
const ROCKET_Y = 0.5;
const ROCKET_R = 0.19;
const ROPE_X = 0.29;
const ROPE = BAR_Y - ROCKET_Y;
/** The nozzle's end, where the flames start. */
const TAIL_Z = -0.46;

const C_OUTER = new THREE.Color('#ff7a3a');
const C_INNER = new THREE.Color('#ffd23a');

export function createRocketswing(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'rocketswing';
  const b = new Build(skin, 'rocketswing');
  root.add(b.root);

  // the frame
  for (const s of [-1, 1]) {
    const x = s * FRAME_X;
    for (const z of [-1, 1]) {
      b.beam([x, 0.02, z * 0.42], [x, BAR_Y, 0], 0.13, MINT);
      b.box([0.22, 0.1, 0.2], [x, 0.05, z * 0.42], CORAL);
    }
    b.box([0.09, 0.09, 0.56], [x, 1.0, 0], TEAL);
    b.box([0.24, 0.24, 0.24], [x, BAR_Y, 0], MUSTARD);
  }
  b.box([1.84, 0.13, 0.13], [0, BAR_Y, 0], MUSTARD);
  for (const s of [-1, 1]) b.box([0.09, 0.17, 0.17], [s * ROPE_X, BAR_Y, 0], STEEL_DARK);

  // a ringed planet on one end, a little moon on the other
  b.beam([-FRAME_X, BAR_Y + 0.1, 0], [-FRAME_X, BAR_Y + 0.22, 0], 0.05, STEEL_DARK);
  b.ball(0.15, [-FRAME_X, BAR_Y + 0.33, 0], CORAL);
  b.geo(new THREE.TorusGeometry(0.22, 0.026, 6, 20), [-FRAME_X, BAR_Y + 0.33, 0], CREAM, { rot: [1.25, 0.25, 0] });
  b.beam([FRAME_X, BAR_Y + 0.1, 0], [FRAME_X, BAR_Y + 0.22, 0], 0.05, STEEL_DARK);
  b.ball(0.12, [FRAME_X, BAR_Y + 0.31, 0], CREAM);
  b.disc(0.03, 0.012, [FRAME_X - 0.04, BAR_Y + 0.34, 0.112], [0, 0, 1], MUSTARD);
  b.disc(0.022, 0.012, [FRAME_X + 0.04, BAR_Y + 0.28, 0.108], [0, 0, 1], MUSTARD);
  b.finish();

  // what swings: the ropes and the rocket hanging from them
  const pivot = new THREE.Group();
  pivot.position.set(0, BAR_Y, 0);
  root.add(pivot);
  const r = new Build(skin, 'rocketswing-rocket');
  pivot.add(r.root);
  for (const s of [-1, 1]) {
    r.box([0.04, ROPE - 0.02, 0.04], [s * ROPE_X, -ROPE / 2, 0], CREAM);
    for (let i = 1; i < 6; i++) r.box([0.06, 0.04, 0.06], [s * ROPE_X, -i * (ROPE / 6), 0], WOOD);
  }
  const Y = -ROPE;
  const axis = { rot: [HP, 0, 0] as const, seg: 18 };
  // the hull from the tail to the nose, along +Z
  r.cyl(0.11, 0.07, [0, Y, TAIL_Z + 0.035], STEEL_DARK, { ...axis, r1: 0.085 });
  r.cyl(0.135, 0.16, [0, Y, -0.35], HULL, { ...axis, r1: ROCKET_R });
  r.cyl(ROCKET_R, 0.54, [0, Y, 0], HULL, axis);
  r.cyl(ROCKET_R + 0.006, 0.05, [0, Y, -0.21], CORAL, axis);
  r.cyl(ROCKET_R + 0.006, 0.05, [0, Y, 0.24], CORAL, axis);
  // a mustard collar the ropes hold, with a stub each side
  r.cyl(ROCKET_R + 0.012, 0.09, [0, Y, 0], MUSTARD, axis);
  r.box([2 * ROPE_X + 0.05, 0.05, 0.07], [0, Y, 0], MUSTARD_DARK);
  // the nose
  r.cyl(ROCKET_R, 0.24, [0, Y, 0.39], CORAL, { ...axis, r1: 0.04 });
  r.ball(0.05, [0, Y, 0.51], MUSTARD);
  // the fins, two at the sides, one under
  for (const s of [-1, 1]) r.beam([s * 0.13, Y - 0.02, -0.26], [s * 0.3, Y - 0.1, -0.42], 0.05, MUSTARD, 0.14);
  r.beam([0, Y - 0.13, -0.26], [0, Y - 0.3, -0.42], 0.14, MUSTARD, 0.05);
  // round windows on both sides
  for (const s of [-1, 1]) {
    r.disc(0.075, 0.02, [s * (ROCKET_R - 0.008), Y + 0.02, 0.12], [s, 0, 0], MUSTARD);
    r.disc(0.052, 0.022, [s * (ROCKET_R + 0.002), Y + 0.02, 0.12], [s, 0, 0], WINDOW);
  }
  // the saddle along its back
  r.box([0.24, 0.05, 0.36], [0, Y + ROCKET_R + 0.015, -0.09], CORAL);
  r.box([0.26, 0.025, 0.38], [0, Y + ROCKET_R - 0.015, -0.09], CORAL_DARK);
  r.finish();

  // the flames: chunky cones, a hot one inside a soft one
  const fire = new Build(skin, 'rocketswing-flame');
  fire.root.position.set(0, Y, TAIL_Z);
  const back = { rot: [-HP, 0, 0] as const };
  fire.glowGeo('outer', '#ff7a3a', new THREE.CylinderGeometry(0.015, 0.1, 0.42, 10), [0, 0, -0.21], back);
  fire.glowGeo('inner', '#ffd23a', new THREE.CylinderGeometry(0.01, 0.06, 0.27, 10), [0, 0, -0.14], back);
  const flames = fire.finish();
  setGlow(flames.outer, C_OUTER, 1.1);
  setGlow(flames.inner, C_INNER, 1.5);
  fire.root.visible = false;
  pivot.add(fx(fire.root));

  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.set(0, Y + ROCKET_R + 0.04, -0.09);
  pivot.add(seat);

  finishShadows(root);
  let t = 0;
  let level = 0;
  let was = 0;
  return {
    root,
    seats: [seat],
    update(dt, k) {
      t += dt;
      const a = k.swing?.[0] ?? 0;
      // + forward (towards +Z): a positive turn about X would swing the seat back
      pivot.rotation.x = -a;
      const speed = dt > 0 ? Math.abs(a - was) / dt : 0;
      was = a;
      level += ((speed > 0.03 ? 1 : 0) - level) * Math.min(1, dt * 6);
      fire.root.visible = level > 0.03;
      if (!fire.root.visible) return;
      const long = level * (0.95 + Math.min(0.55, speed * 0.3) + 0.14 * Math.sin(t * 31));
      const wide = level * (0.92 + 0.08 * Math.sin(t * 23));
      fire.root.scale.set(wide, wide, long);
    },
  };
}
