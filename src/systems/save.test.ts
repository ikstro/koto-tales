import { describe, expect, it } from 'vitest';
import { TERRAIN_VERSION } from '../contracts';
import { SAVE_VERSION, freshSave, migrate, reconcileTerrain, restartSave } from './save';

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

  it('migrates v5 → v6: a full kit, the first task counted from now, the bricks kept in the world', () => {
    const v5 = { ...freshSave(), v: 5, coins: 120, buildBlock: 18, edits: { '1,2,3': 18 } } as Record<string, unknown>;
    for (const k of ['kit', 'placed', 'progress', 'portal', 'stats']) delete v5[k];
    const s = migrate(v5);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.kit).toMatchObject({ tent: 1, boombox: 1 });
    expect(s.placed).toEqual([]);
    expect(s.progress).toEqual({ level: 0, kind: 'monsters', start: null, got: [] });
    expect(s.portal).toBeNull();
    expect(s.stats).toEqual({ coins: 120, slept: 0, danced: 0 });
    expect('buildBlock' in s).toBe(false);
    expect(s.edits['1,2,3']).toBe(18);
  });

  it('migrates v6 → v7: no lighthouse lit yet, everything else kept', () => {
    const v6 = { ...freshSave(), v: 6, coins: 9, placed: [{ id: 'tent', x: 1, y: 12, z: 2, rot: 0 }] } as Record<string, unknown>;
    delete v6.lit;
    const s = migrate(v6);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.lit).toEqual([]);
    expect(s.placed).toEqual([{ id: 'tent', x: 1, y: 12, z: 2, rot: 0 }]);
    expect(s.coins).toBe(9);
  });

  it('migrates v7 → v8: dancing counted from now, the first song', () => {
    const v7 = { ...freshSave(), v: 7, stats: { coins: 40, slept: 2 } } as Record<string, unknown>;
    delete v7.song;
    const s = migrate(v7);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.stats).toEqual({ coins: 40, slept: 2, danced: 0 });
    expect(s.song).toBe(0);
  });

  it('migrates v8 → v9: no village met yet', () => {
    const v8 = { ...freshSave(), v: 8 } as Record<string, unknown>;
    delete v8.villages;
    const s = migrate(v8);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.villages).toEqual({});
  });

  it('migrates v9 → v10: no castle met yet', () => {
    const v9 = { ...freshSave(), v: 9 } as Record<string, unknown>;
    delete v9.castles;
    const s = migrate(v9);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.castles).toEqual({});
  });

  it('migrates v10 → v11: nothing upgraded yet', () => {
    const v10 = { ...freshSave(), v: 10 } as Record<string, unknown>;
    delete v10.upgrades;
    const s = migrate(v10);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.upgrades).toEqual({});
  });

  it('migrates v11 → v12: a story under way skips the prologue, no tale yet', () => {
    const v11 = { ...freshSave(), v: 11 } as Record<string, unknown>;
    delete v11.tales;
    const s = migrate(v11);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.tales).toEqual({ cur: null, step: 0, got: 0, done: ['fish'], after: 0 });
    expect(freshSave().tales.done).toEqual([]);
  });

  it('migrates v12 → v13: no artifact found, no companion met, everything else kept', () => {
    const v12 = { ...freshSave(), v: 12, coins: 42, found: ['apple', 't:fish'], inv: { apple: 3 } } as Record<string, unknown>;
    delete v12.artifacts;
    delete v12.companions;
    const s = migrate(v12);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.artifacts).toEqual([]);
    expect(s.companions).toEqual([]);
    expect(s.coins).toBe(42);
    expect(s.found).toEqual(['apple', 't:fish']);
    expect(s.inv).toEqual({ apple: 3 });
  });

  it('migrates v13 → v14: a house already built is the first one (rebuilt on load), no house stays unbuilt', () => {
    const built = { ...freshSave(), v: 13, house: [-4, 30, -3], placed: [{ id: 'tent', x: 2, y: 31, z: 2, rot: 0 }] } as Record<string, unknown>;
    delete built.houseV;
    const s = migrate(built);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.houseV).toBe(1);
    expect(s.house).toEqual([-4, 30, -3]);
    expect(s.placed).toHaveLength(1);
    const none = { ...freshSave(), v: 13 } as Record<string, unknown>;
    delete none.houseV;
    expect(migrate(none).houseV).toBe(0);
  });

  it('keeps the boss as it was left (health, lanterns, beaten day)', () => {
    const boss = { level: 2, site: [150, -20] as [number, number], hp: 12, lanterns: ['1,2,3', '4,5,6'], defeatedDay: null, eatenAt: [150, -20] as [number, number], bites: 5 };
    const s = migrate({ ...freshSave(), day: 7, boss } as unknown as Record<string, unknown>);
    expect(s.day).toBe(7);
    expect(s.boss).toEqual(boss);
  });

  it('starting over keeps only sound and difficulty', () => {
    const old = { ...freshSave(), coins: 120, difficulty: 'hard' as const, soundOn: false, found: ['c:elves'], kit: { ...freshSave().kit, tent: 3 } };
    old.progress.level = 9;
    const s = restartSave(old);
    expect(s).toEqual({ ...freshSave(), difficulty: 'hard', soundOn: false });
    expect(s.seed).toBe(old.seed);
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
