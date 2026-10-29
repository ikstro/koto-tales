import { describe, expect, it } from 'vitest';
import { B } from '../world/blocks';
import { findSpot, standsOk } from './kit';

/** A little world of columns: ground height per (x, z), grass on top unless `top` says otherwise. */
function world(height: (x: number, z: number) => number, top: (x: number, z: number) => number = () => B.GRASS) {
  return {
    groundHeight: (x: number, z: number) => height(Math.floor(x), Math.floor(z)),
    getBlock: (x: number, y: number, z: number) => (y === height(x, z) - 1 ? top(x, z) : y < height(x, z) ? B.DIRT : B.AIR),
    isWater: () => false,
    isSolid: (x: number, y: number, z: number) => y < height(x, z),
  };
}
const free = () => false;
const SOUTH = 0; // facing +z, towards the camera

describe('where a building goes', () => {
  it('stands in front of the hero on flat ground, floor at the ground', () => {
    const s = findSpot(world(() => 12), [3, 3], 0.5, 0.5, 12, SOUTH, free)!;
    expect(s.y).toBe(12);
    // the footprint starts in front of the hero (z beyond the hero's cell), centred on x
    expect(s.z).toBeGreaterThan(0);
    expect(s.x).toBe(-1);
  });

  it('steps aside from a tree', () => {
    const tree = (x: number, z: number) => x >= -1 && x <= 1 && z >= 1 && z <= 4;
    const s = findSpot(world((x, z) => (tree(x, z) ? 18 : 12), (x, z) => (tree(x, z) ? B.LEAVES : B.GRASS)), [3, 3], 0.5, 0.5, 12, SOUTH, free)!;
    for (let x = s.x; x < s.x + 3; x++) for (let z = s.z; z < s.z + 3; z++) expect(tree(x, z)).toBe(false);
  });

  it('takes ground uneven by one block (a plinth fills it), not by two', () => {
    const one = findSpot(world((x) => (x >= 0 ? 13 : 12)), [3, 3], 0.5, 0.5, 12, SOUTH, free)!;
    expect(one.y - one.low).toBeLessThanOrEqual(1);
    const steep = findSpot(world((x, z) => 12 + ((x + z) % 2 === 0 ? 0 : 2)), [3, 3], 0.5, 0.5, 12, SOUTH, free);
    expect(steep).toBeNull();
  });

  it('never lands down a cliff or up on a hill far from the hero', () => {
    expect(findSpot(world(() => 8), [3, 3], 0.5, 0.5, 12, SOUTH, free)).toBeNull();
  });

  it('keeps off blocked ground (the house, other buildings, the doorstep)', () => {
    const blocked = (x: number, z: number) => z < 6;
    const s = findSpot(world(() => 12), [3, 3], 0.5, 0.5, 12, SOUTH, blocked)!;
    expect(s.z).toBeGreaterThanOrEqual(6);
  });
});

describe('a building the world moved under', () => {
  const rec = { id: 'tent' as const, x: 0, y: 12, z: 0, rot: 0 };
  it('still stands on dry ground no higher than its floor', () => {
    expect(standsOk(world(() => 12), rec)).toBe(true);
    expect(standsOk(world((x) => (x === 2 ? 11 : 12)), rec)).toBe(true);
  });
  it('goes back to the box where a river flows now or the ground rose over its floor', () => {
    const river = { ...world(() => 8), isWater: (_x: number, y: number) => y >= 8 && y <= 10 };
    expect(standsOk(river, rec)).toBe(false);
    expect(standsOk(world(() => 13), rec)).toBe(false);
  });
});
