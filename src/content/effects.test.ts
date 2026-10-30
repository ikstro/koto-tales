import { describe, expect, it } from 'vitest';
import { EFFECTS, EffectTimers, resolve } from './effects';

describe('effects', () => {
  it('fills in the defaults of a kind', () => {
    expect(resolve({ kind: 'peace' })).toEqual({ kind: 'peace', for: 10, reach: 9 });
    expect(resolve({ kind: 'peace', for: 4 })).toEqual({ kind: 'peace', for: 4, reach: 9 });
    expect(resolve({ kind: 'heal' })).toEqual({ kind: 'heal', for: 0, reach: 0 });
  });

  it('a timed effect runs down and ends; one at once never lingers', () => {
    const t = new EffectTimers();
    t.start({ kind: 'peace', for: 10 });
    t.start({ kind: 'heal' });
    expect(t.reach('peace')).toBe(9);
    expect(t.list).toHaveLength(1);
    t.tick(9.5);
    expect(t.left('peace')).toBeCloseTo(0.5);
    t.tick(1);
    expect(t.reach('peace')).toBeNull();
    expect(t.list).toEqual([]);
  });

  it('the widest of a kind wins while two run', () => {
    const t = new EffectTimers();
    t.start({ kind: 'light', for: 5, reach: 6 });
    t.start({ kind: 'light', for: 20, reach: 12 });
    expect(t.reach('light')).toBe(12);
    t.tick(6);
    expect(t.reach('light')).toBe(12);
    expect(t.left('light')).toBeCloseTo(14);
  });

  it('going home cannot be a lasting power', () => {
    expect(EFFECTS.home.always).toBe(false);
    for (const k of ['heal', 'fast', 'peace', 'freeze', 'light'] as const) expect(EFFECTS[k].always).toBe(true);
  });
});
