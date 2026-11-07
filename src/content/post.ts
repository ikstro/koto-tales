import type { ItemId } from '../contracts';
import type { BuildingId } from './buildings';
import type { Reward } from './progress';

/**
 * Home life, the postbox and the guests at the campfire (DESIGN.md «Home»): letters that wait for
 * the party at home, parcels of the kit's endless rewards, a guest's gift left when nobody was in.
 * What the save keeps and the pure rules; systems/mail.ts runs them (where a letter flies, opening
 * the box), systems/guests.ts only drops gifts into it.
 */

/** One thing waiting in the postbox. */
export type PostThing =
  /** A tale's letter (a paper plane or a stork) that came while the party was away. `day`: when it came. */
  | { kind: 'letter'; tale: string; day: number }
  /** One of the kit box's endless rewards, sent home as a parcel (the shape is the reward's own). */
  | { kind: 'parcel'; reward: unknown; day: number }
  /** A guest at the campfire left before giving it: coins or a thing. `from`: who (a race or a hostess). */
  | { kind: 'gift'; from: string; coins?: number; item?: ItemId; day: number };

export interface PostSave {
  /** What waits in the postbox, oldest first. */
  box: PostThing[];
  /** The day of the last guest at the campfire (-1: never). */
  guestDay: number;
  /** Whose turn it is among the guests (content/guests.ts `pickGuest`). */
  guestTurn: number;
}

export const freshPost = (): PostSave => ({ box: [], guestDay: -1, guestTurn: 0 });

export const MAIL = {
  /** Within this of home a letter flies into the postbox (the party sees it come). */
  homeNear: 30,
  /** Walking this close to the postbox opens it. */
  openNear: 1.25,
  /** A letter waiting this long (s, this session) finds the party itself; so does one from yesterday. */
  waitSeconds: 300,
  /** Walking up opens the next thing after this long standing there. */
  againAfter: 1.8,
} as const;

/**
 * Where a tale's letter goes when it is due: `postbox` — the plane flies into the postbox (the
 * party is near home and sees it); `box` — straight into the postbox, it waits there (far away,
 * but the portal brings the party home in a tap); `hero` — it flies to the hero as always (far
 * away without the portal: a long walk home is no fun).
 */
export type LetterWay = 'hero' | 'postbox' | 'box';

export function letterWay(homeDistance: number, portal: boolean): LetterWay {
  if (homeDistance <= MAIL.homeNear) return 'postbox';
  return portal ? 'box' : 'hero';
}

/** A letter has waited long enough: it flies to the party itself. */
export function letterDue(letter: { day: number }, today: number, waited: number): boolean {
  return today > letter.day || waited >= MAIL.waitSeconds;
}

/** The oldest thing that can be opened now (`letterOk`: that tale's letter may begin now); -1: none. */
export function nextToOpen(box: readonly PostThing[], letterOk: (tale: string) => boolean): number {
  return box.findIndex((t) => t.kind !== 'letter' || letterOk(t.tale));
}

/** Letters of tales already done or under way are of no use any more. */
export function staleLetters(box: PostThing[], done: readonly string[], cur: string | null): PostThing[] {
  return box.filter((t) => t.kind !== 'letter' || (!done.includes(t.tale) && t.tale !== cur));
}

/** The kit box's endless rewards (after the listed ones) come home as parcels. */
export const isParcelReward = (r: { id: string }): boolean => r.id.startsWith('+');

/** A parcel's reward, checked (an odd one from an old save is null). */
export function parcelReward(t: PostThing): Reward | null {
  if (t.kind !== 'parcel') return null;
  const r = t.reward as Partial<Reward> | null;
  return r && typeof r === 'object' && typeof r.id === 'string' && typeof r.line === 'string' ? (r as Reward) : null;
}

/** Buildings still in parcels, to count with the owned ones (the box keeps its caps). */
export function inParcels(box: readonly PostThing[], b: BuildingId): number {
  let n = 0;
  for (const t of box) for (const [id, k] of parcelReward(t)?.items ?? []) if (id === b) n += k;
  return n;
}

/** Upgrades of a building still in parcels (the next upgrade goes a level further). */
export function upgradesInParcels(box: readonly PostThing[], b: BuildingId): number {
  return box.filter((t) => parcelReward(t)?.upgrade === b).length;
}

/** What opening one thing gives. */
export type Opened =
  | { kind: 'letter'; tale: string }
  | { kind: 'parcel'; reward: Reward }
  /** A guest's gift: coins, a thing, or both. */
  | { kind: 'gift'; from: string; coins: number; item: ItemId | null }
  | { kind: 'nothing' };

export function openThing(t: PostThing): Opened {
  if (t.kind === 'letter') return { kind: 'letter', tale: t.tale };
  if (t.kind === 'parcel') {
    const reward = parcelReward(t);
    return reward ? { kind: 'parcel', reward } : { kind: 'nothing' };
  }
  const coins = Math.max(0, Math.floor(t.coins ?? 0));
  const item = t.item ?? null;
  return coins || item ? { kind: 'gift', from: t.from, coins, item } : { kind: 'nothing' };
}
