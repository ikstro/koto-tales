import * as THREE from 'three';
import type { CharacterModel, HeroId } from '../contracts';
import { Hero, turnTowards, yawOf } from '../actors/entities';
import { placeOnGround, stepBody } from '../actors/physics';
import { HEROES, HERO_ORDER, HERO_STATS } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { castBolt, fireArrow, nearestMonster } from './combat';
import { isInside } from './house';
import { tuneOf } from './tune';

const tmp = new THREE.Vector3();

/** A hero already standing in the world (the start ritual's models), taken over as is. */
export interface HeroHandoff {
  model: CharacterModel;
  /** Where it stands; without it the hero is placed around `at` like the others. */
  pos?: THREE.Vector3;
  yaw?: number;
}

/**
 * Creates all three heroes; `playerId` is controlled, the others follow as helpers.
 * Heroes in `handoff` keep their model (and place and facing, if given); the rest stand around `at`.
 */
export function createHeroes(ctx: Ctx, playerId: HeroId, at: THREE.Vector3, handoff?: Partial<Record<HeroId, HeroHandoff>>): void {
  HERO_ORDER.forEach((id, i) => {
    const given = handoff?.[id];
    const hero = new Hero(id, given?.model ?? ctx.models.character(HEROES[id].model));
    if (!hero.model.root.parent) ctx.scene.add(hero.model.root);
    if (given?.pos) {
      placeOnGround(ctx.world, hero.body, given.pos.x, given.pos.z);
      hero.yaw = given.yaw ?? 0;
    } else {
      placeOnGround(ctx.world, hero.body, at.x + (i - 1) * 1.2, at.z + (i === 1 ? 0 : 0.8));
      if (!given) hero.model.update(0, 0);
    }
    hero.syncModel(0.001);
    ctx.heroes.set(id, hero);
  });
  setPlayer(ctx, playerId);
}

function setPlayer(ctx: Ctx, id: HeroId): void {
  for (const h of ctx.heroes.values()) h.isPlayer = h.id === id;
  ctx.player = ctx.heroes.get(id)!;
  ctx.save.hero = id;
  ctx.hud.setPlayer(id);
}

export function switchTo(ctx: Ctx, id: HeroId): void {
  if (ctx.player.id === id) return;
  const before = ctx.player;
  setPlayer(ctx, id);
  // Hearts belong to whoever is being played; a fresh hero starts full.
  ctx.player.hearts = Math.max(ctx.player.hearts, before.hearts);
  ctx.effects.ring(ctx.player.pos, parseInt(HEROES[id].color.slice(1), 16));
  ctx.player.model.play('happy');
  sfx.play('switch');
  events.emit('hero:switch', { hero: id });
}

/** Out of hearts: a short nap at home, then back to the adventure. Nothing is lost. */
export async function sendHome(ctx: Ctx): Promise<void> {
  if (ctx.sleeping || !ctx.house) return;
  ctx.sleeping = true;
  const player = ctx.player;
  player.model.play('sleep');
  events.emit('hero:sleep', { hero: player.id });
  await ctx.hud.fade(true);
  const wake = ctx.house.wake;
  let i = 0;
  for (const h of ctx.heroes.values()) {
    const off = h === player ? 0 : (i++ === 0 ? -1 : 1);
    placeOnGround(ctx.world, h.body, wake.x + off * 0.9, wake.z + (h === player ? 0 : 0.9));
    h.hearts = HERO_STATS.maxHearts;
    h.invulnerable = 2;
    h.model.play('idle');
  }
  // Monsters that followed home go back to the woods.
  for (const m of ctx.monsters) if (m.pos.distanceTo(wake) < 16) m.alive = false;
  await ctx.hud.fade(false);
  sfx.play('wake');
  ctx.sleeping = false;
  events.emit('hero:wake', { hero: player.id });
}

export function updateHeroes(ctx: Ctx, dt: number): void {
  const { input, world } = ctx;
  if (input.pendingHero) {
    if (ctx.playing && !ctx.sleeping) switchTo(ctx, input.pendingHero);
    input.pendingHero = null;
  }
  const player = ctx.player;
  const bots = [...ctx.heroes.values()].filter((h) => h !== player);

  for (const h of ctx.heroes.values()) {
    h.fireCd -= dt;
    h.boltCd -= dt;
    h.invulnerable -= dt;
    h.sinceHit += dt;
  }

  // ── the player ──
  if (!ctx.sleeping) {
    const speed = player.card.speed * (player.body.inWater ? 0.6 : 1);
    const k = 1 - Math.exp(-dt * 14);
    player.body.vel.x += (input.moveX * speed - player.body.vel.x) * k;
    player.body.vel.z += (input.moveY * speed - player.body.vel.z) * k;
    if (Math.hypot(input.moveX, input.moveY) > 0.1) {
      player.yaw = turnTowards(player.yaw, yawOf(input.moveX, input.moveY), dt * 12);
    }
  } else {
    player.body.vel.x *= 0.8;
    player.body.vel.z *= 0.8;
  }

  // Hearts come back on their own, quickly at home.
  if (player.hearts < HERO_STATS.maxHearts && player.sinceHit > HERO_STATS.regenDelay) {
    player.regenTimer += dt;
    const every = ctx.house && isInside(ctx.house, player.pos) ? HERO_STATS.regenEveryAtHome : tuneOf(ctx).regenEvery;
    if (player.regenTimer >= every) {
      player.regenTimer = 0;
      player.hearts += 1;
    }
  }

  // ── helpers follow the player and fight on their own ──
  const fwdX = Math.sin(player.yaw);
  const fwdZ = Math.cos(player.yaw);
  bots.forEach((bot, i) => {
    const side = i === 0 ? 1 : -1;
    // Behind the player, one on each side (character's left is +X when facing +Z).
    // When that spot is inside a wall (on the doorstep, facing out), try beside, then in front.
    const leftX = Math.cos(player.yaw);
    const leftZ = -Math.sin(player.yaw);
    const fy = Math.floor(player.pos.y + 0.01);
    let tx = player.pos.x;
    let tz = player.pos.z;
    for (const back of [1.5, 0, -1.5]) {
      tx = player.pos.x - fwdX * back + leftX * 1.5 * side;
      tz = player.pos.z - fwdZ * back + leftZ * 1.5 * side;
      if (!world.isSolid(Math.floor(tx), fy, Math.floor(tz)) && !world.isSolid(Math.floor(tx), fy + 1, Math.floor(tz))) break;
    }
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 22 || (bot.stuckTime > 2.5 && dist > 3)) {
      ctx.effects.poof(tmp.copy(bot.pos).setY(bot.pos.y + 0.6), 0xffffff, 8);
      placeOnGround(world, bot.body, tx, tz);
      bot.stuckTime = 0;
      ctx.effects.poof(tmp.copy(bot.pos).setY(bot.pos.y + 0.6), 0xffffff, 8);
      return;
    }

    let vx = 0;
    let vz = 0;
    if (dist > 0.7 && !ctx.sleeping) {
      const spd = Math.min(bot.card.speed * 1.2, dist * 2.2);
      vx = (dx / dist) * spd;
      vz = (dz / dist) * spd;
      bot.yaw = turnTowards(bot.yaw, yawOf(dx, dz), dt * 10);
    }
    const k = 1 - Math.exp(-dt * 10);
    bot.body.vel.x += (vx - bot.body.vel.x) * k;
    bot.body.vel.z += (vz - bot.body.vel.z) * k;
    bot.stuckTime = bot.body.blocked && dist > 3 ? bot.stuckTime + dt : 0;

    if (ctx.playing && !ctx.sleeping) {
      bot.botFireCd -= dt;
      bot.botBoltCd -= dt;
      const target = nearestMonster(ctx, bot.pos, 9);
      if (target) {
        if (dist < 3) bot.yaw = turnTowards(bot.yaw, yawOf(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z), dt * 12);
        if (bot.botFireCd <= 0) {
          const [lo, hi] = tuneOf(ctx).helperFireEvery;
          bot.botFireCd = lo + Math.random() * (hi - lo);
          fireArrow(ctx, bot);
        }
        if (bot.botBoltCd <= 0 && target.pos.distanceTo(bot.pos) < 8) {
          bot.botBoltCd = 7 + Math.random() * 5;
          castBolt(ctx, bot);
        }
      }
    }
  });

  for (const h of ctx.heroes.values()) {
    stepBody(world, h.body, dt);
    h.syncModel(dt);
  }
}
