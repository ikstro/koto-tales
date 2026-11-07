import * as THREE from 'three';
import type { CharacterModel, HeroId } from '../contracts';
import { createBabusiaRoof, createBench, createCoffeeTable, createFlowerBox, createFlowerField, createHouseShell, createHouseSwirl, createStork, createTv, createWickerChair, type HouseSwirl } from '../assets/babusia';
import { cloudsAt, dawnAt, FLIGHT, liftAt, phaseAt, seenAt, squashAt, swayAt, swirlAt, lagAt, zoomAt, type FlightPhase } from '../content/flight';
import { placeOnGround } from '../actors/physics';
import { createKitchen, createTable, TABLE_H, type Kitchen } from '../assets/home';
import { pantryGift } from './cooking';
import type { BuildingModel } from '../assets/buildings';
import { createJukebox } from '../assets/jukebox';
import { createBed, createCampfire, createCushion, createDoor, type Bed } from '../assets/props';
import type { PlaneModel } from '../assets/tales';
import {
  addGlade,
  BABUSIA,
  BABUSIA_BEDS,
  BABUSIA_BLOCKS,
  BABUSIA_HOUSE,
  BABUSIA_SPOTS,
  centreOf,
  chairAct,
  dishOfDay,
  FEED,
  flowerSpots,
  FRONT_WINDOWS,
  GARDEN,
  hostAfterMove,
  hostLine,
  HOSTS,
  inSafeRing,
  judgeSite,
  LANTERN_CELL,
  nextJoke,
  noteDue,
  otherHost,
  POLE,
  poleAngle,
  poleDay,
  presentDue,
  PRESENTS,
  routineAt,
  shouldMove,
  strollDue,
  tapReply,
  WALK_LOOP,
  YARD,
  type Act,
  type Dish,
  type Host,
  type Site,
  type SiteProbe,
} from '../content/babusia';
import { BUILDINGS } from '../content/buildings';
import { HERO_ORDER, HERO_STATS } from '../content/heroes';
import { ITEMS, type ItemId } from '../content/items';
import type { LineId } from '../content/lines';
import { PROLOGUE, taleById, type TaleGift } from '../content/tales';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { setMapMarker } from '../ui/map';
import { tappedAt } from '../ui/worldTap';
import { music } from '../voice/music';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { B } from '../world/blocks';
import { chairRock, leaveSeats, plantChairFlowers, seatsState, sittingInChair, updateSeats, type Hostess, type YardSeats } from './babusiaSeats';
import { pushCarried } from './effects';
import { chunkKey, chunkOf, exploredOf, squareAround } from './explore';
import { addFoodPlace, eating, eatingAt, sitDown, type FoodPlace } from './food';
import { addToKit, landingSpot, releaseCells, reserveCells, selectedBuilding, setHouseSpeaker, type HouseSpeaker } from './kit';
import { placeYard, showYard, updateYard } from './babusiaYard';
import { sayAsk } from './tales';
import { faceTo, giveCoins, musicNear, walkTo } from './tasks';
import { travelTo } from './travel';
import { registerTv } from './tvNews';
import { nextWeather, veilFog } from './weather';

/**
 * Бабуся (DESIGN.md «Бабуся», the rules in content/babusia.ts): two hostesses of a house that
 * travels, Юля and Оля, who swap when it moves. The first lands once the prologue is done; from then on, on a morning when the party is far
 * and no tale of hers is under way, the house is carried off and a meadow of daisies and poppies
 * stays behind. Around her no monster comes, hearts come back fast, the party may sleep in her
 * beds, and she always has something to eat, new every day. All the moving is done a step at a
 * time (a job, a few milliseconds a frame): nothing she does may stall a frame.
 *
 * Her furniture is one group, built once and moved with her; the walls and floor are world edits,
 * given back when she leaves.
 */

const WALK_SPEED = 2.1;
const SWIM_SPEED = 1.2;
/** The job's share of a frame (ms). */
const BUDGET = 2.5;
/** Edits given back between two looks at the clock. */
const REVERT_STEP = 200;
const CLEAR_HEIGHT = 12;
const MEAL_FAST = 20;
/** A tap on her counts within this of the hero. */
const TAP_NEAR = 9;
/** Her feet this far below the water when she swims. */
const SWIM_DEPTH = 1.05;
const DISH_LINE: Record<Dish, LineId> = { pie: 'babusia_dish_pie', cutlet: 'babusia_dish_cutlet', pancake: 'babusia_dish_pancake', varenyk: 'babusia_dish_varenyk' };
const HELLO: LineId[] = ['babusia_hello_1', 'babusia_hello_2', 'babusia_hello_3', 'babusia_hello_4', 'babusia_hello_5'];
const JOKES: LineId[] = [
  'babusia_joke_1',
  'babusia_joke_2',
  'babusia_joke_3',
  'babusia_joke_4',
  'babusia_joke_5',
  'babusia_joke_6',
  'babusia_joke_7',
  'babusia_joke_8',
  'babusia_joke_9',
  'babusia_joke_10',
];
const STORIES: LineId[] = ['babusia_story_1', 'babusia_story_2', 'babusia_story_3'];
const OLIA_JOKES: LineId[] = ['olia_joke_1', 'olia_joke_2', 'olia_joke_3', 'olia_joke_4', 'olia_joke_5', 'olia_joke_6'];
const FACTS: LineId[] = ['olia_fact_1', 'olia_fact_2', 'olia_fact_3', 'olia_fact_4', 'olia_fact_5', 'olia_fact_6', 'olia_fact_7', 'olia_fact_8', 'olia_fact_9', 'olia_fact_10', 'olia_fact_11', 'olia_fact_12'];
/** A tap on Оля is a true thing about insects two times in three. */
const FACT_CHANCE = 2 / 3;
/** Now and then she calls them bunnies and puts it right. */
const SLIP_CHANCE = 0.15;
const SLIPS: Record<Host, LineId[]> = { yulia: ['babusia_slip_1', 'babusia_slip_2'], olia: ['olia_slip_1', 'olia_slip_2', 'olia_slip_3'] };
const OTHER: Record<Host, LineId[]> = { yulia: ['babusia_other_1', 'babusia_other_2', 'babusia_other_3'], olia: ['olia_other_1', 'olia_other_2', 'olia_other_3'] };
const NOTES: Record<Host, LineId[]> = { yulia: ['babusia_note_1', 'babusia_note_2', 'babusia_note_3'], olia: ['olia_note_1', 'olia_note_2', 'olia_note_3'] };
const CAME: Record<Host, LineId> = { yulia: 'host_yulia_came', olia: 'host_olia_came' };
/** Her word at the door when the house leaves before the party's eyes. */
const OFF: Record<Host, LineId[]> = { yulia: ['babusia_off_1', 'babusia_off_2'], olia: ['olia_off_1', 'olia_off_2'] };
/** After landing the hostess is found at the stove this long (seconds of play). */
const AT_STOVE = 40;
/** The site for the next landing keeps this far from the party. */
const LAND_OFF_PARTY = 40;
const WEATHER_LINE: LineId[] = ['babusia_weather_sun', 'babusia_weather_rain', 'babusia_weather_snow', 'babusia_weather_rainbow'];
/** Юля hears a wish for the weather from this near. */
const ASK_NEAR = 5;
/** Her forearm and arm while she looks through the glass, her head bent to it. */
const GLASS_FORE = -1.5;
const GLASS_ARM = -0.5;
const GLASS_HEAD = 0.4;
/** Her forearms while she writes in her notebook. */
const WRITE_FORE = -1.25;
const FIRE_CAT: LineId[] = ['babusia_fire_pupsia_1', 'babusia_fire_pupsia_2', 'babusia_fire_pupsia_3'];
/** Her wicker chair is turned a little towards the fire. */
const CHAIR_YAW = 0.55;
/** With poles she leans into the step and goes a little faster. */
const POLE_LEAN = 0.1;
const POLE_PACE = 1.2;
/** Her forearm while she carries a cup. */
const CARRY_BEND = -1.2;
/** She looks at the hero for a moment after handing the cup over. */
const HAND_OVER = 1.2;
/** A tale's ask is said once on a tap; a tap sooner than this gets a joke. */
const ASK_AGAIN = 15;
const BLANKET: Partial<Record<HeroId, string>> = { lyosha: '#6fb2d6', solomiia: '#ee6a82', david: '#3fa142' };

type XZ = [number, number];

/** Her swim: the way there from the door (world), and the two ends she swims between. */
interface Swim {
  way: XZ[];
  a: XZ;
  b: XZ;
  surface: number;
}

/** Her furniture, one group at the house corner; the shell is the house itself as a toy, for the flight. */
interface Home {
  root: THREE.Group;
  shell: { root: THREE.Group; mats: THREE.Material[] };
  /** Petals or fireflies round the house in flight. */
  swirl: HouseSwirl;
  roofMats: THREE.Material[];
  roof: THREE.Group;
  roofFade: number;
  tv: ReturnType<typeof createTv>;
  jukebox: BuildingModel;
  fire: ReturnType<typeof createCampfire>;
  kitchen: Kitchen;
  chair: THREE.Object3D;
  beds: Bed[];
  table: FoodPlace;
  yard: FoodPlace;
  seats: YardSeats;
}

interface Her {
  model: CharacterModel;
  pos: THREE.Vector3;
  yaw: number;
  act: Act | null;
  /** Points still to walk (world). */
  path: XZ[];
  /** The next point of the walk or the garden. */
  next: number;
  wait: number;
  pose: 'idle' | 'sit' | 'dance';
  /** She is out on the way to the water. */
  outSwimming: boolean;
  /** This walk she has her poles. */
  poles: boolean;
  /** She is on her way with a cup; called when she gets there. */
  errand: (() => void) | null;
  /** Seconds she stays looking at the hero. */
  pause: number;
  /** Runs while she is about: her butterfly's wings. */
  flap: number;
  /** Her head is bent to the glass. */
  bent: boolean;
  gear: Record<'body' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'poleL' | 'poleR' | 'cup' | 'glass' | 'pendant' | 'notebook' | 'pencil' | 'wingL' | 'wingR', THREE.Object3D>;
}

interface Stork {
  pos: THREE.Vector3;
  landed: boolean;
  t: number;
  /** A greeting from the one away, with a pie for the bag. */
  note: boolean;
}

let job: Generator<void> | null = null;
let home: Home | null = null;
let her: Her | null = null;
/** Both, built the first time each comes; only the one at home is shown. */
const hers: Partial<Record<Host, Her>> = {};
let swim: Swim | null = null;
let flowers: THREE.Group | null = null;
const glades = new Map<string, THREE.Group>();
let storkModel: PlaneModel | null = null;
let stork: Stork | null = null;
let storkAt = 0;
let checkT = 0;
let talkT = 0;
let giftT = -1;
let fireworkT = 3;
let nightSaid = -1;
let askedAt = -ASK_AGAIN;
const lastTold = { joke: -1, story: -1, cat: -1, fact: -1 };
let noteCheck = 0;
let host: Hostess;
/** The party is asleep in her beds: the roof stays off, so the child sees them lie down. */
let asleepHere = false;
const centre = new THREE.Vector3();
const tapAt = new THREE.Vector3();
const tmp = new THREE.Vector3();
const fwd = new THREE.Vector3();

// ─── where she is ────────────────────────────────────────────────────────────

/** Feet-level middle of her house (null: she has not come yet). */
export function babusiaCentre(ctx: Ctx): THREE.Vector3 | null {
  const at = ctx.save.babusia.at;
  if (!at) return null;
  const [x, z] = centreOf(at);
  return new THREE.Vector3(x, at[1] + 1, z);
}

/** She stands somewhere and nothing is moving her. */
export const babusiaReady = (ctx: Ctx) => !!ctx.save.babusia.at && !ctx.save.babusia.moving;

const world = (at: Site, dx: number, dz: number): XZ => [at[0] + dx, at[2] + dz];

const puff = (ctx: Ctx) => HOSTS[ctx.save.babusia.host].puff;

/** The same moment in the voice of whoever is at home. */
const line = (ctx: Ctx, id: LineId): LineId => hostLine(id, ctx.save.babusia.host);

/** The party is cooking: she leaves what she was doing and comes to the stove. */
let atStove = false;
/** Just landed: the new hostess is at the stove until this moment of play. */
let stoveUntil = -1;

const dayOf = (ctx: Ctx): Act => (atStove || ctx.clock.elapsed < stoveUntil ? 'cook' : routineAt(ctx.clock.t, ctx.save.babusia.host));

export function setHerCooking(on: boolean): void {
  atStove = on;
}

/** Her table, as a place to eat. */
export const herTable = (): FoodPlace => home!.table;

export function insideHouse(ctx: Ctx, p: THREE.Vector3): boolean {
  const at = ctx.save.babusia.at;
  if (!at) return false;
  const i = BABUSIA_HOUSE.interior;
  return p.x >= at[0] + i.x0 && p.x < at[0] + i.x1 && p.z >= at[2] + i.z0 && p.z < at[2] + i.z1 && p.y >= at[1] && p.y < at[1] + 5;
}

/** The hostess at home has a tale under way: a tap on her repeats its ask, and no small gift meanwhile. */
function held(ctx: Ctx): boolean {
  const t = taleById(ctx.save.tales.cur);
  return !!t && t.from === 'babusia' && (t.host ?? 'yulia') === ctx.save.babusia.host;
}

/** Her beds, from evening till dawn (systems/sleep.ts asks): in the house or by her fire. */
export function babusiaBeds(ctx: Ctx): Beds | null {
  const at = ctx.save.babusia.at;
  if (!home || !at) return null;
  const p = ctx.player.pos;
  const [fx, fz] = world(at, BABUSIA_SPOTS.fire.dx, BABUSIA_SPOTS.fire.dz);
  if (!insideHouse(ctx, p) && Math.hypot(p.x - fx, p.z - fz) > 4.5) return null;
  return herBeds(ctx);
}

type Beds = { centre: THREE.Vector3; spots: Record<string, { pos: THREE.Vector3; yaw: number }>; wake: THREE.Vector3 };

/** Her beds wherever the house stands now (after a flight: where it landed). */
export function herBeds(ctx: Ctx): Beds {
  const at = ctx.save.babusia.at!;
  const spots = Object.fromEntries(
    HERO_ORDER.map((id) => {
      const s = BABUSIA_BEDS[id];
      return [id, { pos: new THREE.Vector3(at[0] + s.dx, at[1] + s.dy, at[2] + s.dz), yaw: s.yaw }];
    }),
  );
  const [wx, wz] = world(at, BABUSIA_SPOTS.wake.dx, BABUSIA_SPOTS.wake.dz);
  return { centre: new THREE.Vector3(at[0] + 6.5, at[1] + 1, at[2] + 4.5), spots, wake: new THREE.Vector3(wx, at[1] + 1, wz) };
}

// ─── gifts ───────────────────────────────────────────────────────────────────

export function giveItem(ctx: Ctx, id: ItemId, n: number): void {
  ctx.save.inv[id] = (ctx.save.inv[id] ?? 0) + n;
  if (!ctx.save.found.includes(id)) ctx.save.found.push(id);
  pushCarried(ctx);
}

/** What a tale gives at its end. */
export function giveGifts(ctx: Ctx, gifts: TaleGift[]): void {
  for (const g of gifts) {
    if ('building' in g) addToKit(ctx, g.building);
    else giveItem(ctx, g.item, g.n ?? 1);
  }
}

const PRESENT_LINES: LineId[] = ['babusia_present_1', 'babusia_present_2', 'babusia_present_3', 'babusia_present_4'];

/** Something from her trips: she hands it over, then what it is gets said. */
function givePresent(ctx: Ctx, now: boolean): void {
  const b = ctx.save.babusia;
  const g = PRESENTS[b.presents];
  b.brought = false;
  giveGifts(ctx, [g]);
  ctx.effects.ring(ctx.player.pos, 0xee6a82, 2.2);
  sfx.play('sticker', { pitch: 1.1 });
  voice.say(line(ctx, PRESENT_LINES[b.presents % PRESENT_LINES.length]), { priority: 6, interrupt: now });
  b.presents++;
  const what = 'building' in g ? BUILDINGS[g.building].rewardLine : ITEMS[g.item].line;
  if (what) setTimeout(() => voice.say(what, { priority: 6 }), 3200);
}

/** The small gift of the day: from her trips when one is due, a pie while the party has few, otherwise coins. `now`: a tap asked for it. */
function smallGift(ctx: Ctx, now = false): void {
  const b = ctx.save.babusia;
  b.giftDay = ctx.save.day;
  if (presentDue(b, ctx.save.day)) givePresent(ctx, now);
  else if ((ctx.save.inv.babusia_pie ?? 0) < 3) {
    giveItem(ctx, 'babusia_pie', 1);
    ctx.effects.ring(ctx.player.pos, 0xeab02b, 1.6);
    sfx.play('sticker', { pitch: 1.2 });
    voice.say(line(ctx, 'babusia_gift_pie'), { priority: 6, interrupt: now });
  } else {
    giveCoins(ctx, 5, her?.pos ?? ctx.player.pos);
    voice.say(line(ctx, 'babusia_gift_coins'), { priority: 6, interrupt: now });
  }
}

// ─── finding a site ──────────────────────────────────────────────────────────

/** The ground under trees: tops of crowns do not count. */
function ground(ctx: Ctx, x: number, z: number): number {
  const w = ctx.world;
  let g = w.groundHeight(x, z);
  for (let k = 0; k < 24; k++) {
    const t = w.getBlock(x, g - 1, z);
    if (t !== B.LEAVES && t !== B.LOG) break;
    g = w.groundHeight(x, z, g - 2);
  }
  return g;
}

const wetAt = (ctx: Ctx, x: number, z: number) => {
  const g = ctx.world.groundHeight(x, z);
  return ctx.world.isWater(x, g, z) || ctx.world.isWater(x, g - 1, z);
};

const treeAt = (ctx: Ctx, x: number, z: number) => {
  const g = ctx.world.groundHeight(x, z);
  const t = ctx.world.getBlock(x, g - 1, z);
  return t === B.LEAVES || t === B.LOG;
};

const probe = (ctx: Ctx): SiteProbe => ({ height: (x, z) => ground(ctx, x, z), wet: (x, z) => wetAt(ctx, x, z), tree: (x, z) => treeAt(ctx, x, z), biome: (x, z) => ctx.world.biomeAt(x, z) });

/** Her house keeps this far from the chess kingdom's centre (its square and slope, and the yard). */
const CHESS_KEEP = 52;

/** Whether a house's (or a meadow's) middle at (x, z) is on the chess kingdom's ground. */
function chessNear(ctx: Ctx, x: number, z: number): boolean {
  const k = ctx.world.chess?.();
  return !!k && Math.hypot(k.x - x, k.z - z) < CHESS_KEEP;
}

const onChess = (ctx: Ctx, at: Site) => chessNear(ctx, ...centreOf(at));

/**
 * An old save's house on what is now the chess kingdom's ground moves on before anything is shown:
 * quietly, the same hostess, no meadow left behind, no present for it. A move saved half-way there lands elsewhere.
 */
function* moveOffChess(ctx: Ctx): Generator<void> {
  const b = ctx.save.babusia;
  const site = yield* siteSearch(ctx, ctx.player.pos.clone());
  if (!site) return yield* b.moving ? carryOut(ctx) : settle(ctx);
  if (b.moving) {
    b.moving.to = site;
    return yield* carryOut(ctx);
  }
  const { glades, brought } = b;
  b.moving = { from: b.at, to: site, host: b.host, day: b.movedDay, aboard: false };
  yield* carryOut(ctx);
  b.glades = glades;
  b.brought = brought;
}

/** Nothing else has this ground: the heroes' home, villages, castles, the chess kingdom, lighthouses, bridges, the lair, the child's buildings. */
function freeGround(ctx: Ctx, ox: number, oz: number): boolean {
  const { world: w, save } = ctx;
  const x = ox + BABUSIA_HOUSE.sizeX / 2;
  const z = oz + BABUSIA_HOUSE.sizeZ / 2;
  const off = (s: { x: number; z: number }, r: number) => Math.hypot(s.x - x, s.z - z) >= r;
  // flowers do not grow on snow
  for (const [dx, dz] of [[0, 0], [-12, -12], [12, -12], [-12, 12], [12, 12]]) if (w.biomeAt(x + dx, z + dz) === 'snow') return false;
  const h = ctx.house?.centre;
  if (h && !off(h, BABUSIA.keepHome)) return false;
  if ((w.villages?.() ?? []).some((v) => !off(v, 46))) return false;
  if ((w.castles?.() ?? []).some((c) => !off(c, 52))) return false;
  const chess = w.chess?.();
  if (chess && !off(chess, CHESS_KEEP)) return false;
  if ((w.lighthousesNear?.(x, z, 28) ?? []).some((l) => !off(l, 28))) return false;
  if ((w.bridgesNear?.(x, z, 18) ?? []).length) return false;
  if (ctx.boss?.inZone(x, z, 28)) return false;
  if (save.placed.some((b) => !off(b, 26))) return false;
  return !save.portal || off(save.portal, 16);
}

/**
 * One candidate a step: the best of what is around `origin` (the house as it stands; the party
 * for her first landing), at her distance, never on the party, another kind of land preferred.
 */
function* findSite(ctx: Ctx, origin: THREE.Vector3, party: THREE.Vector3, avoidBiome?: string): Generator<void, Site | null> {
  const [r0, r1] = BABUSIA.land;
  const a0 = Math.random() * Math.PI * 2;
  const land = probe(ctx);
  let best: { site: Site; score: number } | null = null;
  for (let i = 0; i < 64; i++) {
    yield;
    // past 40 tries a wider ring: a world of lakes still has a place for her
    const far = i >= 40 ? 50 : 0;
    const a = a0 + i * 2.39996;
    const r = r0 + (((i * 37) % 41) / 40) * (r1 - r0) + far;
    const ox = Math.floor(origin.x + Math.sin(a) * r - BABUSIA_HOUSE.sizeX / 2);
    const oz = Math.floor(origin.z + Math.cos(a) * r - BABUSIA_HOUSE.sizeZ / 2);
    if (Math.hypot(ox + BABUSIA_HOUSE.sizeX / 2 - party.x, oz + BABUSIA_HOUSE.sizeZ / 2 - party.z) < LAND_OFF_PARTY) continue;
    if (!freeGround(ctx, ox, oz)) continue;
    const j = judgeSite(land, ox, oz, avoidBiome);
    if (j && (!best || j.score < best.score)) best = { site: [ox, j.y - 1, oz], score: j.score };
    if (best && i >= 14) break;
  }
  return best?.site ?? null;
}

/** Where the next landing is looked for from, and what land to prefer leaving. */
function siteSearch(ctx: Ctx, party: THREE.Vector3): Generator<void, Site | null> {
  const here = babusiaCentre(ctx);
  return findSite(ctx, here ?? party, party, here ? ctx.world.biomeAt(Math.floor(here.x), Math.floor(here.z)) : undefined);
}

// ─── moving ──────────────────────────────────────────────────────────────────

function yardCells(at: Site): XZ[] {
  const out: XZ[] = [];
  for (let x = at[0] + YARD.x0; x <= at[0] + YARD.x1; x++) for (let z = at[2] + YARD.z0; z <= at[2] + YARD.z1; z++) out.push([x, z]);
  return out;
}

/** The map redraws the yard's chunks. */
function groundChanged(at: Site): void {
  const seen = new Set<string>();
  for (const [x, z] of yardCells(at)) {
    const k = chunkKey(chunkOf(x), chunkOf(z));
    if (seen.has(k)) continue;
    seen.add(k);
    events.emit('ground:changed', { x, z });
  }
}

/** Gives the ground back as it was, a little at a time, chunk by chunk. */
function* clearYard(ctx: Ctx, at: Site): Generator<void> {
  const x0 = at[0] + YARD.x0;
  const x1 = at[0] + YARD.x1;
  const z0 = at[2] + YARD.z0;
  const z1 = at[2] + YARD.z1;
  const list: [number, number, number][] = [];
  for (const k of Object.keys(ctx.world.exportEdits())) {
    const [x, y, z] = k.split(',').map(Number);
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) list.push([x, y, z]);
  }
  list.sort((a, b) => chunkOf(a[0]) - chunkOf(b[0]) || chunkOf(a[2]) - chunkOf(b[2]));
  const l = LANTERN_CELL;
  events.emit('block:broken', { x: at[0] + l.dx, y: at[1] + l.dy, z: at[2] + l.dz, id: B.LANTERN });
  for (let i = 0; i < list.length; i++) {
    ctx.world.revertBlock?.(list[i][0], list[i][1], list[i][2]);
    if (i % REVERT_STEP === REVERT_STEP - 1) yield;
  }
  releaseCells(yardCells(at));
  groundChanged(at);
}

/** Levels the yard a row at a time and writes the shell; `walls` holds the walls back (a flying house sets them down itself). */
function* putUp(ctx: Ctx, at: Site, walls?: () => boolean): Generator<void> {
  const feet = at[1] + 1;
  for (let z = at[2] + YARD.z0; z <= at[2] + YARD.z1; z++) {
    ctx.world.flattenArea(at[0] + YARD.x0, z, at[0] + YARD.x1, z, feet, CLEAR_HEIGHT);
    yield;
  }
  while (walls && !walls()) yield;
  ctx.world.placeStructure(at[0], at[1], at[2], BABUSIA_BLOCKS);
  const l = LANTERN_CELL;
  events.emit('block:placed', { x: at[0] + l.dx, y: at[1] + l.dy, z: at[2] + l.dz, id: B.LANTERN });
  groundChanged(at);
}

/**
 * The move saved in `moving`, from wherever it was left: everything in it can be done twice.
 * `ready` holds the landing back (a flight puts the house up only once the world has moved under it),
 * `walls` its walls (the flying house touches down first, then they stand in it).
 */
function* carryOut(ctx: Ctx, ready?: () => boolean, walls?: () => boolean): Generator<void> {
  const b = ctx.save.babusia;
  const { from, to, host: arriving = b.host, day = ctx.save.day } = b.moving!;
  const was = b.host;
  if (from) {
    // in a flight the house itself is in the air: only the ground goes back
    if (!flight) {
      if (home) home.root.visible = false;
      if (her) her.model.root.visible = false;
      showYard(false);
    }
    yield* clearYard(ctx, from);
    const [x, z] = centreOf(from);
    // the meadow is Юля's: only she leaves one
    if (b.host === 'yulia' && !b.glades.some((g) => g[0] === x && g[1] === z)) b.glades = addGlade(b.glades, x, z);
    b.flowers = 0;
  }
  while (ready && !ready()) yield;
  yield* putUp(ctx, to, walls);
  b.at = to;
  if (arriving !== b.host) {
    b.host = arriving;
    b.noted = false;
    b.told = false;
  }
  // back from a trip with something: the next meeting gives it
  b.brought = true;
  b.movedDay = day;
  b.moving = null;
  yield* settle(ctx);
  if (from) events.emit('babusia:moved', { from: centreOf(from), to: centreOf(to), host: b.host });
  return was;
}

/** Her coming, or a move the party does not see: the news with a little wind of petals. */
function* moveJob(ctx: Ctx, party: THREE.Vector3): Generator<void> {
  const site = yield* siteSearch(ctx, party);
  if (!site) return;
  const b = ctx.save.babusia;
  const moved = !!b.at;
  b.moving = { from: b.at, to: site, host: moved ? hostAfterMove(b.host, ctx.save.tales.done) : b.host, day: ctx.save.day, aboard: false };
  const was = yield* carryOut(ctx);
  if (!moved) return;
  ctx.effects.poof(tmp.copy(ctx.player.pos).setY(ctx.player.pos.y + 1.4), puff(ctx), 22);
  sfx.play('sticker', { pitch: 1.4 });
  voice.say(b.host === was ? 'babusia_moved' : CAME[b.host], { priority: 6 });
}

/** A way from a corner of the house to the water: straight, over open ground, no steep steps. */
function findSwim(ctx: Ctx, at: Site): Swim | null {
  const { sizeX: SX, sizeZ: SZ } = BABUSIA_HOUSE;
  const w = (dx: number, dz: number) => world(at, dx, dz);
  const FR: XZ = [SX + 2, SZ + 1];
  const FL: XZ = [-2, SZ + 1];
  const BR: XZ = [SX + 2, -2];
  const BL: XZ = [-2, -2];
  const starts: { from: XZ; via: XZ[] }[] = [
    { from: [BABUSIA_SPOTS.doorOut.dx, BABUSIA_SPOTS.doorOut.dz], via: [] },
    { from: FR, via: [FR] },
    { from: FL, via: [FL] },
    { from: BR, via: [FR, BR] },
    { from: BL, via: [FL, BL] },
  ];
  let best: { swim: Swim; len: number } | null = null;
  for (const s of starts) {
    const [sx, sz] = w(...s.from);
    const outX = s.from[0] - SX / 2;
    const outZ = s.from[1] - SZ / 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      if (dx * outX + dz * outZ <= 0) continue;
      let last = at[1] + 1;
      for (let r = 1; r <= 26; r++) {
        const x = Math.floor(sx + dx * r);
        const z = Math.floor(sz + dz * r);
        if (treeAt(ctx, x, z)) break;
        if (wetAt(ctx, x, z)) {
          const end = (k: number): XZ => [sx + dx * (r + k), sz + dz * (r + k)];
          const inWater = (k: number) => wetAt(ctx, Math.floor(end(k)[0]), Math.floor(end(k)[1]));
          if (!inWater(2)) break;
          const len = s.via.length * 8 + r;
          if (best && best.len <= len) break;
          let y = ctx.world.groundHeight(x, z);
          while (ctx.world.isWater(x, y, z)) y++;
          best = { len, swim: { way: [...s.via.map((p) => w(...p)), end(-1), end(2)], a: end(2), b: inWater(6) ? end(6) : end(3), surface: y } };
          break;
        }
        const g = ctx.world.groundHeight(x, z);
        if (Math.abs(g - last) > 1) break;
        last = g;
      }
    }
  }
  return best?.swim ?? null;
}

/** Everything that follows her: the furniture, her flowers, the mark, the ground kept, the map opened. */
function* settle(ctx: Ctx): Generator<void> {
  const at = ctx.save.babusia.at!;
  if (!home) yield* build(ctx);
  const h = home!;
  // in the air the flight holds the house; it is set down when it lands
  if (!flight) {
    h.root.position.set(at[0], at[1], at[2]);
    h.root.visible = true;
  }
  h.root.updateMatrixWorld(true);
  const [cx, cz] = centreOf(at);
  centre.set(cx, at[1] + 1, cz);
  const spot = (o: { dx: number; dz: number }, out: THREE.Vector3, y = 1) => out.set(at[0] + o.dx, at[1] + y, at[2] + o.dz);
  spot(BABUSIA_SPOTS.table, h.table.centre);
  h.table.tap!.at.copy(h.table.centre).setY(h.table.centre.y + TABLE_H);
  spot(BABUSIA_SPOTS.bench, h.yard.centre);
  plantChairFlowers(ctx, h.seats);
  reserveCells(yardCells(at));
  yield;
  swim = findSwim(ctx, at);
  yield;
  if (flowers) ctx.scene.remove(flowers);
  const who = ctx.save.babusia.host;
  flowers = plant(ctx, cx, cz, HOSTS[who].flowers, 8, 24, at);
  exploredOf(ctx.save).add(squareAround(chunkOf(cx), chunkOf(cz), 1));
  setMapMarker('babusia', { pos: centre, icon: HOSTS[who].mark, pointer: true, onTap: () => jump(ctx) });
  her = hers[who] ??= makeHer(ctx, who);
  for (const h of Object.values(hers)) h.model.root.visible = h === her;
  // the swim she was on stayed behind with the old house
  her.outSwimming = false;
  her.errand = null;
  her.act = null;
  beginAct(ctx, dayOf(ctx), true);
  placeYard(ctx, at);
  showYard(who === 'olia');
}

/** A tap on her mark: the party is carried to her gate, portal or no portal. */
function jump(ctx: Ctx): void {
  const at = ctx.save.babusia.at;
  if (!at) return;
  const p = ctx.player.pos;
  if (Math.hypot(p.x - centre.x, p.z - centre.z) < 22) return;
  const [x, z] = world(at, BABUSIA_SPOTS.gate.dx, BABUSIA_SPOTS.gate.dz);
  void travelTo(ctx, new THREE.Vector3(x, at[1] + 1, z), 0);
}

// ─── flowers ─────────────────────────────────────────────────────────────────

/** Daisies and poppies on the grass around (x, z); `house` keeps them off its floor and doorway. */
function plant(ctx: Ctx, x: number, z: number, n: number, r0: number, r1: number, house?: Site): THREE.Group {
  const spots: { x: number; y: number; z: number; kind: 0 | 1 }[] = [];
  for (const f of flowerSpots(x, z, n, r0, r1)) {
    const fx = Math.floor(f.x);
    const fz = Math.floor(f.z);
    const g = ctx.world.groundHeight(fx, fz);
    if (ctx.world.getBlock(fx, g - 1, fz) !== B.GRASS) continue;
    if (house) {
      const dx = f.x - house[0];
      const dz = f.z - house[2];
      if (dx > -1 && dx < BABUSIA_HOUSE.sizeX + 1 && dz > -1 && dz < BABUSIA_HOUSE.sizeZ + 0.5) continue;
      // the path from the door to the fire stays clear
      if (Math.abs(dx - BABUSIA_SPOTS.fire.dx) < 1.8 && dz > 0 && dz < BABUSIA_SPOTS.fire.dz + 1.5) continue;
    }
    spots.push({ x: f.x - x, y: g, z: f.z - z, kind: f.kind });
  }
  const field = createFlowerField(ctx.skin, spots);
  field.position.set(x, 0, z);
  ctx.scene.add(field);
  return field;
}

/** The meadows she left: grown when the party comes near, one at a time, and greeted once. */
function updateGlades(ctx: Ctx): void {
  const p = ctx.player.pos;
  let grown = false;
  for (const [x, z] of ctx.save.babusia.glades) {
    const key = `${x},${z}`;
    const d = Math.hypot(p.x - x, p.z - z);
    let g = glades.get(key);
    if (!g && d < 100 && !grown) {
      g = plant(ctx, x, z, 110, 0, 13);
      glades.set(key, g);
      grown = true;
    }
    if (g) g.visible = d < 120;
    const said = `glade:${key}`;
    if (d < 11 && !ctx.save.said.includes(said) && voice.quietSeconds() > 2) {
      ctx.save.said.push(said);
      voice.say('babusia_glade', { priority: 5 });
    }
  }
}

// ─── her house's furniture ───────────────────────────────────────────────────

function* build(ctx: Ctx): Generator<void> {
  const { skin } = ctx;
  const S = BABUSIA_SPOTS;
  const root = new THREE.Group();
  root.name = 'babusia-home';
  const add = (o: THREE.Object3D, dx: number, dz: number, yaw = 0) => {
    o.position.set(dx, 1, dz);
    o.rotation.y = yaw;
    root.add(o);
    return o;
  };
  const roof = createBabusiaRoof(skin, BABUSIA_HOUSE.sizeX, BABUSIA_HOUSE.sizeZ, BABUSIA_HOUSE.wallTop, S.kitchen.dx + 0.5);
  const roofMats: THREE.Material[] = [];
  roof.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) roofMats.push(m.material as THREE.Material);
  });
  root.add(roof);
  yield;
  // the house as a toy, hidden inside its own walls until the night it flies (its panes glow through the glass)
  const shell = createHouseShell(skin);
  root.add(shell.root);
  const swirlFx = createHouseSwirl();
  root.add(swirlFx.root);
  yield;
  const kitchen = createKitchen(skin);
  add(kitchen.root, S.kitchen.dx, S.kitchen.dz);
  const table = createTable(skin);
  add(table.root, S.table.dx, S.table.dz);
  yield;
  const beds: Bed[] = [];
  for (const id of HERO_ORDER) {
    const s = BABUSIA_BEDS[id];
    const colour = BLANKET[id];
    if (!colour) {
      add(createCushion(skin), s.dx, s.dz);
      continue;
    }
    const bed = createBed(skin, colour, s.dy - 1);
    add(bed.root, s.dx, s.dz, s.yaw);
    beds.push(bed);
    yield;
  }
  const tv = createTv(skin);
  add(tv.root, S.tv.dx, S.tv.dz);
  // the monster news on a tap (systems/tvNews.ts); the hostess at home comments now and then
  registerTv(tv, { host: () => ctx.save.babusia.host, reachable: () => insideHouse(ctx, ctx.player.pos) });
  const jukebox = createJukebox(skin);
  add(jukebox.root, S.jukebox.dx, S.jukebox.dz, 0.6);
  yield;
  const door = createDoor(skin);
  add(door.root, S.door.dx, S.door.dz);
  door.setOpen(1);
  for (const w of FRONT_WINDOWS) {
    const box = createFlowerBox(skin);
    box.position.set(w.dx, 1.7, w.dz + 0.22);
    root.add(box);
  }
  yield;
  // her fire has no light of its own: a light that comes and goes would rebuild every material
  const fire = createCampfire(skin);
  const lights: THREE.Object3D[] = [];
  fire.root.traverse((o) => {
    if ((o as THREE.Light).isLight) lights.push(o);
  });
  for (const l of lights) l.removeFromParent();
  add(fire.root, S.fire.dx, S.fire.dz);
  const chair = createWickerChair(skin);
  add(chair.root, S.chair.dx, S.chair.dz, CHAIR_YAW);
  const patch = new THREE.Group();
  patch.name = 'chair-flowers';
  root.add(patch);
  add(createCoffeeTable(skin), S.coffee.dx, S.coffee.dz);
  const bench = createBench(skin);
  add(bench.root, S.bench.dx, S.bench.dz, S.bench.yaw);
  const bench2 = createBench(skin);
  add(bench2.root, S.bench2.dx, S.bench2.dz, S.bench2.yaw);
  yield;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.casts = true;
  });
  root.userData.casts = true;
  ctx.scene.add(root);

  const dish = () => dishOfDay(ctx.save.day);
  const say = () => voice.say(line(ctx, DISH_LINE[dish()]), { priority: 7, interrupt: true });
  const place = (seats: THREE.Object3D[], open: FoodPlace['open']): FoodPlace => ({
    centre: new THREE.Vector3(),
    seats,
    fast: MEAL_FAST,
    hungryOnly: true,
    snack: dish(),
    piece: 'food',
    open,
    setEat: () => undefined,
    gone: () => false,
    onSit: say,
  });
  const tablePlace = { ...place(table.seats, (p) => insideHouse(ctx, p)), tap: { at: new THREE.Vector3(), reach: 1.1 } };
  const yardPlace = place([...bench.seats, ...bench2.seats], (p) => !insideHouse(ctx, p) && p.distanceTo(centre) < BABUSIA.safe);
  addFoodPlace(tablePlace);
  addFoodPlace(yardPlace);
  // the benches by the fire: not a place the apple piece shows for, the hero just sits down
  const toast: FoodPlace = {
    centre: new THREE.Vector3(),
    seats: yardPlace.seats,
    fast: MEAL_FAST,
    snack: 'marshmallowStick',
    toast: 'marshmallow',
    seconds: 5,
    hearts: 1,
    piece: 'food',
    open: () => true,
    setEat: () => undefined,
    gone: () => false,
    onSit: () => voice.say('babusia_marshmallow', { priority: 7, interrupt: true }),
    onDone: () => fireTalk(ctx),
  };
  const seats: YardSeats = { rocker: chair.root, yaw: CHAIR_YAW, seat: chair.seat, patch, toast };
  home = { root, shell, swirl: swirlFx, roof, roofMats, roofFade: 1, tv, jukebox, fire, kitchen, chair: chair.seat, beds, table: tablePlace, yard: yardPlace, seats };
}

/** Her jukebox: a tap turns it on and off; the note steps through the songs, as at the DJ console. */
const JUKEBOX: Omit<HouseSpeaker, 'centre'> = { hear: 20, dance: 10, loud: 0.8, song: 'dj' };
let jukeboxOn = false;
const jukeboxAt = new THREE.Vector3();
const JUKEBOX_NOTE = 2.8;

/** Standing at her working jukebox: the note piece shows. */
export function nearHerJukebox(ctx: Ctx): boolean {
  return jukeboxOn && Math.hypot(ctx.player.pos.x - jukeboxAt.x, ctx.player.pos.z - jukeboxAt.z) < JUKEBOX_NOTE;
}

function jukebox(ctx: Ctx, h: Home, dt: number): void {
  const at = ctx.save.babusia.at!;
  const [x, z] = world(at, BABUSIA_SPOTS.jukebox.dx, BABUSIA_SPOTS.jukebox.dz);
  jukeboxAt.set(x, at[1] + 1, z);
  if (ctx.input.taps.length && !eating() && !selectedBuilding() && !ctx.map.isOpen && tappedAt(ctx, tmp.copy(jukeboxAt).setY(jukeboxAt.y + 1), 1.2)) {
    jukeboxOn = !jukeboxOn;
    sfx.play('switch', { pitch: jukeboxOn ? 1.3 : 0.9 });
  }
  setHouseSpeaker(jukeboxOn ? { ...JUKEBOX, centre: jukeboxAt } : null);
  h.jukebox.update(dt, { beat: music.beat(), playing: jukeboxOn, night: 1 - ctx.clock.daylight, song: ctx.save.song });
}

function updateHome(ctx: Ctx, h: Home, dt: number): void {
  jukebox(ctx, h, dt);
  h.fire.update(dt);
  h.tv.update(dt);
  const night = 1 - ctx.clock.daylight;
  h.kitchen.update(dt, eatingAt(h.table), night);
  // for the flight the roof comes back on: the house leaves whole
  const target = !flight && (asleepHere || insideHouse(ctx, ctx.player.pos)) ? 0 : 1;
  h.roofFade += (target - h.roofFade) * (1 - Math.exp(-dt * 8));
  h.roof.visible = h.roofFade > 0.02;
  for (const m of h.roofMats) {
    m.opacity = h.roofFade;
    m.depthWrite = h.roofFade > 0.98;
  }
}

// ─── her day ─────────────────────────────────────────────────────────────────

function makeHer(ctx: Ctx, who: Host): Her {
  const model = ctx.models.character({ kind: 'parts', id: HOSTS[who].part });
  model.root.userData.casts = true;
  ctx.scene.add(model.root);
  // what one has and the other has not stands in as an empty joint
  const part = (n: string) => model.root.getObjectByName(n) ?? new THREE.Object3D();
  return {
    model,
    pos: new THREE.Vector3(),
    yaw: 0,
    act: null,
    path: [],
    next: 0,
    wait: 0,
    pose: 'idle',
    outSwimming: false,
    poles: false,
    errand: null,
    pause: 0,
    flap: 0,
    bent: false,
    gear: {
      body: part('body'),
      head: part('head'),
      armL: part('armL'),
      armR: part('armR'),
      foreL: part('foreL'),
      foreR: part('foreR'),
      poleL: part('poleL'),
      poleR: part('poleR'),
      cup: part('cup'),
      glass: part('glass'),
      pendant: part('pendant'),
      notebook: part('notebook'),
      pencil: part('pencil'),
      wingL: part('wingL'),
      wingR: part('wingR'),
    },
  };
}

function setPose(h: Her, pose: Her['pose']): void {
  if (h.pose === pose) return;
  h.pose = pose;
  h.model.play(pose);
}

/** What is in her hands. Comes after the animation, which sets these joints anew every frame. */
function holdGear(h: Her, dt: number): void {
  const g = h.gear;
  h.flap += dt;
  const wing = 0.25 + Math.abs(Math.sin(h.flap * 7)) * 0.8;
  g.wingL.rotation.z = wing;
  g.wingR.rotation.z = -wing;
  // Оля: bugs under the glass at each stop, her notes in the chair
  const looking = h.act === 'bugs' && h.pose === 'idle' && !h.path.length && !h.errand && h.pause <= 0;
  g.glass.visible = looking;
  g.pendant.visible = !looking;
  if (looking) {
    g.armR.rotation.x = GLASS_ARM;
    g.foreR.rotation.x = GLASS_FORE;
    g.head.rotation.x = GLASS_HEAD;
    g.glass.rotation.x = -(GLASS_ARM + GLASS_FORE);
    h.bent = true;
  } else if (h.bent) {
    g.head.rotation.x = 0;
    h.bent = false;
  }
  const writing = h.act === 'notes' && h.pose === 'sit';
  g.notebook.visible = g.pencil.visible = writing;
  if (writing) {
    g.foreL.rotation.x = WRITE_FORE;
    g.foreR.rotation.x = WRITE_FORE + Math.sin(h.flap * 6) * 0.07;
    g.notebook.rotation.x = -(g.armL.rotation.x + g.foreL.rotation.x);
    g.pencil.rotation.x = -(g.armR.rotation.x + g.foreR.rotation.x);
  }
  const poles = h.poles && h.pose === 'idle' && !h.errand;
  g.poleL.visible = g.poleR.visible = poles;
  if (poles) {
    g.body.rotation.x += POLE_LEAN;
    g.foreL.rotation.x = g.foreR.rotation.x = POLE.bend;
    g.poleL.rotation.x = poleAngle(g.armL.rotation.x + POLE_LEAN, POLE.bend);
    g.poleR.rotation.x = poleAngle(g.armR.rotation.x + POLE_LEAN, POLE.bend);
  }
  g.cup.visible = !!h.errand || h.act === 'coffee';
  if (!g.cup.visible) return;
  if (h.errand) g.foreR.rotation.x = CARRY_BEND;
  // the cup stays level, whatever the arm does
  g.cup.rotation.x = -(g.armR.rotation.x + g.foreR.rotation.x);
}

/** She begins what the clock says; `snap` puts her there at once (she was out of sight). */
function beginAct(ctx: Ctx, act: Act, snap: boolean): void {
  const h = her!;
  const at = ctx.save.babusia.at!;
  const S = BABUSIA_SPOTS;
  const was = h.act;
  if (was === 'tv') {
    home?.tv.setOn(false);
    if (!snap && h.pos.distanceTo(ctx.player.pos) < 16) voice.say('babusia_tv', { priority: 5 });
  }
  if (!snap && was !== act && h.pos.distanceTo(ctx.player.pos) < 12) {
    if (act === 'feed') voice.say('olia_feed', { priority: 4 });
    if (act === 'notes') voice.say('olia_notes', { priority: 4 });
  }
  const swimming = act === 'swim' && !!swim;
  const doing: Act = act === 'swim' && !swim ? 'garden' : act;
  h.act = act;
  h.wait = 0;
  h.next = 0;
  h.poles = doing === 'walk' && poleDay(ctx.save.day, ctx.save.tales.done);
  home?.tv.setOn(false);
  setPose(h, 'idle');
  const path: XZ[] = [];
  const inside = insideHouse(ctx, h.pos);
  const wantsIn = doing === 'tv' || doing === 'cook';
  if (h.outSwimming) {
    // the house may have just landed where there is no water: then she is simply back at the door
    if (swim) path.push(...[...swim.way].reverse(), world(at, S.doorOut.dx, S.doorOut.dz));
    h.outSwimming = false;
  }
  if (inside && !wantsIn) path.push(world(at, S.doorIn.dx, S.doorIn.dz), world(at, S.doorOut.dx, S.doorOut.dz));
  if (!inside && wantsIn) path.push(world(at, S.doorOut.dx, S.doorOut.dz), world(at, S.doorIn.dx, S.doorIn.dz));
  if (doing === 'walk') path.push(world(at, ...WALK_LOOP[0]));
  if (doing === 'garden' || doing === 'bugs') path.push(world(at, ...GARDEN[0]));
  if (doing === 'feed') path.push(world(at, ...FEED[0]));
  if (doing === 'tv') path.push(world(at, S.watch.dx, S.watch.dz));
  if (doing === 'cook') path.push(world(at, S.stove.dx - 2.5, S.stove.dz + 0.6), world(at, S.stove.dx, S.stove.dz));
  if (chairAct(doing)) path.push(world(at, S.chair.dx + 0.6, S.chair.dz + 0.8));
  if (swimming) {
    path.push(world(at, S.doorOut.dx, S.doorOut.dz), ...swim!.way);
    h.outSwimming = true;
  }
  h.path = path;
  if (snap) {
    const [x, z] = path.at(-1)!;
    h.path = [];
    h.pos.set(x, ctx.world.groundHeight(Math.floor(x), Math.floor(z)), z);
  }
}

/** The next thing once she has got where she was going. */
function arrived(ctx: Ctx, h: Her, dt: number): void {
  const at = ctx.save.babusia.at!;
  if (h.errand) {
    const served = h.errand;
    h.errand = null;
    h.pause = HAND_OVER;
    served();
    beginAct(ctx, dayOf(ctx), false);
    return;
  }
  switch (h.act === 'swim' && !swim ? 'garden' : h.act) {
    case 'walk':
      h.next = (h.next + 1) % WALK_LOOP.length;
      h.path = [world(at, ...WALK_LOOP[h.next])];
      break;
    case 'garden':
    case 'bugs':
    case 'feed': {
      h.wait -= dt;
      if (h.wait > 0) break;
      h.wait = 3 + Math.random() * 3;
      const stops = h.act === 'feed' ? FEED : GARDEN;
      h.next = (h.next + 1) % stops.length;
      h.path = [world(at, ...stops[h.next])];
      break;
    }
    case 'swim':
      h.next = 1 - h.next;
      h.path = [h.next ? swim!.b : swim!.a];
      break;
    case 'cook':
      faceTo(h, at[0] + BABUSIA_SPOTS.table.dx, at[2] + BABUSIA_SPOTS.table.dz, dt);
      break;
    case 'tv':
      home?.tv.setOn(true);
      faceTo(h, at[0] + BABUSIA_SPOTS.tv.dx, at[2] + BABUSIA_SPOTS.tv.dz, dt);
      break;
    case 'coffee':
    case 'notes':
      if (!home) break;
      // a child is rocking in it: she waits beside it with her cup
      if (sittingInChair()) {
        faceTo(h, at[0] + BABUSIA_SPOTS.chair.dx, at[2] + BABUSIA_SPOTS.chair.dz, dt);
        break;
      }
      home.chair.getWorldPosition(h.pos);
      home.chair.getWorldDirection(fwd);
      h.yaw = Math.atan2(fwd.x, fwd.z);
      setPose(h, 'sit');
      break;
  }
}

function updateHer(ctx: Ctx, h: Her, dt: number): void {
  const p = ctx.player.pos;
  const at = ctx.save.babusia.at!;
  const want = dayOf(ctx);
  // behind the house on her walk she finishes the way round first: the wall is in the way
  const behind = h.act === 'walk' && h.pos.z < at[2] + BABUSIA_HOUSE.sizeZ + 0.5;
  if (want !== h.act && !behind && !h.errand) beginAct(ctx, want, false);
  const near = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
  const strolling = (h.act === 'walk' || h.act === 'garden' || h.act === 'feed' || h.act === 'bugs') && !behind && !h.errand;
  let speed = 0;
  if (h.pose !== 'sit' && !h.errand && musicNear(h.pos, 13)) setPose(h, 'dance');
  else if (h.pose === 'dance') setPose(h, 'idle');
  if (h.pose === 'dance') faceTo(h, p.x, p.z, dt, 3);
  else if (h.pause > 0) {
    h.pause -= dt;
    faceTo(h, p.x, p.z, dt, 5);
  } else if (near < 2.8 && strolling) faceTo(h, p.x, p.z, dt, 5);
  else if (h.path.length) {
    const swimmingNow = !!swim && wetAt(ctx, Math.floor(h.pos.x), Math.floor(h.pos.z));
    speed = swimmingNow ? SWIM_SPEED : h.poles ? WALK_SPEED * POLE_PACE : WALK_SPEED;
    const [x, z] = h.path[0];
    if (walkTo(ctx, h, x, z, speed, dt)) h.path.shift();
    if (swim && wetAt(ctx, Math.floor(h.pos.x), Math.floor(h.pos.z))) h.pos.y = swim.surface - SWIM_DEPTH;
  } else arrived(ctx, h, dt);
  h.model.root.position.copy(h.pos);
  h.model.root.rotation.set(h.pose === 'sit' ? chairRock() : 0, h.yaw, 0, 'YXZ');
  h.model.update(dt, speed);
  holdGear(h, dt);
  tapAt.copy(h.pos).setY(h.pos.y + 1);
}

// ─── meeting her ─────────────────────────────────────────────────────────────

function tell(ctx: Ctx, list: LineId[], kind: keyof typeof lastTold): void {
  lastTold[kind] = nextJoke(lastTold[kind], list.length, Math.random());
  voice.say(line(ctx, list[lastTold[kind]]), { priority: 6, interrupt: true });
}

/** Her own funny word: Юля's joke; Оля's joke, or more often something true about insects. */
export function joke(ctx: Ctx): void {
  if (ctx.save.babusia.host === 'yulia') tell(ctx, JOKES, 'joke');
  else if (Math.random() < FACT_CHANCE) tell(ctx, FACTS, 'fact');
  else tell(ctx, OLIA_JOKES, 'joke');
}

/** After the marshmallows: a joke or a very short tale from her, or Пупся's word when she is away. */
function fireTalk(ctx: Ctx): void {
  if (!host.near()) tell(ctx, FIRE_CAT, 'cat');
  else if (Math.random() < 1 / 3) tell(ctx, STORIES, 'story');
  else joke(ctx);
}

/** A tap on her: she answers at once, then does the one thing the moment calls for. */
function tapped(ctx: Ctx, h: Her): void {
  const b = ctx.save.babusia;
  b.met = true;
  // her hello must not talk over the answer
  talkT = Math.max(talkT, 8);
  if (h.pose === 'idle') h.model.play('happy');
  ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1.2), puff(ctx), 12);
  sfx.play('click', { pitch: 1.4 });
  const tale = held(ctx);
  const reply = tapReply({
    hurt: [...ctx.heroes.values()].some((x) => x.hearts < HERO_STATS.maxHearts),
    giftDue: b.giftDay !== ctx.save.day && !tale,
    asking: tale && ctx.clock.elapsed - askedAt > ASK_AGAIN,
  });
  if (reply === 'feed' && home) {
    const place = insideHouse(ctx, ctx.player.pos) ? home.table : home.yard;
    place.snack = dishOfDay(ctx.save.day);
    for (const hero of ctx.heroes.values()) ctx.effects.poof(tmp.copy(hero.pos).setY(hero.pos.y + 0.8), puff(ctx), 8);
    sitDown(ctx, place);
  } else if (reply === 'gift') {
    giftT = -1;
    smallGift(ctx, true);
  } else if (reply === 'ask' && sayAsk(ctx)) askedAt = ctx.clock.elapsed;
  else joke(ctx);
}

/** Her hello: first where the other one went, now and then a slip, otherwise one of her greetings. */
function greet(ctx: Ctx): void {
  const b = ctx.save.babusia;
  const pick = (l: LineId[]) => l[Math.floor(Math.random() * l.length)];
  if (!b.told) {
    b.told = true;
    voice.say(pick(OTHER[b.host]), { priority: 6 });
  } else if (Math.random() < SLIP_CHANCE) voice.say(pick(SLIPS[b.host]), { priority: 6 });
  else voice.say(line(ctx, pick(HELLO)), { priority: 6 });
}

/** Standing by Юля the weather piece breathes: the children may ask her for any weather. */
export function weatherAsk(ctx: Ctx): boolean {
  const h = her;
  if (!h || ctx.save.babusia.host !== 'yulia' || !h.model.root.visible || eating() || ctx.sleeping || ctx.napping) return false;
  return Math.hypot(ctx.player.pos.x - h.pos.x, ctx.player.pos.z - h.pos.z) < ASK_NEAR;
}

function askWeather(ctx: Ctx, h: Her): void {
  const w = nextWeather(ctx);
  if (h.pose === 'idle') h.model.play('happy');
  ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1.6), puff(ctx), 14);
  sfx.play('switch', { pitch: 1.3 });
  voice.say(WEATHER_LINE[w], { priority: 7, interrupt: true });
}

function talk(ctx: Ctx, h: Her, dt: number): void {
  const b = ctx.save.babusia;
  const p = ctx.player.pos;
  const d = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
  talkT -= dt;
  if (Math.hypot(p.x - centre.x, p.z - centre.z) < BABUSIA.spot && !ctx.save.said.includes('babusia_spot') && voice.quietSeconds() > 1) {
    ctx.save.said.push('babusia_spot');
    voice.say('babusia_spot', { priority: 5 });
  }
  if (b.host === 'olia' && d < BABUSIA.spot && !ctx.save.said.includes('olia_spot') && voice.quietSeconds() > 1) {
    ctx.save.said.push('olia_spot');
    voice.say('olia_spot', { priority: 5 });
  }
  if (weatherAsk(ctx) && !ctx.save.said.includes('babusia_weather_hint') && voice.quietSeconds() > 1) {
    ctx.save.said.push('babusia_weather_hint');
    voice.say('babusia_weather_hint', { priority: 5 });
  }
  if (giftT >= 0) {
    giftT -= dt;
    if (giftT < 0 && !eating()) smallGift(ctx);
  }
  if (ctx.sleeping || ctx.napping) return;
  if (home && d < TAP_NEAR && !eating() && !selectedBuilding() && !ctx.map.isOpen && tappedAt(ctx, tapAt, 0.9)) {
    tapped(ctx, h);
    return;
  }
  if (d > BABUSIA.talk || talkT > 0 || voice.quietSeconds() < 1) return;
  talkT = BABUSIA.talkAgain;
  b.met = true;
  if (h.pose === 'idle') h.model.play('happy');
  greet(ctx);
  pantryGift(ctx);
  if (b.giftDay !== ctx.save.day && !held(ctx)) giftT = 4.5;
}

/** At night by her house: the fire burns, and now and then a firework goes up over the yard. */
function night(ctx: Ctx, dt: number): void {
  if (ctx.clock.daylight > 0.3) return;
  const b = ctx.save.babusia;
  const p = ctx.player.pos;
  if (!inSafeRing(b, p.x, p.z)) return;
  if (nightSaid !== ctx.save.day && voice.quietSeconds() > 2 && !ctx.sleeping) {
    nightSaid = ctx.save.day;
    voice.say(line(ctx, 'babusia_night'), { priority: 5 });
  }
  fireworkT -= dt;
  if (fireworkT > 0 || ctx.sleeping) return;
  fireworkT = 4 + Math.random() * 4;
  sfx.play('poof', { pitch: 1.6 + Math.random() * 0.4, volume: 0.5 });
  const colours = [0xffd23a, 0xee6a82, 0xfff4d8, 0x8fd6cc];
  // a little salvo just ahead of the party: the camera looks down, so higher up it would miss the screen
  for (let i = 0; i < 3; i++) {
    const colour = colours[Math.floor(Math.random() * colours.length)];
    ctx.effects.firework(tmp.set(p.x + (i - 1) * 4 + Math.random() * 1.5, p.y + 1, p.z + 1 - Math.random() * 3), colour, 4 + Math.random());
  }
}

// ─── met out on a walk ───────────────────────────────────────────────────────

const STROLL: LineId[] = ['babusia_stroll_1', 'babusia_stroll_2', 'babusia_stroll_3', 'babusia_stroll_4'];

interface Stroll {
  phase: 'come' | 'chat' | 'go';
  t: number;
  /** Where she walks off to. */
  to: XZ;
}
let stroll: Stroll | null = null;
let strollCheck = 0;
let strollForce = false;
const STROLL_CHAT = 6;
const STROLL_GO = 5;

/** Far from her house, by day, in a quiet moment, she may come walking along. */
function maybeStroll(ctx: Ctx, h: Her, dt: number): void {
  const b = ctx.save.babusia;
  strollCheck -= dt;
  if (strollCheck > 0) return;
  strollCheck = 5;
  const p = ctx.player.pos;
  if (!strollDue(b, ctx.save.day) || ctx.clock.daylight < 0.6 || ctx.sleeping || ctx.napping || job) return;
  if (Math.hypot(p.x - centre.x, p.z - centre.z) < BABUSIA.strollAway || voice.quietSeconds() < 2) return;
  if (ctx.boss?.alive && ctx.boss.inZone(p.x, p.z)) return;
  if (ctx.monsters.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 14) || (!strollForce && Math.random() > 0.08)) return;
  strollForce = false;
  const a = Math.random() * Math.PI * 2;
  const spot = landingSpot(ctx.world, p.x + Math.sin(a) * BABUSIA.strollFrom, p.z + Math.cos(a) * BABUSIA.strollFrom);
  if (!spot) return;
  b.strollDay = ctx.save.day;
  h.pos.set(spot.x, spot.y, spot.z);
  h.path = [];
  h.act = null;
  h.errand = null;
  setPose(h, 'idle');
  h.poles = b.host === 'yulia' && poleDay(ctx.save.day, ctx.save.tales.done);
  h.model.root.visible = true;
  ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1), puff(ctx), 14);
  const away = a + 1 + Math.random();
  stroll = { phase: 'come', t: 0, to: [spot.x + Math.sin(away) * 14, spot.z + Math.cos(away) * 14] };
  voice.say(line(ctx, STROLL[Math.floor(Math.random() * STROLL.length)]), { priority: 6 });
}

function endStroll(ctx: Ctx, h: Her): void {
  stroll = null;
  ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1), puff(ctx), 14);
  h.model.root.visible = false;
  home!.root.visible = false;
  showYard(false);
}

function updateStroll(ctx: Ctx, h: Her, s: Stroll, dt: number): void {
  const p = ctx.player.pos;
  s.t += dt;
  let speed = 0;
  const near = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
  if (s.phase === 'come') {
    if (near > 2.4 && s.t < 12) {
      speed = WALK_SPEED;
      walkTo(ctx, h, p.x, p.z, speed, dt);
    } else {
      s.phase = 'chat';
      s.t = 0;
      h.model.play('happy');
      const hurt = [...ctx.heroes.values()].some((x) => x.hearts < HERO_STATS.maxHearts);
      if (hurt) {
        // a pie out of her pocket
        for (const hero of ctx.heroes.values()) hero.hearts = HERO_STATS.maxHearts;
        ctx.effects.ring(p, 0xeab02b, 1.8);
        voice.say(line(ctx, 'babusia_gift_pie'), { priority: 6 });
      } else if (ctx.save.babusia.giftDay !== ctx.save.day && !held(ctx)) smallGift(ctx);
      else joke(ctx);
    }
  } else if (s.phase === 'chat') {
    faceTo(h, p.x, p.z, dt, 5);
    if (s.t > STROLL_CHAT && voice.quietSeconds() > 0.5) {
      s.phase = 'go';
      s.t = 0;
      voice.say(line(ctx, 'babusia_stroll_bye'), { priority: 6 });
    }
  } else {
    speed = WALK_SPEED;
    walkTo(ctx, h, s.to[0], s.to[1], speed, dt);
    if (s.t > STROLL_GO) {
      endStroll(ctx, h);
      return;
    }
  }
  if (near < TAP_NEAR && ctx.input.taps.length && tappedAt(ctx, tapAt, 0.9)) {
    h.model.play('happy');
    ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1.2), puff(ctx), 12);
    sfx.play('click', { pitch: 1.4 });
    joke(ctx);
  }
  h.model.root.position.copy(h.pos);
  h.model.root.rotation.set(0, h.yaw, 0, 'YXZ');
  h.model.update(dt, speed);
  holdGear(h, dt);
  tapAt.copy(h.pos).setY(h.pos.y + 1);
}

// ─── the stork with a pie ────────────────────────────────────────────────────

/** Far away and nearly out of hearts: a stork flies in from her house with a pie. */
function callStork(ctx: Ctx): void {
  const b = ctx.save.babusia;
  const p = ctx.player.pos;
  if (!b.at || !b.met || ctx.clock.elapsed < storkAt || ctx.player.hearts > 1) return;
  if (ctx.sleeping || ctx.napping || inSafeRing(b, p.x, p.z) || (ctx.boss?.alive && ctx.boss.inZone(p.x, p.z))) return;
  storkAt = ctx.clock.elapsed + BABUSIA.storkEvery;
  sendStork(ctx, false);
}

function sendStork(ctx: Ctx, note: boolean): void {
  const p = ctx.player.pos;
  storkModel ??= createStork(ctx.skin);
  ctx.scene.add(storkModel.root);
  const a = note ? Math.random() * Math.PI * 2 : Math.atan2(centre.x - p.x, centre.z - p.z);
  stork = { pos: new THREE.Vector3(p.x + Math.sin(a) * 30, p.y + 14, p.z + Math.cos(a) * 30), landed: false, t: 1.4, note };
}

/** The one away: a greeting and a pie by stork once a trip, by day, when all is calm and the party is out and about. */
function callNote(ctx: Ctx): void {
  const b = ctx.save.babusia;
  const p = ctx.player.pos;
  if (!b.at || b.moving || !noteDue(b, ctx.save.day) || ctx.clock.daylight < 0.6 || ctx.sleeping || ctx.napping || eating() || job) return;
  if (inSafeRing(b, p.x, p.z) || voice.quietSeconds() < 2 || (ctx.boss?.alive && ctx.boss.inZone(p.x, p.z))) return;
  if (ctx.monsters.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 14)) return;
  b.noted = true;
  sendStork(ctx, true);
}

function flyStork(ctx: Ctx, s: Stork, dt: number): void {
  const m = storkModel!;
  const p = ctx.player.pos;
  if (!s.landed) {
    const to = tmp.set(p.x + Math.sin(ctx.player.yaw) * 1.8, 0, p.z + Math.cos(ctx.player.yaw) * 1.8);
    to.y = ctx.world.groundHeight(Math.floor(to.x), Math.floor(to.z));
    const d = s.pos.distanceTo(to);
    if (d > 0.01) {
      const dir = fwd.copy(to).sub(s.pos).normalize();
      s.pos.addScaledVector(dir, Math.min(d, Math.max(9, d * 0.9) * dt));
      m.root.rotation.y = Math.atan2(dir.x, dir.z);
    }
    if (d < 0.3) s.landed = true;
  } else s.t -= dt;
  m.root.position.copy(s.pos);
  m.update(dt, !s.landed, 1 - ctx.clock.daylight);
  if (s.t > 0) return;
  ctx.scene.remove(m.root);
  stork = null;
  sfx.play('sticker', { pitch: 1.2 });
  if (s.note) {
    const list = NOTES[otherHost(ctx.save.babusia.host)];
    giveItem(ctx, 'babusia_pie', 1);
    ctx.effects.ring(p, 0xeab02b, 1.6);
    voice.say(list[ctx.save.day % list.length], { priority: 7, interrupt: true });
    return;
  }
  for (const h of ctx.heroes.values()) {
    h.hearts = HERO_STATS.maxHearts;
    ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1), 0xee6a82, 10);
  }
  voice.say('babusia_stork', { priority: 7, interrupt: true });
}

// ─── the flight ──────────────────────────────────────────────────────────────

/**
 * The house moves on every night (DESIGN.md «The flight»). Asleep in her beds the party flies
 * with it (`aboard`): the roof comes back on, a swirl of petals or fireflies, the house with its
 * furniture and the sleepers rises over a sea of clouds, the world moves underneath, the house
 * comes down with a toy's bounce as the sun rises, and the other hostess is at the stove. Awake
 * in the yard at dawn (`seen`) they watch it lift off and melt into the sky. Far away, nothing
 * is seen (moveJob). Content/flight.ts has the moments and the curves.
 */
interface Flight {
  kind: 'aboard' | 'seen';
  t: number;
  phase: FlightPhase;
  from: Site;
  /** Found during the first seconds; the flight waits at lift-off until it is. */
  to: Site | null;
  /** The house's corner now: the old site until the world has moved under it. */
  base: Site;
  /** The world has moved under the house: the landing may be put up. */
  landReady: boolean;
  /** `seen`: she is on her way in. */
  path: XZ[];
  windT: number;
  touched: boolean;
  /** The hostess the house leaves with. */
  leaving: Host;
  /** `aboard`: wakes the sleep scene when the house has docked (true) or the flight was called off. */
  done: ((flew: boolean) => void) | null;
}

let flight: Flight | null = null;
let flyHintDay = -1;
/** A save made mid-flight: on load, once the house stands, the party is carried to its gate. */
let resumeAboard = false;

/** Tonight the house moves on: the party asleep in her beds flies with it. */
export function flightDue(ctx: Ctx): boolean {
  const b = ctx.save.babusia;
  return !!home && !!b.at && !b.moving && !job && !flight && !stroll && shouldMove(b, ctx.save.day + 1);
}

/** Looks for the landing while the party lies down; the flight reads `to` when it is time. */
function* lookForSite(ctx: Ctx, f: Flight): Generator<void> {
  f.to = yield* siteSearch(ctx, ctx.player.pos.clone());
}

/**
 * Case 1, from the moment the party lies down in her beds. Resolves when the house has docked
 * at the new place (true) or, with nowhere to land, at once after the lying down (false): then
 * the night passes as anywhere.
 */
export function flyHouse(ctx: Ctx): Promise<boolean> {
  const b = ctx.save.babusia;
  if (!flightDue(ctx)) return Promise.resolve(false);
  const at = b.at!;
  return new Promise((done) => {
    flight = { kind: 'aboard', t: 0, phase: 'settle', from: at, to: null, base: at, landReady: false, path: [], windT: 0, touched: false, leaving: b.host, done };
    job = lookForSite(ctx, flight);
    // she is indoors: the house leaves with its lights on
    if (her) her.model.root.visible = false;
    showYard(false);
    leaveSeats(ctx, host);
  });
}

/** Case 2: the party is up and about in her yard at dawn; she says a word and the house leaves before their eyes. */
function startSeen(ctx: Ctx): void {
  const b = ctx.save.babusia;
  if (!home || !her || !b.at || flight || job) return;
  const at = b.at;
  flight = { kind: 'seen', t: 0, phase: 'settle', from: at, to: null, base: at, landReady: false, path: [], windT: 0, touched: false, leaving: b.host, done: null };
  job = lookForSite(ctx, flight);
  const h = her;
  h.errand = null;
  h.act = null;
  setPose(h, 'idle');
  home.tv.setOn(false);
  const inside = insideHouse(ctx, h.pos);
  h.path = inside ? [] : [world(at, BABUSIA_SPOTS.doorOut.dx, BABUSIA_SPOTS.doorOut.dz), world(at, BABUSIA_SPOTS.doorIn.dx, BABUSIA_SPOTS.doorIn.dz)];
  flight.path = h.path;
  leaveSeats(ctx, host);
  showYard(false);
  voice.say(OFF[b.host][Math.floor(Math.random() * OFF[b.host].length)], { priority: 7, interrupt: true });
}

/** The house leaves the ground: the move is written down, the ground under it goes back. */
function liftOff(ctx: Ctx, f: Flight): void {
  const b = ctx.save.babusia;
  const aboard = f.kind === 'aboard';
  b.moving = { from: f.from, to: f.to!, host: hostAfterMove(b.host, ctx.save.tales.done), day: ctx.save.day + (aboard ? 1 : 0), aboard };
  job = carryOut(ctx, () => f.landReady, aboard ? () => f.touched : undefined);
  sfx.play('lift');
  if (aboard) {
    ctx.hud.show(false);
    if (!ctx.save.said.includes('babusia_flight_wow')) {
      ctx.save.said.push('babusia_flight_wow');
      setTimeout(() => voice.say('babusia_flight_wow', { priority: 6 }), 1200);
    }
  } else {
    // nobody is carried off awake: a child indoors or in a seat is set down at the gate
    if (her) her.model.root.visible = false;
    if (insideHouse(ctx, ctx.player.pos)) {
      const [gx, gz] = world(f.from, BABUSIA_SPOTS.gate.dx, BABUSIA_SPOTS.gate.dz);
      let i = 0;
      for (const h of ctx.heroes.values()) {
        const side = h === ctx.player ? 0 : i++ === 0 ? -1 : 1;
        placeOnGround(ctx.world, h.body, gx + side * 1.1, gz + (side ? 0.8 : 0));
        ctx.effects.poof(tmp.copy(h.pos).setY(h.pos.y + 1), puff(ctx), 10);
      }
    }
  }
}

/** The swirl of petals (Юля) or fireflies (Оля) round the house, `strength` 0..1 (0 clears it). */
function swirl(who: Host, strength: number, dt: number): void {
  home?.swirl.update(dt, strength, who === 'yulia' ? 'petals' : 'flies', BABUSIA_HOUSE.sizeX / 2, BABUSIA_HOUSE.sizeZ / 2);
}

/** Puts the house, with its roof and furniture, this far over its corner; `s` squashes it like a toy set down, `size` shrinks it as it flies off. */
function placeHouse(h: Home, base: Site, dx: number, lift: number, dz: number, s = 0, opacity = 1, size = 1): void {
  const sx = (1 + s) * size;
  const sy = (1 - s) * size;
  h.root.scale.set(sx, sy, sx);
  // squashed and shrunk about its middle, not its corner
  h.root.position.set(base[0] + dx - (BABUSIA_HOUSE.sizeX / 2) * (sx - 1), base[1] + lift, base[2] + dz - (BABUSIA_HOUSE.sizeZ / 2) * (sx - 1));
  h.root.visible = true;
  for (const m of [...h.shell.mats, ...h.roofMats]) {
    m.opacity = opacity;
    m.depthWrite = opacity > 0.98;
  }
}

/** The sleepers lie in their beds wherever the house is. */
function placeSleepers(ctx: Ctx, base: Site, dx: number, lift: number, dz: number): void {
  for (const id of HERO_ORDER) {
    const h = ctx.heroes.get(id);
    if (!h) continue;
    const s = BABUSIA_BEDS[id];
    h.model.root.position.set(base[0] + s.dx + dx, base[1] + s.dy + lift, base[2] + s.dz + dz);
  }
}

/** Under full cloud the world moves: the view and the bodies are at the new place at once. */
function teleport(ctx: Ctx, f: Flight): void {
  const to = f.to!;
  // the clouds keep their places on screen while the view jumps with the house
  ctx.clouds?.shift(to[0] - f.base[0], to[2] - f.base[2]);
  f.base = to;
  const [wx, wz] = world(to, BABUSIA_SPOTS.wake.dx, BABUSIA_SPOTS.wake.dz);
  let i = 0;
  for (const h of ctx.heroes.values()) {
    const side = h === ctx.player ? 0 : i++ === 0 ? -1 : 1;
    // the ground there is not made yet: the floor's height is known
    h.body.pos.set(wx + side * 0.9, to[1] + 1.02, wz + (side ? 0.9 : 0));
    h.body.vel.set(0, 0, 0);
    h.body.onGround = true;
    h.invulnerable = Math.max(h.invulnerable, 2);
  }
  for (const m of ctx.monsters) if (Math.hypot(m.pos.x - wx, m.pos.z - wz) < 24) m.alive = false;
  const [cx, cz] = centreOf(to);
  (ctx.focus ??= new THREE.Vector3()).set(cx, to[1] + 1 + FLIGHT.height, cz);
  events.emit('hero:teleport', {});
  // the other hostess is found at the stove when the house comes down
  stoveUntil = ctx.clock.elapsed + AT_STOVE;
  f.landReady = true;
}

/** The house is down: everything in its place, the view back on the hero, the sleep scene goes on. */
function dock(ctx: Ctx, f: Flight): void {
  const h = home!;
  const to = f.to!;
  placeHouse(h, to, 0, 0, 0);
  placeSleepers(ctx, to, 0, 0, 0);
  ctx.focus = null;
  ctx.zoom = 1;
  ctx.clouds?.set({ alpha: 0 });
  veilFog(0);
  ctx.hud.show(ctx.params.hud);
  const done = f.done;
  flight = null;
  setTimeout(() => voice.say('babusia_flew', { priority: 5 }), 5500);
  done?.(true);
}

/** Nowhere to land tonight: the night passes as anywhere, the house stays. */
function callOff(ctx: Ctx, f: Flight): void {
  const done = f.done;
  flight = null;
  ctx.focus = null;
  ctx.zoom = 1;
  ctx.clouds?.set({ alpha: 0 });
  veilFog(0);
  swirl(f.leaving, 0, 0);
  if (her) {
    her.model.root.visible = true;
    if (f.kind === 'seen') beginAct(ctx, dayOf(ctx), true);
  }
  showYard(ctx.save.babusia.host === 'olia');
  done?.(false);
}

function updateAboard(ctx: Ctx, f: Flight, dt: number): void {
  const h = home!;
  const c = ctx.clock;
  f.t += dt;
  const phase = phaseAt(f.t);
  // the night deepens while they settle
  if (phase === 'settle' && c.t < FLIGHT.night) c.t = Math.min(FLIGHT.night, c.t + dt * FLIGHT.nightfall);
  if (phase !== 'settle' && !ctx.save.babusia.moving && !f.landReady) {
    // the site is not found yet (or never): wait at the edge of take-off, or give up
    if (!f.to) {
      if (job) {
        f.t = FLIGHT.settle;
        return;
      }
      callOff(ctx, f);
      return;
    }
    liftOff(ctx, f);
  }
  const lift = liftAt(f.t);
  const [sx, sz] = swayAt(f.t, lift);
  const dawn = dawnAt(f.t);
  if (dawn !== null) c.t = Math.max(c.t, dawn);
  if (phase === 'glide' && f.t >= FLIGHT.teleport && !f.landReady) teleport(ctx, f);
  if (phase === 'touch' && !f.touched) {
    f.touched = true;
    sfx.play('place');
    sfx.play('clink', { volume: 0.4, pitch: 1.3 });
  }
  if (phase === 'glide' || phase === 'lift') {
    f.windT -= dt;
    if (f.windT <= 0 && f.t > FLIGHT.cruise - 1) {
      f.windT = 2.4;
      sfx.play('wind', { volume: 0.5 });
    }
  }
  const squash = f.touched ? squashAt(f.t - FLIGHT.touch) : 0;
  placeHouse(h, f.base, sx, lift, sz, squash);
  placeSleepers(ctx, f.base, sx, lift, sz);
  const [cx, cz] = centreOf(f.base);
  (ctx.focus ??= new THREE.Vector3()).set(cx + sx, f.base[1] + 1 + lift + lagAt(f.t), cz + sz);
  ctx.zoom = zoomAt(f.t);
  ctx.clouds?.set({ y: f.base[1] + 1 + FLIGHT.height - FLIGHT.cloudBelow, alpha: cloudsAt(f.t), drift: FLIGHT.drift });
  veilFog(cloudsAt(f.t));
  // she who leaves lifts it off, she who comes sets it down
  swirl(f.t < FLIGHT.descend ? f.leaving : (ctx.save.babusia.moving?.host ?? ctx.save.babusia.host), swirlAt(f.t), dt);
  updateHome(ctx, h, dt);
  // down, and the landing finished: the scene goes on
  if (phase === 'done' && !job) dock(ctx, f);
}

function updateSeen(ctx: Ctx, f: Flight, dt: number): void {
  const h = home!;
  f.t += dt;
  ctx.zoom = FLIGHT.zoomSeen;
  // she goes in first
  if (her && her.model.root.visible) {
    const [x, z] = f.path[0] ?? [her.pos.x, her.pos.z];
    const speed = f.path.length ? WALK_SPEED : 0;
    if (f.path.length && walkTo(ctx, her, x, z, speed, dt)) f.path.shift();
    her.model.root.position.copy(her.pos);
    her.model.root.rotation.set(0, her.yaw, 0, 'YXZ');
    her.model.update(dt, speed);
    holdGear(her, dt);
    if (!f.path.length && f.t > 1.5) her.model.root.visible = false;
  }
  if (f.t >= FLIGHT.seenLift && !ctx.save.babusia.moving && !f.landReady) {
    if (!f.to) {
      if (job) {
        f.t = FLIGHT.seenLift;
        return;
      }
      callOff(ctx, f);
      return;
    }
    liftOff(ctx, f);
  }
  const s = seenAt(f.t);
  swirl(f.leaving, s.swirl, dt);
  placeHouse(h, f.from, 0, s.lift, -s.away, 0, s.opacity, s.size);
  updateHome(ctx, h, dt);
  // the view leans towards the leaving house and pulls back a little; the hero stays in the frame
  const [hx, hz] = centreOf(f.from);
  const p = ctx.player.pos;
  const vx = hx - p.x;
  const vz = hz - s.away - p.z;
  const lean = (Math.min(FLIGHT.seenLean, Math.hypot(vx, vz) * 0.5) * s.look) / Math.max(1, Math.hypot(vx, vz));
  (ctx.focus ??= new THREE.Vector3()).set(p.x + vx * lean, p.y, p.z + vz * lean);
  ctx.zoom = 1 + (FLIGHT.zoomSeen - 1) * s.look;
  if (!s.gone) return;
  // gone in a last puff of the swirl: the pieces are whole again for the landing, which the job puts up far away
  ctx.effects.poof(tmp.set(hx, f.from[1] + 1 + s.lift, hz - s.away), HOSTS[f.leaving].puff, 26);
  sfx.play('sticker', { pitch: 1.4 });
  placeHouse(h, f.from, 0, 0, 0);
  h.root.visible = false;
  const was = ctx.save.babusia.host;
  flight = null;
  ctx.focus = null;
  ctx.zoom = 1;
  f.landReady = true;
  const after = job;
  job = (function* () {
    if (after) yield* after;
    const b = ctx.save.babusia;
    voice.say(b.host === was ? 'babusia_moved' : CAME[b.host], { priority: 6 });
  })();
}

function updateFlight(ctx: Ctx, dt: number): void {
  const f = flight!;
  if (!home) return;
  f.phase = phaseAt(f.t);
  if (f.kind === 'aboard') updateAboard(ctx, f, dt);
  else updateSeen(ctx, f, dt);
}

/** Evenings near her house Пупся says why to stay the night, once a day. */
function flyHint(ctx: Ctx): void {
  const b = ctx.save.babusia;
  if (!b.at || !b.met || flyHintDay === ctx.save.day || ctx.clock.daylight > 0.3 || ctx.sleeping || ctx.napping || flight) return;
  const p = ctx.player.pos;
  // her own good-night word comes first inside the yard
  if ((nightSaid !== ctx.save.day && inSafeRing(b, p.x, p.z)) || voice.quietSeconds() < 4) return;
  if (Math.hypot(p.x - centre.x, p.z - centre.z) > BABUSIA.moveAway) return;
  flyHintDay = ctx.save.day;
  voice.say('babusia_fly_hint', { priority: 4 });
}

// ─── the loop ────────────────────────────────────────────────────────────────

function runJob(): void {
  const t0 = performance.now();
  while (job) {
    if (job.next().done) job = null;
    if (performance.now() - t0 > BUDGET) return;
  }
}

function onScreen(ctx: Ctx, at: THREE.Vector3): XZ {
  const v = at.clone().project(ctx.camera);
  const r = ctx.renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
}

/** What the seats in her yard ask of her. */
function hostess(ctx: Ctx): Hostess {
  const awayFromPlayer = (h: Her) => h.pos.distanceTo(ctx.player.pos) >= BABUSIA.comes;
  return {
    wantsChair: () => chairAct(her?.act ?? null),
    inChair: () => her?.pose === 'sit',
    near: () => !!her && !her.outSwimming && her.act !== 'tv' && !awayFromPlayer(her),
    line: (id) => line(ctx, id),
    bring(served) {
      const h = her;
      const at = ctx.save.babusia.at;
      if (!h || !at || h.errand || h.pose === 'dance' || h.outSwimming || awayFromPlayer(h)) return false;
      // only out in the yard, in front of the house: from anywhere else the walls are in her way
      if (h.pos.z < at[2] + BABUSIA_HOUSE.sizeZ + 0.5) return false;
      setPose(h, 'idle');
      h.errand = served;
      h.path = [world(at, BABUSIA_SPOTS.chair.dx + 1.4, BABUSIA_SPOTS.chair.dz + 0.9)];
      return true;
    },
    recall() {
      if (!her?.errand) return;
      her.errand = null;
      beginAct(ctx, dayOf(ctx), false);
    },
  };
}

export function initBabusia(ctx: Ctx): void {
  const b = ctx.save.babusia;
  host = hostess(ctx);
  // the chess kingdom's ground came after the save: a house (or a landing) there moves on, a meadow there is gone
  b.glades = b.glades.filter(([x, z]) => !chessNear(ctx, x, z));
  if (b.moving) job = !b.moving.aboard && onChess(ctx, b.moving.to) ? moveOffChess(ctx) : carryOut(ctx);
  else if (b.at) job = onChess(ctx, b.at) ? moveOffChess(ctx) : settle(ctx);
  // ?tale=babusia_… (test only): she is there at once
  else if (ctx.params.tale?.startsWith('babusia') || ctx.params.tale?.startsWith('olia')) {
    b.host = taleById(ctx.params.tale)?.host ?? b.host;
    const landing = moveJob(ctx, ctx.player.pos.clone());
    while (!landing.next().done);
  }
  storkAt = ctx.clock.elapsed + 30;
  if (b.moving?.aboard) resumeAboard = true;
  events.on('time:phase', ({ phase }) => {
    if (phase !== 'morning') return;
    if (home) home.table.snack = home.yard.snack = dishOfDay(ctx.save.day);
    // every morning the house is somewhere new: seen from the yard, or quietly while the party is far
    // (asleep in her beds the flight has already begun; asleep elsewhere the fader is up)
    if (job || flight || b.moving || !shouldMove(b, ctx.save.day)) return;
    const away = centre.distanceTo(tmp.copy(ctx.player.pos).setY(centre.y));
    if (!ctx.sleeping && !ctx.napping && away <= BABUSIA.moveAway && home?.root.visible && her) startSeen(ctx);
    else job = moveJob(ctx, ctx.player.pos.clone());
  });
  // her bell: the party is carried to her gate; a jump ends a walk she was on
  events.on('effect:start', ({ kind }) => {
    if (kind === 'babusia') jump(ctx);
  });
  events.on('hero:teleport', () => {
    if (!stroll || !her) return;
    stroll = null;
    her.model.root.visible = false;
    if (home) home.root.visible = false;
    showYard(false);
  });
  events.on('hero:sleep', () => {
    if (!home || !babusiaBeds(ctx)) return;
    asleepHere = true;
    for (const bed of home.beds) bed.fold(0);
  });
  events.on('sleep:done', ({ where }) => {
    asleepHere = false;
    if (home) for (const bed of home.beds) bed.fold(1);
    if (where === 'babusia') setTimeout(() => voice.say(line(ctx, 'babusia_morning'), { priority: 7 }), 900);
  });
  // For automated checks.
  (window as unknown as { __kotoBabusia: object }).__kotoBabusia = {
    get state() {
      return {
        at: b.at,
        host: b.host,
        noted: b.noted,
        told: b.told,
        glass: her?.gear.glass.visible ?? false,
        notebook: her?.gear.notebook.visible ?? false,
        moving: !!b.moving,
        job: !!job,
        built: !!home,
        act: her?.act ?? null,
        pos: her?.pos.toArray() ?? null,
        swim: !!swim,
        glades: b.glades.length,
        gladesGrown: glades.size,
        day: ctx.save.day,
        met: b.met,
        stork: !!stork,
        pose: her?.pose ?? null,
        poles: her?.poles ?? false,
        errand: !!her?.errand,
        cup: her?.gear.cup.visible ?? false,
        flowers: b.flowers,
        giftDay: b.giftDay,
        seats: seatsState(),
        movedDay: b.movedDay,
        flight: flight ? { kind: flight.kind, phase: flight.phase, t: +flight.t.toFixed(2), to: flight.to, landReady: flight.landReady } : null,
        focus: ctx.focus?.toArray() ?? null,
        inside: insideHouse(ctx, ctx.player.pos),
        time: +ctx.clock.t.toFixed(3),
        houseAt: home?.root.position.toArray() ?? null,
        houseShown: home?.root.visible ?? false,
        sleeping: ctx.sleeping,
        napping: ctx.napping,
        party: [...ctx.heroes.values()].map((h) => {
          const r = h.model.root;
          const w = r.getWorldPosition(new THREE.Vector3());
          return { id: h.id, model: w.toArray().map((v) => +v.toFixed(1)), shown: r.visible, parent: r.parent?.name || r.parent?.type || null, body: h.body.pos.toArray().map((v) => +v.toFixed(1)) };
        }),
      };
    },
    /** She lands, or moves on, now. */
    move: () => {
      job = moveJob(ctx, ctx.player.pos.clone());
    },
    /** The house leaves before the party's eyes now. */
    fly: () => startSeen(ctx),
    blockAt: (x: number, y: number, z: number) => ctx.world.getBlock(x, y, z),
    /** The greeting from the one away is due now. */
    note: () => {
      b.noted = false;
      b.movedDay = ctx.save.day - 1;
      noteCheck = 0;
    },
    ask: () => ctx.input.press('prompt:weather'),
    get asking() {
      return weatherAsk(ctx);
    },
    /** The party stands right next to her. */
    beside: () => {
      if (!her) return;
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(her.pos.x + (h === ctx.player ? 2 : 3), her.pos.y + 1, her.pos.z + 3.5);
        h.body.vel.set(0, 0, 0);
      }
    },
    /** The party stands at a spot of her yard (relative to the house corner). */
    to: (dx = BABUSIA_SPOTS.gate.dx, dz = BABUSIA_SPOTS.gate.dz, dy = 1.05) => {
      const at = b.at;
      if (!at) return;
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(at[0] + dx + (h === ctx.player ? 0 : 1.2), at[1] + dy, at[2] + dz);
        h.body.vel.set(0, 0, 0);
      }
    },
    jump: () => jump(ctx),
    /** The player stands at her chair or at a bench. */
    standAt: (what: 'chair' | 'bench') => {
      if (!home || !b.at) return;
      const o = what === 'chair' ? home.seats.seat : home.seats.toast.seats[0];
      o.getWorldPosition(tmp);
      ctx.player.body.pos.set(tmp.x, b.at[1] + 1.05, tmp.z);
      ctx.player.body.vel.set(0, 0, 0);
    },
    /** This many flowers round her chair, as after a reload. */
    grow: (n: number) => {
      b.flowers = n;
      if (home) plantChairFlowers(ctx, home.seats);
    },
    /** This walk with her poles or without, whatever the day. */
    poles: (on: boolean) => {
      if (her) her.poles = on;
    },
    /** She stands here (relative to the house corner). */
    herTo: (dx: number, dz: number) => {
      if (!her || !b.at) return;
      her.pos.set(b.at[0] + dx, b.at[1] + 1, b.at[2] + dz);
      her.path = [];
    },
    /** As if she had stood here this many days longer. */
    age: (days: number) => {
      b.movedDay -= days;
    },
    moon: () => ctx.input.press('prompt:moon'),
    /** The party far from her, today a walking day: she comes along at the next check. */
    stroll: () => {
      b.met = true;
      b.strollDay = -1;
      ctx.save.day += ctx.save.day % 2 === 1 ? 0 : 1;
      strollCheck = 0;
      strollForce = true;
    },
    get strolling() {
      return stroll?.phase ?? null;
    },
    /** A tap on her. */
    tap: () => {
      if (her) tapped(ctx, her);
    },
    /** What she brought: as if she had just come back from a trip, gift not yet given today. */
    brought: () => {
      b.brought = true;
      b.giftDay = -1;
    },
    get presents() {
      return b.presents;
    },
    jukeboxTap: () => {
      jukeboxOn = !jukeboxOn;
    },
    get jukebox() {
      return jukeboxOn;
    },
    /** The night's next salvo now. */
    salvo: () => {
      fireworkT = 0;
    },
    hurt: () => {
      ctx.player.hearts = 1;
      storkAt = 0;
    },
    /** Where she is on screen (px), to tap her. */
    get screen() {
      return onScreen(ctx, tapAt);
    },
    /** Where her kitchen table is on screen (px). */
    get tableScreen() {
      return home ? onScreen(ctx, home.table.tap!.at) : null;
    },
  };
}

export function updateBabusia(ctx: Ctx, dt: number): void {
  if (job) runJob();
  if (!ctx.playing) return;
  const b = ctx.save.babusia;
  if (flight) {
    updateFlight(ctx, dt);
    if (flight) return;
  }
  // the game was closed mid-flight: the house stands at its new place, the party goes to its gate
  if (resumeAboard && !job && b.at && !b.moving) {
    resumeAboard = false;
    if (ctx.clock.t >= 0.6) ctx.clock.t = 0.02;
    for (const h of ctx.heroes.values()) h.hearts = HERO_STATS.maxHearts;
    jump(ctx);
  }
  checkT -= dt;
  if (checkT <= 0) {
    checkT = 2;
    // she comes once the prologue is done (an old save: at once, far from the party)
    if (!b.at && !job && ctx.save.tales.done.includes(PROLOGUE)) job = moveJob(ctx, ctx.player.pos.clone());
    updateGlades(ctx);
  }
  if (stork) flyStork(ctx, stork, dt);
  else {
    callStork(ctx);
    noteCheck -= dt;
    if (noteCheck <= 0) {
      noteCheck = 3;
      if (!stork) callNote(ctx);
    }
  }
  if (!home || !her || !b.at || b.moving) return;
  if (ctx.input.take('prompt:weather') && weatherAsk(ctx)) askWeather(ctx, her);
  const p = ctx.player.pos;
  if (stroll) {
    updateStroll(ctx, her, stroll, dt);
    return;
  }
  const far = Math.hypot(p.x - centre.x, p.z - centre.z) > BABUSIA.park;
  if (home.root.visible === far) {
    home.root.visible = !far;
    her.model.root.visible = !far;
    if (flowers) flowers.visible = !far;
    showYard(!far && b.host === 'olia');
    if (!far) beginAct(ctx, dayOf(ctx), true);
  }
  if (Math.hypot(p.x - centre.x, p.z - centre.z) > BABUSIA.strollAway) maybeStroll(ctx, her, dt);
  if (far) {
    jukeboxOn = false;
    setHouseSpeaker(null);
    return;
  }
  updateHome(ctx, home, dt);
  updateSeats(ctx, home.seats, host, dt);
  updateHer(ctx, her, dt);
  if (b.host === 'olia') updateYard(ctx, her.pos, her.act === 'feed', dt);
  talk(ctx, her, dt);
  night(ctx, dt);
  flyHint(ctx);
}
