import * as THREE from 'three';
import { yawOf, type Hero } from '../actors/entities';
import { createTv, type Tv } from '../assets/babusia';
import { PIT_HALF, SLIDE_FOOT, createBallPit, createChessCorner, createEasel, createSlideTower, createToyRug, type BallPit, type ChessCorner, type Easel, type SlideTower, type ToyRug } from '../assets/playroom';
import { HOME, HOUSE } from '../content/house';
import { CHESS, CHESS_LINES, EASEL, EASEL_LINES, SLIDE, pickMove, slidePhase, walkTime, type SlidePhase } from '../content/playroom';
import type { Ctx } from '../core/ctx';
import { cutawayModel } from '../render/skins/cutaway';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { eating, sitOn } from './food';
import { isInside } from './house';
import { selectedBuilding } from './kit';
import { registerTv } from './tvNews';

/**
 * The playroom at home (DESIGN.md «Home»; the toys in assets/playroom.ts, the rules in
 * content/playroom.ts). The toys stand at `HOME.playroom`, relative to the house's corner, and move
 * with it if the house is ever put up elsewhere.
 * - The slide: walking up to the tower's foot, the hero climbs the ladder by itself, whizzes down the
 *   chute («whee»), splashes into the ball pit (the balls hop) and hops out on its edge; helpers in
 *   the house follow one after another, now and then. Nothing to press, and nobody is ever held: a
 *   push away on the climb gets off at the foot, and the whole ride is a few seconds.
 * - The chess corner: standing still at a pouf the hero sits, a helper sits across, and the pieces
 *   play a pretend game by themselves for 20 s, ending in a cheerful draw; a step gets up.
 * - The easel: a tap shows the next drawing. The toy rug: a tap on the ball rolls it.
 * - The TV: the same monster news as at the grandmothers' (systems/tvNews.ts); only Пупся comments.
 */

/** Taps reach the toys from this close (blocks), with the hero inside the house. */
const TAP_NEAR = 10;
/** The ladder's foot counts from this close. */
const FOOT_REACH = 0.6;
/** A hero wading through the pit makes the balls hop this often (s). */
const WADE_EVERY = 0.28;

interface Toys {
  /** The house's corner the toys were placed for. */
  origin: THREE.Vector3;
  tower: SlideTower;
  pit: BallPit;
  chess: ChessCorner;
  easel: Easel;
  rug: ToyRug;
  tv: Tv;
  /** The tower's heading (its +Z runs towards the pit). */
  yaw: number;
  /** House-relative layout (floor at y = 0): the tower, the pit, where a rider lands, sinks and hops out. */
  rel: { tower: THREE.Vector3; pit: THREE.Vector3; landing: THREE.Vector3; sink: THREE.Vector3; exit: THREE.Vector3 };
}

interface Rider {
  h: Hero;
  t: number;
  walk: number;
  start: THREE.Vector3;
  phase: SlidePhase;
  /** Where the ride put the hero last frame (a hero carried off by something else is let go). */
  at: THREE.Vector3 | null;
}

let toys: Toys | null = null;
const riders: Rider[] = [];
const pending: { h: Hero; at: number }[] = [];
let armed = true;
let stillAtFoot = 0;
const wade = new WeakMap<Hero, number>();

interface Game {
  by: Hero;
  seat: 0 | 1;
  partner: Hero | null;
  t: number;
  next: number;
  turn: 0 | 1;
  said: number;
  done: boolean;
}
let game: Game | null = null;
let stillAtPouf = 0;
let chessLine = 0;
let rumourIn = -1;
let easelLine = 0;
let easelSaidAt = -Infinity;
let easelSayIn = -1;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const seatPos = new THREE.Vector3();

/** Whether a hero is on the slide right now (anything that moves heroes can leave them be). */
export const onSlide = (h: Hero): boolean => riders.some((r) => r.h === h);

/** Tower-frame point → house-relative (floor y = 0). */
function fromTower(t: Toys | { yaw: number; rel: { tower: THREE.Vector3 } }, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(t.yaw);
  const s = Math.sin(t.yaw);
  return out.set(t.rel.tower.x + local.x * c + local.z * s, local.y, t.rel.tower.z - local.x * s + local.z * c);
}

/** House-relative → world. */
function world(t: Toys, rel: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(t.origin.x + rel.x, t.origin.y + 1 + rel.y, t.origin.z + rel.z);
}

/** How far a house-relative spot is from the inside of the walls (negative: outside). */
function margin(x: number, z: number): number {
  const i = HOUSE.interior;
  return Math.min(x - i.x0, i.x1 - x, z - i.z0, i.z1 - z);
}

/** Builds the toys once, up front (under the title: their shaders are ready before play), at the house. */
export function initPlayroom(ctx: Ctx): void {
  if (!ctx.house || toys) return;
  const { skin, scene } = ctx;
  const P = HOME.playroom;
  const towerAt = new THREE.Vector3(P.slide.dx, 0, P.slide.dz);
  const pitAt = new THREE.Vector3(P.ballPit.dx, 0, P.ballPit.dz);
  const yaw = Math.atan2(pitAt.x - towerAt.x, pitAt.z - towerAt.z);
  const reach = Math.hypot(pitAt.x - towerAt.x, pitAt.z - towerAt.z) - 0.4;
  // the ladder on the side with more room (towards the middle of the house when both fit)
  const frame = { yaw, rel: { tower: towerAt } };
  const sides = ([1, -1] as const).map((s) => {
    fromTower(frame, tmp.set(s * SLIDE_FOOT, 0, 0), tmp2);
    return { s, m: margin(tmp2.x, tmp2.z) - (Math.abs(tmp2.x - HOUSE.sizeX / 2) * 0.01) };
  });
  const side = sides[0].m >= sides[1].m ? 1 : -1;
  const tower = createSlideTower(skin, reach, side);
  const pit = createBallPit(skin);
  const chess = createChessCorner(skin);
  const easel = createEasel(skin);
  const rug = createToyRug(skin);
  const tv = createTv(skin);
  cutawayModel(tower.root);
  cutawayModel(easel.root);

  // where a rider lands, sinks into the balls and hops out (the pit's side with the most room, never towards the tower)
  const t0 = { yaw, rel: { tower: towerAt } };
  const landing = new THREE.Vector3();
  tower.bottom(1, tmp);
  fromTower(t0, tmp, landing);
  const sink = landing.clone().lerp(pitAt, 0.45).setY(0);
  const others = [P.chess, P.easel, P.tv, P.slide].map((s) => [s.dx, s.dz]);
  const back = tmp.set(towerAt.x - pitAt.x, 0, towerAt.z - pitAt.z).normalize().clone();
  let exit = pitAt.clone().add(new THREE.Vector3(0, 0, PIT_HALF + 0.45));
  let best = -Infinity;
  for (const [dx, dz] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ]) {
    if (dx * back.x + dz * back.z > 0.5) continue;
    const e = new THREE.Vector3(pitAt.x + dx * (PIT_HALF + 0.45), 0, pitAt.z + dz * (PIT_HALF + 0.45));
    let score = Math.min(1.5, margin(e.x, e.z));
    for (const [ox, oz] of others) if (Math.hypot(e.x - ox, e.z - oz) < 1.1) score -= 1;
    if (score > best) {
      best = score;
      exit = e;
    }
  }

  toys = { origin: ctx.house.origin.clone(), tower, pit, chess, easel, rug, tv, yaw, rel: { tower: towerAt, pit: pitAt, landing, sink, exit } };
  for (const o of [tower.root, pit.root, chess.root, easel.root, rug.root, tv.root]) {
    o.userData.casts = true;
    scene.add(o);
  }
  placeToys(toys);
  registerTv(tv, { host: () => null, reachable: () => !!ctx.house && isInside(ctx.house, ctx.player.pos) });
  expose(ctx);
}

/** Puts every toy at its spot round the house's corner. */
function placeToys(t: Toys): void {
  const P = HOME.playroom;
  const at = (o: THREE.Object3D, dx: number, dz: number, yaw = 0) => {
    o.position.set(t.origin.x + dx, t.origin.y + 1, t.origin.z + dz);
    o.rotation.y = yaw;
  };
  at(t.tower.root, P.slide.dx, P.slide.dz, t.yaw);
  at(t.pit.root, P.ballPit.dx, P.ballPit.dz);
  at(t.chess.root, P.chess.dx, P.chess.dz);
  at(t.easel.root, P.easel.dx, P.easel.dz);
  at(t.rug.root, P.toyRug.dx, P.toyRug.dz);
  at(t.tv.root, P.tv.dx, P.tv.dz);
}

const moving = (ctx: Ctx) => Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
const busy = (ctx: Ctx) => ctx.sleeping || ctx.napping || eating() || !ctx.playing;
const clearTap = (ctx: Ctx) => !eating() && !selectedBuilding() && !ctx.map.isOpen && !ctx.album.isOpen && !ctx.sleeping && !ctx.napping;

export function updatePlayroom(ctx: Ctx, dt: number): void {
  const t = toys;
  if (!t || !ctx.house) return;
  if (!ctx.house.origin.equals(t.origin)) {
    t.origin.copy(ctx.house.origin);
    placeToys(t);
  }
  t.tv.update(dt);
  t.easel.update(dt);
  t.rug.update(dt);
  const landed = t.chess.update(dt);
  for (let i = 0; i < landed; i++) sfx.play('click', { pitch: 1.25 + Math.random() * 0.4, volume: 0.55 });

  if (ctx.playing) {
    const inside = isInside(ctx.house, ctx.player.pos);
    slide(ctx, t, dt, inside);
    chess(ctx, t, dt, inside);
    taps(ctx, t, inside);
    wading(ctx, t, dt);
  }
  t.pit.update(dt);

  if (easelSayIn >= 0) {
    easelSayIn -= dt;
    if (easelSayIn < 0) voice.say(EASEL_LINES[easelLine++ % EASEL_LINES.length], { priority: 4 });
  }
  if (rumourIn >= 0) {
    rumourIn -= dt;
    if (rumourIn < 0 && !ctx.save.said.includes('chess_rumour')) {
      voice.say('chess_rumour', { priority: 6 });
      ctx.save.said.push('chess_rumour');
    }
  }
}

// ─── the slide ──────────────────────────────────────────────────────────────

function footWorld(t: Toys, out: THREE.Vector3): THREE.Vector3 {
  return world(t, fromTower(t, t.tower.foot, out), out);
}

function startRide(t: Toys, h: Hero): void {
  footWorld(t, tmp);
  const d = Math.hypot(h.pos.x - tmp.x, h.pos.z - tmp.z);
  riders.push({ h, t: 0, walk: walkTime(d), start: h.pos.clone(), phase: 'walk', at: null });
  if (h.dancing) h.dancing = false;
  h.model.play('idle');
}

/** Ends a ride where it stands: back at the foot while still climbing, otherwise out on the pit's edge. */
function release(t: Toys, r: Rider): void {
  const early = r.phase === 'walk' || r.phase === 'climb';
  if (early) footWorld(t, tmp);
  else world(t, t.rel.exit, tmp);
  r.h.body.pos.copy(tmp);
  r.h.body.vel.set(0, 0, 0);
  r.h.model.root.position.copy(tmp);
  r.h.model.root.rotation.set(0, r.h.yaw, 0);
  r.h.model.play('idle');
  const i = riders.indexOf(r);
  if (i >= 0) riders.splice(i, 1);
}

/** Puts a rider where the ride says, `t` seconds in. */
function ride(ctx: Ctx, t: Toys, r: Rider, dt: number): void {
  const h = r.h;
  // a portal, a jump to the grandmothers' or a fly took the hero away: the ride is over, nothing moves them back
  if (r.at && Math.hypot(h.pos.x - r.at.x, h.pos.z - r.at.z) > 2) {
    h.model.play('idle');
    h.model.root.rotation.set(0, h.yaw, 0);
    riders.splice(riders.indexOf(r), 1);
    return;
  }
  const before = r.phase;
  const { phase, f } = slidePhase(r.t, r.walk);
  r.phase = phase;
  if (phase === 'done') {
    release(t, r);
    return;
  }
  const pos = tmp;
  let yaw = h.yaw;
  let sit = false;
  let walkDir: THREE.Vector3 | null = null;
  const towerW = world(t, t.rel.tower, new THREE.Vector3());
  switch (phase) {
    case 'walk': {
      footWorld(t, tmp2);
      pos.copy(r.start).lerp(tmp2, f);
      walkDir = tmp2.clone().sub(r.start);
      if (walkDir.lengthSq() > 0.01) yaw = yawOf(walkDir.x, walkDir.z);
      break;
    }
    case 'climb': {
      footWorld(t, pos);
      world(t, fromTower(t, t.tower.ladderTop, tmp2), tmp2);
      pos.lerp(tmp2, f);
      yaw = yawOf(towerW.x - pos.x, towerW.z - pos.z);
      walkDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      break;
    }
    case 'cross': {
      world(t, fromTower(t, t.tower.ladderTop, tmp2), pos);
      world(t, fromTower(t, t.tower.chuteTop, tmp2), tmp2);
      const dir = tmp2.clone().sub(pos);
      pos.lerp(tmp2, f);
      yaw = f < 0.6 ? yawOf(dir.x, dir.z) : t.yaw;
      walkDir = dir;
      break;
    }
    case 'slide': {
      if (before !== 'slide') {
        sfx.play('whee', { pitch: 0.95 + Math.random() * 0.15, volume: h === ctx.player ? 1 : 0.6 });
        if (h === ctx.player && !ctx.save.said.includes('slide_first')) {
          ctx.save.said.push('slide_first');
          voice.say('slide_first', { priority: 6, interrupt: true });
        }
      }
      t.tower.bottom(Math.pow(f, 1.6), tmp2);
      world(t, fromTower(t, tmp2, pos), pos);
      pos.y += 0.06;
      yaw = t.yaw;
      sit = true;
      break;
    }
    case 'sink': {
      if (before !== 'sink') {
        const p = t.pit.root.position;
        world(t, t.rel.landing, tmp2);
        t.pit.splash(tmp2.x - p.x, tmp2.z - p.z, 1);
        sfx.play('plop', { pitch: 0.55, volume: h === ctx.player ? 1 : 0.6 });
        sfx.play('click', { pitch: 0.75, volume: 0.5 });
      }
      world(t, t.rel.landing, pos);
      world(t, t.rel.sink, tmp2);
      const e = 1 - (1 - f) * (1 - f);
      pos.lerp(tmp2, e);
      pos.y = t.origin.y + 1 + 0.14;
      yaw = t.yaw;
      sit = true;
      break;
    }
    case 'hop': {
      world(t, t.rel.sink, pos);
      world(t, t.rel.exit, tmp2);
      const dir = tmp2.clone().sub(pos);
      pos.lerp(tmp2, f);
      pos.y = t.origin.y + 1 + 0.14 * (1 - f) + Math.sin(Math.PI * f) * 0.55;
      yaw = yawOf(dir.x, dir.z);
      break;
    }
  }
  h.yaw = yaw;
  h.body.pos.copy(pos);
  h.body.vel.set(0, 0, 0);
  // a little walking speed on the way up, so the legs go
  if (walkDir && walkDir.lengthSq() > 0.0001) h.body.vel.copy(walkDir.normalize().multiplyScalar(2.2)).setY(0);
  h.stuckTime = 0;
  h.model.play(sit ? 'sit' : 'idle');
  h.model.root.position.copy(pos);
  h.model.root.rotation.set(0, yaw, 0);
  r.at = (r.at ?? new THREE.Vector3()).copy(pos);
  r.t += dt;
}

function slide(ctx: Ctx, t: Toys, dt: number, inside: boolean): void {
  // nothing keeps a hero on the slide through a night, a meal or a far jump
  for (const r of [...riders]) if (busy(ctx)) release(t, r);
  if (busy(ctx)) {
    pending.length = 0;
    return;
  }

  const p = ctx.player;
  const mine = riders.find((r) => r.h === p);
  // a push away from the tower on the way up gets off at the foot
  if (mine && (mine.phase === 'walk' || mine.phase === 'climb') && mine.t < mine.walk + SLIDE.leaveBefore) {
    const tw = t.tower.root.position;
    const mx = ctx.input.moveX;
    const mz = ctx.input.moveY;
    const m = Math.hypot(mx, mz);
    const tx = tw.x - p.pos.x;
    const tz = tw.z - p.pos.z;
    if (m > 0.5 && (mx * tx + mz * tz) / (m * (Math.hypot(tx, tz) || 1)) < -0.3) {
      release(t, mine);
      armed = false;
      pending.length = 0;
    }
  }

  if (!onSlide(p) && !onPouf(p)) {
    footWorld(t, tmp);
    const near = inside && Math.hypot(p.pos.x - tmp.x, p.pos.z - tmp.z) < FOOT_REACH && Math.abs(p.pos.y - tmp.y) < 0.7;
    if (!near) {
      armed = true;
      stillAtFoot = 0;
    } else if (armed) {
      stillAtFoot += dt;
      if (moving(ctx) || stillAtFoot > 0.3) {
        armed = false;
        startRide(t, p);
        // the helpers in the house come after, one after another, now and then
        let k = 1;
        for (const h of ctx.heroes.values()) {
          if (h === p || onSlide(h) || game?.partner === h || !isInside(ctx.house!, h.pos)) continue;
          if (Math.random() > SLIDE.helperChance) continue;
          pending.push({ h, at: k++ * SLIDE.helperGap });
        }
      }
    }
  }

  for (const q of [...pending]) {
    q.at -= dt;
    if (q.at > 0) continue;
    pending.splice(pending.indexOf(q), 1);
    if (q.h === ctx.player || onSlide(q.h) || game?.partner === q.h || !isInside(ctx.house!, q.h.pos)) continue;
    startRide(t, q.h);
  }

  for (const r of [...riders]) ride(ctx, t, r, dt);
}

/** Heroes walking through the pit make the balls hop round their feet. */
function wading(ctx: Ctx, t: Toys, dt: number): void {
  const c = t.pit.root.position;
  for (const h of ctx.heroes.values()) {
    if (onSlide(h)) continue;
    const x = h.pos.x - c.x;
    const z = h.pos.z - c.z;
    const inPit = Math.abs(x) < PIT_HALF - 0.15 && Math.abs(z) < PIT_HALF - 0.15 && Math.abs(h.pos.y - c.y) < 0.6;
    const walking = Math.hypot(h.body.vel.x, h.body.vel.z) > 0.6;
    const left = (wade.get(h) ?? 0) - dt;
    if (inPit && walking && left <= 0) {
      t.pit.splash(x, z, 0.4);
      wade.set(h, WADE_EVERY);
    } else wade.set(h, left);
  }
}

// ─── the chess corner ───────────────────────────────────────────────────────

const onPouf = (h: Hero): boolean => !!game && (game.by === h || game.partner === h);

function getUp(): void {
  if (!game) return;
  for (const h of [game.by, game.partner]) {
    if (!h) continue;
    h.model.play('idle');
    h.model.root.rotation.set(0, h.yaw, 0);
  }
  game = null;
  stillAtPouf = 0;
}

function chess(ctx: Ctx, t: Toys, dt: number, inside: boolean): void {
  const p = ctx.player;
  // a step gets up; so does anything that carries the hero off the pouf (a portal, a jump)
  if (game) t.chess.seats[game.seat].getWorldPosition(seatPos);
  if (game && (moving(ctx) || game.by !== p || busy(ctx) || !inside || Math.hypot(p.pos.x - seatPos.x, p.pos.z - seatPos.z) > 1)) getUp();
  if (!game) {
    if (busy(ctx) || !inside || onSlide(p)) {
      stillAtPouf = 0;
      return;
    }
    let found: 0 | 1 | null = null;
    t.chess.seats.forEach((s, i) => {
      s.getWorldPosition(seatPos);
      if (Math.hypot(p.pos.x - seatPos.x, p.pos.z - seatPos.z) < 0.55 && Math.abs(p.pos.y - (t.origin.y + 1)) < 0.8) found = i as 0 | 1;
    });
    stillAtPouf = found !== null && !moving(ctx) ? stillAtPouf + dt : 0;
    if (found === null || stillAtPouf < CHESS.sitAfter) return;
    // the nearest helper not on the slide sits across
    let partner: Hero | null = null;
    let best = 14;
    for (const h of ctx.heroes.values()) {
      if (h === p || onSlide(h)) continue;
      const d = h.pos.distanceTo(p.pos);
      if (d < best) {
        best = d;
        partner = h;
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].h === partner) pending.splice(i, 1);
    t.chess.reset();
    game = { by: p, seat: found, partner, t: 0, next: 0.8, turn: found, said: 0, done: false };
    sfx.play('switch', { pitch: 1.5 });
  }
  const g = game;
  sitOn(g.by, t.chess.seats[g.seat]);
  g.by.model.play('sit');
  if (g.partner) {
    sitOn(g.partner, t.chess.seats[g.seat ? 0 : 1]);
    g.partner.model.play('sit');
    g.partner.stuckTime = 0;
    if (g.partner.dancing) g.partner.dancing = false;
  }
  if (g.done) return;
  g.t += dt;
  g.next -= dt;
  if (g.next <= 0) {
    const m = pickMove(t.chess.board, g.turn, Math.random);
    if (m) t.chess.hop(m.from, m.to);
    g.turn = g.turn ? 0 : 1;
    g.next = CHESS.every[0] + Math.random() * (CHESS.every[1] - CHESS.every[0]);
  }
  if (g.said < CHESS.comments.length && g.t >= CHESS.comments[g.said]) {
    g.said++;
    voice.say(CHESS_LINES[chessLine++ % CHESS_LINES.length], { priority: 4 });
  }
  if (g.t >= CHESS.game) {
    g.done = true;
    t.chess.cheer();
    sfx.play('sticker');
    voice.say('chess_home_draw', { priority: 6, interrupt: true });
    if (!ctx.save.said.includes('chess_rumour')) rumourIn = CHESS.rumourAfter;
  }
}

// ─── taps: the easel, the ball ──────────────────────────────────────────────

function taps(ctx: Ctx, t: Toys, inside: boolean): void {
  if (!ctx.input.taps.length || !inside || !clearTap(ctx)) return;
  const p = ctx.player.pos;
  t.easel.sheet.getWorldPosition(tmp);
  if (Math.hypot(tmp.x - p.x, tmp.z - p.z) < TAP_NEAR && tappedAt(ctx, tmp, 0.5)) {
    t.easel.next();
    sfx.play('click', { pitch: 1.35 });
    sfx.play('switch', { pitch: 1.8, volume: 0.5 });
    // Пупся's word now and then, a moment after the new drawing shows
    if (ctx.clock.elapsed - easelSaidAt >= EASEL.gap) {
      easelSaidAt = ctx.clock.elapsed;
      easelSayIn = 0.7;
    }
    return;
  }
  t.rug.ball.getWorldPosition(tmp);
  if (Math.hypot(tmp.x - p.x, tmp.z - p.z) < TAP_NEAR && tappedAt(ctx, tmp, 0.35)) {
    // it rolls away from the hero, a little to the side now and then
    const a = Math.atan2(tmp.x - p.x, tmp.z - p.z) + (Math.random() - 0.5) * 0.8;
    const r = t.rug.root.rotation.y;
    t.rug.roll(Math.sin(a - r), Math.cos(a - r));
    sfx.play('click', { pitch: 0.8 });
    sfx.play('jump', { pitch: 1.6, volume: 0.35 });
  }
}

// ─── for automated checks ───────────────────────────────────────────────────

function expose(ctx: Ctx): void {
  const px = (o: THREE.Vector3) => {
    const v = o.clone().project(ctx.camera);
    const r = ctx.renderer.domElement.getBoundingClientRect();
    return [Math.round(r.left + (v.x * 0.5 + 0.5) * r.width), Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height)];
  };
  const rel = (o: THREE.Vector3) => (toys ? [+(o.x - toys.origin.x).toFixed(2), +(o.z - toys.origin.z).toFixed(2)] : null);
  (window as unknown as { __kotoPlayroom: object }).__kotoPlayroom = {
    get state() {
      const t = toys;
      if (!t) return null;
      return {
        riders: riders.map((r) => ({ hero: r.h.id, phase: r.phase, t: +r.t.toFixed(2) })),
        pending: pending.map((q) => q.h.id),
        chess: game ? { by: game.by.id, partner: game.partner?.id ?? null, t: +game.t.toFixed(1), done: game.done } : null,
        easel: t.easel.drawing,
        ball: rel(t.rug.ball.getWorldPosition(new THREE.Vector3())),
        said: ctx.save.said.filter((s) => s === 'slide_first' || s === 'chess_rumour'),
      };
    },
    /** House-relative spots: the ladder's foot, where a rider lands and hops out, the poufs. */
    get spots() {
      const t = toys;
      if (!t) return null;
      return {
        foot: rel(footWorld(t, new THREE.Vector3())),
        exit: [+t.rel.exit.x.toFixed(2), +t.rel.exit.z.toFixed(2)],
        landing: [+t.rel.landing.x.toFixed(2), +t.rel.landing.z.toFixed(2)],
        poufs: t.chess.seats.map((s) => rel(s.getWorldPosition(new THREE.Vector3()))),
      };
    },
    /** Puts the player `back` blocks out from the ladder's foot (0: on it). */
    toFoot(back = 0) {
      const t = toys;
      if (!t) return;
      footWorld(t, tmp);
      const tw = t.tower.root.position;
      const d = Math.hypot(tmp.x - tw.x, tmp.z - tw.z) || 1;
      ctx.player.body.pos.set(tmp.x + ((tmp.x - tw.x) / d) * back, tmp.y + 0.05, tmp.z + ((tmp.z - tw.z) / d) * back);
      ctx.player.body.vel.set(0, 0, 0);
    },
    /** Puts the player on a pouf (then standing still sits down). */
    toPouf(i = 0) {
      const t = toys;
      if (!t) return;
      t.chess.seats[i].getWorldPosition(tmp);
      ctx.player.body.pos.set(tmp.x, t.origin.y + 1.05, tmp.z);
      ctx.player.body.vel.set(0, 0, 0);
    },
    /** Where to tap (px): 'easel', 'ball', 'tv'. */
    screen(which: 'easel' | 'ball' | 'tv') {
      const t = toys;
      if (!t) return null;
      const o = which === 'easel' ? t.easel.sheet : which === 'ball' ? t.rug.ball : t.tv.screen;
      return px(o.getWorldPosition(new THREE.Vector3()));
    },
    /** The game's clock jumps ahead (the chess game's end without waiting 20 s). */
    skipChess(s: number) {
      if (game) game.t += s;
    },
  };
}
