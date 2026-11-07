import * as THREE from 'three';
import { turnTowards, yawOf } from '../actors/entities';
import { placeOnGround, stepBody } from '../actors/physics';
import type { CharacterModel } from '../contracts';
import { BOWL_AT, type DoghouseModel } from '../assets/doghouse';
import { sirkoPose } from '../assets/parts/sirko';
import { ITEMS } from '../content/items';
import type { LineId } from '../content/lines';
import { dogFind, feedDog, feedFish, isHungry, PETS, type DogFind, type DogFood } from '../content/pets';
import type { Ctx } from '../core/ctx';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { giveItem } from './babusia';
import { companionPos, lendCompanion, returnCompanion } from './companions';
import { pushCarried } from './effects';
import type { Follower } from './follow';
import { eating } from './food';
import { homeAquarium, isInside } from './house';
import { selectedBuilding, standingWhere, type Standing } from './kit';
import { giveCoins } from './tasks';

/**
 * Home life, the pets (DESIGN.md «Home»; rules in content/pets.ts).
 * - Сірко at his doghouse: hungry each morning until fed. While the party is near he sits by his
 *   bowl wagging (it breathes); a tap on the bowl or on him puts one thing he eats from the box into
 *   it, he eats, runs off to sniff out a find and brings it back: coins or a kitchen product. With
 *   nothing he eats carried he wags and waits, and Пупся says what he likes. He is lent from
 *   systems/companions.ts while this runs and handed back after.
 * - The fish: a tap on the aquarium sprinkles flakes, the fish rush up; the first feeding a day
 *   gives coins, and Пупся has a word (she is a cat watching fish).
 */
type Phase = 'off' | 'wait' | 'pat' | 'toBowl' | 'eat' | 'run' | 'sniff' | 'back';

const DOG = 'sirko';
const FISH_LINES: LineId[] = ['pets_fish_1', 'pets_fish_2', 'pets_fish_3'];
/** Running speed on the errand and walking speed by the house (blocks/s). */
const RUN = 5.2;
const TROT = 2.6;
/** A tap reaches him and his bowl from this close (the hero). */
const TAP_NEAR = 9;
/** Further than this from the party mid-errand: the find is handed over at once. */
const LOST = 30;

let phase: Phase = 'off';
let dog: (Follower & { model: CharacterModel }) | null = null;
let timer = 0;
let anim = 0;
let hop = 0;
let whineT = 0;
let soundT = 0;
let stuckT = 0;
let food: DogFood | null = null;
let find: DogFind | null = null;
let carry: THREE.Object3D | null = null;
let fishLine = 0;
let fishTalkT = -Infinity;
const run = new THREE.Vector3();
const bowlW = new THREE.Vector3();
const tmp = new THREE.Vector3();
const front = new THREE.Vector3();
const lastPos = new THREE.Vector3();
const waitAt = new THREE.Vector3();

/** The doghouse Сірко guards (the first one put up) and its model, if it stands. */
function kennel(ctx: Ctx): { s: Standing; m: DoghouseModel } | null {
  const rec = ctx.save.placed.find((p) => p.id === 'doghouse');
  if (!rec) return null;
  const s = standingWhere((c) => c.id === 'doghouse').find((x) => x.rec === rec);
  const m = s?.model as DoghouseModel | null | undefined;
  return s && m && 'setBowl' in m ? { s, m } : null;
}

const clearTap = (ctx: Ctx) => !eating() && !selectedBuilding() && !ctx.map.isOpen && !ctx.album.isOpen && !ctx.sleeping;

/** One frame of walking the lent dog towards `to`; returns how far is left. */
function walk(ctx: Ctx, to: THREE.Vector3, speed: number, dt: number): number {
  const d = dog!;
  const dx = to.x - d.body.pos.x;
  const dz = to.z - d.body.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 24) placeOnGround(ctx.world, d.body, to.x, to.z);
  let vx = 0;
  let vz = 0;
  if (dist > 0.25) {
    const spd = Math.min(speed, dist * 3 + 0.4);
    vx = (dx / dist) * spd;
    vz = (dz / dist) * spd;
    d.yaw = turnTowards(d.yaw, yawOf(dx, dz), dt * 10);
  }
  const k = 1 - Math.exp(-dt * 10);
  d.body.vel.x += (vx - d.body.vel.x) * k;
  d.body.vel.z += (vz - d.body.vel.z) * k;
  stepBody(ctx.world, d.body, dt);
  return dist;
}

/** A spot on open ground 6–10 blocks from the kennel: level with it, dry, not in the house. */
function errandSpot(ctx: Ctx, c: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < 16; i++) {
    const a = base + i * 2.4;
    const r = PETS.runMin + Math.random() * (PETS.runMax - PETS.runMin);
    const x = Math.floor(c.x + Math.sin(a) * r);
    const z = Math.floor(c.z + Math.cos(a) * r);
    const g = ctx.world.groundHeight(x, z);
    if (Math.abs(g - c.y) > 1 || ctx.world.isWater(x, g - 1, z) || ctx.world.isWater(x, g, z)) continue;
    if (ctx.house && isInside(ctx.house, tmp.set(x + 0.5, g, z + 0.5))) continue;
    const f = ctx.house?.footprint;
    if (f && x >= f.x0 - 1 && x <= f.x1 && z >= f.z0 - 1 && z <= f.z1) continue;
    return out.set(x + 0.5, g, z + 0.5);
  }
  return out.set(c.x + front.x * PETS.runMin, c.y, c.z + front.z * PETS.runMin);
}

function lend(): boolean {
  dog = lendCompanion(DOG);
  return !!dog;
}

/** Hands Сірко back to guarding; a find still on its way is given at once. */
function release(ctx: Ctx, m: DoghouseModel | null): void {
  if (find) deliver(ctx);
  m?.setBowl(null);
  food = null;
  dropCarry();
  if (dog) returnCompanion(DOG);
  dog = null;
  phase = 'off';
}

function dropCarry(): void {
  carry?.removeFromParent();
  carry = null;
}

function deliver(ctx: Ctx): void {
  const f = find;
  find = null;
  dropCarry();
  if (!f) return;
  const at = dog ? dog.body.pos : ctx.player.pos;
  if (f.kind === 'coins') giveCoins(ctx, f.n, at);
  else {
    giveItem(ctx, f.item, 1);
    ctx.effects.sparkle(tmp.copy(at).setY(at.y + 0.8), ITEMS[f.item].color);
    ctx.effects.ring(ctx.player.pos, ITEMS[f.item].color, 1.6);
    sfx.play('pickup', { pitch: 1.2 });
  }
}

function setPhase(p: Phase): void {
  phase = p;
  timer = 0;
  stuckT = 0;
}

/** A tap on the bowl or on him: fed if hungry and something he eats is carried, otherwise a wag. */
function tapped(ctx: Ctx, m: DoghouseModel): void {
  const d = dog!;
  const day = ctx.save.day;
  const pets = ctx.save.home.pets;
  const hungry = isHungry(pets, day);
  const ate = hungry ? feedDog(pets, ctx.save.inv, day) : null;
  if (ate) {
    pushCarried(ctx);
    food = ate;
    find = dogFind(ctx.save.seed, day);
    m.setBowl(ate, 0);
    ctx.effects.poof(tmp.copy(bowlW).setY(bowlW.y + 0.25), ITEMS[ate].color, 10);
    sfx.play('place', { pitch: 1.3 });
    d.model.play('happy');
    hop = 0.6;
    setPhase('toBowl');
    return;
  }
  // nothing he eats, or not hungry: a happy hop and a bark, he waits
  d.model.play('happy');
  hop = 1;
  sfx.play('bark', { volume: 0.7 });
  if (hungry && pets.likesToldDay < day) {
    pets.likesToldDay = day;
    voice.say('pets_sirko_likes', { priority: 5 });
  }
  if (phase === 'off') setPhase('pat');
}

export function updatePets(ctx: Ctx, dt: number): void {
  anim += dt;
  updateFish(ctx);
  const k = kennel(ctx);
  const has = ctx.save.companions.includes(DOG) && !!companionPos(DOG);
  if (!k || !has) {
    if (phase !== 'off') release(ctx, k?.m ?? null);
    return;
  }
  const { s, m } = k;
  m.bowl.getWorldPosition(bowlW);
  const a = (s.rec.rot * Math.PI) / 2;
  front.set(Math.sin(a), 0, Math.cos(a));
  const c = s.centre;
  const pets = ctx.save.home.pets;
  const day = ctx.save.day;
  const hungry = isHungry(pets, day);
  const p = ctx.player.pos;
  const near = Math.hypot(p.x - c.x, p.z - c.z) < PETS.near && Math.abs(p.y - c.y) < 6;
  const busy = phase !== 'off' && phase !== 'wait' && phase !== 'pat';
  m.setHungry(hungry && near && !busy && !ctx.sleeping);

  // a tap on the bowl or on him (resting at his post, or waiting)
  const tapOk = ctx.input.taps.length > 0 && clearTap(ctx) && !busy && Math.hypot(p.x - c.x, p.z - c.z) < TAP_NEAR;
  if (tapOk) {
    const at = phase === 'off' ? companionPos(DOG) : dog?.body.pos;
    const onBowl = tappedAt(ctx, tmp.copy(bowlW).setY(bowlW.y + 0.1), 0.35);
    const onDog = !onBowl && !!at && tappedAt(ctx, tmp.copy(at).setY(at.y + 0.45), 0.55);
    if ((onBowl || onDog) && (dog || lend())) tapped(ctx, m);
  }

  if (phase === 'off') {
    if (hungry && near && !ctx.sleeping && lend()) {
      setPhase('wait');
      whineT = PETS.whineEvery - 4;
      if (pets.hungryToldDay < day && !voice.isSpeaking()) {
        pets.hungryToldDay = day;
        setTimeout(() => voice.say('pets_sirko_hungry', { priority: 4 }), 1500);
      }
    }
    if (phase === 'off') return;
  }
  const d = dog!;
  timer += dt;
  hop = Math.max(0, hop - dt);
  if (d.body.pos.distanceTo(p) > LOST || ctx.sleeping) {
    release(ctx, m);
    return;
  }
  let speed = 0;
  let wag = 0;
  let sniff = 0;
  // he waits just in front of his door, a little off the bowl's side
  waitAt.copy(c).addScaledVector(front, 1.2);
  waitAt.x -= front.z * 0.3;
  waitAt.z += front.x * 0.3;
  switch (phase) {
    case 'wait':
    case 'pat': {
      if (phase === 'wait' && (!hungry || !near)) return release(ctx, m);
      if (phase === 'pat' && timer > 1.6) return release(ctx, m);
      const left = walk(ctx, waitAt, TROT, dt);
      speed = Math.hypot(d.body.vel.x, d.body.vel.z);
      wag = 1;
      if (left < 0.4) {
        d.yaw = turnTowards(d.yaw, yawOf(p.x - d.body.pos.x, p.z - d.body.pos.z), dt * 6);
        if (hop <= 0 && phase === 'wait') d.model.play('sit');
      }
      whineT += dt;
      if (phase === 'wait' && whineT >= PETS.whineEvery && !voice.isSpeaking()) {
        whineT = 0;
        sfx.play('whine', { volume: 0.6 });
        d.model.play('happy');
        hop = 1;
      }
      break;
    }
    case 'toBowl': {
      // he eats from the bowl's side, so the bowl and his food stay in view (the camera looks from the front)
      const to = tmp.set(bowlW.x + front.z * 0.66, bowlW.y, bowlW.z - front.x * 0.66);
      const left = walk(ctx, to, TROT, dt);
      speed = Math.hypot(d.body.vel.x, d.body.vel.z);
      wag = 1;
      if ((left < 0.2 || timer > 4) && hop <= 0) {
        d.yaw = yawOf(bowlW.x - d.body.pos.x, bowlW.z - d.body.pos.z);
        d.model.play('eat');
        setPhase('eat');
      }
      break;
    }
    case 'eat': {
      d.body.vel.set(0, d.body.vel.y, 0);
      stepBody(ctx.world, d.body, dt);
      wag = 1;
      if (timer < PETS.eat) {
        m.setBowl(food, timer / PETS.eat);
        soundT -= dt;
        if (soundT <= 0) {
          soundT = 0.42;
          sfx.play('chomp', { volume: 0.7, pitch: 0.9 + Math.random() * 0.25 });
        }
      } else if (food) {
        m.setBowl(null);
        food = null;
        d.model.play('happy');
        sfx.play('bark');
        voice.say('pets_sirko_thanks', { priority: 5 });
      } else if (timer > PETS.eat + 1.2) {
        errandSpot(ctx, c, run);
        lastPos.copy(d.body.pos);
        setPhase('run');
      }
      break;
    }
    case 'run': {
      const left = walk(ctx, run, RUN, dt);
      speed = Math.hypot(d.body.vel.x, d.body.vel.z);
      wag = 0.4;
      stuckT = d.body.pos.distanceTo(lastPos) < 0.6 * dt * RUN * 0.3 ? stuckT + dt : 0;
      lastPos.copy(d.body.pos);
      if (left < 0.5 || stuckT > 1 || timer > 6) {
        soundT = 0;
        setPhase('sniff');
      }
      break;
    }
    case 'sniff': {
      d.body.vel.set(0, d.body.vel.y, 0);
      stepBody(ctx.world, d.body, dt);
      sniff = Math.min(1, timer * 4) * Math.min(1, (PETS.sniff - timer) * 4 + 0.2);
      wag = 0.6;
      d.yaw += Math.sin(anim * 2.2) * dt * 0.8;
      soundT -= dt;
      if (soundT <= 0) {
        soundT = 0.65;
        sfx.play('sniff', { volume: 0.8 });
      }
      if (timer >= PETS.sniff) {
        // found it: a product goes in his mouth, coins jingle in his collar
        ctx.effects.sparkle(tmp.copy(d.body.pos).setY(d.body.pos.y + 0.3), find?.kind === 'product' ? ITEMS[find.item].color : 0xffd23a);
        if (find?.kind === 'product') {
          const head = d.model.root.getObjectByName('head');
          try {
            carry = ctx.models.item(find.item);
            carry.scale.setScalar(0.55);
            carry.position.set(0, -0.08, 0.5);
            head?.add(carry);
          } catch {
            carry = null;
          }
        } else sfx.play('coin', { volume: 0.5 });
        d.model.play('happy');
        lastPos.copy(d.body.pos);
        setPhase('back');
      }
      break;
    }
    case 'back': {
      const to = tmp.set(p.x - d.body.pos.x, 0, p.z - d.body.pos.z);
      const dist = to.length();
      to.multiplyScalar(dist > 0 ? Math.max(0, dist - 1.3) / dist : 0).add(d.body.pos);
      to.y = p.y;
      walk(ctx, to, RUN, dt);
      speed = Math.hypot(d.body.vel.x, d.body.vel.z);
      wag = 1;
      stuckT = d.body.pos.distanceTo(lastPos) < dt * 0.5 ? stuckT + dt : 0;
      lastPos.copy(d.body.pos);
      if (stuckT > 1.5 && dist > 3) {
        // stuck behind something: a hop over to the party
        ctx.effects.poof(d.body.pos, 0xffe3a3, 10);
        placeOnGround(ctx.world, d.body, p.x - Math.sin(ctx.player.yaw) * 1.4, p.z - Math.cos(ctx.player.yaw) * 1.4);
        stuckT = 0;
      }
      if (dist < 1.7 || timer > 12) {
        d.yaw = yawOf(p.x - d.body.pos.x, p.z - d.body.pos.z);
        d.model.play('happy');
        sfx.play('bark');
        voice.say('pets_sirko_find', { priority: 5 });
        deliver(ctx);
        return release(ctx, m);
      }
      break;
    }
  }
  d.model.root.position.copy(d.body.pos);
  d.model.root.rotation.y = d.yaw;
  d.model.update(dt, speed);
  sirkoPose(d.model.root, anim, wag, sniff);
}

/** A tap on the aquarium: flakes, the fish rush up, a plop; the first feeding a day gives coins. */
function updateFish(ctx: Ctx): void {
  const aq = homeAquarium();
  if (!aq || !ctx.house || !ctx.input.taps.length || !clearTap(ctx) || !isInside(ctx.house, ctx.player.pos)) return;
  aq.top.getWorldPosition(tmp);
  if (!tappedAt(ctx, tmp, 0.9)) return;
  feedTheFish(ctx);
}

function feedTheFish(ctx: Ctx): void {
  const aq = homeAquarium();
  if (!aq) return;
  aq.top.getWorldPosition(tmp);
  aq.feed();
  sfx.play('plop');
  setTimeout(() => sfx.play('plop', { pitch: 1.25, volume: 0.7 }), 260);
  setTimeout(() => sfx.play('plop', { pitch: 0.9, volume: 0.6 }), 520);
  const coins = feedFish(ctx.save.home.pets, ctx.save.day);
  if (coins) giveCoins(ctx, coins, tmp);
  if (anim - fishTalkT >= PETS.fishTalkEvery) {
    fishTalkT = anim;
    voice.say(FISH_LINES[fishLine++ % FISH_LINES.length], { priority: 4 });
  }
}

export function initPets(ctx: Ctx): void {
  if (dog) returnCompanion(DOG);
  dog = null;
  phase = 'off';
  food = null;
  find = null;
  dropCarry();
  fishTalkT = -Infinity;
  const screen = (p: THREE.Vector3) => {
    const v = p.clone().project(ctx.camera);
    const r = ctx.renderer.domElement.getBoundingClientRect();
    return [Math.round(r.left + (v.x * 0.5 + 0.5) * r.width), Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height)];
  };
  // For automated checks.
  (window as unknown as { __kotoPets: object }).__kotoPets = {
    get state() {
      const pets = ctx.save.home.pets;
      const k = kennel(ctx);
      const p = ctx.player.pos;
      return {
        phase,
        ...pets,
        day: ctx.save.day,
        hungry: isHungry(pets, ctx.save.day),
        dog: dog?.body.pos.toArray().map((v) => +v.toFixed(1)) ?? null,
        find,
        hero: p.toArray().map((v) => +v.toFixed(1)),
        kennel: k ? k.s.centre.toArray().map((v) => +v.toFixed(1)) : null,
      };
    },
    /** Where to tap (px): the bowl, the dog, the aquarium. */
    get bowl() {
      return kennel(ctx) ? screen(bowlW.clone().setY(bowlW.y + 0.1)) : null;
    },
    get dogAt() {
      const at = companionPos(DOG);
      return at ? screen(at.clone().setY(at.y + 0.45)) : null;
    },
    get tank() {
      const aq = homeAquarium();
      return aq ? screen(aq.top.getWorldPosition(new THREE.Vector3())) : null;
    },
    /** The bowl's local spot on the model (for placing checks). */
    bowlAt: BOWL_AT.toArray(),
    feedFish: () => feedTheFish(ctx),
    /** Puts things in the box (food for him). */
    give: (id: keyof typeof ITEMS, n = 1) => giveItem(ctx, id, n),
    get coins() {
      return ctx.save.coins;
    },
    get inv() {
      return { ...ctx.save.inv };
    },
  };
}
