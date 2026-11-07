/**
 * The heroes' house (DESIGN.md «Home»): 19×11 blocks, one floor (a second one would hide the first
 * from the steep camera), log corners, plank walls, glass windows, a cobble rim and an open doorway
 * in the middle of the front (+Z) wall. Inside, left to right: the playroom (cells x 1..6, on a
 * blue and yellow mat: the slide tower and the ball pit, the TV, a toy rug, chess, an easel; its
 * toys are systems/playroom.ts), the bedroom (a bunk bed for the boys, Соломія's bed, Пупся's
 * cushion by the aquarium, a red rug), the treasure cabinet with the chest in front of it on the
 * back wall, and the kitchen (counter, sink, stove with a pot, fridge, a table with four chairs)
 * on a checked floor. The roof is a separate model so the game can fade it while a hero is
 * inside. Everything soft or alive (beds, cushion, kitchen, cabinet, aquarium, door, toys) is props,
 * not blocks: only the shell, the floor and the lantern are written into the world.
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

/** 1: the first 9×7 house; 2: the big house with the kitchen (2026-10-30); 3: 19×11 with the playroom (2026-11-07). */
export const HOUSE_VERSION = 3;

const SX = 19;
const SZ = 11;
const WALL_TOP = 4;
/** The doorway's cell in the front wall (the middle). */
const DOOR_X = 9;
/** The doorway's middle (x) and the front wall's outer face (z): the yard is laid out from here. */
const DX = DOOR_X + 0.5;
/** How far the bedroom, the cabinet and the kitchen moved right when the playroom came (v2 → v3). */
const ROOMS = 6;
/** The playroom's cells (x), left of the bedroom. */
const PLAY_X: [number, number] = [1, ROOMS];

/** Glass cells of the walls (y = 2): [x, z]. */
const WINDOWS: [number, number][] = [
  // front, mirrored around the door: playroom, bedroom, by the cabinet, kitchen
  [2, SZ - 1],
  [3, SZ - 1],
  [6, SZ - 1],
  [7, SZ - 1],
  [11, SZ - 1],
  [12, SZ - 1],
  [15, SZ - 1],
  [16, SZ - 1],
  // back: behind the slide, over the beds and over the sink
  [2, 0],
  [3, 0],
  [2 + ROOMS, 0],
  [3 + ROOMS, 0],
  [9 + ROOMS, 0],
  // sides: by the ball pit, by the fridge
  [0, 5],
  [SX - 1, 3],
];

/**
 * Where the furniture stands, relative to the origin (x/z of its floor centre; models face +Z
 * unless said). Kept here so the debug view, the wake ritual and the house system agree.
 */
export const HOME = {
  /** The boys' bunk bed: Льоша on top (head towards -Z), Давид in the bed slid out below (assets/home.ts BUNK_OUT). */
  bunk: { dx: 1.62 + ROOMS, dz: 2 },
  /** Height of the lower and the upper sheet above the floor. */
  bunkLow: 0.75,
  bunkTop: 1.85,
  /** The treasure stand against the back wall (3 wide, two steps deep). */
  shelf: { dx: 6.5 + ROOMS, dz: 1.44 },
  /** The kitchen along the back wall (cells x 14..17): counter + sink, stove, fridge. */
  kitchen: { dx: 10 + ROOMS, dz: 1.35 },
  /** The table and its four chairs (the last chair, with a cushion, is Пупся's). */
  table: { dx: 9.5 + ROOMS, dz: 4.7 },
  /** Пупся's aquarium by her cushion, between the playroom and the bedroom, its glass towards the beds. */
  aquarium: { dx: 1.45 + ROOMS, dz: 5.55 },
  /** The house lamp (the one real light), in the middle of the rooms. */
  lamp: { dx: SX / 2, dy: 2.9, dz: 4.6 },
  /** The postbox in the yard, right of the door against the front wall, off the path to the campfire (systems/mail.ts). */
  postbox: { dx: DX + 2.9, dz: SZ + 0.75 },
  /**
   * The two logs to sit on by the campfire (DX, SZ + 2.5): one to its right, one in front of it,
   * each facing the fire (yaw turns the log's +Z front to it); the arch stands on its left, the door
   * path stays free. Guests at the fire come from `guestGate`, the yard's edge (systems/guests.ts).
   */
  fireLogs: [
    { dx: DX + 2.1, dz: SZ + 2.9, yaw: -Math.PI / 2 },
    { dx: DX + 0.1, dz: SZ + 4.6, yaw: Math.PI },
  ],
  guestGate: { dx: DX + 6.1, dz: SZ + 5.4 },
  /**
   * The playroom (the left part, cells x 1..6, z 1..9), where each toy stands, relative to the
   * origin. This file owns the values (the layout); systems/playroom.ts builds and runs the toys at
   * them. Footprints: the slide tower 2×2 (its floor centre; the chute runs +Z about 3 into the
   * ball pit), the ball pit 2.4×2.4, the chess table ~1.2 with a pouf left and right (±0.9 in x),
   * the easel 1×1, the toy rug 3×2, the TV ~1.4 wide against the back wall facing +Z.
   * The slide and the pit fill the back left corner, the rug lies before the TV, chess and the
   * easel stand towards the front, a free lane (x 3.5..4.3) runs from the door's side to the slide.
   */
  playroom: {
    slide: { dx: 2.2, dz: 2.1 },
    ballPit: { dx: 2.3, dz: 5.5 },
    chess: { dx: 5.0, dz: 7.1 },
    easel: { dx: 1.9, dz: 8.2 },
    toyRug: { dx: 5.0, dz: 3.4 },
    tv: { dx: 5.0, dz: 1.35 },
  },
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
      const rug = x >= 2 + ROOMS && x <= 3 + ROOMS && z >= 4 && z <= 6;
      const tiles = x >= 8 + ROOMS && x <= 11 + ROOMS && z >= 1 && z <= SZ - 2;
      // the playroom's mat: big blue and yellow squares, two cells each
      const mat = x >= PLAY_X[0] && x <= PLAY_X[1] && z >= 1 && z <= SZ - 2;
      const checked = (x + z) % 2 ? B.WHITE : B.YELLOW;
      const square = (Math.floor((x - 1) / 2) + Math.floor((z - 1) / 2)) % 2 ? B.YELLOW : B.BLUE;
      put(x, 0, z, rim ? B.COBBLE : mat ? square : rug ? B.RED : tiles ? checked : B.PLANKS);
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
  const b = out.find((o) => o.dx === 4 + ROOMS && o.dy === 1 && o.dz === 1);
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
  // in the bedroom by the rug, room for the helpers' little row behind (systems/heroes.ts, sleep.ts)
  wakeSpot: { dx: DX + 1.3, dy: 1, dz: 6 },
  chestSpot: { dx: HOME.shelf.dx, dy: 1, dz: 2.55 },
  campfireSpot: { dx: DX, dy: 1, dz: SZ + 2.5 },
  // the boys in the bunk bed (Льоша on top, Давид in the bed slid out below), Соломія next to it, Пупся on her cushion by the fish
  sleepSpots: {
    lyosha: { dx: HOME.bunk.dx, dy: 1 + HOME.bunkTop, dz: HOME.bunk.dz, yaw: 0 },
    david: { dx: HOME.bunk.dx, dy: 1 + HOME.bunkLow, dz: HOME.bunk.dz + BUNK_OUT, yaw: 0 },
    solomiia: { dx: 3.05 + ROOMS, dy: 1.75, dz: 2, yaw: 0 },
    pupsia: { dx: 2.9 + ROOMS, dy: 1.17, dz: 5.6, yaw: -1.1 },
  },
  // in the doorway of the front wall, hinge on the left, swings out
  doorSpot: { dx: DOOR_X + 0.04, dy: 1, dz: SZ - 0.14, yaw: 0 },
  interior: { x0: 1, z0: 1, x1: SX - 1, z1: SZ - 1 },
};

/** The doorway's middle (x) and the front wall's outer face (z), relative to the origin. */
export const DOOR = { dx: DX, dz: SZ };

/** Footprints of every house version so far ([x, z]); an old one is pulled down by its own size. */
export const HOUSE_SIZES: Record<number, [number, number]> = { 1: [9, 7], 2: [13, 9], 3: [SX, SZ] };

/**
 * Where the current house stands when it replaces an older one: around the same centre, on the
 * same floor height (a new game puts it up the same way around the spawn).
 */
export function rehousedOrigin(old: [number, number, number], oldV: number): [number, number, number] {
  const [ox, oz] = HOUSE_SIZES[oldV] ?? HOUSE_SIZES[1];
  return [old[0] + Math.floor(ox / 2) - Math.floor(SX / 2), old[1], old[2] + Math.floor(oz / 2) - Math.floor(SZ / 2)];
}
