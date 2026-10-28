import { describe, expect, it } from 'vitest';
import { TERRAIN_VERSION } from '../contracts';
import { SAVE_VERSION, freshSave, migrate, reconcileTerrain } from './save';

describe('save', () => {
  it('migrates a v1 save without losing progress', () => {
    const v1 = { v: 1, seed: 1, hero: 'pupsia', coins: 42, inv: { apple: 3 }, found: ['apple'], picked: ['0,0,1'], coinMilestones: [10], said: ['tip_move'], edits: { '1,2,3': 14 } };
    const s = migrate(v1);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.coins).toBe(42);
    expect(s.hero).toBe('pupsia');
    expect(s.inv.apple).toBe(3);
    expect(s.edits['1,2,3']).toBe(14);
    expect(s.said).toContain('coins_10');
    expect(s.picked).toEqual([]);
  });

  it('a fresh save is already current', () => {
    expect(migrate(freshSave() as unknown as Record<string, unknown>)).toEqual(freshSave());
  });

  it('keeps built blocks and drops dug holes when terrain changes', () => {
    const s = { ...freshSave(), terrainV: TERRAIN_VERSION - 1, edits: { a: 14, b: 0, c: 3 } };
    const r = reconcileTerrain(s, (id) => id >= 9);
    expect(r.edits).toEqual({ a: 14 });
    expect(r.terrainV).toBe(TERRAIN_VERSION);
  });
});
