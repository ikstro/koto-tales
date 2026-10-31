import * as THREE from 'three';
import { CASTLE_CARDS } from '../content/castles';
import { SHOW_SECONDS, covers, netAt, signalNets, sweepChunks, type SignalNode } from '../content/signal';
import { RACE_CARDS } from '../content/villages';
import type { Ctx } from '../core/ctx';
import { setMapMarker } from '../ui/map';
import { music } from '../voice/music';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { chunkKey, chunkOf, exploredOf, squareAround } from './explore';
import { selectedBuilding, standingWhere, working, type Standing } from './kit';
import { ARRIVE, travelTo } from './travel';

/**
 * The signal (DESIGN.md «Signal»): Wi-Fi antennas whose zones touch make a signal net. Inside a
 * working zone the remote piece breathes; a tap plays a night show on the whole net — lights in
 * waves, the speakers on disco, fireworks over the antennas, monsters in the zones dance.
 * Transmitters are the child's own jump points on the big map. A working radar clears the map
 * around it in a sweep and finds the nearest place not yet discovered.
 */

/** A show under way: the antennas of its net (those still standing and working) and how long it has run. */
let show: { ants: Standing[]; nodes: SignalNode[]; all: number[]; t: number; pop: number } | null = null;
let nodes: SignalNode[] = [];
let nets: number[][] = [];
let antennas: Standing[] = [];
let scanT = 0;
let markT = 0;
const shown = new Set<Standing>();
const txMarks = new Set<string>();
const sweep = new WeakMap<Standing, { a: number; turns: number }>();
const SWEEP_TURN = 24;
const FOUND_NEAR = 24;
const FIREWORK = [0xffd23a, 0xe8463a, 0x8ff0e0, 0xee6a82, 0xffe3a3];
const tmp = new THREE.Vector3();

/** Whether a show is playing over (x, z): monsters there dance and do not bite. */
export function inShow(x: number, z: number): boolean {
  return !!show && covers(show.nodes, show.all, x, z);
}

function rescan(): void {
  antennas = standingWhere((c) => !!c.signal).filter(working);
  nodes = antennas.map((s) => ({ x: s.centre.x, z: s.centre.z, zone: s.card.signal!.zone }));
  nets = signalNets(nodes);
}

// ─── the show ────────────────────────────────────────────────────────────────

function startShow(ctx: Ctx, net: number[]): void {
  show = { ants: net.map((i) => antennas[i]), nodes: [], all: [], t: 0, pop: 0 };
  music.setShow(true);
  sfx.play('sticker', { pitch: 1.1 });
  ctx.player.model.play('cheer');
  voice.say('show_start', { priority: 8, interrupt: true });
}

function updateShow(ctx: Ctx, dt: number): void {
  if (!show) return;
  show.t += dt;
  // an antenna folded away or out of power takes its zone out of the show
  show.ants = show.ants.filter((s) => working(s));
  show.nodes = show.ants.map((s) => ({ x: s.centre.x, z: s.centre.z, zone: s.card.signal!.zone }));
  show.all = show.nodes.map((_, k) => k);
  const done = show.t >= SHOW_SECONDS || !show.ants.length;
  for (const s of standingWhere(() => true)) {
    const on = !done && covers(show.nodes, show.all, s.centre.x, s.centre.z);
    if (on) {
      s.extra.show = show.t;
      shown.add(s);
    } else if (shown.delete(s)) s.extra.show = undefined;
  }
  // fireworks over the antennas, a little faster as the show goes on
  show.pop -= dt;
  if (!done && show.pop <= 0) {
    const n = show.nodes[Math.floor(Math.random() * show.nodes.length)];
    const y = ctx.world.groundHeight(Math.floor(n.x), Math.floor(n.z));
    ctx.effects.firework(tmp.set(n.x + (Math.random() - 0.5) * 6, y + 7 + Math.random() * 3, n.z + (Math.random() - 0.5) * 6), FIREWORK[Math.floor(Math.random() * FIREWORK.length)]);
    sfx.play('poof', { pitch: 1.6 + Math.random() * 0.4, volume: 0.5 });
    show.pop = 0.9 - (show.t / SHOW_SECONDS) * 0.45;
  }
  if (done) {
    for (const s of shown) s.extra.show = undefined;
    shown.clear();
    // every speaker back to its own song (a tap on the console during the show is kept)
    music.setShow(false);
    show = null;
  }
}

// ─── transmitters ────────────────────────────────────────────────────────────

function transmitterMarks(ctx: Ctx): void {
  const seen = new Set<string>();
  for (const s of standingWhere((c) => !!c.jump)) {
    const id = `tx:${s.rec.x},${s.rec.z}`;
    seen.add(id);
    const on = working(s);
    setMapMarker(id, {
      pos: { x: s.centre.x, z: s.centre.z },
      icon: on ? 'map-transmitter' : 'map-transmitter-off',
      pointer: false,
      onTap: () => jump(ctx, s),
    });
  }
  for (const id of txMarks) if (!seen.has(id)) setMapMarker(id, null);
  txMarks.clear();
  for (const id of seen) txMarks.add(id);
}

/** A tap on a transmitter's mark: the party steps out onto its pad (travel steps ARRIVE ahead of what it is given). */
function jump(ctx: Ctx, s: Standing): void {
  if (s.folding) return;
  if (!working(s)) {
    sfx.play('click');
    voice.say('transmitter_off', { priority: 7, interrupt: true });
    return;
  }
  void travelTo(ctx, new THREE.Vector3(s.centre.x, s.centre.y, s.centre.z - ARRIVE), 0);
}

// ─── the radar ───────────────────────────────────────────────────────────────

interface Place {
  x: number;
  z: number;
  icon: string;
}

/** Villages, castles and lighthouses whose spot is still under the clouds, nearest to (x, z) first. */
function hidden(ctx: Ctx, x: number, z: number): Place[] {
  const ex = exploredOf(ctx.save);
  const out: Place[] = [];
  const unseen = (px: number, pz: number) => !ex.has(chunkOf(px), chunkOf(pz));
  for (const v of ctx.world.villages?.() ?? []) if (!ctx.save.villages[v.race]?.met && unseen(v.x, v.z)) out.push({ x: v.x + 0.5, z: v.z + 0.5, icon: RACE_CARDS[v.race].mark });
  for (const c of ctx.world.castles?.() ?? []) if (!ctx.save.castles[c.race]?.met && unseen(c.x, c.z)) out.push({ x: c.x + 0.5, z: c.z + 0.5, icon: CASTLE_CARDS[c.race].mark });
  for (const l of ctx.world.lighthousesNear?.(x, z, 320) ?? []) if (unseen(l.x, l.z)) out.push({ x: l.x + 0.5, z: l.z + 0.5, icon: 'map-lighthouse' });
  return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
}

/** The place the radar found that the party has not reached yet (kept in save.said as «rf:x,z» / «rv:x,z»). */
function openFind(ctx: Ctx): Place | null {
  for (let i = ctx.save.said.length - 1; i >= 0; i--) {
    const k = ctx.save.said[i];
    if (!k.startsWith('rf:')) continue;
    const [x, z, icon] = k.slice(3).split(',');
    if (ctx.save.said.includes(`rv:${x},${z}`)) return null;
    return { x: +x, z: +z, icon };
  }
  return null;
}

function radars(ctx: Ctx, dt: number): void {
  const ex = exploredOf(ctx.save);
  for (const s of standingWhere((c) => !!c.scan)) {
    if (!working(s)) continue;
    let w = sweep.get(s);
    if (!w) sweep.set(s, (w = { a: 0, turns: 0 }));
    const from = w.a;
    w.a += (dt / SWEEP_TURN) * Math.PI * 2;
    ex.add(sweepChunks(s.centre.x, s.centre.z, s.card.scan!.radius, from, w.a).map(([cx, cz]) => chunkKey(cx, cz)));
    if (w.a < Math.PI * 2) continue;
    w.a -= Math.PI * 2;
    w.turns++;
    // each full turn: if nothing it found is still waiting, it finds the nearest hidden place
    if (openFind(ctx)) continue;
    const p = hidden(ctx, s.centre.x, s.centre.z)[0];
    if (!p) continue;
    ex.add(squareAround(chunkOf(p.x), chunkOf(p.z), 1));
    ctx.save.said.push(`rf:${Math.round(p.x)},${Math.round(p.z)},${p.icon}`);
    sfx.play('sticker', { pitch: 1.3 });
    voice.say('radar_found', { priority: 7 });
  }
  // the find keeps its arrow on the map until the party gets there
  const f = openFind(ctx);
  if (f && Math.hypot(ctx.player.pos.x - f.x, ctx.player.pos.z - f.z) < FOUND_NEAR) {
    ctx.save.said.push(`rv:${f.x},${f.z}`);
    setMapMarker('radar', null);
  } else setMapMarker('radar', f ? { pos: { x: f.x, z: f.z }, icon: f.icon, pointer: true } : null);
}

// ─── the loop ────────────────────────────────────────────────────────────────

export function initSignal(ctx: Ctx): void {
  // For automated checks.
  (window as unknown as { __kotoSignal: object }).__kotoSignal = {
    remote: () => ctx.input.press('prompt:remote'),
    /** As a tap on the i-th transmitter's mark. */
    jump: (i: number) => {
      const s = standingWhere((c) => !!c.jump)[i];
      if (s) jump(ctx, s);
    },
    get state() {
      return {
        nets: nets.map((n) => n.length),
        here: netAt(nodes, nets, ctx.player.pos.x, ctx.player.pos.z),
        show: show ? +show.t.toFixed(1) : null,
        find: openFind(ctx),
        marks: [...txMarks],
      };
    },
  };
}

export function updateSignal(ctx: Ctx, dt: number): void {
  scanT -= dt;
  if (scanT <= 0) {
    scanT = 0.5;
    rescan();
  }
  markT -= dt;
  if (markT <= 0) {
    markT = 0.5;
    transmitterMarks(ctx);
  }
  if (!ctx.playing) return;
  const p = ctx.player.pos;
  const here = netAt(nodes, nets, p.x, p.z);
  // the remote steps aside while a building is being placed (its ✕ sits in the same place)
  const can = !ctx.sleeping && !show && here >= 0 && !selectedBuilding() && !ctx.map.isOpen;
  ctx.hud.setRemote(can);
  if (ctx.input.take('prompt:remote') && can) startShow(ctx, nets[here]);
  updateShow(ctx, dt);
  if (!ctx.sleeping) radars(ctx, dt);
}
