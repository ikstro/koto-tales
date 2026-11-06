/**
 * The flower bed: a low wooden frame with corner posts round dark soil, four rows of daisies and
 * poppies by turns on low green mounds, and a small mustard watering can left in the front corner.
 * The rows lean gently one after another, as if a breeze went over them, a little more when music is
 * near. No power, no solid cells: heroes wade through. Origin at the floor centre of the 2×2
 * footprint, front towards +Z.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { createFlowerField } from './babusia';
import type { BuildingModel } from './buildings';
import { MUSTARD, STEEL_DARK } from './buildingParts';
import { Build, LEAF, LEAF_D, WOODL, WOODL_D, finishShadows } from './villages';

const SOIL = '#5b4026';
const SOIL_D = '#4a3320';
const MUSTARD_DARK = '#c98f1c';

const SIZE = 1.96;
const BOARD = 0.13;
const SOIL_Y = 0.16;
const ROWS = [-0.62, -0.2, 0.22, 0.64];
const ACROSS = [-0.66, -0.33, 0, 0.33, 0.66];
/** The field's flowers are big; in a bed they stand smaller, so the rows show. */
const PLANT = 0.72;
/** The front right corner is the watering can's. */
const CAN: readonly [number, number] = [0.62, 0.64];

export function createFlowerbed(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'flowerbed';
  const b = new Build(skin, 'flowerbed');
  root.add(b.root);

  // the soil and its frame
  b.box([SIZE - 0.1, SOIL_Y - 0.03, SIZE - 0.1], [0, (SOIL_Y + 0.03) / 2, 0], SOIL);
  const rim = (SIZE - BOARD) / 2;
  for (const s of [-1, 1]) {
    b.box([SIZE, 0.2, BOARD], [0, 0.1, s * rim], WOODL);
    b.box([BOARD, 0.2, SIZE], [s * rim, 0.1, 0], WOODL);
    b.box([SIZE, 0.03, BOARD + 0.02], [0, 0.205, s * rim], WOODL_D);
    b.box([BOARD + 0.02, 0.03, SIZE], [s * rim, 0.205, 0], WOODL_D);
    for (const u of [-1, 1]) b.box([0.2, 0.28, 0.2], [s * (SIZE / 2 - 0.1), 0.14, u * (SIZE / 2 - 0.1)], WOODL_D);
  }
  // furrows between the rows, a low green mound under each
  for (const z of [-0.41, 0.01, 0.43]) b.box([1.66, 0.02, 0.1], [0, SOIL_Y + 0.002, z], SOIL_D);
  ROWS.forEach((z, i) => {
    const front = i === ROWS.length - 1;
    b.box([front ? 1.2 : 1.66, 0.06, 0.26], [front ? -0.23 : 0, SOIL_Y + 0.02, z], i % 2 ? LEAF : LEAF_D);
  });

  // the watering can
  const [cx, cz] = CAN;
  const y = SOIL_Y;
  b.cyl(0.11, 0.2, [cx, y + 0.1, cz], MUSTARD, { seg: 14 });
  b.cyl(0.115, 0.03, [cx, y + 0.19, cz], MUSTARD_DARK, { seg: 14 });
  b.cyl(0.085, 0.012, [cx, y + 0.206, cz], STEEL_DARK, { seg: 14 });
  b.beam([cx - 0.08, y + 0.08, cz], [cx - 0.28, y + 0.25, cz], 0.05, MUSTARD);
  b.cyl(0.04, 0.05, [cx - 0.29, y + 0.265, cz], MUSTARD_DARK, { rot: [0, 0, 0.87], r1: 0.07, seg: 10 });
  b.beam([cx + 0.1, y + 0.17, cz], [cx + 0.16, y + 0.17, cz], 0.03, MUSTARD_DARK);
  b.beam([cx + 0.16, y + 0.17, cz], [cx + 0.15, y + 0.28, cz], 0.03, MUSTARD_DARK);
  b.beam([cx + 0.15, y + 0.28, cz], [cx, y + 0.28, cz], 0.03, MUSTARD_DARK);
  b.beam([cx, y + 0.28, cz], [cx, y + 0.2, cz], 0.03, MUSTARD_DARK);
  b.finish();

  // the rows: each one mesh, leaned by a shear, so its stems stay in the soil
  const rows = ROWS.map((z, i) => {
    const front = i === ROWS.length - 1;
    const spots = ACROSS.filter((x) => !front || x < 0.3).map((x, n) => ({
      x: (x + (i % 2 ? 0.05 : -0.05)) / PLANT,
      y: 0,
      z: (z + (n % 2 ? 0.04 : -0.04)) / PLANT,
      kind: (i % 2) as 0 | 1,
    }));
    const row = createFlowerField(skin, spots);
    row.matrixAutoUpdate = false;
    row.matrix.makeScale(PLANT, PLANT, PLANT).setPosition(0, SOIL_Y, 0);
    row.traverse((o) => {
      o.castShadow = true;
    });
    root.add(row);
    return row;
  });

  finishShadows(root);
  let t = 0;
  let wind = 0.1;
  return {
    root,
    update(dt, k) {
      t += dt;
      wind += ((k.playing ? 0.17 : 0.1) - wind) * Math.min(1, dt * 2);
      for (let i = 0; i < rows.length; i++) {
        const m = rows[i].matrix.elements;
        // x and z move with the height: elements 4 and 6 are the shear of the y column
        m[4] = PLANT * wind * Math.sin(t * 1.3 + i * 0.9);
        m[6] = PLANT * wind * 0.5 * Math.sin(t * 0.9 + i * 1.4);
        rows[i].matrixWorldNeedsUpdate = true;
      }
    },
  };
}
