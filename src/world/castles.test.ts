import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../contracts';
import { WORLD_SEED } from '../systems/save';
import { CASTLE_EDGE, CASTLE_HALF, castlePaved, findCastles } from './castles';
import { lighthousesNear } from './landmarks';
import { B } from './blocks';
import { BIOME_FOREST, BIOME_HILLS, BIOME_MEADOW, Terrain, type ColumnSample } from './terrain';
import { toLocal, toWorld } from './villages';

const SEEDS = [WORLD_SEED, 1, 2, 3, 7, 42, 99, 123, 2024, 777];
const worlds = SEEDS.map((seed) => new Terrain(seed));
const s: ColumnSample = { hf: 0, h: 0, wet: 0, lake: 0, hill: 0, forest: 0, biome: 0, village: 0, vtop: 0 };
const BIOMES = { elves: [BIOME_FOREST], gnomes: [BIOME_HILLS], robots: [BIOME_MEADOW], aliens: [BIOME_MEADOW, BIOME_FOREST] };
const PAVE = { elves: B.PLANKS, gnomes: B.COBBLE, robots: B.STONE, aliens: B.STONE };

/** Raw land around a castle: its own square taken away. */
function raw(t: Terrain) {
  const kept = t.castles;
  return <T>(f: () => T): T => {
    t.castles = [];
    try {
      return f();
    } finally {
      t.castles = kept;
    }
  };
}

describe('castles', () => {
  it('finds a castle for (almost) every race in most worlds, in under ~30 ms', () => {
    let total = 0;
    for (const t of worlds) {
      total += t.castles.length;
      // the search alone, on the same raw land
      const t0 = performance.now();
      const again = raw(t)(() => findCastles({ raw: (x, z) => t.sample(x, z, s) }, t.villages));
      const ms = performance.now() - t0;
      expect(again).toEqual(t.castles);
      expect(ms).toBeLessThan(150); // ~30 ms on a quiet machine; the test runner shares the CPU
    }
    expect(total).toBeGreaterThanOrEqual(SEEDS.length * 3);
  });

  it('is the same every time', () => {
    expect(new Terrain(WORLD_SEED).castles).toEqual(worlds[0].castles);
  });

  it('stands beyond its village, near its bearing, far from villages and other castles', () => {
    for (const t of worlds) {
      for (const c of t.castles) {
        const v = t.villages.find((w) => w.race === c.race)!;
        expect(v).toBeTruthy();
        const dv = Math.hypot(v.x, v.z);
        const d = Math.hypot(c.x, c.z);
        expect(d).toBeGreaterThanOrEqual(dv + 150 - 1);
        expect(d).toBeLessThanOrEqual(dv + 270 + 1);
        let da = Math.abs(Math.atan2(c.x, c.z) - Math.atan2(v.x, v.z));
        if (da > Math.PI) da = 2 * Math.PI - da;
        expect(da).toBeLessThanOrEqual((60 * Math.PI) / 180 + 0.01);
        for (const o of [...t.villages, ...t.castles]) if (o !== c) expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThanOrEqual(140);
      }
    }
  });

  it('is on its own land, dry, and turns its gate towards home', () => {
    for (const t of worlds) {
      for (const c of t.castles) {
        const b = raw(t)(() => t.sample(c.x, c.z, s).biome);
        expect(BIOMES[c.race], `${c.race} biome`).toContain(b);
        const [, lz] = toLocal(c, 0, 0);
        expect(lz).toBeGreaterThan(0);
        const R = CASTLE_HALF + CASTLE_EDGE;
        for (let dz = -R; dz <= R; dz++) {
          for (let dx = -R; dx <= R; dx++) {
            t.sample(c.x + dx, c.z + dz, s);
            expect(s.h, `${c.race} ${dx},${dz} under water`).toBeGreaterThan(SEA_LEVEL);
          }
        }
      }
    }
  });

  it('flattens the floor at y (a hill for the gnomes, a crater for the aliens), paves the plaza, keeps trees off', () => {
    for (const t of worlds) {
      for (const c of t.castles) {
        for (let lz = -CASTLE_HALF; lz <= CASTLE_HALF; lz++) {
          for (let lx = -CASTLE_HALF; lx <= CASTLE_HALF; lx++) {
            const [x, z] = toWorld(c, lx, lz);
            t.sample(x, z, s);
            expect(s.h, `${c.race} ${lx},${lz}`).toBe(c.y);
            expect(s.wet).toBeLessThanOrEqual(0.01);
            expect(s.vtop).toBe(castlePaved(lx, lz) ? PAVE[c.race] : c.race === 'aliens' ? B.SAND : B.GRASS);
          }
        }
        // the path runs on out of the square towards home
        const [px, pz] = toWorld(c, 0, CASTLE_HALF + 4);
        expect(t.sample(px, pz, s).vtop).toBe(PAVE[c.race]);
        // the land around, before flattening: the gnomes' floor stands above it, the aliens' below
        const ring: number[] = [];
        raw(t)(() => {
          for (let k = -CASTLE_HALF; k <= CASTLE_HALF; k += 4) {
            for (const [dx, dz] of [[k, -CASTLE_HALF], [k, CASTLE_HALF], [-CASTLE_HALF, k], [CASTLE_HALF, k]]) ring.push(t.sample(c.x + dx, c.z + dz, s).h);
          }
        });
        ring.sort((a, b) => a - b);
        const median = ring[ring.length >> 1];
        if (c.race === 'gnomes') expect(c.y).toBeGreaterThanOrEqual(median + 1);
        if (c.race === 'aliens') expect(c.y).toBeLessThanOrEqual(Math.max(SEA_LEVEL + 1, median));
        const T = CASTLE_HALF + 2;
        expect(t.treeNear(c.x - T, c.z - T, c.x + T + 1, c.z + T + 1), c.race).toBe(false);
      }
    }
  });

  it('keeps lighthouses off the squares', () => {
    for (const t of worlds) {
      for (const c of t.castles) {
        for (const l of lighthousesNear(t, c.x, c.z, 80)) expect(Math.hypot(l.x - c.x, l.z - c.z)).toBeGreaterThan(CASTLE_HALF + CASTLE_EDGE + 4);
      }
    }
  });
});
