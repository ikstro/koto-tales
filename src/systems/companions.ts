import * as THREE from 'three';
import { Arrow, turnTowards, yawOf, type Monster } from '../actors/entities';
import { makeBody, placeOnGround, stepBody } from '../actors/physics';
import { createArrow } from '../assets/props';
import type { CharacterModel } from '../contracts';
import { COMPANIONS, type CompanionCard } from '../content/companions';
import { HERO_STATS } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { followSlot, shootStep, stepFollower, type Follower } from './follow';
import { tuneOf } from './tune';

/**
 * Companions (content/companions.ts): friends who walk with the party, behind it next to the
 * robot helper's place, and do one trick — shoot (the robot helper's way), heal or light.
 * They cannot be hurt and never leave. `giveCompanion` is called by a reward, a tale's end or a
 * castle's chest; the save keeps who has joined.
 */
interface Walker extends Follower {
  id: string;
  card: CompanionCard;
  model: CharacterModel;
  /** Seconds since its trick last worked (heal) and since it last said «yay». */
  trickT: number;
  yayT: number;
  /** Lent to another system (systems/pets.ts: Сірко at his bowl and on his errand), which moves it. */
  lent?: boolean;
}

const walkers: Walker[] = [];

/** A friend another system drives for a while: it stops following, guarding and doing its trick. */
export function lendCompanion(id: string): Follower & { model: CharacterModel } | null {
  const w = walkers.find((x) => x.id === id);
  if (!w) return null;
  w.lent = true;
  return w;
}

/** The friend goes back to walking with the party or guarding its building. */
export function returnCompanion(id: string): void {
  const w = walkers.find((x) => x.id === id);
  if (w) w.lent = false;
}

/** Where a friend is now (null: not with the party). */
export function companionPos(id: string): THREE.Vector3 | null {
  return walkers.find((x) => x.id === id)?.body.pos ?? null;
}
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
/** «Yay» at most this often (s): the trick is often, the line is a treat. */
const YAY_EVERY = 75;
/** A healer reaches hurt heroes this close. */
const HEAL_NEAR = 6;
const PUFF = 0xffe3a3;
/** Where a guard stands: this many blocks from its building's centre, on its front side. */
const GUARD_AT = 1.15;
const GUARD_DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

function spawn(ctx: Ctx, id: string): void {
  const card = COMPANIONS[id];
  if (!card || walkers.some((w) => w.id === id)) return;
  const model = ctx.models.character(card.model);
  const w: Walker = { id, card, model, body: makeBody(0.3, model.height), yaw: ctx.player.yaw, moving: false, stuck: 0, fireCd: 1.5, trickT: 0, yayT: YAY_EVERY * 0.5 };
  // companions take the places after the robot helper's (it walks in the middle)
  const at = followSlot(ctx, walkers.length + 1, tmp, 3.2);
  placeOnGround(ctx.world, w.body, at.x, at.z);
  model.update(0, 0);
  ctx.scene.add(model.root);
  walkers.push(w);
}

export function initCompanions(ctx: Ctx): void {
  for (const w of walkers.splice(0)) {
    ctx.scene.remove(w.model.root);
    w.model.dispose();
  }
  for (const id of ctx.save.companions ?? []) spawn(ctx, id);
}

/** A friend joins: it pops up next to the party and says hello. */
export function giveCompanion(ctx: Ctx, id: string): boolean {
  if (!COMPANIONS[id]) {
    console.warn(`[companions] no card "${id}"`);
    return false;
  }
  if (ctx.save.companions.includes(id)) return false;
  ctx.save.companions.push(id);
  spawn(ctx, id);
  const w = walkers.find((x) => x.id === id);
  if (w) {
    ctx.effects.poof(tmp.copy(w.body.pos).setY(w.body.pos.y + 0.6), PUFF, 18);
    w.model.play('cheer');
  }
  sfx.play('sticker');
  setTimeout(() => voice.say(COMPANIONS[id].lines.hi, { priority: 7 }), 2200);
  events.emit('companion:joined', { id });
  return true;
}

/** At night no monster appears here: a companion with the light trick stands close. */
export function companionLight(x: number, z: number): boolean {
  return walkers.some((w) => w.card.trick.kind === 'light' && Math.hypot(w.body.pos.x - x, w.body.pos.z - z) < w.card.trick.reach);
}

/** What a friend throws other than an arrow: a pine cone, a sting. */
const SHOTS = {
  cone: { geo: new THREE.BoxGeometry(0.22, 0.28, 0.22), mat: new THREE.MeshBasicMaterial({ color: 0x8a5a2b, toneMapped: false }) },
  sting: { geo: new THREE.BoxGeometry(0.08, 0.08, 0.3), mat: new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false }) },
};

function shoot(ctx: Ctx, w: Walker, to: THREE.Vector3): void {
  const from = new THREE.Vector3(w.body.pos.x + Math.sin(w.yaw) * 0.4, w.body.pos.y + w.model.height * 0.6, w.body.pos.z + Math.cos(w.yaw) * 0.4);
  const trick = w.card.trick;
  const look = trick.kind === 'shoot' && trick.shot ? SHOTS[trick.shot] : null;
  const obj = look ? new THREE.Mesh(look.geo, look.mat) : createArrow(ctx.skin);
  obj.position.copy(from);
  ctx.scene.add(obj);
  const a = new Arrow(obj, from);
  a.by = ctx.player;
  a.damage = HERO_STATS.arrowDamage * tuneOf(ctx).helperDamage;
  a.vel.subVectors(to, from).normalize().multiplyScalar(HERO_STATS.arrowSpeed);
  a.vel.y += 1.2;
  ctx.arrows.push(a);
  w.model.play('attack');
  sfx.play('arrow', { volume: 0.5 });
}

function yay(w: Walker): void {
  if (w.yayT < YAY_EVERY || voice.isSpeaking()) return;
  w.yayT = 0;
  voice.say(w.card.lines.yay, { priority: 3 });
}

/** Where a guarding friend belongs: by the front of its building; false while none stands. */
function guardPost(ctx: Ctx, w: Walker, out: THREE.Vector3): boolean {
  const id = w.card.guards;
  if (!id) return false;
  const b = ctx.save.placed.find((p) => p.id === id);
  if (!b) return false;
  const d = GUARD_DIRS[b.rot & 3]!;
  out.set(b.x + 0.5 + d[0] * GUARD_AT, b.y, b.z + 0.5 + d[1] * GUARD_AT);
  return true;
}

/** One frame of guarding its post: over there if far (a pop when the kennel moved), then rest. */
function stepGuard(ctx: Ctx, w: Walker, post: THREE.Vector3, dt: number): number {
  const dx = post.x - w.body.pos.x;
  const dz = post.z - w.body.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 24) placeOnGround(ctx.world, w.body, post.x, post.z);
  let vx = 0;
  let vz = 0;
  if (dist > 0.8) {
    const spd = Math.min(4.5, dist * 2.2 + 0.5);
    vx = (dx / dist) * spd;
    vz = (dz / dist) * spd;
    w.yaw = turnTowards(w.yaw, yawOf(dx, dz), dt * 10);
  }
  const k = 1 - Math.exp(-dt * 10);
  w.body.vel.x += (vx - w.body.vel.x) * k;
  w.body.vel.z += (vz - w.body.vel.z) * k;
  stepBody(ctx.world, w.body, dt);
  return Math.hypot(w.body.vel.x, w.body.vel.z);
}

export function updateCompanions(ctx: Ctx, dt: number): void {
  if (!walkers.length) return;
  const dancers = new Set(ctx.monsters.filter((m) => m.state === 'dance'));
  walkers.forEach((w, i) => {
    w.trickT += dt;
    w.yayT += dt;
    if (w.lent) return;
    const guarding = guardPost(ctx, w, tmp2);
    const speed = guarding
      ? stepGuard(ctx, w, tmp2, dt)
      : stepFollower(ctx, w, followSlot(ctx, i + 1, tmp, 3.2), dt, PUFF);
    // resting at its post: lying through the day, up and watching at night
    if (guarding && speed < 0.1 && !ctx.sleeping) w.model.play(ctx.clock.daylight < 0.35 ? 'idle' : 'sleep');
    const t = w.card.trick;
    if (t.kind === 'shoot') {
      if (shootStep(ctx, w, t.reach, dancers, dt, (to) => shoot(ctx, w, to))) yay(w);
    } else if (t.kind === 'heal' && w.trickT >= t.every) {
      const hurt = [...ctx.heroes.values()].find((h) => h.hearts < HERO_STATS.maxHearts && h.pos.distanceTo(w.body.pos) < HEAL_NEAR);
      if (hurt) {
        w.trickT = 0;
        hurt.hearts += 1;
        ctx.effects.sparkle(tmp.copy(hurt.pos).setY(hurt.pos.y + 1.2), 0xee6a82);
        w.model.play('cast');
        sfx.play('pickup', { pitch: 1.3 });
        yay(w);
      }
    }
    w.model.root.position.copy(w.body.pos);
    w.model.root.rotation.y = w.yaw;
    w.model.update(dt, speed);
  });
}

/** For automated checks and ?give=: who walks with the party. */
export function exposeCompanions(ctx: Ctx): void {
  (window as unknown as { __kotoCompanions: object }).__kotoCompanions = {
    give: (id: string) => giveCompanion(ctx, id),
    get list() {
      return walkers.map((w) => ({ id: w.id, pos: w.body.pos.toArray().map((v) => +v.toFixed(1)) }));
    },
  };
}
