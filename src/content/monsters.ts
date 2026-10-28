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
}

export const MONSTERS = {
  zombie: {
    kind: 'zombie',
    model: { kind: 'parts', id: 'zombie' },
    name: 'Зомбік',
    hp: 3,
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
    hp: 2,
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
  },
  spider: {
    kind: 'spider',
    model: { kind: 'parts', id: 'spider' },
    name: 'Павучок',
    hp: 2,
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

export const MONSTER_ORDER: MonsterKind[] = ['zombie', 'skeleton', 'spider'];

export const SPAWN = {
  capDay: 4,
  capNight: 8,
  every: 2.5,
  minDist: 16,
  maxDist: 26,
  despawnDist: 42,
  /** Monsters never enter this radius around the house — home is safe. */
  houseSafeRadius: 12,
};
