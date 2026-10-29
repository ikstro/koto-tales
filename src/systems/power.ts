import * as THREE from 'three';
import type { PowerView } from '../assets/buildings';
import type { PowerCard } from '../content/buildings';
import { REACH, networks, tick, wires, type NetState, type PowerNode } from '../content/power';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { voice } from '../voice/voice';

/**
 * The power networks (DESIGN.md «Power», rules in content/power.ts). Every powered thing
 * in the world is a site: the kit's buildings (systems/kit.ts) and the lighthouses
 * near the hero (systems/landmarks.ts). Sites closer than REACH join by themselves;
 * the wires sag between them and sparks run along the ones that work. Four times a
 * second each network is balanced; its sites read the result from their `view`.
 */

export interface PowerSite {
  key: string;
  /** Where its wires hang from (world). */
  socket: THREE.Vector3;
  card: PowerCard;
  /** A battery's store (sparks × seconds); `keep` stores it back (the save). */
  charge: number;
  keep?: (charge: number) => void;
  /** Written by the networks: what the model shows. */
  view: PowerView;
}

export const offView = (): PowerView => ({ linked: false, on: false, low: false, charge: 0, sunYaw: SUN_YAW, sunUp: 0 });

/** The skin's sun stands to the upper left; the panels follow it as it swings a little over the day. */
const SUN_YAW = Math.atan2(-28, -6);
const TICK = 0.25;
const MAX_SEGS = 640;
const SEGS = 8;
const MAX_SPARKS = 80;
const LOW_EVERY = 60_000;

const sites = new Map<string, PowerSite>();
let order: PowerSite[] = [];
let nodes: PowerNode[] = [];
let nets: number[][] = [];
let states: NetState[] = [];
/** Wires as socket pairs, with the network each belongs to. */
let links: { a: THREE.Vector3; b: THREE.Vector3; net: number }[] = [];
let dirty = true;
let tickT = 0;
let t = 0;
let lastLow = -1e9;
let lastSolar = -1e9;

let wireMesh: THREE.InstancedMesh | null = null;
let sparkMesh: THREE.InstancedMesh | null = null;
let previewMesh: THREE.InstancedMesh | null = null;

export function addSite(s: PowerSite): void {
  sites.set(s.key, s);
  dirty = true;
}

export function removeSite(key: string): void {
  if (sites.delete(key)) dirty = true;
}

export function initPower(ctx: Ctx): void {
  const seg = new THREE.BoxGeometry(0.07, 0.07, 1);
  wireMesh = new THREE.InstancedMesh(seg, ctx.skin.partMaterial('#2e2a28'), MAX_SEGS);
  wireMesh.name = 'wires';
  wireMesh.count = 0;
  wireMesh.frustumCulled = false;
  ctx.scene.add(wireMesh);
  sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), ctx.skin.partMaterial('#ffd23a', { emissive: true }), MAX_SPARKS);
  sparkMesh.name = 'sparks';
  sparkMesh.count = 0;
  sparkMesh.frustumCulled = false;
  ctx.scene.add(sparkMesh);
  const ghost = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.55, depthWrite: false });
  previewMesh = new THREE.InstancedMesh(seg, ghost, SEGS);
  previewMesh.count = 0;
  previewMesh.frustumCulled = false;
  previewMesh.renderOrder = 5;
  ctx.scene.add(previewMesh);
  events.on('building:folded', () => (dirty = true));
  // For automated checks.
  (window as unknown as { __kotoPower: object }).__kotoPower = {
    get state() {
      return {
        sites: order.map((s) => ({ key: s.key, on: s.view.on, low: s.view.low, linked: s.view.linked, charge: +s.view.charge.toFixed(2) })),
        nets: states.map((s) => ({ ...s, give: +s.give.toFixed(2) })),
        wires: links.length,
        zones: lightZones(),
      };
    },
  };
}

/** A point along a sagging wire from a to b, k = 0..1. */
function along(a: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const sag = Math.min(0.9, 0.12 + 0.06 * a.distanceTo(b));
  return out.lerpVectors(a, b, k).setY(out.y - sag * 4 * k * (1 - k));
}

const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const mid = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const scl = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);
const dir = new THREE.Vector3();

/** Lays one wire into `mesh` from instance `i` on; returns the next free instance. */
function layWire(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3): number {
  for (let s = 0; s < SEGS && i < mesh.instanceMatrix.count; s++) {
    along(a, b, s / SEGS, pa);
    along(a, b, (s + 1) / SEGS, pb);
    mid.addVectors(pa, pb).multiplyScalar(0.5);
    dir.subVectors(pb, pa);
    const len = dir.length();
    q.setFromUnitVectors(FWD, dir.divideScalar(len || 1));
    scl.set(1, 1, len + 0.03);
    mesh.setMatrixAt(i++, m4.compose(mid, q, scl));
  }
  return i;
}

function rebuild(): void {
  dirty = false;
  order = [...sites.values()];
  nodes = order.map((s) => ({ x: s.socket.x, y: s.socket.y, z: s.socket.z, card: s.card, charge: s.charge }));
  nets = networks(nodes);
  states = nets.map(() => ({ give: 0, take: 0, on: false, low: false }));
  links = [];
  nets.forEach((net, n) => {
    for (const [i, j] of wires(nodes, net)) links.push({ a: order[i].socket, b: order[j].socket, net: n });
  });
  if (!wireMesh) return;
  let i = 0;
  for (const l of links) i = layWire(wireMesh, i, l.a, l.b);
  wireMesh.count = i;
  wireMesh.instanceMatrix.needsUpdate = true;
  tickT = 0;
}

/** Balances every network and tells its sites; speaks when a network lights up or runs short. */
function balance(ctx: Ctx): void {
  const day = ctx.clock.daylight;
  const sunYaw = SUN_YAW + (ctx.clock.t - 0.32) * 1.4;
  nets.forEach((net, n) => {
    const was = states[n];
    const st = tick(nodes, net, day, TICK);
    // nothing on it could ever give power (a lamp or a lighthouse on its own): just dark, not short
    if (!net.some((i) => nodes[i].card.give || nodes[i].card.solar || nodes[i].card.store)) st.low = false;
    states[n] = st;
    const linked = net.length > 1;
    for (const i of net) {
      const s = order[i];
      const v = s.view;
      v.linked = linked || (s.card.give ?? 0) > 0;
      v.on = st.on && v.linked;
      v.low = st.low;
      v.sunYaw = sunYaw;
      v.sunUp = day;
      if (s.card.store) {
        s.charge = nodes[i].charge;
        v.charge = s.charge / s.card.store;
        s.keep?.(s.charge);
      }
    }
    // before the heroes wake there is no one to hear (a village's heart is a site from the start)
    if (!ctx.playing || !ctx.player) return;
    const p = ctx.player.pos;
    const near = net.some((i) => Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z) < 24);
    if (st.on && st.take > 0 && !was.on && !ctx.save.said.includes('power_on')) {
      ctx.save.said.push('power_on');
      voice.say('power_on', { priority: 6 });
    }
    if (st.low && !was.low && near) {
      const now = performance.now();
      const solar = net.some((i) => nodes[i].card.solar) && day < 0.3;
      if (solar && now - lastSolar > LOW_EVERY * 2) {
        lastSolar = lastLow = now;
        voice.say('solar_night', { priority: 5 });
      } else if (now - lastLow > LOW_EVERY) {
        lastLow = now;
        voice.say('power_low', { priority: 5 });
      }
    }
  });
}

/** Where powered lights keep monsters away at night: working sites with a light. */
export function lightZones(): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const s of sites.values()) if (s.card.light && s.view.on) out.push({ x: s.socket.x, z: s.socket.z, r: s.card.light });
  return out;
}

/** Whether (x, z) is inside a working light at night. */
export function inLight(x: number, z: number): boolean {
  for (const s of sites.values()) if (s.card.light && s.view.on && Math.hypot(s.socket.x - x, s.socket.z - z) < s.card.light) return true;
  return false;
}

/**
 * While a building is being placed: see-through wires from where its socket would be to
 * what it would join (the nearest site in reach), or none. Returns whether it would join.
 */
export function previewWires(from: THREE.Vector3 | null): boolean {
  if (!previewMesh) return false;
  let best: PowerSite | null = null;
  let bd = Infinity;
  if (from) {
    for (const s of sites.values()) {
      const d = Math.hypot(s.socket.x - from.x, s.socket.z - from.z);
      if (d <= REACH && Math.abs(s.socket.y - from.y) <= 6 && d < bd) {
        bd = d;
        best = s;
      }
    }
  }
  previewMesh.count = from && best ? layWire(previewMesh, 0, from, best.socket) : 0;
  previewMesh.instanceMatrix.needsUpdate = true;
  return !!best;
}

export function updatePower(ctx: Ctx, dt: number): void {
  t += dt;
  if (dirty) rebuild();
  tickT -= dt;
  if (tickT <= 0) {
    tickT = TICK;
    balance(ctx);
  }
  // sparks run along the wires of working networks
  if (sparkMesh) {
    let k = 0;
    for (let i = 0; i < links.length && k < MAX_SPARKS; i++) {
      const l = links[i];
      if (!states[l.net]?.on) continue;
      along(l.a, l.b, (t * 0.7 + i * 0.37) % 1, pa);
      sparkMesh.setMatrixAt(k++, m4.makeTranslation(pa.x, pa.y, pa.z));
    }
    sparkMesh.count = k;
    sparkMesh.instanceMatrix.needsUpdate = true;
  }
}
