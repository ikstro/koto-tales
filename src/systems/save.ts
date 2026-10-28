import { TERRAIN_VERSION, type HeroId, type ItemId } from '../contracts';

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
  buildBlock: number;
}

export const SAVE_VERSION = 2;
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
    buildBlock: 14,
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
