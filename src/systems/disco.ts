import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { music, SONGS } from '../voice/music';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { nearestStanding, selectedBuilding, standingWhere, working } from './kit';

/**
 * The disco (DESIGN.md «Music»): heroes on a working dance floor dance at once; the time
 * the child's hero dances is counted (the kit box's «dance» task); next to a working DJ
 * console a note piece breathes — a tap plays the next song on every speaker.
 */

const SONG_LINES = ['song_disco', 'song_rock', 'song_happy', 'song_lullaby'] as const;

/** Whether (x, z, feet y) stands on a working dance floor. */
export function onDanceFloor(x: number, y: number, z: number): boolean {
  for (const s of standingWhere((c) => !!c.floor)) {
    if (!working(s)) continue;
    const [w, d] = s.rec.rot % 2 ? [s.card.size[1], s.card.size[0]] : s.card.size;
    if (x >= s.rec.x && x < s.rec.x + w && z >= s.rec.z && z < s.rec.z + d && Math.abs(y - s.centre.y) < 1.5) return true;
  }
  return false;
}

/** A working DJ console right next to the hero (the note piece shows), unless a building is being placed. */
export function djNear(ctx: Ctx): boolean {
  if (selectedBuilding()) return false;
  const s = nearestStanding(ctx, (c) => !!c.dj);
  return !!s && working(s);
}

export function initDisco(ctx: Ctx): void {
  music.setSong(ctx.save.song);
  // For automated checks.
  (window as unknown as { __kotoDisco: object }).__kotoDisco = {
    next: () => ctx.input.press('prompt:note'),
    get state() {
      return { song: music.songIndex, danced: +ctx.save.stats.danced.toFixed(1), dj: djNear(ctx), dancing: ctx.player.dancing };
    },
  };
}

export function updateDisco(ctx: Ctx, dt: number): void {
  if (ctx.player.dancing) ctx.save.stats.danced += dt;
  if (ctx.input.take('prompt:note') && djNear(ctx)) {
    const next = (music.songIndex + 1) % SONGS.length;
    music.setSong(next);
    ctx.save.song = next;
    sfx.play('sticker', { pitch: 1.2 });
    ctx.player.model.play('cheer');
    voice.say(SONG_LINES[next], { priority: 6, interrupt: true });
    events.emit('music:song', { song: next });
  }
}
