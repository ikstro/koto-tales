import * as THREE from 'three';
import { overlapsBlock } from '../actors/physics';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { B, BLOCKS } from '../world/blocks';
import { sfx } from '../voice/sfx';
import { isHouseShell } from './house';

const tmp = new THREE.Vector3();

/** The column right in front of the player, on the grid. */
function frontCell(ctx: Ctx): { x: number; z: number; feetY: number } {
  const p = ctx.player.pos;
  const dx = Math.sin(ctx.player.yaw);
  const dz = Math.cos(ctx.player.yaw);
  const sx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
  const sz = sx === 0 ? Math.sign(dz) : 0;
  return { x: Math.floor(p.x) + sx, z: Math.floor(p.z) + sz, feetY: Math.floor(p.y + 0.01) };
}

function occupied(ctx: Ctx, x: number, y: number, z: number): boolean {
  for (const h of ctx.heroes.values()) if (overlapsBlock(h.body, x, y, z)) return true;
  for (const m of ctx.monsters) if (m.alive && overlapsBlock(m.body, x, y, z)) return true;
  return false;
}

const colorOf = (id: number) => parseInt((BLOCKS[id]?.side.color ?? '#ffffff').slice(1), 16);

function place(ctx: Ctx): void {
  const { world } = ctx;
  const { x, z, feetY } = frontCell(ctx);
  let y = feetY;
  // Blocks stack: a tap in front of a wall puts the next block on top.
  while (world.isSolid(x, y, z) && y < feetY + 3) y++;
  if (y > feetY + 2 || occupied(ctx, x, y, z)) {
    sfx.play('click');
    return;
  }
  const id = ctx.save.buildBlock;
  world.setBlock(x, y, z, id);
  ctx.effects.poof(tmp.set(x + 0.5, y + 0.5, z + 0.5), colorOf(id), 6);
  ctx.player.model.play('attack');
  sfx.play('place');
  events.emit('block:placed', { x, y, z, id });
}

function breakFront(ctx: Ctx): void {
  const { world, house } = ctx;
  const { x, z, feetY } = frontCell(ctx);
  for (const y of [feetY, feetY + 1, feetY - 1]) {
    if (y <= 0 || !world.isSolid(x, y, z)) continue;
    if (house && isHouseShell(house, x, y, z)) {
      sfx.play('click');
      return;
    }
    const id = world.getBlock(x, y, z);
    world.setBlock(x, y, z, B.AIR);
    ctx.effects.poof(tmp.set(x + 0.5, y + 0.5, z + 0.5), colorOf(id), 12);
    ctx.player.model.play('attack');
    sfx.play('break');
    events.emit('block:broken', { x, y, z, id });
    return;
  }
  sfx.play('click');
}

export function updateBuilding(ctx: Ctx): void {
  if (!ctx.playing || ctx.sleeping) return;
  if (ctx.input.take('place')) place(ctx);
  if (ctx.input.take('break')) breakFront(ctx);
}
