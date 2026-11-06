/**
 * The wicker chair: Бабуся's round woven chair with its tall arched back and lime cushions, made to
 * fit one block, standing on two curved wooden rockers of its own. Standing still at it the hero sits
 * down and it rocks with `swing[0]`, the hero tilting with it; the seat rides on the rocking part.
 * No power, no solid cells. Origin at the floor centre, front towards +Z.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { createWickerChair } from './babusia';
import type { BuildingModel } from './buildings';
import { Kit } from './parts/kit';
import { WOODL, WOODL_D, finishShadows } from './villages';

/** The chair as Бабуся has it is 1.5 across; here it fits its one block. */
const SCALE = 0.66;
/** What the rockers lift it by, how far they reach front and back, how far apart they are. */
const LIFT = 0.09;
const RAIL = 0.47;
const RAIL_X = 0.27;
const STEPS = 6;

/** A rocker's middle line at z: touching the ground under the chair, curving up to both ends. */
const railY = (z: number): number => 0.03 + z * z * 0.32;

export function createWickerchair(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'wickerchair';
  const rocker = new THREE.Group();
  root.add(rocker);

  const p = new Kit('wickerchair', skin).part('rockers', rocker);
  for (const s of [-1, 1]) {
    for (let i = 0; i < STEPS; i++) {
      const z0 = -RAIL + (i / STEPS) * RAIL * 2;
      const z1 = -RAIL + ((i + 1) / STEPS) * RAIL * 2;
      p.beam([s * RAIL_X, railY(z0), z0], [s * RAIL_X, railY(z1), z1], 0.06, i % 2 ? WOODL : WOODL_D, 0.08);
    }
    for (const z of [-0.24, 0.24]) p.box([0.08, 0.06, 0.08], [s * RAIL_X, 0.07, z], WOODL_D);
  }
  p.done();

  const chair = createWickerChair(skin);
  chair.root.scale.setScalar(SCALE);
  chair.root.position.y = LIFT;
  rocker.add(chair.root);

  finishShadows(root);
  return {
    root,
    seats: [chair.seat],
    update(_dt, k) {
      // the system tilts the sitter by −swing about X; the chair goes with them
      rocker.rotation.x = -(k.swing?.[0] ?? 0);
    },
  };
}
