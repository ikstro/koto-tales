import { describe, expect, it } from 'vitest';
import { ENDLESS_COINS, REWARDS, TASK_CYCLE, nextReward, taskFor } from './progress';

describe('the kit box goal', () => {
  it('starts small: five monsters, then coins, places, monsters, a night, the boss', () => {
    expect([0, 1, 2, 3, 4, 5].map((l) => taskFor(l))).toEqual([
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

  it('then power: the windmill with four poles, lamps, the sun, a battery, the generator', () => {
    expect(nextReward(['portal'], () => 0)).toMatchObject({ id: 'windmill', items: [['windmill', 1], ['pole', 4]] });
    expect(REWARDS.map((r) => r.id).slice(0, 6)).toEqual(['portal', 'windmill', 'lamps', 'solar', 'battery', 'generator']);
  });

  it('then the disco and defence, one each', () => {
    expect(REWARDS.map((r) => r.id).slice(6)).toEqual(['bigspeaker', 'dancefloor', 'trafficlight', 'discoball', 'tesla', 'djconsole']);
  });

  it('past the list: more of each building in turn, while under the cap', () => {
    const got = REWARDS.map((r) => r.id);
    const first = (g: string[], owned: (b: string) => number) => nextReward(g, owned).items?.[0];
    expect(first(got, () => 1)).toEqual(['pole', 2]);
    expect(first([...got, '+pole'], () => 1)).toEqual(['boombox', 1]);
    expect(first([...got, '+pole', '+boombox'], () => 1)).toEqual(['lamp', 1]);
    // poles at the cap: the next one in turn comes instead
    expect(first(got, (b) => (b === 'pole' ? 20 : 1))).toEqual(['boombox', 1]);
  });

  it('once the dance floor is out, every other circle asks for dancing instead of coins', () => {
    const got = ['portal', 'windmill', 'dancefloor'];
    const n = TASK_CYCLE.length;
    expect(taskFor(1, got).kind).toBe('coins');
    expect(taskFor(n + 1, got)).toEqual({ kind: 'dance', goal: 30 });
    expect(taskFor(2 * n + 1, got).kind).toBe('coins');
    expect(taskFor(n + 1, ['portal']).kind).toBe('coins');
  });

  it('once the windmill is out, one task a circle is lighting a lighthouse', () => {
    expect(taskFor(3, ['portal']).kind).toBe('monsters');
    expect(taskFor(3, ['portal', 'windmill'])).toEqual({ kind: 'lighthouse', goal: 1 });
    expect(taskFor(9, ['portal', 'windmill']).kind).toBe('lighthouse');
    expect(taskFor(0, ['portal', 'windmill']).kind).toBe('monsters');
  });

  it('when everything is at its cap the box pours out coins, forever', () => {
    const r = nextReward(REWARDS.map((x) => x.id), () => 99);
    expect(r.coins).toBe(ENDLESS_COINS);
    expect(r.id).toBe('+coins');
  });
});
