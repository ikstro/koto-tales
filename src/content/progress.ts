import type { BuildingId } from './buildings';
import type { LineId } from './lines';

/**
 * The endless goal (DESIGN.md «Kit»): the kit box asks for one task at a time; when
 * it is done a reward comes out of the box. Tasks go round in a circle and every
 * circle asks for a little more (up to a cap a six-year-old still enjoys).
 */

export type TaskKind = 'monsters' | 'coins' | 'places' | 'nights' | 'boss' | 'lighthouse' | 'dance';

export interface TaskCard {
  /** Goal on the first circle, added each circle, and never more than `cap`. */
  base: number;
  step: number;
  cap: number;
  /** What the voice says when the task piece is tapped (no numbers: the studs show how far). */
  line: LineId;
  /** HUD sprite of the task's picture. */
  icon: string;
}

export const TASKS: Record<TaskKind, TaskCard> = {
  monsters: { base: 5, step: 5, cap: 30, line: 'task_monsters', icon: 'zombie' },
  coins: { base: 15, step: 10, cap: 60, line: 'task_coins', icon: 'coin' },
  // map chunks: one step into the unknown uncovers about three
  places: { base: 8, step: 4, cap: 30, line: 'task_places', icon: 'cloud' },
  nights: { base: 1, step: 1, cap: 3, line: 'task_nights', icon: 'moon' },
  boss: { base: 1, step: 0, cap: 1, line: 'task_boss', icon: 'boss-face' },
  // one more lighthouse lit by the water (its arrow shows on the map)
  lighthouse: { base: 1, step: 0, cap: 1, line: 'task_lighthouse', icon: 'task-lighthouse' },
  // seconds of dancing (near music or on the dance floor)
  dance: { base: 20, step: 10, cap: 60, line: 'task_dance', icon: 'task-dance' },
};

/** One circle of tasks; the boss every sixth. */
export const TASK_CYCLE: TaskKind[] = ['monsters', 'coins', 'places', 'monsters', 'nights', 'boss'];
/** Once the box has given the windmill, the second «monsters» of a circle becomes «light a lighthouse». */
const LIGHTHOUSE_SLOT = 3;
/** Once it has given the dance floor, every other circle «coins» becomes «dance». */
const DANCE_SLOT = 1;

/** The task that leads to level `level + 1` (`level` = rewards already given, `got` = their ids). */
export function taskFor(level: number, got: readonly string[] = []): { kind: TaskKind; goal: number } {
  const slot = level % TASK_CYCLE.length;
  const odd = Math.floor(level / TASK_CYCLE.length) % 2 === 1;
  const kind =
    slot === LIGHTHOUSE_SLOT && got.includes('windmill')
      ? 'lighthouse'
      : slot === DANCE_SLOT && odd && got.includes('dancefloor')
        ? 'dance'
        : TASK_CYCLE[slot];
  const circle = Math.floor(level / TASK_CYCLE.length);
  const t = TASKS[kind];
  return { kind, goal: Math.min(t.cap, t.base + t.step * circle) };
}

export interface Reward {
  /** Stored in the save's `got` list. */
  id: string;
  line: LineId;
  /** An ability the game switches on. */
  ability?: 'portal';
  /** Buildings put into the kit: which and how many. */
  items?: [BuildingId, number][];
  /** Coins poured out of the box. */
  coins?: number;
}

/** Rewards in order; new stages add cards here (a save gets them on its next level-ups). */
export const REWARDS: Reward[] = [
  { id: 'portal', line: 'reward_portal', ability: 'portal' },
  // stage B1: power
  { id: 'windmill', line: 'reward_windmill', items: [['windmill', 1], ['pole', 4]] },
  { id: 'lamps', line: 'reward_lamp', items: [['lamp', 3]] },
  { id: 'solar', line: 'reward_solar', items: [['solar', 1]] },
  { id: 'battery', line: 'reward_battery', items: [['battery', 1]] },
  { id: 'generator', line: 'reward_generator', items: [['generator', 1]] },
  // stage B2: disco and defence
  { id: 'bigspeaker', line: 'reward_bigspeaker', items: [['bigspeaker', 1]] },
  { id: 'dancefloor', line: 'reward_dancefloor', items: [['dancefloor', 1]] },
  { id: 'trafficlight', line: 'reward_trafficlight', items: [['trafficlight', 1]] },
  { id: 'discoball', line: 'reward_discoball', items: [['discoball', 1]] },
  { id: 'tesla', line: 'reward_tesla', items: [['tesla', 1]] },
  { id: 'djconsole', line: 'reward_djconsole', items: [['djconsole', 1]] },
];

/** Past the list: more of a building in turn (`n` at a time), while fewer than `cap` are owned; then coins. */
export const ENDLESS: { building: BuildingId; n: number; cap: number; line: LineId }[] = [
  { building: 'pole', n: 2, cap: 20, line: 'reward_poles' },
  { building: 'boombox', n: 1, cap: 5, line: 'reward_boombox' },
  { building: 'lamp', n: 1, cap: 10, line: 'reward_lamp_more' },
  { building: 'windmill', n: 1, cap: 3, line: 'reward_windmill_more' },
  { building: 'tent', n: 1, cap: 3, line: 'reward_tent' },
  { building: 'solar', n: 1, cap: 4, line: 'reward_solar_more' },
  { building: 'bigspeaker', n: 1, cap: 3, line: 'reward_bigspeaker_more' },
  { building: 'tesla', n: 1, cap: 3, line: 'reward_tesla_more' },
  { building: 'trafficlight', n: 1, cap: 3, line: 'reward_trafficlight_more' },
];
export const ENDLESS_COINS = 25;

/**
 * What the box gives next: the first listed reward not yet got; past the list,
 * the next endless building still under its cap (`owned` = in the kit + standing).
 */
export function nextReward(got: readonly string[], owned: (b: BuildingId) => number): Reward {
  for (const r of REWARDS) if (!got.includes(r.id)) return r;
  const given = got.filter((g) => g.startsWith('+')).length;
  for (let i = 0; i < ENDLESS.length; i++) {
    const e = ENDLESS[(given + i) % ENDLESS.length];
    if (owned(e.building) < e.cap) return { id: `+${e.building}`, line: e.line, items: [[e.building, e.n]] };
  }
  return { id: '+coins', line: 'reward_coins', coins: ENDLESS_COINS };
}
