import type { Race } from '../world/villages';
import type { BuildingId } from './buildings';
import type { LineId } from './lines';
import { TASK_NEEDS, type TaskNow, type VillageTask } from './villages';

/**
 * The four castles (DESIGN.md «Castles»): one per race, far beyond its village. Monsters
 * besiege it; its ruler asks for three tasks (the siege first, then two of the race's own,
 * bigger than the village's); then the castle comes alive, the gate opens and a chest with
 * the race's best prize waits up on the balcony. Where a castle stands is the world's
 * business (world/castles.ts), its model is assets/castles.ts, systems/castles.ts runs it.
 */

export interface CastleCard {
  race: Race;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** What it is, one sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** What its «gather» task collects, in the plural after a number («8 кристалів»). */
  things?: string;
  /** The ruler's model (assets/models.ts PART_BUILDERS). */
  ruler: string;
  /** The three tasks in order (one waiting for a building the child hasn't got moves to the end). */
  tasks: [VillageTask, VillageTask, VillageTask];
  /** HUD sprites: the thing to gather, the map mark, the album sticker. */
  item: string;
  mark: string;
  sticker: string;
  /** «find»: the little one's model and face (HUD sprite). */
  kid?: { model: string; face: string; found: LineId };
  /** In the chest on the balcony. */
  prize: BuildingId;
  /** Also in the chest: the castle's artifact (content/artifacts.ts id). */
  artifact?: string;
  /** Joins the party when the chest is opened (content/companions.ts id). */
  companion?: string;
  /** Пупся the first time the castle comes into sight. */
  seen: LineId;
  /** The village's elder, once friends: the castle is over there. */
  pointer: LineId;
  hello: LineId;
  ask: Partial<Record<VillageTask, LineId>>;
  thanks: LineId;
  /** All three done: the castle is alive, go up. */
  open: LineId;
  prizeLine: LineId;
}

export const CASTLE_CARDS: Record<Race, CastleCard> = {
  elves: {
    race: 'elves',
    name: 'Замок на дереві',
    about: 'Замок ельфів на величезному дереві, зі сходами довкола стовбура.',
    things: 'насінин світлячків',
    ruler: 'elf_queen',
    tasks: ['defend', 'gather', 'disco'],
    item: 'item-castle-elves',
    mark: 'cmap-elves',
    sticker: 'castle-elves',
    prize: 'treehouse',
    seen: 'castle_elves',
    pointer: 'elf_castle',
    hello: 'elfq_hello',
    ask: { defend: 'elfq_defend', gather: 'elfq_gather', disco: 'elfq_disco' },
    thanks: 'elfq_thanks',
    open: 'elfq_open',
    prizeLine: 'elfq_prize',
  },
  gnomes: {
    race: 'gnomes',
    name: 'Фортеця гномів',
    about: 'Кам’яна фортеця гномів на пагорбі, з кузнею.',
    things: 'кристалів',
    ruler: 'gnome_king',
    tasks: ['defend', 'gather', 'power'],
    item: 'item-gnomes',
    mark: 'cmap-gnomes',
    sticker: 'castle-gnomes',
    prize: 'golem',
    seen: 'castle_gnomes',
    pointer: 'gnome_castle',
    hello: 'gnomek_hello',
    ask: { defend: 'gnomek_defend', gather: 'gnomek_gather', power: 'gnomek_power' },
    thanks: 'gnomek_thanks',
    open: 'gnomek_open',
    prizeLine: 'gnomek_prize',
  },
  robots: {
    race: 'robots',
    name: 'Вежа роботів',
    about: 'Вежа роботів з антенами, тарілками та маяком.',
    ruler: 'robot_chief',
    tasks: ['defend', 'power', 'find'],
    item: 'item-robots',
    mark: 'cmap-robots',
    sticker: 'castle-robots',
    kid: { model: 'robot_kid', face: 'kid-robots', found: 'robot_kid_found' },
    prize: 'robohelper',
    seen: 'castle_robots',
    pointer: 'robot_castle',
    hello: 'robotc_hello',
    ask: { defend: 'robotc_defend', power: 'robotc_power', find: 'robotc_find' },
    thanks: 'robotc_thanks',
    open: 'robotc_open',
    prizeLine: 'robotc_prize',
  },
  aliens: {
    race: 'aliens',
    name: 'Літаюча тарілка',
    about: 'Літаюча тарілка інопланетян, що сіла в кратері.',
    ruler: 'alien_captain',
    tasks: ['defend', 'find', 'power'],
    item: 'item-aliens',
    mark: 'cmap-aliens',
    sticker: 'castle-aliens',
    kid: { model: 'alien_kid', face: 'kid-aliens', found: 'alien_kid_found' },
    prize: 'saucer',
    seen: 'castle_aliens',
    pointer: 'alien_castle',
    hello: 'alienc_hello',
    ask: { defend: 'alienc_defend', find: 'alienc_find', power: 'alienc_power' },
    thanks: 'alienc_thanks',
    open: 'alienc_open',
    prizeLine: 'alienc_prize',
  },
};

/** Bigger than a village's: monsters in the siege, things gathered, seconds of music. */
export const CASTLE_GOALS: Record<VillageTask, number> = { find: 1, gather: 8, defend: 8, power: 1, disco: 20 };
/** Sparks a second a castle's machine takes while its «power» task waits. */
export const CASTLE_POWER = 3;
/** …and joins what stands this close: its socket sits inside the castle's kept ground. */
export const CASTLE_REACH = 10;
/** The castle's own ground, castle-local: no kit building stands at |lx| ≤ side, back ≤ lz ≤ front. */
export const CASTLE_KEPT = { side: 12, back: -15, front: 5 };
export const CASTLE_COINS = 15;

/** A castle in the save. */
export interface CastleSave {
  /** The ruler has said hello. */
  met: boolean;
  done: VillageTask[];
  cur: VillageTask | null;
  got: number;
  /** The chest is opened: the prize is the child's, the castle is a friend. */
  freed: boolean;
}

export const freshCastle = (): CastleSave => ({ met: false, done: [], cur: null, got: 0, freed: false });

/** All three tasks done: the castle is alive and its gate open. */
export const castleOpen = (c: CastleSave) => c.done.length >= 3;

/**
 * The task a castle asks for now (null once its gate is open): the one under way stays until
 * done; otherwise the next in order that can be done; if all that is left waits for a
 * building, that one, blocked.
 */
export function castleTask(card: CastleCard, c: CastleSave, has: (id: BuildingId) => boolean): TaskNow | null {
  if (castleOpen(c)) return null;
  const can = (k: VillageTask) => !TASK_NEEDS[k] || TASK_NEEDS[k]!.some(has);
  if (c.cur && !c.done.includes(c.cur) && can(c.cur)) return { kind: c.cur, goal: CASTLE_GOALS[c.cur], daily: false, blocked: false };
  const left = card.tasks.filter((k) => !c.done.includes(k));
  const next = left.find(can);
  if (next) return { kind: next, goal: CASTLE_GOALS[next], daily: false, blocked: false };
  return { kind: left[0], goal: CASTLE_GOALS[left[0]], daily: false, blocked: true };
}
