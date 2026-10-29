import * as THREE from 'three';
import { SEA_LEVEL } from '../contracts';
import { type Hero, Monster, turnTowards, yawOf } from '../actors/entities';
import { placeOnGround, stepBody } from '../actors/physics';
import { MONSTERS, MONSTER_ORDER, SPAWN, type MonsterCard, type MonsterKind } from '../content/monsters';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { hurtHero, throwBone } from './combat';
import { homeDistance } from './house';
import { playingSpeakers } from './kit';
import { inLight } from './power';
import { sheltered } from './prizes';
import { redLight } from './defense';
import { tuneOf } from './tune';
import { inVillage } from './villages';

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

/** Monsters arrive in a small pack of one kind, a few blocks apart. */
function trySpawn(ctx: Ctx): void {
  const tune = tuneOf(ctx);
  const night = isNight(ctx);
  const alive = ctx.monsters.filter((m) => m.alive).length;
  const cap = night ? tune.capNight : tune.capDay;
  if (alive >= cap) return;
  const p = ctx.player.pos;
  const a = Math.random() * Math.PI * 2;
  const d = SPAWN.minDist + Math.random() * (SPAWN.maxDist - SPAWN.minDist);
  const cx = p.x + Math.sin(a) * d;
  const cz = p.z + Math.cos(a) * d;
  const kind = pickKind(ctx, cx, cz);
  if (!kind) return;
  const [lo, hi] = tune.pack;
  const size = Math.min(cap - alive, lo + Math.floor(Math.random() * (hi - lo + 1)));
  for (let i = 0; i < size; i++) {
    const x = cx + (Math.random() - 0.5) * 4;
    const z = cz + (Math.random() - 0.5) * 4;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const y = ctx.world.groundHeight(bx, bz);
    if (y <= SEA_LEVEL || ctx.world.isWater(bx, y, bz)) continue;
    if (homeDistance(ctx, new THREE.Vector3(x, y, z)) < SPAWN.houseSafeRadius + 4) continue;
    // villages are safe like home (their own defence waves come from systems/villages.ts)
    if (inVillage(ctx, x, z)) continue;
    // the boss's wasteland is its own: no regular monsters spawn there
    if (ctx.boss?.inZone(x, z, 2)) continue;
    // nor where powered lamps and lighthouses shine at night, nor round a tree house
    if (night && (inLight(x, z) || sheltered(x, z))) continue;
    spawnAt(ctx, kind, x, z);
  }
}

export function spawnAt(ctx: Ctx, kind: MonsterKind, x: number, z: number): Monster {
  const tune = tuneOf(ctx);
  const m = new Monster(kind, ctx.models.character(MONSTERS[kind].model));
  m.hp = Math.max(1, Math.ceil(m.card.hp * tune.monsterHp * (isNight(ctx) ? tune.night : 1)));
  m.throwCd = 1 + Math.random() * 1.5;
  placeOnGround(ctx.world, m.body, x, z);
  m.model.update(0, 0);
  ctx.scene.add(m.model.root);
  ctx.monsters.push(m);
  events.emit('monster:spawn', { kind });
  return m;
}

/** For automated checks: a monster where a test wants it, and where they all are. */
export function exposeMonsters(ctx: Ctx): void {
  (window as unknown as { __kotoMonsters: object }).__kotoMonsters = {
    spawn: (kind: MonsterKind, x: number, z: number) => void spawnAt(ctx, kind, x, z),
    get list() {
      return ctx.monsters.filter((m) => m.alive).map((m) => ({ kind: m.kind, state: m.state, hp: m.hp, pos: m.pos.toArray().map((v) => +v.toFixed(1)) }));
    },
  };
}

function nearestHero(ctx: Ctx, m: Monster): { hero: Hero; dist: number } | null {
  let best: Hero | null = null;
  let bestD = m.card.sight * tuneOf(ctx).sight * (isNight(ctx) ? 1.25 : 1);
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
  const tune = tuneOf(ctx);
  if (ctx.playing && !ctx.sleeping) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = tune.spawnEvery;
      trySpawn(ctx);
    }
  }

  const night = isNight(ctx);
  const pace = tune.monsterSpeed * (night ? tune.night : 1);
  const speakers = playingSpeakers();
  for (const m of ctx.monsters) {
    if (!m.alive) continue;
    m.hitCd -= dt;
    m.throwCd -= dt;
    m.stun -= dt;

    const home = ctx.house ? homeDistance(ctx, m.pos) : Infinity;
    const music = speakers.some((sp) => Math.hypot(sp.centre.x - m.pos.x, sp.centre.z - m.pos.z) < sp.dance);
    // a red traffic light close by: it stops and waits (no chasing, no biting)
    if (m.frozen > 0) m.frozen -= dt;
    const red = !music && (redLight(m.pos.x, m.pos.z) || m.frozen > 0);
    const seen = ctx.playing && !ctx.sleeping && !music && !red ? nearestHero(ctx, m) : null;
    let tx = 0;
    let tz = 0;
    let speed = 0;

    if (music !== (m.state === 'dance')) m.model.play(music ? 'dance' : 'idle');
    if (music) {
      // the music is on: no biting, only dancing
      m.state = 'dance';
    } else if (red) {
      if (m.state !== 'wait') m.model.play('idle');
      m.state = 'wait';
    } else if (home < SPAWN.houseSafeRadius) {
      // Home is safe: monsters turn around at the fence of light.
      m.state = 'flee';
      tx = m.pos.x - ctx.house!.centre.x;
      tz = m.pos.z - ctx.house!.centre.z;
      speed = m.card.chaseSpeed;
    } else if (seen) {
      m.state = 'chase';
      tx = seen.hero.pos.x - m.pos.x;
      tz = seen.hero.pos.z - m.pos.z;
      speed = m.card.chaseSpeed * pace;
      if (!m.spotted && seen.hero === ctx.player) {
        m.spotted = true;
        events.emit('monster:spot', { kind: m.kind, first: !spottedKinds.has(m.kind) });
        spottedKinds.add(m.kind);
      }
      const ranged = tune.ranged ? m.card.ranged : undefined;
      if (ranged && seen.dist < ranged.range) {
        // Keeps its distance and throws; the throw is slow enough to dodge.
        if (seen.dist < ranged.keep) {
          tx = -tx;
          tz = -tz;
        } else speed = 0;
        if (m.throwCd <= 0 && m.stun <= 0) {
          m.throwCd = ranged.every * (0.85 + Math.random() * 0.3);
          m.yaw = yawOf(seen.hero.pos.x - m.pos.x, seen.hero.pos.z - m.pos.z);
          m.model.play('attack');
          throwBone(ctx, m, seen.hero, ranged.speed);
        }
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
        if (tune.hunt && ctx.playing && !ctx.sleeping) {
          // Hunters drift towards the player's area, so standing still is not safe.
          m.wanderTarget.set(ctx.player.pos.x + Math.sin(a) * 4, 0, ctx.player.pos.z + Math.cos(a) * 4);
          m.wanderTimer = 2 + Math.random() * 2;
        } else m.wanderTarget.set(m.pos.x + Math.sin(a) * 6, 0, m.pos.z + Math.cos(a) * 6);
      }
      tx = m.wanderTarget.x - m.pos.x;
      tz = m.wanderTarget.z - m.pos.z;
      speed = Math.hypot(tx, tz) > 0.5 ? m.card.wanderSpeed * tune.monsterSpeed : 0;
    }

    const len = Math.hypot(tx, tz);
    if (m.stun <= 0) {
      const k = 1 - Math.exp(-dt * 8);
      const vx = len > 0.01 ? (tx / len) * speed : 0;
      const vz = len > 0.01 ? (tz / len) * speed : 0;
      m.body.vel.x += (vx - m.body.vel.x) * k;
      m.body.vel.z += (vz - m.body.vel.z) * k;
      if (len > 0.01 && speed > 0) m.yaw = turnTowards(m.yaw, yawOf(tx, tz), dt * 8);
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
