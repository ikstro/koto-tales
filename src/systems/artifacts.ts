import * as THREE from 'three';
import { ARTIFACTS } from '../content/artifacts';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';

/**
 * Artifacts (content/artifacts.ts): found once, kept for good. Finding one: a fanfare of sparkles,
 * its line, the album sticker (`a:<id>`). Its lasting power is read by systems/effects.ts.
 */
export function giveArtifact(ctx: Ctx, id: string): boolean {
  const card = ARTIFACTS[id];
  if (!card) {
    console.warn(`[artifacts] no card "${id}"`);
    return false;
  }
  if (ctx.save.artifacts.includes(id)) return false;
  ctx.save.artifacts.push(id);
  const key = `a:${id}`;
  if (!ctx.save.found.includes(key)) ctx.save.found.push(key);
  const at = new THREE.Vector3().copy(ctx.player.pos).setY(ctx.player.pos.y + 1.6);
  ctx.effects.firework(at, 0xffd23a, 2.5);
  ctx.effects.sparkle(at, 0xffd23a);
  sfx.play('sticker');
  // after the thanks of the tale / the castle's prize line
  setTimeout(() => voice.say(card.line, { priority: 7 }), 2600);
  events.emit('artifact:found', { id });
  return true;
}
