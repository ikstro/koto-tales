/**
 * The sun sunflower: a coral flowerpot, a green stalk two blocks tall with chunky leaves, and a big
 * yellow flower head on top. The middle of the flower is a round solar panel: a grid of blue cells in
 * a brown ring of seeds. By day the head turns to the sun and lifts with it; at night it droops and
 * sleeps. Origin at the floor centre of the 1×1 footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, MUSTARD, SOLAR_BLUE, SOLAR_BLUE_LIGHT, TAU, WARM, powerBulb } from './buildingParts';
import { Build, HP, finishShadows } from './villages';

const STALK = '#3fa142';
const LEAF = '#4fb04a';
const LEAF_DARK = '#2f8236';
const SOIL = '#4a2c14';
const SEEDS = '#6b4220';

/** Where the head turns on the stalk. */
const NECK_Y = 1.86;
const PETALS = 12;
/** How the head hangs while the sun is down (a turn about X, + = looking at the ground). */
const DROOP = 0.85;

const smooth = (e0: number, e1: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

export function createSunflower(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'sunflower';
  const b = new Build(skin, 'sunflower');
  root.add(b.root);

  // the pot
  b.cyl(0.3, 0.36, [0, 0.2, 0], CORAL, { r1: 0.38, seg: 12 });
  b.cyl(0.42, 0.1, [0, 0.42, 0], CORAL_DARK, { seg: 12 });
  b.cyl(0.36, 0.02, [0, 0.475, 0], SOIL, { seg: 12 });

  // the stalk and the leaves, each a wide plate with a smaller tip, lifted at the far end
  b.box([0.13, NECK_Y - 0.46, 0.13], [0, (NECK_Y + 0.46) / 2, 0], STALK);
  const leaf = (s: number, y: number, z: number, yaw: number): void => {
    const c = Math.cos(yaw);
    const n = Math.sin(yaw);
    const at = (d: number, up: number): readonly [number, number, number] => [s * d * c, y + up, z - s * d * n];
    b.box([0.32, 0.06, 0.34], at(0.21, 0.05), LEAF, [0, s * yaw, s * 0.35]);
    b.box([0.17, 0.06, 0.2], at(0.42, 0.13), LEAF, [0, s * yaw, s * 0.35]);
    b.box([0.42, 0.02, 0.05], at(0.27, 0.11), LEAF_DARK, [0, s * yaw, s * 0.35]);
  };
  leaf(-1, 0.8, 0.02, 0.25);
  leaf(1, 1.08, -0.02, -0.2);
  leaf(-1, 1.4, 0, -0.3);

  // the knob the wire hangs from
  b.box([0.1, 0.1, 0.1], [0, 0.62, 0.09], MUSTARD);

  // the head: it turns to the sun about Y and lifts about X, its face along local +Z
  const yawG = new THREE.Group();
  yawG.position.set(0, NECK_Y, 0);
  const tiltG = new THREE.Group();
  yawG.add(tiltG);
  b.root.add(yawG);
  const h = new Build(skin, 'sunflower-head');
  tiltG.add(h.root);
  const flat = { rot: [HP, 0, 0] as const, seg: 20 };
  h.box([0.12, 0.12, 0.2], [0, 0, -0.1], STALK);
  h.cyl(0.42, 0.08, [0, 0, 0.02], LEAF_DARK, flat);
  for (let i = 0; i < PETALS; i++) {
    const a = (i / PETALS) * TAU;
    const n = a + TAU / PETALS / 2;
    h.box([0.21, 0.34, 0.05], [Math.sin(n) * 0.46, Math.cos(n) * 0.46, 0.03], MUSTARD, [0, 0, -n]);
    h.box([0.2, 0.32, 0.06], [Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.07], WARM, [0, 0, -a]);
    h.box([0.1, 0.1, 0.06], [Math.sin(a) * 0.68, Math.cos(a) * 0.68, 0.07], WARM, [0, 0, -a]);
  }
  h.cyl(0.41, 0.08, [0, 0, 0.1], SEEDS, flat);
  h.cyl(0.35, 0.03, [0, 0, 0.145], CHARCOAL, flat);
  // the panel's cells: a 4×4 grid without its corners, the charcoal showing between them
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i === 0 || i === 3) && (j === 0 || j === 3)) continue;
      h.box([0.145, 0.145, 0.03], [-0.24 + i * 0.16, -0.24 + j * 0.16, 0.165], (i + j) % 2 ? SOLAR_BLUE : SOLAR_BLUE_LIGHT);
    }
  }
  h.finish();
  b.finish();

  const bulb = powerBulb(skin, b.root, [0, 0.24, 0.35]);
  finishShadows(root);
  let t = 0;
  let yaw = 0;
  let tilt = DROOP;
  return {
    root,
    socket: new THREE.Vector3(0, 0.66, 0.1),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const up = pw ? pw.sunUp : 0;
      if (pw && up > 0.03) {
        const target = pw.sunYaw - root.rotation.y;
        const d = ((((target - yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
        yaw += d * Math.min(1, dt * 2.2);
      }
      const day = smooth(0.02, 0.15, up);
      const want = DROOP + (-(0.2 + 0.75 * up) - DROOP) * day;
      tilt += (want - tilt) * Math.min(1, dt * 1.6);
      yawG.rotation.y = yaw;
      tiltG.rotation.x = tilt;
      tiltG.rotation.z = Math.sin(t * 0.9) * 0.03;
    },
  };
}
