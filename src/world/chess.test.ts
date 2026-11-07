import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../contracts';
import { BOARD, BOARD_FRONT, BOARD_LEFT, CELL, CHESS_EDGE, CHESS_HALF, cellLocal, localCell } from '../content/chess';
import { WORLD_SEED } from '../systems/save';
import { B } from './blocks';
import { CHESS_COURT, chessPaved, findChess } from './chess';
import { bridgeCells, bridgesNear, lighthousesNear } from './landmarks';
import { BIOME_FOREST, BIOME_HILLS, BIOME_MEADOW, BIOME_SNOW, SNOW_LINE, Terrain, type ColumnSample } from './terrain';
import { toLocal, toWorld } from './villages';

const SEEDS = [WORLD_SEED, 1, 2, 3, 7, 42, 99, 123, 2024, 777];
const worlds = SEEDS.map((seed) => new Terrain(seed));
const s: ColumnSample = { hf: 0, h: 0, wet: 0, lake: 0, hill: 0, forest: 0, biome: 0, village: 0, vtop: 0 };
const R = CHESS_HALF + CHESS_EDGE;

/** Raw land around the kingdom: its own square taken away. */
function raw<T>(t: Terrain, f: () => T): T {
  const kept = t.chess;
  t.chess = null;
  try {
    return f();
  } finally {
    t.chess = kept;
  }
}

describe('the chess kingdom', () => {
  it('is found in every world, the same as a search on the raw land', () => {
    for (const t of worlds) {
      expect(t.chess, `seed ${SEEDS[worlds.indexOf(t)]}`).not.toBeNull();
      const again = raw(t, () => findChess({ raw: (x, z) => t.sample(x, z, s) }, t.villages, t.castles));
      expect(again).toEqual(t.chess);
    }
  });

  it('is the same every time', () => {
    expect(new Terrain(WORLD_SEED).chess).toEqual(worlds[0].chess);
  });

  it('stands 110–160 from home, 60 from every village, 120 from every castle, its gate towards home', () => {
    for (const t of worlds) {
      const k = t.chess!;
      const d = Math.hypot(k.x, k.z);
      expect(d).toBeGreaterThanOrEqual(110);
      expect(d).toBeLessThanOrEqual(160);
      for (const v of t.villages) expect(Math.hypot(v.x - k.x, v.z - k.z)).toBeGreaterThanOrEqual(60);
      for (const c of t.castles) expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThanOrEqual(120);
      const [, lz] = toLocal(k, 0, 0);
      expect(lz).toBeGreaterThan(0);
    }
  });

  it('in a world of rivers with no dry place in the ring, still stands farther out, with no water near', () => {
    for (const seed of [62, 98]) {
      const t = new Terrain(seed);
      const k = t.chess!;
      expect(k, `seed ${seed}`).not.toBeNull();
      const d = Math.hypot(k.x, k.z);
      expect(d).toBeGreaterThanOrEqual(100);
      expect(d).toBeLessThanOrEqual(200);
      for (let dz = -42; dz <= 42; dz += 2) {
        for (let dx = -42; dx <= 42; dx += 2) if (dx * dx + dz * dz <= 42 * 42) expect(t.sample(k.x + dx, k.z + dz, s).h).toBeGreaterThanOrEqual(SEA_LEVEL);
      }
    }
  });

  it('is on a meadow, a forest or the hills, below the snow, with no water within ~44', () => {
    for (const t of worlds) {
      const k = t.chess!;
      expect([BIOME_MEADOW, BIOME_FOREST, BIOME_HILLS]).toContain(raw(t, () => t.sample(k.x, k.z, s).biome));
      expect(k.y).toBeLessThanOrEqual(SNOW_LINE - 2);
      expect(k.y).toBeGreaterThan(SEA_LEVEL);
      for (let dz = -42; dz <= 42; dz++) {
        for (let dx = -42; dx <= 42; dx++) {
          if (dx * dx + dz * dz > 42 * 42) continue;
          t.sample(k.x + dx, k.z + dz, s);
          expect(s.h, `${dx},${dz} under water`).toBeGreaterThanOrEqual(SEA_LEVEL);
          if (Math.max(Math.abs(dx), Math.abs(dz)) <= R) expect(s.wet, `${dx},${dz} wet`).toBeLessThanOrEqual(0.01);
        }
      }
    }
  });

  it('flattens the floor at y, paves the court and the path, keeps grass elsewhere and trees off', () => {
    for (const t of worlds) {
      const k = t.chess!;
      for (let lz = -CHESS_HALF; lz <= CHESS_HALF; lz++) {
        for (let lx = -CHESS_HALF; lx <= CHESS_HALF; lx++) {
          const [x, z] = toWorld(k, lx, lz);
          t.sample(x, z, s);
          expect(s.h, `${lx},${lz}`).toBe(k.y);
          expect(s.biome).not.toBe(BIOME_SNOW);
          expect(s.vtop).toBe(chessPaved(lx, lz) ? B.STONE : B.GRASS);
        }
      }
      // the path runs on out of the square towards home
      const [px, pz] = toWorld(k, 0, CHESS_HALF + 4);
      expect(t.sample(px, pz, s).vtop).toBe(B.STONE);
      const T = CHESS_HALF + 2;
      expect(t.treeNear(k.x - T, k.z - T, k.x + T + 1, k.z + T + 1)).toBe(false);
    }
  });

  it('keeps lighthouses and bridges off the square', () => {
    for (const t of worlds) {
      const k = t.chess!;
      for (const l of lighthousesNear(t, k.x, k.z, 80)) expect(Math.hypot(l.x - k.x, l.z - k.z)).toBeGreaterThan(R + 4);
      for (const b of bridgesNear(t, k.x, k.z, 80)) {
        for (const [x, , z] of bridgeCells(b)) expect(Math.max(Math.abs(x - k.x), Math.abs(z - k.z))).toBeGreaterThan(R + 2);
      }
    }
  });

  it('has the whole board paved on the floor, with room for the walkway', () => {
    expect(CHESS_COURT.x0).toBeGreaterThanOrEqual(-CHESS_HALF);
    expect(CHESS_COURT.x1).toBeLessThanOrEqual(CHESS_HALF);
    expect(CHESS_COURT.z1).toBeLessThanOrEqual(CHESS_HALF);
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        const [mx, mz] = cellLocal({ c, r });
        for (const [lx, lz] of [[mx - 0.5, mz - 0.5], [mx + 0.5, mz + 0.5]]) {
          expect(chessPaved(lx, lz)).toBe(true);
          expect(localCell(lx, lz)).toEqual({ c, r });
        }
      }
    }
    // a walkway on both sides and in front, the path on the board's middle line
    expect(chessPaved(BOARD_LEFT - 1, 0)).toBe(true);
    expect(chessPaved(BOARD_LEFT + BOARD * CELL, 0)).toBe(true);
    expect(chessPaved(0, BOARD_FRONT + 1)).toBe(true);
    expect(chessPaved(-CHESS_HALF, 0)).toBe(false);
    expect(chessPaved(-1, CHESS_HALF + CHESS_EDGE)).toBe(true);
    expect(chessPaved(-6, CHESS_HALF)).toBe(false);
  });
});
