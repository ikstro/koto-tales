import { TERRAIN_VERSION, type HeroId, type ItemId, type MonsterKind } from '../contracts';
import { BUILDINGS, KIT_ORDER, type BuildingId } from '../content/buildings';
import type { Difficulty } from '../content/difficulty';
import type { TaskKind } from '../content/progress';
import { homeChunks } from './explore';

/**
 * Everything a tablet remembers between sessions. Each device keeps its own
 * save, so Льоша and Соломія each have their own world progress.
 *
 * A save is never thrown away: old versions go through MIGRATIONS, and the
 * last save that loaded fine is kept as a spare copy.
 */
export interface SaveData {
  v: number;
  /** Terrain generator version the edits were made against. */
  terrainV: number;
  seed: number;
  hero: HeroId;
  coins: number;
  inv: Partial<Record<ItemId, number>>;
  /** Album stickers: item ids, and `m:<kind>` for monsters. */
  found: string[];
  /** Pickups already collected, keyed by place: `x,z:item`. */
  picked: string[];
  edits: Record<string, number>;
  /** Time of day, 0..1. */
  time: number;
  /** House min corner, set once the house is built. */
  house: [number, number, number] | null;
  /** One-off lines already spoken (tutorial tips, milestones). */
  said: string[];
  /** Chosen in the pause menu. */
  difficulty: Difficulty;
  /** Monsters defeated, per kind (the HUD counter shows the total). */
  defeated: Partial<Record<MonsterKind, number>>;
  soundOn: boolean;
  /** Map chunks the child has seen, as "cx,cz" (16×16 blocks each); the rest of the map is under clouds. */
  explored: string[];
  /** In-game days lived (+1 every morning while playing). */
  day: number;
  /** «Пожирач земель»: where it lives, how hurt it is, when it was beaten. */
  boss: BossSave;
  /** Buildings left in the kit box (the lantern never runs out and is not counted). */
  kit: Partial<Record<BuildingId, number>>;
  /** Buildings standing in the world. */
  placed: PlacedBuilding[];
  /** The kit box's endless goal. */
  progress: ProgressSave;
  /** The field end of the home portal (where it stands, the way it faces); null until the first jump home. */
  portal: { x: number; y: number; z: number; yaw: number } | null;
  /** Totals that only grow; tasks count from them. */
  stats: { coins: number; slept: number };
}

/** A building put up from the kit: footprint min corner, the height its floor stands on, quarter turns. */
export interface PlacedBuilding {
  id: BuildingId;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export interface ProgressSave {
  /** Rewards already given = levels done. */
  level: number;
  /** The task being worked on and the counter's value when it began (null: take it on the next frame). */
  kind: TaskKind;
  start: number | null;
  /** Reward ids given, in order (content/progress.ts). */
  got: string[];
}

export interface BossSave {
  /** 1 at first; +1 each time it comes back (bigger and tougher). */
  level: number;
  /** Centre of its lair; null until it is first placed. */
  site: [number, number] | null;
  /** Health left; null = full. */
  hp: number | null;
  /** Lantern blocks ("x,y,z") that cracked its armour. */
  lanterns: string[];
  /** `day` it was beaten; null while it lives. It comes back 3 days later. */
  defeatedDay: number | null;
  /** The lair whose ground is eaten (stone and pits), until it grows back. */
  eatenAt?: [number, number] | null;
  /** Ground bites taken on this visit (capped per level). */
  bites?: number;
}

export const freshBoss = (): BossSave => ({ level: 1, site: null, hp: null, lanterns: [], defeatedDay: null, eatenAt: null, bites: 0 });

export const freshKit = (): SaveData['kit'] => Object.fromEntries(KIT_ORDER.flatMap((id) => (BUILDINGS[id].count === null ? [] : [[id, BUILDINGS[id].count]])));
export const freshProgress = (): ProgressSave => ({ level: 0, kind: 'monsters', start: null, got: [] });

export const SAVE_VERSION = 6;
export const WORLD_SEED = 20261128;
const KEY = 'koto-tales-save';
const SPARE = 'koto-tales-save-spare';
const LEGACY_KEY = 'koto-tales-save-v1';

export function freshSave(): SaveData {
  return {
    v: SAVE_VERSION,
    terrainV: TERRAIN_VERSION,
    seed: WORLD_SEED,
    hero: 'lyosha',
    coins: 0,
    inv: {},
    found: [],
    picked: [],
    edits: {},
    time: 0.03,
    house: null,
    said: [],
    difficulty: 'normal',
    defeated: {},
    soundOn: true,
    explored: [],
    day: 0,
    boss: freshBoss(),
    kit: freshKit(),
    placed: [],
    progress: freshProgress(),
    portal: null,
    stats: { coins: 0, slept: 0 },
  };
}

type Raw = Record<string, unknown>;

/** MIGRATIONS[n] turns a version-n save into version n+1. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  1: (d) => ({
    ...d,
    v: 2,
    terrainV: 1,
    // v1 keyed pickups by chunk + index, which breaks as soon as item weights change.
    picked: [],
    said: [...((d.said as string[]) ?? []), ...((d.coinMilestones as number[]) ?? []).map((n) => `coins_${n}`)],
  }),
  // v3: difficulty, defeated-monster counts and the sound switch. Monsters
  // already in the album count as one each, so the counter never starts below
  // what the child has seen.
  2: (d) => {
    const defeated: Record<string, number> = {};
    for (const f of (d.found as string[]) ?? []) if (f.startsWith('m:')) defeated[f.slice(2)] = 1;
    return { ...d, v: 3, difficulty: 'normal', defeated, soundOn: true };
  },
  // v4: the map. The 5×5 chunks around the house are known from the start.
  3: (d) => ({ ...d, v: 4, explored: homeChunks((d.house as [number, number, number] | null) ?? null) }),
  // v5: the day counter and the first boss, waiting at level 1 (its lair is placed on the next start).
  4: (d) => ({ ...d, v: 5, day: 0, boss: freshBoss() }),
  // v6: the kit of buildings replaces the bricks and the pickaxe (bricks already built stay in
  // the world). The first task counts from where the save is now; coins so far are the total.
  5: (d) => {
    const rest = { ...d };
    delete rest.buildBlock;
    return { ...rest, v: 6, kit: freshKit(), placed: [], progress: freshProgress(), portal: null, stats: { coins: (d.coins as number) ?? 0, slept: 0 } };
  },
};

export function migrate(raw: Raw): SaveData {
  let d = raw;
  let v = typeof d.v === 'number' ? d.v : 1;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no migration from save v${v}`);
    d = step(d);
    v = d.v as number;
  }
  return { ...freshSave(), ...d } as SaveData;
}

/**
 * When the terrain generator changed, natural ground moved under old edits.
 * Kept: everything built by the child and the house; dropped: holes dug into
 * the old ground, which would now float in the air.
 */
export function reconcileTerrain(d: SaveData, isBuilt: (id: number) => boolean): SaveData {
  if (d.terrainV === TERRAIN_VERSION) return d;
  const edits: Record<string, number> = {};
  for (const [k, id] of Object.entries(d.edits)) if (id !== 0 && isBuilt(id)) edits[k] = id;
  return { ...d, edits, terrainV: TERRAIN_VERSION };
}

function read(key: string): SaveData | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return migrate(JSON.parse(raw) as Raw);
}

export function loadSave(): SaveData {
  try {
    const main = read(KEY) ?? read(LEGACY_KEY);
    if (main) {
      localStorage.setItem(SPARE, JSON.stringify(main));
      return main;
    }
  } catch (e) {
    console.warn('[save] main save unreadable, trying the spare', e);
    try {
      const spare = read(SPARE);
      if (spare) return spare;
    } catch {
      // fall through to a fresh game
    }
  }
  return freshSave();
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the game keeps running, progress just isn't kept.
  }
}

/** Asks the browser not to evict our storage when the tablet runs low on space. */
export function persistStorage(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}
