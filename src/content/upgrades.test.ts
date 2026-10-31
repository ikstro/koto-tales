import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings';
import { MAX_LEVEL, UPGRADES, UPGRADE_ORDER, upgraded } from './upgrades';

describe('upgrades', () => {
  it('raise the numbers that make a building better', () => {
    expect(upgraded(BUILDINGS.generator, 1).power?.give).toBe(8);
    expect(upgraded(BUILDINGS.radar, 2).scan?.radius).toBe(80);
    expect(upgraded(BUILDINGS.wifi, 3).signal?.zone).toBe(24);
    expect(upgraded(BUILDINGS.tesla, 3).zap).toEqual({ reach: 7, every: 0.55 });
    // it still plays its own song as loud: only the reach grows
    expect(upgraded(BUILDINGS.bigspeaker, 1).music).toEqual({ hear: 35, dance: 16, song: 'rock', loud: 1.3 });
    expect(upgraded(BUILDINGS.station, 2).power).toMatchObject({ give: 30, reach: 24, arcs: true });
  });

  it('stop at the last level and leave the card itself alone', () => {
    expect(upgraded(BUILDINGS.generator, 9).power?.give).toBe(6 + 2 * MAX_LEVEL);
    expect(upgraded(BUILDINGS.generator, 0)).toBe(BUILDINGS.generator);
    expect(upgraded(BUILDINGS.lamp, 2)).toBe(BUILDINGS.lamp);
    expect(BUILDINGS.generator.power?.give).toBe(6);
  });

  it('every building in the order can go up', () => {
    for (const b of UPGRADE_ORDER) expect(UPGRADES[b]).toBeDefined();
  });
});
