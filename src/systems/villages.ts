import * as THREE from 'three';
import type { CharacterModel, HeroId, MonsterKind } from '../contracts';
import type { Monster } from '../actors/entities';
import { createPortal, type PortalModel } from '../assets/buildings';
import {
  createGuestHouse, createHeart, createVillageArch, createVillageHouse, createVillageItem, createVillageLamp, type VillagePiece, type VillageTick,
} from '../assets/villages';
import { HERO_ORDER } from '../content/heroes';
import {
  ELDER_SPOT, freshVillage, isFriend, KID_SPOT, LAYOUT, RACE_CARDS, taskPicture, VILLAGE_COINS, VILLAGE_SAFE, villageTask,
  type Piece, type RaceCard, type TaskNow, type VillageSave,
} from '../content/villages';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { cutawayModel } from '../render/skins/cutaway';
import { setMapMarker } from '../ui/map';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { sideCos, sideSin, VILLAGE_HALF, villageYaw, type Race, type VillageSite } from '../world/villages';
import { addToKit, owned, playingSpeakers, reserveCells } from './kit';
import { spawnAt } from './monsters';
import { addSite, offView, removeSite, type PowerSite } from './power';
import { hasAbility } from './progress';
import { homeGate, inGate, travelTo } from './travel';

/**
 * The villages (DESIGN.md «Villages»): four squares the world flattened (world/villages.ts),
 * dressed with their race's houses, guest house, heart machine, arch and folk when the party
 * comes near. The elder asks for help with a picture bubble over the head (content/villages.ts:
 * find the lost little one, gather things, defend from a wave, bring power, play music); every
 * task gives coins, all three the race's prize building; then a small task a day. The guest
 * house sleeps the party (systems/sleep.ts) with a gift in the morning; a met village is a jump
 * point on the big map, and its portal walks home.
 */

const SHOW = 170;
const HIDE = 190;
const SCAN = 1.2;
const SEEN_AT = 48;
/** The elder speaks when the hero comes this close, and again after a while. */
const TALK_AT = 7;
const TALK_AGAIN = 40;
const BUBBLE_AT = 34;
/** Where a lost little one wanders off to, and things to gather lie (from the centre). */
const LOST = [40, 68];
const SCATTER = [17, 44];
/** The defence wave comes from this far and keeps going while the hero is this close. */
const WAVE_FROM = [19, 25];
const WAVE_NEAR = 70;
const WAVE_AT_ONCE = 3;
/** Music this close to the centre counts for the disco (and sets the folk dancing). */
const DISCO_AT = 15;
const POWER_TAKE = 2;

// ─── geometry ────────────────────────────────────────────────────────────────

/** World position of village-local (lx, lz) (from the centre cell's middle), feet at the floor. */
function wpos(v: VillageSite, lx: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = sideCos(v.side);
  const s = sideSin(v.side);
  return out.set(v.x + 0.5 + lx * c + lz * s, v.y + 1, v.z + 0.5 - lx * s + lz * c);
}

/** Turns (x, z) by quarter turns, the way three.js turns a model (rotation.y). */
function turnXZ(x: number, z: number, turn: number): [number, number] {
  const c = sideCos(turn & 3);
  const s = sideSin(turn & 3);
  return [x * c + z * s, -x * s + z * c];
}

/** A piece's cells (world x, z) with how tall each is solid. */
function pieceCells(v: VillageSite, p: Piece): { x: number; z: number; h: number }[] {
  const [w, d] = p.size;
  const out: { x: number; z: number; h: number }[] = [];
  const solid = p.solid ?? [...Array(w * d)].map((_, k) => ({ i: k % w, j: Math.floor(k / w), h: p.h ?? 1 }));
  const all = [...Array(w * d)].map((_, k) => ({ i: k % w, j: Math.floor(k / w) }));
  for (const { i, j } of all) {
    const [px, pz] = turnXZ(i - (w - 1) / 2, j - (d - 1) / 2, turnOf(v, p));
    const at = wpos(v, p.at[0] + px, p.at[1] + pz);
    const h = solid.find((c) => c.i === i && c.j === j)?.h ?? 0;
    out.push({ x: Math.floor(at.x), z: Math.floor(at.z), h });
  }
  return out;
}

/** A piece's quarter turns on this square; the portal always faces the camera, like a toy set out on the table. */
const turnOf = (v: VillageSite, p: Piece) => (p.kind === 'portal' ? (4 - v.side) & 3 : p.turn);
const pieceYaw = (v: VillageSite, p: Piece) => villageYaw(v) + (turnOf(v, p) * Math.PI) / 2;

// ─── the folk's walks: a ring round the plaza, spokes to the doors and the guest house ──

const NODES: [number, number][] = [
  [4.5, 0], [3.2, 3.2], [0, 4.5], [-3.2, 3.2], [-4.5, 0], [-3.2, -3.2], [0, -4.5], [3.2, -3.2],
  // doors of the four houses (LAYOUT order) and the guest house's front
  [-7, -7.5], [7, -7.5], [-7, 5.5], [7, 5.5], [0, -7.5],
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
  [5, 8], [7, 9], [3, 10], [1, 11], [6, 12],
];
const DOOR_NODE = [8, 9, 10, 11];
const neighbours = NODES.map((_, i) => EDGES.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));

function route(from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const m of neighbours[n]) if (!prev.has(m)) prev.set(m, n), q.push(m);
  }
  const path: number[] = [];
  for (let n = to; n !== from && n !== undefined && n >= 0; n = prev.get(n)!) path.unshift(n);
  return path;
}

// ─── what is shown ───────────────────────────────────────────────────────────

type FolkRole = 'elder' | 'adult' | 'kid';
type FolkMode = 'stroll' | 'home' | 'hidden' | 'stay' | 'lost' | 'follow' | 'back';

interface Folk {
  role: FolkRole;
  model: CharacterModel;
  pos: THREE.Vector3;
  yaw: number;
  mode: FolkMode;
  node: number;
  path: number[];
  wait: number;
  house: number;
  dancing: boolean;
}

interface Item {
  model: VillagePiece;
  pos: THREE.Vector3;
  key: string;
}

interface Shown {
  site: VillageSite;
  card: RaceCard;
  centre: THREE.Vector3;
  pieces: { piece: Piece; model: VillagePiece }[];
  heart: VillagePiece;
  cells: [number, number, number][];
  folk: Folk[];
  elder: Folk;
  kid: Folk;
  portal: { model: PortalModel; pos: THREE.Vector3; yaw: number; armed: boolean; outFor: number };
  site_: PowerSite | null;
  items: Item[];
  wave: Set<Monster>;
  waveT: number;
  /** The task the elder last asked for (a new one is asked as soon as the hero is near), when it may be asked again, and the quiet before any next word. */
  told: string;
  repeatAt: number;
  quietUntil: number;
  guest: { centre: THREE.Vector3; spots: { pos: THREE.Vector3; yaw: number }[]; wake: THREE.Vector3 };
}

const shown = new Map<Race, Shown>();
let scanT = 0;
let clock = 0;
const tmp = new THREE.Vector3();

const saveOf = (ctx: Ctx, race: Race): VillageSave => (ctx.save.villages[race] ??= freshVillage());
const has = (ctx: Ctx) => (id: Parameters<typeof owned>[1]) => owned(ctx, id) > 0;
const sites = (ctx: Ctx) => ctx.world.villages?.() ?? [];

/** The task a village asks for now (null: nothing today, or not met yet). */
function taskNow(ctx: Ctx, race: Race): TaskNow | null {
  const v = saveOf(ctx, race);
  if (!v.met) return null;
  return villageTask(RACE_CARDS[race], v, has(ctx), ctx.save.day);
}

/** Whether (x, z) is in a village (safe, hearts come back fast). */
export function inVillage(ctx: Ctx, x: number, z: number): boolean {
  return sites(ctx).some((v) => Math.hypot(v.x + 0.5 - x, v.z + 0.5 - z) < VILLAGE_SAFE);
}

/** The guest house the hero stands at (for systems/sleep.ts), if any. */
export function guestNear(ctx: Ctx): { centre: THREE.Vector3; spots: Record<HeroId, { pos: THREE.Vector3; yaw: number }>; wake: THREE.Vector3 } | null {
  for (const s of shown.values()) {
    if (Math.hypot(ctx.player.pos.x - s.guest.centre.x, ctx.player.pos.z - s.guest.centre.z) > 3.6) continue;
    const spots = Object.fromEntries(HERO_ORDER.map((id, i) => [id, s.guest.spots[i]])) as Record<HeroId, { pos: THREE.Vector3; yaw: number }>;
    return { centre: s.guest.centre, spots, wake: s.guest.wake };
  }
  return null;
}

// ─── raising and dropping a village ──────────────────────────────────────────

function makeFolk(ctx: Ctx, id: string, role: FolkRole, pos: THREE.Vector3, yaw: number, house = -1): Folk {
  const model = ctx.models.character({ kind: 'parts', id });
  model.root.position.copy(pos);
  model.root.rotation.y = yaw;
  model.root.userData.casts = true;
  ctx.scene.add(model.root);
  model.update(0, 0);
  return { role, model, pos: pos.clone(), yaw, mode: role === 'adult' ? 'stroll' : 'stay', node: 0, path: [], wait: Math.random() * 3, house, dancing: false };
}

function piecesModel(ctx: Ctx, race: Race, p: Piece): VillagePiece | null {
  switch (p.kind) {
    case 'heart':
      return createHeart(ctx.skin, race);
    case 'house':
      return createVillageHouse(ctx.skin, race, p.variant ?? 0);
    case 'guest':
      return createGuestHouse(ctx.skin, race);
    case 'arch':
      return createVillageArch(ctx.skin, race);
    case 'lamp':
      return createVillageLamp(ctx.skin, race);
    default:
      return null;
  }
}

function raise(ctx: Ctx, site: VillageSite): Shown {
  const card = RACE_CARDS[site.race];
  const yaw = villageYaw(site);
  const pieces: Shown['pieces'] = [];
  const cells: [number, number, number][] = [];
  let heart: VillagePiece | null = null;
  let guest: Shown['guest'] | null = null;
  let portal: Shown['portal'] | null = null;
  for (const p of LAYOUT) {
    const at = wpos(site, p.at[0], p.at[1]);
    const py = pieceYaw(site, p);
    for (const c of pieceCells(site, p)) for (let k = 0; k < c.h; k++) cells.push([c.x, site.y + 1 + k, c.z]);
    if (p.kind === 'portal') {
      const model = createPortal(ctx.skin);
      model.root.position.copy(at);
      model.root.rotation.y = py;
      model.root.userData.casts = true;
      ctx.scene.add(model.root);
      portal = { model, pos: at.clone(), yaw: py, armed: false, outFor: 0 };
      continue;
    }
    const model = piecesModel(ctx, site.race, p);
    if (!model) continue;
    model.root.position.copy(at);
    model.root.rotation.y = py;
    model.root.userData.casts = true;
    cutawayModel(model.root);
    ctx.scene.add(model.root);
    pieces.push({ piece: p, model });
    if (p.kind === 'heart') heart = model;
    if (p.kind === 'guest') {
      const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, py).add(at);
      const spots = (model.spots ?? [-1.4, 0, 1.4].map((x) => ({ x, y: 0.4, z: -0.2, yaw: 0 }))).map((s) => ({ pos: toWorld(s.x, s.y, s.z), yaw: py + s.yaw }));
      guest = { centre: toWorld(0, 0, 1.6), spots, wake: toWorld(0, 0, 3) };
    }
  }
  for (const [x, y, z] of cells) ctx.world.setBarrier?.(x, y, z, true);

  const elderPos = wpos(site, ...ELDER_SPOT);
  const folk: Folk[] = [];
  const elder = makeFolk(ctx, card.folk.elder, 'elder', elderPos, yaw);
  folk.push(elder);
  card.folk.adults.forEach((id, i) => {
    const f = makeFolk(ctx, id, 'adult', wpos(site, ...NODES[i * 2]), yaw, i);
    f.node = i * 2;
    folk.push(f);
  });
  const kid = makeFolk(ctx, card.folk.kid, 'kid', wpos(site, ...KID_SPOT), yaw + Math.PI);
  folk.push(kid);

  const centre = wpos(site, 0, 0);
  const s: Shown = {
    site, card, centre, pieces, heart: heart!, cells, folk, elder, kid, portal: portal!, site_: null,
    items: [], wave: new Set(), waveT: 0, told: '', repeatAt: 0, quietUntil: 0, guest: guest!,
  };
  syncPower(ctx, s);
  resume(ctx, s);
  return s;
}

function drop(ctx: Ctx, s: Shown): void {
  for (const { model } of s.pieces) ctx.scene.remove(model.root);
  ctx.scene.remove(s.portal.model.root);
  for (const f of s.folk) {
    ctx.scene.remove(f.model.root);
    f.model.dispose();
  }
  for (const [x, y, z] of s.cells) ctx.world.setBarrier?.(x, y, z, false);
  if (s.site_) removeSite(s.site_.key);
  clearItems(ctx, s);
  setMapMarker(`vk:${s.site.race}`, null);
}

/** The heart is in the power networks while its «power» task waits; after that it runs by itself. */
function syncPower(ctx: Ctx, s: Shown): void {
  const v = saveOf(ctx, s.site.race);
  const wants = s.card.tasks.includes('power') && !v.done.includes('power');
  if (wants && !s.site_) {
    const socket = (s.heart.socket ?? new THREE.Vector3(0, 2.4, 0)).clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, villageYaw(s.site)).add(s.centre);
    s.site_ = { key: `v:${s.site.race}`, socket, card: { take: POWER_TAKE }, charge: 0, view: offView() };
    addSite(s.site_);
  } else if (!wants && s.site_) {
    removeSite(s.site_.key);
    s.site_ = null;
  }
}

/** On coming near (or loading): a task under way gets its things back (the little one out there, things to gather). */
function resume(ctx: Ctx, s: Shown): void {
  const v = saveOf(ctx, s.site.race);
  const t = taskNow(ctx, s.site.race);
  if (!t || v.cur !== t.kind) return;
  setUp(ctx, s, t);
}

// ─── tasks ───────────────────────────────────────────────────────────────────

/** A dry spot `r0..r1` from the centre, outside the square. */
function spotAround(ctx: Ctx, s: Shown, r0: number, r1: number): THREE.Vector3 {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    const x = Math.floor(s.centre.x + Math.sin(a) * r);
    const z = Math.floor(s.centre.z + Math.cos(a) * r);
    const g = ctx.world.groundHeight(x, z);
    if (ctx.world.isWater(x, g, z) || ctx.world.isWater(x, g - 1, z)) continue;
    if (Math.abs(ctx.world.groundHeight(x + 1, z) - g) > 1 || Math.abs(ctx.world.groundHeight(x, z + 1) - g) > 1) continue;
    return new THREE.Vector3(x + 0.5, g, z + 0.5);
  }
  return wpos(s.site, 0, VILLAGE_HALF + 6);
}

/** Begins a task's world part: the little one wanders off, things lie about. */
function setUp(ctx: Ctx, s: Shown, t: TaskNow): void {
  const v = saveOf(ctx, s.site.race);
  if (t.kind === 'find' && s.kid.mode !== 'follow') {
    const p = spotAround(ctx, s, LOST[0], LOST[1]);
    s.kid.pos.copy(p);
    s.kid.mode = 'lost';
    setMapMarker(`vk:${s.site.race}`, { pos: s.kid.pos, icon: s.card.kidFace, pointer: true });
  }
  if (t.kind === 'gather') {
    clearItems(ctx, s);
    for (let i = 0; i < t.goal - v.got; i++) {
      const pos = spotAround(ctx, s, SCATTER[0], SCATTER[1]);
      const model = createVillageItem(ctx.skin, s.site.race);
      model.root.position.copy(pos);
      ctx.scene.add(model.root);
      s.items.push({ model, pos, key: `vi:${s.site.race}:${i}` });
    }
    markItems(ctx, s);
  }
}

function clearItems(ctx: Ctx, s: Shown): void {
  for (const it of s.items) {
    ctx.scene.remove(it.model.root);
    setMapMarker(it.key, null);
  }
  s.items = [];
}

/** Things to gather are marks on the map; the nearest one points the way. */
function markItems(ctx: Ctx, s: Shown): void {
  const p = ctx.player.pos;
  let near: Item | null = null;
  for (const it of s.items) if (!near || it.pos.distanceToSquared(p) < near.pos.distanceToSquared(p)) near = it;
  for (const it of s.items) setMapMarker(it.key, { pos: it.pos, icon: s.card.item, pointer: it === near });
}

function coins(ctx: Ctx, n: number, at: THREE.Vector3): void {
  ctx.save.coins += n;
  events.emit('coins:changed', { coins: ctx.save.coins });
  ctx.effects.coinBurst(at.clone().setY(at.y + 1.2), Math.min(12, n));
  sfx.play('coin');
}

function complete(ctx: Ctx, s: Shown, t: TaskNow): void {
  const v = saveOf(ctx, s.site.race);
  v.got = 0;
  v.cur = null;
  for (const f of s.folk) if (f.model.root.visible) f.model.play('cheer');
  ctx.player.model.play('cheer');
  coins(ctx, t.daily ? VILLAGE_COINS.daily : VILLAGE_COINS.task, s.elder.pos);
  if (t.daily) v.daily = ctx.save.day;
  else v.done.push(t.kind);
  voice.say(s.card.thanks, { priority: 8, interrupt: true });
  const friends = !t.daily && isFriend(v);
  events.emit('village:task', { race: s.site.race, kind: t.kind, friends });
  // the next ask waits a little
  s.quietUntil = clock + 5;
  s.told = '';
  s.waveT = 0;
  if (friends) setTimeout(() => prize(ctx, s), 2800);
}

/** All three done: the race's building into the box, with a fanfare. */
function prize(ctx: Ctx, s: Shown): void {
  addToKit(ctx, s.card.prize, 1);
  sfx.play('sticker');
  ctx.effects.ring(ctx.player.pos, 0xffd23a, 2.4);
  ctx.effects.poof(ctx.player.pos.clone().setY(ctx.player.pos.y + 1.2), 0xffd23a, 26);
  ctx.player.model.play('cheer');
  voice.say(s.card.prizeLine, { priority: 9, interrupt: true });
  setTimeout(() => voice.say('village_friends', { priority: 7 }), 6500);
}

/** The elder asks for the task under way (and says hello the first time). */
function talk(ctx: Ctx, s: Shown, t: TaskNow | null): void {
  const race = s.site.race;
  const v = saveOf(ctx, race);
  s.elder.model.play('happy');
  if (!v.met) {
    v.met = true;
    voice.say(s.card.hello, { priority: 7, interrupt: true });
    // the first task right after the hello
    s.quietUntil = clock + 5;
    return;
  }
  if (!t) return;
  s.told = `${t.kind}:${t.daily}:${t.blocked}`;
  s.quietUntil = clock + 4;
  s.repeatAt = clock + TALK_AGAIN;
  const line = s.card.ask[t.kind];
  if (line) voice.say(line, { priority: 7, interrupt: true });
  if (t.blocked) setTimeout(() => voice.say(t.kind === 'power' ? 'village_need_power' : 'village_need_music', { priority: 7 }), 4200);
  else if (v.cur !== t.kind) {
    v.cur = t.kind;
    v.got = 0;
    setUp(ctx, s, t);
  }
}

function updateTask(ctx: Ctx, s: Shown, dt: number): void {
  const race = s.site.race;
  const v = saveOf(ctx, race);
  const p = ctx.player.pos;
  const t = taskNow(ctx, race);
  const dElder = Math.hypot(p.x - s.elder.pos.x, p.z - s.elder.pos.z);

  // the elder speaks when the hero comes close (a new task at once, the same one now and then)
  const key = t ? `${t.kind}:${t.daily}:${t.blocked}` : '';
  if (dElder < TALK_AT && clock >= s.quietUntil && !voice.isSpeaking() && (!v.met || (t && (key !== s.told || clock >= s.repeatAt)))) talk(ctx, s, t);
  // the bubble: the task's picture and how far it has come
  if (t && v.cur === t.kind && dElder < BUBBLE_AT) bubble = { s, picture: taskPicture(s.card, t.kind), lit: Math.min(8, Math.floor((v.got / t.goal) * 8 + 1e-6)) };
  else if (t && t.blocked && dElder < BUBBLE_AT) bubble = { s, picture: taskPicture(s.card, t.kind), lit: 0 };

  if (!t || t.blocked || v.cur !== t.kind) return;
  switch (t.kind) {
    case 'find':
      if (s.kid.mode === 'lost' && s.kid.pos.distanceTo(p) < 3) {
        s.kid.mode = 'follow';
        s.kid.model.play('cheer');
        setMapMarker(`vk:${race}`, null);
        if (s.card.kidFound) voice.say(s.card.kidFound, { priority: 8, interrupt: true });
        sfx.play('sticker', { pitch: 1.3 });
      }
      if (s.kid.mode === 'follow' && Math.hypot(s.kid.pos.x - s.centre.x, s.kid.pos.z - s.centre.z) < 11) {
        s.kid.mode = 'back';
        s.kid.path = [];
        v.got = 1;
        complete(ctx, s, t);
      }
      break;
    case 'gather':
      for (const it of [...s.items]) {
        if (Math.hypot(it.pos.x - p.x, it.pos.z - p.z) > 1.4 || Math.abs(it.pos.y - p.y) > 2.5) continue;
        ctx.scene.remove(it.model.root);
        setMapMarker(it.key, null);
        s.items.splice(s.items.indexOf(it), 1);
        ctx.effects.poof(it.pos.clone().setY(it.pos.y + 0.8), 0xffd23a, 16);
        sfx.play('pickup');
        v.got++;
        if (v.got >= t.goal) complete(ctx, s, t);
        else markItems(ctx, s);
      }
      if (s.items.length) markItems(ctx, s);
      break;
    case 'defend':
      defend(ctx, s, t, dt);
      break;
    case 'power':
      if (s.site_?.view.on) {
        v.got = 1;
        complete(ctx, s, t);
        syncPower(ctx, s);
      }
      break;
    case 'disco':
      if (discoNear(s)) {
        v.got += dt;
        if (v.got >= t.goal) complete(ctx, s, t);
      }
      break;
  }
}

function discoNear(s: Shown): boolean {
  return playingSpeakers().some((sp) => Math.hypot(sp.centre.x - s.centre.x, sp.centre.z - s.centre.z) < DISCO_AT);
}

/** The defence: monsters come at the village a few at a time; every one beaten counts. */
function defend(ctx: Ctx, s: Shown, t: TaskNow, dt: number): void {
  const v = saveOf(ctx, s.site.race);
  for (const m of [...s.wave]) {
    if (m.alive && ctx.monsters.includes(m)) continue;
    s.wave.delete(m);
    if (m.hp <= 0) v.got++;
  }
  if (v.got >= t.goal) {
    complete(ctx, s, t);
    return;
  }
  const near = Math.hypot(ctx.player.pos.x - s.centre.x, ctx.player.pos.z - s.centre.z) < WAVE_NEAR;
  if (!near || ctx.sleeping) return;
  if (s.waveT === 0 && s.wave.size === 0) voice.say('village_wave', { priority: 7 });
  s.waveT += dt;
  if (s.wave.size >= Math.min(WAVE_AT_ONCE, t.goal - v.got) || s.waveT < 1.6) return;
  s.waveT = 0.01;
  const night = ctx.clock.daylight < 0.35;
  const kinds: MonsterKind[] = night ? ['zombie', 'skeleton', 'spider'] : ['zombie'];
  const at = spotAround(ctx, s, WAVE_FROM[0], WAVE_FROM[1]);
  s.wave.add(spawnAt(ctx, kinds[Math.floor(Math.random() * kinds.length)], at.x, at.z));
}

/** A wave is on: the grown-ups wait indoors. */
const waveOn = (ctx: Ctx, s: Shown) => {
  const t = taskNow(ctx, s.site.race);
  return !!t && t.kind === 'defend' && saveOf(ctx, s.site.race).cur === 'defend' && (s.wave.size > 0 || s.waveT > 0);
};

// ─── the folk ────────────────────────────────────────────────────────────────

function face(f: Folk, tx: number, tz: number, dt: number, k = 6): void {
  const want = Math.atan2(tx - f.pos.x, tz - f.pos.z);
  let d = want - f.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  f.yaw += d * Math.min(1, dt * k);
}

/** Walks towards (x, z) at `speed`; true when there. */
function walk(ctx: Ctx, f: Folk, x: number, z: number, speed: number, dt: number): boolean {
  const dx = x - f.pos.x;
  const dz = z - f.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const step = Math.min(d, speed * dt);
  f.pos.x += (dx / d) * step;
  f.pos.z += (dz / d) * step;
  f.pos.y = ctx.world.groundHeight(Math.floor(f.pos.x), Math.floor(f.pos.z));
  face(f, x, z, dt, 10);
  return false;
}

function updateFolk(ctx: Ctx, s: Shown, dt: number): void {
  const night = 1 - ctx.clock.daylight > 0.75;
  const hide = night || waveOn(ctx, s);
  const music = discoNear(s);
  const p = ctx.player.pos;
  for (const f of s.folk) {
    let speed = 0;
    if (f.role === 'adult') {
      if (hide && f.mode === 'stroll') {
        f.mode = 'home';
        f.path = route(f.node, DOOR_NODE[f.house]);
      }
      if (!hide && f.mode === 'hidden') {
        f.mode = 'stroll';
        f.model.root.visible = true;
        f.wait = 0.5 + Math.random();
      }
      if (f.mode === 'home' || (f.mode === 'stroll' && f.path.length)) {
        const n = f.path[0];
        if (n === undefined) {
          if (f.mode === 'home') {
            f.mode = 'hidden';
            f.model.root.visible = false;
          }
        } else {
          const to = wpos(s.site, ...NODES[n], tmp);
          speed = f.mode === 'home' ? 2.6 : 1.5;
          if (music && f.mode === 'stroll') speed = 0;
          else if (walk(ctx, f, to.x, to.z, speed, dt)) {
            f.node = n;
            f.path.shift();
            if (!f.path.length) f.wait = 2 + Math.random() * 4;
          }
        }
      } else if (f.mode === 'stroll') {
        f.wait -= dt;
        if (f.wait <= 0 && !music) {
          const next = neighbours[f.node][Math.floor(Math.random() * neighbours[f.node].length)];
          f.path = [next];
        }
      }
    } else if (f.role === 'elder') {
      // faces the hero when near, else the gate
      if (Math.hypot(p.x - f.pos.x, p.z - f.pos.z) < 12) face(f, p.x, p.z, dt, 4);
      else {
        const g = wpos(s.site, ELDER_SPOT[0], ELDER_SPOT[1] + 5, tmp);
        face(f, g.x, g.z, dt, 2);
      }
    } else {
      // the little one
      if (f.mode === 'lost') {
        face(f, p.x, p.z, dt, 2);
      } else if (f.mode === 'follow') {
        const d = Math.hypot(p.x - f.pos.x, p.z - f.pos.z);
        if (d > 28) {
          f.pos.set(p.x - Math.sin(ctx.player.yaw) * 1.6, p.y, p.z - Math.cos(ctx.player.yaw) * 1.6);
        } else if (d > 2.2) {
          speed = Math.min(6.5, d * 2);
          walk(ctx, f, p.x, p.z, speed, dt);
        } else face(f, p.x, p.z, dt, 4);
      } else if (f.mode === 'back') {
        const to = wpos(s.site, ...KID_SPOT, tmp);
        speed = 2.4;
        if (walk(ctx, f, to.x, to.z, speed, dt)) f.mode = 'stay';
      }
    }
    // music on the square: everyone visible dances
    const dance = music && f.model.root.visible && speed === 0 && f.mode !== 'lost' && f.mode !== 'follow';
    if (dance !== f.dancing) {
      f.dancing = dance;
      f.model.play(dance ? 'dance' : 'idle');
    }
    f.model.root.position.copy(f.pos);
    f.model.root.rotation.y = f.yaw;
    f.model.update(dt, speed);
  }
}

// ─── the bubble over the elder ───────────────────────────────────────────────

let bubble: { s: Shown; picture: string; lit: number } | null = null;

function pushBubble(ctx: Ctx): void {
  if (!bubble || !ctx.playing || ctx.sleeping) {
    ctx.hud.setBubble(null);
    return;
  }
  const f = bubble.s.elder;
  tmp.copy(f.pos).setY(f.pos.y + f.model.height + 0.9).project(ctx.camera);
  if (tmp.z > 1) {
    ctx.hud.setBubble(null);
    return;
  }
  const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
  ctx.hud.setBubble({ x, y, picture: bubble.picture, lit: bubble.lit });
}

// ─── the map, the portal, the morning gift ───────────────────────────────────

/** Villages seen (their centre chunk explored) or met are marks; a tap on a met one jumps there. */
function marks(ctx: Ctx): void {
  const explored = new Set(ctx.save.explored);
  for (const v of sites(ctx)) {
    const met = saveOf(ctx, v.race).met;
    if (!met && !explored.has(`${Math.floor(v.x / 16)},${Math.floor(v.z / 16)}`)) continue;
    setMapMarker(`v:${v.race}`, { pos: { x: v.x + 0.5, z: v.z + 0.5 }, icon: RACE_CARDS[v.race].mark, pointer: false, onTap: () => jump(ctx, v) });
  }
}

function jump(ctx: Ctx, v: VillageSite): void {
  if (!saveOf(ctx, v.race).met) return;
  if (!hasAbility(ctx, 'portal')) {
    voice.say('portal_soon', { priority: 7, interrupt: true });
    return;
  }
  const portal = LAYOUT.find((p) => p.kind === 'portal')!;
  void travelTo(ctx, wpos(v, portal.at[0], portal.at[1]), pieceYaw(v, portal));
}

function updatePortal(ctx: Ctx, s: Shown, dt: number): void {
  const g = s.portal;
  const home = homeGate();
  g.model.setOpen(home ? 1 : 0);
  g.model.update(dt);
  if (!home || !ctx.playing || ctx.sleeping) return;
  const inside = inGate(g, ctx.player.pos);
  if (!inside) {
    g.outFor += dt;
    if (g.outFor > 0.3) g.armed = true;
  } else g.outFor = 0;
  if (inside && g.armed) {
    g.armed = false;
    void travelTo(ctx, home.pos, home.yaw);
  }
}

/** Morning after a night in a guest house: the elder's gift (and the race's sticker the first time). */
function gift(ctx: Ctx): void {
  let best: Shown | null = null;
  for (const s of shown.values()) if (!best || s.guest.centre.distanceTo(ctx.player.pos) < best.guest.centre.distanceTo(ctx.player.pos)) best = s;
  if (!best) return;
  const v = saveOf(ctx, best.site.race);
  v.nights++;
  const sticker = `v:${best.site.race}`;
  if (!ctx.save.found.includes(sticker)) {
    ctx.save.found.push(sticker);
    sfx.play('sticker');
  }
  coins(ctx, VILLAGE_COINS.gift, best.elder.pos);
  best.elder.model.play('happy');
  setTimeout(() => voice.say(best!.card.gift, { priority: 8, interrupt: true }), 900);
}

// ─── the loop ────────────────────────────────────────────────────────────────

export function initVillages(ctx: Ctx): void {
  // the squares' pieces keep their ground from the kit (and buildings there go back to the box)
  for (const v of sites(ctx)) {
    const cells: [number, number][] = [];
    for (const p of LAYOUT) {
      const [w, d] = p.size;
      for (let i = -1; i <= w; i++) {
        for (let j = -1; j <= d; j++) {
          const [px, pz] = turnXZ(i - (w - 1) / 2, j - (d - 1) / 2, p.turn);
          const at = wpos(v, p.at[0] + px, p.at[1] + pz);
          cells.push([Math.floor(at.x), Math.floor(at.z)]);
        }
      }
    }
    // the path to the gate and where the elder and the little one stand
    for (let lz = 4; lz <= VILLAGE_HALF; lz++) for (let lx = -1; lx <= 1; lx++) {
      const at = wpos(v, lx, lz);
      cells.push([Math.floor(at.x), Math.floor(at.z)]);
    }
    for (const [lx, lz] of [ELDER_SPOT, KID_SPOT]) {
      const at = wpos(v, lx, lz);
      cells.push([Math.floor(at.x), Math.floor(at.z)]);
    }
    reserveCells(cells);
  }
  events.on('sleep:done', ({ where }) => {
    if (where === 'guest') gift(ctx);
  });
  events.on('hero:teleport', () => {
    for (const s of shown.values()) if (s.kid.mode === 'follow') s.kid.pos.copy(ctx.player.pos).add(new THREE.Vector3(1.2, 0, 1.2));
  });
  events.on('kit:reward', () => (scanT = 0));
  // For automated checks.
  (window as unknown as { __kotoVillages: object }).__kotoVillages = {
    sites: () => sites(ctx).map((v) => ({ ...v, centre: wpos(v, 0, 0).toArray() })),
    get state() {
      return Object.fromEntries(sites(ctx).map((v) => [v.race, { ...saveOf(ctx, v.race), task: taskNow(ctx, v.race), shown: shown.has(v.race) }]));
    },
    /** Puts the party at a village's elder, or at local (lx, lz) (no fade). */
    go: (race: Race, lx = ELDER_SPOT[0], lz = ELDER_SPOT[1] + 3) => {
      const v = sites(ctx).find((s) => s.race === race);
      if (!v) return;
      const at = wpos(v, lx, lz);
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(at.x + (h === ctx.player ? 0 : 1), at.y + 0.2, at.z + 1);
        h.body.vel.set(0, 0, 0);
      }
      scanT = 0;
    },
    /** Finishes the village's task under way. */
    finish: (race: Race) => {
      const s = shown.get(race);
      const t = taskNow(ctx, race);
      if (s && t) complete(ctx, s, t);
    },
    items: (race: Race) => shown.get(race)?.items.map((i) => i.pos.toArray()) ?? [],
    kid: (race: Race) => shown.get(race)?.kid.pos.toArray() ?? null,
    elder: (race: Race) => shown.get(race)?.elder.pos.toArray() ?? null,
    /** The village clock (game seconds): headless runs slowly, so checks wait on it. */
    get clock() {
      return clock;
    },
    guest: () => !!guestNear(ctx),
    moon: () => ctx.input.press('prompt:moon'),
    /** What a tap on the village's map mark does. */
    jump: (race: Race) => {
      const v = sites(ctx).find((s) => s.race === race);
      if (v) jump(ctx, v);
    },
  };
}

function scan(ctx: Ctx): void {
  const p = ctx.playing ? ctx.player.pos : (ctx.house?.centre ?? ctx.camera.position);
  for (const v of sites(ctx)) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    const s = shown.get(v.race);
    if (!s && d < SHOW) shown.set(v.race, raise(ctx, v));
    else if (s && d > HIDE) {
      drop(ctx, s);
      shown.delete(v.race);
    }
    if (ctx.playing && d < SEEN_AT && !ctx.save.said.includes(RACE_CARDS[v.race].seen)) {
      ctx.save.said.push(RACE_CARDS[v.race].seen);
      voice.say(RACE_CARDS[v.race].seen, { priority: 7 });
    }
  }
  for (const s of shown.values()) syncPower(ctx, s);
  marks(ctx);
}

export function updateVillages(ctx: Ctx, dt: number): void {
  clock += dt;
  scanT -= dt;
  if (scanT <= 0) {
    scanT = SCAN;
    scan(ctx);
  }
  bubble = null;
  const night = 1 - ctx.clock.daylight;
  for (const s of shown.values()) {
    const v = saveOf(ctx, s.site.race);
    const tick: VillageTick = { night, on: true, low: false, beat: 0 };
    for (const { piece, model } of s.pieces) {
      if (piece.kind === 'heart' && s.card.tasks.includes('power')) {
        tick.on = v.done.includes('power') || !!s.site_?.view.on;
        tick.low = !!s.site_?.view.low;
      } else {
        tick.on = true;
        tick.low = false;
      }
      model.update(dt, tick);
    }
    for (const it of s.items) it.model.update(dt, tick);
    updatePortal(ctx, s, dt);
    updateFolk(ctx, s, dt);
    if (ctx.playing && !ctx.sleeping) updateTask(ctx, s, dt);
  }
  pushBubble(ctx);
}
