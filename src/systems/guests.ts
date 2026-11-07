import * as THREE from 'three';
import type { CharacterModel, ItemId } from '../contracts';
import type { Hero } from '../actors/entities';
import { HOSTS } from '../content/babusia';
import {
  GUEST,
  GUEST_GREET,
  GUEST_LINES,
  GUEST_PUFF,
  guestBit,
  guestCandidates,
  guestDue,
  guestGift,
  pickGuest,
  type GuestGift,
  type GuestId,
  type GuestPost,
} from '../content/guests';
import { HOME } from '../content/house';
import type { LineId } from '../content/lines';
import { RACE_CARDS } from '../content/villages';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { RACES, type Race } from '../world/villages';
import { giveItem } from './babusia';
import { eating, sitOn } from './food';
import { campfireLogs } from './house';
import { selectedBuilding } from './kit';
import { faceTo, giveCoins, walkTo } from './tasks';

/**
 * Guests at the home campfire (DESIGN.md «Home»). Standing still at one of the two logs by the fire,
 * the hero sits down and the party with them; a step gets up. From the evening, every second day at
 * most, when all is calm and the party sits there, someone they know comes over: a puff at the
 * yard's edge, they walk up, wave, sit on the other log, say hello, one bit of their life, give a
 * gift (coins or a kitchen product) and say goodbye, then walk off and vanish in a puff. If the party
 * goes away before the gift, it goes into the postbox (systems/mail.ts opens it). Who comes and what
 * they bring: content/guests.ts.
 */

/** Standing still this long at a log sits the party down. */
const STILL = 0.4;
const REACH = 0.7;
/** Each line holds at least this long (an unvoiced line plays nothing). */
const HOLD = 2.4;
const HOLD_MAX = 8;
const WALK = 2.2;
/** A walk that has not arrived by then snaps. */
const WALK_MAX = 9;
const WAVE = 1.3;
/** Behind the log, where the guest steps up to it from. */
const BEHIND = 0.6;
/** The gift floats from the guest to the hero this long. */
const GIFT_FLY = 1.4;

type Phase = 'come' | 'wave' | 'hello' | 'bit' | 'gift' | 'bye' | 'go';

interface Visit {
  who: GuestId;
  model: CharacterModel;
  pos: THREE.Vector3;
  yaw: number;
  phase: Phase;
  t: number;
  /** The guest's seat (the middle of the other log) and the spot behind it. */
  seat: THREE.Object3D;
  stand: THREE.Vector3;
  gate: THREE.Vector3;
  log: number;
  gift: GuestGift;
  given: boolean;
  /** On the log now. */
  sat: boolean;
  bit: LineId;
  /** The product floating over to the hero. */
  thing: { o: THREE.Object3D; from: THREE.Vector3; t: number } | null;
}

let seated: { log: number; heroes: [Hero, THREE.Object3D][] } | null = null;
let still = 0;
/** The hero has to step off a log before sitting down again. */
let armed = true;
let sitT = 0;
let visit: Visit | null = null;
const models = new Map<GuestId, CharacterModel>();
const tmp = new THREE.Vector3();
const fwd = new THREE.Vector3();

const post = (ctx: Ctx) => ctx.save.home.post as GuestPost;
const metRaces = (ctx: Ctx): Race[] => RACES.filter((r) => ctx.save.villages[r]?.met);

function candidates(ctx: Ctx): GuestId[] {
  const b = ctx.save.babusia;
  return guestCandidates({ met: metRaces(ctx), host: b.host, hiDone: ctx.save.tales.done.includes('babusia_hi') });
}

function fire(ctx: Ctx): THREE.Vector3 | null {
  return ctx.house ? ctx.house.campfire.root.position : null;
}

/** The party is sitting on a log by the home fire. */
export const sittingByFire = () => !!seated;

// ─── sitting ─────────────────────────────────────────────────────────────────

function seatNear(ctx: Ctx): { log: number; seat: number } | null {
  const p = ctx.player.pos;
  let best: { log: number; seat: number } | null = null;
  let bd = REACH;
  campfireLogs().forEach((l, i) => {
    if (visit && visit.log === i && visit.phase !== 'come') return;
    for (let s = 0; s < 3; s++) {
      l.seats[s].getWorldPosition(tmp);
      const d = Math.hypot(p.x - tmp.x, p.z - tmp.z);
      if (d < bd && Math.abs(p.y - tmp.y) < 1.2) {
        bd = d;
        best = { log: i, seat: s };
      }
    }
  });
  return best;
}

function sitDown(ctx: Ctx, log: number, seat: number): void {
  const seats = campfireLogs()[log].seats;
  const free = [0, 1, 2].filter((s) => s !== seat);
  const heroes: [Hero, THREE.Object3D][] = [];
  const player = ctx.player;
  // Пупся on the ground at the log's end; the children on the log, the player where they stood
  for (const h of ctx.heroes.values()) {
    let o: THREE.Object3D | undefined;
    if (h.id === 'pupsia') o = seats[3];
    else if (h === player) o = seats[seat];
    else {
      const s = free.shift();
      if (s !== undefined) o = seats[s];
    }
    if (!o) continue;
    heroes.push([h, o]);
  }
  // the player is Пупся: her seat on the log goes to whoever is left without one
  if (player.id === 'pupsia') {
    const left = [...ctx.heroes.values()].find((h) => !heroes.some(([x]) => x === h));
    if (left) heroes.push([left, seats[seat]]);
  }
  seated = { log, heroes };
  sitT = 0;
  ctx.napping = true;
  for (const [h, o] of heroes) {
    sitOn(h, o);
    h.model.play('sit');
  }
  sfx.play('switch', { pitch: 1.5 });
}

function standUp(ctx: Ctx): void {
  const s = seated;
  if (!s) return;
  seated = null;
  armed = false;
  still = 0;
  if (!ctx.sleeping) {
    ctx.napping = false;
    for (const [h] of s.heroes) h.model.play('idle');
  }
}

function sitting(ctx: Ctx, dt: number): void {
  const moving = Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
  if (seated) {
    if (moving || ctx.sleeping || eating()) {
      standUp(ctx);
      return;
    }
    ctx.napping = true;
    sitT += dt;
    for (const [h, o] of seated.heroes) {
      sitOn(h, o);
      h.model.play('sit');
    }
    return;
  }
  const near = seatNear(ctx);
  if (!near) {
    armed = true;
    still = 0;
    return;
  }
  const free = !moving && armed && !ctx.napping && !ctx.sleeping && !eating() && !selectedBuilding() && !ctx.map.isOpen;
  still = free ? still + dt : 0;
  if (still >= STILL) sitDown(ctx, near.log, near.seat);
}

// ─── the guest ───────────────────────────────────────────────────────────────

function modelOf(ctx: Ctx, who: GuestId): CharacterModel {
  let m = models.get(who);
  if (m) return m;
  const part = who === 'yulia' || who === 'olia' ? HOSTS[who].part : RACE_CARDS[who].folk.elder;
  m = ctx.models.character({ kind: 'parts', id: part });
  m.root.userData.casts = true;
  // the hostesses come with empty hands: no poles, no cup, no notebook, the glass on its cord
  for (const n of ['poleL', 'poleR', 'cup', 'glass', 'notebook', 'pencil']) {
    const o = m.root.getObjectByName(n);
    if (o) o.visible = false;
  }
  models.set(who, m);
  return m;
}

function calm(ctx: Ctx, at: THREE.Vector3): boolean {
  if (voice.quietSeconds() < 1.5 || ctx.sleeping) return false;
  if (ctx.boss?.alive && ctx.boss.inZone(at.x, at.z)) return false;
  // home is safe: a monster turned away at the fence of light does not count, only one coming at the party
  return !ctx.monsters.some((m) => m.alive && m.state === 'chase' && Math.hypot(m.pos.x - at.x, m.pos.z - at.z) < GUEST.calm);
}

function ground(ctx: Ctx, x: number, z: number): number {
  return ctx.world.groundHeight(Math.floor(x), Math.floor(z));
}

/** Someone comes: the turn moves on, the day is marked, a puff at the yard's edge. */
function invite(ctx: Ctx, force?: GuestId): boolean {
  const f = fire(ctx);
  const s = seated;
  if (!f || !s || !ctx.house) return false;
  const cands = candidates(ctx);
  const ps = post(ctx);
  const turn = ps.guestTurn ?? 0;
  const who = force ?? pickGuest(cands, turn);
  if (!who) return false;
  // (only a forced call can find one still here)
  if (visit) {
    visit.model.root.visible = false;
    visit.thing?.o.removeFromParent();
    visit = null;
  }
  const logIdx = s.log === 0 ? 1 : 0;
  const log = campfireLogs()[logIdx];
  if (!log) return false;
  ps.guestDay = ctx.save.day;
  ps.guestTurn = turn + 1;
  const model = modelOf(ctx, who);
  const o = ctx.house.origin;
  const g = HOME.guestGate;
  const gate = new THREE.Vector3(o.x + g.dx, 0, o.z + g.dz);
  gate.y = ground(ctx, gate.x, gate.z);
  const seat = log.seats[1];
  seat.getWorldPosition(tmp);
  seat.getWorldDirection(fwd);
  const stand = new THREE.Vector3(tmp.x - fwd.x * BEHIND, 0, tmp.z - fwd.z * BEHIND);
  stand.y = ground(ctx, stand.x, stand.z);
  visit = {
    who,
    model,
    pos: gate.clone(),
    yaw: Math.atan2(stand.x - gate.x, stand.z - gate.z),
    phase: 'come',
    t: 0,
    seat,
    stand,
    gate,
    log: logIdx,
    gift: guestGift(cands.length ? cands : [who], turn),
    given: false,
    sat: false,
    bit: guestBit(cands.length ? cands : [who], who, turn),
    thing: null,
  };
  model.play('idle');
  model.root.visible = true;
  model.root.position.copy(gate);
  model.root.rotation.set(0, visit.yaw, 0);
  if (!model.root.parent) ctx.scene.add(model.root);
  ctx.effects.poof(tmp.copy(gate).setY(gate.y + 0.9), GUEST_PUFF[who], 22);
  sfx.play('poof', { pitch: 1.2 });
  voice.say(GUEST_GREET, { priority: 6 });
  return true;
}

function say(v: Visit, id: LineId, phase: Phase): void {
  v.phase = phase;
  v.t = 0;
  voice.say(id, { priority: 7, interrupt: true });
}

/** The line is over (an unvoiced one holds a moment anyway; someone else talking on and on is not waited for). */
const said = (v: Visit) => v.t >= HOLD && (!voice.isSpeaking() || v.t >= HOLD_MAX);

function give(ctx: Ctx, v: Visit): void {
  v.given = true;
  const g = v.gift;
  if ('coins' in g) {
    giveCoins(ctx, g.coins, v.pos);
    return;
  }
  giveItem(ctx, g.item, 1);
  try {
    const o = ctx.models.item(g.item);
    const from = v.pos.clone().setY(v.pos.y + 1.6);
    o.position.copy(from);
    o.scale.setScalar(0.01);
    ctx.scene.add(o);
    v.thing = { o, from, t: 0 };
  } catch {
    /* no model: the sparkle and the line still say it */
  }
  sfx.play('sticker', { pitch: 1.2 });
  ctx.effects.ring(ctx.player.pos, GUEST_PUFF[v.who], 1.6);
  voice.say(`item_${g.item}` as LineId, { priority: 6 });
}

/** The party went away before the gift: it waits in the postbox. */
function mail(ctx: Ctx, v: Visit): void {
  v.given = true;
  const g = v.gift;
  const box = ctx.save.home.post.box;
  if ('coins' in g) box.push({ kind: 'gift', from: v.who, coins: g.coins, day: ctx.save.day });
  else box.push({ kind: 'gift', from: v.who, item: g.item as ItemId, day: ctx.save.day });
}

function floatThing(ctx: Ctx, v: Visit, dt: number): void {
  const th = v.thing;
  if (!th) return;
  th.t += dt;
  const k = Math.min(1, th.t / GIFT_FLY);
  const to = tmp.copy(ctx.player.pos).setY(ctx.player.pos.y + 2.1);
  th.o.position.lerpVectors(th.from, to, Math.min(1, k * 1.6));
  th.o.position.y += Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.6;
  th.o.rotation.y += dt * 3;
  th.o.scale.setScalar(k < 0.8 ? Math.min(1, k * 4) : Math.max(0.01, (1 - k) * 5));
  if (k < 1) return;
  ctx.effects.sparkle(to, 0xfff1c8);
  th.o.removeFromParent();
  v.thing = null;
}

function guest(ctx: Ctx, dt: number): void {
  const v = visit;
  if (!v) return;
  v.t += dt;
  floatThing(ctx, v, dt);
  const f = fire(ctx)!;
  const p = ctx.player.pos;
  const gone = ctx.sleeping || Math.hypot(p.x - f.x, p.z - f.z) > GUEST.leave;
  // the party left before the gift: goodbye anyway (if still in earshot), the gift into the postbox
  if (gone && !v.given) {
    mail(ctx, v);
    if (Math.hypot(p.x - f.x, p.z - f.z) < 30 && !ctx.sleeping) say(v, GUEST_LINES[v.who].bye, 'bye');
    else {
      v.phase = 'bye';
      v.t = HOLD;
    }
  }
  let speed = 0;
  switch (v.phase) {
    case 'come':
      speed = WALK;
      if (walkTo(ctx, v, v.stand.x, v.stand.z, WALK, dt) || v.t > WALK_MAX) {
        v.pos.copy(v.stand);
        v.phase = 'wave';
        v.t = 0;
        speed = 0;
        v.model.play('happy');
      }
      break;
    case 'wave':
      faceTo(v, p.x, p.z, dt, 6);
      if (v.t >= WAVE) {
        v.seat.getWorldPosition(v.pos);
        v.seat.getWorldDirection(fwd);
        v.yaw = Math.atan2(fwd.x, fwd.z);
        v.model.play('sit');
        v.sat = true;
        say(v, GUEST_LINES[v.who].hello, 'hello');
      }
      break;
    case 'hello':
      if (said(v)) say(v, v.bit, 'bit');
      break;
    case 'bit':
      if (said(v)) {
        v.phase = 'gift';
        v.t = 0;
        give(ctx, v);
      }
      break;
    case 'gift':
      if (said(v) && !v.thing) say(v, GUEST_LINES[v.who].bye, 'bye');
      break;
    case 'bye':
      if (v.sat && v.t > 0.6) {
        // up from the log, a wave, and off
        v.sat = false;
        v.pos.copy(v.stand);
        v.model.play('happy');
      }
      if (said(v)) {
        v.phase = 'go';
        v.t = 0;
        v.model.play('idle');
      }
      break;
    case 'go':
      speed = WALK;
      if (walkTo(ctx, v, v.gate.x, v.gate.z, WALK, dt) || v.t > WALK_MAX) {
        ctx.effects.poof(tmp.copy(v.pos).setY(v.pos.y + 0.9), GUEST_PUFF[v.who], 22);
        sfx.play('poof', { pitch: 1.2 });
        v.model.root.visible = false;
        v.thing?.o.removeFromParent();
        visit = null;
        return;
      }
      break;
  }
  v.model.root.position.copy(v.pos);
  v.model.root.rotation.set(0, v.yaw, 0);
  v.model.update(dt, speed);
}

export function updateGuests(ctx: Ctx, dt: number): void {
  if (!ctx.playing || !ctx.house) return;
  sitting(ctx, dt);
  if (visit) guest(ctx, dt);
  else if (seated && sitT >= GUEST.sitFor && guestDue(ctx.clock.t, ctx.save.day, post(ctx).guestDay) && calm(ctx, fire(ctx)!)) invite(ctx);
}

export function initGuests(ctx: Ctx): void {
  // For automated checks.
  (window as unknown as { __kotoGuests: object }).__kotoGuests = {
    get state() {
      const ps = post(ctx);
      return {
        seated: seated ? { log: seated.log, heroes: seated.heroes.map(([h]) => h.id) } : null,
        visit: visit ? { who: visit.who, phase: visit.phase, t: +visit.t.toFixed(1), gift: visit.gift, given: visit.given, pos: visit.pos.toArray().map((x) => +x.toFixed(2)) } : null,
        guestDay: ps.guestDay,
        guestTurn: ps.guestTurn ?? 0,
        day: ctx.save.day,
        time: +ctx.clock.t.toFixed(3),
        candidates: candidates(ctx),
        box: ps.box,
        coins: ctx.save.coins,
        why: (() => {
          const f = fire(ctx);
          if (!f) return null;
          const near = ctx.monsters.filter((m) => m.alive).map((m) => Math.hypot(m.pos.x - f.x, m.pos.z - f.z));
          return { quiet: +voice.quietSeconds().toFixed(1), monster: near.length ? +Math.min(...near).toFixed(1) : null, calm: calm(ctx, f), sitT: +sitT.toFixed(1) };
        })(),
      };
    },
    /** Puts the hero right at a log's middle seat (0: by the fire's right, 1: in front of it). */
    toLog: (i = 1) => {
      const l = campfireLogs()[i];
      if (!l) return;
      l.seats[1].getWorldPosition(tmp);
      ctx.player.body.pos.set(tmp.x, tmp.y - 0.3, tmp.z);
      ctx.player.body.vel.set(0, 0, 0);
    },
    /** Marks a village met (no hello). */
    meet: (race: Race) => {
      const v = (ctx.save.villages[race] ??= { met: false, done: [], cur: null, got: 0, nights: 0, daily: -1 });
      v.met = true;
    },
    /** Lets a guest come now (forgets the last one's day). */
    due: () => (post(ctx).guestDay = -1),
    /** Calls a guest at once while the party sits (optionally who). */
    invite: (who?: GuestId) => invite(ctx, who),
  };
}
