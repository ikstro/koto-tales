import { describe, expect, it } from 'vitest';
import { HOME, HOUSE, HOUSE_SIZES, HOUSE_VERSION, rehousedOrigin } from './house';
import { HERO_ORDER } from './heroes';
import { B } from '../world/blocks';

describe('the house', () => {
  it('has a sleeping place for every hero, inside the walls', () => {
    for (const id of HERO_ORDER) {
      const s = HOUSE.sleepSpots[id];
      expect(s, id).toBeDefined();
      expect(s.dx).toBeGreaterThan(HOUSE.interior.x0);
      expect(s.dx).toBeLessThan(HOUSE.interior.x1);
      expect(s.dz).toBeGreaterThan(HOUSE.interior.z0);
      expect(s.dz).toBeLessThan(HOUSE.interior.z1);
    }
    // the boys share the bunk bed, Льоша on top
    expect(HOUSE.sleepSpots.lyosha.dy).toBeGreaterThan(HOUSE.sleepSpots.david.dy + 0.8);
    expect(HOUSE.sleepSpots.lyosha.dy).toBeLessThan(4 - 0.5);
  });

  it('keeps the doorway open and the inside clear but for the lantern', () => {
    const at = (x: number, y: number, z: number) => HOUSE.blocks.find((b) => b.dx === x && b.dy === y && b.dz === z)?.id;
    const door = Math.floor(HOUSE.doorSpot.dx);
    expect(at(door, 1, HOUSE.sizeZ - 1)).toBe(B.AIR);
    expect(at(door, 2, HOUSE.sizeZ - 1)).toBe(B.AIR);
    const inside = HOUSE.blocks.filter((b) => b.dy >= 1 && b.dx > 0 && b.dx < HOUSE.sizeX - 1 && b.dz > 0 && b.dz < HOUSE.sizeZ - 1 && b.id !== B.AIR);
    expect(inside.map((b) => b.id)).toEqual([B.LANTERN]);
    expect(HOUSE_SIZES[HOUSE_VERSION]).toEqual([HOUSE.sizeX, HOUSE.sizeZ]);
  });

  it('a rebuilt house keeps the old one’s centre and floor', () => {
    const old: [number, number, number] = [-4, 30, -3];
    const [x, y, z] = rehousedOrigin(old, 1);
    expect(y).toBe(30);
    expect(x + HOUSE.sizeX / 2).toBe(old[0] + 9 / 2);
    expect(z + HOUSE.sizeZ / 2).toBe(old[2] + 7 / 2);
    // the old house fits inside the new one
    expect(x).toBeLessThanOrEqual(old[0]);
    expect(z + HOUSE.sizeZ).toBeGreaterThanOrEqual(old[2] + 7);
    expect(HOME.table.dx).toBeLessThan(HOUSE.sizeX);
  });
});
