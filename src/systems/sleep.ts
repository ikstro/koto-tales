import * as THREE from 'three';
import { placeOnGround } from '../actors/physics';
import { HERO_ORDER, HERO_STATS } from '../content/heroes';
import { HOUSE } from '../content/house';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { isInside } from './house';
import { tentNear } from './kit';
import { guestNear } from './villages';

/**
 * Sleep (DESIGN.md «Sleep»): from evening till dawn, inside the house or next to one of
 * the child's tents, a moon piece breathes by the action pieces. A tap lays the three
 * heroes down — in their beds at home, side by side in the tent — Пупся says good night,
 * the screen goes dark under stars, and it is morning: hearts full, a new day, saved.
 */

const EVENING = 0.6;
const DAWN = 0.93;
/** Where the clock lands: early morning, the sun just up. */
const MORNING = 0.02;

/** Lying spots inside a tent, around its centre, heads to the back. */
const TENT_SPOTS: Record<string, { dx: number; dy: number; dz: number; yaw: number }> = {
  lyosha: { dx: -0.55, dy: 0.12, dz: 0.1, yaw: 0 },
  solomiia: { dx: 0.55, dy: 0.12, dz: 0.1, yaw: 0 },
  pupsia: { dx: 0, dy: 0.08, dz: 0.95, yaw: 0.4 },
};

const isNightTime = (t: number) => t >= EVENING && t < DAWN;

let hintedDay = -1;

type Place =
  | { where: 'home' }
  | { where: 'tent'; centre: THREE.Vector3 }
  | { where: 'guest'; centre: THREE.Vector3; spots: Record<string, { pos: THREE.Vector3; yaw: number }>; wake: THREE.Vector3 };

/** Where the party could sleep right now, if anywhere: home, a tent, a village's guest house. */
export function sleepPlace(ctx: Ctx): Place | null {
  if (!ctx.playing || ctx.sleeping || !isNightTime(ctx.clock.t)) return null;
  if (ctx.house && isInside(ctx.house, ctx.player.pos)) return { where: 'home' };
  const guest = guestNear(ctx);
  if (guest) return { where: 'guest', ...guest };
  const tent = tentNear(ctx);
  return tent ? { where: 'tent', centre: tent.centre } : null;
}

/** The first time each night the party is somewhere to sleep, Пупся says so. */
export function updateSleep(ctx: Ctx): void {
  const place = sleepPlace(ctx);
  if (place && hintedDay !== ctx.save.day) {
    hintedDay = ctx.save.day;
    voice.say('sleep_hint', { priority: 5 });
  }
  if (ctx.input.take('prompt:moon') && place) void sleep(ctx, place);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function sleep(ctx: Ctx, place: NonNullable<ReturnType<typeof sleepPlace>>): Promise<void> {
  ctx.sleeping = true;
  ctx.napping = true;
  const house = ctx.house;
  const home = place.where === 'home' && house;
  // lie down: models straight onto their spots (the bodies wait), blankets over, door shut
  for (const id of HERO_ORDER) {
    const h = ctx.heroes.get(id);
    if (!h) continue;
    const r = h.model.root;
    if (home) {
      const s = HOUSE.sleepSpots[id];
      r.position.set(house.origin.x + s.dx, house.origin.y + s.dy, house.origin.z + s.dz);
      r.rotation.y = s.yaw;
    } else if (place.where === 'tent') {
      const s = TENT_SPOTS[id];
      r.position.set(place.centre.x + s.dx, place.centre.y + s.dy, place.centre.z + s.dz);
      r.rotation.y = s.yaw;
    } else if (place.where === 'guest') {
      const s = place.spots[id];
      r.position.copy(s.pos);
      r.rotation.y = s.yaw;
    }
    r.visible = true;
    h.model.play('sleep');
  }
  if (home) {
    for (const b of Object.values(house.beds)) b?.fold(0);
    house.door.setOpen(0);
    sfx.play('door');
  }
  voice.say('sleep_night', { priority: 9, interrupt: true });
  events.emit('hero:sleep', { hero: ctx.player.id });
  await wait(2400);
  ctx.hud.stars(true);
  await ctx.hud.fade(true);
  await wait(1400);

  // the night passes
  ctx.clock.t = MORNING;
  ctx.save.stats.slept++;
  for (const h of ctx.heroes.values()) {
    h.hearts = HERO_STATS.maxHearts;
    h.invulnerable = 2;
  }
  const centre = home ? house.centre : place.where !== 'home' ? place.centre : ctx.player.pos;
  for (const m of ctx.monsters) if (Math.hypot(m.pos.x - centre.x, m.pos.z - centre.z) < 18) m.alive = false;
  await wait(300);
  ctx.hud.stars(false);
  await ctx.hud.fade(false);

  // morning: stretch and get up
  for (const h of ctx.heroes.values()) h.model.play('wake');
  if (home) {
    for (const b of Object.values(house.beds)) b?.fold(1);
    house.door.setOpen(1);
  }
  sfx.play('wake');
  await wait(1500);
  const at = home
    ? house.wake
    : place.where === 'tent'
      ? place.centre.clone().add(new THREE.Vector3(0, 0, 2.4))
      : place.where === 'guest'
        ? place.wake
        : ctx.player.pos;
  let i = 0;
  for (const h of ctx.heroes.values()) {
    const side = h === ctx.player ? 0 : i++ === 0 ? -1 : 1;
    placeOnGround(ctx.world, h.body, at.x + side * 0.9, at.z + (side ? 0.9 : 0));
    h.yaw = 0;
    h.model.play('idle');
  }
  ctx.napping = false;
  ctx.sleeping = false;
  events.emit('sleep:done', { where: place.where });
}
