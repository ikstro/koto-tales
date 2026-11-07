import * as THREE from 'three';
import { createPostbox, type PostboxModel } from '../assets/postbox';
import { HOME } from '../content/house';
import { LINES, type LineId } from '../content/lines';
import { REWARDS } from '../content/progress';
import { MAIL, letterDue, letterWay, nextToOpen, openThing, staleLetters, type PostThing } from '../content/post';
import type { TaleCard } from '../content/tales';
import type { Ctx } from '../core/ctx';
import { setMapMarker } from '../ui/map';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { giveItem } from './babusia';
import { homeDistance } from './house';
import { grantReward, hasAbility } from './progress';
import { letterBusy, letterOpenable, lettersCalm, routeLetters, sendLetter } from './tales';
import { giveCoins } from './tasks';

/**
 * The postbox in the heroes' yard (DESIGN.md «Home»; rules in content/post.ts). A tale's letter
 * that is due near home flies into it; far away, once the portal is there, it is put in at once and
 * waits (a plane mark on the map points home, Пупся says so once); not opened by the next morning
 * or within five minutes, it flies to the party by itself. The kit box's endless rewards come home
 * as parcels, the guests' gifts wait here too. A tap on the postbox, or walking right up to it,
 * opens one thing, oldest first; the flag stays up while more wait.
 */

let model: PostboxModel | null = null;
/** The postbox's foot and the point a letter drops into, in the world. */
const at = new THREE.Vector3();
const slot = new THREE.Vector3();
const top = new THREE.Vector3();
/** Seconds each letter has waited this session (a load starts it again). */
const waited = new WeakMap<PostThing, number>();
let near = false;
let nearT = 0;
let cleanT = 0;
let emptySaid = -1e9;
let marked = false;
/** Confetti: the palette's colours (DESIGN.md «Palette»). */
const CONFETTI = [0xe0583f, 0xffd23a, 0x2f7fd6, 0x3fa142, 0xee6a82];

/** Puts the postbox up in the yard with the house (before the title, so nothing is built mid-play). */
export function buildPostbox(ctx: Ctx): void {
  const h = ctx.house;
  if (!h || model) return;
  model = createPostbox(ctx.skin);
  at.copy(h.origin).add(new THREE.Vector3(HOME.postbox.dx, 1, HOME.postbox.dz));
  model.root.position.copy(at);
  slot.copy(model.slot).add(at);
  top.copy(at).setY(at.y + model.slot.y - 0.3);
  ctx.scene.add(model.root);
}

const post = (ctx: Ctx) => ctx.save.home.post;
const letterOk = (ctx: Ctx) => (tale: string) => letterOpenable(ctx, tale);

/** A letter goes into the box (`seen`: it flew in while the party was near). */
function postLetter(ctx: Ctx, tale: string, seen: boolean): void {
  const l: PostThing = { kind: 'letter', tale, day: ctx.save.day };
  post(ctx).box.push(l);
  waited.set(l, 0);
  if (seen) sfx.play('clink', { pitch: 1.4 });
  voice.say(seen ? 'post_letter_home' : 'post_waiting', { priority: 6 });
}

/** Where a due letter goes (true: the postbox took it). */
function route(ctx: Ctx, t: TaleCard): boolean {
  // one letter at a time: while one waits, the next waits with it
  if (post(ctx).box.some((x) => x.kind === 'letter')) return true;
  const way = letterWay(homeDistance(ctx, ctx.player.pos), hasAbility(ctx, 'portal'));
  if (way === 'hero') return false;
  if (way === 'box') {
    postLetter(ctx, t.id, false);
    return true;
  }
  return sendLetter(ctx, t.id, { to: slot.clone(), drop: () => postLetter(ctx, t.id, true) });
}

function confetti(ctx: Ctx): void {
  const p = top.clone().setY(top.y + 0.6);
  for (const c of CONFETTI) ctx.effects.poof(p, c, 8);
  ctx.effects.ring(at, 0xffd23a, 1.2);
}

/** Opens the oldest thing that can be opened; false: nothing waits. */
function openOne(ctx: Ctx): boolean {
  const box = post(ctx).box;
  const i = nextToOpen(box, letterOk(ctx));
  if (i < 0 || !model) return false;
  const [thing] = box.splice(i, 1);
  const o = openThing(thing);
  model.open(o.kind === 'parcel' || o.kind === 'gift');
  sfx.play('click');
  switch (o.kind) {
    case 'letter':
      // the plane (or the stork) comes out of the slot and lands at the hero's feet: the tale begins
      if (!sendLetter(ctx, o.tale, { from: slot.clone(), quick: true })) box.splice(i, 0, thing);
      break;
    case 'parcel':
      confetti(ctx);
      sfx.play('sticker', { pitch: 1.15 });
      grantReward(ctx, o.reward);
      if (o.reward.coins) ctx.effects.coinBurst(top.clone().setY(top.y + 0.8), Math.min(12, o.reward.coins));
      else ctx.hud.kitBump();
      ctx.player.model.play('cheer');
      voice.say(o.reward.line, { priority: 7, interrupt: true });
      break;
    case 'gift':
      confetti(ctx);
      sfx.play('sticker', { pitch: 1.25 });
      if (o.coins) giveCoins(ctx, o.coins, top);
      if (o.item) {
        giveItem(ctx, o.item, 1);
        ctx.hud.kitBump();
      }
      ctx.player.model.play('cheer');
      voice.say('post_gift', { priority: 7, interrupt: true });
      if (o.item && `item_${o.item}` in LINES) {
        const line = `item_${o.item}` as LineId;
        setTimeout(() => voice.say(line, { priority: 6 }), 3200);
      }
      break;
    case 'nothing':
      ctx.effects.poof(top, 0xfff4d8, 10);
      break;
  }
  return true;
}

/** A tap on an empty postbox: the door wiggles and clicks; now and then Пупся says what the flag means. */
function tapEmpty(ctx: Ctx): void {
  model?.open(false);
  sfx.play('click', { pitch: 1.3 });
  if (ctx.clock.elapsed - emptySaid > 90) {
    emptySaid = ctx.clock.elapsed;
    voice.say('post_empty', { priority: 5 });
  }
}

/** A letter waited long enough: it flies to the party itself. */
function letterFindsParty(ctx: Ctx, dt: number): void {
  if (ctx.sleeping || letterBusy()) return;
  const box = post(ctx).box;
  for (const l of box) {
    if (l.kind !== 'letter' || !letterOpenable(ctx, l.tale)) continue;
    const w = (waited.get(l) ?? 0) + dt;
    waited.set(l, w);
    if (!letterDue(l, ctx.save.day, w) || !lettersCalm(ctx)) continue;
    const far = homeDistance(ctx, ctx.player.pos) > MAIL.homeNear;
    if (!sendLetter(ctx, l.tale, far ? {} : { from: slot.clone() })) continue;
    box.splice(box.indexOf(l), 1);
    if (far) voice.say('post_letter_came', { priority: 7, interrupt: true });
    return;
  }
}

export function initMail(ctx: Ctx): void {
  routeLetters((t) => route(ctx, t));
  const p = post(ctx);
  p.box = staleLetters(p.box, ctx.save.tales.done, ctx.save.tales.cur);
  // For automated checks.
  (window as unknown as { __kotoMail: object }).__kotoMail = {
    get box() {
      return post(ctx).box.map((t) => ({ ...t }));
    },
    get at() {
      return at.toArray();
    },
    /** Where the postbox is on screen (px), to tap it. */
    get screen() {
      const v = top.clone().project(ctx.camera);
      const r = ctx.renderer.domElement.getBoundingClientRect();
      return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
    },
    /** Puts a thing in the box as if it came (a gift from a guest, a parcel). */
    push: (t: PostThing) => post(ctx).box.push(t),
    /** The next letter is due now: it goes the way the postbox decides. */
    letter: () => {
      ctx.save.tales.after = Math.min(ctx.save.tales.after, ctx.save.day - 1);
    },
    /** Test only: the box has given the portal / every listed reward (the next one is endless: a parcel). */
    portal: () => void (ctx.save.progress.got.includes('portal') || ctx.save.progress.got.push('portal')),
    listed: () => {
      for (const r of REWARDS) if (!ctx.save.progress.got.includes(r.id)) ctx.save.progress.got.push(r.id);
    },
    /** Every waiting letter has waited long enough. */
    expire: () => {
      for (const t of post(ctx).box) if (t.kind === 'letter') waited.set(t, MAIL.waitSeconds);
    },
    open: () => openOne(ctx),
    /** Test only: the monsters round the party are gone (a letter comes only when all is calm). */
    quiet: () => {
      for (const m of ctx.monsters) m.alive = false;
    },
  };
}

export function updateMail(ctx: Ctx, dt: number): void {
  if (!model) return;
  model.update(dt);
  if (!ctx.playing) return;
  const p = post(ctx);
  if ((cleanT -= dt) <= 0) {
    cleanT = 1;
    p.box = staleLetters(p.box, ctx.save.tales.done, ctx.save.tales.cur);
  }
  const ok = letterOk(ctx);
  const waiting = nextToOpen(p.box, ok) >= 0;
  model.setFull(waiting);
  // a letter waiting at home: a plane on the map by the house, with the rim arrow
  const letter = p.box.some((t) => t.kind === 'letter' && ok(t.tale));
  if (letter !== marked) {
    marked = letter;
    setMapMarker('post', letter ? { pos: at, icon: 'tale-plane', pointer: true } : null);
  }
  letterFindsParty(ctx, dt);
  if (ctx.sleeping || ctx.napping) return;

  // walking right up opens one thing; standing there, the next a moment later
  const h = ctx.player.pos;
  const d = Math.hypot(h.x - at.x, h.z - at.z);
  const close = d < MAIL.openNear && Math.abs(h.y - at.y) < 2;
  if (close && !near) {
    nearT = 0;
    openOne(ctx);
  } else if (close && waiting && (nearT += dt) >= MAIL.againAfter) {
    nearT = 0;
    openOne(ctx);
  }
  near = close;
  // a tap on the postbox (seen within a few blocks only, so a far tap is never taken)
  if (d < 16 && tappedAt(ctx, top, 0.6) && !openOne(ctx)) tapEmpty(ctx);
}
