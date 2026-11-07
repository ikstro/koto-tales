/**
 * The weather (DESIGN.md «Weather»): each morning it may change by itself; the kit's weather pad
 * changes it at once. It never touches a real light's existence: after the skin has set its
 * lights for the time of day, this frame's mood scales their strength and colour, and the fog.
 */
import type * as THREE from 'three';
import { BABUSIA_HOUSE } from '../content/babusia';
import { MOODS, WEATHERS, easeMood, freshMood, morningWeather, particlesAt, weatherAfter, weatherOf } from '../content/weather';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { createWeatherLook, type WeatherLook } from '../render/weather';
import { rainSound, sfx } from '../voice/sfx';
import { B } from '../world/blocks';
import { isInside } from './house';

/** Seconds between looks at what is over the hero's head. */
const ROOF_CHECK = 0.25;
/** A ceiling this far above the feet counts as being indoors. */
const ROOF_REACH = 8;
/** The rain through a roof. */
const RAIN_INDOORS = 0.45;

let look: WeatherLook | null = null;
let quality: { readonly level: number } = { level: 2 };
const mood = freshMood();
let sun: THREE.DirectionalLight | null = null;
let hemi: THREE.HemisphereLight | null = null;
let fogNear = 0;
let fogFar = 0;
/** 1 under a roof, easing so the drops do not vanish in a frame. */
let shelter = 0;
let indoors = false;
let roofT = 0;
/** The level the rain's sound was last asked for. */
let heard = 0;
/** A scene's veil 0..1 (the flying house over the clouds): the land sinks into the sky's colour beyond the house, the drops stop. */
let veil = 0;
const VEIL_NEAR = 44;
const VEIL_FAR = 56;

/** Sets the veil, 0..1 (systems/babusia.ts, the flight); 0 gives the world back. */
export function veilFog(k: number): void {
  veil = Math.max(0, Math.min(1, k));
}

export const weatherNow = (ctx: Ctx): number => weatherOf(ctx.save.weather);

function change(ctx: Ctx, n: number): void {
  const w = weatherOf(n);
  if (w === weatherNow(ctx)) return;
  ctx.save.weather = w;
  events.emit('weather:change', { weather: w });
}

/** The weather pad: a soft whoosh, and the new weather comes in over the next seconds. */
export function setWeather(ctx: Ctx, n: number): void {
  sfx.play('whoosh');
  change(ctx, n);
}

/** One step round the four; returns the new one. */
export function nextWeather(ctx: Ctx): number {
  const w = weatherAfter(weatherNow(ctx));
  setWeather(ctx, w);
  return w;
}

function underRoof(ctx: Ctx): boolean {
  const p = ctx.player.pos;
  if (ctx.house && isInside(ctx.house, p)) return true;
  // both houses have their roofs as props, so they are told by their rooms
  const at = ctx.save.babusia.at;
  if (at) {
    const i = BABUSIA_HOUSE.interior;
    if (p.x >= at[0] + i.x0 && p.x < at[0] + i.x1 && p.z >= at[2] + i.z0 && p.z < at[2] + i.z1 && p.y >= at[1] && p.y < at[1] + 5) return true;
  }
  // anything else with a ceiling of blocks; a tree's crown is no roof
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  const z = Math.floor(p.z);
  for (let d = 2; d <= ROOF_REACH; d++) {
    const id = ctx.world.getBlock(x, y + d, z);
    if (id !== B.AIR && id !== B.LEAVES && id !== B.WATER) return true;
  }
  return false;
}

function tone(c: THREE.Color): void {
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  c.r = (c.r + (l - c.r) * mood.grey) * mood.r;
  c.g = (c.g + (l - c.g) * mood.grey) * mood.g;
  c.b = (c.b + (l - c.b) * mood.grey) * mood.b;
}

/** Runs after the skin set its lights for the frame; every value here is set afresh by the skin next frame. */
function applyMood(scene: THREE.Scene): void {
  if (sun) {
    sun.intensity *= mood.sun;
    sun.shadow.intensity *= mood.shadow;
    tone(sun.color);
  }
  if (hemi) {
    hemi.intensity *= mood.sky;
    tone(hemi.color);
  }
  scene.environmentIntensity *= mood.env;
  const fog = scene.fog as THREE.Fog | null;
  if (fog) {
    tone(fog.color);
    fog.near = fogNear * mood.fogNear + (VEIL_NEAR - fogNear * mood.fogNear) * veil;
    fog.far = fogFar * mood.fogFar + (VEIL_FAR - fogFar * mood.fogFar) * veil;
  }
  const sky = scene.background as THREE.Color | null;
  if (sky?.isColor) tone(sky);
}

/** Before the first frame: the look is built here so the shaders are ready before the first drop. */
export function initWeather(ctx: Ctx, q: { readonly level: number }): void {
  quality = q;
  look = createWeatherLook(ctx.scene);
  for (const o of ctx.scene.children) {
    if ((o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
    else if ((o as THREE.HemisphereLight).isHemisphereLight) hemi = o as THREE.HemisphereLight;
  }
  const fog = ctx.scene.fog as THREE.Fog | null;
  if (fog) [fogNear, fogFar] = [fog.near, fog.far];

  events.on('time:phase', ({ phase }) => {
    if (phase !== 'morning') return;
    const p = ctx.player.pos;
    change(ctx, morningWeather(ctx.save.seed, ctx.save.day, weatherNow(ctx), ctx.world.biomeAt(p.x, p.z) === 'snow'));
  });
  // no frames while the game is away, so nothing would ask the rain to stop
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    heard = 0;
    rainSound(0);
  });

  // For automated checks: `set(n, true)` skips the seconds of easing (a software GPU draws a frame a second).
  (window as unknown as { __kotoWeather: object }).__kotoWeather = {
    set(n: number, now = false) {
      setWeather(ctx, n);
      if (now) Object.assign(mood, MOODS[weatherNow(ctx)]);
    },
    get state() {
      const w = weatherNow(ctx);
      return { weather: w, name: WEATHERS[w], day: ctx.save.day, indoors, shelter: +shelter.toFixed(2), heard: +heard.toFixed(2), mood: { ...mood } };
    },
  };
}

/** Every frame while playing, between the skin's light and the draw; `paused` holds the world still. */
export function updateWeather(ctx: Ctx, dt: number, paused = false): void {
  if (!look || !ctx.playing) return;
  easeMood(mood, MOODS[weatherNow(ctx)], dt);
  roofT -= dt;
  if (roofT <= 0) {
    roofT = ROOF_CHECK;
    indoors = underRoof(ctx);
  }
  shelter += ((indoors ? 1 : 0) - shelter) * (1 - Math.exp(-dt * 8));
  applyMood(ctx.scene);

  const fall = (mood.rain + mood.snow) * (1 - veil);
  look.draw(dt, ctx.camera, particlesAt(quality.level), fall, fall > 0 ? mood.snow / fall : 0, mood.bow, ctx.clock.daylight, shelter);

  const level = paused || mood.rain < 0.02 ? 0 : mood.rain * (indoors ? RAIN_INDOORS : 1);
  if (Math.abs(level - heard) > 0.02 || (level === 0 && heard !== 0)) {
    heard = level;
    rainSound(level);
  }
}
