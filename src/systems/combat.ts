import * as THREE from 'three';
import { createArrow } from '../assets/props';
import { Arrow, type Hero, type Monster, yawOf } from '../actors/entities';
import { HERO_STATS } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { dropCoins } from './pickups';
import { sendHome } from './heroes';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** Nearest living monster in range; ones in front of `yaw` count as closer. */
export function nearestMonster(ctx: Ctx, from: THREE.Vector3, range: number, yaw?: number, skip?: Set<Monster>): Monster | null {
  let best: Monster | null = null;
  let bestScore = Infinity;
  for (const m of ctx.monsters) {
    if (!m.alive || skip?.has(m)) continue;
    const dx = m.pos.x - from.x;
    const dz = m.pos.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    let score = d;
    if (yaw !== undefined && d > 0.01) {
      const facing = Math.sin(yaw) * (dx / d) + Math.cos(yaw) * (dz / d);
      if (facing < 0) score *= 1.7;
    }
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

const centreOf = (m: Monster, out: THREE.Vector3) => out.copy(m.pos).setY(m.pos.y + m.body.height * 0.5);

export function fireArrow(ctx: Ctx, hero: Hero): void {
  if (hero.fireCd > 0) return;
  hero.fireCd = HERO_STATS.arrowCooldown;
  const from = hero.chest(new THREE.Vector3());
  const target = nearestMonster(ctx, hero.pos, HERO_STATS.arrowRange, hero.yaw);
  const dir = new THREE.Vector3();
  if (target) dir.subVectors(centreOf(target, tmp), from).normalize();
  else dir.set(Math.sin(hero.yaw), 0.05, Math.cos(hero.yaw)).normalize();
  hero.yaw = yawOf(dir.x, dir.z);

  const obj = createArrow(ctx.skin);
  obj.position.copy(from);
  ctx.scene.add(obj);
  const a = new Arrow(obj, from);
  a.vel.copy(dir).multiplyScalar(HERO_STATS.arrowSpeed);
  a.vel.y += 1.2; // a slight arc reads as a real arrow
  ctx.arrows.push(a);

  hero.model.play('attack');
  sfx.play('arrow', { volume: hero.isPlayer ? 1 : 0.5 });
  events.emit('attack:arrow', { hero: hero.id });
}

export function castBolt(ctx: Ctx, hero: Hero): void {
  if (hero.boltCd > 0) {
    if (hero.isPlayer) sfx.play('click');
    return;
  }
  hero.boltCd = HERO_STATS.boltCooldown;
  hero.model.play('cast');
  const hit = new Set<Monster>();
  let first = nearestMonster(ctx, hero.pos, HERO_STATS.boltRange);
  if (!first) {
    // No monster around: the bolt still strikes in front, it's fun anyway.
    const p = tmp.set(hero.pos.x + Math.sin(hero.yaw) * 4, 0, hero.pos.z + Math.cos(hero.yaw) * 4);
    p.y = ctx.world.groundHeight(Math.floor(p.x), Math.floor(p.z));
    ctx.effects.lightning(tmp2.copy(p).setY(p.y + 14), p);
    ctx.effects.ring(p, 0xfff59d);
  } else {
    hero.yaw = yawOf(first.pos.x - hero.pos.x, first.pos.z - hero.pos.z);
    let from = centreOf(first, new THREE.Vector3()).setY(first.pos.y + 14);
    let damage = HERO_STATS.boltDamage;
    let current: Monster | null = first;
    for (let i = 0; current && i <= HERO_STATS.boltChains; i++) {
      hit.add(current);
      const to = centreOf(current, new THREE.Vector3());
      ctx.effects.lightning(from, to);
      damageMonster(ctx, current, damage, tmp.subVectors(current.pos, hero.pos).setY(0).normalize(), hero);
      from = to;
      damage = HERO_STATS.boltChainDamage;
      current = nearestMonster(ctx, to, 5, undefined, hit);
    }
  }
  sfx.play('lightning', { volume: hero.isPlayer ? 1 : 0.6 });
  if (hero.isPlayer) {
    ctx.hud.flash(0.55);
    voice.say(hero.card.lines.bolt, { priority: 3 });
  }
  events.emit('attack:bolt', { hero: hero.id, hits: hit.size });
}

export function damageMonster(ctx: Ctx, m: Monster, damage: number, dir: THREE.Vector3, by: Hero): void {
  if (!m.alive) return;
  m.hp -= damage;
  m.stun = 0.35;
  m.body.vel.x += dir.x * 5;
  m.body.vel.z += dir.z * 5;
  m.body.vel.y = Math.max(m.body.vel.y, 4);
  m.model.play('hurt');
  ctx.effects.sparkle(centreOf(m, tmp), 0xffffff);
  sfx.play('hit');
  if (m.hp <= 0) defeatMonster(ctx, m, by);
}

function defeatMonster(ctx: Ctx, m: Monster, by: Hero): void {
  m.alive = false;
  const c = centreOf(m, new THREE.Vector3());
  ctx.effects.poof(c, m.card.color, 26);
  ctx.effects.coinBurst(c);
  const [lo, hi] = m.card.coins;
  dropCoins(ctx, c, lo + Math.floor(Math.random() * (hi - lo + 1)));
  sfx.play('poof');
  ctx.scene.remove(m.model.root);
  m.model.dispose();
  const key = `m:${m.kind}`;
  const first = !ctx.save.found.includes(key);
  if (first) ctx.save.found.push(key);
  events.emit('monster:defeated', { kind: m.kind, first, by: by.id });
}

/** A monster bumps a hero. Only the player loses hearts; helpers just tumble. */
export function hurtHero(ctx: Ctx, hero: Hero, damage: number, from: THREE.Vector3): void {
  if (hero.invulnerable > 0 || ctx.sleeping) return;
  const away = tmp.subVectors(hero.pos, from).setY(0);
  if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
  away.normalize();
  hero.body.vel.x += away.x * 7;
  hero.body.vel.z += away.z * 7;
  hero.body.vel.y = Math.max(hero.body.vel.y, 5);
  hero.model.play('hurt');
  if (!hero.isPlayer) {
    hero.invulnerable = 0.8;
    return;
  }
  sfx.play('hurt');
  hero.hearts = Math.max(0, hero.hearts - damage);
  hero.invulnerable = 1.2;
  hero.sinceHit = 0;
  events.emit('hero:hurt', { hero: hero.id, hearts: hero.hearts });
  if (hero.hearts <= 0) void sendHome(ctx);
}

export function updateCombat(ctx: Ctx, dt: number): void {
  const { input, player } = ctx;
  if (ctx.playing && !ctx.sleeping) {
    if (input.take('fire') || input.fireHeld) fireArrow(ctx, player);
    if (input.take('bolt')) castBolt(ctx, player);
  }

  for (const a of ctx.arrows) {
    a.life -= dt;
    if (!a.stuck) {
      a.vel.y -= 6 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.obj.position.copy(a.pos);
      a.obj.lookAt(tmp.copy(a.pos).add(a.vel));
      for (const m of ctx.monsters) {
        if (!m.alive) continue;
        if (centreOf(m, tmp2).distanceTo(a.pos) < m.body.radius + 0.45 + m.body.height * 0.3) {
          damageMonster(ctx, m, HERO_STATS.arrowDamage, tmp.copy(a.vel).setY(0).normalize(), player);
          a.dead = true;
          break;
        }
      }
      if (!a.dead && ctx.world.isSolid(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z))) {
        a.stuck = true;
        a.life = Math.min(a.life, 2);
      }
    }
    if (a.life <= 0) a.dead = true;
    if (a.dead) ctx.scene.remove(a.obj);
  }
  ctx.arrows = ctx.arrows.filter((a) => !a.dead);
}
