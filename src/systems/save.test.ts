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

  it('migrates v2 → v3: normal difficulty, album monsters counted once, sound on', () => {
    const v2 = { ...freshSave(), v: 2, found: ['apple', 'm:zombie', 'm:spider'] } as Record<string, unknown>;
    delete v2.difficulty;
    delete v2.defeated;
    delete v2.soundOn;
    const s = migrate(v2);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.difficulty).toBe('normal');
    expect(s.defeated).toEqual({ zombie: 1, spider: 1 });
    expect(s.soundOn).toBe(true);
  });

  it('migrates v3 → v4: the 5×5 chunks around the house are explored', () => {
    const v3 = { ...freshSave(), v: 3, house: [40, 12, -20] } as Record<string, unknown>;
    delete v3.explored;
    const s = migrate(v3);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.explored).toHaveLength(25);
    // house corner + 4 → block (44, -16) → chunk (2, -1)
    expect(s.explored).toContain('2,-1');
    expect(s.explored).toContain('0,-3');
    expect(s.explored).toContain('4,1');
    expect(s.explored).not.toContain('5,1');
  });

  it('migrates v4 → v5: day 0 and a level-1 boss not placed yet, nothing else lost', () => {
    const v4 = { ...freshSave(), v: 4, coins: 77, explored: ['0,0'], edits: { '1,2,3': 24 } } as Record<string, unknown>;
    delete v4.day;
    delete v4.boss;
    const s = migrate(v4);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.day).toBe(0);
    expect(s.boss).toEqual({ level: 1, site: null, hp: null, lanterns: [], defeatedDay: null, eatenAt: null, bites: 0 });
    expect(s.coins).toBe(77);
    expect(s.explored).toEqual(['0,0']);
    expect(s.edits['1,2,3']).toBe(24);
  });

  it('keeps the boss as it was left (health, lanterns, beaten day)', () => {
    const boss = { level: 2, site: [150, -20] as [number, number], hp: 12, lanterns: ['1,2,3', '4,5,6'], defeatedDay: null, eatenAt: [150, -20] as [number, number], bites: 5 };
    const s = migrate({ ...freshSave(), day: 7, boss } as unknown as Record<string, unknown>);
    expect(s.day).toBe(7);
    expect(s.boss).toEqual(boss);
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
