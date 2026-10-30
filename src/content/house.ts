/**
 * The heroes' house (DESIGN.md «Home»): 13×9 blocks, log corners, plank walls, glass windows, a
 * cobble rim and an open doorway in the middle of the front (+Z) wall. Inside, left to right:
 * the bedroom (a bunk bed for the boys, Соломія's bed, Пупся's cushion by the aquarium, a red
 * rug), the treasure cabinet with the chest in front of it on the back wall, and the kitchen
 * (counter, sink, stove with a pot, fridge, a table with four chairs) on a checked floor.
 * The roof is a separate model so the game can fade it while a hero is inside. Everything soft or
 * alive (beds, cushion, kitchen, cabinet, aquarium, door) is props built by systems/house.ts, not
 * blocks: only the shell, the floor and the lantern are written into the world.
 *
 *   dy=0  floor layer (feet stand at dy=1)
 *   dy=1..3  walls; interior written as AIR so terrain never pokes in
 *   roof model sits on y=4
 *
 * HOUSE_VERSION grows whenever the blueprint changes: an older house in a save is pulled down
 * and this one put up around the same centre (systems/house.ts).
 */
import * as THREE from 'three';
import type { HouseBlueprint, Skin, StructureBlock } from '../contracts';
import { BUNK_OUT } from '../assets/home';
import { Kit } from '../assets/parts/kit';
import { B } from '../world/blocks';

/** 1: the first 9×7 house; 2: the big house with the kitchen (2026-10-30). */
export const HOUSE_VERSION = 2;

const SX = 13;
const SZ = 9;
const WALL_TOP = 4;
/** The doorway's cell in the front wall. */
const DOOR_X = 6;

/** Glass cells of the walls (y = 2): [x, z]. */
const WINDOWS: [number, number][] = [
  // front: bedroom and kitchen
  [2, SZ - 1],
  [3, SZ - 1],
  [9, SZ - 1],
  [10, SZ - 1],
  // back: over the beds and over the sink
  [2, 0],
  [3, 0],
  [9, 0],
  // sides
  [0, 4],
  [SX - 1, 3],
];

/**
 * Where the furniture stands, relative to the origin (x/z of its floor centre; models face +Z
 * unless said). Kept here so the debug view, the wake ritual and the house system agree.
 */
export const HOME = {
  /** The boys' bunk bed: Льоша on top (head towards -Z), Давид in the bed slid out below (assets/home.ts BUNK_OUT). */
  bunk: { dx: 1.62, dz: 2 },
  /** Height of the lower and the upper sheet above the floor. */
  bunkLow: 0.75,
  bunkTop: 1.85,
  /** The treasure stand against the back wall (3 wide, two steps deep). */
  shelf: { dx: 6.5, dz: 1.44 },
  /** The kitchen along the back wall (cells x 8..11): counter + sink, stove, fridge. */
  kitchen: { dx: 10, dz: 1.35 },
  /** The table and its four chairs (the last chair, with a cushion, is Пупся's). */
  table: { dx: 9.5, dz: 4.7 },
  /** Пупся's aquarium against the left wall, by her cushion. */
  aquarium: { dx: 1.45, dz: 5.55 },
  /** The house lamp (the one real light). */
  lamp: { dx: 6.5, dy: 2.9, dz: 3.6 },
} as const;

function blocks(): StructureBlock[] {
  const out: StructureBlock[] = [];
  const put = (dx: number, dy: number, dz: number, id: number) => out.push({ dx, dy, dz, id });
  const edgeX = (x: number) => x === 0 || x === SX - 1;
  const edgeZ = (z: number) => z === 0 || z === SZ - 1;
  const glass = new Set(WINDOWS.map(([x, z]) => `${x},${z}`));

  for (let x = 0; x < SX; x++) {
    for (let z = 0; z < SZ; z++) {
      const rim = edgeX(x) || edgeZ(z);
      const rug = x >= 2 && x <= 3 && z >= 4 && z <= 6;
      const tiles = x >= 8 && x <= 11 && z >= 1 && z <= 7;
      put(x, 0, z, rim ? B.COBBLE : rug ? B.RED : tiles ? ((x + z) % 2 ? B.WHITE : B.YELLOW) : B.PLANKS);
      for (let y = 1; y < WALL_TOP; y++) {
        if (!rim) {
          put(x, y, z, B.AIR);
          continue;
        }
        const corner = edgeX(x) && edgeZ(z);
        const door = z === SZ - 1 && x === DOOR_X && y <= 2;
        const window = y === 2 && glass.has(`${x},${z}`);
        put(x, y, z, corner ? B.LOG : door ? B.AIR : window ? B.GLASS : B.PLANKS);
      }
    }
  }
  // the lantern by Соломія's bed (overrides the interior AIR written above)
  const b = out.find((o) => o.dx === 4 && o.dy === 1 && o.dz === 1);
  if (b) b.id = B.LANTERN;
  return out;
}

/**
 * Stepped gable roof, ridge along X over the middle, eaves overhanging 0.5,
 * tile-red tops with darker risers, plank gable ends and a brick chimney over the stove.
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
  const STEPS = SZ + 1;
  const RUN = 0.5;
  const RISE = 0.34;
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
  // the chimney, straight over the stove
  const k = HOME.kitchen;
  p.box([0.8, 2.6, 0.8], [k.dx + 0.5, 1.0 + 1.3, 1.6], BRICK);
  p.box([0.96, 0.16, 0.96], [k.dx + 0.5, 3.68, 1.6], DARK);
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

/** Outer face centres of the window panes (dy = 2.5) and their outward normals. */
export function houseWindows(): { dx: number; dy: number; dz: number; n: [number, number, number] }[] {
  return WINDOWS.map(([x, z]) => {
    if (z === SZ - 1) return { dx: x + 0.5, dy: 2.5, dz: SZ, n: [0, 0, 1] as [number, number, number] };
    if (z === 0) return { dx: x + 0.5, dy: 2.5, dz: 0, n: [0, 0, -1] as [number, number, number] };
    if (x === 0) return { dx: 0, dy: 2.5, dz: z + 0.5, n: [-1, 0, 0] as [number, number, number] };
    return { dx: SX, dy: 2.5, dz: z + 0.5, n: [1, 0, 0] as [number, number, number] };
  });
}

export const HOUSE: HouseBlueprint = {
  sizeX: SX,
  sizeZ: SZ,
  blocks: blocks(),
  createRoof,
  wakeSpot: { dx: DOOR_X + 0.5, dy: 1, dz: 5.4 },
  chestSpot: { dx: HOME.shelf.dx, dy: 1, dz: 2.55 },
  campfireSpot: { dx: DOOR_X + 0.5, dy: 1, dz: SZ + 2.5 },
  // the boys in the bunk bed (Льоша on top, Давид in the bed slid out below), Соломія next to it, Пупся on her cushion by the fish
  sleepSpots: {
    lyosha: { dx: HOME.bunk.dx, dy: 1 + HOME.bunkTop, dz: HOME.bunk.dz, yaw: 0 },
    david: { dx: HOME.bunk.dx, dy: 1 + HOME.bunkLow, dz: HOME.bunk.dz + BUNK_OUT, yaw: 0 },
    solomiia: { dx: 3.05, dy: 1.75, dz: 2, yaw: 0 },
    pupsia: { dx: 2.9, dy: 1.17, dz: 5.6, yaw: -1.1 },
  },
  // in the doorway of the front wall, hinge on the left, swings out
  doorSpot: { dx: DOOR_X + 0.04, dy: 1, dz: SZ - 0.14, yaw: 0 },
  interior: { x0: 1, z0: 1, x1: SX - 1, z1: SZ - 1 },
};

/** The doorway's middle (x) and the front wall's outer face (z), relative to the origin. */
export const DOOR = { dx: DOOR_X + 0.5, dz: SZ };

/** Footprints of every house version so far ([x, z]); an old one is pulled down by its own size. */
export const HOUSE_SIZES: Record<number, [number, number]> = { 1: [9, 7], 2: [SX, SZ] };

/**
 * Where the current house stands when it replaces an older one: around the same centre, on the
 * same floor height (a new game puts it up the same way around the spawn).
 */
export function rehousedOrigin(old: [number, number, number], oldV: number): [number, number, number] {
  const [ox, oz] = HOUSE_SIZES[oldV] ?? HOUSE_SIZES[1];
  return [old[0] + Math.floor(ox / 2) - Math.floor(SX / 2), old[1], old[2] + Math.floor(oz / 2) - Math.floor(SZ / 2)];
}
