/**
 * Бабуся's scooter: a cute step-through moped. A round mustard tail with a coral saddle, a flat
 * coral footboard, a mustard leg shield with a cream panel, coral mudguards, two small dark wheels
 * with cream crossed hubs, handlebars with coral grips and two round mirrors, a round headlight,
 * and on the front a wicker basket of daisies. Origin at the feet, between the wheels, nose towards
 * +Z; the engine moves and turns the root, the wheels turn with `k.walk`. At night the headlight
 * shines and lays a small warm pool ahead; it is the only glow.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL, STEEL_DARK, setGlow } from './buildingParts';
import { Build, HP, finishShadows, pool } from './villages';

const MUSTARD_DARK = '#c98f1c';
const WICKER = '#c8964a';
const WICKER_DARK = '#9c6b2e';
const LEAF = '#4f9a3c';
const PETAL = '#fffaf0';
const LAMP = '#ffe9a8';
const TYRE = '#2a2523';

const WHEEL_R = 0.16;
const REAR_Z = -0.34;
const FRONT_Z = 0.36;
/** The saddle's top: a rider's hips rest here, the feet 0.4 below on the footboard. */
const SADDLE_Y = 0.6;

const C_LAMP = new THREE.Color(LAMP);

/** A wheel on its axle (X): a dark tyre, a mustard hub, a cream cross that shows the turning. */
function wheel(skin: Skin, z: number): Build {
  const w = new Build(skin, 'scooter-wheel');
  w.root.position.set(0, WHEEL_R, z);
  const side = { rot: [0, 0, HP] as const, seg: 18 };
  w.cyl(WHEEL_R, 0.1, [0, 0, 0], TYRE, side);
  w.cyl(0.095, 0.112, [0, 0, 0], MUSTARD, side);
  w.box([0.12, 0.17, 0.045], [0, 0, 0], CREAM);
  w.box([0.12, 0.045, 0.17], [0, 0, 0], CREAM);
  w.cyl(0.03, 0.13, [0, 0, 0], STEEL, { ...side, seg: 8 });
  w.finish();
  return w;
}

export function createScooter(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'scooter';
  const rear = wheel(skin, REAR_Z);
  const front = wheel(skin, FRONT_Z);
  root.add(rear.root, front.root);

  const b = new Build(skin, 'scooter');
  root.add(b.root);

  // the round tail under the saddle, the mudguard over the back wheel, a tail lamp
  b.ball(1, [0, 0.38, -0.27], MUSTARD, { s: [0.16, 0.18, 0.25] });
  b.box([0.2, 0.05, 0.2], [0, 0.22, -0.12], MUSTARD_DARK);
  b.geo(new THREE.TorusGeometry(WHEEL_R + 0.035, 0.05, 6, 12, Math.PI * 0.75), [0, WHEEL_R, REAR_Z], CORAL, { rot: [0, HP, 0], s: [1.3, 1, 1] });
  b.box([0.1, 0.06, 0.04], [0, 0.42, -0.5], CORAL_DARK);

  // the saddle, one soft pad rising a little at the back
  b.box([0.25, 0.08, 0.4], [0, SADDLE_Y - 0.04, -0.2], CORAL);
  b.ball(1, [0, SADDLE_Y - 0.01, -0.37], CORAL, { s: [0.125, 0.07, 0.09] });
  b.box([0.27, 0.025, 0.42], [0, SADDLE_Y - 0.09, -0.2], CORAL_DARK);

  // the footboard
  b.box([0.27, 0.05, 0.38], [0, 0.175, 0.04], CORAL);
  b.box([0.28, 0.02, 0.4], [0, 0.145, 0.04], CORAL_DARK);

  // the leg shield with its cream panel, the head on top
  b.beam([0, 0.17, 0.215], [0, 0.72, 0.285], 0.28, MUSTARD, 0.06);
  b.beam([0, 0.26, 0.25], [0, 0.64, 0.3], 0.18, CREAM, 0.03);
  b.box([0.2, 0.1, 0.14], [0, 0.76, 0.28], MUSTARD);

  // the fork and the front mudguard
  for (const s of [-1, 1]) b.beam([s * 0.075, WHEEL_R, FRONT_Z], [s * 0.05, 0.66, 0.29], 0.035, STEEL_DARK);
  b.geo(new THREE.TorusGeometry(WHEEL_R + 0.035, 0.05, 6, 12, Math.PI * 0.62), [0, WHEEL_R, FRONT_Z], CORAL, { rot: [0, HP, 0.55], s: [1.3, 1, 1] });

  // the handlebars, grips, mirrors
  b.box([0.05, 0.1, 0.05], [0, 0.85, 0.28], STEEL);
  b.box([0.46, 0.04, 0.04], [0, 0.89, 0.27], STEEL);
  for (const s of [-1, 1]) {
    b.box([0.11, 0.055, 0.055], [s * 0.24, 0.89, 0.27], CORAL);
    b.beam([s * 0.17, 0.9, 0.27], [s * 0.22, 1.02, 0.27], 0.018, STEEL_DARK);
    b.disc(0.05, 0.022, [s * 0.225, 1.05, 0.26], [0, 0, 1], STEEL);
  }

  // the headlight
  b.cyl(0.1, 0.07, [0, 0.82, 0.37], STEEL, { rot: [HP, 0, 0], seg: 16 });

  // the basket under it, full of daisies
  b.box([0.34, 0.03, 0.2], [0, 0.46, 0.43], WICKER_DARK);
  b.box([0.32, 0.17, 0.18], [0, 0.55, 0.43], WICKER);
  for (const y of [0.5, 0.58]) b.box([0.33, 0.03, 0.19], [0, y, 0.43], WICKER_DARK);
  b.box([0.36, 0.035, 0.22], [0, 0.645, 0.43], WICKER_DARK);
  b.box([0.28, 0.03, 0.14], [0, 0.66, 0.43], LEAF);
  const DAISIES: readonly [number, number, number][] = [
    [-0.11, 0.72, 0.45],
    [0.0, 0.76, 0.47],
    [0.11, 0.72, 0.45],
    [-0.06, 0.71, 0.39],
    [0.07, 0.7, 0.4],
  ];
  for (const [x, y, z] of DAISIES) {
    b.beam([x * 0.7, 0.65, 0.43], [x, y, z], 0.016, LEAF);
    b.disc(0.066, 0.018, [x, y, z], [0, 0.72, 0.7], PETAL);
    b.disc(0.028, 0.03, [x, y, z], [0, 0.72, 0.7], MUSTARD);
  }

  // the little stand and the exhaust
  b.beam([-0.1, 0.2, -0.05], [-0.17, 0.0, -0.1], 0.03, CHARCOAL);
  b.beam([0.1, 0.26, -0.26], [0.12, 0.2, -0.46], 0.05, STEEL);
  const lampMat = b.lens('lamp', LAMP, 0.078, 0.02, [0, 0.82, 0.405], [0, 0, 1]).finish().lamp;
  setGlow(lampMat, C_LAMP, 0.15);

  const glow = pool(0xffe0a0, 0.85, [0, 0.03, 1.05]);
  root.add(glow.mesh);

  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.set(0, SADDLE_Y, -0.16);
  root.add(seat);

  finishShadows(root);
  let t = 0;
  let lit = -1;
  return {
    root,
    seats: [seat],
    update(dt, k) {
      t += dt;
      const v = k.walk ?? 0;
      const turn = (v * dt) / WHEEL_R;
      rear.root.rotation.x += turn;
      front.root.rotation.x += turn;
      // a small putter of the body while it runs
      b.root.position.y = v > 0.05 ? Math.sin(t * 24) * 0.006 : 0;
      const n = Math.round(k.night * 10);
      if (n === lit) return;
      lit = n;
      setGlow(lampMat, C_LAMP, 0.15 + 1.1 * k.night);
      glow.mesh.visible = k.night > 0.15;
      glow.mat.opacity = 0.5 * k.night;
    },
  };
}
