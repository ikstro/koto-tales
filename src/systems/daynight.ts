import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';

/** One full day, in seconds: ~3 minutes of day, ~1 minute of night. */
export const DAY_LENGTH = 300;
const EVENING = 0.6;
const NIGHT = 0.7;
const DAWN = 0.93;

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** 1 = full day, 0 = deep night. */
export function daylightAt(t: number): number {
  if (t < EVENING) return 1;
  if (t < NIGHT + 0.04) return 1 - smooth(EVENING, NIGHT + 0.04, t);
  if (t < DAWN) return 0;
  return smooth(DAWN, 1, t);
}

let lastPhase: 'morning' | 'evening' | 'night' | null = null;
let lastAmbient: 'day' | 'night' | null = null;

function phaseOf(t: number): 'morning' | 'evening' | 'night' {
  if (t >= DAWN || t < 0.1) return 'morning';
  if (t >= NIGHT) return 'night';
  if (t >= EVENING) return 'evening';
  return 'morning';
}

export function updateDayNight(ctx: Ctx, dt: number): void {
  const c = ctx.clock;
  if (!c.frozen && ctx.playing) c.t = (c.t + dt / DAY_LENGTH) % 1;
  c.daylight = daylightAt(c.t);
  ctx.world.setDaylight(c.daylight);
  ctx.save.time = c.t;

  const phase = phaseOf(c.t);
  if (phase !== lastPhase) {
    // The first phase of a session is not announced; the start line covers it.
    if (lastPhase !== null && ctx.playing) {
      // A new day begins each morning lived through (the boss counts days to come back).
      if (phase === 'morning') ctx.save.day = (ctx.save.day ?? 0) + 1;
      events.emit('time:phase', { phase });
    }
    lastPhase = phase;
  }
  const amb = c.daylight > 0.4 ? 'day' : 'night';
  if (amb !== lastAmbient && ctx.playing) {
    lastAmbient = amb;
    sfx.ambient(amb);
  }
}
