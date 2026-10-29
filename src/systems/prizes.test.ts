import { describe, expect, it } from 'vitest';
import { B } from '../world/blocks';
import { slamTarget } from './prizeRules';
import { landingSpot } from './kit';

const mon = (x: number, z: number, state = 'chase', alive = true) => ({ alive, state, pos: { x, z } });

describe('the golem picks whom to slam', () => {
  it('takes the nearest monster in reach', () => {
    const near = mon(3, 0);
    expect(slamTarget([mon(6, 0), near, mon(-7, 1)], 0, 0, 8)).toBe(near);
  });

  it('leaves dancing and waiting monsters alone, and the defeated', () => {
    const ok = mon(5, 5);
    expect(slamTarget([mon(1, 0, 'dance'), mon(0, 1, 'wait'), mon(1, 1, 'chase', false), ok], 0, 0, 8)).toBe(ok);
  });

  it('slams nobody out of reach', () => {
    expect(slamTarget([mon(9, 0), mon(0, -8.5)], 0, 0, 8)).toBeNull();
    expect(slamTarget([], 0, 0, 8)).toBeNull();
  });
});

/** A little world: ground height and top block per column, water where `wet` says. */
function world(height: (x: number, z: number) => number, top: (x: number, z: number) => number = () => B.GRASS, wet: (x: number, z: number) => boolean = () => false) {
  return {
    groundHeight: (x: number, z: number) => height(Math.floor(x), Math.floor(z)),
    getBlock: (x: number, y: number, z: number) => (y === height(x, z) - 1 ? top(x, z) : y < height(x, z) ? B.DIRT : B.AIR),
    isWater: (x: number, _y: number, z: number) => wet(x, z),
    isSolid: (x: number, y: number, z: number) => y < height(x, z),
  };
}

describe('where the saucer lands', () => {
  it('lands right on the tapped spot when it is dry ground', () => {
    expect(landingSpot(world(() => 14), 10.3, -4.7)).toEqual({ x: 10.5, y: 14, z: -4.5 });
  });

  it('a tap on a lake lands on the nearest shore', () => {
    const lake = (x: number, z: number) => Math.hypot(x, z) < 5;
    const s = landingSpot(world(() => 12, () => B.GRASS, lake), 0, 0)!;
    expect(lake(Math.floor(s.x), Math.floor(s.z))).toBe(false);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(6.5);
  });

  it('never on a tree, nor where the house stands', () => {
    const tree = (x: number, z: number) => x >= -1 && x <= 1 && z >= -1 && z <= 1;
    const s = landingSpot(world((x, z) => (tree(x, z) ? 20 : 12), (x, z) => (tree(x, z) ? B.LEAVES : B.GRASS)), 0.5, 0.5)!;
    expect(tree(Math.floor(s.x), Math.floor(s.z))).toBe(false);
    expect(s.y).toBe(12);
    const house = (x: number, z: number) => x >= 0 && x < 6 && z >= 0 && z < 6;
    const h = landingSpot(world(() => 12), 3, 3, house)!;
    expect(house(Math.floor(h.x), Math.floor(h.z))).toBe(false);
  });

  it('not into a building’s walls', () => {
    const w = world(() => 12);
    const walls = (x: number, z: number) => x >= -3 && x <= 3 && z >= -3 && z <= 3;
    const s = landingSpot({ ...w, isSolid: (x, y, z) => w.isSolid(x, y, z) || (walls(x, z) && y < 20) }, 0.5, 0.5)!;
    expect(walls(Math.floor(s.x), Math.floor(s.z))).toBe(false);
  });

  it('nowhere dry close by: no landing', () => {
    expect(landingSpot(world(() => 12, () => B.GRASS, () => true), 0, 0)).toBeNull();
  });
});
