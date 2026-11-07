import type { ItemId } from '../contracts';
import type { Race } from '../world/villages';
import { otherHost, type Host } from './babusia';
import type { LineId } from './lines';
import type { PostSave } from './post';
import { PRODUCTS } from './recipes';

/**
 * Guests at the home campfire (DESIGN.md «Home»): from the evening, every second day at most, while
 * the party sits on the logs by the fire, someone they know comes over — the elder of a village they
 * have met, or the grandmother who is away now. Hello, one bit of their life, a gift (5 coins or a
 * kitchen product, by turns), goodbye. The pure rules; systems/guests.ts runs it.
 */

export type GuestId = Race | Host;

/** Who may come, in this order (the hostess at home never does: she is at home). */
export const GUEST_ORDER: readonly GuestId[] = ['elves', 'gnomes', 'robots', 'aliens', 'yulia', 'olia'];

export const GUEST = {
  /** A guest may come from the evening (clock t) until deep night. */
  from: 0.6,
  until: 0.88,
  /** Days between guests, at least. */
  every: 2,
  /** Seconds sitting by the fire before someone comes. */
  sitFor: 1.5,
  /** No monster this close to the fire. */
  calm: 14,
  /** The party counts as gone this far from the fire. */
  leave: 7,
  /** Coins in a coin gift. */
  coins: 5,
} as const;

/**
 * The guest's counter, kept in the post slice of the save. `normHome` spreads the saved slice, so the
 * field survives a reload without a change to `PostSave` (content/post.ts).
 */
export type GuestPost = PostSave & { guestTurn?: number };

/** Who could come tonight: the races met, and the hostess away once the first one has said hello. */
export function guestCandidates(s: { met: readonly Race[]; host: Host; hiDone: boolean }): GuestId[] {
  const away = otherHost(s.host);
  return GUEST_ORDER.filter((g) => (g === 'yulia' || g === 'olia' ? s.hiDone && g === away : s.met.includes(g as Race)));
}

/** It is guest time: the evening, and the last guest was at least `every` days ago. */
export const guestDue = (t: number, day: number, guestDay: number): boolean =>
  t >= GUEST.from && t < GUEST.until && (guestDay < 0 || day - guestDay >= GUEST.every);

/** Who comes on this turn: everyone in order, round and round; nobody met yet, nobody comes. */
export const pickGuest = (cands: readonly GuestId[], turn: number): GuestId | null => (cands.length ? cands[turn % cands.length] : null);

/** How many times this guest has come before (roughly: the round number). */
export const visitsOf = (cands: readonly GuestId[], turn: number): number => (cands.length ? Math.floor(turn / cands.length) : 0);

export type GuestGift = { coins: number } | { item: ItemId };

/**
 * What the guest brings: coins and a kitchen product by turns. Each guest alternates from visit to
 * visit, and neighbours in the round bring different things.
 */
export function guestGift(cands: readonly GuestId[], turn: number): GuestGift {
  const i = cands.length ? turn % cands.length : 0;
  if ((visitsOf(cands, turn) + i) % 2 === 0) return { coins: GUEST.coins };
  return { item: PRODUCTS[turn % PRODUCTS.length] };
}

export interface GuestLines {
  hello: LineId;
  /** Two bits of their life or jokes, said in turn from visit to visit. */
  bits: [LineId, LineId];
  bye: LineId;
}

export const GUEST_LINES: Record<GuestId, GuestLines> = {
  elves: { hello: 'guest_elves_hello', bits: ['guest_elves_bit_1', 'guest_elves_bit_2'], bye: 'guest_elves_bye' },
  gnomes: { hello: 'guest_gnomes_hello', bits: ['guest_gnomes_bit_1', 'guest_gnomes_bit_2'], bye: 'guest_gnomes_bye' },
  robots: { hello: 'guest_robots_hello', bits: ['guest_robots_bit_1', 'guest_robots_bit_2'], bye: 'guest_robots_bye' },
  aliens: { hello: 'guest_aliens_hello', bits: ['guest_aliens_bit_1', 'guest_aliens_bit_2'], bye: 'guest_aliens_bye' },
  yulia: { hello: 'guest_yulia_hello', bits: ['guest_yulia_bit_1', 'guest_yulia_bit_2'], bye: 'guest_yulia_bye' },
  olia: { hello: 'guest_olia_hello', bits: ['guest_olia_bit_1', 'guest_olia_bit_2'], bye: 'guest_olia_bye' },
};

/** Пупся, as the guest comes into the yard. */
export const GUEST_GREET: LineId = 'guest_pupsia_hi';

export const guestBit = (cands: readonly GuestId[], g: GuestId, turn: number): LineId => GUEST_LINES[g].bits[visitsOf(cands, turn) % 2];

/** The guest's puff as they come and go: the race's stamp colour, or the hostess's petals. */
export const GUEST_PUFF: Record<GuestId, number> = {
  elves: 0x3fa142,
  gnomes: 0xe0583f,
  robots: 0x2f7fd6,
  aliens: 0x9b5fd0,
  yulia: 0xffc9d6,
  olia: 0xffd98a,
};
