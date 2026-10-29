/**
 * Landmarks the world grows by itself, from the seed like trees: lighthouses on the
 * shores of lakes and rivers, and plank bridges across the rivers. Pure data from the
 * terrain's height map (style-neutral); systems/landmarks.ts shows them. The ground is
 * never changed: a lighthouse stands on flat dry ground, a bridge's deck is a row of
 * invisible solid cells.
 */
import { SEA_LEVEL } from '../contracts';
import { hash2 } from './rng';
import type { ColumnSample, Terrain } from './terrain';

/** One lighthouse at most per region of this many blocks across. */
export const LIGHTHOUSE_REGION = 128;
/** Bridges: one at most per cell of this many blocks across. */
export const BRIDGE_CELL = 56;
/** No lighthouse closer to home than this: home is the house's place. */
const HOME_CLEAR = 60;

export interface LighthouseSite {
  /** Stable id, saved when it is lit: `L<rx>,<rz>`. */
  id: string;
  /** Footprint min corner (3×3) and the floor it stands on. */
  x: number;
  z: number;
  y: number;
  /** Faces the water (radians, 0 = +Z). */
  yaw: number;
  /** A little boat on the water in front, if there is room. */
  boat: [number, number] | null;
}

export interface BridgeSite {
  id: string;
  /** Deck runs along x or z, three cells wide around the centre line. */
  axis: 'x' | 'z';
  /** The centre line's first cell (lowest coordinate along the axis) and the cross coordinate. */
  x: number;
  z: number;
  /** Cells along the axis. */
  len: number;
  /** y of the deck cells (bodies walk on y + 1). */
  y: number;
}

const s: ColumnSample = { hf: 0, h: 0, wet: 0, lake: 0, hill: 0, forest: 0, biome: 0 };
const isWater = (t: Terrain, x: number, z: number) => t.sample(x, z, s).h < SEA_LEVEL;
/** Walking height of dry ground (null over water). */
function floorAt(t: Terrain, x: number, z: number): number | null {
  const h = t.sample(x, z, s).h;
  return h < SEA_LEVEL ? null : h + 1;
}

const cache = new WeakMap<Terrain, { lh: Map<string, LighthouseSite | null>; br: Map<string, BridgeSite | null> }>();
function cacheOf(t: Terrain) {
  let c = cache.get(t);
  if (!c) cache.set(t, (c = { lh: new Map(), br: new Map() }));
  return c;
}

/** Dry, flat (one step at most), low enough to be a shore, and clear of trees. */
function shoreFloor(t: Terrain, x0: number, z0: number): number | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = x0; x < x0 + 3; x++) {
    for (let z = z0; z < z0 + 3; z++) {
      const f = floorAt(t, x, z);
      if (f === null || f > SEA_LEVEL + 4) return null;
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
    }
  }
  if (hi - lo > 1 || t.treeNear(x0, z0, x0 + 3, z0 + 3)) return null;
  return hi;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * The lighthouse of region (rx, rz), or null: the shore spot with the most water in
 * front of it (a lake or a wide bend, not a puddle).
 */
export function lighthouseIn(t: Terrain, rx: number, rz: number): LighthouseSite | null {
  const key = `${rx},${rz}`;
  const c = cacheOf(t).lh;
  if (c.has(key)) return c.get(key)!;
  const R = LIGHTHOUSE_REGION;
  let best: LighthouseSite | null = null;
  let bestScore = 0;
  // a margin inside the region so neighbours' lighthouses never stand side by side
  for (let z = rz * R + 8; z < rz * R + R - 8; z += 4) {
    for (let x = rx * R + 8; x < rx * R + R - 8; x += 4) {
      if (Math.hypot(x, z) < HOME_CLEAR) continue;
      const cf = floorAt(t, x + 1, z + 1);
      if (cf === null || cf > SEA_LEVEL + 4) continue;
      if (!DIRS.some(([dx, dz]) => isWater(t, x + 1 + dx * 4, z + 1 + dz * 4))) continue;
      const y = shoreFloor(t, x, z);
      if (y === null) continue;
      // how much water around, and where it lies
      let n = 0;
      let wx = 0;
      let wz = 0;
      for (let dz = -9; dz <= 9; dz += 2) {
        for (let dx = -9; dx <= 9; dx += 2) {
          if (dx * dx + dz * dz > 81 || !isWater(t, x + 1 + dx, z + 1 + dz)) continue;
          n++;
          wx += dx;
          wz += dz;
        }
      }
      if (n < 16) continue;
      const score = n * 1000 + (hash2(x, z, 77) % 1000);
      if (score <= bestScore) continue;
      bestScore = score;
      const yaw = Math.atan2(wx, wz);
      // the boat: the first water deep enough along the way the lighthouse faces
      let boat: [number, number] | null = null;
      for (let k = 3; k <= 7 && !boat; k++) {
        const bx = Math.floor(x + 1.5 + Math.sin(yaw) * k);
        const bz = Math.floor(z + 1.5 + Math.cos(yaw) * k);
        if (t.sample(bx, bz, s).h < SEA_LEVEL - 1) boat = [bx + 0.5, bz + 0.5];
      }
      best = { id: `L${rx},${rz}`, x, z, y, yaw, boat };
    }
  }
  c.set(key, best);
  return best;
}

/** Lighthouses in the regions overlapping a square of `radius` around (x, z). */
export function lighthousesNear(t: Terrain, x: number, z: number, radius: number): LighthouseSite[] {
  const R = LIGHTHOUSE_REGION;
  const out: LighthouseSite[] = [];
  for (let rz = Math.floor((z - radius) / R); rz <= Math.floor((z + radius) / R); rz++) {
    for (let rx = Math.floor((x - radius) / R); rx <= Math.floor((x + radius) / R); rx++) {
      const l = lighthouseIn(t, rx, rz);
      if (l) out.push(l);
    }
  }
  return out;
}

/**
 * The bridge of cell (cx, cz), or null: across a river (not a lake) where it is
 * narrow, from dry bank to dry bank no more than one step off the deck.
 */
export function bridgeIn(t: Terrain, cx: number, cz: number): BridgeSite | null {
  const key = `${cx},${cz}`;
  const c = cacheOf(t).br;
  if (c.has(key)) return c.get(key)!;
  const C = BRIDGE_CELL;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  const mx = cx * C + C / 2;
  const mz = cz * C + C / 2;
  // the river's middle line inside the cell (not too near its edges), nearest the cell's middle
  for (let z = cz * C + 8; z < cz * C + C - 8; z += 2) {
    for (let x = cx * C + 8; x < cx * C + C - 8; x += 2) {
      if (Math.abs(t.riverField(x, z)) > 0.012) continue;
      t.sample(x, z, s);
      if (s.h >= SEA_LEVEL || s.lake > 0.05) continue;
      const d = Math.hypot(x - mx, z - mz);
      if (d < bestD) {
        bestD = d;
        best = [x, z];
      }
    }
  }
  let site: BridgeSite | null = null;
  if (best) {
    const [x, z] = best;
    const gx = t.riverField(x + 1, z) - t.riverField(x - 1, z);
    const gz = t.riverField(x, z + 1) - t.riverField(x, z - 1);
    // the bridge crosses the flow: along the field's slope
    const axis: 'x' | 'z' = Math.abs(gx) >= Math.abs(gz) ? 'x' : 'z';
    const at = (k: number, side = 0): [number, number] => (axis === 'x' ? [x + k, z + side] : [x + side, z + k]);
    /** The first cell walking from the middle in direction `dir` where all three lanes are dry: [k, lowest floor, highest floor]. */
    const bank = (dir: number): [number, number, number] | null => {
      for (let k = 1; k <= 8; k++) {
        const fs = [-1, 0, 1].map((side) => floorAt(t, ...at(dir * k, side)));
        if (fs.every((f) => f !== null)) return [dir * k, Math.min(...(fs as number[])), Math.max(...(fs as number[]))];
      }
      return null;
    };
    const a = bank(-1);
    const b = bank(1);
    if (a && b && !t.treeNear(...lo(at(a[0], -1), at(b[0], 1)))) {
      const deck = Math.max(SEA_LEVEL + 2, Math.min(a[1], b[1]));
      // both ends at most one step up from the deck (the heroes hop it), never a cliff
      if (a[2] - deck <= 1 && b[2] - deck <= 1) {
        const [sx, sz] = at(a[0]);
        site = { id: `B${cx},${cz}`, axis, x: sx, z: sz, len: b[0] - a[0] + 1, y: deck - 1 };
      }
    }
  }
  c.set(key, site);
  return site;
}

/** Min corner and max corner (exclusive) of two cells, as treeNear wants them. */
function lo(p: [number, number], q: [number, number]): [number, number, number, number] {
  return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]) + 1, Math.max(p[1], q[1]) + 1];
}

/** Bridges in the cells overlapping a square of `radius` around (x, z). */
export function bridgesNear(t: Terrain, x: number, z: number, radius: number): BridgeSite[] {
  const C = BRIDGE_CELL;
  const out: BridgeSite[] = [];
  for (let cz = Math.floor((z - radius) / C); cz <= Math.floor((z + radius) / C); cz++) {
    for (let cx = Math.floor((x - radius) / C); cx <= Math.floor((x + radius) / C); cx++) {
      const b = bridgeIn(t, cx, cz);
      if (b) out.push(b);
    }
  }
  return out;
}

/** The deck cells of a bridge (x, y, z), three lanes wide. */
export function bridgeCells(b: BridgeSite): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let k = 0; k < b.len; k++) {
    for (const side of [-1, 0, 1]) out.push(b.axis === 'x' ? [b.x + k, b.y, b.z + side] : [b.x + side, b.y, b.z + k]);
  }
  return out;
}
