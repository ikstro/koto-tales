import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../contracts';
import { WORLD_SEED } from '../systems/save';
import { lighthousesNear } from './landmarks';
import { Terrain, type ColumnSample } from './terrain';
import { RACES, toLocal, toWorld, VILLAGE_HALF } from './villages';

const t = new Terrain(WORLD_SEED);
const s: ColumnSample = { hf: 0, h: 0, wet: 0, lake: 0, hill: 0, forest: 0, biome: 0, village: 0, vtop: 0 };

describe('villages', () => {
  it('finds one village for each race, each farther than the one before', () => {
    expect(t.villages.map((v) => v.race)).toEqual([...RACES]);
    const d = t.villages.map((v) => Math.hypot(v.x, v.z));
    expect(d[0]).toBeGreaterThanOrEqual(100);
    expect(d[0]).toBeLessThanOrEqual(170);
    expect(d[3]).toBeLessThanOrEqual(400);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1] - 20);
  });

  it('flattens each square: one floor height, dry, no trees', () => {
    for (const v of t.villages) {
      for (let lz = -VILLAGE_HALF; lz <= VILLAGE_HALF; lz++) {
        for (let lx = -VILLAGE_HALF; lx <= VILLAGE_HALF; lx++) {
          const [x, z] = toWorld(v, lx, lz);
          t.sample(x, z, s);
          expect(s.h, `${v.race} ${lx},${lz}`).toBe(v.y);
          expect(s.h).toBeGreaterThan(SEA_LEVEL);
        }
      }
      const R = VILLAGE_HALF + 2;
      expect(t.treeNear(v.x - R, v.z - R, v.x + R + 1, v.z + R + 1), v.race).toBe(false);
    }
  });

  it('turns the gate towards home', () => {
    for (const v of t.villages) {
      // home lies in front of the gate (local +z)
      const [, lz] = toLocal(v, 0, 0);
      expect(lz).toBeGreaterThan(0);
    }
  });

  it('is the same every time and keeps lighthouses away', () => {
    const again = new Terrain(WORLD_SEED);
    expect(again.villages).toEqual(t.villages);
    for (const v of t.villages) {
      for (const l of lighthousesNear(t, v.x, v.z, 60)) expect(Math.hypot(l.x - v.x, l.z - v.z)).toBeGreaterThan(30);
    }
  });
});
