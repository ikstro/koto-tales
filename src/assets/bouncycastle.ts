/**
 * The bouncy castle: a puffy toy of smooth fat lobes in coral and mustard. Four fat corner towers of
 * stacked coral rings with low round mustard domes and small teal flags, a tall back wall and low side walls of
 * sausages with round battlements, the front left open, a thin quilted cream-and-mint mat in the
 * middle (at most 0.12 high, since heroes stand on the ground there). A small charcoal blower by the
 * entry carries the power bulb and blows it up through a hose; without power the whole castle sags
 * down, fed it stands and breathes. `k.bounce` squashes the mat and makes the castle jiggle on a
 * small spring. Origin at the floor centre of the 3×3 footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL_DARK, TEAL, powerBulb } from './buildingParts';
import { Build, HP, finishShadows, mergeCached, place, tint } from './villages';

const TOWER = 1.11;
const WALL = 1.1;
const LOBE = 0.38;
const CORAL_SOFT = '#ec6b50';
const MUSTARD_DARK = '#d29a1e';

/** Fully blown up / sagging: the body's height. */
const SAG = 0.52;

const ball = (r: number, at: readonly [number, number, number], hex: string, squash = 1): THREE.BufferGeometry =>
  tint(place(new THREE.SphereGeometry(r, 16, 10), at, { s: [1, squash, 1] }), hex);

/** A sausage of length `len` along x (or z) at `at`. */
const sausage = (r: number, len: number, at: readonly [number, number, number], hex: string, alongZ = false): THREE.BufferGeometry =>
  tint(place(new THREE.CapsuleGeometry(r, len, 5, 12), at, { rot: alongZ ? [HP, 0, 0] : [0, 0, HP] }), hex);

/** All the puffy parts, smooth-shaded, one mesh. */
function puffs(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * TOWER;
      const z = sz * TOWER;
      [0.24, 0.62, 1.0].forEach((y, i) => g.push(ball(LOBE - 0.015, [x, y, z], i % 2 ? CORAL_SOFT : CORAL, 0.62)));
      // a wide collar, a mustard ring and a low plain dome (no ball on top: it must read as a turret, not a cap)
      g.push(ball(LOBE + 0.03, [x, 1.38, z], CORAL, 0.6));
      g.push(ball(0.31, [x, 1.62, z], MUSTARD_DARK, 0.45));
      g.push(ball(0.3, [x, 1.76, z], MUSTARD, 0.92));
    }
  }
  // the back wall: three sausages and a row of round battlements
  const back = -WALL;
  [0.22, 0.6].forEach((y) => g.push(sausage(0.22, 1.32, [0, y, back], CORAL)));
  g.push(sausage(0.2, 1.36, [0, 0.96, back], MUSTARD));
  for (const x of [-0.54, -0.18, 0.18, 0.54]) g.push(ball(0.15, [x, 1.25, back], CORAL_SOFT, 1.1));
  // the side walls: two sausages, smaller battlements
  for (const sx of [-1, 1]) {
    const x = sx * WALL;
    g.push(sausage(0.21, 1.32, [x, 0.21, 0], CORAL, true));
    g.push(sausage(0.18, 1.36, [x, 0.55, 0], MUSTARD, true));
    for (const z of [-0.5, 0, 0.5]) g.push(ball(0.13, [x, 0.8, z], CORAL_SOFT, 1.1));
  }
  // a soft low lip across the entry
  g.push(sausage(0.085, 1.26, [0, 0.085, 1.16], MUSTARD));
  return mergeCached('bouncycastle/puffs', g);
}

/** The mat's pillows, 4×4, at most 0.12 high. */
function pillows(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  const n = 4;
  const s = 1.84 / n;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const x = -0.92 + (i + 0.5) * s;
      const z = -0.92 + (k + 0.5) * s;
      g.push(tint(place(new RoundedBoxGeometry(s - 0.03, 0.09, s - 0.03, 3, 0.044), [x, 0.075, z]), (i + k) % 2 ? MINT : CREAM));
    }
  }
  return mergeCached('bouncycastle/pillows', g);
}

export function createBouncycastle(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'bouncycastle';

  // the ground sheet, the blower and its hose never sag
  const b = new Build(skin, 'bouncycastle');
  root.add(b.root);
  b.box([2.9, 0.03, 2.86], [0, 0.015, 0], CORAL_DARK);
  b.box([0.34, 0.3, 0.26], [0.42, 0.15, 1.34], CHARCOAL);
  b.box([0.38, 0.05, 0.3], [0.42, 0.325, 1.34], MUSTARD);
  b.beam([0.58, 0.1, 1.34], [0.8, 0.12, 1.3], 0.08, STEEL_DARK);
  b.finish();

  // the body: everything that blows up
  const body = new THREE.Group();
  root.add(body);
  const f = new Build(skin, 'bouncycastle-flags');
  body.add(f.root);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * TOWER;
      const z = sz * TOWER;
      f.box([0.04, 0.46, 0.04], [x, 2.22, z], CREAM);
      f.box([0.28, 0.16, 0.03], [x + 0.16, 2.36, z], TEAL);
      f.box([0.13, 0.08, 0.03], [x + 0.35, 2.36, z], TEAL);
    }
  }
  f.finish();
  const plastic = b.kit.vertexColourMaterial(false);
  const puffy = new THREE.Mesh(puffs(), plastic);
  puffy.castShadow = true;
  body.add(puffy);

  const mat = new THREE.Mesh(pillows(), plastic);
  root.add(mat);

  const bulb = powerBulb(skin, root, [0.42, 0.17, 1.47]);
  finishShadows(root);

  let t = 0;
  let air = 1;
  let x = 0;
  let v = 0;
  return {
    root,
    socket: new THREE.Vector3(0.42, 0.35, 1.34),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      air += ((on ? 1 : 0) - air) * Math.min(1, dt * (on ? 1.6 : 0.7));
      // the mat follows the press and rings on a soft spring
      const target = Math.min(1, Math.max(0, k.bounce ?? 0));
      const steps = Math.min(40, Math.max(1, Math.ceil(dt / 0.012)));
      const h = Math.min(dt, 0.5) / steps;
      for (let s = 0; s < steps; s++) {
        v += (220 * (target - x) - 11 * v) * h;
        x += v * h;
      }
      const d = Math.max(-0.3, Math.min(1.2, x));
      const breathe = on ? 0.008 * Math.sin(t * 2.2) : 0;
      const height = (SAG + (1 - SAG) * air) * (1 - 0.07 * d) + breathe;
      const wide = 1 + 0.03 * (1 - air) + 0.025 * d - breathe;
      body.scale.set(wide, height, wide);
      mat.scale.set(1 + 0.03 * d, 1 - 0.55 * Math.max(0, d), 1 + 0.03 * d);
    },
  };
}
