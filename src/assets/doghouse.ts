/**
 * Будка: Сірко's kennel — a warm wooden house with a coral roof like the big
 * house, a dark doorway in a cream rim, a little paw print above it and a food
 * bowl by the door. Still; the dog itself is the life around it.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { CORAL, CORAL_DARK, CREAM, INK, WOOD, WOOD_DARK } from './buildingParts';
import type { BuildingModel } from './buildings';
import { Kit } from './parts/kit';

export function createDoghouse(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'doghouse';
  const p = new Kit('doghouse', skin).part('doghouse', root);
  // a base plate and wooden walls with plank lines and corner studs
  p.box([0.94, 0.06, 0.94], [0, 0.03, 0], WOOD_DARK);
  p.box([0.84, 0.52, 0.84], [0, 0.32, -0.02], WOOD);
  for (const y of [0.16, 0.36]) p.box([0.86, 0.02, 0.86], [0, y, -0.02], WOOD_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.07, 0.56, 0.07], [sx * 0.42, 0.3, -0.02 + sz * 0.42], WOOD_DARK);
  // the dark doorway in a cream rim
  p.box([0.4, 0.36, 0.06], [0, 0.26, 0.36], INK);
  p.box([0.48, 0.05, 0.05], [0, 0.07, 0.38], CREAM);
  p.box([0.05, 0.42, 0.05], [-0.235, 0.26, 0.38], CREAM);
  p.box([0.05, 0.42, 0.05], [0.235, 0.26, 0.38], CREAM);
  // the paw print above the doorway: three toes and a pad, nothing to read
  p.box([0.11, 0.02, 0.11], [0, 0.48, 0.395], CREAM);
  for (const dx of [-0.08, 0, 0.08]) p.box([0.05, 0.02, 0.05], [dx, 0.545, 0.395], CREAM);
  // the coral roof: two slopes and a ridge cap, like the big house
  const slope = Math.atan2(0.3, 0.5);
  const L = Math.hypot(0.5, 0.3);
  p.box([L + 0.12, 0.08, 1.0], [-0.24, 0.72, -0.02], CORAL, [0, 0, slope]);
  p.box([L + 0.12, 0.08, 1.0], [0.24, 0.72, -0.02], CORAL, [0, 0, -slope]);
  p.box([0.18, 0.12, 1.04], [0, 0.86, -0.02], CORAL_DARK);
  // the food bowl by the door
  p.box([0.22, 0.06, 0.22], [0.33, 0.06, 0.3], CREAM);
  p.box([0.16, 0.03, 0.16], [0.33, 0.095, 0.3], INK);
  p.done();
  return { root, update: () => {} };
}
