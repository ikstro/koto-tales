import { describe, expect, it } from 'vitest';
import { BOSS, BossBrain, bossMaxHp, bossScale, pickSite, shouldReturn, type BossEvent } from './bossLogic';

/** Equal within one simulation step. */
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.051);

/** Runs the brain for `secs` in small steps; returns every event with its time. */
function run(b: BossBrain, secs: number, heroDist: number, t0 = 0): { t: number; e: BossEvent }[] {
  const out: { t: number; e: BossEvent }[] = [];
  const dt = 0.05;
  for (let t = 0; t < secs - 1e-9; t += dt) for (const e of b.step(dt, heroDist)) out.push({ t: +(t0 + t + dt).toFixed(2), e });
  return out;
}

describe('boss fight', () => {
  it('health: 30 on normal, +30% per level, scaled by difficulty; +10% size per level', () => {
    expect(bossMaxHp(1, 1)).toBe(30);
    expect(bossMaxHp(2, 1)).toBe(39);
    expect(bossMaxHp(1, 0.7)).toBe(21);
    expect(bossMaxHp(3, 1.3)).toBe(62);
    expect(bossScale(1)).toBe(1);
    expect(bossScale(3)).toBeCloseTo(1.2);
  });

  it('armour: arrows and bolts bounce, the mouth never opens', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1, rand: () => 0 });
    expect(b.armored).toBe(true);
    const ev = run(b, 30, 100);
    expect(ev.filter((x) => x.e === 'mouth-open')).toEqual([]);
    expect(b.hit('mouth', 3)).toBe('bounce');
    expect(b.hit('body', 3)).toBe('bounce');
    expect(b.hp).toBe(30);
  });

  it('lanterns: each one cracks the armour, the third breaks it, the same spot counts once', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1 });
    expect(b.addLantern('1,2,3')).toBe('crack');
    expect(b.addLantern('1,2,3')).toBe(null);
    expect(b.addLantern('4,2,3')).toBe('crack');
    expect(b.armored).toBe(true);
    expect(b.addLantern('7,2,3')).toBe('broken');
    expect(b.armored).toBe(false);
    expect(b.addLantern('9,2,3')).toBe(null);
    expect(b.lanterns).toHaveLength(BOSS.lanterns);
  });

  it('mouth: after the armour breaks it opens every ~5 s for ~1.6 s; only shots into the open mouth hurt', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1, lanterns: ['a', 'b'] });
    b.addLantern('c');
    const ev = run(b, 14, 100).filter((x) => x.e.startsWith('mouth'));
    // opens soon after breaking, then every 5 s closed + 1.6 s open
    expect(ev[0].e).toBe('mouth-open');
    expect(ev[0].t).toBeLessThanOrEqual(1.25);
    expect(ev[1].e).toBe('mouth-close');
    near(ev[1].t - ev[0].t, BOSS.mouthOpen);
    expect(ev[2].e).toBe('mouth-open');
    near(ev[2].t - ev[1].t, BOSS.mouthEvery);

    const c = new BossBrain({ maxHp: 30, tempo: 1, lanterns: ['a', 'b', 'c'] });
    expect(c.hit('mouth', 1)).toBe('bounce'); // shut
    c.forceMouth();
    c.step(0.01, 100);
    expect(c.mouthOpen).toBe(true);
    expect(c.hit('body', 3)).toBe('bounce');
    expect(c.hit('mouth', 1)).toBe('hurt');
    expect(c.hp).toBe(29);
    expect(c.hit('mouth', 100)).toBe('defeated');
    expect(c.hp).toBe(0);
    expect(c.hit('mouth', 1)).toBe('bounce');
  });

  it('an easier tempo opens the mouth for longer', () => {
    const easy = new BossBrain({ maxHp: 30, tempo: 0.8, lanterns: ['a', 'b', 'c'] });
    expect(easy.mouthOpenTime).toBeCloseTo(2);
    expect(easy.mouthEvery).toBeCloseTo(6.25);
  });

  it('stomp: only with a hero close by, every 7–9 s, warned 1 s ahead', () => {
    const far = new BossBrain({ maxHp: 30, tempo: 1, rand: () => 0 });
    expect(run(far, 30, BOSS.stompRange + 1)).toEqual([]);

    const b = new BossBrain({ maxHp: 30, tempo: 1, rand: () => 0.5 });
    const ev = run(b, 20, 3);
    expect(ev.map((x) => x.e)).toEqual(['stomp-warn', 'stomp', 'stomp-warn', 'stomp']);
    near(ev[0].t, 8);
    near(ev[1].t - ev[0].t, BOSS.stompWarn);
    near(ev[2].t - ev[1].t, 8);
    for (const r of [0, 0.999]) {
      const x = new BossBrain({ maxHp: 30, tempo: 1, rand: () => r });
      const t = run(x, 12, 3)[0].t;
      expect(t).toBeGreaterThanOrEqual(7 - 0.06);
      expect(t).toBeLessThanOrEqual(9 + 0.06);
    }
  });

  it('comes back 3 days after being beaten', () => {
    expect(shouldReturn(5, null)).toBe(false);
    expect(shouldReturn(4, 2)).toBe(false);
    expect(shouldReturn(5, 2)).toBe(true);
    expect(shouldReturn(9, 2)).toBe(true);
  });

  it('the lair is the same for the same world and level, 140–180 blocks from home, a new place each level', () => {
    const home = { x: 12, z: -8 };
    const a = pickSite(20261128, 1, home, () => true);
    expect(pickSite(20261128, 1, home, () => true)).toEqual(a);
    const d = Math.hypot(a[0] - home.x, a[1] - home.z);
    expect(d).toBeGreaterThanOrEqual(BOSS.siteMin);
    expect(d).toBeLessThanOrEqual(BOSS.siteMax);
    const b = pickSite(20261128, 2, home, () => true);
    expect(b).not.toEqual(a);
    expect(pickSite(7, 1, home, () => true)).not.toEqual(a);
    // a wet first candidate is skipped for the next dry one
    let calls = 0;
    const c = pickSite(20261128, 1, home, () => ++calls > 3);
    expect(calls).toBe(4);
    expect(c).not.toEqual(a);
  });
});
