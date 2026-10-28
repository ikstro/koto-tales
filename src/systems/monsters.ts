import * as THREE from 'three';
import { SEA_LEVEL } from '../contracts';
import { type Hero, Monster, turnTowards, yawOf } from '../actors/entities';
import { placeOnGround, stepBody } from '../actors/physics';
import { MONSTERS, MONSTER_ORDER, SPAWN, type MonsterCard, type MonsterKind } from '../content/monsters';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { hurtHero } from './combat';
import { homeDistance } from './house';

const spottedKinds = new Set<MonsterKind>();
let spawnTimer = 0;

const isNight = (ctx: Ctx) => ctx.clock.daylight < 0.35;

function pickKind(ctx: Ctx, x: number, z: number): MonsterKind | null {
  const night = isNight(ctx);
  const biome = ctx.world.biomeAt(x, z);
  const pool = MONSTER_ORDER.filter((k) => {
    const c: MonsterCard = MONSTERS[k];
    if (c.when === 'day' && night) return false;
    if (c.when === 'night' && !night) return false;
    return !c.biomes || c.biomes.includes(biome);
  });
  const total = pool.reduce((s, k) => s + MONSTERS[k].weight, 0);
  let r = Math.random() * total;
  for (const k of pool) if ((r -= MONSTERS[k].weight) <= 0) return k;
  return null;
}

function trySpawn(ctx: Ctx): void {
  const cap = isNight(ctx) ? SPAWN.capNight : SPAWN.capDay;
  if (ctx.monsters.filter((m) => m.alive).length >= cap) return;
  const p = ctx.player.pos;
  const a = Math.random() * Math.PI * 2;
  const d = SPAWN.minDist + Math.random() * (SPAWN.maxDist - SPAWN.minDist);
  const x = p.x + Math.sin(a) * d;
  const z = p.z + Math.cos(a) * d;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const y = ctx.world.groundHeight(bx, bz);
  if (y <= SEA_LEVEL || ctx.world.isWater(bx, y, bz)) return;
  if (homeDistance(ctx, new THREE.Vector3(x, y, z)) < SPAWN.houseSafeRadius + 4) return;
  const kind = pickKind(ctx, x, z);
  if (!kind) return;
  const m = new Monster(kind, ctx.models.character(MONSTERS[kind].model));
  placeOnGround(ctx.world, m.body, x, z);
  m.model.update(0, 0);
  ctx.scene.add(m.model.root);
  ctx.monsters.push(m);
  events.emit('monster:spawn', { kind });
}

function nearestHero(ctx: Ctx, m: Monster): { hero: Hero; dist: number } | null {
  let best: Hero | null = null;
  let bestD = m.card.sight * (isNight(ctx) ? 1.25 : 1);
  for (const h of ctx.heroes.values()) {
    const d = Math.hypot(h.pos.x - m.pos.x, h.pos.z - m.pos.z);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best ? { hero: best, dist: bestD } : null;
}

export function updateMonsters(ctx: Ctx, dt: number): void {
  if (ctx.playing && !ctx.sleeping) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN.every;
      trySpawn(ctx);
    }
  }

  const night = isNight(ctx);
  for (const m of ctx.monsters) {
    if (!m.alive) continue;
    m.hitCd -= dt;
    m.stun -= dt;

    const home = ctx.house ? homeDistance(ctx, m.pos) : Infinity;
    const seen = ctx.playing && !ctx.sleeping ? nearestHero(ctx, m) : null;
    let tx = 0;
    let tz = 0;
    let speed = 0;

    if (home < SPAWN.houseSafeRadius) {
      // Home is safe: monsters turn around at the fence of light.
      m.state = 'flee';
      tx = m.pos.x - ctx.house!.centre.x;
      tz = m.pos.z - ctx.house!.centre.z;
      speed = m.card.chaseSpeed;
    } else if (seen) {
      m.state = 'chase';
      tx = seen.hero.pos.x - m.pos.x;
      tz = seen.hero.pos.z - m.pos.z;
      speed = m.card.chaseSpeed * (night ? 1.15 : 1);
      if (!m.spotted && seen.hero === ctx.player) {
        m.spotted = true;
        events.emit('monster:spot', { kind: m.kind, first: !spottedKinds.has(m.kind) });
        spottedKinds.add(m.kind);
      }
      const reach = m.body.radius + seen.hero.body.radius + 0.45;
      if (seen.dist < reach) {
        speed = 0;
        if (m.hitCd <= 0) {
          m.hitCd = 1.3;
          m.model.play('attack');
          hurtHero(ctx, seen.hero, m.card.damage, m.pos);
        }
      }
    } else {
      m.state = 'wander';
      m.wanderTimer -= dt;
      if (m.wanderTimer <= 0) {
        m.wanderTimer = 3 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        m.wanderTarget.set(m.pos.x + Math.sin(a) * 6, 0, m.pos.z + Math.cos(a) * 6);
      }
      tx = m.wanderTarget.x - m.pos.x;
      tz = m.wanderTarget.z - m.pos.z;
      speed = Math.hypot(tx, tz) > 0.5 ? m.card.wanderSpeed : 0;
    }

    const len = Math.hypot(tx, tz);
    if (m.stun <= 0) {
      const k = 1 - Math.exp(-dt * 8);
      const vx = len > 0.01 ? (tx / len) * speed : 0;
      const vz = len > 0.01 ? (tz / len) * speed : 0;
      m.body.vel.x += (vx - m.body.vel.x) * k;
      m.body.vel.z += (vz - m.body.vel.z) * k;
      if (len > 0.01) m.yaw = turnTowards(m.yaw, yawOf(tx, tz), dt * 8);
    } else {
      m.body.vel.x *= 1 - dt * 3;
      m.body.vel.z *= 1 - dt * 3;
    }
    stepBody(ctx.world, m.body, dt);
    m.syncModel(dt);

    if (Math.hypot(m.pos.x - ctx.player.pos.x, m.pos.z - ctx.player.pos.z) > SPAWN.despawnDist) m.alive = false;
  }

  // Remove the ones that left (defeated monsters already removed their model).
  const gone = ctx.monsters.filter((m) => !m.alive);
  if (gone.length) {
    for (const m of gone) {
      if (m.model.root.parent) {
        ctx.scene.remove(m.model.root);
        m.model.dispose();
      }
    }
    ctx.monsters = ctx.monsters.filter((m) => m.alive);
  }
}
