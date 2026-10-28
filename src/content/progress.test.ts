import { describe, expect, it } from 'vitest';
import { ENDLESS_COINS, REWARDS, TASK_CYCLE, nextReward, taskFor } from './progress';

describe('the kit box goal', () => {
  it('starts small: five monsters, then coins, places, monsters, a night, the boss', () => {
    expect([0, 1, 2, 3, 4, 5].map(taskFor)).toEqual([
      { kind: 'monsters', goal: 5 },
      { kind: 'coins', goal: 15 },
      { kind: 'places', goal: 8 },
      { kind: 'monsters', goal: 5 },
      { kind: 'nights', goal: 1 },
      { kind: 'boss', goal: 1 },
    ]);
  });

  it('asks a little more every circle, never past the cap', () => {
    const n = TASK_CYCLE.length;
    expect(taskFor(n)).toEqual({ kind: 'monsters', goal: 10 });
    expect(taskFor(n + 1)).toEqual({ kind: 'coins', goal: 25 });
    expect(taskFor(n * 50)).toEqual({ kind: 'monsters', goal: 30 });
    expect(taskFor(n * 50 + 4)).toEqual({ kind: 'nights', goal: 3 });
    expect(taskFor(n * 50 + 5)).toEqual({ kind: 'boss', goal: 1 });
  });

  it('gives the listed rewards first, the portal before anything', () => {
    expect(nextReward([], () => 0).id).toBe('portal');
    expect(REWARDS[0].ability).toBe('portal');
  });

  it('past the list: one more speaker, one more tent, in turn, while under the cap', () => {
    const got = REWARDS.map((r) => r.id);
    expect(nextReward(got, () => 1).building).toBe('boombox');
    expect(nextReward([...got, '+boombox'], () => 1).building).toBe('tent');
    expect(nextReward([...got, '+boombox', '+tent'], () => 1).building).toBe('boombox');
    // speakers at the cap: the tent comes instead
    expect(nextReward(got, (b) => (b === 'boombox' ? 5 : 1)).building).toBe('tent');
  });

  it('when everything is at its cap the box pours out coins, forever', () => {
    const r = nextReward(REWARDS.map((x) => x.id), () => 99);
    expect(r.coins).toBe(ENDLESS_COINS);
    expect(r.id).toBe('+coins');
  });
});
