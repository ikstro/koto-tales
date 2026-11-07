import { mulberry32, hash2 } from '../world/rng';
import type { ItemId } from './items';
import { PRODUCTS } from './recipes';

/**
 * Home life, the pets (DESIGN.md «Home»): Сірко fed at his doghouse with what the party carries,
 * and the fish in the aquarium. What the save keeps of them and the rules; run by systems/pets.ts.
 */
export interface PetsSave {
  /** The day Сірко was last fed (-1: never). */
  fedDay: number;
  /** The day the fish were last fed (the first feeding a day gives coins). */
  fishDay: number;
  /** The day Пупся last said Сірко is hungry (once a day). */
  hungryToldDay: number;
  /** The day Пупся last said what Сірко likes (once a day, when nothing he eats is carried). */
  likesToldDay: number;
}

export const freshPets = (): PetsSave => ({ fedDay: -1, fishDay: -1, hungryToldDay: -1, likesToldDay: -1 });

/** What Сірко eats, dog-safe only, in the order he is given it: her pie first, the apple last. */
export const DOG_FOOD = ['babusia_pie', 'egg', 'carrot', 'apple'] as const satisfies readonly ItemId[];
export type DogFood = (typeof DOG_FOOD)[number];

export const PETS = {
  /** Within this of the doghouse he waits by his bowl while hungry (and whines now and then). */
  near: 12,
  /** Seconds between soft whines while he waits. */
  whineEvery: 40,
  /** Seconds he eats. */
  eat: 3,
  /** How far he runs off to sniff out a find (blocks). */
  runMin: 6,
  runMax: 10,
  /** Seconds he sniffs with his head down. */
  sniff: 2,
  /** A find is coins this often, otherwise a kitchen product. */
  coinChance: 0.55,
  coins: [3, 5] as const,
  /** Coins for the first feeding of the fish a day. */
  fishCoins: 2,
  /** Seconds the fish stay at the surface after a feeding. */
  fishRush: 10,
  /** Пупся's word at the tank at most this often (s). */
  fishTalkEvery: 30,
} as const;

/** The first thing the party carries that he eats, in DOG_FOOD order; null: nothing. */
export function dogFoodFrom(inv: Partial<Record<ItemId, number>>): DogFood | null {
  return DOG_FOOD.find((id) => (inv[id] ?? 0) > 0) ?? null;
}

/** Hungry from the morning of a day until fed that day. Nothing bad comes of it. */
export const isHungry = (p: PetsSave, day: number): boolean => p.fedDay < day;

export type DogFind = { kind: 'coins'; n: number } | { kind: 'product'; item: ItemId };

/** What he brings back after a feeding: the same world and day always give the same find. */
export function dogFind(seed: number, day: number): DogFind {
  const r = mulberry32(hash2(seed, day, 0x5137c0));
  if (r() < PETS.coinChance) {
    const [lo, hi] = PETS.coins;
    return { kind: 'coins', n: lo + Math.floor(r() * (hi - lo + 1)) };
  }
  return { kind: 'product', item: PRODUCTS[Math.floor(r() * PRODUCTS.length)] };
}

/** Feeds Сірко if he is hungry and something he eats is carried: one is taken; what he ate, or null. */
export function feedDog(p: PetsSave, inv: Partial<Record<ItemId, number>>, day: number): DogFood | null {
  if (!isHungry(p, day)) return null;
  const food = dogFoodFrom(inv);
  if (!food) return null;
  inv[food] = (inv[food] ?? 0) - 1;
  p.fedDay = day;
  return food;
}

/** Feeds the fish: the coins it gives (the first feeding a day only). */
export function feedFish(p: PetsSave, day: number): number {
  if (p.fishDay >= day) return 0;
  p.fishDay = day;
  return PETS.fishCoins;
}
