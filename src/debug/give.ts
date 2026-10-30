import * as THREE from 'three';
import { ARTIFACTS } from '../content/artifacts';
import { BUILDINGS, type BuildingId } from '../content/buildings';
import { COMPANIONS } from '../content/companions';
import { ITEMS, type ItemId } from '../content/items';
import { MONSTERS, type MonsterKind } from '../content/monsters';
import type { Ctx } from '../core/ctx';
import { giveArtifact } from '../systems/artifacts';
import { giveCompanion } from '../systems/companions';
import { pushCarried } from '../systems/effects';
import { addToKit } from '../systems/kit';
import { spawnAt } from '../systems/monsters';

/**
 * ?spawn= and ?give= (core/params.ts): see a new card alive without playing up to it.
 *   ?spawn=zombie,skeleton   monsters beside the hero, a few blocks in front
 *   ?give=tent,apple,<artifact>,<companion>   a building into the kit, 3 of an item, an artifact, a companion
 */
export function applyDebugParams(ctx: Ctx): void {
  const { spawn, give } = ctx.params;
  if (!spawn.length && !give.length) return;
  // a moment after the start, so the ground under the hero is there
  setTimeout(() => {
    const p = ctx.player.pos;
    spawn.forEach((kind, i) => {
      if (!(kind in MONSTERS)) return console.warn(`[spawn] no monster "${kind}"`);
      const a = ctx.player.yaw + (i - (spawn.length - 1) / 2) * 0.5;
      spawnAt(ctx, kind as MonsterKind, p.x + Math.sin(a) * 4, p.z + Math.cos(a) * 4);
    });
    for (const id of give) {
      if (id in BUILDINGS) addToKit(ctx, id as BuildingId, 1);
      else if (id in ITEMS) {
        ctx.save.inv[id as ItemId] = (ctx.save.inv[id as ItemId] ?? 0) + 3;
        if (!ctx.save.found.includes(id)) ctx.save.found.push(id);
        pushCarried(ctx);
      } else if (id in ARTIFACTS) giveArtifact(ctx, id);
      else if (id in COMPANIONS) giveCompanion(ctx, id);
      else console.warn(`[give] no card "${id}"`);
    }
    ctx.effects.ring(new THREE.Vector3().copy(p), 0xffd23a, 2);
  }, 1500);
}
