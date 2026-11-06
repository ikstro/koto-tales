import { describe, expect, it } from 'vitest';
import lines from './lines.json';
import { SAVE_VERSION, migrate } from '../systems/save';
import { hostAfterMove, hostLine, HOSTS, noteDue, otherHost, SHARED_LINES } from './babusia';
import { addGlade, BABUSIA, BABUSIA_BLOCKS, BABUSIA_HOUSE, centreOf, DISHES, dishOfDay, flowerSpots, freshBabusia, GARDEN, inSafeRing, judgeSite, movesTomorrow, routineAt, shouldMove, WALK_LOOP, YARD, type SiteProbe, nextJoke, POLE, poleAngle, poleDay, tapReply, BABUSIA_SPOTS, CHAIR_FLOWERS, chairFlowerSpots, PRESENTS, presentDue, strollDue } from './babusia';
import { TALES } from './tales';
import { B } from '../world/blocks';

const flat = (h = 10): SiteProbe => ({ height: () => h, wet: () => false, tree: () => false });

describe('what she brings from her trips', () => {
  const key = (g: (typeof PRESENTS)[number]) => ('building' in g ? g.building : g.item);
  it('brings each thing once, and nothing a tale of hers already gives', () => {
    const ids = PRESENTS.map(key);
    expect(new Set(ids).size).toBe(ids.length);
    const fromTales = new Set(TALES.flatMap((t) => (t.gifts ?? []).map(key)));
    expect(ids.filter((id) => fromTales.has(id))).toEqual([]);
  });
  it('gives a present after a trip and every other day, until the list runs out', () => {
    expect(presentDue({ presents: 0, brought: true }, 3)).toBe(true);
    expect(presentDue({ presents: 0, brought: false }, 3)).toBe(false);
    expect(presentDue({ presents: 0, brought: false }, 4)).toBe(true);
    expect(presentDue({ presents: PRESENTS.length, brought: true }, 4)).toBe(false);
  });
  it('comes along on a walk once she knows the party, at most every other day', () => {
    expect(strollDue({ met: false, strollDay: -1 }, 3)).toBe(false);
    expect(strollDue({ met: true, strollDay: -1 }, 3)).toBe(true);
    expect(strollDue({ met: true, strollDay: 3 }, 3)).toBe(false);
    expect(strollDue({ met: true, strollDay: -1 }, 4)).toBe(false);
  });
});

describe('her poles and her answers', () => {
  it('comes out some mornings only, and only once the poles are found', () => {
    expect(poleDay(3, [])).toBe(false);
    expect(poleDay(3, ['babusia_walk'])).toBe(true);
    expect(poleDay(4, ['babusia_walk'])).toBe(false);
    expect(poleDay(5, ['babusia_walk'])).toBe(false);
  });

  it('keeps the tip on the ground and leans back as the hand swings', () => {
    for (let arm = -0.6; arm <= 0.6; arm += 0.1) {
      const hand = POLE.shoulder - POLE.upper * Math.cos(arm) - POLE.fore * Math.cos(arm + POLE.bend);
      const lean = poleAngle(arm, POLE.bend) + arm + POLE.bend;
      expect(lean).toBeGreaterThanOrEqual(0);
      expect(Math.max(0, hand - POLE.len * Math.cos(lean))).toBeLessThan(0.05);
      expect(hand - POLE.len * Math.cos(lean)).toBeGreaterThan(-0.001);
    }
  });

  it('answers a tap with one thing, the hurt first', () => {
    expect(tapReply({ hurt: true, giftDue: true, asking: true })).toBe('feed');
    expect(tapReply({ hurt: false, giftDue: true, asking: true })).toBe('gift');
    expect(tapReply({ hurt: false, giftDue: false, asking: true })).toBe('ask');
    expect(tapReply({ hurt: false, giftDue: false, asking: false })).toBe('joke');
  });

  it('grows the chair flowers clear of the furniture and the path', () => {
    const spots = chairFlowerSpots();
    const { chair, coffee, fire } = BABUSIA_SPOTS;
    expect(spots).toHaveLength(CHAIR_FLOWERS);
    for (const f of spots) {
      expect(f.dz).toBeGreaterThan(BABUSIA_HOUSE.sizeZ);
      expect(Math.hypot(f.dx - chair.dx, f.dz - chair.dz)).toBeGreaterThan(1);
      expect(Math.hypot(f.dx - coffee.dx, f.dz - coffee.dz)).toBeGreaterThan(0.8);
      expect(Math.hypot(f.dx - fire.dx, f.dz - fire.dz)).toBeGreaterThan(1.5);
    }
  });

  it('never tells the same joke twice in a row', () => {
    for (let last = -1; last < 10; last++) {
      for (let r = 0; r < 1; r += 0.03) {
        const j = nextJoke(last, 10, r);
        expect(j).not.toBe(last);
        expect(j).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThan(10);
      }
    }
  });
});

describe('her day', () => {
  it('walks in the morning, swims, a little television, the garden, then coffee till dawn', () => {
    expect(routineAt(0.02)).toBe('walk');
    expect(routineAt(0.3)).toBe('swim');
    expect(routineAt(0.42)).toBe('tv');
    expect(routineAt(0.5)).toBe('garden');
    expect(routineAt(0.7)).toBe('coffee');
    expect(routineAt(0.95)).toBe('walk');
  });
  it('watches television for less time than anything else', () => {
    const count = (a: string) => Array.from({ length: 1000 }, (_, i) => routineAt(i / 1000)).filter((x) => x === a).length;
    for (const a of ['walk', 'swim', 'garden', 'coffee']) expect(count('tv')).toBeLessThan(count(a));
  });
  it('cooks something else the next day, and never fails on a day', () => {
    for (let d = -3; d < 20; d++) {
      expect(DISHES).toContain(dishOfDay(d));
      expect(dishOfDay(d)).not.toBe(dishOfDay(d + 1));
    }
  });
});

describe('moving on', () => {
  const b = { ...freshBabusia(), at: [0, 10, 0] as [number, number, number], movedDay: 5 };
  it('waits for the party to be far, and for her days', () => {
    expect(shouldMove(b, 5 + BABUSIA.moveEvery, BABUSIA.moveAway + 1, false)).toBe(true);
    expect(shouldMove(b, 5 + BABUSIA.moveEvery, BABUSIA.moveAway - 1, false)).toBe(false);
    expect(shouldMove(b, 5 + BABUSIA.moveEvery - 1, 200, false)).toBe(false);
    // a house an older version left too near the heroes' home goes at the first chance, unseen
    expect(shouldMove(b, 6, 200, false, BABUSIA.keepHome - 1)).toBe(true);
    expect(shouldMove(b, 6, BABUSIA.moveAway - 1, false, BABUSIA.keepHome - 1)).toBe(false);
    expect(shouldMove(b, 6, 200, true, BABUSIA.keepHome - 1)).toBe(false);
  });
  it('stays while a tale leads to her', () => {
    expect(shouldMove(b, 99, 200, true)).toBe(false);
    expect(movesTomorrow(b, 99, true)).toBe(false);
  });
  it('does not move before she has come', () => {
    expect(shouldMove(freshBabusia(), 99, 200, false)).toBe(false);
  });
  it('says so the evening before the day she may leave', () => {
    expect(movesTomorrow(b, 5 + BABUSIA.moveEvery - 1, false)).toBe(true);
    expect(movesTomorrow(b, 5, false)).toBe(false);
  });
  it('remembers only the last meadows', () => {
    let g: [number, number][] = [];
    for (let i = 0; i < BABUSIA.glades + 5; i++) g = addGlade(g, i, 0);
    expect(g).toHaveLength(BABUSIA.glades);
    expect(g.at(-1)).toEqual([BABUSIA.glades + 4, 0]);
  });
});

describe('her ring', () => {
  it('covers her house, and nothing before she comes', () => {
    const b = { ...freshBabusia(), at: [100, 10, 100] as [number, number, number] };
    const [cx, cz] = centreOf(b.at);
    expect(inSafeRing(b, cx + BABUSIA.safe - 1, cz)).toBe(true);
    expect(inSafeRing(b, cx + BABUSIA.safe + 1, cz)).toBe(false);
    // the yard is inside it, and not much more
    const reach = Math.hypot(YARD.x1 - BABUSIA_HOUSE.sizeX / 2, YARD.z1 - BABUSIA_HOUSE.sizeZ / 2);
    expect(BABUSIA.safe).toBeGreaterThan(reach);
    expect(BABUSIA.safe).toBeLessThan(reach + 6);
    expect(inSafeRing(freshBabusia(), 0, 0)).toBe(false);
  });
});

describe('a site', () => {
  it('takes flat dry land', () => {
    expect(judgeSite(flat(), 0, 0)?.y).toBe(10);
  });
  it('refuses water in the yard', () => {
    expect(judgeSite({ ...flat(), wet: (x, z) => x === 2 && z === 2 }, 0, 0)).toBeNull();
  });
  it('refuses ground a jump could not climb out of', () => {
    expect(judgeSite({ ...flat(), height: (x) => (x > 8 ? 10 + BABUSIA.rim + 1 : 10) }, 0, 0)).toBeNull();
  });
  it('likes water nearby and dislikes trees', () => {
    const lake: SiteProbe = { ...flat(), wet: (x, z) => Math.hypot(x - 6.5, z - 4.5) > 21 };
    const woods: SiteProbe = { ...flat(), tree: () => true };
    expect(judgeSite(lake, 0, 0)!.score).toBeLessThan(judgeSite(flat(), 0, 0)!.score);
    expect(judgeSite(woods, 0, 0)!.score).toBeGreaterThan(judgeSite(flat(), 0, 0)!.score);
  });
});

describe('the house', () => {
  it('has a doorway and no wall in it', () => {
    const at = (x: number, y: number, z: number) => BABUSIA_BLOCKS.find((b) => b.dx === x && b.dy === y && b.dz === z)?.id;
    expect(at(6, 1, BABUSIA_HOUSE.sizeZ - 1)).toBe(B.AIR);
    expect(at(6, 2, BABUSIA_HOUSE.sizeZ - 1)).toBe(B.AIR);
    expect(at(0, 1, 0)).toBe(B.LOG);
  });
  it('keeps her walks on the flat yard and outside the walls', () => {
    for (const [x, z] of [...WALK_LOOP, ...GARDEN]) {
      expect(x).toBeGreaterThanOrEqual(YARD.x0);
      expect(x).toBeLessThanOrEqual(YARD.x1);
      expect(z).toBeGreaterThanOrEqual(YARD.z0);
      expect(z).toBeLessThanOrEqual(YARD.z1);
      const inWalls = x > -1 && x < BABUSIA_HOUSE.sizeX + 1 && z > -1 && z < BABUSIA_HOUSE.sizeZ + 0.5;
      expect(inWalls).toBe(false);
    }
  });
  it('grows the same meadow every time', () => {
    expect(flowerSpots(40, -12, 20, 0, 9)).toEqual(flowerSpots(40, -12, 20, 0, 9));
    expect(flowerSpots(40, -12, 20, 0, 9).some((f) => f.kind === 0)).toBe(true);
    expect(flowerSpots(40, -12, 20, 0, 9).some((f) => f.kind === 1)).toBe(true);
  });
});

describe('two hostesses', () => {
  it('swap on a move once the first has said hello, and not before', () => {
    expect(hostAfterMove('yulia', [])).toBe('yulia');
    expect(hostAfterMove('yulia', ['babusia_hi'])).toBe('olia');
    expect(hostAfterMove('olia', ['babusia_hi'])).toBe('yulia');
    expect(otherHost(otherHost('olia'))).toBe('olia');
  });
  it('each has her own day: no walk, swim or television for Оля', () => {
    for (let t = 0; t < 1; t += 0.01) {
      expect(['feed', 'bugs', 'notes']).toContain(routineAt(t, 'olia'));
      expect(['walk', 'swim', 'tv', 'garden', 'coffee']).toContain(routineAt(t, 'yulia'));
    }
  });
  it('have the same moments in their own voices', () => {
    const all = lines as Record<string, { speaker: string }>;
    for (const id of SHARED_LINES) {
      const own = hostLine(id, 'olia');
      expect(own).toBe(id.replace('babusia_', 'olia_'));
      expect(all[own]?.speaker, own).toBe('olia');
      expect(hostLine(id, 'yulia')).toBe(id);
    }
    expect(hostLine('babusia_joke_1', 'olia')).toBe('babusia_joke_1');
  });
  it('have a mark and a model each', () => {
    expect(HOSTS.yulia.part).not.toBe(HOSTS.olia.part);
    expect(HOSTS.yulia.mark).not.toBe(HOSTS.olia.mark);
  });
  it('the one away sends one greeting a trip, from the day after', () => {
    expect(noteDue({ noted: false, movedDay: 5 }, 5)).toBe(false);
    expect(noteDue({ noted: false, movedDay: 5 }, 6)).toBe(true);
    expect(noteDue({ noted: true, movedDay: 5 }, 9)).toBe(false);
  });
  it('an old save keeps Юля until the next move, unless a tale of Оля is under way', () => {
    const old = (cur: string | null) => migrate({ v: 16, babusia: freshBabusia(), tales: { cur, done: [], after: 0 } } as never);
    expect(old(null).v).toBe(SAVE_VERSION);
    expect(old(null).babusia.host).toBe('yulia');
    expect(old('babusia_walk').babusia.host).toBe('yulia');
    expect(old('babusia_owl').babusia.host).toBe('olia');
  });
});
