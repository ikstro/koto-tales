/**
 * The four villages (DESIGN.md «Villages»): one per race, found from the seed on a ring
 * around home — elves in a forest, gnomes in the hills, robots on a meadow, aliens in a
 * crater on a far meadow. Pure data (style-neutral); the terrain flattens each square
 * itself (Terrain.sample), systems/villages.ts dresses it.
 *
 * A square is (2·HALF + 1) cells across around its centre cell, turned so that its gate
 * (local +Z) faces home. Local (lx, lz) ↔ world: x = cx + lx·cos + lz·sin, z = cz − lx·sin + lz·cos.
 */
import { SEA_LEVEL } from '../contracts';

export type Race = 'elves' | 'gnomes' | 'robots' | 'aliens';
export const RACES: readonly Race[] = ['elves', 'gnomes', 'robots', 'aliens'];

/** Half the square's width: the flat floor runs from −HALF to +HALF around the centre cell. */
export const VILLAGE_HALF = 13;
/** The soft slope from the floor back to the land around. */
export const VILLAGE_EDGE = 8;
/** The paved plaza around the heart, in blocks from the centre. */
export const PLAZA = 5;

/** A square turned by quarter turns around its centre cell (a village's or a castle's). */
export interface SquareSite {
  /** Centre cell. */
  x: number;
  z: number;
  /** Quarter turns: the gate (local +Z) faces (sin, cos) of side·π/2. */
  side: 0 | 1 | 2 | 3;
}

export interface VillageSite {
  race: Race;
  /** Centre cell. */
  x: number;
  z: number;
  /** y of the floor's top block (bodies stand on y + 1). */
  y: number;
  /** Quarter turns: the gate faces (sin, cos) of side·π/2, towards home. */
  side: 0 | 1 | 2 | 3;
}

/** What the terrain needs to know: the raw column (no village applied yet). */
export interface RawGround {
  /** Biome index, top block y and wetness of a column, before villages flatten it. */
  raw(x: number, z: number): { biome: number; h: number; wet: number };
}

/** Biome indices (terrain.ts). */
const MEADOW = 0;
const FOREST = 1;
const HILLS = 3;

interface Rule {
  biomes: number[];
  r0: number;
  r1: number;
  /** The floor sits this much below the middle height (the aliens' crater). */
  sink: number;
}

const RULES: Record<Race, Rule> = {
  elves: { biomes: [FOREST], r0: 100, r1: 170, sink: 0 },
  gnomes: { biomes: [HILLS], r0: 140, r1: 240, sink: 0 },
  robots: { biomes: [MEADOW], r0: 190, r1: 300, sink: 0 },
  aliens: { biomes: [MEADOW, FOREST], r0: 270, r1: 400, sink: 1 },
};

/** Villages stand at least this far apart. */
const APART = 140;
/** The heights inside a square may differ by this much at most before it is flattened. */
const SPREAD = 6;

/** Quarter-turn cos/sin. */
export const sideCos = (side: number) => [1, 0, -1, 0][side];
export const sideSin = (side: number) => [0, 1, 0, -1][side];

/** World cell of local (lx, lz) in a square (village or castle). */
export function toWorld(v: SquareSite, lx: number, lz: number): [number, number] {
  const c = sideCos(v.side);
  const s = sideSin(v.side);
  return [v.x + lx * c + lz * s, v.z - lx * s + lz * c];
}

/** Local (lx, lz) of a world cell. */
export function toLocal(v: SquareSite, x: number, z: number): [number, number] {
  const c = sideCos(v.side);
  const s = sideSin(v.side);
  const dx = x - v.x;
  const dz = z - v.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** The gate's yaw (radians, 0 = +Z). */
export const villageYaw = (v: SquareSite) => (v.side * Math.PI) / 2;

/** Distance from the centre in «square» terms: up to HALF inside the floor, then HALF + the way to its edge (round corners outside). */
export function squareDist(v: SquareSite, x: number, z: number, half = VILLAGE_HALF): number {
  const dx = Math.abs(x - v.x);
  const dz = Math.abs(z - v.z);
  const H = half;
  if (dx <= H && dz <= H) return Math.max(dx, dz);
  return H + Math.hypot(Math.max(0, dx - H), Math.max(0, dz - H));
}

/** The four villages of a world. Deterministic; a race finds no place → it is left out. */
export function findVillages(g: RawGround): VillageSite[] {
  const out: VillageSite[] = [];
  for (const race of RACES) {
    const site = findOne(g, race, out);
    if (site) out.push(site);
  }
  return out;
}

function findOne(g: RawGround, race: Race, taken: VillageSite[]): VillageSite | null {
  const rule = RULES[race];
  const mid = (rule.r0 + rule.r1) / 2;
  const STEP = 8;
  // candidates nearest the ring's middle first: once a site is found, farther ones can't beat it
  const cand: [number, number, number][] = [];
  for (let z = -rule.r1; z <= rule.r1; z += STEP) {
    for (let x = -rule.r1; x <= rule.r1; x += STEP) {
      const d = Math.hypot(x, z);
      if (d >= rule.r0 && d <= rule.r1) cand.push([x, z, Math.abs(d - mid) / 40]);
    }
  }
  cand.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const H = VILLAGE_HALF;
  let best: VillageSite | null = null;
  let bestScore = Infinity;
  for (const [x, z, away] of cand) {
    if (away >= bestScore) break;
    if (taken.some((v) => Math.hypot(v.x - x, v.z - z) < APART)) continue;
    if (!rule.biomes.includes(g.raw(x, z).biome)) continue;
    // the corners mostly of the same land, dry, not too uneven
    let same = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let wet = false;
    for (const [cx, cz] of [[-H, -H], [H, -H], [-H, H], [H, H]]) {
      const c = g.raw(x + cx, z + cz);
      if (rule.biomes.includes(c.biome)) same++;
      if (c.wet > 0.01) wet = true;
      lo = Math.min(lo, c.h);
      hi = Math.max(hi, c.h);
    }
    if (same < 3 || wet || hi - lo > SPREAD) continue;
    const fit = squareFit(g, x, z, VILLAGE_HALF, VILLAGE_EDGE, SPREAD);
    if (!fit) continue;
    const score = fit.spread + away;
    if (score >= bestScore) continue;
    bestScore = score;
    best = { race, x, z, y: Math.max(SEA_LEVEL + 1, fit.y - rule.sink), side: sideHome(x, z) };
  }
  return best;
}

/** The gate faces home: the nearest quarter turn. */
export const sideHome = (x: number, z: number) => (((Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) % 4) + 4) % 4) as SquareSite['side'];

/**
 * A square of `half` around (x, z): dry all over (with a margin for the slope of `edge`), its heights
 * within `spread` — the middle height and the spread, or null. Samples every `step` cells, the margin every `ring`.
 */
export function squareFit(
  g: RawGround,
  x: number,
  z: number,
  half: number,
  edge: number,
  spread: number,
  step = 3,
  ring = 6,
): { y: number; spread: number } | null {
  const H = half;
  const hs: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let dz = -H; dz <= H; dz += step) {
    for (let dx = -H; dx <= H; dx += step) {
      const c = g.raw(x + dx, z + dz);
      if (c.wet > 0.01 || c.h < SEA_LEVEL + 1) return null;
      lo = Math.min(lo, c.h);
      hi = Math.max(hi, c.h);
      if (hi - lo > spread) return null;
      hs.push(c.h);
    }
  }
  // the slope around stays dry too
  const R = H + edge;
  for (let k = -R; k <= R; k += ring) {
    for (const [dx, dz] of [[k, -R], [k, R], [-R, k], [R, k]]) {
      const c = g.raw(x + dx, z + dz);
      if (c.wet > 0.01 || c.h < SEA_LEVEL + 1) return null;
    }
  }
  hs.sort((a, b) => a - b);
  return { y: hs[hs.length >> 1], spread: hi - lo };
}
