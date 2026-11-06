import * as THREE from 'three';
import { createYardLife, type YardLife } from '../assets/babusia';
import { BABUSIA_HOUSE, BABUSIA_SPOTS, type Site } from '../content/babusia';
import type { CharacterModel } from '../contracts';
import type { Ctx } from '../core/ctx';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { faceTo, walkTo } from './tasks';

/**
 * Оля's yard (DESIGN.md «Бабуся»): butterflies, ladybirds and beetles, and a rabbit hopping about.
 * They travel with her: built the first time she lands, shown only while she is at home.
 */

const HOP_SPEED = 1.5;
const HOP_HEIGHT = 0.16;
const HOP_PACE = 9;
/** A tap on the rabbit: one big hop. */
const JUMP_HEIGHT = 0.7;
const JUMP_TIME = 0.5;
const TAP_NEAR = 9;
/** At breakfast it stays this near to her. */
const BY_HER = 1.3;

interface Rabbit {
  model: CharacterModel;
  pos: THREE.Vector3;
  yaw: number;
  goal: [number, number] | null;
  wait: number;
  t: number;
  jump: number;
}

let life: YardLife | null = null;
let rabbit: Rabbit | null = null;
let at: Site | null = null;
const tapAt = new THREE.Vector3();

/** Anywhere in the front yard, clear of the fire. */
function nextSpot(site: Site): [number, number] {
  const { fire } = BABUSIA_SPOTS;
  for (;;) {
    const dx = Math.random() * BABUSIA_HOUSE.sizeX;
    const dz = BABUSIA_HOUSE.sizeZ + 1.5 + Math.random() * 6;
    if (Math.hypot(dx - fire.dx, dz - fire.dz) > 2) return [site[0] + dx, site[2] + dz];
  }
}

/** The yard goes where the house went; nothing is built until she has come. */
export function placeYard(ctx: Ctx, site: Site): void {
  at = site;
  if (!life && ctx.save.babusia.host === 'olia') {
    life = createYardLife(ctx.skin);
    ctx.scene.add(life.root);
    const model = ctx.models.character({ kind: 'parts', id: 'rabbit' });
    model.root.userData.casts = true;
    ctx.scene.add(model.root);
    rabbit = { model, pos: new THREE.Vector3(), yaw: 0, goal: null, wait: 1, t: 0, jump: 0 };
  }
  life?.root.position.set(site[0], site[1] + 1, site[2]);
  if (!rabbit) return;
  const [x, z] = nextSpot(site);
  rabbit.pos.set(x, site[1] + 1, z);
  rabbit.goal = null;
}

export function showYard(on: boolean): void {
  if (life) life.root.visible = on;
  if (rabbit) rabbit.model.root.visible = on;
}

function hop(ctx: Ctx, r: Rabbit, her: THREE.Vector3, feeding: boolean, dt: number): number {
  if (feeding && Math.hypot(her.x - r.pos.x, her.z - r.pos.z) > BY_HER + 0.4) r.goal = [her.x + BY_HER, her.z + 0.5];
  if (r.goal) {
    if (walkTo(ctx, r, r.goal[0], r.goal[1], HOP_SPEED, dt)) {
      r.goal = null;
      r.wait = 1.5 + Math.random() * 3;
    }
    return HOP_SPEED;
  }
  if (feeding) faceTo(r, her.x, her.z, dt, 4);
  r.wait -= dt;
  if (r.wait <= 0 && !feeding && at) r.goal = nextSpot(at);
  return 0;
}

export function updateYard(ctx: Ctx, her: THREE.Vector3, feeding: boolean, dt: number): void {
  life?.update(ctx.clock.elapsed);
  const r = rabbit;
  if (!r) return;
  const speed = hop(ctx, r, her, feeding, dt);
  r.t += dt;
  r.jump = Math.max(0, r.jump - dt);
  const big = r.jump > 0 ? Math.sin((r.jump / JUMP_TIME) * Math.PI) * JUMP_HEIGHT : 0;
  const little = speed > 0 ? Math.abs(Math.sin(r.t * HOP_PACE)) * HOP_HEIGHT : 0;
  r.model.root.position.copy(r.pos).setY(r.pos.y + big + little);
  r.model.root.rotation.y = r.yaw;
  r.model.update(dt, speed);
  const p = ctx.player.pos;
  if (ctx.input.taps.length && Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < TAP_NEAR && tappedAt(ctx, tapAt.copy(r.pos).setY(r.pos.y + 0.3), 0.7)) {
    r.jump = JUMP_TIME;
    sfx.play('click', { pitch: 1.7 });
  }
}
