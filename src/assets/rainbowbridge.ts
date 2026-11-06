/**
 * The rainbow bridge: a shallow arch ten blocks long, its deck six stripes running along x from
 * coral through orange, yellow, green and blue to violet, on a cream edge, with low cream rails on
 * mustard posts and a small puffy cloud at each corner where the rainbow meets the bank. The deck
 * is near the ground at both ends and 0.38 high in the middle; the engine lays the invisible floor
 * over the water. At night the stripes breathe a soft additive glow and a faint pool lies under the
 * span. Origin at the floor centre of the 10×2 footprint; no lights, no power.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CREAM, MUSTARD, glowMaterial } from './buildingParts';
import { Build, finishShadows, fx, mergeCached, place, pool, tint } from './villages';

const HALF = 5;
const WIDE = 1.74;
const RISE = 0.35;
const BOTTOM = 0.03;
const SEGMENTS = 30;
const SKIRT = 0.16;
const RAIL_Z = 0.93;
const RAIL_H = 0.24;

const STRIPES = ['#e8463a', '#ff9a3c', '#ffd23a', '#3fa142', '#2f7fd6', '#8a5ad6'];
const CLOUD = '#fff6e6';
const UNDER = '#f4d9a0';

/** The deck's height at x. */
const deckY = (x: number): number => BOTTOM + RISE * (1 - (x / HALF) ** 2);

/** Quads between two rows of points, in one colour; `a` to `b` to the next column turns the face outwards. */
class Strips {
  private pos: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  add(a: (x: number) => [number, number, number], b: (x: number) => [number, number, number], hex: string): void {
    const c = new THREE.Color(hex);
    const base = this.pos.length / 3;
    for (let i = 0; i <= SEGMENTS; i++) {
      const x = -HALF + (i / SEGMENTS) * HALF * 2;
      this.pos.push(...a(x), ...b(x));
      this.col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i === SEGMENTS) break;
      const v = base + i * 2;
      this.idx.push(v, v + 1, v + 3, v, v + 3, v + 2);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

let deckGeo: THREE.BufferGeometry | null = null;
let edgeGeo: THREE.BufferGeometry | null = null;

/** The six stripes side by side across z, each with its own vertices so the colours stay crisp. */
function deck(): THREE.BufferGeometry {
  if (deckGeo) return deckGeo;
  const s = new Strips();
  const w = WIDE / STRIPES.length;
  STRIPES.forEach((hex, i) => {
    const z0 = -WIDE / 2 + i * w;
    const z1 = z0 + w;
    s.add((x) => [x, deckY(x), z0], (x) => [x, deckY(x), z1], hex);
  });
  return (deckGeo = s.geometry());
}

/** The cream sides and belly under the deck. */
function edge(): THREE.BufferGeometry {
  if (edgeGeo) return edgeGeo;
  const s = new Strips();
  const z = WIDE / 2;
  s.add((x) => [x, deckY(x), z], (x) => [x, deckY(x) - SKIRT, z], UNDER);
  s.add((x) => [x, deckY(x) - SKIRT, -z], (x) => [x, deckY(x), -z], UNDER);
  s.add((x) => [x, deckY(x) - SKIRT, z], (x) => [x, deckY(x) - SKIRT, -z], UNDER);
  return (edgeGeo = s.geometry());
}

/** A small cloud of smooth balls, built once for all four corners. */
function clouds(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HALF - 0.32);
      const z = sz * RAIL_Z;
      for (const [dx, y, dz, r] of [
        [0, 0.16, 0, 0.22],
        [sx * 0.2, 0.11, 0.03, 0.15],
        [-sx * 0.2, 0.14, -0.02, 0.16],
        [sx * 0.03, 0.31, 0, 0.13],
      ] as const) {
        parts.push(tint(place(new THREE.SphereGeometry(r, 12, 8), [x + dx, deckY(x) + y - 0.04, z + dz]), CLOUD));
      }
    }
  }
  return mergeCached('rainbowbridge/clouds', parts);
}

export function createRainbowbridge(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'rainbowbridge';
  const b = new Build(skin, 'rainbowbridge');
  root.add(b.root);

  // the low rails: posts every block, a top bar following the arch
  for (const sz of [-1, 1]) {
    const z = sz * RAIL_Z;
    for (let x = -4; x <= 4; x++) {
      b.box([0.09, RAIL_H + 0.1, 0.09], [x, deckY(x) + (RAIL_H - 0.1) / 2, z], MUSTARD);
      b.box([0.13, 0.08, 0.13], [x, deckY(x) + RAIL_H + 0.03, z], MUSTARD);
    }
    const n = 16;
    for (let i = 0; i < n; i++) {
      const x0 = -4.5 + (i / n) * 9;
      const x1 = -4.5 + ((i + 1) / n) * 9;
      b.beam([x0, deckY(x0) + RAIL_H, z], [x1, deckY(x1) + RAIL_H, z], 0.07, CREAM);
    }
  }
  b.finish();

  const plastic = b.kit.vertexColourMaterial(false);
  const stripes = new THREE.Mesh(deck(), plastic);
  const sides = new THREE.Mesh(edge(), plastic);
  const puffs = new THREE.Mesh(clouds(), plastic);
  stripes.castShadow = sides.castShadow = puffs.castShadow = true;
  root.add(stripes, sides, puffs);

  // the night: the same stripes again, additive, a hair over the deck
  const glowMat = glowMaterial(0xffffff, true);
  const glow = fx(new THREE.Mesh(deck(), glowMat));
  glow.position.y = 0.006;
  glow.visible = false;
  root.add(glow);
  const under = pool(0xffe0c8, 2.4, [0, 0.03, 0]);
  under.mesh.scale.set(2.1, 1, 1.05);
  root.add(under.mesh);
  finishShadows(root);

  let t = 0;
  return {
    root,
    update(dt, k) {
      t += dt;
      const lit = Math.min(1, Math.max(0, (k.night - 0.15) / 0.5));
      glow.visible = under.mesh.visible = lit > 0.01;
      if (lit <= 0.01) return;
      glowMat.opacity = lit * (0.34 + 0.08 * Math.sin(t * 1.4));
      under.mat.opacity = 0.2 * lit;
    },
  };
}
