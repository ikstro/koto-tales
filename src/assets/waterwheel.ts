/**
 * The water wheel: a big wooden paddle wheel with cream and teal paddles, standing in a shallow
 * wooden trough of water, an A-frame behind it and a slim post in front. A little chute comes in from
 * behind and pours water on the top of the wheel, which always turns, drops falling off its paddles. A
 * belt runs from a mustard pulley on the axle down to a small coral generator in front (the power
 * bulb is on it). Origin at the floor centre of the 2×2 footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MUSTARD, STEEL_DARK, TAU, TEAL, WOOD, WOOD_DARK, powerBulb } from './buildingParts';
import { Build, HP, finishShadows } from './villages';

const WATER = '#7fd3ee';
const WOOD_LIGHT = '#b07f45';

/** The axle's height, the rim's radius, how far the paddles reach. */
const AXLE_Y = 1.0;
const RIM = 0.74;
const PADDLE_R = 0.72;
const PADDLES = 10;
/** The bearers stand here along z, the chute here along x (right of the top: that side goes down). */
const FRAME_Z = 0.54;
const CHUTE_X = 0.18;

/** Where a drop leaves the wheel: x, height, z. */
const DROPS: readonly (readonly [number, number, number])[] = [
  [-0.86, 1.02, 0.2],
  [-0.78, 1.34, -0.18],
  [-0.66, 0.66, 0.08],
  [-0.9, 0.82, -0.06],
  [0.8, 1.34, 0.12],
  [0.9, 0.98, -0.16],
  [0.68, 0.62, 0.22],
  [0.84, 0.74, 0.02],
];
const WATER_Y = 0.15;

export function createWaterwheel(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'waterwheel';
  const b = new Build(skin, 'waterwheel');
  root.add(b.root);

  // the floor and the shallow trough the wheel dips into
  b.box([1.92, 0.08, 1.92], [0, 0.04, 0], WOOD_DARK);
  for (const s of [-1, 1]) {
    b.box([1.9, 0.16, 0.06], [0, 0.14, s * 0.47], WOOD);
    b.box([0.06, 0.16, 0.9], [s * 0.92, 0.14, 0], WOOD);
  }
  b.box([1.78, 0.05, 0.88], [0, 0.125, 0], WATER);

  // the axle's bearers: an A-frame behind the wheel, a slim post with short braces in front of it
  for (const x of [-0.74, 0.74]) b.beam([x, 0.08, -FRAME_Z], [0, AXLE_Y + 0.08, -FRAME_Z], 0.11, WOOD_LIGHT, 0.1);
  b.box([1.0, 0.08, 0.08], [0, 0.52, -FRAME_Z], WOOD);
  b.box([0.11, AXLE_Y, 0.1], [0, AXLE_Y / 2 + 0.06, FRAME_Z], WOOD_LIGHT);
  for (const s of [-1, 1]) {
    b.beam([s * 0.34, 0.08, FRAME_Z], [0, 0.44, FRAME_Z], 0.08, WOOD);
    b.box([0.22, 0.22, 0.14], [0, AXLE_Y, s * FRAME_Z], MUSTARD);
  }

  // the chute comes in from behind: a goalpost and a strut carry it, the water pours off its lip on the wheel's top
  const x = CHUTE_X;
  for (const s of [-1, 1]) b.box([0.12, 2.0, 0.12], [x + s * 0.3, 1.06, -0.84], WOOD_LIGHT);
  b.box([0.76, 0.1, 0.14], [x, 2.02, -0.84], WOOD);
  b.beam([0, AXLE_Y, -FRAME_Z], [x, 2.08, -FRAME_Z], 0.08, WOOD_LIGHT);
  b.box([0.3, 0.04, 0.96], [x, 2.09, -0.48], WOOD);
  for (const s of [-1, 1]) b.box([0.04, 0.14, 0.96], [x + s * 0.15, 2.16, -0.48], WOOD_DARK);
  b.box([0.3, 0.14, 0.04], [x, 2.16, -0.94], WOOD_DARK);
  b.box([0.26, 0.03, 0.92], [x, 2.14, -0.48], WATER);
  b.box([0.22, 0.3, 0.06], [x, 2.0, 0.02], WATER);
  // the knob the network's wire hangs from
  b.box([0.14, 0.12, 0.14], [x + 0.3, 2.12, -0.84], MUSTARD);

  // the generator in front and the belt up to the axle's pulley
  b.box([0.46, 0.38, 0.3], [-0.6, 0.27, 0.71], CORAL);
  b.box([0.5, 0.06, 0.34], [-0.6, 0.49, 0.71], MUSTARD);
  b.cyl(0.09, 0.1, [-0.6, 0.6, 0.7], STEEL_DARK, { rot: [HP, 0, 0], seg: 12 });
  for (const s of [-1, 1]) b.beam([-0.6 + s * 0.06, 0.6 + s * 0.06, 0.7], [s * 0.09, AXLE_Y + s * 0.1, 0.7], 0.03, CHARCOAL);

  // the wheel: two rims, spokes, a hub, an axle, the paddles
  const wheel = new Build(skin, 'waterwheel-wheel');
  wheel.root.position.set(0, AXLE_Y, 0);
  for (const s of [-1, 1]) {
    wheel.geo(new THREE.TorusGeometry(RIM, 0.055, 6, 28), [0, 0, s * 0.33], WOOD);
    for (let i = 0; i < 4; i++) wheel.box([0.08, 2 * RIM, 0.06], [0, 0, s * 0.33], WOOD_DARK, [0, 0, (i * Math.PI) / 4]);
  }
  wheel.cyl(0.17, 0.72, [0, 0, 0], MUSTARD, { rot: [HP, 0, 0], seg: 12 });
  wheel.cyl(0.055, 1.32, [0, 0, 0.04], STEEL_DARK, { rot: [HP, 0, 0], seg: 10 });
  wheel.cyl(0.13, 0.08, [0, 0, 0.7], MUSTARD, { rot: [HP, 0, 0], seg: 14 });
  for (let i = 0; i < PADDLES; i++) {
    const a = (i / PADDLES) * TAU;
    wheel.box([0.08, 0.3, 0.62], [Math.sin(a) * PADDLE_R, Math.cos(a) * PADDLE_R, 0], i % 2 ? TEAL : CREAM, [0, 0, -a]);
  }
  wheel.finish();
  b.root.add(wheel.root);

  b.finish();

  const drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.09, 0.06), skin.partMaterial(WATER), DROPS.length);
  drops.frustumCulled = false;
  drops.visible = false;
  root.add(drops);

  const bulb = powerBulb(skin, b.root, [-0.6, 0.27, 0.86]);
  finishShadows(root);
  drops.castShadow = false;

  const m4 = new THREE.Matrix4();
  let t = 0;
  return {
    root,
    socket: new THREE.Vector3(CHUTE_X + 0.3, 2.18, -0.84),
    update(dt, k) {
      t += dt;
      bulb.update(t, k.power);
      // the water pours right of the top: that side goes down
      wheel.root.rotation.z -= dt * 1.1;
      drops.visible = true;
      for (let i = 0; i < DROPS.length; i++) {
        const [x, y, z] = DROPS[i];
        const life = (t * 1.3 + ((i * 0.37) % 1)) % 1;
        const s = life > 0.9 ? (1 - life) * 10 : 1;
        drops.setMatrixAt(i, m4.makeScale(s, s, s).setPosition(x, y - (y - WATER_Y) * life * life, z));
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}
