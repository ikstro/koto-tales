import * as THREE from 'three';
import { Arrow } from '../actors/entities';
import { makeBody, placeOnGround } from '../actors/physics';
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
}

const walkers: Walker[] = [];
const tmp = new THREE.Vector3();
/** «Yay» at most this often (s): the trick is often, the line is a treat. */
const YAY_EVERY = 75;
/** A healer reaches hurt heroes this close. */
const HEAL_NEAR = 6;
const PUFF = 0xffe3a3;

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

function shoot(ctx: Ctx, w: Walker, to: THREE.Vector3): void {
  const from = new THREE.Vector3(w.body.pos.x + Math.sin(w.yaw) * 0.4, w.body.pos.y + w.model.height * 0.6, w.body.pos.z + Math.cos(w.yaw) * 0.4);
  const obj = createArrow(ctx.skin);
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

export function updateCompanions(ctx: Ctx, dt: number): void {
  if (!walkers.length) return;
  const dancers = new Set(ctx.monsters.filter((m) => m.state === 'dance'));
  walkers.forEach((w, i) => {
    w.trickT += dt;
    w.yayT += dt;
    const speed = stepFollower(ctx, w, followSlot(ctx, i + 1, tmp, 3.2), dt, PUFF);
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
