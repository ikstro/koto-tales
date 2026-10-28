import { describe, expect, it } from 'vitest';
import { BossHints, MOUTH_REPEAT_S, STONE_REPEAT_S, WISDOM_PACE, WisdomClock, type Calm } from './pacing';

const calm: Calm = { quietS: 5, monsterDist: Infinity, inBossZone: false };

/** Runs the clock in 1 s steps; returns the seconds at which thoughts were allowed. */
function run(clock: WisdomClock, seconds: number, at: (t: number) => Calm = () => calm): number[] {
  const out: number[] = [];
  for (let t = 1; t <= seconds; t++) if (clock.step(1, at(t))) out.push(t);
  return out;
}

describe('wisdom pacing', () => {
  it('a thought every ~2–3 minutes', () => {
    const said = run(new WisdomClock(() => 0.5), 600);
    const mid = (WISDOM_PACE.minS + WISDOM_PACE.maxS) / 2;
    expect(said[0]).toBe(Math.ceil(mid));
    expect(said.length).toBe(Math.floor(600 / mid));
  });

  it('near monsters and in the boss zone she still talks', () => {
    const said = run(new WisdomClock(() => 0), 120, () => ({ quietS: 5, monsterDist: 3, inBossZone: true }));
    expect(said).toEqual([WISDOM_PACE.minS]);
  });

  it('never over another line: waits until it ends', () => {
    const said = run(new WisdomClock(() => 0), 130, (t) => ({ ...calm, quietS: t < 110 ? 0 : 1 }));
    expect(said).toEqual([110]);
  });
});

describe('boss hints', () => {
  const step = (h: BossHints, s: number) => {
    for (let i = 0; i < s; i++) h.tick(1, true, true);
  };

  it('stone repeats while arrows bounce, at most every 25 s', () => {
    const h = new BossHints();
    expect(h.stone()).toBe(true);
    step(h, STONE_REPEAT_S - 1);
    expect(h.stone()).toBe(false);
    step(h, 1);
    expect(h.stone()).toBe(true);
  });

  it('mouth repeats at most every 35 s; stomp once per session even across fights', () => {
    const h = new BossHints();
    expect(h.mouth()).toBe(true);
    step(h, MOUTH_REPEAT_S - 1);
    expect(h.mouth()).toBe(false);
    step(h, 1);
    expect(h.mouth()).toBe(true);
    expect(h.stomp()).toBe(true);
    h.newFight();
    expect(h.stomp()).toBe(false);
    expect(h.mouth()).toBe(true);
  });

  it('the boss card counts as the hint it explained, then the normal pause applies', () => {
    const h = new BossHints();
    h.told(true);
    expect(h.stone()).toBe(false);
    step(h, STONE_REPEAT_S);
    expect(h.stone()).toBe(true);
  });
});
