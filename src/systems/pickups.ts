import * as THREE from 'three';
import type { ChunkInfo } from '../contracts';
import type { Pickup } from '../actors/entities';
import { ITEMS, ITEM_ORDER, PICKUPS, type ItemId } from '../content/items';
import { HERO_STATS } from '../content/heroes';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';

const tmp = new THREE.Vector3();
let showTimer = 0;
let dropSeq = 0;
/** Pickups within the show radius, refreshed twice a second; only these move and draw. */
let shown: Pickup[] = [];

/**
 * Every item type is drawn as instances: one InstancedMesh per mesh of the
 * item's model (one per material, usually 1–3), however many lie around.
 * `models.item(id)` stays the single source of the look (portraits use it too).
 */
class ItemBatch {
  meshes: THREE.InstancedMesh[] = [];
  private cap = 0;
  private parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; local: THREE.Matrix4 | null }[] = [];

  constructor(
    private id: ItemId,
    template: THREE.Object3D,
    private root: THREE.Group,
  ) {
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const local = m.matrixWorld.clone();
      this.parts.push({ geo: m.geometry, mat: m.material, local: local.equals(IDENTITY) ? null : local });
    });
  }

  /** Room for n instances (grows by doubling; the matrices are rewritten every frame anyway). */
  reserve(n: number): void {
    if (n <= this.cap) return;
    let cap = Math.max(8, this.cap);
    while (cap < n) cap *= 2;
    for (const m of this.meshes) {
      m.removeFromParent();
      m.dispose();
    }
    this.meshes = this.parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, cap);
      im.name = `pickups:${this.id}`;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // instances move every frame and spread over the show radius: no sphere to cull by
      im.frustumCulled = false;
      im.matrixAutoUpdate = false;
      im.castShadow = false;
      im.receiveShadow = true;
      im.count = 0;
      this.root.add(im);
      return im;
    });
    this.cap = cap;
  }

  set(i: number, m: THREE.Matrix4): void {
    for (let k = 0; k < this.meshes.length; k++) {
      const local = this.parts[k].local;
      this.meshes[k].setMatrixAt(i, local ? m4b.multiplyMatrices(m, local) : m);
    }
  }

  finish(n: number): void {
    for (const im of this.meshes) {
      im.count = n;
      if (n > 0) im.instanceMatrix.needsUpdate = true;
    }
  }
}

const IDENTITY = new THREE.Matrix4();
const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();
const q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const batches = new Map<ItemId, ItemBatch>();
const counts = new Map<ItemId, number>();
const fill = new Map<ItemId, number>();
let batchRoot: THREE.Group | null = null;

function batchOf(ctx: Ctx, id: ItemId): ItemBatch {
  if (!batchRoot) {
    batchRoot = new THREE.Group();
    batchRoot.name = 'pickups';
    ctx.scene.add(batchRoot);
  }
  let b = batches.get(id);
  if (!b) {
    b = new ItemBatch(id, ctx.models.item(id), batchRoot);
    batches.set(id, b);
  }
  return b;
}

function pickItem(rand: () => number, biome: string): ItemId | null {
  const pool = ITEM_ORDER.filter((id) => {
    const c = ITEMS[id];
    return c.weight > 0 && (c.biomes === 'any' || (c.biomes as string[]).includes(biome));
  });
  const total = pool.reduce((s, id) => s + ITEMS[id].weight, 0);
  let r = rand() * total;
  for (const id of pool) if ((r -= ITEMS[id].weight) <= 0) return id;
  return null;
}

/**
 * Scatters things to find over a freshly generated chunk. Placement comes
 * from the chunk's own random, so the same world always hides the same
 * treasures; collected ones are remembered by their place.
 */
export function initPickups(ctx: Ctx): void {
  const picked = new Set(ctx.save.picked);
  const add = (item: ItemId, x: number, y: number, z: number, chunk: string) => {
    const key = `${Math.floor(x)},${Math.floor(z)}:${item}`;
    if (picked.has(key) || ctx.pickups.has(key)) return;
    ctx.pickups.set(key, { key, item, pos: new THREE.Vector3(x, y, z), chunk, shown: false, vel: null, phase: Math.random() * 6, magnet: false });
  };

  ctx.world.onChunkGenerated = (info: ChunkInfo) => {
    const chunk = `${info.cx},${info.cz}`;
    const n = PICKUPS.perChunkMin + Math.floor(info.rand() * PICKUPS.perChunkSpread);
    for (let i = 0; i < n; i++) {
      const x = info.x0 + Math.floor(info.rand() * 16);
      const z = info.z0 + Math.floor(info.rand() * 16);
      const item = pickItem(info.rand, info.biomeAt(x, z));
      const y = info.dryGroundAt(x, z);
      if (item && y !== null) add(item, x + 0.5, y, z + 0.5, chunk);
    }
    if (info.rand() < PICKUPS.coinTrailChance) {
      const [lo, hi] = PICKUPS.coinTrailLength;
      const len = lo + Math.floor(info.rand() * (hi - lo + 1));
      const dirX = info.rand() < 0.5 ? 1 : 0;
      let x = info.x0 + 2 + Math.floor(info.rand() * 10);
      let z = info.z0 + 2 + Math.floor(info.rand() * 10);
      for (let i = 0; i < len; i++) {
        const y = info.dryGroundAt(x, z);
        if (y !== null) add('coin', x + 0.5, y, z + 0.5, chunk);
        if (dirX) x++;
        else z++;
      }
    }
  };
}

/** Coins that pop out of a defeated monster. They are not remembered by the save. */
export function dropCoins(ctx: Ctx, at: THREE.Vector3, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const key = `drop:${dropSeq++}`;
    ctx.pickups.set(key, {
      key,
      item: 'coin',
      pos: at.clone(),
      chunk: '',
      shown: false,
      vel: new THREE.Vector3(Math.sin(a) * 2.5, 6 + Math.random() * 2, Math.cos(a) * 2.5),
      phase: Math.random() * 6,
      magnet: false,
    });
  }
}

function collect(ctx: Ctx, p: Pickup): void {
  p.shown = false;
  ctx.pickups.delete(p.key);
  if (p.chunk) ctx.save.picked.push(p.key);
  const s = ctx.save;
  ctx.effects.sparkle(tmp.copy(p.pos).setY(p.pos.y + 0.4), ITEMS[p.item].color);
  let total: number;
  if (p.item === 'coin') {
    // The coin flies from where it was into the HUD counter, which ticks when it lands.
    tmp.copy(p.pos).setY(p.pos.y + 0.4).project(ctx.camera);
    ctx.hud.flyCoin(((tmp.x + 1) / 2) * window.innerWidth, ((1 - tmp.y) / 2) * window.innerHeight);
    total = ++s.coins;
    sfx.play('coin', { pitch: 1 + Math.random() * 0.1 });
    events.emit('coins:changed', { coins: s.coins });
  } else if (p.item === 'heart') {
    // A heart from a defeated monster: one heart back, never kept or stickered.
    heal(ctx, 'item_heart');
    return;
  } else {
    total = s.inv[p.item] = (s.inv[p.item] ?? 0) + 1;
    sfx.play('pickup');
    // Apples are food: a hungry hero gets a heart back.
    if (p.item === 'apple' && ctx.player.hearts < HERO_STATS.maxHearts) heal(ctx, 'heal_apple');
  }
  const first = !s.found.includes(p.item);
  if (first) s.found.push(p.item);
  events.emit('item:picked', { item: p.item, first, total });
}

/** One heart back for the player, with a warm sparkle and a word from the narrator. */
function heal(ctx: Ctx, line: 'item_heart' | 'heal_apple'): void {
  const h = ctx.player;
  if (h.hearts >= HERO_STATS.maxHearts) return;
  h.hearts += 1;
  ctx.effects.sparkle(tmp.copy(h.pos).setY(h.pos.y + 1.2), 0xff4d6d);
  sfx.play('sticker', { volume: 0.7 });
  voice.say(line, { priority: 3 });
}

/** A heart that pops out of a defeated monster and waits to be picked up. Not saved. */
export function dropHeart(ctx: Ctx, at: THREE.Vector3): void {
  const key = `drop:${dropSeq++}`;
  ctx.pickups.set(key, {
    key,
    item: 'heart',
    pos: at.clone(),
    chunk: '',
    shown: false,
    vel: new THREE.Vector3((Math.random() - 0.5) * 2, 7, (Math.random() - 0.5) * 2),
    phase: Math.random() * 6,
    magnet: false,
  });
}

export function updatePickups(ctx: Ctx, dt: number): void {
  const player = ctx.player;
  const ppos = player?.pos;
  const focus = ppos ?? ctx.house?.centre;
  if (!focus) return;

  // Show / hide by distance, twice a second.
  showTimer -= dt;
  if (showTimer <= 0) {
    showTimer = 0.5;
    const r2 = PICKUPS.showRadius * PICKUPS.showRadius;
    shown = [];
    for (const p of ctx.pickups.values()) {
      const d2 = (p.pos.x - focus.x) ** 2 + (p.pos.z - focus.z) ** 2;
      if (d2 < r2) p.shown = true;
      else if (d2 > r2 * 1.3) p.shown = false;
      if (p.shown) shown.push(p);
    }
  }

  const canPick = ctx.playing && !ctx.sleeping && ppos;
  let picked = false;
  for (const p of shown) {
    if (!p.shown) continue;
    p.phase += dt;

    if (p.vel) {
      // Flying out of a monster.
      p.vel.y -= 20 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const g = ctx.world.groundHeight(Math.floor(p.pos.x), Math.floor(p.pos.z), Math.floor(p.pos.y) + 1);
      if (p.pos.y <= g && p.vel.y < 0) {
        p.pos.y = g;
        p.vel = null;
      }
    }

    if (canPick) {
      const d = Math.hypot(p.pos.x - ppos.x, p.pos.z - ppos.z, p.pos.y + 0.3 - (ppos.y + 0.6));
      if (d < PICKUPS.magnetRadius) p.magnet = true;
      if (p.magnet && !p.vel) {
        tmp.set(ppos.x, ppos.y + 0.6, ppos.z).sub(p.pos);
        const len = tmp.length();
        p.pos.addScaledVector(tmp.normalize(), Math.min(len, dt * (6 + 10 / Math.max(len, 0.3))));
      }
      if (d < PICKUPS.pickRadius) {
        collect(ctx, p);
        picked = true;
      }
    }
  }
  if (picked) shown = shown.filter((p) => p.shown);

  // Draw: bob and spin as instance matrices, item type by item type.
  counts.clear();
  for (const p of shown) counts.set(p.item, (counts.get(p.item) ?? 0) + 1);
  for (const [id, n] of counts) batchOf(ctx, id).reserve(n);
  for (const id of batches.keys()) if (!counts.has(id)) counts.set(id, 0);
  fill.clear();
  for (const p of shown) {
    const i = fill.get(p.item) ?? 0;
    fill.set(p.item, i + 1);
    tmp.set(p.pos.x, p.pos.y + 0.15 + Math.sin(p.phase * 2.5) * 0.08, p.pos.z);
    q.setFromAxisAngle(UP, p.phase * 1.6);
    batches.get(p.item)!.set(i, m4.compose(tmp, q, ONE));
  }
  for (const [id, b] of batches) b.finish(counts.get(id) ?? 0);
}
