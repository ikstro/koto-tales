/**
 * Weather (DESIGN.md «Weather»): a gentle mood, never a danger. Бабуся is its queen and walks in
 * any of it. Pure rules: what the morning brings and what each weather does to the light; run by
 * systems/weather.ts, drawn by render/weather.ts. `save.weather` holds the number.
 */

export const WEATHERS = ['sun', 'rain', 'snow', 'rainbow'] as const;
export type WeatherName = (typeof WEATHERS)[number];

export const SUN = 0;
export const RAIN = 1;
export const SNOW = 2;
export const RAINBOW = 3;

/** Any number as a weather: the pad's step past the last one comes round to the sun. */
export const weatherOf = (n: number): number => {
  const k = WEATHERS.length;
  return Number.isFinite(n) ? ((Math.floor(n) % k) + k) % k : SUN;
};

/** The weather pad's next one: 0 → 1 → 2 → 3 → 0. */
export const weatherAfter = (n: number): number => weatherOf(weatherOf(n) + 1);

/** How often a morning brings each: rain on a plain day; after rain, a rainbow or more rain; snow only in the cold. */
export const CHANCE = { rain: 0.2, bowAfterRain: 0.3, rainAgain: 0.15, snow: 0.35 };

/** One steady number in 0..1 for this world and this day. */
function roll(seed: number, day: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(day + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** What a morning brings, from the day that begins, yesterday's weather and whether the hero stands in the snow biome. */
export function morningWeather(seed: number, day: number, was: number, cold: boolean): number {
  const r = roll(seed, day);
  if (cold) return r < CHANCE.snow ? SNOW : SUN;
  if (was === RAIN) {
    if (r < CHANCE.bowAfterRain) return RAINBOW;
    return r < CHANCE.bowAfterRain + CHANCE.rainAgain ? RAIN : SUN;
  }
  return r < CHANCE.rain ? RAIN : SUN;
}

/**
 * What a weather does to the scene. The light fields multiply what the skin set for the time of
 * day, so one mood serves day, dusk and night alike; 1 everywhere is the plain sun.
 */
export interface Mood {
  /** Share of the falling particles that fall as rain / as snow, and how strong the arc is. */
  rain: number;
  snow: number;
  bow: number;
  /** The sun, the sky's light, the reflections, the darkness of the shadows. */
  sun: number;
  sky: number;
  env: number;
  shadow: number;
  /** The colour of light and haze: drained towards grey, then tinted. */
  grey: number;
  r: number;
  g: number;
  b: number;
  /** Where the fog begins and ends, as shares of the skin's. */
  fogNear: number;
  fogFar: number;
}

const PLAIN: Mood = { rain: 0, snow: 0, bow: 0, sun: 1, sky: 1, env: 1, shadow: 1, grey: 0, r: 1, g: 1, b: 1, fogNear: 1, fogFar: 1 };

export const MOODS: readonly Mood[] = [
  PLAIN,
  { ...PLAIN, rain: 1, sun: 0.5, sky: 0.9, env: 0.85, shadow: 0.5, grey: 0.5, r: 0.88, g: 0.93, b: 1.03, fogNear: 0.36, fogFar: 0.5 },
  { ...PLAIN, snow: 0.7, sun: 0.85, sky: 1.4, env: 1.2, shadow: 0.65, grey: 0.6, r: 0.93, g: 1, b: 1.16, fogNear: 0.4, fogFar: 0.6 },
  { ...PLAIN, bow: 1 },
];

export const freshMood = (): Mood => ({ ...PLAIN });

const FIELDS = Object.keys(PLAIN) as (keyof Mood)[];
/** Seconds of the mood's time constant: most of the way in about 3 s. */
const EASE = 0.9;

/** Moves `cur` towards `to` in place. */
export function easeMood(cur: Mood, to: Mood, dt: number): void {
  const a = 1 - Math.exp(-dt / EASE);
  for (const k of FIELDS) cur[k] += (to[k] - cur[k]) * a;
}

/** Most particles in the air, at the best quality level. */
export const MAX_PARTICLES = 900;

/** Particles by quality level (core/quality.ts): all of them are one draw of small quads, so even the lowest keeps a few. */
export const particlesAt = (level: number): number => (level >= 2 ? MAX_PARTICLES : level === 1 ? 700 : level === 0 ? 480 : 260);
