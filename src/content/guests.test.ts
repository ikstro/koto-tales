import { describe, expect, it } from 'vitest';
import { GUEST, GUEST_LINES, GUEST_ORDER, guestBit, guestCandidates, guestDue, guestGift, pickGuest } from './guests';
import { LINES } from './lines';
import { PRODUCTS } from './recipes';

describe('guests at the campfire', () => {
  it('nobody comes before anyone is met', () => {
    const c = guestCandidates({ met: [], host: 'yulia', hiDone: false });
    expect(c).toEqual([]);
    expect(pickGuest(c, 0)).toBeNull();
  });

  it('the races met come, in order', () => {
    expect(guestCandidates({ met: ['robots', 'elves'], host: 'yulia', hiDone: false })).toEqual(['elves', 'robots']);
  });

  it('the hostess away comes only after her first hello, never the one at home', () => {
    expect(guestCandidates({ met: [], host: 'yulia', hiDone: false })).toEqual([]);
    expect(guestCandidates({ met: [], host: 'yulia', hiDone: true })).toEqual(['olia']);
    expect(guestCandidates({ met: ['gnomes'], host: 'olia', hiDone: true })).toEqual(['gnomes', 'yulia']);
  });

  it('everyone in turn, round and round', () => {
    const c = guestCandidates({ met: ['elves', 'gnomes'], host: 'yulia', hiDone: true });
    expect([0, 1, 2, 3, 4].map((t) => pickGuest(c, t))).toEqual(['elves', 'gnomes', 'olia', 'elves', 'gnomes']);
  });

  it('from the evening till deep night, every second day at most', () => {
    expect(guestDue(0.5, 3, -1)).toBe(false);
    expect(guestDue(0.62, 3, -1)).toBe(true);
    expect(guestDue(0.95, 3, -1)).toBe(false);
    expect(guestDue(0.7, 3, 2)).toBe(false);
    expect(guestDue(0.7, 4, 2)).toBe(true);
    expect(guestDue(0.7, 2, 2)).toBe(false);
  });

  it('gifts alternate for each guest, and neighbours bring different things', () => {
    for (const c of [['elves'], ['elves', 'gnomes'], ['elves', 'gnomes', 'robots']] as const) {
      for (let t = 0; t + c.length < 30; t++) {
        const a = 'coins' in guestGift(c, t);
        expect('coins' in guestGift(c, t + c.length)).toBe(!a);
      }
    }
    const c = ['elves', 'gnomes', 'robots', 'aliens'] as const;
    expect('coins' in guestGift(c, 0)).not.toBe('coins' in guestGift(c, 1));
  });

  it('a coin gift is 5 coins, a product gift is a kitchen product', () => {
    for (let t = 0; t < 20; t++) {
      const g = guestGift(['elves', 'olia'], t);
      if ('coins' in g) expect(g.coins).toBe(GUEST.coins);
      else expect(PRODUCTS).toContain(g.item);
    }
  });

  it('the two bits are said in turn from visit to visit', () => {
    const c = ['elves', 'gnomes'] as const;
    expect(guestBit(c, 'elves', 0)).toBe('guest_elves_bit_1');
    expect(guestBit(c, 'elves', 2)).toBe('guest_elves_bit_2');
    expect(guestBit(c, 'elves', 4)).toBe('guest_elves_bit_1');
  });

  it('every guest has four voiced lines in their own voice', () => {
    const voice = { elves: 'elf', gnomes: 'gnome', robots: 'robot', aliens: 'alien', yulia: 'babusia', olia: 'olia' };
    for (const g of GUEST_ORDER) {
      const l = GUEST_LINES[g];
      for (const id of [l.hello, ...l.bits, l.bye]) expect(LINES[id].speaker).toBe(voice[g]);
    }
    expect(LINES.guest_pupsia_hi.speaker).toBe('pupsia');
  });
});
