import { describe, expect, it } from 'vitest';
import { BUILDINGS, LIGHTHOUSE_POWER } from './buildings';
import { networks, tick, wires, type PowerNode } from './power';

const at = (id: keyof typeof BUILDINGS, x: number, z = 0, charge = 0): PowerNode => ({ x, y: 12, z, card: BUILDINGS[id].power!, charge });
const lighthouse = (x: number): PowerNode => ({ x, y: 12, z: 0, card: LIGHTHOUSE_POWER, charge: 0 });
const all = (n: PowerNode[]) => n.map((_, i) => i);

describe('power', () => {
  it('joins what stands close, through poles, and nothing further', () => {
    const nodes = [at('windmill', 0), at('pole', 6), at('pole', 12), at('lamp', 18), at('lamp', 40)];
    const nets = networks(nodes);
    expect(nets.map((n) => n.sort())).toEqual([[0, 1, 2, 3], [4]]);
    expect(wires(nodes, nets[0])).toHaveLength(3);
  });

  it('a big machine reaches further than a building', () => {
    const castle: PowerNode = { x: 0, y: 12, z: 0, card: { take: 3, reach: 10 }, charge: 0 };
    expect(networks([castle, at('pole', 9)])).toHaveLength(1);
    expect(networks([at('windmill', 0), at('pole', 9)])).toHaveLength(2);
  });

  it('a windmill lights a lighthouse; three lamps are too much for it', () => {
    const lh = [at('windmill', 0), lighthouse(5)];
    expect(tick(lh, all(lh), 1, 0.25)).toMatchObject({ on: true, low: false });
    const lamps = [at('windmill', 0), at('lamp', 3), at('lamp', 6), at('lamp', 9)];
    expect(tick(lamps, all(lamps), 1, 0.25)).toMatchObject({ on: false, low: true, give: 2, take: 3 });
  });

  it('the sun works by day only', () => {
    const n = [at('solar', 0), at('lamp', 3)];
    expect(tick(n, all(n), 1, 0.25).on).toBe(true);
    expect(tick(n, all(n), 0, 0.25).low).toBe(true);
  });

  it('a battery keeps the day’s spare and gets the lamps through the night', () => {
    const n = [at('solar', 0), at('battery', 3), at('lamp', 6), at('lamp', 7)];
    // a day of sun: 3 given, 2 taken, 1 spare a second → full after 200 s
    for (let s = 0; s < 180; s += 0.25) tick(n, all(n), 1, 0.25);
    expect(n[1].charge).toBe(180);
    for (let s = 0; s < 60; s += 0.25) tick(n, all(n), 1, 0.25);
    expect(n[1].charge).toBe(200);
    // night: 2 a second out of the battery, for 100 s
    for (let s = 0; s < 90; s += 0.25) expect(tick(n, all(n), 0, 0.25).on).toBe(true);
    expect(n[1].charge).toBeCloseTo(20);
    for (let s = 0; s < 10; s += 0.25) tick(n, all(n), 0, 0.25);
    expect(tick(n, all(n), 0, 0.25)).toMatchObject({ on: false, low: true });
  });

  it('a generator carries a lot', () => {
    const n = [at('generator', 0), lighthouse(4), at('lamp', 6), at('lamp', 7), at('lamp', 8), at('lamp', 9)];
    expect(tick(n, all(n), 0, 0.25)).toMatchObject({ on: true, give: 6, take: 6 });
  });
});
