import * as THREE from 'three';
import { createBoat, createBridge, createLighthouse, type LighthouseModel } from '../assets/buildings';
import { LIGHTHOUSE_POWER } from '../content/buildings';
import { SEA_LEVEL } from '../contracts';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { cutawayModel } from '../render/skins/cutaway';
import { setMapMarker } from '../ui/map';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { bridgeCells, LIGHTHOUSE_REGION, type BridgeSite, type LighthouseSite } from '../world/landmarks';
import { reserveCells } from './kit';
import { addSite, offView, removeSite, type PowerSite } from './power';

/**
 * The world's own landmarks near the hero (DESIGN.md «World»): lighthouses on the shores
 * and plank bridges across the rivers (where they stand: world/landmarks.ts). Their models
 * come and go with distance; a bridge's deck and a lighthouse's tower are invisible solid
 * cells. A lighthouse is a site in the power networks: brought power, it lights, sweeps
 * its beams over the water at night and keeps monsters off its shore; the first time,
 * a fanfare and a sticker. Lit ones are marks on the map, the nearest with an arrow; while
 * the kit box asks for a lighthouse, the nearest dark one gets the arrow.
 *
 * A model is built once and parked (out of the scene, its cells and power site taken out)
 * when the hero goes far; coming back puts it in again. Only the nearest few parked ones
 * are kept; farther ones are let go. Where lighthouses stand is worked out a region a
 * scan (world/landmarks.ts caches it), nearest first, so walking into new land never
 * works out a whole row of regions in one frame.
 */

const SHOW = 150;
const BRIDGE_SHOW = 110;
const MARKS = 320;
const SCAN = 1.5;
/** While regions wait to be worked out, the next scan comes this soon. */
const SCAN_SOON = 0.3;
const TOWER_H = 10;
const SEEN_AT = 30;
/** How many lighthouses and bridges are kept built (shown or parked); the farthest parked ones beyond go. */
const KEEP_TOWERS = 10;
const KEEP_BRIDGES = 20;

interface Lighthouse {
  site: LighthouseSite;
  model: LighthouseModel;
  boat: { root: THREE.Group; update(dt: number): void } | null;
  power: PowerSite;
  cells: [number, number, number][];
  shown: boolean;
}

interface Bridge {
  site: BridgeSite;
  root: THREE.Group;
  cells: [number, number, number][];
  shown: boolean;
}

const towers = new Map<string, Lighthouse>();
const bridges = new Map<string, Bridge>();
const reservedIds = new Set<string>();
/** Lighthouse regions already worked out (`rx,rz`). */
const regions = new Set<string>();
let marked = new Set<string>();
let scanT = 0;

const centreOf = (l: LighthouseSite) => new THREE.Vector3(l.x + 1.5, l.y, l.z + 1.5);

function buildTower(ctx: Ctx, l: LighthouseSite): Lighthouse {
  const model = createLighthouse(ctx.skin);
  const c = centreOf(l);
  model.root.position.copy(c);
  model.root.rotation.y = l.yaw;
  model.root.userData.casts = true;
  cutawayModel(model.root);
  let boat: Lighthouse['boat'] = null;
  if (l.boat) {
    boat = createBoat(ctx.skin);
    boat.root.position.set(l.boat[0], SEA_LEVEL + 1, l.boat[1]);
    boat.root.rotation.y = l.yaw + Math.PI / 2;
  }
  const cells: [number, number, number][] = [];
  for (let x = l.x; x < l.x + 3; x++) for (let z = l.z; z < l.z + 3; z++) for (let y = l.y; y < l.y + TOWER_H; y++) cells.push([x, y, z]);
  const power: PowerSite = {
    key: l.id,
    socket: model.socket.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, l.yaw).add(c),
    card: LIGHTHOUSE_POWER,
    charge: 0,
    view: offView(),
  };
  return { site: l, model, boat, power, cells, shown: false };
}

/** Into the scene, its tower solid, a fresh site in the power networks (dark until a network reaches it). */
function showTower(ctx: Ctx, t: Lighthouse): void {
  t.shown = true;
  ctx.scene.add(t.model.root);
  if (t.boat) ctx.scene.add(t.boat.root);
  for (const [x, y, z] of t.cells) ctx.world.setBarrier?.(x, y, z, true);
  t.power.charge = 0;
  t.power.view = offView();
  addSite(t.power);
}

function parkTower(ctx: Ctx, t: Lighthouse): void {
  t.shown = false;
  ctx.scene.remove(t.model.root);
  if (t.boat) ctx.scene.remove(t.boat.root);
  for (const [x, y, z] of t.cells) ctx.world.setBarrier?.(x, y, z, false);
  removeSite(t.power.key);
}

/**
 * A parked lighthouse let go: its own glowing parts (lamp, beams, halo: own materials and the
 * geometry made for them) are freed; the Kit's tower geometry and the skin's materials are shared.
 */
function disposeTower(t: Lighthouse): void {
  t.model.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material as THREE.Material | undefined;
    if (!mesh.isMesh || !mat?.userData.own) return;
    mesh.geometry.dispose();
    mat.dispose();
  });
}

function buildBridge(ctx: Ctx, b: BridgeSite): Bridge {
  const root = createBridge(ctx.skin, b.len);
  const along = b.len / 2;
  if (b.axis === 'x') root.position.set(b.x + along, b.y + 1, b.z + 0.5);
  else root.position.set(b.x + 0.5, b.y + 1, b.z + along);
  root.rotation.y = b.axis === 'x' ? Math.PI / 2 : 0;
  root.userData.casts = true;
  return { site: b, root, cells: bridgeCells(b), shown: false };
}

function showBridge(ctx: Ctx, b: Bridge, on: boolean): void {
  b.shown = on;
  if (on) ctx.scene.add(b.root);
  else ctx.scene.remove(b.root);
  for (const [x, y, z] of b.cells) ctx.world.setBarrier?.(x, y, z, on);
}

/** Keeps at most `cap` built: the farthest parked ones beyond it are let go. */
function trim<T extends { shown: boolean }>(kept: Map<string, T>, cap: number, dist: (t: T) => number, letGo: (t: T) => void): void {
  if (kept.size <= cap) return;
  const parked = [...kept].filter(([, t]) => !t.shown).sort((a, b) => dist(b[1]) - dist(a[1]));
  for (const [id, t] of parked.slice(0, kept.size - cap)) {
    letGo(t);
    kept.delete(id);
  }
}

/**
 * Lighthouses in the regions overlapping a square of `radius` around p, from the regions
 * worked out so far plus at most one new one (the nearest); the first scan, behind the
 * title, works them all out. Returns the sites and how many regions still wait.
 */
function lighthousesAround(ctx: Ctx, p: THREE.Vector3, radius: number): { all: LighthouseSite[]; waiting: number } {
  const R = LIGHTHOUSE_REGION;
  // a region's lighthouse: asking at its middle with radius 0 touches that region only
  const inRegion = (rx: number, rz: number) => ctx.world.lighthousesNear?.(rx * R + R / 2, rz * R + R / 2, 0)[0] ?? null;
  const all: LighthouseSite[] = [];
  const todo: { rx: number; rz: number; d: number }[] = [];
  for (let rz = Math.floor((p.z - radius) / R); rz <= Math.floor((p.z + radius) / R); rz++) {
    for (let rx = Math.floor((p.x - radius) / R); rx <= Math.floor((p.x + radius) / R); rx++) {
      if (!regions.has(`${rx},${rz}`)) {
        todo.push({ rx, rz, d: Math.hypot(rx * R + R / 2 - p.x, rz * R + R / 2 - p.z) });
        continue;
      }
      const l = inRegion(rx, rz);
      if (l) all.push(l);
    }
  }
  const now = regions.size === 0 ? todo : todo.sort((a, b) => a.d - b.d).slice(0, 1);
  for (const { rx, rz } of now) {
    regions.add(`${rx},${rz}`);
    const l = inRegion(rx, rz);
    if (l) all.push(l);
  }
  return { all, waiting: todo.length - now.length };
}

/** Keeps the kit off a landmark's ground (its footprint and a step around it). */
function reserve(id: string, cells: [number, number][]): void {
  if (reservedIds.has(id)) return;
  reservedIds.add(id);
  reserveCells(cells);
}

export function initLandmarks(ctx: Ctx): void {
  scanT = 0;
  (window as unknown as { __kotoLandmarks: object }).__kotoLandmarks = {
    near: (r = 300) => ctx.world.lighthousesNear?.(ctx.player.pos.x, ctx.player.pos.z, r) ?? [],
    bridges: (r = 200) => ctx.world.bridgesNear?.(ctx.player.pos.x, ctx.player.pos.z, r) ?? [],
    get lit() {
      return [...ctx.save.lit];
    },
    get shown() {
      return [...towers.values()].filter((t) => t.shown).map((t) => ({ id: t.site.id, on: t.power.view.on, low: t.power.view.low }));
    },
  };
}

/** Which lighthouses and bridges stand near the hero; the map's marks. */
function scan(ctx: Ctx): void {
  const p = ctx.playing ? ctx.player.pos : (ctx.house?.centre ?? ctx.camera.position);
  const world = ctx.world;
  const { all, waiting } = lighthousesAround(ctx, p, MARKS);
  if (waiting) scanT = Math.min(scanT, SCAN_SOON);
  const keep = new Set<string>();
  for (const l of all) {
    if (Math.hypot(l.x + 1.5 - p.x, l.z + 1.5 - p.z) > SHOW) continue;
    keep.add(l.id);
    let t = towers.get(l.id);
    if (!t) towers.set(l.id, (t = buildTower(ctx, l)));
    if (!t.shown) showTower(ctx, t);
    const cells: [number, number][] = [];
    for (let x = l.x - 1; x < l.x + 4; x++) for (let z = l.z - 1; z < l.z + 4; z++) cells.push([x, z]);
    reserve(l.id, cells);
  }
  for (const [id, t] of towers) if (t.shown && !keep.has(id)) parkTower(ctx, t);
  trim(towers, KEEP_TOWERS, (t) => Math.hypot(t.site.x - p.x, t.site.z - p.z), disposeTower);
  const keepB = new Set<string>();
  for (const b of world.bridgesNear?.(p.x, p.z, BRIDGE_SHOW) ?? []) {
    keepB.add(b.id);
    let k = bridges.get(b.id);
    if (!k) bridges.set(b.id, (k = buildBridge(ctx, b)));
    if (!k.shown) showBridge(ctx, k, true);
    reserve(b.id, bridgeCells(b).map(([x, , z]) => [x, z]));
  }
  for (const [id, b] of bridges) if (b.shown && !keepB.has(id)) showBridge(ctx, b, false);
  // a bridge owns nothing but its objects (the Kit's geometry and the skin's materials are shared)
  trim(bridges, KEEP_BRIDGES, (b) => Math.hypot(b.site.x - p.x, b.site.z - p.z), () => {});
  marks(ctx, all, p);
}

/** Lit lighthouses and dark ones already seen are marks; the nearest lit one (or the task's dark one) points the way. */
function marks(ctx: Ctx, all: LighthouseSite[], p: THREE.Vector3): void {
  const explored = new Set(ctx.save.explored);
  const lit = new Set(ctx.save.lit);
  const dist = (l: LighthouseSite) => Math.hypot(l.x + 1.5 - p.x, l.z + 1.5 - p.z);
  const seen = (l: LighthouseSite) => explored.has(`${Math.floor((l.x + 1) / 16)},${Math.floor((l.z + 1) / 16)}`);
  const task = ctx.save.progress.kind === 'lighthouse';
  const pick = (list: LighthouseSite[]) => list.reduce<LighthouseSite | null>((b, l) => (!b || dist(l) < dist(b) ? l : b), null);
  const nearestLit = pick(all.filter((l) => lit.has(l.id)));
  const target = task ? pick(all.filter((l) => !lit.has(l.id))) : null;
  const now = new Set<string>();
  for (const l of all) {
    const on = lit.has(l.id);
    if (!on && !seen(l) && l !== target) continue;
    now.add(l.id);
    setMapMarker(`lh:${l.id}`, {
      pos: { x: l.x + 1.5, z: l.z + 1.5 },
      icon: on ? 'map-lighthouse-lit' : 'map-lighthouse',
      pointer: l === target || (!target && l === nearestLit),
    });
  }
  for (const id of marked) if (!now.has(id)) setMapMarker(`lh:${id}`, null);
  marked = now;
}

/** The first time a lighthouse lights: a fanfare, a line, a sticker. */
function firstLight(ctx: Ctx, t: Lighthouse): void {
  ctx.save.lit.push(t.site.id);
  if (!ctx.save.found.includes('lighthouse')) ctx.save.found.push('lighthouse');
  const top = centreOf(t.site).setY(t.site.y + 8.5);
  ctx.effects.ring(centreOf(t.site), 0xffd23a, 4);
  ctx.effects.poof(top, 0xffd23a, 26);
  sfx.play('sticker');
  ctx.player.model.play('cheer');
  voice.say('lighthouse_lit', { priority: 8, interrupt: true });
  events.emit('lighthouse:lit', { id: t.site.id });
  scanT = 0;
}

export function updateLandmarks(ctx: Ctx, dt: number): void {
  scanT -= dt;
  if (scanT <= 0) {
    scanT = SCAN;
    scan(ctx);
  }
  const night = 1 - ctx.clock.daylight;
  for (const t of towers.values()) {
    if (!t.shown) continue;
    const v = t.power.view;
    t.model.update(dt, { lit: v.on, low: v.low, night });
    t.boat?.update(dt);
    // before the heroes wake (the title) the towers only stand there
    if (!ctx.playing || !ctx.player) continue;
    const p = ctx.player.pos;
    if (v.on && !ctx.save.lit.includes(t.site.id)) firstLight(ctx, t);
    if (!v.on && !ctx.save.said.includes('lighthouse_seen') && Math.hypot(t.site.x + 1.5 - p.x, t.site.z + 1.5 - p.z) < SEEN_AT) {
      ctx.save.said.push('lighthouse_seen');
      voice.say('lighthouse_seen', { priority: 6 });
    }
  }
}
