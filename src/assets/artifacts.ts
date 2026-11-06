/**
 * Artifacts' models (content/artifacts.ts): small toy treasures built like items — 0.4–0.6 blocks,
 * origin at the bottom centre, front towards +Z; glow parts instead of lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { bloom, roundFace } from './items';
import { Kit, type PartBuilder, type Paint, type V3 } from './parts/kit';

type Builder = (p: PartBuilder) => void;

const GOLD = '#ffc42e';
const GOLD_DEEP = '#c8861a';
const GOLD_PALE = '#ffe27a';
const SHINE: Paint = { c: '#fff1b0', glow: true };
const STAND = '#6b3f1d';

/** One builder per artifact card, keyed by its id. */
export const ARTIFACT_BUILDERS: Record<string, Builder> = {
  // Вінок королеви: a golden wreath of daisies and poppies leaning back on a little stand
  queen_wreath: (p) => {
    const tilt = -0.5;
    const e = new THREE.Euler(tilt, 0, 0);
    const v = new THREE.Vector3();
    const ring = (a: number, r: number, out = 0): V3 => {
      v.set(Math.cos(a) * r, Math.sin(a) * r, out).applyEuler(e);
      return [v.x, 0.3 + v.y, v.z];
    };
    p.box([0.3, 0.05, 0.2], [0, 0.025, 0], STAND).box([0.12, 0.09, 0.09], [0, 0.085, 0.03], GOLD_DEEP);
    // the twisted gold band and its leaves, in pairs along it
    const N = 20;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const b = ((i + 1) / N) * Math.PI * 2;
      p.beam(ring(a, 0.205), ring(b, 0.205), 0.062, i % 2 ? GOLD : GOLD_DEEP);
      if (i % 2) continue;
      p.box([0.1, 0.045, 0.02], ring(a, 0.25, 0.012), GOLD_DEEP, [tilt, 0, a + 0.7]);
      p.box([0.1, 0.045, 0.02], ring(a, 0.16, 0.012), GOLD_DEEP, [tilt, 0, a - 0.7]);
    }
    // the flowers, a daisy and a poppy in turn
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 2 + (i / 8) * Math.PI * 2;
      if (i % 2) bloom(p, ring(a, 0.205, 0.04), 0.15, '#e8463a', '#2a1a14', 5, [tilt, 0, 0]);
      else bloom(p, ring(a, 0.205, 0.04), 0.14, '#fff9ec', '#ffc928', 8, [tilt, 0, 0]);
    }
  },
  // Скандинавські палиці: two long crossed golden walking poles, slim coral grips with wrist loops, little baskets, a glowing knot
  nordic_poles: (p) => {
    p.box([0.5, 0.04, 0.14], [0, 0.02, 0], STAND);
    for (const s of [1, -1]) {
      const z = s * 0.018;
      const along = (t: number): V3 => [s * (-0.21 + t * 0.42), 0.04 + t * 0.53, z];
      p.beam(along(0), along(1), 0.032, GOLD);
      // the pointed foot and the little basket above it
      p.beam(along(0), along(0.08), 0.042, GOLD_DEEP).beam(along(0.2), along(0.215), 0.1, GOLD_DEEP);
      // the slim grip, its cap and the wrist loop hanging off it
      p.beam(along(0.84), along(1.02), 0.052, '#e0583f').beam(along(1.02), along(1.05), 0.062, GOLD_PALE);
      const a = along(0.98);
      const b: V3 = [a[0] + s * 0.09, a[1] - 0.09, z];
      const c: V3 = [a[0] + s * 0.02, a[1] - 0.17, z];
      p.beam(a, b, 0.018, GOLD_DEEP).beam(b, c, 0.018, GOLD_DEEP);
    }
    // the knot where they cross
    p.box([0.085, 0.085, 0.08], [0, 0.305, 0], GOLD_DEEP, [0, 0, Math.PI / 4]).box([0.055, 0.055, 0.1], [0, 0.305, 0], SHINE, [0, 0, Math.PI / 4]);
  },
  // Золота платівка: a golden record on a little dark stand, grooves shining, its label glowing
  golden_record: (p) => {
    const tilt = -0.14;
    const at: V3 = [0, 0.3, 0];
    p.box([0.38, 0.05, 0.2], [0, 0.025, 0], STAND)
      .box([0.24, 0.07, 0.03], [0, 0.085, 0.075], GOLD_DEEP)
      .box([0.24, 0.12, 0.03], [0, 0.11, -0.01], GOLD_DEEP);
    roundFace(p, 0.5, at, 0.024, GOLD_DEEP, tilt);
    roundFace(p, 0.47, at, 0.03, GOLD, tilt);
    [0.42, 0.35, 0.28].forEach((d, i) => {
      roundFace(p, d, at, 0.034 + i * 0.008, GOLD_DEEP, tilt);
      roundFace(p, d - 0.016, at, 0.038 + i * 0.008, GOLD, tilt);
    });
    roundFace(p, 0.18, at, 0.066, { c: '#ffe9a0', glow: true }, tilt);
    roundFace(p, 0.045, at, 0.072, STAND, tilt);
  },
  // Вічний ліхтарик: a small golden lantern with warm glass, a round hot core that never goes out, a ring on top
  eternal_torch: (p) => {
    p.box([0.34, 0.05, 0.34], [0, 0.025, 0], GOLD_DEEP).box([0.3, 0.03, 0.3], [0, 0.065, 0], GOLD);
    // the round core first, the warm glass over it
    const hot = { c: '#fff4c8', glow: true };
    p.box([0.17, 0.12, 0.17], [0, 0.215, 0], hot).box([0.12, 0.17, 0.12], [0, 0.215, 0], hot).box([0.14, 0.14, 0.14], [0, 0.215, 0], hot, [0, Math.PI / 4, 0]);
    p.box([0.24, 0.27, 0.24], [0, 0.215, 0], { c: '#ffb73a', glow: true, clear: true });
    for (const x of [-0.125, 0.125]) for (const z of [-0.125, 0.125]) p.box([0.045, 0.29, 0.045], [x, 0.215, z], GOLD);
    p.box([0.3, 0.03, 0.3], [0, 0.365, 0], GOLD)
      .box([0.34, 0.03, 0.34], [0, 0.39, 0], GOLD_DEEP)
      .box([0.25, 0.04, 0.25], [0, 0.42, 0], GOLD)
      .box([0.15, 0.04, 0.15], [0, 0.46, 0], GOLD)
      .box([0.07, 0.03, 0.07], [0, 0.495, 0], GOLD_PALE);
    // the ring handle
    p.box([0.03, 0.07, 0.03], [-0.055, 0.54, 0], GOLD_DEEP)
      .box([0.03, 0.07, 0.03], [0.055, 0.54, 0], GOLD_DEEP)
      .box([0.14, 0.03, 0.03], [0, 0.585, 0], GOLD_DEEP);
  },
  // Бабусин годинник: a golden wristwatch standing on its looped strap, a cream face, its hands printed as bars
  babusia_watch: (p) => {
    const cy = 0.235;
    const R = 0.215;
    const band = (a: number, r = R): V3 => [0, cy + Math.sin(a) * r, Math.cos(a) * r];
    // the strap: links round the loop, gold and deep gold in turn
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      p.box([i % 2 ? 0.17 : 0.15, 0.03, 0.09], band(a + Math.PI / N), i % 2 ? GOLD : GOLD_DEEP, [Math.PI / 2 - (a + Math.PI / N), 0, 0]);
    }
    // the case sits up on the front of the loop, looking at whoever bends over it
    const face = 0.55;
    const tilt = -face;
    const on = (out: number, x = 0, y = 0): V3 => {
      const c = band(face, R + out);
      return [c[0] + x, c[1] + y * Math.cos(face), c[2] - y * Math.sin(face)];
    };
    roundFace(p, 0.31, on(0.02), 0.05, GOLD_DEEP, tilt);
    roundFace(p, 0.29, on(0.04), 0.03, GOLD, tilt);
    roundFace(p, 0.25, on(0.055), 0.012, SHINE, tilt);
    roundFace(p, 0.225, on(0.06), 0.012, '#fff4d8', tilt);
    // four little bars for the quarters, two hands, a pin
    const print = '#4a2c14';
    for (const [x, y, w, h] of [
      [0, 0.088, 0.018, 0.036],
      [0, -0.088, 0.018, 0.036],
      [0.088, 0, 0.036, 0.018],
      [-0.088, 0, 0.036, 0.018],
    ] as const) {
      p.box([w, h, 0.006], on(0.068, x, y), print, [tilt, 0, 0]);
    }
    p.box([0.017, 0.082, 0.006], on(0.07, 0.016, 0.036), print, [tilt, 0, -0.42])
      .box([0.016, 0.06, 0.006], on(0.07, -0.026, 0.012), print, [tilt, 0, 1.15])
      .box([0.028, 0.028, 0.008], on(0.072), '#e0583f', [tilt, 0, Math.PI / 4]);
    // the crown on its side
    p.box([0.04, 0.05, 0.05], on(0.03, 0.17, 0), GOLD_PALE, [tilt, 0, 0]);
  },
};

/** Builds one artifact template (callers clone it). */
export function buildArtifact(id: string, skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = `artifact:${id}`;
  const build = ARTIFACT_BUILDERS[id];
  if (!build) throw new Error(`no artifact model for "${id}"`);
  const p = new Kit(`artifact:${id}`, skin).part('artifact', g);
  build(p);
  p.done();
  return g;
}
