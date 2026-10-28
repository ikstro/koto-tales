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
  },
  normal: {
    monsterHp: 1,
    monsterSpeed: 1.1,
    night: 1.25,
    capDay: 6,
    capNight: 10,
    spawnEvery: 1.8,
    pack: [2, 3],
    ranged: true,
    sight: 1.6,
    hunt: true,
    helperDamage: 0.5,
    helperFireEvery: [1.8, 2.6],
    boltCooldown: 6,
    regenEvery: 12,
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
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];
