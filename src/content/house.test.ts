import { describe, expect, it } from 'vitest';
import { DOOR, HOME, HOUSE, HOUSE_SIZES, HOUSE_VERSION, rehousedOrigin } from './house';
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

  it('a v2 house (13×9) is pulled down inside the new one, around the same centre', () => {
    const old: [number, number, number] = [10, 20, -7];
    const [x, , z] = rehousedOrigin(old, 2);
    expect(HOUSE_SIZES[2]).toEqual([13, 9]);
    expect(x + Math.floor(HOUSE.sizeX / 2)).toBe(old[0] + Math.floor(13 / 2));
    expect(z + Math.floor(HOUSE.sizeZ / 2)).toBe(old[2] + Math.floor(9 / 2));
    expect(x).toBeLessThanOrEqual(old[0]);
    expect(z).toBeLessThanOrEqual(old[2]);
    expect(x + HOUSE.sizeX).toBeGreaterThanOrEqual(old[0] + 13);
    expect(z + HOUSE.sizeZ).toBeGreaterThanOrEqual(old[2] + 9);
  });

  it('puts the playroom toys in the left part, inside the walls, none on another', () => {
    const half: Record<keyof typeof HOME.playroom, [number, number]> = {
      slide: [1, 1],
      ballPit: [1.2, 1.2],
      chess: [1.25, 0.6],
      easel: [0.5, 0.5],
      toyRug: [1.5, 1],
      tv: [0.7, 0.25],
    };
    const boxes = Object.entries(HOME.playroom).map(([id, p]) => {
      const [hx, hz] = half[id as keyof typeof HOME.playroom];
      return { id, x0: p.dx - hx, x1: p.dx + hx, z0: p.dz - hz, z1: p.dz + hz };
    });
    // the bedroom starts at the bunk and the aquarium
    const bedroom = Math.min(HOME.bunk.dx, HOME.aquarium.dx) - 0.6;
    for (const b of boxes) {
      expect(b.x0, b.id).toBeGreaterThanOrEqual(HOUSE.interior.x0);
      expect(b.x1, b.id).toBeLessThanOrEqual(bedroom);
      expect(b.z0, b.id).toBeGreaterThanOrEqual(HOUSE.interior.z0);
      expect(b.z1, b.id).toBeLessThanOrEqual(HOUSE.interior.z1);
    }
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
    // the TV against the back wall, the slide in the back corner
    expect(HOME.playroom.tv.dz).toBeLessThan(2);
    expect(HOME.playroom.slide.dz).toBeLessThan(3);
  });

  it('lays out the yard from the door', () => {
    expect(HOUSE.campfireSpot.dx).toBe(DOOR.dx);
    expect(HOME.postbox.dz).toBeGreaterThan(HOUSE.sizeZ);
    for (const l of HOME.fireLogs) expect(l.dz).toBeGreaterThan(HOUSE.sizeZ + 1);
    expect(Math.floor(HOUSE.doorSpot.dx)).toBe(Math.floor(DOOR.dx));
    // the lamp hangs in the middle of the rooms
    expect(Math.abs(HOME.lamp.dx - HOUSE.sizeX / 2)).toBeLessThan(1);
  });
});
