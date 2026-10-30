/**
 * The heroes' house: 9×7 blocks, log corners, plank walls, glass windows, a
 * cobble-rimmed plank floor with a red rug, a bed, a lantern and an open
 * doorway in the middle of the front (+Z) wall. The roof is a separate model
 * so the game can fade it while a hero is inside. Soft furniture (Соломія's
 * bed, the bedding, Пупся's cushion) and the door are props, not blocks, so
 * houses already written into old saves get them too (see systems/house.ts).
 *
 *   dy=0  floor layer (feet stand at dy=1)
 *   dy=1..3  walls; interior written as AIR so terrain never pokes in
 *   roof model sits on y=4
 */
import * as THREE from 'three';
import type { HouseBlueprint, Skin, StructureBlock } from '../contracts';
import { Kit } from '../assets/parts/kit';
import { B } from '../world/blocks';

const SX = 9;
const SZ = 7;
const WALL_TOP = 4;

function blocks(): StructureBlock[] {
  const out: StructureBlock[] = [];
  const put = (dx: number, dy: number, dz: number, id: number) => out.push({ dx, dy, dz, id });
  const edgeX = (x: number) => x === 0 || x === SX - 1;
  const edgeZ = (z: number) => z === 0 || z === SZ - 1;

  for (let x = 0; x < SX; x++) {
    for (let z = 0; z < SZ; z++) {
      const rim = edgeX(x) || edgeZ(z);
      const rug = x >= 3 && x <= 5 && z >= 3 && z <= 4;
      put(x, 0, z, rim ? B.COBBLE : rug ? B.RED : B.PLANKS);
      for (let y = 1; y < WALL_TOP; y++) {
        if (!rim) {
          put(x, y, z, B.AIR);
          continue;
        }
        const corner = edgeX(x) && edgeZ(z);
        const door = z === SZ - 1 && x === 4 && y <= 2;
        const window =
          y === 2 &&
          ((z === 0 && (x === 2 || x === 3 || x === 5 || x === 6)) ||
            (edgeX(x) && z === 3) ||
            (z === SZ - 1 && (x === 2 || x === 6)));
        put(x, y, z, corner ? B.LOG : door ? B.AIR : window ? B.GLASS : B.PLANKS);
      }
    }
  }
  // furniture (overrides the interior AIR written above)
  const set = (dx: number, dy: number, dz: number, id: number) => {
    const b = out.find((o) => o.dx === dx && o.dy === dy && o.dz === dz);
    if (b) b.id = id;
    else put(dx, dy, dz, id);
  };
  set(1, 1, 1, B.BED);
  set(1, 1, 2, B.BED);
  set(7, 1, 1, B.LANTERN);
  return out;
}

/**
 * Stepped gable roof, ridge along X over z = 3.5, eaves overhanging 0.5,
 * tile-red tops with darker risers, plank gable ends and a brick chimney.
 * Materials are the roof's own clones (transparent-capable, but starting
 * fully opaque with depthWrite on), so fading them touches nothing else:
 * set `material.opacity = k` on each mesh, and `depthWrite = k > 0.99`.
 */
function createRoof(skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roof';
  g.position.y = WALL_TOP;
  const TILE = { c: '#c8432f', clear: true };
  const DARK = { c: '#8e2c1f', clear: true };
  const GABLE = { c: '#c19a5b', clear: true };
  const BRICK = { c: '#b5523b', clear: true };
  const STEPS = 8;
  const RUN = 0.5;
  const RISE = 0.36;
  const x0 = -0.5;
  const x1 = SX + 0.5;
  const cz = SZ / 2;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const p = new Kit('house-roof', skin).part('roof', g);
  for (let i = 0; i < STEPS; i++) {
    const half = SZ / 2 + 0.5 - i * RUN;
    const y = i * RISE + RISE / 2;
    p.box([len, RISE, half * 2], [cx, y, cz], TILE);
    // darker riser strips on both slopes
    p.box([len + 0.01, RISE * 0.45, 0.02], [cx, y - RISE * 0.27, cz + half + 0.01], DARK);
    p.box([len + 0.01, RISE * 0.45, 0.02], [cx, y - RISE * 0.27, cz - half - 0.01], DARK);
    // plank gable ends, inset from the sloped edge
    const gw = half * 2 - 1;
    if (gw > 0) {
      p.box([0.02, RISE, gw], [x0 + 0.49, y, cz], GABLE);
      p.box([0.02, RISE, gw], [x1 - 0.49, y, cz], GABLE);
    }
  }
  const top = STEPS * RISE;
  p.box([len + 0.1, 0.14, 0.62], [cx, top + 0.07, cz], DARK);
  // chimney
  p.box([0.7, 2.4, 0.7], [6.5, 1.0 + 1.2, 1.8], BRICK);
  p.box([0.86, 0.16, 0.86], [6.5, 3.48, 1.8], DARK);
  p.done();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = (m.material as THREE.Material).clone();
      mat.transparent = true;
      mat.opacity = 1;
      mat.depthWrite = true;
      m.material = mat;
      m.receiveShadow = true;
    }
  });
  return g;
}

export const HOUSE: HouseBlueprint = {
  sizeX: SX,
  sizeZ: SZ,
  blocks: blocks(),
  createRoof,
  wakeSpot: { dx: 2.5, dy: 1, dz: 2.5 },
  chestSpot: { dx: 4.5, dy: 1, dz: 1.5 },
  campfireSpot: { dx: 4.5, dy: 1, dz: 9.5 },
  // Льоша on the BED block (top at dy=2), Соломія on a prop bed under the right
  // window next to the lantern, Пупся on her round cushion on the rug.
  sleepSpots: {
    lyosha: { dx: 1.5, dy: 2, dz: 2, yaw: 0 },
    solomiia: { dx: 7.5, dy: 1.75, dz: 3, yaw: 0 },
    pupsia: { dx: 4.5, dy: 1.17, dz: 3.6, yaw: 0.55 },
    david: { dx: 2.7, dy: 1.75, dz: 2, yaw: 0 },
  },
  // in the doorway (x 4..5) of the front wall, hinge on the left, swings out
  doorSpot: { dx: 4.04, dy: 1, dz: 6.86, yaw: 0 },
  interior: { x0: 1, z0: 1, x1: 8, z1: 6 },
};
