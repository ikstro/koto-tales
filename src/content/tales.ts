import type { Race } from '../world/villages';
import type { BuildingId } from './buildings';
import type { LineId } from './lines';

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
export type TaleItem = 'fish' | 'scroll' | 'yarn' | 'chest';
export const TALE_ITEMS: Record<TaleItem, { icon: string; /** After a number: one, two to four, five and more (the «Зміст гри» page). */ words: [string, string, string] }> = {
  fish: { icon: 'item-fish', words: ['рибку', 'рибки', 'рибок'] },
  scroll: { icon: 'item-scroll', words: ['шматок карти', 'шматки карти', 'шматків карти'] },
  yarn: { icon: 'item-yarn', words: ['клубочок', 'клубочки', 'клубочків'] },
  chest: { icon: 'chest', words: ['скриню', 'скрині', 'скринь'] },
};

/** Where a step happens: home, around the hero when it begins, the nearest dark lighthouse, a village. */
export type TalePlace = 'home' | 'here' | 'lighthouse' | Race;

export type StepKind = 'gather' | 'thief' | 'place' | 'visit' | 'music' | 'defend' | 'sleep' | 'light';

export interface TaleStep {
  kind: StepKind;
  at: TalePlace;
  /** gather: things; defend: monsters; music: seconds. */
  goal?: number;
  /** gather: what lies about; thief: what the monster carries off (it drops it when beaten). */
  item?: TaleItem;
  /** gather: how far from the place things lie (blocks). */
  spread?: [number, number];
  /** place: the building to put up there. */
  building?: BuildingId;
  /** Said when the step begins, when the tale piece is tapped, and as a reminder. */
  ask: LineId;
  /** The tale piece's picture (a HUD sprite). */
  picture: string;
}

/** Who asks: Пупся dreams her tales, the races send letters. */
export type TaleFrom = 'pupsia' | Race;

export interface TaleCard {
  id: string;
  /** Its title in the book, for the parents (the «Зміст гри» page). */
  name: string;
  from: TaleFrom;
  /** Льоша made it up: it comes before the others, and its page in the book has a gold rim. */
  lyosha?: boolean;
  /** Offered only once the child has one of these buildings (until then the others go first). */
  needs?: BuildingId[];
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
];

export const taleById = (id: string | null): TaleCard | null => TALES.find((t) => t.id === id) ?? null;

/** How a tale reaches the child: the prologue as the heroes wake, Пупся's as a dream, the rest by paper plane. */
export type Entry = 'wake' | 'dream' | 'letter';
export const entryOf = (t: TaleCard): Entry => (t.id === PROLOGUE ? 'wake' : t.from === 'pupsia' ? 'dream' : 'letter');

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
export function talesLeft(done: readonly string[], has: (b: BuildingId) => boolean): TaleCard[] {
  const open = TALES.filter((t) => !done.includes(t.id) && (!t.needs || t.needs.some(has)));
  return [...open.filter((t) => t.lyosha), ...open.filter((t) => !t.lyosha)];
}

/**
 * Which tale comes now (null: none yet). Nothing while one is under way or before its day. A
 * dream comes only right after a night's sleep (`slept`); if the next is a dream and a whole day
 * went by without sleep, the next letter comes first (the dream keeps its place).
 */
export function nextTale(s: TalesSave, has: (b: BuildingId) => boolean, day: number, slept: boolean): TaleCard | null {
  if (s.cur || day < s.after) return null;
  const left = talesLeft(s.done, has);
  const first = left[0];
  if (!first) return null;
  if (entryOf(first) !== 'dream' || slept) return first;
  return day >= s.after + 1 ? (left.find((t) => entryOf(t) === 'letter') ?? null) : null;
}
