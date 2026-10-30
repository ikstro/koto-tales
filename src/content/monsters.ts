import type { Biome, ModelRef } from '../contracts';
import type { LineId } from './lines';

export interface MonsterCard {
  kind: string;
  model: ModelRef;
  name: string;
  hp: number;
  /** Blocks per second while wandering / while chasing a hero. */
  wanderSpeed: number;
  chaseSpeed: number;
  /** Hearts taken from the hero per bump. */
  damage: number;
  /** How far it notices heroes. */
  sight: number;
  radius: number;
  height: number;
  /** When it walks the world, and how often it is picked. */
  when: 'day' | 'night' | 'any';
  weight: number;
  /** Limits where it walks; all biomes when absent. */
  biomes?: Biome[];
  coins: [number, number];
  /** Colour of the cube puff when defeated. */
  color: number;
  spotLine: LineId;
  defeatLine: LineId;
  /** Throws from a distance (on difficulties that allow it): keeps `keep` blocks away, throws every `every` s. */
  ranged?: { range: number; keep: number; every: number; speed: number };
}

export const MONSTERS = {
  zombie: {
    kind: 'zombie',
    model: { kind: 'parts', id: 'zombie' },
    name: 'Зомбік',
    hp: 5,
    wanderSpeed: 1,
    chaseSpeed: 2.3,
    damage: 1,
    sight: 9,
    radius: 0.35,
    height: 1.7,
    when: 'any',
    weight: 3,
    coins: [1, 3],
    color: 0x7cb342,
    spotLine: 'monster_zombie_spot',
    defeatLine: 'defeat_zombie',
  },
  skeleton: {
    kind: 'skeleton',
    model: { kind: 'parts', id: 'skeleton' },
    name: 'Кістлявчик',
    hp: 4,
    wanderSpeed: 1.2,
    chaseSpeed: 2.7,
    damage: 1,
    sight: 10,
    radius: 0.35,
    height: 1.7,
    when: 'any',
    weight: 2,
    coins: [1, 2],
    color: 0xeeeeee,
    spotLine: 'monster_skeleton_spot',
    defeatLine: 'defeat_skeleton',
    ranged: { range: 9, keep: 4.5, every: 2.4, speed: 9 },
  },
  spider: {
    kind: 'spider',
    model: { kind: 'parts', id: 'spider' },
    name: 'Павучок',
    hp: 3,
    wanderSpeed: 1.6,
    chaseSpeed: 3.5,
    damage: 1,
    sight: 8,
    radius: 0.5,
    height: 0.6,
    when: 'any',
    weight: 2,
    coins: [1, 2],
    color: 0x5c6bc0,
    spotLine: 'monster_spider_spot',
    defeatLine: 'defeat_spider',
  },
} satisfies Record<string, MonsterCard>;

export type MonsterKind = keyof typeof MONSTERS;

/** The album's (and spawning's) order is the cards' order: a new monster is one card. */
export const MONSTER_ORDER = Object.keys(MONSTERS) as MonsterKind[];

/** Where monsters appear; how many and how often is set by the difficulty (content/difficulty.ts). */
export const SPAWN = {
  minDist: 16,
  maxDist: 26,
  despawnDist: 42,
  /** Monsters never enter this radius around the house — home is safe. */
  houseSafeRadius: 12,
};
