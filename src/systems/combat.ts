import * as THREE from 'three';
import { createShot } from '../assets/props';
import { Arrow, type Hero, type Monster, yawOf } from '../actors/entities';
import { HERO_STATS, type WeaponKind } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { dropCoins, dropHeart } from './pickups';
import { sendHome } from './heroes';
import { tuneOf } from './tune';
import { B } from '../world/blocks';

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

/**
 * Auto-aim also knows the boss: its mouth is the target when it is in reach
 * (it is big, so a little further than a monster) and no monster is closer.
 */
function aimsAtBoss(ctx: Ctx, from: THREE.Vector3, range: number, monster: Monster | null): boolean {
  const b = ctx.boss;
  if (!b?.alive) return false;
  const d = b.aimDistance(from);
  if (d > range + 3 * b.scale) return false;
  return !monster || d < Math.hypot(monster.pos.x - from.x, monster.pos.z - from.z);
}

/** The same whoosh, pitched per weapon: the star rings higher, the axe swishes lower. */
const SHOT_PITCH: Record<WeaponKind, number> = { arrow: 1, star: 1.45, paw: 1.25, axe: 0.75 };
/** Spin of the thrown things, turns a second (arrows fly straight). */
const SPIN: Record<WeaponKind, number> = { arrow: 0, star: 14, paw: 5, axe: 16 };
const TRAIL: Partial<Record<WeaponKind, number>> = { star: 0xff8fb1, paw: 0xc98bff };

export function fireArrow(ctx: Ctx, hero: Hero): void {
  if (hero.fireCd > 0) return;
  hero.fireCd = HERO_STATS.arrowCooldown;
  const from = hero.chest(new THREE.Vector3());
  const target = nearestMonster(ctx, hero.pos, HERO_STATS.arrowRange, hero.yaw);
  const dir = new THREE.Vector3();
  if (aimsAtBoss(ctx, hero.pos, HERO_STATS.arrowRange, target)) {
    // into the mouth, lifted a little against the arrow's drop over the distance
    const m = ctx.boss!.mouthPoint(tmp);
    const t = Math.hypot(m.x - from.x, m.z - from.z) / HERO_STATS.arrowSpeed;
    m.y += Math.max(0, 3 * t * t - 1.2 * t);
    dir.subVectors(m, from).normalize();
  } else if (target) dir.subVectors(centreOf(target, tmp), from).normalize();
  else dir.set(Math.sin(hero.yaw), 0.05, Math.cos(hero.yaw)).normalize();
  hero.yaw = yawOf(dir.x, dir.z);

  const kind = hero.card.weapon;
  const obj = createShot(ctx.skin, kind);
  obj.position.copy(from);
  ctx.scene.add(obj);
  const a = new Arrow(obj, from);
  a.by = hero;
  a.kind = kind;
  a.damage = hero.isPlayer ? HERO_STATS.arrowDamage : HERO_STATS.arrowDamage * tuneOf(ctx).helperDamage;
  a.vel.copy(dir).multiplyScalar(HERO_STATS.arrowSpeed);
  a.vel.y += 1.2; // a slight arc reads as a real arrow
  ctx.arrows.push(a);

  hero.model.play(kind === 'paw' ? 'cast' : 'attack');
  sfx.play('arrow', { volume: hero.isPlayer ? 1 : 0.5, pitch: SHOT_PITCH[kind] });
  events.emit('attack:arrow', { hero: hero.id });
}

export function castBolt(ctx: Ctx, hero: Hero): void {
  if (hero.boltCd > 0) {
    if (hero.isPlayer) sfx.play('click');
    return;
  }
  const tune = tuneOf(ctx);
  hero.boltCd = tune.boltCooldown;
  const scale = hero.isPlayer ? 1 : tune.helperDamage;
  hero.model.play('cast');
  const hit = new Set<Monster>();
  let bossHit = 0;
  let first = nearestMonster(ctx, hero.pos, HERO_STATS.boltRange);
  if (aimsAtBoss(ctx, hero.pos, HERO_STATS.boltRange, first)) {
    // The bolt comes down in front of the boss: into the open mouth, or onto the stone with a «дзинь».
    const b = ctx.boss!;
    const open = b.brain.mouthOpen && !b.brain.armored;
    const to = open ? b.mouthPoint(new THREE.Vector3()) : b.toWorld(0, 4.6, 3.2, new THREE.Vector3());
    hero.yaw = yawOf(to.x - hero.pos.x, to.z - hero.pos.z);
    ctx.effects.lightning(b.toWorld(0, 12, 9, tmp2), to);
    b.strike(ctx, open ? 'mouth' : 'body', HERO_STATS.boltDamage * scale, to);
    bossHit = 1;
  } else if (!first) {
    // No monster around: the bolt still strikes in front, it's fun anyway.
    const p = tmp.set(hero.pos.x + Math.sin(hero.yaw) * 4, 0, hero.pos.z + Math.cos(hero.yaw) * 4);
    p.y = ctx.world.groundHeight(Math.floor(p.x), Math.floor(p.z));
    ctx.effects.lightning(tmp2.copy(p).setY(p.y + 14), p);
    ctx.effects.ring(p, 0xfff59d);
  } else {
    hero.yaw = yawOf(first.pos.x - hero.pos.x, first.pos.z - hero.pos.z);
    let from = centreOf(first, new THREE.Vector3()).setY(first.pos.y + 14);
    let damage = HERO_STATS.boltDamage * scale;
    let current: Monster | null = first;
    for (let i = 0; current && i <= HERO_STATS.boltChains; i++) {
      hit.add(current);
      const to = centreOf(current, new THREE.Vector3());
      ctx.effects.lightning(from, to);
      damageMonster(ctx, current, damage, tmp.subVectors(current.pos, hero.pos).setY(0).normalize(), hero);
      from = to;
      damage = HERO_STATS.boltChainDamage * scale;
      current = nearestMonster(ctx, to, 5, undefined, hit);
    }
  }
  sfx.play('lightning', { volume: hero.isPlayer ? 1 : 0.6 });
  if (hero.isPlayer) {
    ctx.hud.flash(0.55);
    voice.say(hero.card.lines.bolt, { priority: 3 });
  }
  events.emit('attack:bolt', { hero: hero.id, hits: hit.size + bossHit });
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
  // Sometimes a heart for a hero who has lost some (difficulty sets how often).
  if (ctx.player.hearts < HERO_STATS.maxHearts && Math.random() < tuneOf(ctx).heartDrop) dropHeart(ctx, c);
  sfx.play('poof');
  ctx.scene.remove(m.model.root);
  m.model.dispose();
  const key = `m:${m.kind}`;
  const first = !ctx.save.found.includes(key);
  if (first) ctx.save.found.push(key);
  ctx.save.defeated[m.kind] = (ctx.save.defeated[m.kind] ?? 0) + 1;
  events.emit('monster:defeated', { kind: m.kind, first, by: by.id });
}

/** A monster bumps a hero. Only the player loses hearts; helpers just tumble. */
export function hurtHero(ctx: Ctx, hero: Hero, damage: number, from: THREE.Vector3): void {
  if (hero.invulnerable > 0 || ctx.sleeping || ctx.napping) return;
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
  hero.invulnerable = 1.6; // a pack can't take hearts in one burst
  hero.sinceHit = 0;
  events.emit('hero:hurt', { hero: hero.id, hearts: hero.hearts });
  if (hero.hearts <= 0) void sendHome(ctx);
}

// ─── bones thrown by Кістлявчик ────────────────────────────────────────────

interface Bone {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}
let bones: Bone[] = [];
let boneTemplate: THREE.Object3D | null = null;

function boneModel(ctx: Ctx): THREE.Object3D {
  if (!boneTemplate) {
    const mat = ctx.skin.partMaterial('#f1ead8');
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), mat);
    g.add(shaft);
    for (const z of [-0.25, 0.25])
      for (const x of [-0.06, 0.06]) {
        const knob = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.11), mat);
        knob.position.set(x, 0, z);
        g.add(knob);
      }
    boneTemplate = g;
  }
  return boneTemplate.clone();
}

/** A slow, arcing bone towards where the hero stands now: a child can step aside. */
export function throwBone(ctx: Ctx, m: Monster, target: Hero, speed: number): void {
  const from = new THREE.Vector3(m.pos.x, m.pos.y + m.body.height * 0.75, m.pos.z);
  const to = target.chest(new THREE.Vector3());
  const flat = Math.hypot(to.x - from.x, to.z - from.z);
  const t = Math.max(0.35, flat / speed);
  const vel = new THREE.Vector3((to.x - from.x) / t, (to.y - from.y) / t + 0.5 * 14 * t, (to.z - from.z) / t);
  const obj = boneModel(ctx);
  obj.position.copy(from);
  ctx.scene.add(obj);
  bones.push({ obj, pos: from, vel, life: 3 });
  sfx.play('arrow', { pitch: 0.6, volume: 0.6 });
}

function updateBones(ctx: Ctx, dt: number): void {
  for (const b of bones) {
    b.life -= dt;
    b.vel.y -= 14 * dt;
    b.pos.addScaledVector(b.vel, dt);
    b.obj.position.copy(b.pos);
    b.obj.rotation.x += dt * 12;
    b.obj.rotation.y += dt * 7;
    for (const h of ctx.heroes.values()) {
      if (h.chest(tmp2).distanceTo(b.pos) < h.body.radius + 0.35) {
        hurtHero(ctx, h, 1, tmp.copy(b.pos).sub(b.vel));
        b.life = 0;
        break;
      }
    }
    if (b.life > 0 && ctx.world.isSolid(Math.floor(b.pos.x), Math.floor(b.pos.y), Math.floor(b.pos.z))) {
      ctx.effects.poof(b.pos, 0xf1ead8, 6);
      b.life = 0;
    }
    if (b.life <= 0) ctx.scene.remove(b.obj);
  }
  bones = bones.filter((b) => b.life > 0);
}

/**
 * Whether arrows bounce off this monster: armour 'bolt' always (only the lightning hurts it),
 * 'lantern' unless a placed lantern stands within 6 blocks.
 */
function bounces(ctx: Ctx, m: Monster): boolean {
  if (m.card.armor === 'bolt') return true;
  if (m.card.armor !== 'lantern') return false;
  const x0 = Math.floor(m.pos.x);
  const y0 = Math.floor(m.pos.y);
  const z0 = Math.floor(m.pos.z);
  for (let dx = -6; dx <= 6; dx++)
    for (let dz = -6; dz <= 6; dz++) {
      if (dx * dx + dz * dz > 36) continue;
      for (let dy = -2; dy <= 3; dy++) if (ctx.world.getBlock(x0 + dx, y0 + dy, z0 + dz) === B.LANTERN) return false;
    }
  return true;
}

export function updateCombat(ctx: Ctx, dt: number): void {
  updateBones(ctx, dt);
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
      if (a.kind === 'axe') a.obj.rotateX(a.life * SPIN.axe);
      else if (a.kind !== 'arrow') a.obj.rotateZ(a.life * SPIN[a.kind]).rotateY(a.life * SPIN[a.kind] * 0.5);
      const trail = TRAIL[a.kind];
      if (trail !== undefined && Math.random() < dt * 14) ctx.effects.sparkle(a.pos, trail);
      for (const m of ctx.monsters) {
        if (!m.alive) continue;
        if (centreOf(m, tmp2).distanceTo(a.pos) < m.body.radius + 0.45 + m.body.height * 0.3) {
          if (bounces(ctx, m)) {
            // armour (MonsterCard.armor): the arrow bounces off with a «дзинь»
            sfx.play('clink');
            ctx.effects.sparkle(a.pos, 0xfff6c2);
            a.dead = true;
            break;
          }
          damageMonster(ctx, m, a.damage, tmp.copy(a.vel).setY(0).normalize(), a.by ?? player);
          a.dead = true;
          break;
        }
      }
      if (!a.dead && ctx.boss) {
        const where = ctx.boss.hitTest(a.pos);
        if (where) {
          ctx.boss.strike(ctx, where, a.damage, a.pos);
          a.dead = true;
        }
      }
      if (!a.dead && ctx.world.isSolid(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z))) {
        if (a.kind === 'arrow') {
          a.stuck = true;
          a.life = Math.min(a.life, 2);
        } else {
          // stars, purr-balls and axes don't stick: a puff in their colour
          ctx.effects.poof(a.pos, TRAIL[a.kind] ?? 0x9aa4ad, 6);
          a.dead = true;
        }
      }
    }
    if (a.life <= 0) a.dead = true;
    if (a.dead) ctx.scene.remove(a.obj);
  }
  ctx.arrows = ctx.arrows.filter((a) => !a.dead);
}
