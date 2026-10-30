import * as THREE from 'three';
import { giveArtifact } from './artifacts';
import { giveCompanion } from './companions';
import type { CharacterModel } from '../contracts';
import { createPortal, type PortalModel } from '../assets/buildings';
import { createCastle, createCastleItem, type CastleModel, type CastleTick } from '../assets/castles';
import { createChest, type Chest } from '../assets/props';
import type { VillagePiece } from '../assets/villages';
import { CASTLE_CARDS, CASTLE_COINS, CASTLE_KEPT, CASTLE_POWER, CASTLE_REACH, castleOpen, castleTask, freshCastle, type CastleCard, type CastleSave } from '../content/castles';
import { taskPicture, type TaskNow } from '../content/villages';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { cutawayModel } from '../render/skins/cutaway';
import { setMapMarker } from '../ui/map';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { CASTLE_HALF, type CastleSite } from '../world/castles';
import { villageYaw, type Race } from '../world/villages';
import { addToKit, owned, reserveCells } from './kit';
import { addSite, offView, removeSite, type PowerSite } from './power';
import { hasAbility } from './progress';
import { faceTo, followHero, giveCoins, musicNear, offerBubble, runWave, sitePos, spotAround, walkTo, type WaveRule } from './tasks';
import { homeGate, inGate, travelTo } from './travel';

/**
 * The castles (DESIGN.md «Castles»): one per race, far beyond its village, on a square the
 * world flattened (world/castles.ts). Built once a piece a frame when the party comes near and
 * parked when it goes far (DESIGN.md «Performance»). Monsters besiege it; the ruler at the
 * gate asks for three tasks with a picture bubble (the village tasks, bigger: tasks.ts runs
 * their world parts); each one wakes the castle a little more; the third opens its gate, the
 * stairs lead up to a balcony, and the chest there holds the race's best prize. Then the
 * castle is a friend: safe like a village, a jump point on the big map.
 */

const SHOW = 170;
const HIDE = 190;
const SCAN = 1.2;
const SEEN_AT = 60;
/** Where the ruler stands (in front of the gate, facing the plaza) and where the portal is (castle-local). */
const RULER_SPOT: [number, number] = [0, 8];
const KID_SPOT: [number, number] = [2.4, 8.6];
const PORTAL_SPOT: [number, number] = [-9, 13];
const TALK_AT = 7;
const TALK_AGAIN = 40;
const BUBBLE_AT = 34;
const LOST: [number, number] = [44, 72];
const SCATTER: [number, number] = [20, 48];
const WAVE: WaveRule = { from: [22, 28], near: 75, atOnce: 4, line: 'castle_siege' };
const DISCO_AT = 18;
/** Once freed: no monster appears this close, hearts come back fast. */
const CASTLE_SAFE = 34;
/** The chest opens to a hero this close (and about as high). */
const CHEST_AT = 2.2;
/** Seconds for the castle to come alive a step (alive, the gate). */
const WAKE_RATE = 0.5;

interface Walker {
  model: CharacterModel;
  pos: THREE.Vector3;
  yaw: number;
}

interface Kid extends Walker {
  mode: 'home' | 'lost' | 'follow' | 'back';
  dancing: boolean;
}

interface Item {
  model: VillagePiece;
  pos: THREE.Vector3;
  key: string;
}

interface Built {
  site: CastleSite;
  card: CastleCard;
  centre: THREE.Vector3;
  yaw: number;
  model: CastleModel;
  /** Solid cells (world) and the gate's, solid while it is shut. */
  cells: [number, number, number][];
  gateCells: [number, number, number][];
  gateShut: boolean;
  ruler: Walker & { dancing: boolean };
  kid: Kid | null;
  portal: { model: PortalModel; pos: THREE.Vector3; yaw: number; armed: boolean; outFor: number };
  chest: Chest;
  chestAt: THREE.Vector3;
  top: THREE.Vector3;
  site_: PowerSite | null;
  items: Item[];
  spare: VillagePiece[];
  wave: Set<import('../actors/entities').Monster>;
  waveT: number;
  told: string;
  repeatAt: number;
  quietUntil: number;
  tick: CastleTick;
}

const shown = new Map<Race, Built>();
const kept = new Map<Race, Built>();
let building: { race: Race; steps: Generator<void, Built> } | null = null;
let scanT = 0;
let clock = 0;
const tmp = new THREE.Vector3();

const saveOf = (ctx: Ctx, race: Race): CastleSave => (ctx.save.castles[race] ??= freshCastle());
const has = (ctx: Ctx) => (id: Parameters<typeof owned>[1]) => owned(ctx, id) > 0;
const sites = (ctx: Ctx): CastleSite[] => ctx.world.castles?.() ?? [];

function taskNow(ctx: Ctx, race: Race): TaskNow | null {
  const c = saveOf(ctx, race);
  if (!c.met) return null;
  return castleTask(CASTLE_CARDS[race], c, has(ctx));
}

/** Castle-local (lx, ly, lz) → the world cell. */
function cellOf(v: CastleSite, lx: number, ly: number, lz: number): [number, number, number] {
  const at = sitePos(v, lx, lz, tmp);
  return [Math.floor(at.x), v.y + 1 + ly, Math.floor(at.z)];
}

/** Castle-local point (model space) → world. */
function toWorld(b: { centre: THREE.Vector3; yaw: number }, p: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, b.yaw).add(b.centre);
}

/** Whether (x, z) is at a freed castle (safe like a village, hearts come back fast). */
export function inFreedCastle(ctx: Ctx, x: number, z: number): boolean {
  return sites(ctx).some((v) => Math.hypot(v.x + 0.5 - x, v.z + 0.5 - z) < CASTLE_SAFE && saveOf(ctx, v.race).freed);
}

// ─── building, showing and parking ───────────────────────────────────────────

function* build(ctx: Ctx, site: CastleSite): Generator<void, Built> {
  const card = CASTLE_CARDS[site.race];
  const yaw = villageYaw(site);
  const centre = sitePos(site, 0, 0);
  const model = createCastle(ctx.skin, site.race);
  model.root.position.copy(centre);
  model.root.rotation.y = yaw;
  model.root.userData.casts = true;
  cutawayModel(model.root);
  const cells = model.solid.map(([x, y, z]) => cellOf(site, x, y, z));
  const gateCells = model.gate.map(([x, y, z]) => cellOf(site, x, y, z));
  yield;

  const rm = ctx.models.character({ kind: 'parts', id: card.ruler });
  rm.root.userData.casts = true;
  const rulerPos = sitePos(site, ...RULER_SPOT);
  const ruler = { model: rm, pos: rulerPos, yaw: yaw, dancing: false };
  yield;

  let kid: Kid | null = null;
  if (card.kid) {
    const km = ctx.models.character({ kind: 'parts', id: card.kid.model });
    km.root.userData.casts = true;
    kid = { model: km, pos: sitePos(site, ...KID_SPOT), yaw: yaw + Math.PI, mode: 'home', dancing: false };
    yield;
  }

  const pm = createPortal(ctx.skin);
  // the portal always faces the camera, like a toy set out on the table
  const pyaw = 0;
  const ppos = sitePos(site, ...PORTAL_SPOT);
  pm.root.position.copy(ppos);
  pm.root.rotation.y = pyaw;
  pm.root.userData.casts = true;
  yield;

  const chest = createChest(ctx.skin);
  const b0 = { centre, yaw };
  const chestAt = toWorld(b0, model.chest);
  chest.root.position.copy(chestAt);
  chest.root.rotation.y = yaw + model.chest.yaw;
  return {
    site, card, centre, yaw, model, cells, gateCells, gateShut: false,
    ruler, kid,
    portal: { model: pm, pos: ppos, yaw: pyaw, armed: false, outFor: 0 },
    chest, chestAt, top: toWorld(b0, model.top),
    site_: null, items: [], spare: [], wave: new Set(), waveT: 0, told: '', repeatAt: 0, quietUntil: 0,
    tick: { night: 0, alive: 0, open: 0, on: false, low: false, beat: 0 },
  };
}

/** Coming near: into the scene as it was, the gate as the save says, a task under way set out again. */
function show(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx, b.site.race);
  ctx.scene.add(b.model.root, b.ruler.model.root, b.portal.model.root, b.chest.root);
  for (const [x, y, z] of b.cells) ctx.world.setBarrier?.(x, y, z, true);
  b.gateShut = !castleOpen(c);
  if (b.gateShut) for (const [x, y, z] of b.gateCells) ctx.world.setBarrier?.(x, y, z, true);
  // no waking up again on every visit
  b.tick.alive = c.done.length / 3;
  b.tick.open = castleOpen(c) ? 1 : 0;
  b.chest.setOpen(c.freed);
  b.ruler.pos.copy(sitePos(b.site, ...RULER_SPOT));
  b.ruler.yaw = b.yaw;
  if (b.kid) {
    const k = b.kid;
    k.mode = 'home';
    k.pos.copy(sitePos(b.site, ...KID_SPOT));
    k.yaw = b.yaw + Math.PI;
    // the little one is at home once found (or before it got lost)
    k.model.root.visible = true;
    ctx.scene.add(k.model.root);
  }
  b.portal.armed = false;
  b.portal.outFor = 0;
  b.wave = new Set();
  b.waveT = 0;
  b.told = '';
  b.repeatAt = 0;
  b.quietUntil = 0;
  shown.set(b.site.race, b);
  syncPower(ctx, b);
  resume(ctx, b);
}

function park(ctx: Ctx, b: Built): void {
  shown.delete(b.site.race);
  ctx.scene.remove(b.model.root, b.ruler.model.root, b.portal.model.root, b.chest.root);
  if (b.kid) ctx.scene.remove(b.kid.model.root);
  for (const [x, y, z] of b.cells) ctx.world.setBarrier?.(x, y, z, false);
  if (b.gateShut) for (const [x, y, z] of b.gateCells) ctx.world.setBarrier?.(x, y, z, false);
  b.gateShut = false;
  if (b.site_) removeSite(b.site_.key);
  b.site_ = null;
  clearItems(ctx, b);
  setMapMarker(`ck:${b.site.race}`, null);
}

/** The machine is in the power networks while a «power» task waits. */
function syncPower(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx, b.site.race);
  const wants = b.card.tasks.includes('power') && !c.done.includes('power');
  if (wants && !b.site_) {
    b.site_ = { key: `c:${b.site.race}`, socket: toWorld(b, b.model.socket), card: { take: CASTLE_POWER, reach: CASTLE_REACH }, charge: 0, view: offView() };
    addSite(b.site_);
  } else if (!wants && b.site_) {
    removeSite(b.site_.key);
    b.site_ = null;
  }
}

function resume(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx, b.site.race);
  const t = taskNow(ctx, b.site.race);
  if (!t || c.cur !== t.kind) return;
  setUp(ctx, b, t);
}

// ─── tasks ───────────────────────────────────────────────────────────────────

const around = (ctx: Ctx, b: Built, r: [number, number]) => spotAround(ctx, b.centre, r[0], r[1], sitePos(b.site, 0, 22));

function setUp(ctx: Ctx, b: Built, t: TaskNow): void {
  const c = saveOf(ctx, b.site.race);
  if (t.kind === 'find' && b.kid && b.kid.mode !== 'follow') {
    b.kid.pos.copy(around(ctx, b, LOST));
    b.kid.mode = 'lost';
    setMapMarker(`ck:${b.site.race}`, { pos: b.kid.pos, icon: b.card.kid!.face, pointer: true });
  }
  if (t.kind === 'gather') {
    clearItems(ctx, b);
    for (let i = 0; i < t.goal - c.got; i++) {
      const pos = around(ctx, b, SCATTER);
      const model = b.spare.pop() ?? createCastleItem(ctx.skin, b.site.race);
      model.root.position.copy(pos);
      ctx.scene.add(model.root);
      b.items.push({ model, pos, key: `ci:${b.site.race}:${i}` });
    }
    markItems(ctx, b);
  }
}

function clearItems(ctx: Ctx, b: Built): void {
  for (const it of b.items) {
    ctx.scene.remove(it.model.root);
    setMapMarker(it.key, null);
    b.spare.push(it.model);
  }
  b.items = [];
}

function markItems(ctx: Ctx, b: Built): void {
  const p = ctx.player.pos;
  let near: Item | null = null;
  for (const it of b.items) if (!near || it.pos.distanceToSquared(p) < near.pos.distanceToSquared(p)) near = it;
  for (const it of b.items) setMapMarker(it.key, { pos: it.pos, icon: b.card.item, pointer: it === near });
}

function complete(ctx: Ctx, b: Built, t: TaskNow): void {
  const c = saveOf(ctx, b.site.race);
  c.got = 0;
  c.cur = null;
  c.done.push(t.kind);
  b.ruler.model.play('cheer');
  if (b.kid?.model.root.visible) b.kid.model.play('cheer');
  ctx.player.model.play('cheer');
  giveCoins(ctx, CASTLE_COINS, b.ruler.pos);
  b.quietUntil = clock + 5;
  b.told = '';
  b.waveT = 0;
  syncPower(ctx, b);
  if (castleOpen(c)) {
    // the castle comes alive and opens: up to the chest
    sfx.play('sticker');
    voice.say(b.card.thanks, { priority: 8, interrupt: true });
    setTimeout(() => voice.say(b.card.open, { priority: 9, interrupt: true }), 2600);
    setTimeout(() => voice.say('castle_open', { priority: 7 }), 9000);
    b.quietUntil = clock + 14;
  } else voice.say(b.card.thanks, { priority: 8, interrupt: true });
  marks(ctx);
}

/** The chest on the balcony: the race's best prize into the box, its sticker into the album. */
function openChest(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx, b.site.race);
  if (c.freed) return;
  c.freed = true;
  b.chest.setOpen(true);
  addToKit(ctx, b.card.prize, 1);
  const sticker = `c:${b.site.race}`;
  if (!ctx.save.found.includes(sticker)) ctx.save.found.push(sticker);
  sfx.play('sticker');
  ctx.effects.ring(b.chestAt, 0xffd23a, 2.4);
  ctx.effects.poof(b.chestAt.clone().setY(b.chestAt.y + 1), 0xffd23a, 30);
  ctx.effects.coinBurst(b.chestAt.clone().setY(b.chestAt.y + 0.8), 10);
  ctx.player.model.play('cheer');
  voice.say(b.card.prizeLine, { priority: 9, interrupt: true });
  if (b.card.artifact) giveArtifact(ctx, b.card.artifact);
  if (b.card.companion) giveCompanion(ctx, b.card.companion);
  events.emit('castle:freed', { race: b.site.race });
  marks(ctx);
}

/** The party stands by the chest, its gate open and the prize still in it. */
export function chestNear(ctx: Ctx): boolean {
  for (const b of shown.values()) {
    const c = saveOf(ctx, b.site.race);
    if (!castleOpen(c) || c.freed) continue;
    const p = ctx.player.pos;
    if (Math.hypot(p.x - b.chestAt.x, p.z - b.chestAt.z) < CHEST_AT && Math.abs(p.y - b.chestAt.y) < 1.6) return true;
  }
  return false;
}

function talk(ctx: Ctx, b: Built, t: TaskNow | null): void {
  const c = saveOf(ctx, b.site.race);
  b.ruler.model.play('happy');
  if (!c.met) {
    c.met = true;
    voice.say(b.card.hello, { priority: 7, interrupt: true });
    b.quietUntil = clock + 5;
    marks(ctx);
    return;
  }
  if (!t) {
    // open, the prize still up there: the way up again now and then
    if (castleOpen(c) && !c.freed) {
      b.told = 'open';
      b.repeatAt = clock + TALK_AGAIN;
      voice.say(b.card.open, { priority: 7, interrupt: true });
    }
    return;
  }
  b.told = `${t.kind}:${t.blocked}`;
  b.quietUntil = clock + 4;
  b.repeatAt = clock + TALK_AGAIN;
  const line = b.card.ask[t.kind];
  if (line) voice.say(line, { priority: 7, interrupt: true });
  if (t.blocked) setTimeout(() => voice.say(t.kind === 'power' ? 'village_need_power' : 'village_need_music', { priority: 7 }), 4200);
  else if (c.cur !== t.kind) {
    c.cur = t.kind;
    c.got = 0;
    setUp(ctx, b, t);
  }
}

function updateTask(ctx: Ctx, b: Built, dt: number): void {
  const race = b.site.race;
  const c = saveOf(ctx, race);
  const p = ctx.player.pos;
  const t = taskNow(ctx, race);
  const dRuler = Math.hypot(p.x - b.ruler.pos.x, p.z - b.ruler.pos.z);
  const key = t ? `${t.kind}:${t.blocked}` : castleOpen(c) && !c.freed ? 'open' : '';
  const wants = !c.met || (key !== '' && (key !== b.told || clock >= b.repeatAt));
  if (dRuler < TALK_AT && clock >= b.quietUntil && !voice.isSpeaking() && wants) talk(ctx, b, t);
  if (t && dRuler < BUBBLE_AT && (c.cur === t.kind || t.blocked)) {
    const lit = t.blocked ? 0 : Math.min(8, Math.floor((c.got / t.goal) * 8 + 1e-6));
    const picture = t.kind === 'find' ? b.card.kid!.face : t.kind === 'gather' ? b.card.item : taskPicture(VILLAGE_LIKE, t.kind);
    offerBubble({ at: b.ruler.pos.clone().setY(b.ruler.pos.y + b.ruler.model.height + 0.9), picture, lit, d: dRuler });
  }

  // up on the balcony for the first time: Пупся says to open it
  if (castleOpen(c) && !c.freed && b.top.distanceTo(p) < 2.6 && !ctx.save.said.includes(`ctop:${race}`)) {
    ctx.save.said.push(`ctop:${race}`);
    voice.say('castle_chest', { priority: 8 });
  }
  if (ctx.input.take('prompt:chest') && chestNear(ctx)) openChest(ctx, b);

  if (!t || t.blocked || c.cur !== t.kind) return;
  switch (t.kind) {
    case 'find': {
      const k = b.kid!;
      if (k.mode === 'lost' && k.pos.distanceTo(p) < 3) {
        k.mode = 'follow';
        k.model.play('cheer');
        setMapMarker(`ck:${race}`, null);
        voice.say(b.card.kid!.found, { priority: 8, interrupt: true });
        sfx.play('sticker', { pitch: 1.3 });
      }
      if (k.mode === 'follow' && Math.hypot(k.pos.x - b.centre.x, k.pos.z - b.centre.z) < 16) {
        k.mode = 'back';
        c.got = 1;
        complete(ctx, b, t);
      }
      break;
    }
    case 'gather':
      for (const it of [...b.items]) {
        if (Math.hypot(it.pos.x - p.x, it.pos.z - p.z) > 1.4 || Math.abs(it.pos.y - p.y) > 2.5) continue;
        ctx.scene.remove(it.model.root);
        setMapMarker(it.key, null);
        b.items.splice(b.items.indexOf(it), 1);
        b.spare.push(it.model);
        ctx.effects.poof(it.pos.clone().setY(it.pos.y + 0.8), 0xffd23a, 16);
        sfx.play('pickup');
        c.got++;
        if (c.got >= t.goal) complete(ctx, b, t);
      }
      if (b.items.length) markItems(ctx, b);
      break;
    case 'defend':
      c.got += runWave(ctx, b, b.centre, t.goal - c.got, WAVE, dt);
      if (c.got >= t.goal) complete(ctx, b, t);
      break;
    case 'power':
      if (b.site_?.view.on) {
        c.got = 1;
        complete(ctx, b, t);
      }
      break;
    case 'disco':
      if (musicNear(b.centre, DISCO_AT)) {
        c.got += dt;
        if (c.got >= t.goal) complete(ctx, b, t);
      }
      break;
  }
}

/** taskPicture wants a race card only for find / gather, which castles picture themselves. */
const VILLAGE_LIKE = { kidFace: '', item: '' } as Parameters<typeof taskPicture>[0];

// ─── the ruler and the little one ────────────────────────────────────────────

function updateFolk(ctx: Ctx, b: Built, dt: number): void {
  const p = ctx.player.pos;
  const music = musicNear(b.centre, DISCO_AT);
  const r = b.ruler;
  if (Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < 12) faceTo(r, p.x, p.z, dt, 4);
  else {
    const g = sitePos(b.site, RULER_SPOT[0], RULER_SPOT[1] + 5, tmp);
    faceTo(r, g.x, g.z, dt, 2);
  }
  if (music !== r.dancing) {
    r.dancing = music;
    r.model.play(music ? 'dance' : 'idle');
  }
  r.model.root.position.copy(r.pos);
  r.model.root.rotation.y = r.yaw;
  r.model.update(dt, 0);

  const k = b.kid;
  if (!k) return;
  let speed = 0;
  if (k.mode === 'lost') faceTo(k, p.x, p.z, dt, 2);
  else if (k.mode === 'follow') speed = followHero(ctx, k, dt);
  else if (k.mode === 'back') {
    const to = sitePos(b.site, ...KID_SPOT, tmp);
    speed = 2.4;
    if (walkTo(ctx, k, to.x, to.z, speed, dt)) k.mode = 'home';
  }
  const dance = music && speed === 0 && k.mode === 'home';
  if (dance !== k.dancing) {
    k.dancing = dance;
    k.model.play(dance ? 'dance' : 'idle');
  }
  k.model.root.position.copy(k.pos);
  k.model.root.rotation.y = k.yaw;
  k.model.update(dt, speed);
}

// ─── the map and the portal ──────────────────────────────────────────────────

/** Castles seen, met or pointed to by a friend village are marks; pointed to and not freed: the rim arrow; a tap on a met one jumps there. */
function marks(ctx: Ctx): void {
  const explored = new Set(ctx.save.explored);
  for (const v of sites(ctx)) {
    const c = saveOf(ctx, v.race);
    const pointed = (ctx.save.villages[v.race]?.done.length ?? 0) >= 3;
    if (!c.met && !pointed && !explored.has(`${Math.floor(v.x / 16)},${Math.floor(v.z / 16)}`)) continue;
    setMapMarker(`c:${v.race}`, {
      pos: { x: v.x + 0.5, z: v.z + 0.5 },
      icon: CASTLE_CARDS[v.race].mark,
      pointer: pointed && !c.freed,
      onTap: () => jump(ctx, v),
    });
  }
}

function jump(ctx: Ctx, v: CastleSite): void {
  // a jump point only once freed: the first time, the party gets there on foot
  if (!saveOf(ctx, v.race).freed) return;
  if (!hasAbility(ctx, 'portal')) {
    voice.say('portal_soon', { priority: 7, interrupt: true });
    return;
  }
  void travelTo(ctx, sitePos(v, ...PORTAL_SPOT), 0);
}

/** A flight to (x, z) on a castle's square lands in front of its portal (the saucer), not in its walls. */
export function castleLanding(ctx: Ctx, x: number, z: number): { pos: THREE.Vector3; yaw: number } | null {
  const v = sites(ctx).find((s) => Math.max(Math.abs(s.x + 0.5 - x), Math.abs(s.z + 0.5 - z)) <= CASTLE_HALF + 1);
  return v ? { pos: sitePos(v, ...PORTAL_SPOT), yaw: 0 } : null;
}

function updatePortal(ctx: Ctx, b: Built, dt: number): void {
  const g = b.portal;
  // asleep until the castle is freed
  const home = saveOf(ctx, b.site.race).freed ? homeGate() : null;
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

// ─── the loop ────────────────────────────────────────────────────────────────

export function initCastles(ctx: Ctx): void {
  // the castle, its plaza, the ruler and the portal keep their ground from the kit (buildings there go back to the box)
  for (const v of sites(ctx)) {
    const cells: [number, number][] = [];
    const { side, back, front } = CASTLE_KEPT;
    for (let lx = -side; lx <= side; lx++) for (let lz = back; lz <= front; lz++) cells.push(cellOf(v, lx, 0, lz).filter((_, i) => i !== 1) as [number, number]);
    for (let lz = 6; lz <= 16; lz++) for (let lx = -1; lx <= 1; lx++) cells.push(cellOf(v, lx, 0, lz).filter((_, i) => i !== 1) as [number, number]);
    for (const [lx, lz] of [RULER_SPOT, KID_SPOT]) cells.push(cellOf(v, lx, 0, lz).filter((_, i) => i !== 1) as [number, number]);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) cells.push(cellOf(v, PORTAL_SPOT[0] + dx, 0, PORTAL_SPOT[1] + dz).filter((_, i) => i !== 1) as [number, number]);
    reserveCells(cells);
  }
  // a village that became friends points the way to its castle
  events.on('village:task', ({ race, friends }) => {
    if (!friends) return;
    const card = CASTLE_CARDS[race as Race];
    if (!card || !sites(ctx).some((v) => v.race === race)) return;
    setTimeout(() => voice.say(card.pointer, { priority: 8 }), 11000);
    marks(ctx);
  });
  events.on('hero:teleport', () => {
    for (const b of shown.values()) if (b.kid?.mode === 'follow') b.kid.pos.copy(ctx.player.pos).add(new THREE.Vector3(1.2, 0, 1.2));
  });
  events.on('kit:reward', () => (scanT = 0));
  // For automated checks.
  (window as unknown as { __kotoCastles: object }).__kotoCastles = {
    sites: () => sites(ctx).map((v) => ({ ...v, centre: sitePos(v, 0, 0).toArray() })),
    get state() {
      return Object.fromEntries(sites(ctx).map((v) => [v.race, { ...saveOf(ctx, v.race), task: taskNow(ctx, v.race), shown: shown.has(v.race) }]));
    },
    /** Puts the party at castle-local (lx, lz) (default: before the ruler), or up by the chest with 'top' (no fade). */
    /** Puts the party on the plaza (castle-local lx, lz), at the top of the stairs or next to the chest. */
    go: (race: Race, lx: number | 'top' | 'chest' = RULER_SPOT[0], lz = RULER_SPOT[1] + 3) => {
      const v = sites(ctx).find((s) => s.race === race);
      if (!v) return;
      const b = kept.get(race);
      // the free cell beside the chest nearest the stairs (the balcony keeps 3×3 free round it)
      const to = (k: Built) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dz]) => new THREE.Vector3(k.chestAt.x + dx * 1.2, k.top.y, k.chestAt.z + dz * 1.2))
          .filter((q) => !ctx.world.isSolid(Math.floor(q.x), Math.floor(q.y + 0.1), Math.floor(q.z)))
          .sort((q, r) => q.distanceTo(k.top) - r.distanceTo(k.top))[0] ?? k.top.clone();
      const at = typeof lx === 'number' ? sitePos(v, lx, lz) : b ? (lx === 'top' ? b.top.clone() : to(b)) : null;
      if (!at) return;
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(at.x + (h === ctx.player ? 0 : 0.8), at.y + 0.2, at.z + (h === ctx.player ? 0 : 0.8));
        h.body.vel.set(0, 0, 0);
      }
      scanT = 0;
    },
    /** Finishes the task under way. */
    finish: (race: Race) => {
      const b = shown.get(race);
      const t = taskNow(ctx, race);
      if (b && t) complete(ctx, b, t);
    },
    chest: () => ctx.input.press('prompt:chest'),
    chestNear: () => chestNear(ctx),
    items: (race: Race) => shown.get(race)?.items.map((i) => i.pos.toArray()) ?? [],
    kid: (race: Race) => shown.get(race)?.kid?.pos.toArray() ?? null,
    ruler: (race: Race) => shown.get(race)?.ruler.pos.toArray() ?? null,
    top: (race: Race) => kept.get(race)?.top.toArray() ?? null,
    get clock() {
      return clock;
    },
    jump: (race: Race) => {
      const v = sites(ctx).find((s) => s.race === race);
      if (v) jump(ctx, v);
    },
  };
}

function scan(ctx: Ctx): void {
  const p = ctx.playing ? ctx.player.pos : (ctx.house?.centre ?? ctx.camera.position);
  let next: { v: CastleSite; d: number } | null = null;
  for (const v of sites(ctx)) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    const b = shown.get(v.race);
    if (!b && d < SHOW) {
      const k = kept.get(v.race);
      if (k) show(ctx, k);
      else if (!building && (!next || d < next.d)) next = { v, d };
    } else if (b && d > HIDE) park(ctx, b);
    const seen = CASTLE_CARDS[v.race].seen;
    if (ctx.playing && d < SEEN_AT && !ctx.save.said.includes(seen)) {
      ctx.save.said.push(seen);
      voice.say(seen, { priority: 7 });
    }
  }
  if (next) building = { race: next.v.race, steps: build(ctx, next.v) };
  for (const b of shown.values()) syncPower(ctx, b);
  marks(ctx);
}

export function updateCastles(ctx: Ctx, dt: number): void {
  clock += dt;
  scanT -= dt;
  if (scanT <= 0) {
    scanT = SCAN;
    scan(ctx);
  }
  if (building) {
    const step = building.steps.next();
    if (step.done) {
      kept.set(building.race, step.value);
      building = null;
      scanT = 0;
    }
  }
  const night = 1 - ctx.clock.daylight;
  for (const b of shown.values()) {
    const c = saveOf(ctx, b.site.race);
    const k = b.tick;
    const ease = (from: number, to: number) => from + Math.sign(to - from) * Math.min(Math.abs(to - from), dt * WAKE_RATE);
    k.night = night;
    k.alive = ease(k.alive, c.done.length / 3);
    k.open = ease(k.open, castleOpen(c) ? 1 : 0);
    k.on = c.done.includes('power') || !!b.site_?.view.on;
    k.low = !!b.site_?.view.low;
    k.beat = 0;
    b.model.update(dt, k);
    for (const it of b.items) it.model.update(dt, { night, on: true, low: false, beat: 0 });
    // the gate's cells go once it starts opening
    if (b.gateShut && castleOpen(c)) {
      b.gateShut = false;
      for (const [x, y, z] of b.gateCells) ctx.world.setBarrier?.(x, y, z, false);
    }
    if (!ctx.player) continue;
    updatePortal(ctx, b, dt);
    updateFolk(ctx, b, dt);
    if (ctx.playing && !ctx.sleeping) updateTask(ctx, b, dt);
  }
}
