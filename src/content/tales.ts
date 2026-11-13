import type { Race } from '../world/villages';
import { hostLine, type Host } from './babusia';
import type { BuildingId } from './buildings';
import type { ItemId } from './items';
import type { LineId } from './lines';
import type { MonsterKind } from './monsters';
import { RAIN, RAINBOW } from './weather';

/**
 * The tales (DESIGN.md «Tales»): always one under way, a short story of two to four steps built
 * from things the game already has (gather, a thief to catch, a building to put up, a place to
 * reach, music, a wave, a night's sleep, a lighthouse to light). Friends ask by a paper plane
 * that lands at the hero's feet; Пупся's own tales come as her dream after a night's sleep. A tale
 * done is a page in the book of tales (the album). systems/tales.ts runs them.
 *
 * A new tale — one Льоша made up — is a card here plus its lines (`lyosha: true` puts it first).
 */

/** Things lying about for a tale (assets/tales.ts models; the picture is a HUD sprite). */
export type TaleItem = 'fish' | 'scroll' | 'yarn' | 'chest' | 'daisy' | 'pole' | 'disc' | 'shell' | 'honey' | 'berry' | 'ladybird';
export const TALE_ITEMS: Record<TaleItem, { icon: string; /** After a number: one, two to four, five and more (the «Зміст гри» page). */ words: [string, string, string] }> = {
  fish: { icon: 'item-fish', words: ['рибку', 'рибки', 'рибок'] },
  scroll: { icon: 'item-scroll', words: ['шматок карти', 'шматки карти', 'шматків карти'] },
  yarn: { icon: 'item-yarn', words: ['клубочок', 'клубочки', 'клубочків'] },
  chest: { icon: 'chest', words: ['скриню', 'скрині', 'скринь'] },
  daisy: { icon: 'item-daisy', words: ['ромашку', 'ромашки', 'ромашок'] },
  pole: { icon: 'item-pole', words: ['палицю', 'палиці', 'палиць'] },
  disc: { icon: 'item-disc', words: ['диск', 'диски', 'дисків'] },
  shell: { icon: 'item-shell', words: ['мушлю', 'мушлі', 'мушель'] },
  honey: { icon: 'item-honey', words: ['баночку меду', 'баночки меду', 'баночок меду'] },
  berry: { icon: 'item-berry', words: ['ягідку', 'ягідки', 'ягідок'] },
  ladybird: { icon: 'item-ladybird', words: ['сонечко', 'сонечка', 'сонечок'] },
};

/** Where a step happens: home, around the hero when it begins, the nearest dark lighthouse, Бабуся's house, a village. */
export type TalePlace = 'home' | 'here' | 'lighthouse' | 'babusia' | Race;

export type StepKind = 'gather' | 'thief' | 'place' | 'visit' | 'music' | 'defend' | 'sleep' | 'light' | 'cook';

export interface TaleStep {
  kind: StepKind;
  at: TalePlace;
  /** gather: things; defend: monsters; music: seconds. */
  goal?: number;
  /** gather: what lies about; thief: what the monster carries off (it drops it when beaten). */
  item?: TaleItem;
  /** thief: who runs off with it (Зомбік unless said). */
  monster?: MonsterKind;
  /** gather: how far from the place things lie (blocks). */
  spread?: [number, number];
  /** place: the building to put up there. */
  building?: BuildingId;
  /** Said when the step begins, when the tale piece is tapped, and as a reminder. */
  ask: LineId;
  /** The tale piece's picture (a HUD sprite). */
  picture: string;
}

/** Who asks: Пупся dreams her tales, the races send letters, Бабуся sends a stork. */
export type TaleFrom = 'pupsia' | 'babusia' | Race;

/** What a tale gives at the end besides its coins: things to carry, a building for the box. */
export type TaleGift = { item: ItemId; n?: number } | { building: BuildingId };

export interface TaleCard {
  /** A wind takes part in this tale; summoned/restored by systems/tornadoes.ts. */
  wind?: 'fire' | 'blue';
  id: string;
  /** Its title in the book, for the parents (the «Зміст гри» page). */
  name: string;
  from: TaleFrom;
  /** Льоша made it up: it comes before the others, and its page in the book has a gold rim. */
  lyosha?: boolean;
  /** A tale of Бабуся's: who asks; it comes only while she is at home (none said: Юля). */
  host?: Host;
  /** Her hello: it comes before all others once she is at home. */
  arrives?: boolean;
  /** Offered only once the child has one of these buildings (until then the others go first). */
  needs?: BuildingId[];
  /** Offered only after this tale is done. */
  follows?: string;
  /** The request (the letter, the dream); the first step's ask follows it. */
  open: LineId;
  steps: TaleStep[];
  thanks: LineId;
  /** The book page: the tale in one sentence, and its picture. */
  retell: LineId;
  sticker: string;
  coins: number;
  /** Found at the end (content/artifacts.ts id): its lasting power is on from then. */
  artifact?: string;
  /** Joins the party at the end (content/companions.ts id). */
  companion?: string;
  /** Given at the end. */
  gifts?: TaleGift[];
  /** The weather she makes at the end (content/weather.ts number). */
  weather?: number;
  /** A word from someone else right after the thanks. */
  after?: LineId;
}

/** The first tale of a new story: it begins as the heroes wake, and teaches one thing a step. */
export const PROLOGUE = 'fish';

export const TALES: TaleCard[] = [
  {
    id: 'fish',
    name: 'Пупсині рибки',
    from: 'pupsia',
    open: 'tale_fish_open',
    steps: [
      { kind: 'gather', at: 'home', item: 'fish', goal: 2, spread: [7, 13], ask: 'tale_fish_1', picture: 'item-fish' },
      { kind: 'thief', at: 'home', item: 'fish', ask: 'tale_fish_2', picture: 'zombie' },
      { kind: 'place', at: 'home', building: 'tent', ask: 'tale_fish_3', picture: 'b-tent' },
      { kind: 'visit', at: 'elves', ask: 'tale_fish_4', picture: 'folk-elves' },
    ],
    thanks: 'tale_fish_thanks',
    retell: 'tale_fish_retell',
    sticker: 'item-fish',
    coins: 10,
  },
  {
    id: 'babusia_hi',
    name: 'Бабуся приїхала',
    from: 'babusia',
    open: 'tale_babusia_hi_open',
    steps: [
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_hi_1', picture: 'map-babusia' },
      { kind: 'gather', at: 'babusia', item: 'daisy', goal: 4, spread: [13, 26], ask: 'tale_babusia_hi_2', picture: 'item-daisy' },
    ],
    thanks: 'tale_babusia_hi_thanks',
    retell: 'tale_babusia_hi_retell',
    sticker: 'item-daisy',
    coins: 10,
    gifts: [{ item: 'babusia_pie', n: 3 }],
  },
  {
    id: 'dog',
    name: 'Пес Сірко',
    from: 'pupsia',
    open: 'tale_dog_open',
    steps: [
      { kind: 'defend', at: 'here', goal: 3, ask: 'tale_dog_1', picture: 'zombie' },
      { kind: 'visit', at: 'home', ask: 'tale_dog_2', picture: 'map-house' },
    ],
    thanks: 'tale_dog_thanks',
    retell: 'tale_dog_retell',
    sticker: 'heart',
    coins: 10,
    companion: 'sirko',
  },
  {
    id: 'wind_friend',
    name: 'Друг із вітру',
    from: 'pupsia',
    follows: 'dog',
    needs: ['boombox'],
    wind: 'blue',
    open: 'tale_wind_friend_open',
    steps: [
      { kind: 'gather', at: 'here', item: 'shell', goal: 3, spread: [8, 14], ask: 'tale_wind_friend_1', picture: 'item-shell' },
      { kind: 'music', at: 'here', goal: 10, ask: 'tale_wind_friend_2', picture: 'b-boombox' },
    ],
    thanks: 'tale_wind_friend_thanks',
    retell: 'tale_wind_friend_retell',
    sticker: 'item-shell',
    coins: 20,
    gifts: [{ item: 'wind_whistle', n: 1 }],
  },
  {
    id: 'treasure',
    name: 'Пупсин скарб',
    from: 'pupsia',
    open: 'tale_treasure_open',
    steps: [
      { kind: 'gather', at: 'home', item: 'scroll', goal: 3, spread: [16, 34], ask: 'tale_treasure_1', picture: 'item-scroll' },
      { kind: 'gather', at: 'home', item: 'chest', goal: 1, spread: [26, 40], ask: 'tale_treasure_2', picture: 'chest' },
    ],
    thanks: 'tale_treasure_thanks',
    retell: 'tale_treasure_retell',
    sticker: 'chest',
    coins: 25,
  },
  {
    id: 'babusia_walk',
    name: 'Прогулянка в будь-яку погоду',
    from: 'babusia',
    open: 'tale_babusia_walk_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'pole', goal: 1, spread: [16, 30], ask: 'tale_babusia_walk_1', picture: 'item-pole' },
      { kind: 'thief', at: 'babusia', item: 'pole', ask: 'tale_babusia_walk_2', picture: 'zombie' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_walk_3', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_walk_thanks',
    retell: 'tale_babusia_walk_retell',
    sticker: 'item-pole',
    coins: 15,
    gifts: [{ item: 'pocket_speaker', n: 3 }],
  },
  {
    id: 'party',
    name: 'Дискотека для ельфів',
    from: 'elves',
    needs: ['boombox', 'bigspeaker'],
    open: 'tale_party_open',
    steps: [
      { kind: 'place', at: 'here', building: 'boombox', ask: 'tale_party_1', picture: 'b-boombox' },
      { kind: 'music', at: 'here', goal: 15, ask: 'tale_party_2', picture: 'note' },
    ],
    thanks: 'tale_party_thanks',
    retell: 'tale_party_retell',
    sticker: 'note',
    coins: 15,
  },
  {
    id: 'guard',
    name: 'Нічна варта',
    from: 'pupsia',
    open: 'tale_guard_open',
    steps: [
      { kind: 'defend', at: 'home', goal: 5, ask: 'tale_guard_1', picture: 'zombie' },
      { kind: 'sleep', at: 'home', ask: 'tale_guard_2', picture: 'moon' },
    ],
    thanks: 'tale_guard_thanks',
    retell: 'tale_guard_retell',
    sticker: 'moon',
    coins: 15,
  },
  {
    id: 'babusia_discs',
    name: 'Загублені диски',
    from: 'babusia',
    open: 'tale_babusia_discs_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'disc', goal: 3, spread: [14, 32], ask: 'tale_babusia_discs_1', picture: 'item-disc' },
      { kind: 'thief', at: 'babusia', item: 'disc', ask: 'tale_babusia_discs_2', picture: 'zombie' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_discs_3', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_discs_thanks',
    retell: 'tale_babusia_discs_retell',
    sticker: 'item-disc',
    coins: 15,
    gifts: [{ building: 'jukebox' }, { item: 'disc_polka' }, { item: 'disc_waltz' }, { item: 'disc_twist' }],
  },
  {
    id: 'babusia_swim',
    name: 'Заплив з бабусею',
    from: 'babusia',
    open: 'tale_babusia_swim_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'shell', goal: 4, spread: [10, 26], ask: 'tale_babusia_swim_1', picture: 'item-shell' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_swim_2', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_swim_thanks',
    retell: 'tale_babusia_swim_retell',
    sticker: 'item-shell',
    coins: 15,
    gifts: [{building: 'wheelspeaker'}, {item: 'disc_reggae'}],
  },
  {
    id: 'gnomes',
    name: 'Гноми кличуть',
    from: 'gnomes',
    open: 'tale_gnomes_open',
    steps: [{ kind: 'visit', at: 'gnomes', ask: 'tale_gnomes_1', picture: 'folk-gnomes' }],
    thanks: 'tale_gnomes_thanks',
    retell: 'tale_gnomes_retell',
    sticker: 'kid-gnomes',
    coins: 15,
  },
  {
    id: 'first_dinner',
    name: 'Перший обід',
    from: 'pupsia',
    lyosha: true,
    follows: 'babusia_hi',
    open: 'tale_first_dinner_open',
    steps: [
      { kind: 'visit', at: 'babusia', ask: 'tale_first_dinner_1', picture: 'ask-pot' },
      { kind: 'cook', at: 'babusia', ask: 'tale_first_dinner_2', picture: 'ask-pot' },
    ],
    thanks: 'tale_first_dinner_thanks',
    retell: 'tale_first_dinner_retell',
    sticker: 'ask-pot',
    coins: 15,
  },
  {
    id: 'olia_hi',
    name: 'Бабуся Оля приїхала',
    from: 'babusia',
    host: 'olia',
    arrives: true,
    open: 'tale_olia_hi_open',
    steps: [
      { kind: 'visit', at: 'babusia', ask: 'tale_olia_hi_1', picture: 'map-olia' },
      { kind: 'gather', at: 'babusia', item: 'berry', goal: 4, spread: [13, 26], ask: 'tale_olia_hi_2', picture: 'item-berry' },
    ],
    thanks: 'tale_olia_hi_thanks',
    retell: 'tale_olia_hi_retell',
    sticker: 'map-olia',
    coins: 10,
    gifts: [{ item: 'babusia_pie', n: 3 }],
  },
  {
    id: 'olia_ladybirds',
    name: 'Сім сонечок',
    from: 'babusia',
    host: 'olia',
    open: 'tale_olia_ladybirds_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'ladybird', goal: 7, spread: [12, 28], ask: 'tale_olia_ladybirds_1', picture: 'item-ladybird' },
      { kind: 'visit', at: 'babusia', ask: 'tale_olia_ladybirds_2', picture: 'map-olia' },
    ],
    thanks: 'tale_olia_ladybirds_thanks',
    retell: 'tale_olia_ladybirds_retell',
    sticker: 'item-ladybird',
    coins: 15,
    gifts: [{ item: 'babusia_pie', n: 2 }],
  },
  {
    id: 'olia_moths',
    name: 'Метелики до лампи',
    from: 'babusia',
    host: 'olia',
    needs: ['lamp'],
    open: 'tale_olia_moths_open',
    steps: [
      { kind: 'place', at: 'babusia', building: 'lamp', ask: 'tale_olia_moths_1', picture: 'b-lamp' },
      { kind: 'sleep', at: 'babusia', ask: 'tale_olia_moths_2', picture: 'moon' },
    ],
    thanks: 'tale_olia_moths_thanks',
    retell: 'tale_olia_moths_retell',
    sticker: 'b-lamp',
    coins: 15,
    gifts: [{ item: 'babusia_pie', n: 2 }],
  },
  {
    id: 'babusia_runaway',
    name: 'Подарунок-втікач',
    from: 'babusia',
    host: 'olia',
    open: 'tale_babusia_runaway_open',
    steps: [
      { kind: 'thief', at: 'babusia', monster: 'giftbox', item: 'chest', ask: 'tale_babusia_runaway_1', picture: 'chest' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_runaway_2', picture: 'map-olia' },
    ],
    thanks: 'tale_babusia_runaway_thanks',
    retell: 'tale_babusia_runaway_retell',
    sticker: 'chest',
    coins: 15,
    gifts: [{building: 'drums'}, {item: 'disc_funk'}],
  },
  {
    id: 'yarn',
    name: 'Клубочки',
    from: 'pupsia',
    open: 'tale_yarn_open',
    steps: [
      { kind: 'gather', at: 'here', item: 'yarn', goal: 5, spread: [14, 40], ask: 'tale_yarn_1', picture: 'item-yarn' },
      { kind: 'visit', at: 'home', ask: 'tale_yarn_2', picture: 'map-house' },
    ],
    thanks: 'tale_yarn_thanks',
    retell: 'tale_yarn_retell',
    sticker: 'item-yarn',
    coins: 15,
  },
  {
    id: 'babusia_road_discs',
    name: 'Диски в дорозі',
    from: 'babusia',
    open: 'tale_babusia_road_discs_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'disc', goal: 4, spread: [18, 40], ask: 'tale_babusia_road_discs_1', picture: 'item-disc' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_road_discs_2', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_road_discs_thanks',
    retell: 'tale_babusia_road_discs_retell',
    sticker: 'item-disc',
    coins: 15,
    gifts: [{building: 'turntable'}, {item: 'disc_hopak'}, {item: 'disc_march'}, {item: 'disc_space'}],
  },
  {
    id: 'light',
    name: 'Маяк для гномів',
    from: 'gnomes',
    needs: ['windmill', 'generator', 'solar'],
    open: 'tale_light_open',
    steps: [{ kind: 'light', at: 'lighthouse', ask: 'tale_light_1', picture: 'task-lighthouse' }],
    thanks: 'tale_light_thanks',
    retell: 'tale_light_retell',
    sticker: 'task-lighthouse',
    coins: 20,
  },
  {
    id: 'babusia_elf_flowers',
    name: 'Квіти для ельфів',
    from: 'babusia',
    open: 'tale_babusia_elf_flowers_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'daisy', goal: 5, spread: [10, 28], ask: 'tale_babusia_elf_flowers_1', picture: 'item-daisy' },
      { kind: 'visit', at: 'elves', ask: 'tale_babusia_elf_flowers_2', picture: 'folk-elves' },
    ],
    thanks: 'tale_babusia_elf_flowers_thanks',
    retell: 'tale_babusia_elf_flowers_retell',
    sticker: 'item-daisy',
    coins: 15,
    gifts: [{building: 'flowerbed'}, {item: 'magic_can', n: 2}],
  },
  {
    id: 'lamps',
    name: 'Ліхтарі роботів',
    from: 'robots',
    needs: ['lamp'],
    open: 'tale_lamps_open',
    steps: [
      { kind: 'place', at: 'home', building: 'lamp', ask: 'tale_lamps_1', picture: 'tale-lamp' },
      { kind: 'sleep', at: 'home', ask: 'tale_lamps_2', picture: 'moon' },
    ],
    thanks: 'tale_lamps_thanks',
    retell: 'tale_lamps_retell',
    sticker: 'tale-lamp',
    coins: 15,
  },
  {
    id: 'babusia_yard_disco',
    name: 'Дискотека на подвір’ї',
    from: 'babusia',
    needs: ['boombox'],
    open: 'tale_babusia_yard_disco_open',
    steps: [
      { kind: 'place', at: 'babusia', building: 'boombox', ask: 'tale_babusia_yard_disco_1', picture: 'b-boombox' },
      { kind: 'music', at: 'babusia', goal: 12, ask: 'tale_babusia_yard_disco_2', picture: 'b-boombox' },
    ],
    thanks: 'tale_babusia_yard_disco_thanks',
    retell: 'tale_babusia_yard_disco_retell',
    sticker: 'b-boombox',
    coins: 15,
    gifts: [{building: 'speakerwall'}, {building: 'lasers'}, {building: 'smokemachine'}, {item: 'disc_blues'}],
  },
  {
    id: 'robots',
    name: 'Роботи кличуть',
    from: 'robots',
    open: 'tale_robots_open',
    steps: [{ kind: 'visit', at: 'robots', ask: 'tale_robots_1', picture: 'folk-robots' }],
    thanks: 'tale_robots_thanks',
    retell: 'tale_robots_retell',
    sticker: 'kid-robots',
    coins: 20,
  },
  {
    id: 'babusia_evening',
    name: 'Нічні посиденьки',
    from: 'babusia',
    open: 'tale_babusia_evening_open',
    steps: [
      { kind: 'sleep', at: 'babusia', ask: 'tale_babusia_evening_1', picture: 'moon' },
    ],
    thanks: 'tale_babusia_evening_thanks',
    retell: 'tale_babusia_evening_retell',
    sticker: 'moon',
    coins: 15,
    artifact: 'eternal_torch',
    gifts: [{building: 'wickerchair'}, {building: 'neonsign'}, {building: 'megagarland'}],
  },
  {
    id: 'aliens',
    name: 'Інопланетяни кличуть',
    from: 'aliens',
    open: 'tale_aliens_open',
    steps: [{ kind: 'visit', at: 'aliens', ask: 'tale_aliens_1', picture: 'folk-aliens' }],
    thanks: 'tale_aliens_thanks',
    retell: 'tale_aliens_retell',
    sticker: 'kid-aliens',
    coins: 25,
  },
  {
    id: 'babusia_rubber_fish',
    after: 'rubber_fish_pupsia',
    name: 'Гумова рибка',
    from: 'babusia',
    host: 'olia',
    open: 'tale_babusia_rubber_fish_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'fish', goal: 3, spread: [12, 28], ask: 'tale_babusia_rubber_fish_1', picture: 'item-fish' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_rubber_fish_2', picture: 'map-olia' },
    ],
    thanks: 'tale_babusia_rubber_fish_thanks',
    retell: 'tale_babusia_rubber_fish_retell',
    sticker: 'item-fish',
    coins: 15,
    gifts: [{item: 'rubber_fish', n: 3}, {item: 'disc_purr'}],
  },
  {
    id: 'babusia_hedgehog',
    name: 'Їжачок у траві',
    from: 'babusia',
    host: 'olia',
    open: 'tale_babusia_hedgehog_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'berry', goal: 4, spread: [10, 26], ask: 'tale_babusia_hedgehog_1', picture: 'item-berry' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_hedgehog_2', picture: 'map-olia' },
    ],
    thanks: 'tale_babusia_hedgehog_thanks',
    retell: 'tale_babusia_hedgehog_retell',
    sticker: 'item-berry',
    coins: 15,
    companion: 'hedgehog',
  },
  {
    id: 'babusia_rain',
    weather: RAIN,
    name: 'Дощик для квітів',
    from: 'babusia',
    open: 'tale_babusia_rain_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'daisy', goal: 3, spread: [8, 20], ask: 'tale_babusia_rain_1', picture: 'item-daisy' },
      { kind: 'sleep', at: 'babusia', ask: 'tale_babusia_rain_2', picture: 'moon' },
    ],
    thanks: 'tale_babusia_rain_thanks',
    retell: 'tale_babusia_rain_retell',
    sticker: 'item-daisy',
    coins: 15,
    gifts: [{building: 'weatherpad'}, {item: 'pocket_cloud', n: 3}, {building: 'sunflower'}],
  },
  {
    id: 'babusia_owl',
    name: 'Сова-сторож',
    from: 'babusia',
    host: 'olia',
    open: 'tale_babusia_owl_open',
    steps: [
      { kind: 'sleep', at: 'babusia', ask: 'tale_babusia_owl_1', picture: 'moon' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_owl_2', picture: 'map-olia' },
    ],
    thanks: 'tale_babusia_owl_thanks',
    retell: 'tale_babusia_owl_retell',
    sticker: 'moon',
    coins: 15,
    companion: 'owl',
    gifts: [{building: 'minisun'}],
  },
  {
    id: 'babusia_honey',
    name: 'Мед для бабусі',
    from: 'babusia',
    host: 'olia',
    open: 'tale_babusia_honey_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'honey', goal: 4, spread: [14, 32], ask: 'tale_babusia_honey_1', picture: 'item-honey' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_honey_2', picture: 'map-olia' },
    ],
    thanks: 'tale_babusia_honey_thanks',
    retell: 'tale_babusia_honey_retell',
    sticker: 'item-honey',
    coins: 15,
    companion: 'bee',
    gifts: [{building: 'beehive'}],
  },
  {
    id: 'babusia_rainbow',
    weather: RAINBOW,
    name: 'Веселка через річку',
    from: 'babusia',
    open: 'tale_babusia_rainbow_open',
    steps: [
      { kind: 'visit', at: 'home', ask: 'tale_babusia_rainbow_1', picture: 'map-house' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_rainbow_2', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_rainbow_thanks',
    retell: 'tale_babusia_rainbow_retell',
    sticker: 'item-daisy',
    coins: 15,
    gifts: [{building: 'rainbowbridge'}, {building: 'birdfeeder'}],
  },
  {
    id: 'babusia_fox',
    name: 'Лисеня і клубочки',
    from: 'babusia',
    host: 'olia',
    open: 'tale_babusia_fox_open',
    steps: [
      { kind: 'gather', at: 'here', item: 'yarn', goal: 3, spread: [12, 30], ask: 'tale_babusia_fox_1', picture: 'item-yarn' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_fox_2', picture: 'map-olia' },
    ],
    thanks: 'tale_babusia_fox_thanks',
    retell: 'tale_babusia_fox_retell',
    sticker: 'item-yarn',
    coins: 15,
    companion: 'foxcub',
  },
  {
    id: 'babusia_wreath',
    name: 'Вінок королеви',
    from: 'babusia',
    open: 'tale_babusia_wreath_open',
    steps: [
      { kind: 'gather', at: 'babusia', item: 'daisy', goal: 6, spread: [14, 34], ask: 'tale_babusia_wreath_1', picture: 'item-daisy' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_wreath_2', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_wreath_thanks',
    retell: 'tale_babusia_wreath_retell',
    sticker: 'item-daisy',
    coins: 15,
    artifact: 'queen_wreath',
  },
  {
    id: 'babusia_gold_record',
    name: 'Золота платівка',
    from: 'babusia',
    needs: ['boombox'],
    open: 'tale_babusia_gold_record_open',
    steps: [
      { kind: 'music', at: 'babusia', goal: 20, ask: 'tale_babusia_gold_record_1', picture: 'b-boombox' },
    ],
    thanks: 'tale_babusia_gold_record_thanks',
    retell: 'tale_babusia_gold_record_retell',
    sticker: 'item-disc',
    coins: 15,
    artifact: 'golden_record',
    gifts: [{item: 'disc_granny'}],
  },
  {
    id: 'babusia_long_walk',
    name: 'Далека прогулянка',
    from: 'babusia',
    open: 'tale_babusia_long_walk_open',
    steps: [
      { kind: 'visit', at: 'elves', ask: 'tale_babusia_long_walk_1', picture: 'folk-elves' },
      { kind: 'visit', at: 'gnomes', ask: 'tale_babusia_long_walk_2', picture: 'folk-gnomes' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_long_walk_3', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_long_walk_thanks',
    retell: 'tale_babusia_long_walk_retell',
    sticker: 'item-pole',
    coins: 15,
    artifact: 'nordic_poles',
  },
  {
    id: 'babusia_clock',
    name: 'Бабусин годинник',
    from: 'babusia',
    open: 'tale_babusia_clock_open',
    steps: [
      { kind: 'defend', at: 'here', goal: 5, ask: 'tale_babusia_clock_1', picture: 'zombie' },
      { kind: 'visit', at: 'babusia', ask: 'tale_babusia_clock_2', picture: 'map-babusia' },
    ],
    thanks: 'tale_babusia_clock_thanks',
    retell: 'tale_babusia_clock_retell',
    sticker: 'moon',
    coins: 15,
    artifact: 'babusia_watch',
  },
];

export const taleById = (id: string | null): TaleCard | null => TALES.find((t) => t.id === id) ?? null;

/** How a tale reaches the child: the prologue as the heroes wake, Пупся's as a dream, the rest by paper plane. */
export type Entry = 'wake' | 'dream' | 'letter';
export const entryOf = (t: TaleCard): Entry => (t.id === PROLOGUE ? 'wake' : t.from === 'pupsia' ? 'dream' : 'letter');

/**
 * What is said at a tale's end, in order. A tale of the hostess who is away now (the house moved and
 * they swapped while it was under way): the one at home says it is from her first, then her thanks.
 */
export function thanksOf(t: Pick<TaleCard, 'from' | 'host' | 'thanks' | 'after'>, host: Host): LineId[] {
  const tail: LineId[] = [t.thanks, ...(t.after ? [t.after] : [])];
  if (t.from === 'babusia' && (t.host ?? 'yulia') !== host) return [hostLine('babusia_relay', host), ...tail];
  return tail;
}

/** How much a step asks for (things, monsters, seconds); one for the rest. */
export const stepGoal = (s: TaleStep): number => (s.kind === 'gather' || s.kind === 'defend' || s.kind === 'music' ? (s.goal ?? 1) : 1);

/** The tales in the save. */
export interface TalesSave {
  /** The tale under way (null: waiting for the next one). */
  cur: string | null;
  /** Its step, and how far that step has come (things, monsters, seconds). */
  step: number;
  got: number;
  /** Tales done, in order. */
  done: string[];
  /** The next tale comes on this day (save.day) or later. */
  after: number;
}

export const freshTales = (): TalesSave => ({ cur: null, step: 0, got: 0, done: [], after: 0 });

/**
 * The tales still to come, in the order they come: Льоша's first, then the book's order. One
 * waiting for a building the child hasn't got is left out until then.
 */
export function talesLeft(done: readonly string[], has: (b: BuildingId) => boolean, home?: Host): TaleCard[] {
  const open = TALES.filter((t) => !done.includes(t.id) && (!t.follows || done.includes(t.follows)) && (!t.needs || t.needs.some(has)) && (!home || t.from !== 'babusia' || (t.host ?? 'yulia') === home));
  const rest = open.filter((t) => !t.arrives);
  return [...(home ? open.filter((t) => t.arrives) : []), ...rest.filter((t) => t.lyosha), ...rest.filter((t) => !t.lyosha), ...(home ? [] : open.filter((t) => t.arrives))];
}

/**
 * Which tale comes now (null: none yet). Nothing while one is under way or before its day. A
 * dream comes only right after a night's sleep (`slept`); if the next is a dream and a whole day
 * went by without sleep, the next letter comes first (the dream keeps its place).
 */
export function nextTale(s: TalesSave, has: (b: BuildingId) => boolean, day: number, slept: boolean, home: Host = 'yulia'): TaleCard | null {
  if (s.cur || day < s.after) return null;
  const left = talesLeft(s.done, has, home);
  const first = left[0];
  if (!first) return null;
  if (entryOf(first) !== 'dream' || slept) return first;
  return day >= s.after + 1 ? (left.find((t) => entryOf(t) === 'letter') ?? null) : null;
}
