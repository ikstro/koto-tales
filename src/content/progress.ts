import type { BuildingId } from './buildings';
import type { LineId } from './lines';

/**
 * The endless goal (DESIGN.md «Kit»): the kit box asks for one task at a time; when
 * it is done a reward comes out of the box. Tasks go round in a circle and every
 * circle asks for a little more (up to a cap a six-year-old still enjoys).
 */

export type TaskKind = 'monsters' | 'coins' | 'places' | 'nights' | 'boss';

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
};

/** One circle of tasks; the boss every sixth. */
export const TASK_CYCLE: TaskKind[] = ['monsters', 'coins', 'places', 'monsters', 'nights', 'boss'];

/** The task that leads to level `level + 1` (`level` = rewards already given). */
export function taskFor(level: number): { kind: TaskKind; goal: number } {
  const kind = TASK_CYCLE[level % TASK_CYCLE.length];
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
  /** One more of a building in the kit. */
  building?: BuildingId;
  /** Coins poured out of the box. */
  coins?: number;
}

/** Rewards in order; new stages add cards here (a save gets them on its next level-ups). */
export const REWARDS: Reward[] = [{ id: 'portal', line: 'reward_portal', ability: 'portal' }];

/** Past the list: one more of a building in turn, while fewer than `cap` are owned; then coins. */
export const ENDLESS: { building: BuildingId; cap: number; line: LineId }[] = [
  { building: 'boombox', cap: 5, line: 'reward_boombox' },
  { building: 'tent', cap: 3, line: 'reward_tent' },
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
    if (owned(e.building) < e.cap) return { id: `+${e.building}`, line: e.line, building: e.building };
  }
  return { id: '+coins', line: 'reward_coins', coins: ENDLESS_COINS };
}
