import * as THREE from 'three';
import type { CharacterModel, HeroId, ItemId, MonsterKind } from '../contracts';
import { HEROES, HERO_STATS, type HeroCard } from '../content/heroes';
import { MONSTERS, type MonsterCard } from '../content/monsters';
import { makeBody, type Body } from './physics';

const TAU = Math.PI * 2;

/** Turns `from` towards `to` (radians) by at most `maxStep`, the short way round. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

export class Hero {
  readonly card: HeroCard;
  readonly body: Body;
  yaw = 0;
  hearts = HERO_STATS.maxHearts;
  /** Seconds of blinking after a bump, while monsters cannot hurt again. */
  invulnerable = 0;
  sinceHit = 99;
  regenTimer = 0;
  fireCd = 0;
  boltCd = 0;
  /** Bot brain: next time a bot may shoot / cast on its own. */
  botFireCd = 0;
  botBoltCd = 4;
  stuckTime = 0;
  isPlayer = false;
  /** Dancing to a boombox (the player stood still near the music). */
  dancing = false;

  constructor(
    readonly id: HeroId,
    readonly model: CharacterModel,
  ) {
    this.card = HEROES[id];
    const small = id === 'pupsia';
    this.body = makeBody(small ? 0.32 : 0.3, small ? 0.75 : 1.45);
  }

  get pos(): THREE.Vector3 {
    return this.body.pos;
  }

  /** Chest height, where arrows leave from. */
  chest(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.body.pos).setY(this.body.pos.y + this.body.height * 0.6);
  }

  syncModel(dt: number): void {
    const r = this.model.root;
    r.position.copy(this.body.pos);
    r.rotation.y = this.yaw;
    const speed = Math.hypot(this.body.vel.x, this.body.vel.z);
    this.model.update(dt, speed);
    // Blink while invulnerable after a bump.
    r.visible = this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;
  }
}

/** 'dance': near a playing boombox a monster forgets to bite and dances. */
export type MonsterState = 'wander' | 'chase' | 'flee' | 'dance';

export class Monster {
  readonly card: MonsterCard;
  readonly body: Body;
  hp: number;
  yaw = Math.random() * TAU;
  state: MonsterState = 'wander';
  wanderTarget = new THREE.Vector3();
  wanderTimer = 0;
  hitCd = 0;
  /** Ranged monsters: seconds until the next throw. */
  throwCd = 1.5;
  stun = 0;
  spotted = false;
  alive = true;

  constructor(
    readonly kind: MonsterKind,
    readonly model: CharacterModel,
  ) {
    this.card = MONSTERS[kind];
    this.hp = this.card.hp;
    this.body = makeBody(this.card.radius, this.card.height);
  }

  get pos(): THREE.Vector3 {
    return this.body.pos;
  }

  syncModel(dt: number): void {
    const r = this.model.root;
    r.position.copy(this.body.pos);
    r.rotation.y = this.yaw;
    this.model.update(dt, Math.hypot(this.body.vel.x, this.body.vel.z));
  }
}

export class Arrow {
  readonly vel = new THREE.Vector3();
  /** Helpers' arrows hit softer than the child's own (difficulty). */
  damage = 1;
  by: Hero | null = null;
  life = 2.2;
  stuck = false;
  dead = false;

  constructor(
    readonly obj: THREE.Object3D,
    readonly pos: THREE.Vector3,
  ) {}
}

/** A thing lying in the world, waiting to be picked up. */
export interface Pickup {
  key: string;
  item: ItemId;
  pos: THREE.Vector3;
  /** Chunk it belongs to; transient coins dropped by monsters use ''. */
  chunk: string;
  /** Drawn (within PICKUPS.showRadius of the focus); systems/pickups.ts draws each item type instanced. */
  shown: boolean;
  /** Coins dropped by monsters fly out first, then rest. */
  vel: THREE.Vector3 | null;
  phase: number;
  /** Being pulled towards the player. */
  magnet: boolean;
}
