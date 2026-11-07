import type { ItemId } from './items';

/**
 * Home life, the garden bed (building `garden`): what grows in each bed the child has put up, and
 * what one tap on it does. Pure rules; systems/garden.ts runs them, assets/garden.ts draws them.
 *
 * A bed holds one crop or nothing; all six spots grow the same. Planting takes one of that product
 * from what the party carries. Each new day after planting adds 1, and a day it was watered (or
 * it rained) adds 1 more: 0 sprout, 1 growing, 2 and up ripe. Nothing withers, nothing is lost.
 */

/** What grows in a bed, in the order one tap plants them. */
export const CROPS = ['potato', 'carrot', 'cherry', 'apple'] as const satisfies readonly ItemId[];
export type Crop = (typeof CROPS)[number];

export interface Bed {
  /** What grows; null: bare soil. */
  crop: Crop | null;
  /** Growth so far: 1 a new day, 1 more for each day it was wet. */
  grown: number;
  /** The last day counted (`save.day`). */
  day: number;
  /** Watered (or rained on) on `day`. */
  wet: boolean;
}

export interface GardenSave {
  /** Per bed, by its footprint corner `x,z` (the `save.placed` record): what grows there. */
  beds: Record<string, Bed>;
  /** The day Пупся last said a bed is ripe (once a day). */
  ripeSaid: number;
}

export const freshGarden = (): GardenSave => ({ beds: {}, ripeSaid: -1 });

export const GARDEN = {
  /** Picked from a ripe bed (and given back when a ripe bed is folded). */
  harvest: 3,
  /** Taken to plant (and given back when a growing bed is folded). */
  seed: 1,
  /** The party this close to a ripe bed: the crop breathes, Пупся says so (once a day). */
  near: 10,
  /** Seconds between Пупся's «it grows, come tomorrow». */
  grows: 20,
  /** Seconds between Пупся's «this is what grows here» on a bare bed with nothing to plant. */
  hint: 30,
};

/** Stages a crop shows. */
export const SPROUT = 0;
export const GROWING = 1;
export const RIPE = 2;

export const bedKey = (x: number, z: number): string => `${x},${z}`;

export const emptyBed = (day: number): Bed => ({ crop: null, grown: 0, day, wet: false });

const isCrop = (v: unknown): v is Crop => (CROPS as readonly unknown[]).includes(v);

/** A bed as saved, made whole (an older or broken save gives bare soil). */
export function bedOf(raw: unknown, day: number): Bed {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Partial<Bed>;
  if (!isCrop(b.crop)) return emptyBed(day);
  return { crop: b.crop, grown: Math.max(0, Number(b.grown) || 0), day: Number.isFinite(b.day) ? (b.day as number) : day, wet: !!b.wet };
}

/** -1 bare; otherwise SPROUT, GROWING or RIPE. */
export function stageOf(b: Bed): number {
  if (!b.crop) return -1;
  return Math.min(RIPE, b.grown);
}

export const isRipe = (b: Bed): boolean => stageOf(b) === RIPE;

/** Counts the days gone by since the bed's `day`: 1 each, 1 more for the wet one. `today`'s rain makes it wet now. */
export function advance(b: Bed, today: number, raining = false): Bed {
  let next = b;
  if (today > b.day) {
    next = b.crop ? { ...b, grown: b.grown + (today - b.day) + (b.wet ? 1 : 0), day: today, wet: false } : { ...b, day: today, wet: false };
  }
  if (raining && next.crop && !next.wet && !isRipe(next)) next = { ...next, wet: true };
  return next;
}

type Carried = Partial<Record<ItemId, number>>;

/** The first crop the party carries, in the order potato, carrot, cherry, apple. */
export function plantable(inv: Carried): Crop | null {
  return CROPS.find((c) => (inv[c] ?? 0) >= GARDEN.seed) ?? null;
}

export const plant = (crop: Crop, today: number): Bed => ({ crop, grown: 0, day: today, wet: false });

export const water = (b: Bed): Bed => ({ ...b, wet: true });

/** What one tap on the bed does now. */
export type TapAct = 'harvest' | 'plant' | 'nothing' | 'water' | 'grows';

export function tapAct(b: Bed, inv: Carried): TapAct {
  if (isRipe(b)) return 'harvest';
  if (!b.crop) return plantable(inv) ? 'plant' : 'nothing';
  return b.wet ? 'grows' : 'water';
}

/** Folded back into the box: what grows comes back (one seed while growing, the harvest when ripe). */
export function foldBack(b: Bed): { item: Crop; n: number } | null {
  if (!b.crop) return null;
  return { item: b.crop, n: isRipe(b) ? GARDEN.harvest : GARDEN.seed };
}
