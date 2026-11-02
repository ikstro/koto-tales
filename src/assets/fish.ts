/**
 * Рибка: the bait for «Шелохмаське чудовисько». A cheerful toy fish laid on a
 * little teal plate — orange body with a cream shine, forked tail, top fin, a
 * big eye — waiting on the shore until the lake monster comes for it. Still;
 * the splash is the monster's own.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { CHARCOAL, CREAM, MINT, TEAL } from './buildingParts';
import type { BuildingModel } from './buildings';
import { Kit } from './parts/kit';

const ORANGE = '#ff9138';
const ORANGE_DARK = '#e06a1e';

export function createFish(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'fish';
  const p = new Kit('fish', skin).part('fish', root);
  // a little teal plate with studs, like a saucer the fish was served on
  p.box([0.94, 0.06, 0.94], [0, 0.03, 0], TEAL);
  for (const [dx, dz] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]] as const) p.box([0.12, 0.03, 0.12], [dx, 0.065, dz], MINT);
  // the body, nose towards +Z: three slices of orange, the middle one widest
  p.box([0.34, 0.3, 0.3], [0, 0.28, 0.18], ORANGE);
  p.box([0.44, 0.38, 0.44], [0, 0.3, -0.08], ORANGE);
  p.box([0.36, 0.3, 0.22], [0, 0.28, -0.36], ORANGE_DARK);
  // a cream shine along the back and a pale belly
  p.box([0.2, 0.03, 0.5], [-0.08, 0.5, -0.06], CREAM);
  p.box([0.46, 0.16, 0.4], [0, 0.12, -0.08], CREAM);
  // the forked tail, two steps like toy fins
  p.box([0.08, 0.34, 0.2], [0, 0.44, -0.52], ORANGE);
  p.box([0.08, 0.22, 0.14], [0, 0.62, -0.6], ORANGE_DARK);
  // a fin on top and two little side fins
  p.box([0.1, 0.18, 0.24], [0, 0.56, -0.02], ORANGE_DARK);
  for (const s of [-1, 1]) p.box([0.06, 0.14, 0.2], [s * 0.26, 0.24, -0.06], ORANGE_DARK, [0, 0, s * 0.5]);
  // the big eye with a dark pupil, both sides
  for (const s of [-1, 1]) {
    p.box([0.03, 0.13, 0.13], [s * 0.23, 0.36, 0.16], CREAM);
    p.box([0.035, 0.06, 0.06], [s * 0.24, 0.36, 0.16], CHARCOAL);
  }
  // a smiling mouth line under the nose
  p.box([0.12, 0.03, 0.03], [0, 0.2, 0.34], CHARCOAL);
  p.done();
  return { root, update: () => {} };
}
