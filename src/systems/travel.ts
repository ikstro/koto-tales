import * as THREE from 'three';
import { placeOnGround } from '../actors/physics';
import { createPortal, type PortalModel } from '../assets/buildings';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { setMapMarker } from '../ui/map';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { B } from '../world/blocks';
import { reserveCells } from './kit';
import { hasAbility } from './progress';

/**
 * The portal pair (DESIGN.md «Portals»), the kit box's first gift. Far from home, a tap
 * on the house on the big map opens a portal right where the party stands and carries
 * them to the arch next to the house; the portal stays behind and is on the map. Walking
 * into the arch takes them back to it, walking into it takes them home. One field portal:
 * the next jump home moves it.
 */

interface Gate {
  model: PortalModel;
  /** Feet-level centre and the way its front faces. */
  pos: THREE.Vector3;
  yaw: number;
  /** A gate fires only after the hero has stood outside it for a moment. */
  armed: boolean;
  outFor: number;
  /** Opening spring (0 → 1). */
  open: number;
}

/** The arch stands in the front yard, left of the campfire, facing the camera. */
const ARCH = { dx: 0.5, dz: 9.5 };
/** How far in front of a gate (or a landing point) the party steps out. */
export const ARRIVE = 2.2;
/** Close to home there is no need to jump. */
const NEAR_HOME = 22;

let home: Gate | null = null;
let field: Gate | null = null;
let busy = false;

function gate(ctx: Ctx, pos: THREE.Vector3, yaw: number, open = 1): Gate {
  const model = createPortal(ctx.skin);
  model.root.position.copy(pos);
  model.root.rotation.y = yaw;
  model.root.userData.casts = true;
  ctx.scene.add(model.root);
  model.setOpen(open);
  return { model, pos: pos.clone(), yaw, armed: false, outFor: 0, open };
}

function buildArch(ctx: Ctx, fresh: boolean): void {
  if (home || !ctx.house) return;
  const o = ctx.house.origin;
  const x = o.x + ARCH.dx;
  const z = o.z + ARCH.dz;
  const y = ctx.world.groundHeight(Math.floor(x), Math.floor(z));
  home = gate(ctx, new THREE.Vector3(x, y, z), 0, fresh ? 0 : 1);
  if (fresh) ctx.effects.poof(home.pos.clone().setY(y + 1.5), 0xffd23a, 24);
}

function placeField(ctx: Ctx, at: { x: number; y: number; z: number; yaw: number }, fresh: boolean): void {
  if (field) ctx.scene.remove(field.model.root);
  field = gate(ctx, new THREE.Vector3(at.x, at.y, at.z), at.yaw, fresh ? 0 : 1);
  setMapMarker('portal', { pos: field.pos, icon: 'map-portal', pointer: false, onTap: () => void through(ctx, 'field') });
}

/** After the map has started: the arch (once the portal is given), the field portal, the map taps. */
export function initPortals(ctx: Ctx): void {
  if (ctx.house) {
    // the arch's ground stays free of buildings
    const o = ctx.house.origin;
    const cells: [number, number][] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 3; dz++) cells.push([Math.floor(o.x + ARCH.dx) + dx, Math.floor(o.z + ARCH.dz) + dz]);
    reserveCells(cells);
    setMapMarker('home', { pos: ctx.house.centre, icon: 'map-house', pointer: true, onTap: () => tapHome(ctx) });
  }
  if (hasAbility(ctx, 'portal')) {
    buildArch(ctx, false);
    if (ctx.save.portal) placeField(ctx, ctx.save.portal, false);
  }
  events.on('kit:reward', ({ id }) => {
    if (id === 'portal') buildArch(ctx, true);
  });
  (window as unknown as { __kotoPortal: object }).__kotoPortal = {
    home: () => tapHome(ctx),
    back: () => through(ctx, 'home'),
    get state() {
      return { arch: home?.pos.toArray() ?? null, field: field?.pos.toArray() ?? null, busy };
    },
  };
}

function tapHome(ctx: Ctx): void {
  if (!ctx.house || busy) return;
  if (!hasAbility(ctx, 'portal')) {
    voice.say('portal_soon', { priority: 7, interrupt: true });
    return;
  }
  const p = ctx.player.pos;
  if (Math.hypot(p.x - ctx.house.centre.x, p.z - ctx.house.centre.z) < NEAR_HOME) return;
  void jumpHome(ctx);
}

/** Opens a portal where the party stands, steps in, and comes out of the arch. */
async function jumpHome(ctx: Ctx): Promise<void> {
  busy = true;
  const p = ctx.player.pos;
  // the portal opens right under the hero, facing the camera; coming back you step out in front of it
  const y = ctx.world.groundHeight(Math.floor(p.x), Math.floor(p.z));
  const at = { x: p.x, y, z: p.z - 0.3, yaw: 0 };
  ctx.save.portal = at;
  placeField(ctx, at, true);
  sfx.play('switch');
  await wait(700);
  await travel(ctx, home!);
  busy = false;
}

/** Walks through a gate to its pair. */
async function through(ctx: Ctx, from: 'home' | 'field'): Promise<void> {
  if (busy || !home || !field) return;
  busy = true;
  await travel(ctx, from === 'home' ? field : home);
  busy = false;
}

/** Takes the party to stand in front of a place (a village's portal), as through a gate. */
export async function travelTo(ctx: Ctx, pos: THREE.Vector3, yaw: number): Promise<void> {
  if (busy) return;
  busy = true;
  await travel(ctx, { pos, yaw });
  busy = false;
}

/** The arch next to the house, once the box has given the portal. */
export function homeGate(): { pos: THREE.Vector3; yaw: number } | null {
  return home;
}

/** Fade out, move the party in front of `to`, let the world load, fade in. */
async function travel(ctx: Ctx, to: { pos: THREE.Vector3; yaw: number }): Promise<void> {
  if (ctx.sleeping) return;
  ctx.sleeping = true;
  sfx.play('switch', { pitch: 0.8 });
  await ctx.hud.fade(true);
  const fx = Math.sin(to.yaw);
  const fz = Math.cos(to.yaw);
  let tx = to.pos.x + fx * ARRIVE;
  let tz = to.pos.z + fz * ARRIVE;
  // in front of the gate is a wall or water: step out of its back instead
  const g = ctx.world.groundHeight(Math.floor(tx), Math.floor(tz));
  if (Math.abs(g - to.pos.y) > 1 || ctx.world.isWater(Math.floor(tx), g, Math.floor(tz)) || ctx.world.getBlock(Math.floor(tx), g - 1, Math.floor(tz)) === B.LEAVES) {
    tx = to.pos.x - fx * ARRIVE;
    tz = to.pos.z - fz * ARRIVE;
  }
  let i = 0;
  for (const h of ctx.heroes.values()) {
    const side = h === ctx.player ? 0 : i++ === 0 ? -1 : 1;
    placeOnGround(ctx.world, h.body, tx + side * 1.1, tz + (side ? 0.6 : 0));
    h.yaw = to.yaw;
    h.invulnerable = Math.max(h.invulnerable, 2);
    h.syncModel(0);
  }
  // monsters that were around the far end have wandered off
  for (const m of ctx.monsters) if (Math.hypot(m.pos.x - tx, m.pos.z - tz) < 14) m.alive = false;
  if (home) home.armed = false;
  if (field) field.armed = false;
  events.emit('hero:teleport', {});
  const t0 = performance.now();
  while (!ctx.world.isIdle?.() && performance.now() - t0 < 1500) await wait(60);
  await ctx.hud.fade(false);
  sfx.play('wake');
  ctx.sleeping = false;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function inGate(g: { pos: THREE.Vector3; yaw: number }, p: THREE.Vector3): boolean {
  const dx = p.x - g.pos.x;
  const dz = p.z - g.pos.z;
  // into the gate's own axes
  const lx = Math.cos(g.yaw) * dx - Math.sin(g.yaw) * dz;
  const lz = Math.sin(g.yaw) * dx + Math.cos(g.yaw) * dz;
  return Math.abs(lx) < 0.95 && Math.abs(lz) < 0.5 && p.y > g.pos.y - 0.6 && p.y < g.pos.y + 2;
}

export function updatePortals(ctx: Ctx, dt: number): void {
  for (const g of [home, field]) {
    if (!g) continue;
    g.open = Math.min(1, g.open + dt * 1.8);
    // a little overshoot as it opens
    const k = g.open < 1 ? 1 - Math.cos(g.open * Math.PI * 1.25) * (1 - g.open) * 0.6 - (1 - g.open) * 0.4 : 1;
    g.model.setOpen(Math.max(0, k));
    g.model.update(dt);
    if (!ctx.playing || ctx.sleeping || busy) continue;
    const inside = inGate(g, ctx.player.pos);
    if (!inside) {
      g.outFor += dt;
      if (g.outFor > 0.3) g.armed = true;
    } else g.outFor = 0;
    if (inside && g.armed && home && field) void through(ctx, g === home ? 'home' : 'field');
  }
}
