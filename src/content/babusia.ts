import type { SnackKind } from '../assets/food';
import type { StructureBlock } from '../contracts';
import type { TaleGift } from './tales';
import { B } from '../world/blocks';

/**
 * Бабуся (DESIGN.md «Бабуся»): two hostesses of one house that travels. Юля is the queen of flowers
 * and weather, Оля knows every insect and looks after the animals; they swap when the house moves.
 * Here is what needs no world: her house's plan, her day, when she moves on, what she
 * cooks, and how a site is judged. systems/babusia.ts runs it; models are assets/babusia.ts and
 * assets/parts/babusia.ts.
 *
 * Her house faces the camera (+Z) like the heroes' one: 13×9 blocks, white walls, log corners,
 * a cobble rim, an open doorway in the middle of the front. Only the shell and the floor are
 * blocks; everything else is props, carried along when the house moves.
 */

const SX = 13;
const SZ = 9;
const WALL_TOP = 4;
const DOOR_X = 6;

export const BABUSIA = {
  /** No monster within this of the middle of her house: the yard and a little past it; hearts come back fast. */
  safe: 20,
  /** Пупся sees the house for the first time within this. */
  spot: 30,
  /** She says hello within this, and again after `talkAgain` seconds. */
  talk: 7,
  talkAgain: 40,
  /** Further than this her house is put aside. */
  park: 130,
  /** She lands this far from the party. */
  land: [110, 170] as [number, number],
  /** She moves on every night; within this the party sees the house fly off, further it simply lands somewhere new. */
  moveAway: 50,
  /** The meadows she left behind that are remembered. */
  glades: 12,
  /** The stork comes at most this often (seconds). */
  storkEvery: 120,
  /** Her house stays this far from the heroes' home, about as far as the elves' village: reaching her is a trip. */
  keepHome: 120,
  /** The ground around the yard may differ by this much: a jump gets out of anywhere. */
  rim: 2,
  /** She comes over (cocoa, a joke by the fire) from no further than this. */
  comes: 16,
  /** Further from her house than this the party may meet her out on a walk. */
  strollAway: 60,
  /** She comes into sight this far from the party. */
  strollFrom: 13,
};

/** The flat ground: the house and its yard, relative to the house corner, inclusive. */
export const YARD = { x0: -4, z0: -4, x1: SX + 3, z1: SZ + 8 };

export const BABUSIA_HOUSE = { sizeX: SX, sizeZ: SZ, wallTop: WALL_TOP, interior: { x0: 1, z0: 1, x1: SX - 1, z1: SZ - 1 } };

/** Where things stand, relative to the house corner (x/z of the floor centre). */
export const BABUSIA_SPOTS = {
  kitchen: { dx: 10, dz: 1.35 },
  /** Where she stands to cook. */
  stove: { dx: 10.5, dz: 2.4 },
  table: { dx: 9.5, dz: 4.7 },
  tv: { dx: 7, dz: 1.15 },
  /** Where she stands to watch it. */
  watch: { dx: 7, dz: 3.6 },
  jukebox: { dx: 2, dz: 6.2 },
  cushion: { dx: 4.4, dz: 5.4 },
  door: { dx: DOOR_X + 0.04, dz: SZ - 0.14 },
  /** Just inside and just outside the doorway: the only way in. */
  doorIn: { dx: DOOR_X + 0.5, dz: SZ - 2 },
  doorOut: { dx: DOOR_X + 0.5, dz: SZ + 1 },
  fire: { dx: DOOR_X + 0.5, dz: SZ + 3.5 },
  chair: { dx: 3.2, dz: SZ + 2.6 },
  coffee: { dx: 2, dz: SZ + 2.8 },
  /** Round the fire and facing it, near enough for a stick to reach the flames. */
  bench: { dx: 8.05, dz: SZ + 2.2, yaw: -0.87 },
  bench2: { dx: 8.35, dz: SZ + 4.35, yaw: -2 },
  /** The party steps out here after a jump to her. */
  gate: { dx: DOOR_X + 0.5, dz: SZ + 5 },
  /** The party gets up here in the morning. */
  wake: { dx: DOOR_X + 0.5, dz: 5.4 },
};

/** Beds along the back wall, the cushion by the rug. */
export const BABUSIA_BEDS = {
  lyosha: { dx: 1.6, dy: 1.75, dz: 2, yaw: 0 },
  david: { dx: 3.1, dy: 1.75, dz: 2, yaw: 0 },
  solomiia: { dx: 4.6, dy: 1.75, dz: 2, yaw: 0 },
  pupsia: { dx: BABUSIA_SPOTS.cushion.dx, dy: 1.17, dz: BABUSIA_SPOTS.cushion.dz, yaw: -1.1 },
};

/** Her morning walk: round the house, always outside the walls. */
export const WALK_LOOP: [number, number][] = [
  [1, SZ + 7],
  [SX - 1, SZ + 7],
  [SX + 2, SZ + 1],
  [SX + 2, -2],
  [-2, -2],
  [-2, SZ + 1],
];

/** Where Оля stops with the animals' breakfast. */
export const FEED: [number, number][] = [
  [1, SZ + 4.5],
  [5, SZ + 7],
  [SX - 1, SZ + 6.5],
];

/** Where she potters about in the afternoon. */
export const GARDEN: [number, number][] = [
  [0, SZ + 1.2],
  [3, SZ + 1],
  [9.5, SZ + 1],
  [SX, SZ + 1.2],
];

const WINDOWS: [number, number][] = [
  [2, SZ - 1],
  [3, SZ - 1],
  [9, SZ - 1],
  [10, SZ - 1],
  [2, 0],
  [3, 0],
  [9, 0],
  [0, 4],
  [SX - 1, 3],
];

/** The cell of the one lantern (by the last bed). */
export const LANTERN_CELL = { dx: 5, dy: 1, dz: 1 };

function blocks(): StructureBlock[] {
  const out: StructureBlock[] = [];
  const put = (dx: number, dy: number, dz: number, id: number) => out.push({ dx, dy, dz, id });
  const edgeX = (x: number) => x === 0 || x === SX - 1;
  const edgeZ = (z: number) => z === 0 || z === SZ - 1;
  const glass = new Set(WINDOWS.map(([x, z]) => `${x},${z}`));
  for (let x = 0; x < SX; x++) {
    for (let z = 0; z < SZ; z++) {
      const rim = edgeX(x) || edgeZ(z);
      const rug = x >= 5 && x <= 7 && z >= 3 && z <= 5;
      const tiles = x >= 8 && x <= 11 && z >= 1 && z <= 7;
      put(x, 0, z, rim ? B.COBBLE : rug ? B.RED : tiles ? ((x + z) % 2 ? B.WHITE : B.GREEN) : B.PLANKS);
      for (let y = 1; y < WALL_TOP; y++) {
        if (!rim) {
          const l = LANTERN_CELL;
          put(x, y, z, x === l.dx && y === l.dy && z === l.dz ? B.LANTERN : B.AIR);
          continue;
        }
        const corner = edgeX(x) && edgeZ(z);
        const door = z === SZ - 1 && x === DOOR_X && y <= 2;
        const window = y === 2 && glass.has(`${x},${z}`);
        put(x, y, z, corner ? B.LOG : door ? B.AIR : window ? B.GLASS : B.WHITE);
      }
    }
  }
  return out;
}

export const BABUSIA_BLOCKS: StructureBlock[] = blocks();

/** The flowers that come up round her chair while someone sits in it. */
export const CHAIR_FLOWERS = 12;

/** Where they come up (relative to the house corner): clear of the furniture and of the way from the door to the fire. */
export function chairFlowerSpots(): { dx: number; dz: number; kind: 0 | 1 }[] {
  const S = BABUSIA_SPOTS;
  const clear = (f: { x: number; z: number }, o: { dx: number; dz: number }, r: number) => Math.hypot(f.x - o.dx, f.z - o.dz) > r;
  return flowerSpots(S.chair.dx, S.chair.dz, 80, 1.2, 4.5)
    .filter((f) => f.z > SZ + 0.6 && f.x < DOOR_X - 0.7 && clear(f, S.chair, 1.1) && clear(f, S.coffee, 0.9) && clear(f, S.fire, 1.6))
    .slice(0, CHAIR_FLOWERS)
    .map((f) => ({ dx: f.x, dz: f.z, kind: f.kind }));
}

/** Under the windows of the front wall hang her flower boxes. */
export const FRONT_WINDOWS: { dx: number; dz: number }[] = [
  { dx: 3, dz: SZ },
  { dx: 10, dz: SZ },
];

// ─── her day ─────────────────────────────────────────────────────────────────

export type Act = 'walk' | 'swim' | 'tv' | 'garden' | 'coffee' | 'feed' | 'bugs' | 'notes' | 'cook';

/**
 * What she does at this time of day (`t`, 0 = sunrise). Юля: a walk in the morning in any weather,
 * a swim, a little television, then enough of that and out to the flowers, and coffee in the wicker
 * chair from the evening till dawn. Оля: the animals' breakfast, then bugs under her glass in the
 * garden, and from the evening her notes in the same chair.
 */
export function routineAt(t: number, host: Host = 'yulia'): Act {
  if (host === 'olia') {
    if (t >= 0.93 || t < 0.3) return 'feed';
    return t < 0.6 ? 'bugs' : 'notes';
  }
  if (t >= 0.93 || t < 0.24) return 'walk';
  if (t < 0.4) return 'swim';
  if (t < 0.46) return 'tv';
  if (t < 0.6) return 'garden';
  return 'coffee';
}

/** From the evening the wicker chair is taken. */
export const chairAct = (a: Act | null): boolean => a === 'coffee' || a === 'notes';

// ─── her poles ───────────────────────────────────────────────────────────────

/** Her arm and pole, for how far the pole leans: heights from the ground, lengths, the bent elbow. */
export const POLE = { shoulder: 0.94, upper: 0.16, fore: 0.21, len: 0.84, bend: -1.05 };

/** Some mornings only, and not before the party has found her poles («Прогулянка»). */
export const poleDay = (day: number, done: readonly string[]): boolean => done.includes('babusia_walk') && day % 3 === 0;

/** The pole's own turn at the wrist for an arm and a forearm at these angles: it leans back just enough to keep its tip on the ground. */
export function poleAngle(arm: number, fore: number): number {
  const hand = POLE.shoulder - POLE.upper * Math.cos(arm) - POLE.fore * Math.cos(arm + fore);
  return Math.acos(Math.min(1, hand / POLE.len)) - arm - fore;
}

// ─── a tap on her ────────────────────────────────────────────────────────────

export type TapReply = 'feed' | 'gift' | 'ask' | 'joke';

/** One tap, one thing: the hurt are fed first, then the day's gift, then her tale's ask, otherwise a joke. */
export function tapReply(s: { hurt: boolean; giftDue: boolean; asking: boolean }): TapReply {
  if (s.hurt) return 'feed';
  if (s.giftDue) return 'gift';
  return s.asking ? 'ask' : 'joke';
}

/** A joke other than the last one (`r` in 0..1). */
export function nextJoke(last: number, n: number, r: number): number {
  const i = Math.floor(r * (n - 1));
  return last >= 0 && i >= last ? i + 1 : i;
}

// ─── what she cooks ──────────────────────────────────────────────────────────

/** Something new every day. */
export const DISHES = ['pie', 'cutlet', 'pancake', 'varenyk'] as const satisfies readonly SnackKind[];
export type Dish = (typeof DISHES)[number];

export const dishOfDay = (day: number): Dish => DISHES[((day % DISHES.length) + DISHES.length) % DISHES.length];

// ─── the two hostesses ───────────────────────────────────────────────────────

export type Host = 'yulia' | 'olia';

export const otherHost = (h: Host): Host => (h === 'yulia' ? 'olia' : 'yulia');

/** What differs between them: her model, her mark, the colour of her puff, how many flowers stand round the house. */
export const HOSTS: Record<Host, { part: 'babusia' | 'olia'; mark: string; puff: number; flowers: number }> = {
  yulia: { part: 'babusia', mark: 'map-babusia', puff: 0xffc9d6, flowers: 90 },
  olia: { part: 'olia', mark: 'map-olia', puff: 0xffd98a, flowers: 30 },
};

/** Who lands with the house: they swap on every move, once the first one has said hello. */
export const hostAfterMove = (host: Host, done: readonly string[]): Host => (done.includes('babusia_hi') ? otherHost(host) : host);

/** Lines both have: called by Юля's id, Оля's is the same with `olia_`. */
export const SHARED_LINES = [
  ...[1, 2, 3, 4, 5].map((n) => `babusia_hello_${n}`),
  ...[1, 2, 3].map((n) => `babusia_story_${n}`),
  ...[1, 2, 3, 4].map((n) => `babusia_present_${n}`),
  ...[1, 2, 3, 4].map((n) => `babusia_stroll_${n}`),
  'babusia_stroll_bye',
  'babusia_gift_pie',
  'babusia_gift_coins',
  'babusia_dish_pie',
  'babusia_dish_cutlet',
  'babusia_dish_pancake',
  'babusia_dish_varenyk',
  'babusia_night',
  'babusia_morning',
  'babusia_cocoa',
  'babusia_chair',
  'babusia_pantry',
  'babusia_relay',
  ...['start', 'stir', 'wait', 'done', 'cancel'].map((s) => `babusia_cook_${s}`),
  ...['cherry', 'potato', 'carrot', 'mushroom_brown', 'apple', 'honey', 'egg'].map((s) => `babusia_cook_need_${s}`),
];

/** The same moment in the voice of whoever is at home. */
export const hostLine = <T extends string>(id: T, host: Host): T => (host === 'olia' && SHARED_LINES.includes(id) ? (id.replace('babusia_', 'olia_') as T) : id);

/**
 * The one away sends a greeting by stork, once a trip, after the one at home has said where she went.
 * The day does not matter: the house moves every night.
 */
export const noteDue = (b: Pick<BabusiaSave, 'noted' | 'told'>, _day?: number): boolean => !b.noted && b.told;

// ─── the save ────────────────────────────────────────────────────────────────

/** A house corner and its floor's y. */
export type Site = [number, number, number];

export interface BabusiaSave {
  /** Where the house stands (null: she has not come yet). */
  at: Site | null;
  /** The day she landed here. */
  movedDay: number;
  /** The meadows of daisies and poppies she left behind. */
  glades: [number, number][];
  /** The day of the last small gift. */
  giftDay: number;
  /** The party has met her. */
  met: boolean;
  /**
   * A move under way: a save made in the middle of it finishes it on load. `day`: the day she counts
   * as landed (stamped into `movedDay` when the move completes); `aboard`: the party was asleep in the
   * house when it flew (on load they wake at her gate).
   */
  moving: { from: Site | null; to: Site; host?: Host; day: number; aboard: boolean } | null;
  /** How many flowers have come up round her chair here; they stay until she moves. */
  flowers: number;
  /** How far down `PRESENTS` she has given. */
  presents: number;
  /** She came back from a trip with something: the next meeting gives it. */
  brought: boolean;
  /** The day she last met the party out on a walk, far from home. */
  strollDay: number;
  /** Who is at home. */
  host: Host;
  /** The one away has sent her greeting this trip. */
  noted: boolean;
  /** The one at home has said where the other went. */
  told: boolean;
  /** The day of the last morning product for the kitchen. */
  pantryDay: number;
}

export const freshBabusia = (): BabusiaSave => ({ at: null, movedDay: 0, glades: [], giftDay: -1, met: false, moving: null, flowers: 0, presents: 0, brought: false, strollDay: -1, host: 'yulia', noted: true, told: true, pantryDay: -1 });

/**
 * What she brings from her trips, in order (DESIGN.md «Her gifts»): one after each move, at the next
 * meeting, and one every other day in place of the small gift. Tales give the rest.
 */
export const PRESENTS: TaleGift[] = [
  { building: 'bikegen' },
  { building: 'karaoke' },
  { item: 'babusia_cutlet', n: 3 },
  { building: 'pianopath' },
  { building: 'basscannon' },
  { building: 'waterwheel' },
  { item: 'super_torch', n: 2 },
  { building: 'fireworks' },
  { building: 'extender' },
  { building: 'toastcannon' },
  { building: 'rocketswing' },
  { building: 'everbattery' },
  { item: 'disc_carol' },
  { building: 'bubbler' },
  { building: 'popcorn' },
  { building: 'lightningrod' },
  { item: 'freeze_popper', n: 3 },
  { building: 'bouncycastle' },
  { building: 'efence' },
  { building: 'telescope' },
  { building: 'scooter' },
  { building: 'candyfloss' },
  { building: 'bigfan' },
  { building: 'surprisebox' },
  { item: 'babusia_bell', n: 2 },
  { building: 'monsterwash' },
  { building: 'cinema' },
  { building: 'pieoven' },
  { building: 'waterslide' },
  { building: 'toytrain' },
  { building: 'ferriswheel' },
];

/** Whether today's gift is one of the presents. */
export function presentDue(b: Pick<BabusiaSave, 'presents' | 'brought'>, day: number): boolean {
  return b.presents < PRESENTS.length && (b.brought || day % 2 === 0);
}

/** Whether she may come upon the party on a walk: she has met them, not yet today, every other day. */
export function strollDue(b: Pick<BabusiaSave, 'met' | 'strollDay'>, day: number): boolean {
  return b.met && b.strollDay !== day && day % 2 === 1;
}

/** The middle of her house. */
export function centreOf(at: Site): [number, number] {
  return [at[0] + SX / 2, at[2] + SZ / 2];
}

/** Within her safe ring. */
export function inSafeRing(b: BabusiaSave, x: number, z: number, margin = 0): boolean {
  if (!b.at) return false;
  const [cx, cz] = centreOf(b.at);
  return Math.hypot(x - cx, z - cz) < BABUSIA.safe + margin;
}

/**
 * Whether her house moves on: every night, once she has come and has not moved yet today. Nothing
 * holds her: not the party near, not a tale of hers (its things are laid out again round the new place).
 */
export function shouldMove(b: Pick<BabusiaSave, 'at' | 'movedDay'>, day: number): boolean {
  return !!b.at && day > b.movedDay;
}

/** A meadow more, the oldest forgotten. */
export function addGlade(glades: [number, number][], x: number, z: number): [number, number][] {
  return [...glades, [x, z] as [number, number]].slice(-BABUSIA.glades);
}

// ─── a site ──────────────────────────────────────────────────────────────────

/** What judging a site asks of the land. */
export interface SiteProbe {
  /** Feet y of a column. */
  height(x: number, z: number): number;
  wet(x: number, z: number): boolean;
  tree(x: number, z: number): boolean;
  /** The biome of a column. */
  biome(x: number, z: number): string;
}

/**
 * Whether the yard fits with its corner at (ox, oz): dry, and even enough that a jump gets out of
 * the flattened ground anywhere. Lower scores are better: even, few trees, water close by (she
 * swims), and a different kind of land from `avoidBiome` (where she stood last). Null: it does not fit.
 */
export function judgeSite(p: SiteProbe, ox: number, oz: number, avoidBiome?: string): { y: number; score: number } | null {
  const hs: number[] = [];
  let trees = 0;
  for (let z = YARD.z0; z <= YARD.z1; z += 3) {
    for (let x = YARD.x0; x <= YARD.x1; x += 3) {
      if (p.wet(ox + x, oz + z)) return null;
      hs.push(p.height(ox + x, oz + z));
      if (p.tree(ox + x, oz + z)) trees++;
    }
  }
  hs.sort((a, b) => a - b);
  const y = hs[hs.length >> 1];
  const spread = Math.max(y - hs[0], hs[hs.length - 1] - y);
  if (spread > BABUSIA.rim) return null;
  const midX = ox + SX / 2;
  const midZ = oz + SZ / 2;
  let water = false;
  for (let i = 0; i < 12 && !water; i++) {
    const a = (i / 12) * Math.PI * 2;
    water = p.wet(Math.round(midX + Math.sin(a) * 22), Math.round(midZ + Math.cos(a) * 22));
  }
  const same = avoidBiome !== undefined && p.biome(Math.floor(midX), Math.floor(midZ)) === avoidBiome;
  return { y, score: spread + trees * 0.5 - (water ? 4 : 0) + (same ? 3 : 0) };
}

/** Flowers round a spot: seeded by it, so a meadow looks the same every time it is shown. */
export function flowerSpots(x: number, z: number, n: number, r0: number, r1: number): { x: number; z: number; kind: 0 | 1 }[] {
  let s = (Math.imul(Math.floor(x), 73856093) ^ Math.imul(Math.floor(z), 19349663)) >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: { x: number; z: number; kind: 0 | 1 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = r0 + Math.sqrt(rnd()) * (r1 - r0);
    out.push({ x: x + Math.sin(a) * r, z: z + Math.cos(a) * r, kind: rnd() < 0.62 ? 0 : 1 });
  }
  return out;
}
