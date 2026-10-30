/**
 * TODO({{id}}): the model of the «{{id}}» building (content/buildings.ts). Toy pieces in the skin's
 * plastic, origin at the floor centre of the footprint, front towards +Z; it animates itself from
 * `update`; glows are own emissive or additive, never lights. Nearest examples: food.ts, signal.ts.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CREAM, TEAL, powerBulb } from './buildingParts';
import { Kit } from './parts/kit';

export function create{{Id}}(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = '{{id}}';
  const p = new Kit('{{id}}', skin).part('{{id}}', root);
  p.box([1.6, 0.3, 1.6], [0, 0.15, 0], TEAL);
  p.box([1, 1, 1], [0, 0.8, 0], CREAM);
  p.done();
  void powerBulb;
  return {
    root,
    update() {},
  };
}
