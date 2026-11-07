import type { ItemId } from '../contracts';

/**
 * Home life, the postbox and the guests at the campfire (DESIGN.md «Home»): letters that wait for
 * the party at home, parcels of the kit's endless rewards, a guest's gift left when nobody was in.
 * What the save keeps; the rules come with stage 2 (systems/mail.ts opens the box, systems/guests.ts
 * only drops gifts into it).
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
}

export const freshPost = (): PostSave => ({ box: [], guestDay: -1 });
