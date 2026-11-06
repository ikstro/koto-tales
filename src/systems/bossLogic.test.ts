import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_KINDS, BossBrain, biteSpot, bossMaxHp, bossScale, lakeSpots, nextBossKind, pickLake, pickSite, shouldReturn, trapped, type BossEvent, type GroundAt } from './bossLogic';

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

  it('baits: each one cracks the armour, the third breaks it, the same spot counts once', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1 });
    expect(b.addBait('1,2,3')).toBe('crack');
    expect(b.addBait('1,2,3')).toBe(null);
    expect(b.addBait('4,2,3')).toBe('crack');
    expect(b.armored).toBe(true);
    expect(b.addBait('7,2,3')).toBe('broken');
    expect(b.armored).toBe(false);
    expect(b.addBait('9,2,3')).toBe(null);
    expect(b.baits).toHaveLength(BOSS.baits);
  });

  it('mouth: after the armour breaks it opens every ~5 s for ~1.6 s; only shots into the open mouth hurt', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1, baits: ['a', 'b'] });
    b.addBait('c');
    const ev = run(b, 14, 100).filter((x) => x.e.startsWith('mouth'));
    // opens soon after breaking, then every 5 s closed + 1.6 s open
    expect(ev[0].e).toBe('mouth-open');
    expect(ev[0].t).toBeLessThanOrEqual(1.25);
    expect(ev[1].e).toBe('mouth-close');
    near(ev[1].t - ev[0].t, BOSS.mouthOpen);
    expect(ev[2].e).toBe('mouth-open');
    near(ev[2].t - ev[1].t, BOSS.mouthEvery);

    const c = new BossBrain({ maxHp: 30, tempo: 1, baits: ['a', 'b', 'c'] });
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
    const easy = new BossBrain({ maxHp: 30, tempo: 0.8, baits: ['a', 'b', 'c'] });
    expect(easy.mouthOpenTime).toBeCloseTo(2);
    expect(easy.mouthEvery).toBeCloseTo(6.25);
  });

  it('stomp: only with a hero close by, every 7вЂ“9 s, warned 1 s ahead', () => {
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

  it('two giants: whole profiles, and either one may come back after a defeat', () => {
    expect(Object.keys(BOSS_KINDS).sort()).toEqual(['eater', 'nessie']);
    for (const [kind, p] of Object.entries(BOSS_KINDS)) {
      expect(p.model, kind).toBeTruthy();
      expect([p.model], kind).toEqual(['landEater', 'nessie'].includes(p.model) ? [p.model] : []);
      expect([p.bait], kind).toContain(p.bait);
      expect(p.crumble.length, kind).toBeGreaterThanOrEqual(3);
      expect(!!p.water, kind).toBe(kind === 'nessie');
      expect(!!p.bitesGround, kind).toBe(kind === 'eater');
      expect(p.icon, kind).toBeTruthy();
      expect(p.face, kind).toBeTruthy();
    }
    // a long enough coin run brings both giants up
    const seen = new Set<string>();
    let r = 123456789;
    for (let i = 0; i < 60; i++) {
      r = (r * 1664525 + 1013904223) % 4294967296;
      seen.add(nextBossKind(() => r / 4294967296));
    }
    expect(seen).toEqual(new Set(['eater', 'nessie']));
  });

  it('the lair is the same for the same world and level, 140вЂ“180 blocks from home, a new place each level', () => {
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

describe('music and the boss', () => {
  it('dances 6 s to music (no stomp meanwhile), then rests 30 s', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1, rand: () => 0 });
    const ev: string[] = [];
    for (let t = 0; t < 6.1; t += 0.05) ev.push(...b.step(0.05, 2, BOSS.stompRange, true));
    expect(ev[0]).toBe('dance');
    expect(ev).not.toContain('stomp-warn');
    expect(ev).toContain('dance-end');
    expect(b.dance).toBe(0);
    const later: string[] = [];
    for (let t = 0; t < 29; t += 0.05) later.push(...b.step(0.05, 20, BOSS.stompRange, true));
    expect(later).not.toContain('dance');
    for (let t = 0; t < 1.5; t += 0.05) later.push(...b.step(0.05, 20, BOSS.stompRange, true));
    expect(later).toContain('dance');
  });

  it('waits for its open mouth to shut before it dances', () => {
    const b = new BossBrain({ maxHp: 30, tempo: 1, baits: ['a', 'b', 'c'] });
    b.forceMouth();
    b.step(0.05, 20);
    expect(b.mouthOpen).toBe(true);
    expect(b.step(0.05, 20, BOSS.stompRange, true)).not.toContain('dance');
  });
});

/** Flat ground 10 with some columns set; `cells` maps "x,z" to a height. */
const field = (cells: Record<string, number>): GroundAt => (x, z) => cells[`${x},${z}`] ?? 10;

describe('the boss never shuts anyone in', () => {
  it('a hole two deep is a trap; one deep, or a long ramp down, is not', () => {
    expect(trapped(field({ '0,0': 8 }), 0, 0)).toBe(true);
    expect(trapped(field({ '0,0': 9 }), 0, 0)).toBe(false);
    expect(trapped(field({ '0,0': 8, '1,0': 8 }), 0, 0)).toBe(true);
    expect(trapped(field({ '0,0': 8, '1,0': 9 }), 0, 0)).toBe(false);
    expect(trapped(field({ '0,0': 8 }), 0, 0, 5, (x, z) => x === 0 && z === 0)).toBe(false);
  });

  it('a bite lands where it leaves a way out: the spot, else the highest neighbour', () => {
    expect(biteSpot(field({}), 0, 0)).toEqual([0, 0]);
    expect(biteSpot(field({ '0,0': 9 }), 0, 0)).not.toEqual([0, 0]);
    // biting the same spot over and over makes a wide shallow bowl, never a shaft
    const cells: Record<string, number> = {};
    const g = field(cells);
    for (let i = 0; i < 40; i++) {
      const spot = biteSpot(g, 0, 0);
      if (!spot) break;
      cells[`${spot[0]},${spot[1]}`] = g(spot[0], spot[1]) - 1;
      for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) expect(trapped(g, x, z)).toBe(false);
    }
  });
});

describe('the search for a lake', () => {
  it('goes round the house from the lair ring out to its reach', () => {
    const home = { x: 10, z: -20 };
    const spots = lakeSpots(home);
    const far = spots.map(([x, z]) => Math.hypot(x - home.x, z - home.z));
    expect(Math.min(...far)).toBeGreaterThan(BOSS.siteMin - 1);
    expect(Math.max(...far)).toBeLessThan(BOSS.lakeReach + 1);
    expect(far[0]).toBeLessThan(far[far.length - 1]);
    expect(spots.length).toBeLessThan(3000);
  });
  it('gives nothing when there is no lake, and the same lake for the same level', () => {
    expect(pickLake([], 3)).toBeNull();
    expect(pickLake(['a', 'b', 'c'], 2)).toBe(pickLake(['a', 'b', 'c'], 2));
    expect(pickLake(['a', 'b', 'c'], 1)).not.toBe(pickLake(['a', 'b', 'c'], 2));
    // the far rings wait until there is nothing nearer
    const rings = Array.from({ length: 100 }, (_, i) => i);
    for (let level = 1; level < 30; level++) expect(pickLake(rings, level)).toBeLessThan(BOSS.lakeChoice);
  });
});
