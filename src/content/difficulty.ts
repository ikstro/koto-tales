/**
 * How hard the world pushes back. Chosen in the pause menu, kept in the save.
 * Losing is impossible at every level: out of hearts, the hero naps at home.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyTune {
  /** Multiplies every monster's hp from its card (rounded up). */
  monsterHp: number;
  /** Multiplies wander and chase speed. */
  monsterSpeed: number;
  /** Extra multiplier on hp and speed at night. */
  night: number;
  capDay: number;
  capNight: number;
  /** Seconds between spawn attempts. */
  spawnEvery: number;
  /** Monsters arrive in small packs of this many. */
  pack: [number, number];
  /** Skeletons throw bones from a distance. */
  ranged: boolean;
  /** Multiplies how far monsters notice a hero. */
  sight: number;
  /** Wandering monsters drift towards the player instead of strolling at random. */
  hunt: boolean;
  /** Helpers' arrows and bolts do this share of the hero's damage… */
  helperDamage: number;
  /** …and they shoot only every [min, max] seconds. */
  helperFireEvery: [number, number];
  boltCooldown: number;
  /** Seconds per heart coming back when not at home. */
  regenEvery: number;
  /** Chance that a defeated monster drops a heart (only while the hero is missing hearts). */
  heartDrop: number;
  /** The boss («Пожирач земель»): multiplies its health… */
  bossHp: number;
  /** …and its pace: above 1 it opens its mouth and stomps more often, with shorter openings. */
  bossTempo: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTune> = {
  easy: {
    monsterHp: 0.6,
    monsterSpeed: 1,
    night: 1.1,
    capDay: 4,
    capNight: 7,
    spawnEvery: 2.5,
    pack: [1, 1],
    ranged: false,
    sight: 1,
    hunt: false,
    helperDamage: 1,
    helperFireEvery: [1, 1.6],
    boltCooldown: 3.5,
    regenEvery: 8,
    heartDrop: 0.5,
    bossHp: 0.7,
    bossTempo: 0.8,
  },
  normal: {
    monsterHp: 0.8,
    monsterSpeed: 1.05,
    night: 1.2,
    capDay: 5,
    capNight: 8,
    spawnEvery: 2.2,
    pack: [1, 3],
    ranged: true,
    sight: 1.4,
    hunt: true,
    helperDamage: 0.6,
    helperFireEvery: [1.8, 2.6],
    boltCooldown: 5,
    regenEvery: 10,
    heartDrop: 0.35,
    bossHp: 1,
    bossTempo: 1,
  },
  hard: {
    monsterHp: 1.4,
    monsterSpeed: 1.25,
    night: 1.35,
    capDay: 8,
    capNight: 14,
    spawnEvery: 1.3,
    pack: [2, 4],
    ranged: true,
    sight: 2,
    hunt: true,
    helperDamage: 0.4,
    helperFireEvery: [2.2, 3],
    boltCooldown: 7,
    regenEvery: 15,
    heartDrop: 0.2,
    bossHp: 1.3,
    bossTempo: 1.15,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];
