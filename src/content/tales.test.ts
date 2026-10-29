import { describe, expect, it } from 'vitest';
import { SPRITES } from '../ui/hudSprites';
import { BUILDINGS, type BuildingId } from './buildings';
import { LINES } from './lines';
import { entryOf, freshTales, nextTale, PROLOGUE, TALE_ITEMS, TALES, talesLeft, type TalesSave } from './tales';

const none = () => false;
const all = () => true;
const only = (...ids: BuildingId[]) => (b: BuildingId) => ids.includes(b);
const save = (s: Partial<TalesSave>): TalesSave => ({ ...freshTales(), ...s });

describe('tale cards', () => {
  it('ids are unique and the prologue comes first', () => {
    expect(new Set(TALES.map((t) => t.id)).size).toBe(TALES.length);
    expect(TALES[0].id).toBe(PROLOGUE);
    expect(entryOf(TALES[0])).toBe('wake');
  });

  for (const t of TALES) {
    it(`${t.id}: lines, pictures and steps exist`, () => {
      expect(t.steps.length).toBeGreaterThan(0);
      expect(t.steps.length).toBeLessThanOrEqual(4);
      for (const l of [t.open, t.thanks, t.retell, ...t.steps.map((s) => s.ask)]) expect(LINES[l], l).toBeDefined();
      for (const p of [t.sticker, ...t.steps.map((s) => s.picture)]) expect(p in SPRITES, p).toBe(true);
      for (const b of t.needs ?? []) expect(BUILDINGS[b], b).toBeDefined();
      for (const s of t.steps) {
        if (s.kind === 'gather') expect(s.item && s.goal && s.spread, `${t.id} gather`).toBeTruthy();
        if (s.kind === 'thief') expect(s.item, `${t.id} thief`).toBeTruthy();
        if (s.kind === 'place') expect(BUILDINGS[s.building!], `${t.id} place`).toBeDefined();
        if (s.kind === 'defend' || s.kind === 'music') expect(s.goal, `${t.id} ${s.kind}`).toBeGreaterThan(0);
      }
    });
  }

  it('every thing to gather has its picture', () => {
    for (const { icon } of Object.values(TALE_ITEMS)) expect(icon in SPRITES, icon).toBe(true);
  });
});

describe('which tale comes', () => {
  it('a new story begins with the prologue at once', () => {
    expect(nextTale(freshTales(), none, 0, false)?.id).toBe(PROLOGUE);
  });

  it('nothing while a tale is under way, or before its day', () => {
    expect(nextTale(save({ cur: 'fish' }), all, 3, true)).toBeNull();
    expect(nextTale(save({ done: ['fish'], after: 2 }), all, 1, true)).toBeNull();
  });

  it('a dream waits for a night’s sleep', () => {
    const s = save({ done: ['fish'], after: 1 });
    expect(nextTale(s, all, 1, false)).toBeNull();
    expect(nextTale(s, all, 1, true)?.id).toBe('treasure');
  });

  it('a whole day without sleep: the next letter comes first, the dream keeps its place', () => {
    const s = save({ done: ['fish'], after: 1 });
    const t = nextTale(s, all, 2, false);
    expect(t?.id).toBe('party');
    expect(entryOf(t!)).toBe('letter');
    expect(nextTale(save({ done: ['fish', 'party'], after: 3 }), all, 3, true)?.id).toBe('treasure');
  });

  it('a tale waiting for a building is left out until the child has one', () => {
    const done = TALES.filter((t) => !t.needs).map((t) => t.id);
    expect(talesLeft(done, none)).toEqual([]);
    expect(talesLeft(done, only('windmill')).map((t) => t.id)).toEqual(['light']);
    expect(talesLeft(['fish', 'treasure'], none).map((t) => t.id)).not.toContain('party');
  });

  it('Льоша’s tales come first', () => {
    const mine = { ...TALES[3], id: 'mine', lyosha: true };
    TALES.push(mine);
    try {
      expect(talesLeft(['fish'], all)[0].id).toBe('mine');
    } finally {
      TALES.pop();
    }
  });
});
