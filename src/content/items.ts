import type { Biome, ModelRef } from '../contracts';
import type { Effect } from './effects';
import type { LineId } from './lines';

export interface ItemCard {
  id: string;
  /** Items are small props built in code unless a card says otherwise. */
  model?: ModelRef;
  name: string;
  /** What it is, one sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** Spoken the first time it is found (and when its sticker is tapped). */
  line: LineId;
  /** Where it lies around; 'any' = every biome. */
  biomes: Biome[] | 'any';
  /** Relative chance among the items allowed in a biome. */
  weight: number;
  /** Sparkle colour. */
  color: number;
  /** false: not an album sticker (left out of ITEM_ORDER on purpose). */
  album?: false;
  /**
   * The party carries it and can use it (the owner's call 2026-10-30): it shows in the kit plate's
   * second row with a count; a tap uses one and the effect starts. 'auto': never in the row, it
   * fires by itself near its lock (a key).
   */
  use?: Effect | 'auto';
  /** Льоша made it up: its album sticker has the gold rim. */
  lyosha?: true;
}

export const ITEMS = {
  coin: { id: 'coin', name: 'Монетка', about: 'Падають із монстрів і лежать на землі; скринька рахує їх для нагород.', line: 'item_coin', biomes: 'any', weight: 0, color: 0xffd54f },
  crystal_red: { id: 'crystal_red', name: 'Червоний кристал', about: 'Блискучий кристал для колекції в альбомі.', line: 'item_crystal_red', biomes: ['hills', 'snow', 'meadow'], weight: 2, color: 0xef5350 },
  crystal_blue: { id: 'crystal_blue', name: 'Синій кристал', about: 'Блискучий кристал для колекції в альбомі.', line: 'item_crystal_blue', biomes: ['hills', 'snow', 'beach'], weight: 2, color: 0x42a5f5 },
  crystal_green: { id: 'crystal_green', name: 'Зелений кристал', about: 'Блискучий кристал для колекції в альбомі.', line: 'item_crystal_green', biomes: ['forest', 'hills'], weight: 2, color: 0x66bb6a },
  crystal_purple: { id: 'crystal_purple', name: 'Фіолетовий кристал', about: 'Рідкісний кристал для колекції в альбомі.', line: 'item_crystal_purple', biomes: ['hills', 'snow'], weight: 1, color: 0xab47bc },
  crystal_yellow: { id: 'crystal_yellow', name: 'Жовтий кристал', about: 'Рідкісний кристал для колекції в альбомі.', line: 'item_crystal_yellow', biomes: ['beach', 'meadow', 'hills'], weight: 1, color: 0xffee58 },
  apple: { id: 'apple', name: 'Яблуко', about: 'Червоне яблучко для колекції.', line: 'item_apple', biomes: ['meadow', 'forest'], weight: 4, color: 0xe53935 },
  mushroom_red: { id: 'mushroom_red', name: 'Червоний гриб', about: 'Гриб для колекції — його не їдять.', line: 'item_mushroom_red', biomes: ['forest'], weight: 4, color: 0xe53935 },
  mushroom_brown: { id: 'mushroom_brown', name: 'Коричневий гриб', about: 'Гриб для колекції.', line: 'item_mushroom_brown', biomes: ['forest', 'meadow'], weight: 3, color: 0x8d6e63 },
  feather: { id: 'feather', name: 'Пір’їнка', about: 'Легка пір’їнка для колекції.', line: 'item_feather', biomes: ['meadow', 'beach'], weight: 3, color: 0xe3f2fd },
  earth_seed: { id: 'earth_seed', name: 'Насіння землі', about: 'Рідкісне насіння, трапляється будь-де.', line: 'item_earth_seed', biomes: 'any', weight: 0.6, color: 0x76ff03 },
  key_gold: { id: 'key_gold', name: 'Золотий ключ', about: 'Дуже рідкісний золотий ключ.', line: 'item_key_gold', biomes: 'any', weight: 0.25, color: 0xffca28, use: 'auto' },
  flower_yellow: { id: 'flower_yellow', name: 'Жовта квітка', about: 'Квітка для колекції.', line: 'item_flower_yellow', biomes: ['meadow'], weight: 4, color: 0xffeb3b },
  flower_blue: { id: 'flower_blue', name: 'Синя квітка', about: 'Квітка для колекції.', line: 'item_flower_blue', biomes: ['meadow', 'snow'], weight: 3, color: 0x64b5f6 },
  // The Land Eater's trophy: only dropped by the boss (weight 0 — never lies around).
  eater_heart: { id: 'eater_heart', name: 'Серце Пожирача', about: 'Трофей: випадає, коли переможеш Пожирача.', line: 'item_eater_heart', biomes: 'any', weight: 0, color: 0xffa526 },
  /** Dropped by monsters (never lies around by itself); picking it up gives a heart back. Not an album sticker. */
  heart: { id: 'heart', name: 'Сердечко', about: 'Випадає з монстрів і повертає одне сердечко.', line: 'item_heart', biomes: 'any', weight: 0, color: 0xff4d6d, album: false },
} satisfies Record<string, ItemCard>;

export type ItemId = keyof typeof ITEMS;

/** Album order: the page reads like a collection, coins first. */
export const ITEM_ORDER: ItemId[] = [
  'coin',
  'apple',
  'flower_yellow',
  'flower_blue',
  'mushroom_red',
  'mushroom_brown',
  'feather',
  'crystal_red',
  'crystal_blue',
  'crystal_green',
  'crystal_yellow',
  'crystal_purple',
  'earth_seed',
  'key_gold',
  'eater_heart',
];

export const PICKUPS = {
  /** Items per chunk: min + floor(rand * spread). */
  perChunkMin: 2,
  perChunkSpread: 4,
  /** Chance that a chunk also has a little line of coins. */
  coinTrailChance: 0.55,
  coinTrailLength: [3, 6] as [number, number],
  pickRadius: 1.2,
  magnetRadius: 2.6,
  /** Items get a 3D object only this close to the player (draw calls on a tablet). */
  showRadius: 30,
};
