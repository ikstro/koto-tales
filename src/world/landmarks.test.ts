import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../contracts';
import { bridgeCells, bridgesNear, lighthousesNear } from './landmarks';
import { Terrain } from './terrain';

const SEED = 20261128;
const t = new Terrain(SEED);
const floor = (x: number, z: number) => t.heightAt(x, z) + 1;

describe('lighthouses', () => {
  const all = lighthousesNear(t, 0, 0, 300);

  it('one stands by the water not far from home', () => {
    const nearest = Math.min(...all.map((l) => Math.hypot(l.x, l.z)));
    expect(nearest).toBeGreaterThan(60);
    expect(nearest).toBeLessThan(150);
  });

  it('stands on dry, flat ground with plenty of water in front', () => {
    expect(all.length).toBeGreaterThan(5);
    for (const l of all) {
      const fs: number[] = [];
      for (let x = l.x; x < l.x + 3; x++) for (let z = l.z; z < l.z + 3; z++) fs.push(floor(x, z));
      expect(Math.min(...fs)).toBeGreaterThanOrEqual(SEA_LEVEL + 1);
      expect(Math.max(...fs) - Math.min(...fs)).toBeLessThanOrEqual(1);
      expect(l.y).toBe(Math.max(...fs));
      expect(t.treeNear(l.x, l.z, l.x + 3, l.z + 3)).toBe(false);
      // looking the way it faces, water within a few blocks
      const ahead = [3, 4, 5, 6].some((k) => t.heightAt(Math.floor(l.x + 1.5 + Math.sin(l.yaw) * k), Math.floor(l.z + 1.5 + Math.cos(l.yaw) * k)) < SEA_LEVEL);
      expect(ahead).toBe(true);
    }
  });

  it('is the same every time (from the seed)', () => {
    expect(lighthousesNear(new Terrain(SEED), 0, 0, 300)).toEqual(all);
  });
});

describe('bridges', () => {
  const all = bridgesNear(t, 0, 0, 300);

  it('cross the rivers near home', () => {
    expect(all.length).toBeGreaterThan(4);
  });

  it('go from dry bank to dry bank over water, the ends one hop at most', () => {
    for (const b of all) {
      const cells = bridgeCells(b);
      expect(cells.length).toBe(b.len * 3);
      expect(cells.some(([x, , z]) => t.heightAt(x, z) < SEA_LEVEL)).toBe(true);
      const ends = b.axis === 'x' ? [[b.x, b.z], [b.x + b.len - 1, b.z]] : [[b.x, b.z], [b.x, b.z + b.len - 1]];
      for (const [x, z] of ends) {
        expect(t.heightAt(x, z)).toBeGreaterThanOrEqual(SEA_LEVEL);
        expect(floor(x, z) - (b.y + 1)).toBeLessThanOrEqual(1);
      }
      // the deck is above the water
      expect(b.y).toBeGreaterThan(SEA_LEVEL);
    }
  });
});
