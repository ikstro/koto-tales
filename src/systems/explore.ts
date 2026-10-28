import { CHUNK_SIZE } from '../contracts';

/**
 * Where the child has been. The world is remembered in 16×16 chunks ("cx,cz"
 * strings in the save): the chunk he stands in and its neighbours count as
 * explored. The big map shows only these; the rest is under clouds.
 */

/** Chunks around the player that count as seen. */
export const EXPLORE_RADIUS = 1;
/** Chunks around the house that are known from the start (5×5). */
export const HOME_RADIUS = 2;

export const chunkOf = (v: number): number => Math.floor(v / CHUNK_SIZE);
export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

export function parseKey(k: string): [number, number] {
  const i = k.indexOf(',');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

/** Keys of the (2r+1)² square of chunks around a chunk. */
export function squareAround(cx: number, cz: number, r: number): string[] {
  const out: string[] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.push(chunkKey(cx + dx, cz + dz));
  return out;
}

/** The 5×5 chunks around a house corner (or the world origin when there is no house yet). */
export function homeChunks(house: readonly [number, number, number] | null): string[] {
  const x = house ? house[0] + 4 : 0;
  const z = house ? house[2] + 4 : 0;
  return squareAround(chunkOf(x), chunkOf(z), HOME_RADIUS);
}

/**
 * The explored set, backed by the save's array (new keys are appended to it,
 * so the save stays a short list of strings).
 */
export class Explored {
  private set: Set<string>;
  private lastCx = Number.NaN;
  private lastCz = Number.NaN;
  /** Bumped whenever a chunk is added, so views know to redraw. */
  version = 0;

  constructor(readonly list: string[]) {
    this.set = new Set(list);
  }

  has(cx: number, cz: number): boolean {
    return this.set.has(chunkKey(cx, cz));
  }

  get size(): number {
    return this.set.size;
  }

  add(keys: Iterable<string>): number {
    let n = 0;
    for (const k of keys) {
      if (this.set.has(k)) continue;
      this.set.add(k);
      this.list.push(k);
      n++;
    }
    if (n) this.version++;
    return n;
  }

  /** The player is at world (x, z): his chunk and its neighbours become explored. Cheap when he stays in one chunk. */
  visit(x: number, z: number): number {
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    if (cx === this.lastCx && cz === this.lastCz) return 0;
    this.lastCx = cx;
    this.lastCz = cz;
    return this.add(squareAround(cx, cz, EXPLORE_RADIUS));
  }

  /** Chunk bounds of everything explored: [cx0, cz0, cx1, cz1] inclusive, or null. */
  bounds(): [number, number, number, number] | null {
    if (!this.set.size) return null;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const k of this.set) {
      const [cx, cz] = parseKey(k);
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cz < z0) z0 = cz;
      if (cz > z1) z1 = cz;
    }
    return [x0, z0, x1, z1];
  }
}

const bySave = new WeakMap<object, Explored>();

/** The explored set of a save (one per save object; the house area is known from the start). */
export function exploredOf(save: { explored: string[]; house: [number, number, number] | null }): Explored {
  let e = bySave.get(save);
  if (!e) {
    e = new Explored(save.explored);
    if (!save.explored.length) e.add(homeChunks(save.house));
    bySave.set(save, e);
  }
  return e;
}
