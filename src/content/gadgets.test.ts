import { describe, expect, it } from 'vitest';
import { BLOOM, bloomSpots, drumAt, findSpan, keyAt, pickSurprise, PIANO_NOTES, singAt, SURPRISES, type SpanGround } from './gadgets';
import { ITEMS } from './items';

/** A river running along z between x 4 and 9: dry banks either side. */
const river: SpanGround = {
  height: (x) => (x >= 4 && x <= 9 ? 8 : 10),
  wet: (x) => x >= 4 && x <= 9,
};
const dry: SpanGround = { height: () => 10, wet: () => false };

describe('Бабуся’s machines', () => {
  it('plays the key under the foot, nothing off the path', () => {
    expect(keyAt(10.5, 10)).toBe(0);
    expect(keyAt(17.9, 10)).toBe(PIANO_NOTES.length - 1);
    expect(keyAt(9.9, 10)).toBe(-1);
    expect(keyAt(18, 10)).toBe(-1);
  });

  it('goes round the drums and the song', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(drumAt)).toEqual([0, 1, 0, 1, 0, 1, 2]);
    expect(drumAt(7)).toBe(0);
    expect(singAt(8)).toBe(singAt(0));
  });

  it('never gives out of the surprise machine what is not an item', () => {
    for (const id of SURPRISES) expect(ITEMS[id], id).toBeTruthy();
    expect(pickSurprise(0)).toBe(SURPRISES[0]);
    expect(pickSurprise(0.999)).toBe(SURPRISES[SURPRISES.length - 1]);
    expect(pickSurprise(1)).toBe(SURPRISES[SURPRISES.length - 1]);
  });

  it('brings flowers up around the hero, not under the feet', () => {
    let n = 0;
    const spots = bloomSpots(5, 7, () => ((n = (n + 37) % 100) / 100));
    expect(spots).toHaveLength(BLOOM.flowers);
    for (const [x, z] of spots) {
      const d = Math.hypot(x - 5, z - 7);
      expect(d).toBeGreaterThanOrEqual(1.2);
      expect(d).toBeLessThanOrEqual(BLOOM.reach);
    }
  });

  it('lays the rainbow bridge from bank to bank', () => {
    const s = findSpan(river, 10, 2, 0, 10)!;
    expect(s).not.toBeNull();
    expect(s.rot).toBe(0);
    expect(s.y).toBe(10);
    expect(river.wet(s.x, s.z)).toBe(false);
    expect(river.wet(s.x + 9, s.z)).toBe(false);
  });

  it('finds no bridge where there is no water, or the river is too wide', () => {
    expect(findSpan(dry, 10, 2, 0, 10)).toBeNull();
    expect(findSpan(river, 5, 2, 0, 10)).toBeNull();
  });
});
