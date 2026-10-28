import * as THREE from 'three';
import type { ChunkInfo } from '../contracts';
import type { Pickup } from '../actors/entities';
import { ITEMS, ITEM_ORDER, PICKUPS, type ItemId } from '../content/items';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';

const tmp = new THREE.Vector3();
let showTimer = 0;
let dropSeq = 0;

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
    ctx.pickups.set(key, { key, item, pos: new THREE.Vector3(x, y, z), chunk, obj: null, vel: null, phase: Math.random() * 6, magnet: false });
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
      obj: null,
      vel: new THREE.Vector3(Math.sin(a) * 2.5, 6 + Math.random() * 2, Math.cos(a) * 2.5),
      phase: Math.random() * 6,
      magnet: false,
    });
  }
}

function collect(ctx: Ctx, p: Pickup): void {
  if (p.obj) ctx.scene.remove(p.obj);
  ctx.pickups.delete(p.key);
  if (p.chunk) ctx.save.picked.push(p.key);
  const s = ctx.save;
  ctx.effects.sparkle(tmp.copy(p.pos).setY(p.pos.y + 0.4), ITEMS[p.item].color);
  let total: number;
  if (p.item === 'coin') {
    total = ++s.coins;
    sfx.play('coin', { pitch: 1 + Math.random() * 0.1 });
    events.emit('coins:changed', { coins: s.coins });
  } else {
    total = s.inv[p.item] = (s.inv[p.item] ?? 0) + 1;
    sfx.play('pickup');
  }
  const first = !s.found.includes(p.item);
  if (first) s.found.push(p.item);
  events.emit('item:picked', { item: p.item, first, total });
}

export function updatePickups(ctx: Ctx, dt: number): void {
  const player = ctx.player;
  const ppos = player?.pos;
  const focus = ppos ?? ctx.house?.centre;
  if (!focus) return;

  // Create / drop the 3D objects by distance, twice a second.
  showTimer -= dt;
  if (showTimer <= 0) {
    showTimer = 0.5;
    const r2 = PICKUPS.showRadius * PICKUPS.showRadius;
    for (const p of ctx.pickups.values()) {
      const d2 = (p.pos.x - focus.x) ** 2 + (p.pos.z - focus.z) ** 2;
      if (d2 < r2 && !p.obj) {
        p.obj = ctx.models.item(p.item);
        p.obj.position.copy(p.pos);
        ctx.scene.add(p.obj);
      } else if (d2 > r2 * 1.3 && p.obj) {
        ctx.scene.remove(p.obj);
        p.obj = null;
      }
    }
  }

  const canPick = ctx.playing && !ctx.sleeping && ppos;
  for (const p of [...ctx.pickups.values()]) {
    if (!p.obj) continue;
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
        continue;
      }
    }

    p.obj.position.set(p.pos.x, p.pos.y + 0.15 + Math.sin(p.phase * 2.5) * 0.08, p.pos.z);
    p.obj.rotation.y = p.phase * 1.6;
  }
}
