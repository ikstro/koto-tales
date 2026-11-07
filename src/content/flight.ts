/**
 * The house flight (DESIGN.md «Бабуся», «The flight»): every night Бабуся's house moves on, and
 * when the party sleeps in her beds they fly with it. Here are the moments of the scene and the
 * curves that move it; systems/babusia.ts plays them. Seconds count from the moment the party
 * lies down (case 1, `aboard`) or from the hostess's word at the door (case 2, `seen`).
 */

export const FLIGHT = {
  /** Lying down: the roof comes back, the night deepens, the site is looked for. */
  settle: 2.4,
  /** The swirl begins here, the house leaves the ground at `lift`. */
  lift: 3.0,
  /** At height. */
  cruise: 6.2,
  height: 22,
  /** The cloud sea comes in and goes out between these. */
  cloudsIn: [4.0, 5.6] as [number, number],
  cloudsOut: [9.5, 11.0] as [number, number],
  /** Under full cover the world moves under the house. */
  teleport: 7.5,
  /** Coming down, touching the ground, the pieces at rest. */
  descend: 9.5,
  touch: 12.2,
  dock: 13.4,
  /** The cloud layer this far below the flying floor. */
  cloudBelow: 10,
  /** Clouds slide towards the camera this fast: the house flies away from it. */
  drift: 6,
  /** The dawn runs over the descent: the sun is up as the house lands. */
  dawnFrom: 0.93,
  dawnTo: 0.999,
  /** The night deepens this fast while they lie down (day fractions a second). */
  nightfall: 0.12,
  night: 0.8,
  /** Case 2: the house lifts off, drifts away and is gone. */
  seenSwirl: 2.5,
  seenLift: 3.0,
  seenGone: 7.2,
  seenHeight: 8,
  seenAway: 4,
  seenFade: 1.4,
  /** Seen from above it cannot fly off into the distance: it shrinks in its swirl to a toy speck and is gone. */
  seenShrink: 0.85,
  /** The view leans towards the leaving house by at most this many blocks (the hero stays in the frame). */
  seenLean: 6,
  /** The camera's pull-back: the house whole while they lie down and land, with the sky round it in flight. */
  zoomBed: 1.8,
  zoomSky: 2.6,
  /** Case 2: the house leaving is seen against the sky. */
  zoomSeen: 1.9,
  /** The view trails the house by up to this many blocks on the way up and down. */
  lag: 5,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export type FlightPhase = 'settle' | 'lift' | 'glide' | 'descend' | 'touch' | 'done';

export function phaseAt(t: number): FlightPhase {
  const F = FLIGHT;
  if (t < F.settle) return 'settle';
  if (t < F.cruise) return 'lift';
  if (t < F.descend) return 'glide';
  if (t < F.touch) return 'descend';
  return t < F.dock ? 'touch' : 'done';
}

/** How high the floor is over its ground (case 1): up, level, down, and a toy's bounce at the end. */
export function liftAt(t: number): number {
  const F = FLIGHT;
  if (t < F.lift) return 0;
  if (t < F.cruise) return F.height * easeInOut(clamp01((t - F.lift) / (F.cruise - F.lift)));
  if (t < F.descend) return F.height;
  if (t < F.touch) return F.height * (1 - easeInOut(clamp01((t - F.descend) / (F.touch - F.descend))));
  return bounceAt(t - F.touch);
}

/** The bounce after touching down (`s` seconds after): a little hop, then still. */
export function bounceAt(s: number): number {
  if (s <= 0 || s > 1.2) return 0;
  return 0.55 * Math.exp(-5 * s) * Math.abs(Math.sin(9 * s));
}

/** The squash on contact: a toy piece set down (0 = none). */
export function squashAt(s: number): number {
  if (s < 0 || s > 0.5) return 0;
  return 0.11 * Math.exp(-7 * s) * Math.cos(10 * s);
}

/** The cloud sea's strength 0..1 along the flight. */
export function cloudsAt(t: number): number {
  const F = FLIGHT;
  return smooth(F.cloudsIn[0], F.cloudsIn[1], t) * (1 - smooth(F.cloudsOut[0], F.cloudsOut[1], t));
}

/** A gentle sway in the air: dx, dz, scaled down near the ground. */
export function swayAt(t: number, lift: number): [number, number] {
  const k = Math.min(1, lift / 5);
  return [Math.sin(t * 0.9) * 0.35 * k, Math.cos(t * 0.7) * 0.25 * k];
}

/** The clock over the descent: from the first light to the sun just up; null while it is night. */
export function dawnAt(t: number): number | null {
  const F = FLIGHT;
  if (t < F.descend) return null;
  return F.dawnFrom + (F.dawnTo - F.dawnFrom) * smooth(F.descend, F.dock, t);
}

/** The swirl of petals or fireflies, 0..1: it gathers as the house takes off, thins out in the sky, and comes once more as it lands. */
export function swirlAt(t: number): number {
  const F = FLIGHT;
  const off = smooth(F.settle, F.lift, t) * (1 - smooth(F.cruise - 0.6, F.cruise + 0.8, t));
  const land = smooth(F.touch - 1.4, F.touch - 0.6, t) * (1 - smooth(F.touch + 0.2, F.dock, t));
  return Math.max(off, land * 0.7);
}

/**
 * How far the view lags behind the flying floor (blocks): the house is seen to rise in the frame
 * before the camera catches up, and to drop in it on the way down.
 */
export function lagAt(t: number): number {
  const F = FLIGHT;
  if (t > F.lift && t < F.cruise) return -F.lag * Math.sin((Math.PI * (t - F.lift)) / (F.cruise - F.lift));
  if (t > F.descend && t < F.touch) return F.lag * 0.8 * Math.sin((Math.PI * (t - F.descend)) / (F.touch - F.descend));
  return 0;
}

/** Case 2, seen from the yard: height, a little drift, its size, the view turning to it, how much is left to see. */
export function seenAt(t: number): { lift: number; away: number; size: number; look: number; opacity: number; swirl: number; gone: boolean } {
  const F = FLIGHT;
  const a = clamp01((t - F.seenLift) / (F.seenGone - F.seenLift));
  // up first, then off into the distance faster and faster
  const rise = 1 - (1 - a) * (1 - a);
  return {
    lift: F.seenHeight * rise,
    away: F.seenAway * a * a,
    size: 1 - F.seenShrink * smooth(F.seenLift + 0.6, F.seenGone, t),
    /** 0..1: how far the view has turned to the house (lean and pull-back). */
    look: smooth(F.seenSwirl, F.seenLift + 1, t),
    opacity: 1 - smooth(F.seenGone - F.seenFade, F.seenGone, t),
    swirl: smooth(F.seenSwirl, F.seenLift, t) * (1 - smooth(F.seenGone - 1.2, F.seenGone, t)),
    gone: t >= F.seenGone,
  };
}

/** How far the camera pulls back (case 1); the camera eases between the steps by itself. */
export function zoomAt(t: number): number {
  const F = FLIGHT;
  if (t >= F.dock) return 1;
  return t >= F.lift && t < F.descend ? F.zoomSky : F.zoomBed;
}
