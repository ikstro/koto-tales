import { describe, expect, it } from 'vitest';
import { BossHints, STONE_REMINDER_S, WISDOM_PACE, WisdomClock, calmForWisdom, nextWisdomIn, type Calm } from './pacing';

const calm: Calm = { quietS: 60, monsterDist: Infinity, inBossZone: false };

/** Runs the clock in 1 s steps; returns the seconds at which thoughts were allowed. */
function run(clock: WisdomClock, seconds: number, at: (t: number) => Calm = () => calm): number[] {
  const out: number[] = [];
  for (let t = 1; t <= seconds; t++) if (clock.step(1, at(t))) out.push(t);
  return out;
}

describe('wisdom pacing', () => {
  it('waits 5–6 minutes between thoughts', () => {
    expect(nextWisdomIn(0)).toBe(300);
    expect(nextWisdomIn(1)).toBe(360);
    const said = run(new WisdomClock(() => 0.5), 1000);
    expect(said).toEqual([330, 660, 990]);
  });

  it('never with a monster within 12 blocks, in the boss zone, or within 20 s of another line', () => {
    expect(calmForWisdom(calm)).toBe(true);
    expect(calmForWisdom({ ...calm, monsterDist: 12 })).toBe(false);
    expect(calmForWisdom({ ...calm, monsterDist: 12.5 })).toBe(true);
    expect(calmForWisdom({ ...calm, inBossZone: true })).toBe(false);
    expect(calmForWisdom({ ...calm, quietS: WISDOM_PACE.quietS - 1 })).toBe(false);
    expect(calmForWisdom({ ...calm, quietS: 0 })).toBe(false);
  });

  it('a thought that comes due in a busy moment waits for the first calm one', () => {
    // a monster is close from 300 s to 400 s
    const said = run(new WisdomClock(() => 0), 420, (t) => (t < 400 ? { ...calm, monsterDist: 5 } : calm));
    expect(said).toEqual([400]);
  });
});

describe('boss hints', () => {
  it('stone: once per fight, again only after 90 s in the zone without a lantern', () => {
    const h = new BossHints();
    expect(h.stone()).toBe(true);
    expect(h.stone()).toBe(false);
    // 60 s in the zone, a lantern, another 60 s: no reminder yet
    expect(h.tick(60, true, true)).toBe(false);
    h.lantern();
    expect(h.tick(60, true, true)).toBe(false);
    // time outside the zone does not count
    expect(h.tick(500, false, true)).toBe(false);
    expect(h.tick(STONE_REMINDER_S - 60, true, true)).toBe(true);
    // only one reminder
    expect(h.tick(1000, true, true)).toBe(false);
    expect(h.stone()).toBe(false);
  });

  it('no reminder before the first stone line or once the armour is broken', () => {
    const h = new BossHints();
    expect(h.tick(200, true, true)).toBe(false);
    h.stone();
    expect(h.tick(200, true, false)).toBe(false);
  });

  it('mouth once; stomp once per session even across fights; a new fight resets stone and mouth', () => {
    const h = new BossHints();
    expect(h.mouth()).toBe(true);
    expect(h.mouth()).toBe(false);
    expect(h.stomp()).toBe(true);
    expect(h.stomp()).toBe(false);
    h.stone();
    h.newFight();
    expect(h.stone()).toBe(true);
    expect(h.mouth()).toBe(true);
    expect(h.stomp()).toBe(false);
  });

  it('the boss card counts as the hint it explained', () => {
    const h = new BossHints();
    h.told(true);
    expect(h.stone()).toBe(false);
    expect(h.tick(STONE_REMINDER_S, true, true)).toBe(true);
    const g = new BossHints();
    g.told(false);
    expect(g.mouth()).toBe(false);
    expect(g.stone()).toBe(true);
  });
});
