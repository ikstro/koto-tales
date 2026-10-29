import { describe, expect, it } from 'vitest';
import { covers, netAt, signalNets, sweepChunks, type SignalNode } from './signal';

const at = (x: number, z = 0, zone = 12): SignalNode => ({ x, z, zone });

describe('signal', () => {
  it('antennas whose zones touch make one net, through others; far ones stay apart', () => {
    const nodes = [at(0), at(20), at(44), at(100)];
    expect(signalNets(nodes).map((n) => n.sort())).toEqual([[0, 1, 2], [3]]);
  });

  it('a net covers what is inside any of its zones', () => {
    const nodes = [at(0), at(20), at(100)];
    const nets = signalNets(nodes);
    expect(covers(nodes, nets[0], 30, 0)).toBe(true);
    expect(covers(nodes, nets[0], 0, 13)).toBe(false);
    expect(netAt(nodes, nets, 31, 0)).toBe(0);
    expect(netAt(nodes, nets, 95, 5)).toBe(1);
    expect(netAt(nodes, nets, 60, 0)).toBe(-1);
  });

  it('the radar sweep clears every chunk in its circle once over a full turn', () => {
    const seen = new Map<string, number>();
    for (let k = 0; k < 16; k++) {
      for (const [cx, cz] of sweepChunks(8, 8, 48, (k / 16) * Math.PI * 2, ((k + 1) / 16) * Math.PI * 2)) {
        const key = `${cx},${cz}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    expect(seen.size).toBeGreaterThan(25);
    expect(seen.get('0,0')).toBe(1); // its own chunk too
  });
});
