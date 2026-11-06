import * as THREE from 'three';
import { Arrow, type Hero, type Monster } from '../actors/entities';
import { createFlowerField } from '../assets/babusia';
import { HERO_STATS } from '../content/heroes';
import { ITEMS, type ItemId } from '../content/items';
import { TALES } from '../content/tales';
import { bloomSpots, BLOOM, DRUM, drumAt, keyAt, pickSurprise, PIANO_NOTES, singAt, SURPRISE_PRICE } from '../content/gadgets';
import type { TapKind } from '../content/buildings';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { tappedAt } from '../ui/worldTap';
import { music } from '../voice/music';
import { bell, hiss, osc, pluck, sung } from '../voice/synth';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { giveItem } from './babusia';
import { damageMonster } from './combat';
import { moveFollower, standingWhere, working, type Standing } from './kit';
import { dropCoins } from './pickups';
import { addSite, chargeNetOf } from './power';
import { scanFar } from './signal';
import { tuneOf } from './tune';
import { nextWeather, weatherNow } from './weather';

/**
 * Бабуся's machines at work (DESIGN.md «Her gifts»): what a card's new words do. A bass cannon
 * and a fan throw monsters back; a toaster shoots; a bubble machine holds a monster for a moment;
 * a monster wash turns one into coins. A tap on the drums, the weather pad, the cinema, the
 * fireworks, the surprise machine or the telescope works it. On the karaoke's stage the party sings;
 * the piano path sounds underfoot; the bike makes power while a hero pedals; the scooter carries one;
 * a lightning rod fills batteries with the child's lightning; thick smoke hides the heroes; a pie
 * oven bakes one pie each morning; the magic can plants flowers.
 */

const PULSES = new WeakMap<Standing, number>();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const seat = new THREE.Vector3();

/** A tap counts this near the hero (blocks): on screen, within a few steps. */
const TAP_NEAR = 18;
/** On a bike or a scooter: seconds standing still before getting on. */
const STILL = 0.4;
const SEAT_NEAR = 0.8;
/** After one tap on these a second one waits (seconds). */
const COOL: Partial<Record<TapKind, number>> = { fireworks: 2.5, telescope: 20, surprise: 1.2, cinema: 1 };

const moving = (ctx: Ctx) => Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
const dist = (a: THREE.Vector3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);

/** The nearest monster this close that is neither dancing nor already waiting. */
function target(ctx: Ctx, s: Standing, reach: number, skip?: Set<Monster>): Monster | null {
  let best: Monster | null = null;
  let bd = reach;
  for (const m of ctx.monsters) {
    if (!m.alive || m.state === 'dance' || m.state === 'wait' || skip?.has(m)) continue;
    const d = dist(m.pos, s.centre.x, s.centre.z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

const acted = (s: Standing) => (s.extra.pulse = 0);

function ready(s: Standing, dt: number, every: number): boolean {
  const left = (PULSES.get(s) ?? 0) - dt;
  if (left > 0) {
    PULSES.set(s, left);
    return false;
  }
  PULSES.set(s, every);
  return true;
}

// ─── thrown back: a bass blow, a steady wind ─────────────────────────────────

function blasts(ctx: Ctx, dt: number): void {
  for (const s of standingWhere((c) => !!c.blast)) {
    if (!working(s)) continue;
    const b = s.card.blast!;
    if (!ready(s, dt, b.every)) continue;
    let hit = false;
    for (const m of ctx.monsters) {
      if (!m.alive || m.state === 'dance') continue;
      const dx = m.pos.x - s.centre.x;
      const dz = m.pos.z - s.centre.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > b.reach) continue;
      hit = true;
      m.stun = Math.max(m.stun, b.wind ? 0.25 : 0.6);
      m.body.vel.x += (dx / d) * b.push * (b.wind ? 1 - d / (b.reach + 2) : 1);
      m.body.vel.z += (dz / d) * b.push * (b.wind ? 1 - d / (b.reach + 2) : 1);
      if (!b.wind) m.body.vel.y = Math.max(m.body.vel.y, 5);
    }
    if (!hit) {
      // nothing near: it waits, ready to go the moment something comes
      PULSES.set(s, 0.2);
      continue;
    }
    if (b.wind) continue;
    acted(s);
    ctx.effects.ring(tmp.copy(s.centre).setY(s.centre.y + 0.2), 0xa66bff, b.reach);
    sfx.play('rumble', { volume: 0.7, pitch: 1.5 });
  }
}

// ─── a toast at the nearest monster ──────────────────────────────────────────

const toastGeo = new THREE.BoxGeometry(0.34, 0.34, 0.1);
const toastMat = new THREE.MeshBasicMaterial({ color: 0xd9a35c, toneMapped: false });

function turrets(ctx: Ctx, dt: number): void {
  for (const s of standingWhere((c) => !!c.turret)) {
    if (!working(s)) continue;
    const t = s.card.turret!;
    const m = target(ctx, s, t.reach);
    if (m) s.extra.aim = Math.atan2(m.pos.x - s.centre.x, m.pos.z - s.centre.z);
    if (!ready(s, dt, t.every)) continue;
    if (!m) {
      PULSES.set(s, 0.2);
      continue;
    }
    const from = tmp.copy(s.model?.tip ?? tmp2.set(0, 0.9, 0)).add(s.centre).clone();
    const to = tmp2.copy(m.pos).setY(m.pos.y + m.body.height * 0.5);
    const obj = new THREE.Mesh(toastGeo, toastMat);
    obj.position.copy(from);
    ctx.scene.add(obj);
    const a = new Arrow(obj, from);
    a.by = ctx.player;
    a.damage = HERO_STATS.arrowDamage * tuneOf(ctx).helperDamage;
    a.vel.subVectors(to, from).normalize().multiplyScalar(HERO_STATS.arrowSpeed * 0.8);
    a.vel.y += 1.6;
    ctx.arrows.push(a);
    acted(s);
    sfx.play('arrow', { pitch: 0.9, volume: 0.4 });
  }
}

// ─── a monster in a bubble ───────────────────────────────────────────────────

interface Held {
  m: Monster;
  left: number;
}
const held: Held[] = [];
const MAX_BUBBLES = 8;
let bubbles: THREE.InstancedMesh | null = null;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();

function bubbleMesh(ctx: Ctx): THREE.InstancedMesh {
  if (bubbles) return bubbles;
  const mat = new THREE.MeshBasicMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false });
  bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), mat, MAX_BUBBLES);
  bubbles.count = 0;
  bubbles.frustumCulled = false;
  ctx.scene.add(bubbles);
  return bubbles;
}

function bubblers(ctx: Ctx, dt: number): void {
  for (let i = held.length - 1; i >= 0; i--) {
    const h = held[i];
    h.left -= dt;
    if (h.left > 0 && h.m.alive) continue;
    held.splice(i, 1);
    if (h.m.alive) {
      ctx.effects.poof(tmp.copy(h.m.pos).setY(h.m.pos.y + 1), 0xbfeeff, 8);
      sfx.play('poof', { pitch: 1.8, volume: 0.5 });
    }
  }
  const skip = new Set(held.map((h) => h.m));
  for (const s of standingWhere((c) => !!c.bubble)) {
    if (!working(s)) continue;
    const b = s.card.bubble!;
    if (!ready(s, dt, b.every)) continue;
    const m = held.length < MAX_BUBBLES ? target(ctx, s, b.reach, skip) : null;
    if (!m) {
      PULSES.set(s, 0.2);
      continue;
    }
    m.frozen = Math.max(m.frozen, b.hold);
    held.push({ m, left: b.hold });
    skip.add(m);
    acted(s);
    sfx.play('switch', { pitch: 1.9, volume: 0.5 });
  }
  if (!bubbles && !held.length) return;
  const mesh = bubbleMesh(ctx);
  mesh.count = held.length;
  held.forEach((h, i) => {
    const r = Math.max(0.8, h.m.body.height * 0.72);
    const wob = 1 + Math.sin(h.left * 6) * 0.04;
    m4.compose(tmp.copy(h.m.pos).setY(h.m.pos.y + h.m.body.height * 0.5), q, sc.set(r * wob, r / wob, r * wob));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// ─── in goes a monster, out come coins ───────────────────────────────────────

const washing = new WeakMap<Standing, { m: Monster; t: number }>();
const WASH_PULL = 0.7;

function washes(ctx: Ctx, dt: number): void {
  for (const s of standingWhere((c) => !!c.wash)) {
    const w = washing.get(s);
    if (w) {
      w.t += dt;
      if (!w.m.alive) {
        washing.delete(s);
        continue;
      }
      // pulled in along the ground
      w.m.frozen = Math.max(w.m.frozen, 0.3);
      const k = Math.min(1, dt * 6);
      w.m.body.pos.x += (s.centre.x - w.m.body.pos.x) * k;
      w.m.body.pos.z += (s.centre.z - w.m.body.pos.z) * k;
      if (w.t < WASH_PULL) continue;
      washing.delete(s);
      acted(s);
      const at = tmp.copy(s.centre).setY(s.centre.y + 1);
      ctx.effects.poof(at, 0xbfeeff, 14);
      sfx.play('switch', { pitch: 1.6, volume: 0.6 });
      damageMonster(ctx, w.m, 9999, tmp2.set(0, 0, 1), ctx.player);
      dropCoins(ctx, tmp.copy(s.centre).setZ(s.centre.z + 1.6), 2);
      continue;
    }
    if (!working(s) || !ready(s, dt, s.card.wash!.every)) continue;
    const m = target(ctx, s, s.card.wash!.reach);
    if (m) washing.set(s, { m, t: 0 });
    else PULSES.set(s, 0.2);
  }
}

// ─── a tap on the thing itself ───────────────────────────────────────────────

const drumHits = new WeakMap<Standing, number>();
const cooling = new WeakMap<Standing, number>();
/** Which tale the cinema shows next. */
let film = 0;

function drumSound(i: 0 | 1 | 2): void {
  music.play((c, out, t) => {
    if (i === 0) osc(c, out, t, 'sine', 150, 0.22, 0.9, 42);
    else if (i === 1) {
      hiss(c, out, t, 'bandpass', 2200, 0.15, 0.42);
      osc(c, out, t, 'triangle', 190, 0.08, 0.2, 120);
    } else hiss(c, out, t, 'highpass', 6000, 0.5, 0.2);
  });
}

function fireworksAt(ctx: Ctx, s: Standing): void {
  const colours = [0xffd23a, 0xee6a82, 0xfff4d8, 0x8fd6cc, 0xa66bff];
  const p = ctx.player.pos;
  sfx.play('poof', { pitch: 1.5, volume: 0.6 });
  for (let i = 0; i < 4; i++) {
    const colour = colours[Math.floor(Math.random() * colours.length)];
    // low and just ahead of the party: the camera looks down, so higher up it would miss the screen
    ctx.effects.firework(tmp.set(p.x + (i - 1.5) * 3.5 + Math.random(), p.y + 1, p.z + 1 - Math.random() * 3), colour, 4 + Math.random());
  }
  void s;
}

function surprise(ctx: Ctx): void {
  if (ctx.save.coins < SURPRISE_PRICE) {
    sfx.play('click');
    voice.say('surprise_poor', { priority: 6, interrupt: true });
    return;
  }
  ctx.save.coins -= SURPRISE_PRICE;
  events.emit('coins:changed', { coins: ctx.save.coins });
  const id = pickSurprise(Math.random()) as ItemId;
  giveItem(ctx, id, 1);
  sfx.play('sticker', { pitch: 1.2 });
  voice.say(ITEMS[id].line, { priority: 6, interrupt: true });
}

function cinema(ctx: Ctx, s: Standing): void {
  const done = ctx.save.tales.done.map((id) => TALES.find((t) => t.id === id)).filter((t) => !!t);
  if (!done.length) {
    voice.say('cinema_empty', { priority: 6, interrupt: true });
    return;
  }
  const t = done[film++ % done.length];
  s.extra.film = `${import.meta.env.BASE_URL}hud/${t.sticker}.png`;
  sfx.play('switch', { pitch: 1.1 });
  voice.say(t.retell, { priority: 6, interrupt: true });
}

function tapped(ctx: Ctx, s: Standing): void {
  const kind = s.card.tap!;
  if ((cooling.get(s) ?? 0) > 0) return;
  cooling.set(s, COOL[kind] ?? 0);
  acted(s);
  switch (kind) {
    case 'drum': {
      const n = drumHits.get(s) ?? 0;
      drumHits.set(s, n + 1);
      const d = drumAt(n);
      s.extra.drum = d;
      drumSound(d);
      break;
    }
    case 'weather': {
      const w = nextWeather(ctx);
      s.extra.weather = w;
      sfx.play('switch', { pitch: 1.3 });
      voice.say((['weather_sun', 'weather_rain', 'weather_snow', 'weather_rainbow'] as const)[w], { priority: 6, interrupt: true });
      break;
    }
    case 'cinema':
      if (working(s)) cinema(ctx, s);
      else sfx.play('click');
      break;
    case 'fireworks':
      fireworksAt(ctx, s);
      break;
    case 'surprise':
      surprise(ctx);
      break;
    case 'telescope':
      sfx.play('sticker', { pitch: 1.3 });
      voice.say(scanFar(ctx) ? 'telescope_found' : 'telescope_nothing', { priority: 6, interrupt: true });
      break;
  }
}

function taps(ctx: Ctx, dt: number): void {
  const list = standingWhere((c) => !!c.tap);
  for (const s of list) {
    cooling.set(s, (cooling.get(s) ?? 0) - dt);
    if (s.card.tap === 'weather') s.extra.weather = weatherNow(ctx);
    if (!ctx.input.taps.length || dist(ctx.player.pos, s.centre.x, s.centre.z) > TAP_NEAR) continue;
    const [w, d] = s.card.size;
    if (tappedAt(ctx, tmp.copy(s.centre).setY(s.centre.y + 0.8), Math.max(w, d) / 2 + 0.4)) tapped(ctx, s);
  }
}

/** Whether a drum beat has just gone off near (x, z): monsters there dance. */
export function drumBeatAt(x: number, z: number): boolean {
  return standingWhere((c) => c.tap === 'drum').some((s) => (s.extra.pulse ?? Infinity) < DRUM.dance && Math.hypot(s.centre.x - x, s.centre.z - z) < DRUM.reach);
}

// ─── the karaoke's chorus ────────────────────────────────────────────────────

let lastBeat = -1;
let sungN = 0;

function onFootprint(s: Standing, p: THREE.Vector3): boolean {
  const [w, d] = s.rec.rot % 2 ? [s.card.size[1], s.card.size[0]] : s.card.size;
  return p.x >= s.rec.x && p.x < s.rec.x + w && p.z >= s.rec.z && p.z < s.rec.z + d && Math.abs(p.y - s.centre.y) < 1.5;
}

function karaoke(ctx: Ctx): void {
  for (const s of standingWhere((c) => !!c.stage)) {
    const on = working(s) && onFootprint(s, ctx.player.pos) && !moving(ctx);
    s.extra.busy = on;
    if (!on) continue;
    const beat = Math.floor(music.beat());
    if (beat === lastBeat) continue;
    lastBeat = beat;
    const n = singAt(sungN++);
    music.play((c, out, t) => {
      sung(c, out, t, n, 0.42, 0.22);
      sung(c, out, t, n + 4, 0.42, 0.12);
      sung(c, out, t, n - 12, 0.42, 0.14);
    });
    for (const h of ctx.heroes.values()) ctx.effects.sparkle(tmp.copy(h.pos).setY(h.pos.y + 1.7), 0xffe3a3);
  }
}

// ─── the piano path ──────────────────────────────────────────────────────────

const keyOf = new WeakMap<Hero, number>();

function pianos(ctx: Ctx): void {
  const paths = standingWhere((c) => !!c.keys);
  if (!paths.length) return;
  for (const h of ctx.heroes.values()) {
    const s = paths.find((p) => onFootprint(p, h.pos));
    const k = s ? (s.rec.rot % 2 ? keyAt(h.pos.z, s.rec.z) : keyAt(h.pos.x, s.rec.x)) : -1;
    if (k !== keyOf.get(h) && k >= 0) {
      const n = PIANO_NOTES[k];
      music.play((c, out, t) => {
        pluck(c, out, t, n + 12, 0.7, h === ctx.player ? 0.32 : 0.14);
        bell(c, out, t, n + 12, 0.8, h === ctx.player ? 0.1 : 0.04);
      });
    }
    keyOf.set(h, k);
  }
}

// ─── on a bike, on a scooter ─────────────────────────────────────────────────

let bike: { s: Standing; by: Hero } | null = null;
let stillBike = 0;
let scooter: { s: Standing; by: Hero } | null = null;
let stillScooter = 0;
let jumped = false;

function nearSeat(s: Standing, h: Hero): boolean {
  const o = s.model?.seats?.[0];
  if (!o) return false;
  o.getWorldPosition(seat);
  return Math.hypot(h.pos.x - seat.x, h.pos.z - seat.z) < SEAT_NEAR && Math.abs(h.pos.y - s.centre.y) < 1.6;
}

function setGive(s: Standing, give: number): void {
  if (!s.site) return;
  s.site.card = { ...s.site.card, give };
  addSite(s.site);
}

function offBike(): void {
  if (!bike) return;
  bike.s.extra.busy = false;
  setGive(bike.s, 0);
  bike.by.model.play('idle');
  bike = null;
}

function bikes(ctx: Ctx, dt: number): void {
  const h = ctx.player;
  if (bike && (moving(ctx) || bike.s.folding || h !== bike.by)) offBike();
  if (!bike) {
    const found = standingWhere((c) => !!c.pedal).find((s) => nearSeat(s, h));
    stillBike = found && !moving(ctx) ? stillBike + dt : 0;
    if (!found || stillBike < STILL) return;
    bike = { s: found, by: h };
    found.extra.busy = true;
    setGive(found, found.card.pedal!.give);
    sfx.play('switch', { pitch: 1.3 });
  }
  bike.s.model!.seats![0].getWorldPosition(seat);
  h.body.pos.copy(seat);
  h.body.vel.set(0, 0, 0);
  h.yaw = -Math.PI / 2;
  h.model.play('sit');
  h.model.root.position.copy(seat);
  h.model.root.rotation.set(0, h.yaw, 0);
}

function offScooter(ctx: Ctx): void {
  if (!scooter) return;
  scooter.s.extra.busy = false;
  scooter.s.extra.walk = 0;
  ctx.mountSpeed = 1;
  scooter.by.model.play('idle');
  scooter = null;
  stillScooter = -1;
}

function scooters(ctx: Ctx, dt: number): void {
  const h = ctx.player;
  // only the jump piece gets off: a hop over a step by itself does not
  if (scooter && (scooter.s.folding || h !== scooter.by || jumped)) offScooter(ctx);
  jumped = false;
  if (!scooter) {
    const found = standingWhere((c) => !!c.mount).find((s) => nearSeat(s, h));
    stillScooter = found && !moving(ctx) ? stillScooter + dt : Math.min(0, stillScooter + dt);
    if (!found || stillScooter < STILL) return;
    scooter = { s: found, by: h };
    found.extra.busy = true;
    ctx.mountSpeed = found.card.mount!.speed;
    sfx.play('switch', { pitch: 1.4 });
  }
  const s = scooter.s;
  moveFollower(s, h.body.pos, h.yaw);
  s.extra.walk = Math.hypot(h.body.vel.x, h.body.vel.z);
  h.model.play('sit');
  s.model!.seats![0].getWorldPosition(seat);
  h.model.root.position.set(h.body.pos.x, seat.y, h.body.pos.z);
}

/** Whether a hero is on a seat of ours (nothing else moves them meanwhile). */
export const seated = (h: Hero) => bike?.by === h;

// ─── smoke ───────────────────────────────────────────────────────────────────

/** Whether a monster at (x, z) is lost in a smoke machine's smoke: it sees no hero. */
export function inFog(x: number, z: number): boolean {
  return standingWhere((c) => !!c.fog).some((s) => working(s) && Math.hypot(s.centre.x - x, s.centre.z - z) < s.card.fog!.reach);
}

// ─── the pie oven ────────────────────────────────────────────────────────────

const OVEN_NEAR = 3;
let ovenSpark = 0;

function ovens(ctx: Ctx, dt: number): void {
  const list = standingWhere((c) => !!c.daily);
  if (!list.length || ctx.save.ovenDay === ctx.save.day) return;
  ovenSpark -= dt;
  for (const s of list) {
    if (ovenSpark <= 0) ctx.effects.sparkle(tmp.copy(s.centre).setY(s.centre.y + 1.4), 0xffd23a);
    if (dist(ctx.player.pos, s.centre.x, s.centre.z) > OVEN_NEAR) continue;
    ctx.save.ovenDay = ctx.save.day;
    giveItem(ctx, s.card.daily!.item as ItemId, 1);
    acted(s);
    sfx.play('sticker', { pitch: 1.1 });
    voice.say('oven_pie', { priority: 6 });
    break;
  }
  if (ovenSpark <= 0) ovenSpark = 0.5;
}

// ─── the magic can's flowers ─────────────────────────────────────────────────

let field: THREE.Group | null = null;

function plantField(ctx: Ctx): void {
  if (field) ctx.scene.remove(field);
  field = null;
  const spots = ctx.save.planted.map(([x, z], i) => {
    const y = ctx.world.groundHeight(Math.floor(x), Math.floor(z));
    return { x, y, z, kind: (i % 2) as 0 | 1 };
  });
  if (!spots.length) return;
  field = createFlowerField(ctx.skin, spots);
  ctx.scene.add(field);
}

function bloom(ctx: Ctx): void {
  const p = ctx.player.pos;
  for (const [x, z] of bloomSpots(p.x, p.z, Math.random)) {
    const g = ctx.world.groundHeight(Math.floor(x), Math.floor(z));
    if (g > 0 && !ctx.world.isWater(Math.floor(x), g, Math.floor(z))) ctx.save.planted.push([+x.toFixed(2), +z.toFixed(2)]);
  }
  ctx.save.planted = ctx.save.planted.slice(-BLOOM.keep);
  plantField(ctx);
  for (const h of ctx.heroes.values()) {
    h.hearts = HERO_STATS.maxHearts;
    h.model.play('cheer');
  }
  sfx.play('sticker', { pitch: 1.4 });
}

// ─── the little clouds and the rubber fish ───────────────────────────────────

let rainT = 0;
let rainTick = 0;

function rain(ctx: Ctx, dt: number): void {
  if (rainT <= 0) return;
  rainT -= dt;
  rainTick -= dt;
  if (rainTick > 0) return;
  rainTick = 0.35;
  for (const m of ctx.monsters) {
    if (!m.alive || m.frozen <= 0) continue;
    const top = m.pos.y + m.body.height + 0.7;
    ctx.effects.poof(tmp.copy(m.pos).setY(top), 0xffffff, 3);
    ctx.effects.sparkle(tmp.copy(m.pos).setY(top - 0.5), 0x8fd0ff);
  }
}

let wired = false;

function wire(ctx: Ctx): void {
  events.on('hero:jump', () => {
    jumped = true;
  });
  if (wired) return;
  wired = true;
  events.on('effect:start', ({ kind }) => {
    if (kind === 'bloom') bloom(ctx);
  });
  events.on('item:used', ({ item }) => {
    if (item === 'pocket_cloud') rainT = 6;
    if (item === 'rubber_fish') {
      sfx.play('switch', { pitch: 2.2 });
      if (!ctx.save.said.includes('rubber_fish_pupsia')) {
        ctx.save.said.push('rubber_fish_pupsia');
        voice.say('rubber_fish_pupsia', { priority: 6 });
      }
    }
  });
  events.on('attack:bolt', ({ hero }) => {
    if (hero !== ctx.player.id) return;
    let filled = false;
    for (const s of standingWhere((c) => !!c.rod)) {
      if (dist(ctx.player.pos, s.centre.x, s.centre.z) > s.card.rod!.reach || !s.site) continue;
      const before = chargeNetOf(s.site.key, s.card.rod!.charge);
      filled = filled || before;
      acted(s);
      ctx.effects.lightning(tmp.copy(s.centre).setY(s.centre.y + 16), tmp2.copy(s.centre).setY(s.centre.y + 4));
    }
    if (filled && !ctx.save.said.includes('rod_charge')) {
      ctx.save.said.push('rod_charge');
      voice.say('rod_charge', { priority: 6 });
    }
  });
  // For automated checks.
  (window as unknown as { __kotoGadgets: object }).__kotoGadgets = {
    tap: (id: string) => {
      const s = standingWhere((c) => c.id === id)[0];
      if (s) tapped(ctx, s);
    },
    /** The nearest water to the player: a cell of it, for checks. */
    water: (): [number, number] | null => {
      const p = ctx.player.pos;
      for (let r = 4; r < 260; r += 2) {
        for (let k = 0; k < 48; k++) {
          const x = Math.floor(p.x + Math.sin((k / 48) * Math.PI * 2) * r);
          const z = Math.floor(p.z + Math.cos((k / 48) * Math.PI * 2) * r);
          const g = ctx.world.groundHeight(x, z);
          if (ctx.world.isWater(x, g + 1, z) || ctx.world.isWater(x, g, z)) return [x, z];
        }
      }
      return null;
    },
    /** Puts the party on the ground at (x, z). */
    go: (x: number, z: number, at?: number) => {
      const y = at ?? ctx.world.groundHeight(Math.floor(x), Math.floor(z)) + 1.05;
      for (const h of ctx.heroes.values()) h.body.pos.set(x, y, z);
    },
    coins: (n: number) => {
      ctx.save.coins = n;
    },
    /** Puts the player on the seat of the first building of this kind. */
    toSeat: (id: string) => {
      const s = standingWhere((c) => c.id === id)[0];
      s?.model?.seats?.[0].getWorldPosition(seat);
      if (s) ctx.player.body.pos.set(seat.x, s.centre.y + 0.05, seat.z);
    },
    get state() {
      return {
        bike: !!bike,
        scooter: !!scooter,
        speed: ctx.mountSpeed,
        held: held.length,
        planted: ctx.save.planted.length,
        pulses: standingWhere((c) => !!(c.tap || c.blast || c.turret || c.bubble || c.wash)).map((s) => [s.card.id, s.extra.pulse ?? null]),
        ovenDay: ctx.save.ovenDay,
        busy: standingWhere((c) => !!c.stage).map((b) => !!b.extra.busy),
        film: standingWhere((c) => c.tap === 'cinema').map((b) => b.extra.film ?? null),
      };
    },
  };
}

export function initGadgets(ctx: Ctx): void {
  ctx.mountSpeed = 1;
  plantField(ctx);
}

export function updateGadgets(ctx: Ctx, dt: number): void {
  wire(ctx);
  for (const s of standingWhere((c) => !!(c.tap || c.blast || c.turret || c.bubble || c.wash || c.rod || c.daily))) if (s.extra.pulse !== undefined) s.extra.pulse += dt;
  if (!ctx.playing || ctx.sleeping) {
    offBike();
    offScooter(ctx);
    return;
  }
  blasts(ctx, dt);
  turrets(ctx, dt);
  bubblers(ctx, dt);
  washes(ctx, dt);
  taps(ctx, dt);
  karaoke(ctx);
  pianos(ctx);
  bikes(ctx, dt);
  scooters(ctx, dt);
  ovens(ctx, dt);
  rain(ctx, dt);
}
