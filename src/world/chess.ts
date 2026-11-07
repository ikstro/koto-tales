/**
 * The chess kingdom's square (DESIGN.md «Chess kingdom»): one per world, 110–160 blocks from
 * home on dry flat land — a meadow first, else a forest or the hills — well away from the
 * villages and the castles, with no river or lake near (so no lighthouse or bridge either;
 * a world of rivers may leave a dry bank near, and the rare world with no such place there
 * looks 100–200 out).
 * Pure data from the seed (style-neutral); the terrain flattens and paves it (Terrain.sample),
 * systems/chess.ts dresses it.
 *
 * The square is a village's (2·CHESS_HALF + 1 cells across, turned so that its gate, local +Z,
 * faces home): villages.ts toWorld/toLocal/squareDist(…, CHESS_HALF) and systems/tasks.ts
 * sitePos work on it. The board's cells are content/chess.ts cellLocal/localCell.
 */
import { SEA_LEVEL } from '../contracts';
import { BOARD, BOARD_FRONT, BOARD_LEFT, CELL, CHESS_EDGE, CHESS_HALF } from '../content/chess';
import type { CastleSite } from './castles';
import { sideHome, squareFit, type RawGround, type VillageSite } from './villages';

/** Same shape as a castle site, without a race. */
export interface ChessSite {
  /** Centre cell. */
  x: number;
  z: number;
  /** y of the floor's top block (bodies stand on y + 1). */
  y: number;
  /** Quarter turns: the gate faces (sin, cos) of side·π/2, towards home. */
  side: 0 | 1 | 2 | 3;
}

/** The paved walkway round the board, in blocks. */
export const CHESS_WALK = 2;
/** The paved court in local cells: the board with its walkway, back to the floor's far edge (the tower stands there). */
export const CHESS_COURT = {
  x0: BOARD_LEFT - CHESS_WALK,
  x1: BOARD_LEFT + BOARD * CELL - 1 + CHESS_WALK,
  z0: -CHESS_HALF,
  z1: BOARD_FRONT + CHESS_WALK,
} as const;
/** The path from the court out through the gate and over the slope (+Z): two cells wide, on the board's middle line. */
const PATH = { x0: BOARD_LEFT + (BOARD / 2 - 1) * CELL, x1: BOARD_LEFT + (BOARD / 2 + 1) * CELL - 1 } as const;

/** Whether local (lx, lz) is paved: the court (board, walkway, the tower's ground), and the path out over the slope. */
export function chessPaved(lx: number, lz: number): boolean {
  const C = CHESS_COURT;
  if (lx >= C.x0 && lx <= C.x1 && lz >= C.z0 && lz <= C.z1) return true;
  return lx >= PATH.x0 && lx <= PATH.x1 && lz > C.z1 && lz <= CHESS_HALF + CHESS_EDGE;
}

/** Biome indices (terrain.ts). */
const MEADOW = 0;
const FOREST = 1;
const HILLS = 3;
/** terrain.ts SNOW_LINE: the floor stays two below it, so it is never snow. */
const SNOW_LINE = 24;

/** From home, at least and at most (the centre); nearest the middle first. */
const RING: Ring = [110, 160];
/** The last resort, when the ring has no dry place at all (about one world in sixty). */
const RING_WIDE: Ring = [100, 200];
const MID = 135;
/** No river or lake this close to the centre. */
const DRY = 44;
/** From every village's centre and every castle's. */
const FROM_VILLAGE = 60;
const FROM_CASTLE = 120;
/** The heights inside the square may differ by this much at most before it is flattened. */
const SPREAD = 6;
/** Candidate spacing (blocks). */
const STEP = 8;

type Ring = readonly [number, number];
interface Pass {
  biomes: number[];
  /** No bank of a river or lake either (wet > 0.01) within DRY; otherwise only no water itself. */
  banks: boolean;
  ring: Ring;
}
/** A meadow first; a forest or the hills when no meadow will do; in a world of rivers, any of them with a dry bank near; then farther. */
const PASSES: Pass[] = [
  { biomes: [MEADOW], banks: true, ring: RING },
  { biomes: [FOREST, HILLS], banks: true, ring: RING },
  { biomes: [MEADOW, FOREST, HILLS], banks: false, ring: RING },
  { biomes: [MEADOW, FOREST, HILLS], banks: false, ring: RING_WIDE },
];

/** A ring's candidates, nearest MID first. */
function candidates([r0, r1]: Ring): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let z = -r1; z <= r1; z += STEP) {
    for (let x = -r1; x <= r1; x += STEP) {
      const d = Math.hypot(x, z);
      if (d >= r0 && d <= r1) out.push([x, z, Math.abs(d - MID) / 40]);
    }
  }
  return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
}

/** The chess kingdom of a world. Deterministic; null when no place will do. */
export function findChess(g: RawGround, villages: readonly VillageSite[], castles: readonly CastleSite[]): ChessSite | null {
  const rings = new Map<Ring, [number, number, number][]>();
  for (const pass of PASSES) {
    let cand = rings.get(pass.ring);
    if (!cand) rings.set(pass.ring, (cand = candidates(pass.ring)));
    const site = findIn(g, cand, pass, villages, castles);
    if (site) return site;
  }
  return null;
}

function findIn(
  g: RawGround,
  cand: [number, number, number][],
  { biomes, banks }: Pass,
  villages: readonly VillageSite[],
  castles: readonly CastleSite[],
): ChessSite | null {
  const H = CHESS_HALF;
  let best: ChessSite | null = null;
  let bestScore = Infinity;
  for (const [x, z, away] of cand) {
    if (away >= bestScore) break;
    if (villages.some((v) => Math.hypot(v.x - x, v.z - z) < FROM_VILLAGE)) continue;
    if (castles.some((c) => Math.hypot(c.x - x, c.z - z) < FROM_CASTLE)) continue;
    if (!biomes.includes(g.raw(x, z).biome)) continue;
    // coarse first: the corners mostly of the same land, dry, not too uneven
    const spread = Math.min(SPREAD, bestScore - away);
    let same = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let wet = false;
    for (const [cx, cz] of [[-H, -H], [H, -H], [-H, H], [H, H]]) {
      const c = g.raw(x + cx, z + cz);
      if (biomes.includes(c.biome)) same++;
      if (c.wet > 0.01) wet = true;
      lo = Math.min(lo, c.h);
      hi = Math.max(hi, c.h);
    }
    if (same < 3 || wet || hi - lo > spread) continue;
    const fit = squareFit(g, x, z, H, CHESS_EDGE, spread);
    if (!fit) continue;
    const score = fit.spread + away;
    if (score >= bestScore) continue;
    const y = Math.max(SEA_LEVEL + 1, fit.y);
    if (y > SNOW_LINE - 2) continue;
    // then fine: no water anywhere near
    if (!dry(g, x, z, banks)) continue;
    bestScore = score;
    best = { x, z, y, side: sideHome(x, z) };
  }
  return best;
}

/**
 * No river or lake within DRY of the centre, and no bank of one on the square or its slope; with
 * `banks`, no bank anywhere within DRY either (every third cell; every second when only water counts).
 */
function dry(g: RawGround, x: number, z: number, banks: boolean): boolean {
  const R = CHESS_HALF + CHESS_EDGE;
  const step = banks ? 3 : 2;
  for (let dz = -DRY; dz <= DRY; dz += step) {
    for (let dx = -DRY; dx <= DRY; dx += step) {
      if (dx * dx + dz * dz > DRY * DRY) continue;
      const c = g.raw(x + dx, z + dz);
      if (c.h < SEA_LEVEL + 1) return false;
      if (c.wet > 0.01 && (banks || Math.max(Math.abs(dx), Math.abs(dz)) <= R)) return false;
    }
  }
  return true;
}
