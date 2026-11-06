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
  apple: { id: 'apple', name: 'Яблуко', about: 'Червоне яблучко: для колекції й для кухні бабусь.', line: 'item_apple', biomes: ['meadow', 'forest'], weight: 4, color: 0xe53935 },
  mushroom_red: { id: 'mushroom_red', name: 'Червоний гриб', about: 'Гриб для колекції — його не їдять.', line: 'item_mushroom_red', biomes: ['forest'], weight: 4, color: 0xe53935 },
  mushroom_brown: { id: 'mushroom_brown', name: 'Коричневий гриб', about: 'Гриб для колекції й для кухні бабусь.', line: 'item_mushroom_brown', biomes: ['forest', 'meadow'], weight: 3, color: 0x8d6e63 },
  feather: { id: 'feather', name: 'Пір’їнка', about: 'Легка пір’їнка для колекції.', line: 'item_feather', biomes: ['meadow', 'beach'], weight: 3, color: 0xe3f2fd },
  earth_seed: { id: 'earth_seed', name: 'Насіння землі', about: 'Рідкісне насіння, трапляється будь-де.', line: 'item_earth_seed', biomes: 'any', weight: 0.6, color: 0x76ff03 },
  key_gold: { id: 'key_gold', name: 'Золотий ключ', about: 'Дуже рідкісний золотий ключ.', line: 'item_key_gold', biomes: 'any', weight: 0.25, color: 0xffca28, use: 'auto' },
  flower_yellow: { id: 'flower_yellow', name: 'Жовта квітка', about: 'Квітка для колекції.', line: 'item_flower_yellow', biomes: ['meadow'], weight: 4, color: 0xffeb3b },
  flower_blue: { id: 'flower_blue', name: 'Синя квітка', about: 'Квітка для колекції.', line: 'item_flower_blue', biomes: ['meadow', 'snow'], weight: 3, color: 0x64b5f6 },
  // The giants' shared trophy: only dropped by a boss (weight 0 — never lies around).
  eater_heart: { id: 'eater_heart', name: 'Серце велетня', about: 'Трофей: випадає, коли переможеш великого боса.', line: 'item_eater_heart', biomes: 'any', weight: 0, color: 0xffa526 },
  /** Dropped by monsters (never lies around by itself); picking it up gives a heart back. Not an album sticker. */
  heart: { id: 'heart', name: 'Сердечко', about: 'Випадає з монстрів і повертає одне сердечко.', line: 'item_heart', biomes: 'any', weight: 0, color: 0xff4d6d, album: false },
  babusia_pie: { id: 'babusia_pie', name: 'Бабусин пиріжок', about: 'Один пиріжок повертає всі сердечка всім героям.', line: 'item_babusia_pie', biomes: 'any', weight: 0, color: 0xeab02b, use: { kind: 'heal' } },
  pocket_speaker: { id: 'pocket_speaker', name: 'Кишенькова колонка', about: 'Монстри поруч танцюють 10 секунд і не кусаються.', line: 'item_pocket_speaker', biomes: 'any', weight: 0, color: 0x2f7fd6, use: { kind: 'peace', for: 10, reach: 9 } },
  disc_polka: { id: 'disc_polka', name: 'Диск «Полька»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_polka', biomes: 'any', weight: 0, color: 0xe0583f },
  disc_waltz: { id: 'disc_waltz', name: 'Диск «Вальс»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_waltz', biomes: 'any', weight: 0, color: 0x2f918b },
  disc_twist: { id: 'disc_twist', name: 'Диск «Твіст»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_twist', biomes: 'any', weight: 0, color: 0xeab02b },
  pocket_cloud: { id: 'pocket_cloud', name: 'Кишенькова хмаринка', about: 'Дощик над монстрами: вони стоять і чекають 6 секунд.', line: 'item_pocket_cloud', biomes: 'any', weight: 0, color: 0x8fd0ff, use: { kind: 'freeze', for: 6, reach: 10 } },
  magic_can: { id: 'magic_can', name: 'Чарівна лійка', about: 'Навколо героя виростають ромашки й маки, а сердечка наповнюються.', line: 'item_magic_can', biomes: 'any', weight: 0, color: 0x7fd67f, use: { kind: 'bloom' } },
  babusia_cutlet: { id: 'babusia_cutlet', name: 'Бабусина котлетка', about: 'Дає швидкий біг на 30 секунд.', line: 'item_babusia_cutlet', biomes: 'any', weight: 0, color: 0xc98f4c, use: { kind: 'fast', for: 30 } },
  super_torch: { id: 'super_torch', name: 'Супер-ліхтарик', about: 'Хвилину поруч із героями не з’являються монстри.', line: 'item_super_torch', biomes: 'any', weight: 0, color: 0xffe3a3, use: { kind: 'light', for: 90, reach: 12 } },
  freeze_popper: { id: 'freeze_popper', name: 'Морозилка-хлопавка', about: 'Монстри поруч застигають на 4 секунди.', line: 'item_freeze_popper', biomes: 'any', weight: 0, color: 0x8fe3ff, use: { kind: 'freeze', for: 4, reach: 12 } },
  rubber_fish: { id: 'rubber_fish', name: 'Гумова рибка', about: 'Пищить так смішно, що монстри стоять і сміються 3 секунди.', line: 'item_rubber_fish', biomes: 'any', weight: 0, color: 0xeab02b, use: { kind: 'freeze', for: 3, reach: 9 } },
  babusia_bell: { id: 'babusia_bell', name: 'Дзвіночок до бабусі', about: 'Один дзвінок — і всі герої вже біля бабусі.', line: 'item_babusia_bell', biomes: 'any', weight: 0, color: 0xee6a82, use: { kind: 'babusia' } },
  disc_hopak: { id: 'disc_hopak', name: 'Диск «Гопак»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_hopak', biomes: 'any', weight: 0, color: 0xe8463a },
  disc_reggae: { id: 'disc_reggae', name: 'Диск «Реггі»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_reggae', biomes: 'any', weight: 0, color: 0x3fa142 },
  disc_march: { id: 'disc_march', name: 'Диск «Марш»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_march', biomes: 'any', weight: 0, color: 0x2f7fd6 },
  disc_space: { id: 'disc_space', name: 'Диск «Космос»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_space', biomes: 'any', weight: 0, color: 0x8a5cd6 },
  disc_funk: { id: 'disc_funk', name: 'Диск «Робо-фанк»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_funk', biomes: 'any', weight: 0, color: 0x7ff3ff },
  disc_blues: { id: 'disc_blues', name: 'Диск «Рибний блюз»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_blues', biomes: 'any', weight: 0, color: 0x2f918b },
  disc_purr: { id: 'disc_purr', name: 'Диск «Мур-мур-біт»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_purr', biomes: 'any', weight: 0, color: 0xee6a82 },
  disc_carol: { id: 'disc_carol', name: 'Диск «Колядка»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_carol', biomes: 'any', weight: 0, color: 0xffe3a3 },
  disc_granny: { id: 'disc_granny', name: 'Диск «Бабусина пісня»', about: 'Нова пісня для музичного автомата і діджейського пульта.', line: 'item_disc_granny', biomes: 'any', weight: 0, color: 0xffd23a },
  cherry: { id: 'cherry', name: 'Вишні', about: 'Продукт для кухні бабусь: лежать на луках і в лісі.', line: 'item_cherry', biomes: ['meadow', 'forest'], weight: 3, color: 0xb0233a },
  potato: { id: 'potato', name: 'Картопля', about: 'Продукт для кухні бабусь: лежить на луках і пагорбах.', line: 'item_potato', biomes: ['meadow', 'hills'], weight: 3, color: 0xc9a26b },
  carrot: { id: 'carrot', name: 'Морква', about: 'Продукт для кухні бабусь: лежить на луках і пагорбах.', line: 'item_carrot', biomes: ['meadow', 'hills'], weight: 3, color: 0xf08a24 },
  honey: { id: 'honey', name: 'Мед', about: 'Продукт для кухні бабусь: лежить у лісі.', line: 'item_honey', biomes: ['forest'], weight: 2, color: 0xeab02b },
  egg: { id: 'egg', name: 'Яйце', about: 'Продукт для кухні бабусь: гніздечка ховаються в траві й у лісі.', line: 'item_egg', biomes: ['meadow', 'forest'], weight: 2, color: 0xfff1d6 },
  varenyky: { id: 'varenyky', name: 'Вареники з вишнями', about: 'Швидкий біг на 40 секунд.', line: 'item_varenyky', biomes: 'any', weight: 0, color: 0xb0233a, use: { kind: 'fast', for: 40 } },
  deruny: { id: 'deruny', name: 'Деруни', about: 'Монстри поруч завмирають на 6 секунд.', line: 'item_deruny', biomes: 'any', weight: 0, color: 0xc98f4c, use: { kind: 'freeze', for: 6, reach: 12 } },
  borscht: { id: 'borscht', name: 'Борщ', about: 'Дві хвилини поруч із героями не з’являються монстри.', line: 'item_borscht', biomes: 'any', weight: 0, color: 0xb3263a, use: { kind: 'light', for: 120, reach: 14 } },
  yushka: { id: 'yushka', name: 'Грибна юшка', about: 'Монстри поруч танцюють 15 секунд.', line: 'item_yushka', biomes: 'any', weight: 0, color: 0xd9a35b, use: { kind: 'peace', for: 15, reach: 12 } },
  apple_pies: { id: 'apple_pies', name: 'Пиріжки з яблуками', about: 'Швидкий біг на 30 секунд.', line: 'item_apple_pies', biomes: 'any', weight: 0, color: 0xeab02b, use: { kind: 'fast', for: 30 } },
  compote: { id: 'compote', name: 'Компот', about: 'Монстри поруч танцюють 12 секунд.', line: 'item_compote', biomes: 'any', weight: 0, color: 0xee6a82, use: { kind: 'peace', for: 12, reach: 10 } },
  honey_pancakes: { id: 'honey_pancakes', name: 'Млинці з медом', about: 'Швидкий біг на 40 секунд.', line: 'item_honey_pancakes', biomes: 'any', weight: 0, color: 0xeab02b, use: { kind: 'fast', for: 40 } },
  sunny_egg: { id: 'sunny_egg', name: 'Яєчня-сонечко', about: 'Дві хвилини поруч із героями не з’являються монстри.', line: 'item_sunny_egg', biomes: 'any', weight: 0, color: 0xffd23a, use: { kind: 'light', for: 120, reach: 14 } },
  carrot_cutlets: { id: 'carrot_cutlets', name: 'Морквяні котлетки', about: 'Монстри поруч завмирають на 6 секунд.', line: 'item_carrot_cutlets', biomes: 'any', weight: 0, color: 0xf08a24, use: { kind: 'freeze', for: 6, reach: 12 } },
  apple_porridge: { id: 'apple_porridge', name: 'Каша з яблуками', about: 'Півтори хвилини поруч із героями не з’являються монстри.', line: 'item_apple_porridge', biomes: 'any', weight: 0, color: 0xf3ead6, use: { kind: 'light', for: 90, reach: 12 } },
  ladybird_toast: { id: 'ladybird_toast', name: 'Бутерброд-сонечко', about: 'Монстри поруч танцюють 15 секунд.', line: 'item_ladybird_toast', biomes: 'any', weight: 0, color: 0xe0583f, use: { kind: 'peace', for: 15, reach: 12 } },
  butterfly_cookies: { id: 'butterfly_cookies', name: 'Печиво-метелики', about: 'Монстри поруч завмирають на 8 секунд.', line: 'item_butterfly_cookies', biomes: 'any', weight: 0, color: 0xeab02b, use: { kind: 'freeze', for: 8, reach: 10 } },
} satisfies Record<string, ItemCard>;

export type ItemId = keyof typeof ITEMS;

/** Album order: the page reads like a collection, coins first. */
export const ITEM_ORDER: ItemId[] = [
  'coin',
  'apple',
  'cherry',
  'potato',
  'carrot',
  'honey',
  'egg',
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
  'babusia_pie',
  'pocket_speaker',
  'disc_polka',
  'disc_waltz',
  'disc_twist',
  'pocket_cloud',
  'magic_can',
  'babusia_cutlet',
  'super_torch',
  'freeze_popper',
  'rubber_fish',
  'babusia_bell',
  'disc_hopak',
  'disc_reggae',
  'disc_march',
  'disc_space',
  'disc_funk',
  'disc_blues',
  'disc_purr',
  'disc_carol',
  'disc_granny',
  'varenyky',
  'deruny',
  'borscht',
  'yushka',
  'apple_pies',
  'compote',
  'honey_pancakes',
  'sunny_egg',
  'carrot_cutlets',
  'apple_porridge',
  'ladybird_toast',
  'butterfly_cookies',
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
