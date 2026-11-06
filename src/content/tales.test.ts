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

  it('Бабуся comes right after the prologue, in an old save too', () => {
    expect(nextTale(save({ done: ['fish'], after: 1 }), none, 1, false)?.id).toBe('babusia_hi');
    expect(nextTale(save({ done: ['fish', 'dog', 'treasure', 'guard', 'gnomes'], after: 9 }), none, 9, false)?.id).toBe('babusia_hi');
    expect(entryOf(TALES.find((t) => t.id === 'babusia_hi')!)).toBe('letter');
  });

  it('a dream waits for a night’s sleep', () => {
    const s = save({ done: ['fish', 'babusia_hi', 'first_dinner'], after: 1 });
    expect(nextTale(s, all, 1, false)).toBeNull();
    expect(nextTale(s, all, 1, true)?.id).toBe('dog');
  });

  it('a whole day without sleep: the next letter comes first, the dream keeps its place', () => {
    const s = save({ done: ['fish', 'babusia_hi'], after: 1 });
    const t = nextTale(s, all, 2, false);
    expect(t?.id).toBe('babusia_walk');
    expect(entryOf(t!)).toBe('letter');
    expect(nextTale(save({ done: ['fish', 'babusia_hi', 'first_dinner', 'babusia_walk'], after: 3 }), all, 3, true)?.id).toBe('dog');
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

describe('whose tale it is', () => {
  const all = () => true;
  const fresh = (done: string[]) => ({ ...freshTales(), done });
  const everyOther = (keep: string) => TALES.filter((t) => t.id !== keep).map((t) => t.id);
  it('a tale of the one away waits until she is back', () => {
    const left = fresh(everyOther('babusia_owl'));
    expect(nextTale(left, all, 5, true, 'yulia')).toBeNull();
    expect(nextTale(left, all, 5, true, 'olia')?.id).toBe('babusia_owl');
    const hers = fresh(everyOther('babusia_wreath'));
    expect(nextTale(hers, all, 5, true, 'olia')).toBeNull();
    expect(nextTale(hers, all, 5, true, 'yulia')?.id).toBe('babusia_wreath');
  });
  it('the hello of Оля comes before everything once she is at home', () => {
    expect(talesLeft(['fish'], all, 'olia')[0].id).toBe('olia_hi');
    expect(talesLeft(['fish'], all, 'yulia').some((t) => t.id === 'olia_hi')).toBe(false);
  });
  it('the book still lists both', () => {
    const ids = talesLeft([], all).map((t) => t.id);
    expect(ids).toContain('olia_hi');
    expect(ids).toContain('babusia_hi');
  });
  it('six older tales went to Оля with her mark on them', () => {
    const hers = TALES.filter((t) => t.host === 'olia');
    expect(hers.length).toBe(9);
    for (const t of hers) for (const s of t.steps) expect(s.picture).not.toBe('map-babusia');
  });
});

describe('the first dinner', () => {
  const all = () => true;
  it('comes once Бабуся has come, before the other tales of the day', () => {
    expect(talesLeft(['fish'], all).some((t) => t.id === 'first_dinner')).toBe(false);
    expect(talesLeft(['fish', 'babusia_hi'], all)[0].id).toBe('first_dinner');
  });
  it('whoever is at home, Пупся asks: it needs no hostess of its own', () => {
    const t = TALES.find((x) => x.id === 'first_dinner')!;
    expect(t.from).toBe('pupsia');
    expect(t.lyosha).toBe(true);
    expect(t.steps.at(-1)!.kind).toBe('cook');
  });
});
