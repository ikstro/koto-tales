/**
 * The four castles (stage C2 «Замки»): one per race, far beyond that race's village along
 * the same bearing from home — the elves' in a forest, the gnomes' fortress on a hill, the
 * robots' on a meadow, the aliens' in a crater on a meadow or in a forest. Pure data from
 * the seed (style-neutral); the terrain flattens and paves each square (Terrain.sample),
 * systems/castles.ts builds on it.
 *
 * A castle's square is a village square, only bigger: (2·CASTLE_HALF + 1) cells across,
 * turned so that its gate (local +Z) faces home; villages.ts toWorld/toLocal/squareDist
 * (with `CASTLE_HALF`) work on it.
 */
import { SEA_LEVEL } from '../contracts';
import { RACES, sideHome, squareFit, type Race, type RawGround, type VillageSite } from './villages';

/** Half the square's width: the flat floor runs from −HALF to +HALF around the centre cell. */
export const CASTLE_HALF = 16;
/** The soft slope from the floor back to the land around (the gnomes' hill sides). */
export const CASTLE_EDGE = 10;
/** The paved plaza in front of the castle, in local cells (the gate side, +Z). */
export const CASTLE_PLAZA = { x0: -8, x1: 8, z0: 4, z1: 16 } as const;

/** Same shape as a village site. */
export interface CastleSite {
  race: Race;
  /** Centre cell. */
  x: number;
  z: number;
  /** y of the floor's top block (bodies stand on y + 1). */
  y: number;
  /** Quarter turns: the gate faces (sin, cos) of side·π/2, towards home. */
  side: 0 | 1 | 2 | 3;
}

/** Whether local (lx, lz) is paved: the plaza, and the path from it out over the slope (+Z). */
export function castlePaved(lx: number, lz: number): boolean {
  const P = CASTLE_PLAZA;
  if (lx >= P.x0 && lx <= P.x1 && lz >= P.z0 && lz <= P.z1) return true;
  return Math.abs(lx) <= 1 && lz > P.z1 && lz <= CASTLE_HALF + CASTLE_EDGE;
}

/** Biome indices (terrain.ts). */
const MEADOW = 0;
const FOREST = 1;
const HILLS = 3;
/** terrain.ts SNOW_LINE: the gnomes' hilltop stays green below it. */
const SNOW_LINE = 24;

interface Rule {
  biomes: number[];
  /** The floor sits this much above the middle height (the gnomes' hill; the aliens' crater is below). */
  lift: number;
}

const RULES: Record<Race, Rule> = {
  elves: { biomes: [FOREST], lift: 0 },
  gnomes: { biomes: [HILLS], lift: 4 },
  robots: { biomes: [MEADOW], lift: 0 },
  aliens: { biomes: [MEADOW, FOREST], lift: -2 },
};

/** Beyond the village: this much farther from home than it, at least and at most. */
const BEYOND0 = 150;
const BEYOND1 = 270;
/** Away from the village's bearing (radians): first tried, then widened. */
const BEARING = (35 * Math.PI) / 180;
const BEARING_WIDE = (60 * Math.PI) / 180;
/** From every village and every other castle. */
const APART = 140;
/** The heights inside a square may differ by this much at most before it is flattened. */
const SPREAD = 8;
/** Candidate spacing (blocks). */
const STEP = 8;
/** The corners, then the middles of the sides (in halves). */
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];

/** The castles of a world, beyond its villages. Deterministic; a race finds no place (or has no village) → it is left out. */
export function findCastles(g: RawGround, villages: readonly VillageSite[]): CastleSite[] {
  const out: CastleSite[] = [];
  for (const race of RACES) {
    const v = villages.find((s) => s.race === race);
    if (!v) continue;
    const taken = [...villages, ...out];
    const site = findOne(g, race, v, taken, 0, BEARING) ?? findOne(g, race, v, taken, BEARING, BEARING_WIDE);
    if (site) out.push(site);
  }
  return out;
}

/** The best site with its bearing off the village's by more than `a0` and at most `a1`. */
function findOne(g: RawGround, race: Race, v: VillageSite, taken: { x: number; z: number }[], a0: number, a1: number): CastleSite | null {
  const rule = RULES[race];
  const dv = Math.hypot(v.x, v.z);
  const r0 = dv + BEYOND0;
  const r1 = dv + BEYOND1;
  const mid = (r0 + r1) / 2;
  const bearing = Math.atan2(v.x, v.z);
  // only the sector beyond the village; nearest the band's middle and the village's bearing first
  const cand: [number, number, number][] = [];
  const seen = new Set<string>();
  for (let r = Math.ceil(r0); r <= r1; r += STEP) {
    const n = Math.ceil((2 * a1 * r) / STEP);
    for (let i = 0; i <= n; i++) {
      const a = bearing - a1 + (2 * a1 * i) / n;
      if (a0 > 0 && Math.abs(a - bearing) <= a0) continue;
      const x = Math.round(r * Math.sin(a));
      const z = Math.round(r * Math.cos(a));
      const key = `${x},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cand.push([x, z, Math.abs(r - mid) / 40 + Math.abs(a - bearing) / 0.4]);
    }
  }
  cand.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const H = CASTLE_HALF;
  let best: CastleSite | null = null;
  let bestScore = Infinity;
  for (const [x, z, away] of cand) {
    if (away >= bestScore) break;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < APART)) continue;
    // coarse first: the centre and the corners of the right land, dry, not too uneven
    if (!rule.biomes.includes(g.raw(x, z).biome)) continue;
    let same = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let wet = false;
    // no worse than the best so far
    const spread = Math.min(SPREAD, bestScore - away);
    for (const [cx, cz] of CORNERS) {
      const c = g.raw(x + cx * H, z + cz * H);
      if (cx && cz && rule.biomes.includes(c.biome)) same++;
      if (c.wet > 0.01) wet = true;
      lo = Math.min(lo, c.h);
      hi = Math.max(hi, c.h);
      if (wet || hi - lo > spread) break;
    }
    if (same < 3 || wet || hi - lo > spread) continue;
    const fit = squareFit(g, x, z, H, CASTLE_EDGE, spread, 4, 8);
    if (!fit) continue;
    const score = fit.spread + away;
    if (score >= bestScore) continue;
    let y = Math.max(SEA_LEVEL + 1, fit.y + rule.lift);
    // the gnomes' hilltop stays below the snow, and still a hill
    if (rule.lift > 0) {
      y = Math.min(y, SNOW_LINE - 1);
      if (y < fit.y + 2) continue;
    }
    // then fine: dry all over, slope and all
    if (!dry(g, x, z)) continue;
    bestScore = score;
    best = { race, x, z, y, side: sideHome(x, z) };
  }
  return best;
}

/** No river or lake anywhere on the square or its slope (every third cell). */
function dry(g: RawGround, x: number, z: number): boolean {
  const R = CASTLE_HALF + CASTLE_EDGE;
  for (let dz = -R; dz <= R; dz += 3) {
    for (let dx = -R; dx <= R; dx += 3) {
      const c = g.raw(x + dx, z + dz);
      if (c.wet > 0.01 || c.h < SEA_LEVEL + 1) return false;
    }
  }
  return true;
}
