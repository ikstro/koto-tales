import * as THREE from 'three';
import type { IWorld } from '../contracts';
import { overlapsBlock } from '../actors/physics';
import { breatheGhost, createBuilding, createGhost, type BuildingModel, type BuildingTick } from '../assets/buildings';
import { BUILDINGS, KIT_ORDER, type BuildingCard, type BuildingId } from '../content/buildings';
import { MAX_LEVEL, upgraded } from '../content/upgrades';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { cutawayModel } from '../render/skins/cutaway';
import { music } from '../voice/music';
import { addSite, offView, previewWires, removeSite, type PowerSite } from './power';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { B } from '../world/blocks';
import type { PlacedBuilding } from './save';

/**
 * The kit of ready-made buildings (DESIGN.md «Kit»). The child picks a building in the
 * kit plate; a see-through ghost of it walks along in front of the hero, always on a
 * free spot nearby; ✓ puts it up. Standing next to one of their buildings, a «fold»
 * piece breathes: a tap packs it back into the box. The ground is never changed: a
 * building stands on its own plinth where the ground is uneven, and its solid parts
 * are invisible barrier cells (World.setBarrier). Buildings face the camera, like toys
 * set out on a table.
 */

/** A spot for a building: footprint min corner, the floor height, quarter turns, the lowest ground under it. */
export interface Spot {
  x: number;
  z: number;
  y: number;
  rot: number;
  low: number;
}

type GroundView = Pick<IWorld, 'groundHeight' | 'getBlock' | 'isWater' | 'isSolid'>;

/** Ground a building may stand on: not water, not a tree crown or trunk. */
const SOFT = new Set<number>([B.WATER, B.LEAVES, B.LOG]);

/**
 * The nearest free spot for a `w × d` footprint around the point in front of the hero at
 * (fx, fz, feet fy) along `yaw`. Uneven ground is fine by one block (a plinth fills it); the
 * floor stays within two blocks of the hero's feet (not down a cliff, not up on a hill).
 */
export function findSpot(world: GroundView, size: [number, number], fx: number, fz: number, fy: number, yaw: number, blocked: (x: number, z: number) => boolean): Spot | null {
  const [w, d] = size;
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  const ahead = (Math.abs(fwdX) * w + Math.abs(fwdZ) * d) / 2 + 1;
  const cx = fx + fwdX * ahead;
  const cz = fz + fwdZ * ahead;
  const bx = Math.round(cx - w / 2);
  const bz = Math.round(cz - d / 2);
  const tries: [number, number, number][] = [];
  for (let oz = -5; oz <= 5; oz++) for (let ox = -5; ox <= 5; ox++) tries.push([bx + ox, bz + oz, Math.hypot(bx + ox + w / 2 - cx, bz + oz + d / 2 - cz)]);
  tries.sort((a, b) => a[2] - b[2]);
  for (const [x0, z0] of tries) {
    let lo = Infinity;
    let hi = -Infinity;
    let ok = true;
    for (let x = x0; x < x0 + w && ok; x++) {
      for (let z = z0; z < z0 + d && ok; z++) {
        const g = world.groundHeight(x, z);
        if (g <= 0 || blocked(x, z) || SOFT.has(world.getBlock(x, g - 1, z)) || world.isWater(x, g, z)) ok = false;
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
    if (ok && hi - lo <= 1 && Math.abs(hi - fy) <= 2) return { x: x0, z: z0, y: hi, rot: 0, low: lo };
  }
  return null;
}

/**
 * Where the party lands for a tap at (x, z) on the map (the flying saucer): the nearest cell
 * (within `radius`) with dry ground that is not a tree and not `blocked` (the house), returned as
 * its centre and floor height.
 */
export function landingSpot(
  world: Pick<IWorld, 'groundHeight' | 'getBlock' | 'isWater' | 'isSolid'>,
  x: number,
  z: number,
  blocked: (x: number, z: number) => boolean = () => false,
  radius = 12,
): { x: number; y: number; z: number } | null {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const cells: [number, number, number][] = [];
  for (let oz = -radius; oz <= radius; oz++) for (let ox = -radius; ox <= radius; ox++) if (ox * ox + oz * oz <= radius * radius) cells.push([bx + ox, bz + oz, Math.hypot(bx + ox + 0.5 - x, bz + oz + 0.5 - z)]);
  cells.sort((a, b) => a[2] - b[2]);
  for (const [cx, cz] of cells) {
    const g = world.groundHeight(cx, cz);
    if (g <= 0 || blocked(cx, cz)) continue;
    if (SOFT.has(world.getBlock(cx, g - 1, cz)) || world.isWater(cx, g, cz)) continue;
    // a building's walls (the child's, a lighthouse)
    if (world.isSolid(cx, g, cz) || world.isSolid(cx, g + 1, cz)) continue;
    return { x: cx + 0.5, y: g, z: cz + 0.5 };
  }
  return null;
}

/** The cell right in front of the hero for a lantern: at the feet, stacking up a wall to two high. */
function lanternSpot(ctx: Ctx): Spot | null {
  const p = ctx.player.pos;
  const dx = Math.sin(ctx.player.yaw);
  const dz = Math.cos(ctx.player.yaw);
  const sx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
  const sz = sx === 0 ? Math.sign(dz) : 0;
  const x = Math.floor(p.x) + sx;
  const z = Math.floor(p.z) + sz;
  const feet = Math.floor(p.y + 0.01);
  let y = feet;
  while (ctx.world.isSolid(x, y, z) && y < feet + 3) y++;
  if (y > feet + 2 || occupied(ctx, x, y, z) || blockedCell(ctx, x, z)) return null;
  return { x, z, y, rot: 0, low: y };
}

/** A hero stands (partly) on this cell: a building dropped there would lift them onto its roof. */
function underHero(ctx: Ctx, x: number, z: number): boolean {
  for (const h of ctx.heroes.values()) {
    const r = h.body.radius + 0.15;
    if (h.pos.x + r > x && h.pos.x - r < x + 1 && h.pos.z + r > z && h.pos.z - r < z + 1) return true;
  }
  return false;
}

function occupied(ctx: Ctx, x: number, y: number, z: number): boolean {
  for (const h of ctx.heroes.values()) if (overlapsBlock(h.body, x, y, z)) return true;
  for (const m of ctx.monsters) if (m.alive && overlapsBlock(m.body, x, y, z)) return true;
  return false;
}

// ─── buildings standing in the world ────────────────────────────────────────

export interface Standing {
  rec: PlacedBuilding;
  card: BuildingCard;
  model: BuildingModel | null;
  /** Feet-level centre of the footprint. */
  centre: THREE.Vector3;
  /** Seconds since it went up (the drop-in), or since folding began (negative). */
  age: number;
  folding: boolean;
  /** Its place in the power networks, if it has one. */
  site: PowerSite | null;
  /** What other systems tell its model (a traffic light's colour, a tesla's strike). */
  extra: Partial<BuildingTick>;
}

const standing: Standing[] = [];
/** Cells kept free for the portal arch next to the house (systems/travel.ts sets them). */
const reserved = new Set<string>();
let selected: BuildingId | null = null;
let auto = false;
let ghost: THREE.Group | null = null;
let ghostId: BuildingId | null = null;
let spot: Spot | null = null;
let spotTimer = 0;
let lastNoSpace = -1e9;
let ghostWas = false;
let t = 0;

const dims = (card: BuildingCard, rot: number): [number, number] => (rot % 2 ? [card.size[1], card.size[0]] : card.size);

const DEFAULT_SOCKET = new THREE.Vector3(0, 2.4, 0);

/** A model-space point of a building standing at `centre`, turned `rot` quarter turns, in the world. */
function worldPoint(local: THREE.Vector3, centre: THREE.Vector3, rot: number): THREE.Vector3 {
  return local.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (rot * Math.PI) / 2).add(centre);
}

let siteN = 0;
function siteFor(ctx: Ctx, rec: PlacedBuilding, card: BuildingCard, model: BuildingModel, centre: THREE.Vector3): PowerSite | null {
  if (!card.power) return null;
  const socket = worldPoint(model.socket ?? DEFAULT_SOCKET, centre, rec.rot);
  return {
    key: `k${siteN++}`,
    socket,
    card: card.power,
    charge: rec.charge ?? 0,
    keep: card.power.store ? (c) => (rec.charge = Math.round(c)) : undefined,
    view: offView(),
  };
}

function footprint(s: Standing): [number, number, number, number] {
  const [w, d] = dims(s.card, s.rec.rot);
  return [s.rec.x, s.rec.z, s.rec.x + w, s.rec.z + d];
}

export function reserveCells(cells: [number, number][]): void {
  for (const [x, z] of cells) reserved.add(`${x},${z}`);
}

/** The house, other buildings and the portal keep their ground. */
function blockedCell(ctx: Ctx, x: number, z: number): boolean {
  const f = ctx.house?.footprint;
  if (f && x >= f.x0 - 1 && x < f.x1 + 1 && z >= f.z0 - 1 && z < f.z1 + 1) return true;
  if (reserved.has(`${x},${z}`)) return true;
  for (const s of standing) {
    // the robot walks about: its cell is never kept
    if (s.folding || s.card.follow) continue;
    const [x0, z0, x1, z1] = footprint(s);
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return true;
  }
  return false;
}

function barrierCells(s: Standing): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const c of s.card.solid) for (let k = 0; k < c.h; k++) out.push([s.rec.x + c.dx, s.rec.y + k, s.rec.z + c.dz]);
  return out;
}

/** Uneven ground: a plinth of teal plates under the whole footprint (replaces the old one after a move). */
function fitPlinth(ctx: Ctx, s: Standing): void {
  const root = s.model!.root;
  const old = root.getObjectByName('plinth');
  if (old) root.remove(old);
  const { rec } = s;
  const [w, d] = dims(s.card, rec.rot);
  let lowest = rec.y;
  for (let x = rec.x; x < rec.x + w; x++) for (let z = rec.z; z < rec.z + d; z++) lowest = Math.min(lowest, ctx.world.groundHeight(x, z));
  if (lowest >= rec.y) return;
  const h = rec.y - lowest;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ctx.skin.partMaterial('#2f918b'));
  plinth.name = 'plinth';
  plinth.position.y = -h / 2;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  root.add(plinth);
}

function raise(ctx: Ctx, rec: PlacedBuilding, fresh: boolean): Standing {
  const level = ctx.save.upgrades[rec.id] ?? 0;
  const card = upgraded(BUILDINGS[rec.id], level);
  const [w, d] = dims(card, rec.rot);
  const centre = new THREE.Vector3(rec.x + w / 2, rec.y, rec.z + d / 2);
  if (card.block !== undefined) centre.set(rec.x + 0.5, rec.y, rec.z + 0.5);
  const s: Standing = { rec, card, model: null, centre, age: fresh ? 0 : 99, folding: false, site: null, extra: level ? { level } : {} };
  if (card.block === undefined) {
    const model = createBuilding(ctx.skin, rec.id);
    model.root.position.copy(centre);
    model.root.rotation.y = (rec.rot * Math.PI) / 2;
    model.root.userData.casts = true;
    cutawayModel(model.root);
    s.model = model;
    if (!card.follow) fitPlinth(ctx, s);
    ctx.scene.add(model.root);
    for (const [x, y, z] of barrierCells(s)) ctx.world.setBarrier?.(x, y, z, true);
    s.site = siteFor(ctx, rec, card, model, centre);
    if (s.site) addSite(s.site);
  }
  standing.push(s);
  return s;
}

/** Puts the save's buildings back up (on start). */
export function initKit(ctx: Ctx): void {
  // the doorstep and the campfire stay free: the way into the house is never blocked
  const c = ctx.house?.campfire.root.position;
  if (c) for (let dx = -2; dx <= 2; dx++) for (let dz = -3; dz <= 2; dz++) reserved.add(`${Math.floor(c.x) + dx},${Math.floor(c.z) + dz}`);
  // the world moved (a river now flows there, the ground rose over the floor or fell away,
  // a village stands there now, the house grew over it): back into the box
  ctx.save.placed = ctx.save.placed.filter((rec) => {
    const card = BUILDINGS[rec.id];
    if (onHouse(ctx, rec)) {
      ctx.save.kit[rec.id] = (ctx.save.kit[rec.id] ?? 0) + 1;
      return false;
    }
    // the robot is out with the party wherever it stood (systems/prizes.ts brings it along)
    if (card.block !== undefined || card.follow || (standsOk(ctx, rec) && !onReserved(rec))) return true;
    ctx.save.kit[rec.id] = (ctx.save.kit[rec.id] ?? 0) + 1;
    return false;
  });
  for (const rec of ctx.save.placed) raise(ctx, rec, false);
  pushHud(ctx);
  // For automated checks.
  (window as unknown as { __kotoKit: object }).__kotoKit = {
    pick: (id: BuildingId) => pick(ctx, id),
    place: () => ctx.input.press('kit:place'),
    fold: () => ctx.input.press('prompt:fold'),
    add: (id: BuildingId, n = 1) => addToKit(ctx, id, n),
    /** One more into the box; with `place`, chosen and put up in front of the hero at once. */
    raise: (id: BuildingId) => raiseLevel(ctx, id),
    /** Puts the player just in front of the first standing building of this kind. */
    to: (id: BuildingId) => {
      const s = standing.find((b) => b.rec.id === id);
      if (!s) return;
      const a = (s.rec.rot * Math.PI) / 2;
      const k = s.card.size[1] / 2 + 0.8;
      ctx.player.body.pos.set(s.centre.x + Math.sin(a) * k, s.centre.y + 0.1, s.centre.z + Math.cos(a) * k);
    },
    give: (id: BuildingId, place = false) => {
      addToKit(ctx, id, 1);
      if (place) {
        pick(ctx, id);
        ctx.input.press('kit:place');
      }
    },
    get state() {
      return { selected, spot, kit: { ...ctx.save.kit }, placed: ctx.save.placed.map((p) => ({ ...p })) };
    },
  };
}

/** Whether a saved building still has dry ground under it, no higher than its floor and not fallen away (a plinth fills one step). */
export function standsOk(world: Pick<IWorld, 'groundHeight' | 'isWater'> | Ctx, rec: PlacedBuilding): boolean {
  const w = 'world' in world ? world.world : world;
  const [sw, sd] = dims(BUILDINGS[rec.id], rec.rot);
  let top = -Infinity;
  for (let x = rec.x; x < rec.x + sw; x++) {
    for (let z = rec.z; z < rec.z + sd; z++) {
      const g = w.groundHeight(x, z);
      if (g > rec.y || w.isWater(x, g, z) || w.isWater(x, g - 1, z)) return false;
      top = Math.max(top, g);
    }
  }
  return top >= rec.y - 1;
}

/** A saved building under the house or right against its walls (an old save's house grew bigger). */
function onHouse(ctx: Ctx, rec: PlacedBuilding): boolean {
  const f = ctx.house?.footprint;
  if (!f || BUILDINGS[rec.id].follow) return false;
  const [sw, sd] = dims(BUILDINGS[rec.id], rec.rot);
  return rec.x < f.x1 + 1 && rec.x + sw > f.x0 - 1 && rec.z < f.z1 + 1 && rec.z + sd > f.z0 - 1;
}

/** A saved building on ground kept for something else (a village's houses). */
function onReserved(rec: PlacedBuilding): boolean {
  const [sw, sd] = dims(BUILDINGS[rec.id], rec.rot);
  for (let x = rec.x; x < rec.x + sw; x++) for (let z = rec.z; z < rec.z + sd; z++) if (reserved.has(`${x},${z}`)) return true;
  return false;
}

/** How many of a building the child owns (in the box and standing). */
export function owned(ctx: Ctx, id: BuildingId): number {
  return (ctx.save.kit[id] ?? 0) + ctx.save.placed.filter((p) => p.id === id).length;
}

/** One more of a building in the box (a reward). */
export function addToKit(ctx: Ctx, id: BuildingId, n = 1): void {
  ctx.save.kit[id] = (ctx.save.kit[id] ?? 0) + n;
  pushHud(ctx);
  ctx.hud.kitBump();
}

/** A reward raised a building a level: every one standing gets better at once (its card, its power, its look). */
export function raiseLevel(ctx: Ctx, id: BuildingId): void {
  const level = Math.min(MAX_LEVEL, (ctx.save.upgrades[id] ?? 0) + 1);
  ctx.save.upgrades[id] = level;
  for (const s of standing) {
    if (s.rec.id !== id) continue;
    s.card = upgraded(BUILDINGS[id], level);
    s.extra.level = level;
    if (s.site && s.card.power) {
      s.site.card = s.card.power;
      addSite(s.site);
    }
  }
  pushHud(ctx);
}

/** The kit plate's pieces (only what the child has: in the box or standing) and the build button's look. */
export function pushHud(ctx: Ctx): void {
  ctx.hud.setKitItems(
    KIT_ORDER.filter((id) => BUILDINGS[id].count === null || owned(ctx, id) > 0).map((id) => {
      const card = BUILDINGS[id];
      return { id, sprite: card.sprite, count: card.count === null ? null : (ctx.save.kit[id] ?? 0), level: ctx.save.upgrades[id] ?? 0 };
    }),
  );
  ctx.hud.setKitMode(selected);
}

/** The child chose a building in the kit plate (or the boss suggests the lantern). */
export function pick(ctx: Ctx, id: BuildingId | null, byBoss = false): void {
  if (id && BUILDINGS[id].count !== null && (ctx.save.kit[id] ?? 0) <= 0) {
    sfx.play('click');
    return;
  }
  selected = id;
  auto = byBoss && id !== null;
  // never the last building's spot: this one's is found at once
  spot = null;
  if (id) findSpotNow(ctx);
  else ctx.hud.setKitReady(false);
  if (ghost && ghostId !== id) {
    ctx.scene.remove(ghost);
    ghost = null;
    ghostId = null;
  }
  if (id && !ghost) {
    ghost = createGhost(ctx.skin, id);
    ghostId = id;
    ghost.visible = false;
    ctx.scene.add(ghost);
  }
  ctx.hud.setKitMode(selected);
  ctx.hud.suggestKit(auto);
}

/** Where the chosen building would go now (the ghost walks there; ✓ puts it up there). */
function findSpotNow(ctx: Ctx): void {
  if (!selected) return;
  spotTimer = 0.12;
  const card = BUILDINGS[selected];
  spot =
    card.block !== undefined
      ? lanternSpot(ctx)
      : findSpot(ctx.world, card.size, ctx.player.pos.x, ctx.player.pos.z, ctx.player.pos.y, ctx.player.yaw, (x, z) => blockedCell(ctx, x, z) || underHero(ctx, x, z));
  ctx.hud.setKitReady(!!spot);
}

export function selectedBuilding(): BuildingId | null {
  return selected;
}

export function pickedByBoss(): boolean {
  return auto;
}

function place(ctx: Ctx): void {
  if (!selected) return;
  const card = BUILDINGS[selected];
  if (!spot) {
    sfx.play('click');
    if (performance.now() - lastNoSpace > 8000) {
      lastNoSpace = performance.now();
      voice.say('kit_nospace', { priority: 6, interrupt: true });
    }
    return;
  }
  const at = new THREE.Vector3();
  if (card.block !== undefined) {
    const { x, y, z } = spot;
    ctx.world.setBlock(x, y, z, card.block);
    ctx.save.placed.push({ id: card.id, x, y, z, rot: 0 });
    raise(ctx, ctx.save.placed[ctx.save.placed.length - 1], true);
    events.emit('block:placed', { x, y, z, id: card.block });
    ctx.effects.poof(at.set(x + 0.5, y + 0.5, z + 0.5), 0xffd54f, 8);
    // the next lantern goes on top or beside, never into this one
    findSpotNow(ctx);
  } else {
    const rec: PlacedBuilding = { id: card.id, x: spot.x, y: spot.y, z: spot.z, rot: spot.rot };
    ctx.save.placed.push(rec);
    ctx.save.kit[card.id] = Math.max(0, (ctx.save.kit[card.id] ?? 0) - 1);
    const s = raise(ctx, rec, true);
    ctx.effects.poof(at.copy(s.centre).setY(s.centre.y + 0.4), 0xffe3a3, 16);
    selected = null;
    if (ghost) {
      ctx.scene.remove(ghost);
      ghost = null;
      ghostId = null;
    }
    if (card.firstLine && !ctx.save.said.includes(card.firstLine)) {
      ctx.save.said.push(card.firstLine);
      voice.say(card.firstLine, { priority: 7, interrupt: true });
    }
    events.emit('building:placed', { id: card.id });
  }
  ctx.player.model.play('attack');
  sfx.play('place');
  setTimeout(() => sfx.play('place', { pitch: 1.25 }), 120);
  pushHud(ctx);
}

/** The building the hero stands next to, if any (the fold piece shows for it). */
export function nearestStanding(ctx: Ctx, only?: (c: BuildingCard) => boolean): Standing | null {
  const p = ctx.player.pos;
  let best: Standing | null = null;
  let bestD = Infinity;
  for (const s of standing) {
    // a saucer up in the air is not standing anywhere
    if (s.folding || s.extra.lift || (only && !only(s.card))) continue;
    const [w, d] = dims(s.card, s.rec.rot);
    const reach = Math.max(w, d) / 2 + 1.8;
    let dist = Math.hypot(p.x - s.centre.x, p.z - s.centre.z);
    if (s.card.follow) {
      // the robot walks behind the party: only when the hero walks up to it and faces it, and after any building
      const facing = (Math.sin(ctx.player.yaw) * (s.centre.x - p.x) + Math.cos(ctx.player.yaw) * (s.centre.z - p.z)) / Math.max(dist, 0.01);
      if (dist > 1.8 || facing < 0.6) continue;
      dist += 100;
    }
    if (dist < reach + (s.card.follow ? 100 : 0) && Math.abs(p.y - s.centre.y) < 2.5 && dist < bestD) {
      best = s;
      bestD = dist;
    }
  }
  return best;
}

/** The fold piece is offered next to the child's buildings, unless the child is placing one. */
export function canFold(ctx: Ctx): boolean {
  return !selected && nearestStanding(ctx) !== null;
}

function fold(ctx: Ctx): void {
  const s = nearestStanding(ctx);
  if (s) packAway(ctx, s);
}

/** Packs a standing building back into the box (the fold piece; a saucer with nowhere to land). */
export function packAway(ctx: Ctx, s: Standing): void {
  if (s.folding) return;
  s.folding = true;
  s.age = 0;
  const i = ctx.save.placed.indexOf(s.rec);
  if (i >= 0) ctx.save.placed.splice(i, 1);
  const at = s.centre.clone().setY(s.centre.y + 0.5);
  if (s.card.block !== undefined) {
    const { x, y, z } = s.rec;
    if (ctx.world.revertBlock) ctx.world.revertBlock(x, y, z);
    else ctx.world.setBlock(x, y, z, B.AIR);
    events.emit('block:broken', { x, y, z, id: s.card.block });
  } else {
    for (const [x, y, z] of barrierCells(s)) ctx.world.setBarrier?.(x, y, z, false);
    ctx.save.kit[s.card.id] = (ctx.save.kit[s.card.id] ?? 0) + 1;
    if (s.site) removeSite(s.site.key);
  }
  ctx.effects.poof(at, 0xffe3a3, 14);
  sfx.play('poof');
  ctx.hud.kitBump();
  pushHud(ctx);
  events.emit('building:folded', { id: s.card.id });
}

/** The nearest free spot for a building around (x, z) with the floor near `y`, by the kit's rules (around the point along `yaw`). */
export function spotNear(ctx: Ctx, id: BuildingId, x: number, z: number, y: number, yaw: number): Spot | null {
  return findSpot(ctx.world, BUILDINGS[id].size, x, z, y, yaw, (cx, cz) => blockedCell(ctx, cx, cz) || underHero(ctx, cx, cz));
}

/** Moves a standing building to a new spot (the saucer landing): barriers, plinth and save follow; it drops in again. */
export function relocate(ctx: Ctx, s: Standing, to: Spot): void {
  for (const [x, y, z] of barrierCells(s)) ctx.world.setBarrier?.(x, y, z, false);
  Object.assign(s.rec, { x: to.x, y: to.y, z: to.z, rot: to.rot });
  const [w, d] = dims(s.card, to.rot);
  s.centre.set(to.x + w / 2, to.y, to.z + d / 2);
  s.age = 0;
  if (s.model) {
    s.model.root.position.copy(s.centre);
    s.model.root.rotation.y = (to.rot * Math.PI) / 2;
    fitPlinth(ctx, s);
  }
  for (const [x, y, z] of barrierCells(s)) ctx.world.setBarrier?.(x, y, z, true);
}

/** Moves the walking robot: its feet at `pos` (the save keeps the cell it stands on). */
export function moveFollower(s: Standing, pos: THREE.Vector3, yaw: number): void {
  s.centre.copy(pos);
  s.rec.x = Math.floor(pos.x);
  s.rec.z = Math.floor(pos.z);
  s.rec.y = Math.round(pos.y);
  const root = s.model?.root;
  if (!root) return;
  root.position.x = pos.x;
  root.position.z = pos.z;
  root.rotation.y = yaw;
}

/** Whether a standing building works: up (not folding) and, if it needs power, its network has enough. */
export function working(s: Standing): boolean {
  return !s.folding && (!s.card.power || !!s.site?.view.on);
}

/** The child's buildings standing that match `only` (other systems drive them: disco, defence). */
export function standingWhere(only: (c: BuildingCard) => boolean): Standing[] {
  return standing.filter((s) => !s.folding && only(s.card));
}

/** Speakers that are playing: feet-level centres, how far they carry and how close monsters dance. */
export function playingSpeakers(): { centre: THREE.Vector3; hear: number; dance: number }[] {
  return standing.filter((s) => s.card.music && working(s)).map((s) => ({ centre: s.centre, hear: s.card.music!.hear, dance: s.card.music!.dance }));
}

/** How loud the speakers are at (x, z): 0 out of earshot; a big speaker close by goes past 1. */
export function musicLevel(x: number, z: number): number {
  let level = 0;
  for (const sp of playingSpeakers()) {
    const near = Math.min(1, Math.max(0, (sp.hear - Math.hypot(x - sp.centre.x, z - sp.centre.z)) / (sp.hear - 4)));
    level = Math.max(level, Math.pow(near, 1.3) * (sp.hear > MUSIC_BIG ? 1.25 : 1));
  }
  return level;
}
const MUSIC_BIG = 20;

/** Tents and tree houses standing (sleep spots away from home). */
export function tentNear(ctx: Ctx): Standing | null {
  return nearestStanding(ctx, (c) => !!c.sleep);
}

const DROP_FROM = 3;

export function updateKit(ctx: Ctx, dt: number): void {
  t += dt;
  if (ctx.input.take('kit:cancel')) pick(ctx, null);
  if (ctx.input.take('kit:place')) place(ctx);
  if (ctx.input.take('prompt:fold') && !selected) fold(ctx);

  // the ghost follows the hero on a free spot
  if (selected && ghost) {
    spotTimer -= dt;
    if (spotTimer <= 0) findSpotNow(ctx);
    ghost.visible = !!spot && ctx.playing && !ctx.sleeping;
    if (spot) {
      const [w, d] = dims(BUILDINGS[selected], spot.rot);
      const card = BUILDINGS[selected];
      const target = card.block !== undefined ? new THREE.Vector3(spot.x + 0.5, spot.y, spot.z + 0.5) : new THREE.Vector3(spot.x + w / 2, spot.y, spot.z + d / 2);
      ghost.position.lerp(target, ghost.position.distanceToSquared(target) > 9 ? 1 : 1 - Math.exp(-dt * 16));
      ghost.rotation.y = (spot.rot * Math.PI) / 2;
      // a powered building shows the wire it would hang to whatever is in reach
      previewWires(card.power && ghost.visible ? worldPoint((ghost.userData.socket as THREE.Vector3 | undefined) ?? DEFAULT_SOCKET, ghost.position, spot.rot) : null);
    } else previewWires(null);
    breatheGhost(t);
  } else if (ghostWas) previewWires(null);
  ghostWas = !!(selected && ghost);

  // standing buildings: drop in, fold away, play
  const beat = music.beat();
  const night = 1 - ctx.clock.daylight;
  const p = ctx.player.pos;
  const heard = musicLevel(p.x, p.z) > 0;
  const song = music.songIndex;
  const feet = [...ctx.heroes.values()].map((h) => h.pos);
  for (let i = standing.length - 1; i >= 0; i--) {
    const s = standing[i];
    s.age += dt;
    const root = s.model?.root;
    if (s.folding) {
      const k = Math.min(1, s.age / 0.35);
      if (root) root.scale.setScalar(Math.max(0.001, 1 - k * k));
      if (k >= 1) {
        if (root) ctx.scene.remove(root);
        standing.splice(i, 1);
      }
      continue;
    }
    if (root) {
      // falls in from above with a little bounce and a squash on landing
      const a = s.age;
      const fall = a < 0.6 ? DROP_FROM * Math.exp(-7 * a) * Math.cos(11 * a) : 0;
      root.position.y = s.centre.y + Math.max(0, fall);
      const squash = a < 0.6 ? Math.max(0, Math.sin(a * 22) * Math.exp(-8 * a)) * 0.12 : 0;
      root.scale.set(1 + squash, 1 - squash, 1 + squash);
      // a speaker plays when it works; the rest swing along when music is near
      const playing = s.card.music ? working(s) : heard;
      s.model!.update(dt, { beat, playing, night, power: s.site?.view, song, feet: s.card.floor ? feet : undefined, ...s.extra });
    }
  }
  music.update(dt, ctx.playing ? musicLevel(p.x, p.z) : 0, voice.isSpeaking());

  // a working engine-generator putts quietly, louder as the hero comes closer
  engineT -= dt;
  if (engineT <= 0 && ctx.playing) {
    engineT = 0.3;
    let d = ENGINE_HEAR;
    for (const s of standing) if (s.card.id === 'generator' && working(s)) d = Math.min(d, Math.hypot(p.x - s.centre.x, p.z - s.centre.z));
    if (d < ENGINE_HEAR) sfx.play('chug', { volume: 0.55 * (1 - d / ENGINE_HEAR) });
  }
}

const ENGINE_HEAR = 12;
let engineT = 0;
