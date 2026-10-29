/**
 * Shared bits of the kit's building models (buildings.ts, disco.ts): the colours, the
 * power bulb, own-material glows and light pools. Materials made here that change per
 * frame carry `userData.own = true` (render/skins/cutaway.ts leaves those in place).
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { PartBuilder, Paint, V3, Kit } from './parts/kit';
import type { PowerView } from './buildings';

export const CORAL = '#e0583f';
export const CORAL_DARK = '#b8432f';
export const CREAM = '#ffe3a3';
export const INK = '#3b2414';
export const WOOD = '#8a5a2b';
export const MUSTARD = '#eab02b';
export const TEAL = '#2f918b';
export const MINT = '#59b3ab';
export const CHARCOAL = '#2e2a28';

export const STEEL = '#b7bcc2';
export const STEEL_DARK = '#7a8088';
export const SOLAR_BLUE = '#1f56b0';
export const SOLAR_BLUE_LIGHT = '#2f7fd6';
export const WOOD_DARK = '#6e4520';
export const WARM = '#ffd23a';
export const TAU = Math.PI * 2;

/** A stepped triangle (toy bricks can't be slanted): rows from the base up, centred on x = 0. */
export function stepped(p: ReturnType<Kit['part']>, halfW: number, height: number, z: number, depth: number, colour: string, rows = 5): void {
  const h = height / rows;
  for (let i = 0; i < rows; i++) {
    const w = 2 * halfW * (1 - (i + 0.5) / rows);
    if (w > 0.05) p.box([w, h, depth], [0, h * (i + 0.5), z], colour);
  }
}

export const C_WARM = new THREE.Color(WARM);
export const C_WARM_SOFT = new THREE.Color('#ffd98a');
export const C_CORAL = new THREE.Color('#ff6a4a');
export const C_OFF = new THREE.Color('#5b5550');

/** A glowing part with its own material (shared ones must not blink). */
export function ownGlow(skin: Skin, hex: string): THREE.MeshStandardMaterial {
  const m = (skin.partMaterial(hex, { emissive: true }) as THREE.MeshStandardMaterial).clone();
  // this model's own (it blinks): changed in place, never copied (render/skins/cutaway.ts)
  m.userData.own = true;
  return m;
}

/** Colour and glow strength of an own glow material (`k` 0 = unlit plastic). */
export function setGlow(m: THREE.MeshStandardMaterial, c: THREE.Color, k: number): void {
  m.color.copy(c);
  m.emissive.copy(c).multiplyScalar(k);
}

export const bulbGeo = new THREE.BoxGeometry(0.13, 0.13, 0.1);
export const bezelGeo = new THREE.BoxGeometry(0.21, 0.21, 0.04);

export interface Bulb {
  update(t: number, pw: PowerView | undefined): void;
}

/**
 * The «power bulb» stud on every power building, on a surface facing +Z at `at`:
 * warm yellow when the network has enough, blinking coral (3 Hz) when it is short,
 * dull grey when not joined to a network.
 */
export function powerBulb(skin: Skin, parent: THREE.Object3D, at: V3): Bulb {
  const bezel = new THREE.Mesh(bezelGeo, skin.partMaterial(CHARCOAL));
  bezel.position.set(at[0], at[1], at[2] + 0.02);
  const mat = ownGlow(skin, WARM);
  const lamp = new THREE.Mesh(bulbGeo, mat);
  lamp.position.set(at[0], at[1], at[2] + 0.06);
  parent.add(bezel, lamp);
  let last = '';
  return {
    update(t, pw) {
      const state = !pw || !pw.linked ? 'off' : pw.low ? (Math.floor(t * 6) % 2 === 0 ? 'low' : 'dim') : pw.on ? 'on' : 'off';
      if (state === last) return;
      last = state;
      if (state === 'on') setGlow(mat, C_WARM, 1);
      else if (state === 'low') setGlow(mat, C_CORAL, 1);
      else setGlow(mat, C_OFF, 0);
    },
  };
}

/** How long a night show lasts (seconds); `BuildingTick.show` counts up from 0 to this. */
export const SHOW_LENGTH = 20;

const SHOW_COLOURS = ['#ffd98a', '#ff6a4a', '#7fe0c8', '#ffc23a'].map((c) => new THREE.Color(c));

/**
 * The show's colour wave: warm → coral → mint → mustard and round again, shifted by `phase`
 * (where the light stands, so a row of lamps ripples). Writes into `out`.
 */
export function showColour(show: number, phase: number, out: THREE.Color): THREE.Color {
  const n = SHOW_COLOURS.length;
  const x = (((show * 0.9 - phase) % n) + n) % n;
  const i = Math.floor(x);
  const f = x - i;
  return out.copy(SHOW_COLOURS[i]).lerp(SHOW_COLOURS[(i + 1) % n], f * f * (3 - 2 * f));
}

/** A building's place in the show's wave, from where it stands in the world. */
export function showPhase(root: THREE.Object3D): number {
  return (root.position.x + root.position.z) * 0.12;
}

/** How strong the show is now, 0..1: it swells in over a second and fades over the last two. */
export function showLevel(show: number | undefined): number {
  if (show === undefined || show < 0 || show >= SHOW_LENGTH) return 0;
  return Math.min(1, show, (SHOW_LENGTH - show) / 2);
}

export function markShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
}

/** A regular octagon standing on `y0` at (x, z), `s` across the flats (four boxes, the toy way). */
export function octagon(p: PartBuilder, s: number, h: number, y0: number, paint: Paint, x = 0, z = 0): void {
  const t = s * 0.4142;
  const y = y0 + h / 2;
  p.box([s, h, t], [x, y, z], paint);
  p.box([t, h, s], [x, y, z], paint);
  p.box([s, h, t], [x, y, z], paint, [0, Math.PI / 4, 0]);
  p.box([s, h, t], [x, y, z], paint, [0, -Math.PI / 4, 0]);
}

/** A soft round fade (bright middle, nothing at the edge) for additive pools of light. */
export function fadeDisc(radius: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, 20).rotateX(-Math.PI / 2);
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = i === 0 ? 1 : 0;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function glowMaterial(hex: number, vertexColors = false): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color: hex,
    vertexColors,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  m.userData.own = true;
  return m;
}
