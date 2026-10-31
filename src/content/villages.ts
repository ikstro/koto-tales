import type { Race } from '../world/villages';
import type { BuildingId } from './buildings';
import type { LineId } from './lines';

/**
 * The four villages (DESIGN.md «Villages»): who lives there, what they ask, what they
 * give. Where a village stands is the world's business (world/villages.ts); what is on
 * its square is LAYOUT below; systems/villages.ts runs it.
 */

export type VillageTask = 'find' | 'gather' | 'defend' | 'power' | 'disco';

export interface RaceCard {
  race: Race;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** Who they are and where they live, one sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** What their «gather» task collects, in the plural after a number («6 жолудів»). */
  things: string;
  /** Villager models (assets/models.ts PART_BUILDERS): the elder, three grown-ups, the little one. */
  folk: { elder: string; adults: [string, string, string]; kid: string };
  /** The three tasks, in order (one waiting for a building the child hasn't got moves to the end). */
  tasks: [VillageTask, VillageTask, VillageTask];
  /** HUD sprites: the thing to gather, the little one's face (the «find» picture), the map mark, the album sticker. */
  item: string;
  kidFace: string;
  mark: string;
  sticker: string;
  /** Given when all three tasks are done. */
  prize: BuildingId;
  /** Пупся the first time the village comes into sight. */
  seen: LineId;
  hello: LineId;
  ask: Partial<Record<VillageTask, LineId>>;
  thanks: LineId;
  prizeLine: LineId;
  /** The elder in the morning after a night in the guest house. */
  gift: LineId;
  /** The little one, found. */
  kidFound?: LineId;
}

export const RACE_CARDS: Record<Race, RaceCard> = {
  elves: {
    race: 'elves',
    name: 'Ельфи',
    about: 'Ельфи живуть у лісі, у селі з деревом-ліхтарем посередині.',
    things: 'жолудів',
    folk: { elder: 'elf_elder', adults: ['elf_1', 'elf_2', 'elf_3'], kid: 'elf_kid' },
    tasks: ['find', 'gather', 'disco'],
    item: 'item-elves',
    kidFace: 'kid-elves',
    mark: 'map-elves',
    sticker: 'folk-elves',
    prize: 'garland',
    seen: 'village_elves',
    hello: 'elf_hello',
    ask: { find: 'elf_find', gather: 'elf_gather', disco: 'elf_disco', defend: 'elf_defend' },
    thanks: 'elf_thanks',
    prizeLine: 'elf_prize',
    gift: 'elf_gift',
    kidFound: 'elf_kid_found',
  },
  gnomes: {
    race: 'gnomes',
    name: 'Гноми',
    about: 'Гноми живуть у горах, у селі з кузнею, що димить.',
    things: 'кристалів',
    folk: { elder: 'gnome_elder', adults: ['gnome_1', 'gnome_2', 'gnome_3'], kid: 'gnome_kid' },
    tasks: ['gather', 'defend', 'power'],
    item: 'item-gnomes',
    kidFace: 'kid-gnomes',
    mark: 'map-gnomes',
    sticker: 'folk-gnomes',
    prize: 'carousel',
    seen: 'village_gnomes',
    hello: 'gnome_hello',
    ask: { gather: 'gnome_gather', defend: 'gnome_defend', power: 'gnome_power' },
    thanks: 'gnome_thanks',
    prizeLine: 'gnome_prize',
    gift: 'gnome_gift',
  },
  robots: {
    race: 'robots',
    name: 'Роботи',
    about: 'Роботи живуть на луках, у селі із зарядною щоглою.',
    things: 'шестерень',
    folk: { elder: 'robot_elder', adults: ['robot_1', 'robot_2', 'robot_3'], kid: 'robot_kid' },
    tasks: ['power', 'gather', 'defend'],
    item: 'item-robots',
    kidFace: 'kid-robots',
    mark: 'map-robots',
    sticker: 'folk-robots',
    prize: 'searchlight',
    seen: 'village_robots',
    hello: 'robot_hello',
    ask: { power: 'robot_power', gather: 'robot_gather', defend: 'robot_defend' },
    thanks: 'robot_thanks',
    prizeLine: 'robot_prize',
    gift: 'robot_gift',
  },
  aliens: {
    race: 'aliens',
    name: 'Інопланетяни',
    about: 'Інопланетяни живуть у піщаному кратері на далеких луках.',
    things: 'уламків зірок',
    folk: { elder: 'alien_elder', adults: ['alien_1', 'alien_2', 'alien_3'], kid: 'alien_kid' },
    tasks: ['find', 'gather', 'power'],
    item: 'item-aliens',
    kidFace: 'kid-aliens',
    mark: 'map-aliens',
    sticker: 'folk-aliens',
    prize: 'trampoline',
    seen: 'village_aliens',
    hello: 'alien_hello',
    ask: { find: 'alien_find', gather: 'alien_gather', power: 'alien_power', defend: 'alien_defend' },
    thanks: 'alien_thanks',
    prizeLine: 'alien_prize',
    gift: 'alien_gift',
    kidFound: 'alien_kid_found',
  },
};

/** How much each task asks for: things gathered, monsters in the wave, seconds of dancing. */
export const VILLAGE_GOALS: Record<VillageTask, number> = { find: 1, gather: 6, defend: 5, power: 1, disco: 10 };
/** Once friends, one small task a day: gather on even days, defend on odd ones. */
export const DAILY_GOALS = { gather: 4, defend: 4 };
export const VILLAGE_COINS = { task: 10, daily: 6, gift: 5 };

/** The bubble's picture for a task (find and gather use the race's own). */
export function taskPicture(card: RaceCard, kind: VillageTask): string {
  switch (kind) {
    case 'find':
      return card.kidFace;
    case 'gather':
      return card.item;
    case 'defend':
      return 'zombie';
    case 'power':
      return 'vt-power';
    case 'disco':
      return 'note';
  }
}

/** What a task needs from the kit: power (any source) or music (any speaker). */
export const TASK_NEEDS: Partial<Record<VillageTask, BuildingId[]>> = {
  power: ['windmill', 'generator', 'solar'],
  disco: ['boombox', 'bigspeaker'],
};

/** A village in the save. */
export interface VillageSave {
  /** The elder has said hello. */
  met: boolean;
  /** The three tasks done so far. */
  done: VillageTask[];
  /** The task under way (null: none picked yet, or friends and today's is done). */
  cur: VillageTask | null;
  /** How far the task under way has got (things, monsters, seconds). */
  got: number;
  /** Nights slept in its guest house. */
  nights: number;
  /** The day (save.day) whose daily task is done; −1: none yet. */
  daily: number;
}

export const freshVillage = (): VillageSave => ({ met: false, done: [], cur: null, got: 0, nights: 0, daily: -1 });

export const isFriend = (v: VillageSave) => v.done.length >= 3;

export interface TaskNow {
  kind: VillageTask;
  goal: number;
  /** A friend's small task of the day. */
  daily: boolean;
  /** It waits for a building the child hasn't got (only when nothing else is left). */
  blocked: boolean;
}

/**
 * The task a village asks for now. The one under way stays until it is done; otherwise the
 * next in the race's order that can be done (one waiting for a building moves to the end);
 * if all that is left waits for a building, that one, blocked. Friends ask one small task a day.
 */
export function villageTask(card: RaceCard, v: VillageSave, has: (id: BuildingId) => boolean, day: number): TaskNow | null {
  const can = (k: VillageTask) => !TASK_NEEDS[k] || TASK_NEEDS[k]!.some(has);
  if (!isFriend(v)) {
    if (v.cur && !v.done.includes(v.cur) && can(v.cur)) return { kind: v.cur, goal: VILLAGE_GOALS[v.cur], daily: false, blocked: false };
    const left = card.tasks.filter((k) => !v.done.includes(k));
    const next = left.find(can);
    if (next) return { kind: next, goal: VILLAGE_GOALS[next], daily: false, blocked: false };
    return { kind: left[0], goal: VILLAGE_GOALS[left[0]], daily: false, blocked: true };
  }
  if (v.daily === day) return null;
  const kind = day % 2 ? 'defend' : 'gather';
  return { kind, goal: DAILY_GOALS[kind], daily: true, blocked: false };
}

// ─── the square ──────────────────────────────────────────────────────────────

export type PieceKind = 'heart' | 'house' | 'guest' | 'arch' | 'lamp' | 'portal';

export interface Piece {
  kind: PieceKind;
  /** Centre in the village's local blocks (from the centre cell's middle; the gate is +z). */
  at: [number, number];
  /** Footprint (x, z) before turning, and quarter turns (the piece's front is its +z). */
  size: [number, number];
  turn: 0 | 1 | 2 | 3;
  /** House variant. */
  variant?: 0 | 1;
  /** Solid cells: (i, j) in the footprint before turning, `h` blocks tall; omitted = the whole footprint `h` tall. */
  solid?: { i: number; j: number; h: number }[];
  h?: number;
}

/** One layout for every race: the heart in the middle, houses at the sides with doors to the plaza, the guest house at the back, the arch at the front. */
export const LAYOUT: Piece[] = [
  { kind: 'heart', at: [0, 0], size: [3, 3], turn: 0, h: 3 },
  { kind: 'house', at: [-9.5, -7.5], size: [4, 4], turn: 1, variant: 0, h: 4 },
  { kind: 'house', at: [9.5, -7.5], size: [4, 4], turn: 3, variant: 1, h: 4 },
  { kind: 'house', at: [-9.5, 5.5], size: [4, 4], turn: 1, variant: 1, h: 4 },
  { kind: 'house', at: [9.5, 5.5], size: [4, 4], turn: 3, variant: 0, h: 4 },
  {
    kind: 'guest',
    at: [0, -10],
    size: [5, 3],
    turn: 0,
    solid: [
      ...[0, 1, 2, 3, 4].map((i) => ({ i, j: 0, h: 3 })),
      { i: 0, j: 2, h: 3 },
      { i: 4, j: 2, h: 3 },
    ],
  },
  { kind: 'arch', at: [0, 12], size: [3, 1], turn: 0, solid: [] },
  // the way home: a portal by the path (walked into on purpose, never by chance); it always faces the camera
  { kind: 'portal', at: [-7, 10], size: [3, 1], turn: 1, solid: [] },
  { kind: 'lamp', at: [-3, 7], size: [1, 1], turn: 0, h: 2 },
  { kind: 'lamp', at: [3, 7], size: [1, 1], turn: 0, h: 2 },
  { kind: 'lamp', at: [-12, -1], size: [1, 1], turn: 0, h: 2 },
  { kind: 'lamp', at: [12, -1], size: [1, 1], turn: 0, h: 2 },
];

/** Where the elder stands (in front of the heart, facing the gate) and where the little one plays. */
export const ELDER_SPOT: [number, number] = [0, 3];
export const KID_SPOT: [number, number] = [2.6, 2.4];
/** Within this many blocks of the centre: the village (safe, fast hearts, the elder hears you). */
export const VILLAGE_SAFE = 30;
