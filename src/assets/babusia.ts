/**
 * Бабуся's home, the queen of flowers and weather: a living roof of grass steps full of daisies and
 * poppies with a brick chimney, a round wicker beach chair with a lime cushion, a garden table with
 * her coffee and a plate of pies, a wooden bench, an old toy television on a low cabinet, a field of
 * flowers (one draw call however many), a window box, and the stork that brings her letters. Toy
 * plastic in the skin's materials, origin = bottom centre, front towards +Z, no lights: the only
 * glow is the TV's own emissive picture and a soft additive pool under the landed stork. The camera
 * looks down at about 60° from +Z, so tops and fronts are what is modelled most.
 *
 * Seats follow food.ts: a seat's world position is the sitting surface, the sitter faces its +Z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import { Kit, type Paint, type V3 } from './parts/kit';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, INK, MUSTARD, TAU, TEAL, ownGlow, setGlow } from './buildingParts';
import type { PlaneModel } from './tales';
import { BABUSIA_BLOCKS } from '../content/babusia';
import { B, BLOCKS } from '../world/blocks';
import { BRICK, BRICK_D, Build, HP, LEAF, LEAF2, LEAF_D, TEAL_D, WOODL, WOODL_D, finishShadows, fx, place, pool, tint } from './villages';

const PETAL = '#fff9ec';
const POLLEN = '#ffc928';
const POPPY = '#e5332a';
const POPPY_D = '#b5231f';
const POPPY_EYE = '#3a2418';
const MUSTARD_EYE = '#b4611c';
const STEM = '#3f8a3a';
const SOIL = '#5b4026';
const PLANK = '#c19a5b';
const PLANK_D = '#a07a42';
const MOSS = '#4c7d36';
const WICKER = '#f0dfba';
const WICKER_L = '#f7ecd2';
const WICKER_D = '#d2b078';
const WICKER_RIM = '#c39c60';
const LIME = '#9acb3a';
const LIME_D = '#79a72a';
const PLATE = '#fbf3e4';
const PIE = '#d9a35b';
const PIE_D = '#b47c3a';
const COFFEE = '#4a2c14';
const WOOD = '#b5793c';
const WOOD_D = '#7d5128';
const WHITE = '#fff8ec';
const BEAK = '#f0702a';
const STEEL_ROD = '#8f949a';

/** A repeatable 0..1 from a position, so the same spot always grows the same flower. */
function hash(x: number, z: number, k = 0): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A seat: an empty object whose position is the sitting surface, facing +Z. */
function seatAt(parent: THREE.Object3D, at: V3): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  parent.add(s);
  return s;
}

// ─── flowers ────────────────────────────────────────────────────────────────

/** 0 daisy, 1 poppy, 2 mustard daisy, 3 a tuft of grass. */
type Plant = 0 | 1 | 2 | 3;
interface Planted {
  x: number;
  y: number;
  z: number;
  kind: Plant;
}

type Piece = [THREE.BufferGeometry, string];

const box = (w: number, h: number, d: number, at: V3, rot?: V3): THREE.BufferGeometry => place(new THREE.BoxGeometry(w, h, d), at, { rot });
const drum = (top: number, foot: number, h: number, at: V3): THREE.BufferGeometry => place(new THREE.CylinderGeometry(top, foot, h, 8), at);

function sprig(): Piece[] {
  return [
    [box(0.07, 0.42, 0.07, [0, 0.21, 0]), STEM],
    [box(0.36, 0.04, 0.12, [0.03, 0.11, 0], [0, 0.5, 0.28]), LEAF],
    [box(0.12, 0.04, 0.32, [0, 0.18, -0.02], [0.3, 0.4, 0]), LEAF2],
  ];
}

const daisy = (petal: string, eye: string): Piece[] => [
  ...sprig(),
  [box(0.48, 0.06, 0.15, [0, 0.44, 0]), petal],
  [box(0.48, 0.06, 0.15, [0, 0.44, 0], [0, Math.PI / 3, 0]), petal],
  [box(0.48, 0.06, 0.15, [0, 0.44, 0], [0, -Math.PI / 3, 0]), petal],
  [drum(0.1, 0.11, 0.08, [0, 0.48, 0]), eye],
];

const poppy = (): Piece[] => [
  ...sprig(),
  [drum(0.17, 0.08, 0.14, [0, 0.38, 0]), POPPY_D],
  [box(0.44, 0.09, 0.27, [0, 0.45, 0]), POPPY],
  [box(0.27, 0.09, 0.44, [0, 0.45, 0]), POPPY],
  [drum(0.075, 0.08, 0.05, [0, 0.5, 0]), POPPY_EYE],
];

const tuft = (): Piece[] => [
  [box(0.1, 0.34, 0.2, [0, 0.15, 0], [0, 0, 0.32]), LEAF_D],
  [box(0.1, 0.42, 0.2, [0.05, 0.19, 0.06], [0.3, 1.1, -0.22]), LEAF],
  [box(0.1, 0.3, 0.2, [-0.05, 0.13, -0.06], [-0.32, 2.2, 0.24]), LEAF_D],
];

let templates: THREE.BufferGeometry[] | null = null;
function plantTemplates(): THREE.BufferGeometry[] {
  return (templates ??= [daisy(PETAL, POLLEN), poppy(), daisy(MUSTARD, MUSTARD_EYE), tuft()].map((list) => {
    const gs = list.map(([g, hex]) => {
      g.deleteAttribute('uv');
      return tint(g, hex);
    });
    const m = mergeGeometries(gs, false)!;
    gs.forEach((g) => g.dispose());
    // the camera is always above: faces looking straight down are dropped
    const nor = m.getAttribute('normal');
    const all = m.getIndex()!;
    const kept: number[] = [];
    for (let i = 0; i < all.count; i += 3) {
      const tri = [all.getX(i), all.getX(i + 1), all.getX(i + 2)];
      if (tri.some((v) => nor.getY(v) > -0.9)) kept.push(...tri);
    }
    m.setIndex(kept);
    return m;
  }));
}

/** Every plant in one vertex-coloured geometry, each a little bigger or smaller, turned and leaning by its position. */
function plantGeometry(list: readonly Planted[], scale: number): THREE.BufferGeometry {
  const tpl = plantTemplates();
  let verts = 0;
  let tris = 0;
  for (const f of list) {
    verts += tpl[f.kind].getAttribute('position').count;
    tris += tpl[f.kind].getIndex()!.count;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const idx = new Uint32Array(tris);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  let vo = 0;
  let io = 0;
  for (const f of list) {
    const t = tpl[f.kind];
    const tp = t.getAttribute('position');
    const tn = t.getAttribute('normal');
    const tc = t.getAttribute('color');
    const ti = t.getIndex()!;
    q.setFromEuler(e.set((hash(f.x, f.z, 1) - 0.5) * 0.3, hash(f.x, f.z, 2) * TAU, (hash(f.x, f.z, 3) - 0.5) * 0.3));
    m.compose(at.set(f.x, f.y, f.z), q, size.setScalar(scale * (0.88 + 0.26 * hash(f.x, f.z, 4))));
    for (let i = 0; i < ti.count; i++) idx[io++] = ti.getX(i) + vo;
    for (let i = 0; i < tp.count; i++, vo++) {
      v.fromBufferAttribute(tp, i).applyMatrix4(m).toArray(pos, vo * 3);
      v.fromBufferAttribute(tn, i).applyQuaternion(q).toArray(nor, vo * 3);
      col[vo * 3] = tc.getX(i);
      col[vo * 3 + 1] = tc.getY(i);
      col[vo * 3 + 2] = tc.getZ(i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Flowers growing in the ground: `spots` relative to the group, kind 0 a white daisy, 1 a red poppy.
 * The whole field is one mesh in the plastic everything else uses: one draw call, no new shader.
 */
export function createFlowerField(skin: Skin, spots: { x: number; y: number; z: number; kind: 0 | 1 }[]): THREE.Group {
  const root = new THREE.Group();
  root.name = 'flower-field';
  if (!spots.length) return root;
  const mesh = new THREE.Mesh(plantGeometry(spots, 1), skin.partMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'flowers';
  mesh.receiveShadow = true;
  root.add(mesh);
  return root;
}

/** A teal window box full of daisies and poppies, 1.8 wide, its back at z = -0.22 (against the wall). */
export function createFlowerBox(skin: Skin): THREE.Group {
  const W = 1.8;
  const H = 0.34;
  const D = 0.44;
  const b = new Build(skin, 'babusia-flowerbox');
  b.box([W, H, D], [0, H / 2, 0], TEAL);
  b.box([W + 0.02, 0.07, D + 0.02], [0, 0.11, 0], TEAL_D);
  b.box([W + 0.08, 0.06, D + 0.08], [0, H, 0], CREAM);
  b.box([W - 0.06, 0.05, D - 0.06], [0, H + 0.03, 0], SOIL);
  // leaves heaped in the box and spilling onto the rim
  for (let i = 0; i < 9; i++) {
    const x = -0.76 + i * 0.19;
    b.box([0.24, 0.12, 0.3], [x, H + 0.08, (i % 2) * 0.05 - 0.03], i % 2 ? LEAF : LEAF2);
  }
  for (const [x, w, d] of [
    [-0.72, 0.26, 0],
    [-0.42, 0.18, 1],
    [-0.1, 0.3, 0],
    [0.2, 0.2, 1],
    [0.5, 0.26, 0],
    [0.76, 0.16, 1],
  ] as const) {
    b.box([w, 0.09, 0.14], [x, H + 0.08, D / 2 + 0.015], d < 0.5 ? LEAF2 : LEAF);
  }
  b.finish();
  const list: Planted[] = [];
  for (let i = 0; i < 8; i++) {
    const x = -0.74 + i * 0.21;
    list.push({ x, y: H + 0.04, z: -0.09, kind: i % 3 === 1 ? 0 : 1 });
    list.push({ x: x + 0.1, y: H + 0.04, z: 0.1, kind: i % 3 === 1 ? 1 : 0 });
  }
  const mesh = new THREE.Mesh(plantGeometry(list, 0.72), b.kit.vertexColourMaterial(false));
  mesh.name = 'flowers';
  b.root.add(mesh);
  finishShadows(b.root);
  return b.root;
}

// ─── the living roof ────────────────────────────────────────────────────────

/**
 * Stepped gable roof over a `sizeX`×`sizeZ` house, like the heroes' (content/house.ts): ridge along X
 * over the middle, eaves overhanging 0.5, in the house's own space (x 0..sizeX, z 0..sizeZ; `wallTop`
 * is the group's height), but alive: grass on every step, drifts of daisies and poppies, a few mustard
 * ones, grass hanging over the risers, a brick chimney at `chimneyX` on the back slope. Materials are
 * the roof's own clones, transparent-capable but starting opaque with depthWrite on, so fading them
 * touches nothing else: set `opacity = k` and `depthWrite = k > 0.99` on each mesh.
 */
export function createBabusiaRoof(skin: Skin, sizeX: number, sizeZ: number, wallTop: number, chimneyX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roof';
  g.position.y = wallTop;
  const paint = (c: string): Paint => ({ c, clear: true });
  const STEPS = sizeZ + 1;
  const RUN = 0.5;
  const RISE = 0.34;
  const x0 = -0.5;
  const x1 = sizeX + 0.5;
  const cz = sizeZ / 2;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const top = STEPS * RISE;
  const chimneyZ = sizeZ * 0.18;
  const clearOfChimney = (x: number, z: number) => Math.abs(x - chimneyX) > 0.62 || Math.abs(z - chimneyZ) > 0.62;
  // the kit caches geometry by name: every size of roof is its own
  const kit = new Kit(`babusia-roof-${sizeX}x${sizeZ}-${chimneyX}`, skin);
  const p = kit.part('roof', g);
  const plants: Planted[] = [];

  /** One step's grass on one side: patches of green along X, a lip over the riser, plants on top. */
  const tread = (y: number, zNear: number, zFar: number, seed: number) => {
    const depth = Math.abs(zFar - zNear);
    const mid = (zNear + zFar) / 2;
    for (let x = x0; x < x1 - 0.01; ) {
      const w = Math.min(x1 - x, 1.4 + hash(x, seed, 5) * 2.6);
      const c = hash(x, seed, 6);
      p.box([w, 0.06, depth + 0.05], [x + w / 2, y, mid + Math.sign(zFar - cz) * 0.025], paint(c < 0.4 ? LEAF : c < 0.75 ? '#68b543' : LEAF2));
      x += w;
    }
    for (let x = x0 + 0.25; x < x1 - 0.2; x += 0.46 + hash(x, seed, 7) * 0.5) {
      const z = mid + (hash(x, seed, 8) - 0.5) * 0.14;
      if (!clearOfChimney(x, z)) continue;
      const drift = Math.sin(x * 0.55 + seed * 0.8) + Math.sin(x * 0.21 - seed * 1.7);
      const r = hash(x, seed, 9);
      const kind: Plant = r < 0.08 ? 3 : r < 0.18 ? 2 : drift > 0.2 ? 1 : 0;
      plants.push({ x, y: y + 0.03, z, kind });
    }
  };

  for (let i = 0; i < STEPS; i++) {
    const half = sizeZ / 2 + 0.5 - i * RUN;
    const y = i * RISE + RISE / 2;
    p.box([len, RISE, half * 2], [cx, y, cz], paint(MOSS));
    // plank gable ends
    for (const x of [x0 - 0.02, x1 + 0.02]) p.box([0.04, RISE, half * 2], [x, y, cz], paint(i % 2 ? PLANK : PLANK_D));
    const yTop = (i + 1) * RISE;
    if (i < STEPS - 1) {
      tread(yTop, cz + half - RUN, cz + half, i * 2);
      tread(yTop, cz - half + RUN, cz - half, i * 2 + 1);
      // grass hanging over the front riser (the camera never sees the back ones)
      for (let x = x0 + 0.1; x < x1 - 0.3; x += 0.55 + hash(x, i, 10) * 0.8) {
        const w = Math.min(x1 - x, 0.22 + hash(x, i, 11) * 0.5);
        const h = 0.1 + hash(x, i, 12) * 0.14;
        p.box([w, h, 0.03], [x + w / 2, i * RISE + RISE - h / 2, cz + half + 0.015], paint(hash(x, i, 13) < 0.5 ? LEAF : LEAF_D));
      }
    }
  }
  // a board along the eaves, the grass ridge
  p.box([len + 0.08, 0.1, 0.05], [cx, 0.05, cz + sizeZ / 2 + 0.52], paint(WOOD));
  p.box([len + 0.08, 0.1, 0.05], [cx, 0.05, cz - sizeZ / 2 - 0.52], paint(WOOD));
  p.box([len + 0.06, 0.12, 1.06], [cx, top + 0.03, cz], paint('#68b543'));
  for (const row of [-0.26, 0.26]) {
    for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.42 + hash(x, row, 14) * 0.4) {
      const r = hash(x, row, 15);
      plants.push({ x, y: top + 0.09, z: cz + row + (hash(x, row, 16) - 0.5) * 0.2, kind: r < 0.5 ? 0 : r < 0.85 ? 1 : 2 });
    }
  }
  // the chimney on the back slope: brick courses, a cap, a dark mouth
  const foot = ((chimneyZ + 0.5) / RUN) * RISE - 0.5;
  const head = top + 0.2;
  const h = head - foot;
  p.box([0.8, h, 0.8], [chimneyX, foot + h / 2, chimneyZ], paint(BRICK));
  for (let y = foot + 0.2, n = 0; y < head - 0.12; y += 0.2, n++) {
    p.box([0.82, 0.03, 0.82], [chimneyX, y, chimneyZ], paint(BRICK_D));
    p.box([0.03, 0.17, 0.02], [chimneyX + (n % 2 ? -0.13 : 0.13), y + 0.1, chimneyZ + 0.405], paint(BRICK_D));
  }
  p.box([0.98, 0.16, 0.98], [chimneyX, head + 0.08, chimneyZ], paint(BRICK_D));
  p.box([0.56, 0.02, 0.56], [chimneyX, head + 0.165, chimneyZ], paint(INK));
  p.done();
  const meadow = new THREE.Mesh(plantGeometry(plants, 0.74), kit.vertexColourMaterial(true));
  meadow.name = 'meadow';
  meadow.castShadow = true;
  meadow.renderOrder = 1;
  g.add(meadow);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.transparent = true;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.roughness = 0.5;
      m.material = mat;
      m.receiveShadow = true;
    }
  });
  return g;
}

// ─── the wicker chair ───────────────────────────────────────────────────────

/**
 * A round drum seat in woven bands with a lime cushion, and rising behind it a tall woven arch: a
 * shell of half an egg with a diamond lattice on both sides and a thick rolled rim, a lime pad
 * against the back. Open towards +Z and never leaning over the seat, so the steep camera sees who sits.
 */
export function createWickerChair(skin: Skin): { root: THREE.Group; seat: THREE.Object3D } {
  const b = new Build(skin, 'babusia-chair');
  const SEAT_Y = 0.5;
  const R = 0.7;
  // the drum: woven bands, a rim under the cushion
  b.cyl(R, 0.4, [0, 0.2, 0], WICKER, { seg: 20 });
  for (const y of [0.07, 0.2, 0.33]) b.cyl(R + 0.02, 0.05, [0, y, 0], WICKER_RIM, { seg: 20 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    b.box([0.09, 0.09, 0.03], [Math.sin(a) * (R + 0.02), i % 2 ? 0.135 : 0.265, Math.cos(a) * (R + 0.02)], WICKER_L, [0, a, 0]);
  }
  b.cyl(R + 0.05, 0.07, [0, 0.42, 0], WICKER_RIM, { seg: 20 });
  // the shell: half an egg, an outer skin and a lighter inner one facing in
  const CY = 0.42;
  const RX = 0.76;
  const RY = 1.55;
  const RZ = 0.74;
  const WRAP = 1.95;
  const azOf = (d: number) => Math.PI + d;
  const shell = (): THREE.SphereGeometry => new THREE.SphereGeometry(1, 22, 10, 1.5 * Math.PI - WRAP, WRAP * 2, 0, HP);
  b.geo(shell(), [0, CY, 0], WICKER, { s: [RX, RY, RZ] });
  b.geo(shell(), [0, CY, 0], WICKER_L, { s: [-(RX - 0.05), RY - 0.05, RZ - 0.05] });
  const at = (k: number, az: number, el: number): V3 => {
    const c = Math.cos(el);
    return [(RX + k) * c * Math.sin(az), CY + (RY + k) * Math.sin(el), (RZ + k) * c * Math.cos(az)];
  };
  // the diamond lattice, both ways round, outside and in; spaced by distance on the shell, so
  // it does not bunch up at the top but runs out into the rim
  const STEP = 0.36;
  const EL = 0.13;
  const azAt = (d0: number, dir: number, el: number) => (d0 + dir * el * 1.05) / Math.cos(el);
  for (const k of [0.012, -0.062]) {
    for (const dir of [-1, 1]) {
      for (let d0 = -WRAP - 1.8; d0 < WRAP + 1.8; d0 += STEP) {
        for (let el = 0; el < 1.42; el += EL) {
          const a = azAt(d0, dir, el);
          const c = azAt(d0, dir, el + EL);
          if (Math.abs(a) > WRAP || Math.abs(c) > WRAP) continue;
          b.beam(at(k, azOf(a), el), at(k, azOf(c), el + EL), 0.05, WICKER_D);
        }
      }
    }
  }
  // the thick rolled rim round the arch
  const N = 14;
  for (const s of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const el0 = (i / N) * HP;
      const el1 = ((i + 1) / N) * HP;
      b.beam(at(-0.03, azOf(s * WRAP), el0), at(-0.03, azOf(s * WRAP), el1), 0.11, WICKER_RIM);
    }
  }
  // the cushions
  b.cyl(R - 0.06, 0.08, [0, SEAT_Y - 0.05, 0.02], LIME_D, { seg: 20 });
  b.cyl(R - 0.09, 0.05, [0, SEAT_Y - 0.025, 0.02], LIME, { seg: 20 });
  for (const [x, z] of [
    [-0.26, -0.2],
    [0.26, -0.2],
    [-0.26, 0.26],
    [0.26, 0.26],
    [0, 0.03],
  ] as const) {
    b.cyl(0.05, 0.012, [x, SEAT_Y + 0.004, z], LIME_D, { seg: 10 });
  }
  b.ball(0.46, [0, 0.98, -0.56], LIME, { s: [1, 1.05, 0.26] });
  b.ball(0.05, [0, 0.98, -0.45], LIME_D, { seg: 10 });
  b.finish();
  finishShadows(b.root);
  const seat = seatAt(b.root, [0, SEAT_Y, 0.06]);
  return { root: b.root, seat };
}

// ─── the coffee table ───────────────────────────────────────────────────────

/** A round cream table 0.7 tall on one post and three feet, with her teal cup on its saucer and a plate of little pies. */
export function createCoffeeTable(skin: Skin): THREE.Group {
  const b = new Build(skin, 'babusia-table');
  const H = 0.7;
  b.cyl(0.5, 0.06, [0, H - 0.03, 0], PLATE, { seg: 22 });
  b.cyl(0.52, 0.03, [0, H - 0.07, 0], WOOD, { seg: 22 });
  b.cyl(0.06, H - 0.1, [0, (H - 0.1) / 2 + 0.03, 0], WOOD_D, { seg: 10 });
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + (i / 3) * TAU;
    b.beam([0, 0.16, 0], [Math.sin(a) * 0.38, 0.03, Math.cos(a) * 0.38], 0.08, WOOD_D);
    b.box([0.12, 0.05, 0.12], [Math.sin(a) * 0.38, 0.025, Math.cos(a) * 0.38], WOOD, [0, a, 0]);
  }
  // the coffee
  const cx = -0.21;
  const cz = 0.13;
  b.cyl(0.18, 0.025, [cx, H + 0.012, cz], '#8fd6cc', { seg: 16 });
  b.cyl(0.12, 0.13, [cx, H + 0.09, cz], TEAL, { r1: 0.135, seg: 14 });
  b.cyl(0.11, 0.012, [cx, H + 0.155, cz], COFFEE, { seg: 14 });
  b.box([0.1, 0.03, 0.035], [cx + 0.165, H + 0.135, cz], TEAL);
  b.box([0.1, 0.03, 0.035], [cx + 0.165, H + 0.06, cz], TEAL);
  b.box([0.035, 0.1, 0.035], [cx + 0.2, H + 0.097, cz], TEAL);
  // the pies
  const px = 0.2;
  const pz = -0.1;
  b.cyl(0.25, 0.03, [px, H + 0.015, pz], CORAL, { seg: 18 });
  b.cyl(0.21, 0.012, [px, H + 0.034, pz], PLATE, { seg: 18 });
  for (const [x, z, a, y] of [
    [-0.09, 0.07, 0.4, 0],
    [0.1, 0.05, -0.6, 0],
    [0, -0.1, 1.4, 0],
    [0, 0.01, 2.2, 0.075],
  ] as const) {
    const at: V3 = [px + x, H + 0.08 + y, pz + z];
    b.ball(0.1, at, PIE, { s: [1, 0.55, 0.62], rot: [0, a, 0], seg: 10 });
    b.box([0.13, 0.016, 0.03], [at[0], at[1] + 0.052, at[2]], PIE_D, [0, a, 0]);
  }
  b.finish();
  finishShadows(b.root);
  return b.root;
}

// ─── the bench ──────────────────────────────────────────────────────────────

/** A wooden garden bench, 2 wide: seat slats, a slatted back with a little daisy in the top rail, arms. */
export function createBench(skin: Skin): { root: THREE.Group; seats: THREE.Object3D[] } {
  const b = new Build(skin, 'babusia-bench');
  const W = 2;
  const SEAT_Y = 0.5;
  // the seat and the rails under it
  for (const z of [-0.2, -0.065, 0.07, 0.205]) b.box([W, 0.06, 0.115], [0, SEAT_Y - 0.03, z], WOODL);
  b.box([W - 0.1, 0.06, 0.08], [0, SEAT_Y - 0.1, 0.18], WOODL_D);
  b.box([0.08, 0.06, 0.5], [0, SEAT_Y - 0.09, 0], WOODL_D);
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.05);
    // legs, the side rail, the arm on two posts
    b.box([0.1, SEAT_Y - 0.06, 0.1], [x, (SEAT_Y - 0.06) / 2, 0.22], WOODL_D);
    b.box([0.1, SEAT_Y - 0.06, 0.1], [x, (SEAT_Y - 0.06) / 2, -0.22], WOODL_D);
    b.box([0.09, 0.07, 0.42], [x, 0.17, 0], WOODL_D);
    b.box([0.08, 0.3, 0.08], [x, SEAT_Y + 0.14, 0.22], WOODL_D);
    b.box([0.14, 0.06, 0.62], [x, SEAT_Y + 0.31, 0.02], WOODL);
    // the back's posts, leaning a little
    b.beam([x, SEAT_Y - 0.06, -0.24], [x, SEAT_Y + 0.68, -0.36], 0.1, WOODL_D);
  }
  for (const [y, z, h] of [
    [SEAT_Y + 0.2, -0.285, 0.1],
    [SEAT_Y + 0.38, -0.315, 0.1],
    [SEAT_Y + 0.58, -0.345, 0.15],
  ] as const) {
    b.box([W - 0.1, h, 0.05], [0, y, z], WOODL, [-0.16, 0, 0]);
  }
  b.box([W + 0.02, 0.05, 0.11], [0, SEAT_Y + 0.68, -0.36], WOODL_D);
  // the daisy in the top rail
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) b.box([0.24, 0.07, 0.02], [0, SEAT_Y + 0.585, -0.312], PETAL, [-0.16, 0, a]);
  b.box([0.08, 0.08, 0.03], [0, SEAT_Y + 0.585, -0.305], POLLEN, [-0.16, 0, 0]);
  b.finish();
  finishShadows(b.root);
  const seats = [seatAt(b.root, [-0.48, SEAT_Y, 0.02]), seatAt(b.root, [0.48, SEAT_Y, 0.02])];
  return { root: b.root, seats };
}

// ─── the television ─────────────────────────────────────────────────────────

const TV_SKY = ['#ffb56b', '#ff8a5c', '#ff9d8a', '#ffc94f'].map((c) => new THREE.Color(c));
const C_SEA = new THREE.Color('#d9602f');
const C_SUN = new THREE.Color('#fff1b8');
const C_BOAT = new THREE.Color('#8a3b1e');

/**
 * A wooden low cabinet with two doors, and on it an old toy set tipped back a little on its foot so
 * the steep camera sees the screen: a wooden case, a cream mask, two knobs, speaker slits, a doily
 * with a vase on top and a V of antenna. Off: dark glass. On: the picture opens from a line, a sun
 * crosses a slowly changing warm sky and a little boat rocks on the sea. Own glow materials only.
 */
export function createTv(skin: Skin): { root: THREE.Group; setOn(on: boolean): void; update(dt: number): void } {
  const b = new Build(skin, 'babusia-tv-cabinet');
  const root = b.root;
  const CW = 1.5;
  const CH = 0.5;
  const CD = 0.72;
  for (const x of [-0.62, 0.62]) for (const z of [-0.26, 0.26]) b.box([0.1, 0.1, 0.1], [x, 0.05, z], WOOD_D);
  b.box([CW, CH - 0.1, CD], [0, 0.3, 0], WOOD);
  b.box([CW + 0.08, 0.06, CD + 0.06], [0, CH + 0.03, 0], WOOD_D);
  for (const s of [-1, 1]) {
    b.box([0.64, 0.28, 0.03], [s * 0.35, 0.3, CD / 2 + 0.01], WOODL);
    b.box([0.06, 0.1, 0.05], [s * 0.08, 0.3, CD / 2 + 0.03], MUSTARD);
  }
  // the foot the set tips back on
  const TOP = CH + 0.06;
  b.box([0.74, 0.1, 0.5], [0, TOP + 0.05, 0.02], CHARCOAL);
  b.finish();

  // the set: hinged at its back foot, tipped so its face looks up a little
  const set = new Build(skin, 'babusia-tv-set');
  const W = 1.1;
  const H = 0.82;
  const D = 0.6;
  set.root.position.set(0, TOP + 0.06, -D / 2);
  set.root.rotation.x = -0.15;
  root.add(set.root);
  const F = D;
  set.box([W, H, D], [0, H / 2, D / 2], WOOD_D);
  set.box([W + 0.04, 0.07, D + 0.02], [0, H, D / 2], WOOD);
  set.box([W + 0.04, 0.07, D + 0.02], [0, 0.03, D / 2], WOOD);
  set.box([W - 0.06, H - 0.1, 0.02], [0, H / 2, F + 0.005], CREAM);
  const SX = -0.13;
  const SY = H / 2;
  const SW = 0.68;
  const SH = 0.54;
  set.box([SW + 0.08, SH + 0.08, 0.03], [SX, SY, F + 0.015], WOOD_D);
  set.box([SW, SH, 0.02], [SX, SY, F + 0.025], '#232a2a');
  set.box([0.05, 0.3, 0.006], [SX - 0.2, SY + 0.06, F + 0.036], '#46524f', [0, 0, -0.5]);
  // knobs and speaker slits
  for (const [y, c] of [
    [SY + 0.17, CORAL],
    [SY + 0.0, MUSTARD],
  ] as const) {
    set.cyl(0.075, 0.05, [0.39, y, F + 0.03], c, { rot: [HP, 0, 0], seg: 12 });
    set.box([0.022, 0.09, 0.02], [0.39, y, F + 0.06], CORAL_DARK);
  }
  for (let i = 0; i < 4; i++) set.box([0.16, 0.02, 0.012], [0.39, SY - 0.13 - i * 0.04, F + 0.018], WOOD_D);
  // on top: a doily with a little vase, the antenna at the back
  set.cyl(0.25, 0.012, [-0.2, H + 0.04, 0.32], PETAL, { seg: 12 });
  set.cyl(0.08, 0.15, [-0.2, H + 0.12, 0.32], TEAL, { r1: 0.06, seg: 10 });
  set.cyl(0.015, 0.14, [-0.2, H + 0.26, 0.32], STEM, { seg: 6 });
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) set.box([0.2, 0.03, 0.07], [-0.2, H + 0.33, 0.32], POPPY, [0, a, 0]);
  set.cyl(0.04, 0.03, [-0.2, H + 0.35, 0.32], POPPY_EYE, { seg: 8 });
  set.box([0.26, 0.08, 0.2], [0.14, H + 0.07, 0.2], WOOD_D);
  for (const s of [-1, 1]) {
    set.beam([0.14, H + 0.1, 0.2], [0.14 + s * 0.3, H + 0.62, 0.14], 0.03, STEEL_ROD);
    set.ball(0.04, [0.14 + s * 0.3, H + 0.63, 0.14], CORAL, { seg: 10 });
  }
  set.finish();

  // the picture, in its own group so it can open from a line
  const pic = new THREE.Group();
  pic.name = 'picture';
  pic.position.set(SX, SY, F + 0.044);
  pic.visible = false;
  set.root.add(pic);
  const flat = (geo: THREE.BufferGeometry, hex: string, parent: THREE.Object3D, z: number): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } => {
    const mat = ownGlow(skin, hex);
    const mesh = fx(new THREE.Mesh(geo, mat));
    mesh.position.z = z;
    parent.add(mesh);
    return { mesh, mat };
  };
  const sky = flat(new THREE.BoxGeometry(SW, SH, 0.004), '#ffb56b', pic, 0);
  const sun = flat(new THREE.CylinderGeometry(0.075, 0.075, 0.004, 14).rotateX(HP), '#fff1b8', pic, 0.005);
  const sea = flat(new THREE.BoxGeometry(SW, 0.17, 0.004), '#d9602f', pic, 0.01);
  sea.mesh.position.y = -SH / 2 + 0.085;
  const boatGeo = mergeGeometries([
    new THREE.BoxGeometry(0.16, 0.035, 0.004),
    new THREE.BoxGeometry(0.1, 0.03, 0.004).translate(0, -0.03, 0),
    new THREE.BoxGeometry(0.012, 0.1, 0.004).translate(0, 0.06, 0),
    new THREE.BoxGeometry(0.05, 0.05, 0.004).translate(0.03, 0.07, 0),
    new THREE.BoxGeometry(0.03, 0.03, 0.004).translate(0.03, 0.105, 0),
  ])!;
  const boat = flat(boatGeo, '#8a3b1e', pic, 0.015);
  finishShadows(root);

  const tmp = new THREE.Color();
  let on = false;
  let lit = 0;
  let t = 0;
  return {
    root,
    setOn(v) {
      on = v;
    },
    update(dt) {
      lit += ((on ? 1 : 0) - lit) * Math.min(1, dt * 6);
      if (!on && lit < 0.02) lit = 0;
      pic.visible = lit > 0;
      if (!pic.visible) return;
      t += dt;
      // an old set opens from a bright line and shuts back to one
      pic.scale.y = Math.max(0.02, Math.min(1, lit * 1.25));
      const k = 0.35 + 0.65 * lit;
      const c = t / 7;
      const i = Math.floor(c);
      const f = c - i;
      setGlow(sky.mat, tmp.copy(TV_SKY[i % 4]).lerp(TV_SKY[(i + 1) % 4], f * f * (3 - 2 * f)), 0.5 * k);
      setGlow(sea.mat, tmp.copy(C_SEA).lerp(TV_SKY[i % 4], 0.15), 0.4 * k);
      setGlow(sun.mat, C_SUN, 0.7 * k);
      setGlow(boat.mat, C_BOAT, 0.35 * k);
      // the sun climbs out of the sea on the left and goes down on the right, hidden when it starts over
      const a = (t * 0.28) % Math.PI;
      sun.mesh.position.x = -Math.cos(a) * 0.24;
      sun.mesh.position.y = -0.17 + Math.sin(a) * 0.34;
      boat.mesh.position.x = Math.sin(t * 0.4) * 0.17;
      boat.mesh.position.y = -SH / 2 + 0.2 + Math.sin(t * 1.9) * 0.01;
      boat.mesh.rotation.z = Math.sin(t * 1.3) * 0.12;
    },
  };
}

// ─── the stork ──────────────────────────────────────────────────────────────

const BUNDLE_MID = 0.2;
const CLOTH = '#fff3da';

/** A knotted cloth bundle of coral and cream checks, hanging from its knot at the origin. */
function createBundle(skin: Skin): THREE.Group {
  const b = new Build(skin, 'babusia-bundle');
  const S = 0.068;
  const N = 4;
  const edge = (i: number) => i === 0 || i === N - 1;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const out = [i, j, k].filter(edge).length;
        // the skin of the bag only, with the corners knocked off
        if (out === 0 || out === 3) continue;
        b.box([S, S, S], [(i - 1.5) * S, (j - 1.5) * S - BUNDLE_MID, (k - 1.5) * S], (i + j + k) % 2 ? CORAL : CLOTH);
      }
    }
  }
  b.box([0.1, 0.06, 0.1], [0, -0.07, 0], CORAL);
  b.box([0.17, 0.05, 0.05], [0, -0.03, 0], CLOTH, [0, 0.5, 0.35]);
  b.box([0.17, 0.05, 0.05], [0, -0.03, 0], CORAL_DARK, [0, -0.6, -0.35]);
  b.finish();
  return b.root;
}

/**
 * Бабуся's messenger: a white toy stork with black wing tips, an orange beak and long orange legs.
 * Flying towards +Z its neck stretches out, the wings beat in two joints, the legs trail behind and
 * a checked bundle swings from its beak; landed it stands on its legs with the neck in an S, the
 * wings folded along its sides so the black shows at the tail, the bundle at its feet, and breathes.
 * About 1.2 long, the feet at the origin. Same interface as the paper plane.
 */
export function createStork(skin: Skin): PlaneModel {
  const root = new THREE.Group();
  root.name = 'tale-stork';
  const parts: Build[] = [];
  const limb = (id: string, parent: THREE.Object3D, at: V3): Build => {
    const b = new Build(skin, `babusia-stork-${id}`);
    b.root.position.set(...at);
    parent.add(b.root);
    parts.push(b);
    return b;
  };

  const HIP = 0.56;
  const body = limb('body', root, [0, HIP + 0.1, 0]);
  body.ball(1, [0, 0, 0], WHITE, { s: [0.16, 0.165, 0.29] });
  body.box([0.22, 0.06, 0.2], [0, 0.02, -0.3], WHITE);
  body.box([0.15, 0.05, 0.12], [0, 0.01, -0.4], WHITE);

  const neck1 = limb('neck1', body.root, [0, 0.06, 0.2]);
  neck1.box([0.11, 0.11, 0.2], [0, 0, 0.08], WHITE);
  const neck2 = limb('neck2', neck1.root, [0, 0, 0.17]);
  neck2.box([0.095, 0.095, 0.18], [0, 0, 0.07], WHITE);
  const head = limb('head', neck2.root, [0, 0, 0.17]);
  head.ball(0.09, [0, 0.01, 0], WHITE, { s: [0.95, 1, 1.1] });
  head.box([0.075, 0.055, 0.14], [0, -0.005, 0.12], BEAK);
  head.box([0.05, 0.035, 0.11], [0, -0.012, 0.22], BEAK);
  for (const s of [-1, 1]) head.ball(0.026, [s * 0.078, 0.03, 0.03], CHARCOAL, { seg: 10 });
  const grip = new THREE.Object3D();
  grip.position.set(0, -0.03, 0.2);
  head.root.add(grip);

  /** A wing along s·X: the inner half on the shoulder, the outer half with its black fingers on `tip`. */
  const wing = (s: number): { arm: THREE.Group; tip: THREE.Group } => {
    const arm = limb(`wing${s}`, body.root, [s * 0.13, 0.08, 0.08]);
    arm.root.rotation.order = 'YZX';
    arm.box([0.38, 0.05, 0.32], [s * 0.19, 0, 0], WHITE);
    arm.box([0.34, 0.052, 0.08], [s * 0.2, 0, -0.14], CHARCOAL);
    const tip = limb(`tip${s}`, arm.root, [s * 0.38, 0, 0]);
    tip.box([0.14, 0.045, 0.3], [s * 0.07, 0, 0], WHITE);
    tip.box([0.14, 0.047, 0.08], [s * 0.07, 0, -0.13], CHARCOAL);
    tip.box([0.14, 0.04, 0.3], [s * 0.2, 0, 0], CHARCOAL);
    for (const [z, l] of [
      [-0.1, 0.1],
      [0, 0.15],
      [0.1, 0.12],
    ] as const) {
      tip.box([l, 0.035, 0.075], [s * (0.27 + l / 2), 0, z], CHARCOAL);
    }
    return { arm: arm.root, tip: tip.root };
  };
  const wings = [
    { s: 1, ...wing(1) },
    { s: -1, ...wing(-1) },
  ];

  const legs = [-1, 1].map((s) => {
    const leg = limb(`leg${s}`, root, [s * 0.075, HIP, -0.03]);
    leg.box([0.1, 0.1, 0.11], [0, 0.0, 0], WHITE);
    leg.box([0.06, HIP - 0.02, 0.06], [0, -HIP / 2, 0], BEAK);
    leg.box([0.08, 0.05, 0.08], [0, -HIP / 2 + 0.02, 0], '#d95f22');
    leg.box([0.13, 0.035, 0.2], [0, -HIP + 0.017, 0.05], BEAK);
    return leg.root;
  });
  for (const b of parts) b.finish();

  const bundle = createBundle(skin);
  root.add(bundle);
  const FOOT = new THREE.Vector3(0.2, BUNDLE_MID + 0.135, 0.32);
  const glow = pool(0xffe3a3, 0.9, [0, 0.04, 0]);
  root.add(glow.mesh);
  finishShadows(root);

  const beak = new THREE.Vector3();
  let t = 0;
  let flap = 0;
  /** 1 in the air, 0 on the ground. */
  let air = 1;
  const mix = (a: number, b: number) => b + (a - b) * air;
  return {
    root,
    update(dt, flying, night) {
      t += dt;
      air += ((flying ? 1 : 0) - air) * Math.min(1, dt * 6);
      flap += dt * (5 + 4 * air);
      const beat = Math.sin(flap) * air;
      const lag = Math.sin(flap - 0.9) * air;
      const breath = Math.sin(t * 2.3) * (1 - air);
      body.root.position.y = HIP + 0.1 - beat * 0.03;
      body.root.rotation.x = mix(-0.04, -0.3) + breath * 0.012;
      body.root.scale.y = 1 + breath * 0.03;
      neck1.root.rotation.x = mix(-0.02, -1.25);
      neck2.root.rotation.x = mix(0.06, 0.62);
      head.root.rotation.x = mix(0.02, 0.86) + breath * 0.02;
      head.root.rotation.y = (1 - air) * Math.sin(t * 0.7) * 0.4;
      for (const w of wings) {
        w.arm.position.x = w.s * (0.13 + (1 - air) * 0.05);
        w.arm.rotation.y = w.s * (1 - air) * 1.62;
        w.arm.rotation.x = -(1 - air) * 1.3;
        w.arm.rotation.z = w.s * (0.1 * air + beat * 0.55 - (1 - air) * 0.12);
        w.tip.rotation.z = w.s * lag * 0.5;
        w.tip.scale.x = 1 - (1 - air) * 0.34;
      }
      for (const l of legs) l.rotation.x = air * 1.42 + Math.sin(t * 3) * 0.04 * air;
      // the bundle swings from the beak, and on landing drops to the feet
      grip.getWorldPosition(beak);
      root.worldToLocal(beak);
      bundle.position.lerpVectors(FOOT, beak, Math.min(1, air * air * 1.4));
      bundle.rotation.x = air * Math.sin(t * 3.1) * 0.18;
      bundle.rotation.z = air * Math.sin(t * 2.3) * 0.12;
      glow.mesh.visible = air < 0.5;
      glow.mat.opacity = 0.1 + 0.4 * night;
    },
  };
}

export interface YardLife {
  root: THREE.Group;
  update(t: number): void;
}

const BUTTERFLIES: { at: [number, number]; r: number; wing: string }[] = [
  { at: [2, 10.5], r: 1.1, wing: '#eab02b' },
  { at: [5, 12.5], r: 1.4, wing: '#e0583f' },
  { at: [9.5, 10.5], r: 1.2, wing: '#ee6a82' },
  { at: [12, 12.5], r: 1.3, wing: '#8fcbe8' },
  { at: [3, 15], r: 1.5, wing: '#ffe3a3' },
  { at: [10, 15.5], r: 1.2, wing: '#eab02b' },
  { at: [15, 8], r: 1.3, wing: '#ee6a82' },
  { at: [-2, 8], r: 1.2, wing: '#e0583f' },
];
const LADYBIRDS: [number, number][] = [[1.5, 12], [4.5, 14.5], [8, 15.5], [11.5, 11], [13.5, 14], [-1.5, 12], [15, 11]];
const BEETLES: [number, number][] = [[3, 11.5], [10, 13], [14, 9.5], [-2, 14]];
const SHELL = '#e0343a';
const INK_BUG = '#2b2422';
const BEETLE = '#2f6a78';

/**
 * Оля's insects: butterflies round the flowers, ladybirds and beetles crawling on the grass, all one
 * draw (unit boxes placed and coloured by instance). Relative to the house corner, on its floor.
 */
export function createYardLife(skin: Skin): YardLife {
  const root = new THREE.Group();
  root.name = 'yard-life';
  const n = BUTTERFLIES.length * 3 + LADYBIRDS.length * 4 + BEETLES.length * 2;
  // its own material: the shader gate then prepares the instanced program before anything is shown
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial(0xffffff).clone(), n);
  mesh.name = 'yard-bugs';
  mesh.frustumCulled = false;
  root.add(mesh);
  const c = new THREE.Color();
  let k = 0;
  const paint = (hex: string) => mesh.setColorAt(k++, c.set(hex));
  for (const b of BUTTERFLIES) [INK_BUG, b.wing, b.wing].forEach(paint);
  for (let i = 0; i < LADYBIRDS.length; i++) [SHELL, INK_BUG, INK_BUG, INK_BUG].forEach(paint);
  for (let i = 0; i < BEETLES.length; i++) [BEETLE, INK_BUG].forEach(paint);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const size = new THREE.Vector3();
  const off = new THREE.Vector3();
  let i = 0;
  /** A box of this size, turned by (yaw, roll), its middle `dx, dy, dz` from (x, y, z) in the bug's own turn. */
  const put = (x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, dx = 0, dy = 0, dz = 0, roll = 0) => {
    off.set(dx, dy, dz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    p.set(x + off.x, y + off.y, z + off.z);
    q.setFromEuler(e.set(0, yaw, roll));
    mesh.setMatrixAt(i++, m.compose(p, q, size.set(sx, sy, sz)));
  };
  const update = (t: number) => {
    i = 0;
    BUTTERFLIES.forEach((b, n) => {
      const a = t * (0.5 + n * 0.05) + n * 1.7;
      const x = b.at[0] + Math.sin(a) * b.r;
      const z = b.at[1] + Math.cos(a * 0.8) * b.r;
      const y = 0.9 + Math.sin(a * 1.9) * 0.28;
      const yaw = a + Math.PI / 2;
      const flap = 0.2 + Math.abs(Math.sin(t * 9 + n)) * 0.95;
      const w = 0.17;
      put(x, y, z, yaw, 0.035, 0.035, 0.15);
      put(x, y, z, yaw, w, 0.012, 0.15, (w / 2) * Math.cos(flap), (w / 2) * Math.sin(flap), 0, flap);
      put(x, y, z, yaw, w, 0.012, 0.15, -(w / 2) * Math.cos(flap), (w / 2) * Math.sin(flap), 0, -flap);
    });
    LADYBIRDS.forEach(([cx, cz], n) => {
      const a = t * 0.16 + n * 2.1;
      const x = cx + Math.sin(a) * 0.8;
      const z = cz + Math.cos(a) * 0.8;
      const yaw = a + Math.PI / 2;
      put(x, 0.06, z, yaw, 0.17, 0.1, 0.2);
      put(x, 0.06, z, yaw, 0.11, 0.07, 0.06, 0, 0, 0.12);
      put(x, 0.06, z, yaw, 0.045, 0.02, 0.045, 0.045, 0.05, 0.02);
      put(x, 0.06, z, yaw, 0.045, 0.02, 0.045, -0.045, 0.05, -0.03);
    });
    BEETLES.forEach(([cx, cz], n) => {
      const a = t * 0.1 + n * 1.3;
      const go = Math.sin(t * 0.5 + n) > 0 ? 1 : 0.3;
      const x = cx + Math.sin(a * go) * 1.1;
      const z = cz + Math.cos(a * go) * 0.7;
      const yaw = a * go + Math.PI / 2;
      put(x, 0.05, z, yaw, 0.15, 0.08, 0.24);
      put(x, 0.05, z, yaw, 0.09, 0.06, 0.06, 0, 0, 0.14);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { root, update };
}

// ─── the flying shell ───────────────────────────────────────────────────────

/** How far every box of the shell sits inside the real blocks' faces. */
export const SHELL_INSET = 0.05;

/**
 * A stand-in for her house that can be lifted into the air (the night move): the same shapes as
 * `BABUSIA_BLOCKS` (content/babusia.ts) as toy boxes in the blocks' own colours — the cobble rim and
 * the floor (planks, the red rug, the white-and-green tiles), white walls with the open doorway, log
 * corners, and warm glowing panes in the windows (glow only, no light). In the house's own space
 * (x 0..13, z 0..9, y 0 = the floor block's bottom), like the roof. Every box keeps `SHELL_INSET`
 * inside the real block faces, so while the real house stands the shell hides inside its opaque
 * blocks and only the panes show through the glass. `mats` are the shell's own clones,
 * transparent-capable but starting opaque: fade with `opacity = k`, `depthWrite = k > 0.98`.
 */
export function createHouseShell(skin: Skin): { root: THREE.Group; mats: THREE.Material[] } {
  const I = SHELL_INSET;
  const root = new THREE.Group();
  root.name = 'babusiaShell';
  const kit = new Kit('babusia-shell', skin);
  const p = kit.part('shell', root);
  const paint = (id: number): Paint => ({ c: BLOCKS[id].side.color, clear: true });
  const PANE: Paint = { c: CREAM, glow: true };

  const cells = new Map<string, number>();
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const b of BABUSIA_BLOCKS) {
    cells.set(`${b.dx},${b.dy},${b.dz}`, b.id);
    sx = Math.max(sx, b.dx + 1);
    sy = Math.max(sy, b.dy + 1);
    sz = Math.max(sz, b.dz + 1);
  }
  const at = (x: number, y: number, z: number): number => cells.get(`${x},${y},${z}`) ?? B.AIR;
  const solid = (id: number) => id !== B.AIR && id !== B.GLASS && id !== B.LANTERN;

  // the floor: the cobble rim as four strips, then the inside region by region (shared inner faces stay hidden)
  const slab = (x0: number, x1: number, z0: number, z1: number, id: number) =>
    p.box([x1 - x0, 1 - 2 * I, z1 - z0], [(x0 + x1) / 2, 0.5, (z0 + z1) / 2], paint(id));
  slab(I, sx - I, sz - 1, sz - I, B.COBBLE);
  slab(I, sx - I, I, 1, B.COBBLE);
  slab(I, 1, 1, sz - 1, B.COBBLE);
  slab(sx - 1, sx - I, 1, sz - 1, B.COBBLE);
  // the inside: runs of one block along x, row by row
  for (let z = 1; z < sz - 1; z++) {
    for (let x = 1; x < sx - 1; ) {
      const id = at(x, 0, z);
      let e = x + 1;
      while (e < sx - 1 && at(e, 0, z) === id) e++;
      slab(x, e, z, z + 1, id);
      x = e;
    }
  }

  // the walls cell by cell: each face meets a solid neighbour, keeps the inset from air, and gives
  // way to a pane, which reaches the inset into its solid neighbours so no slit shows in the air
  const PANE_DEPTH = 0.12;
  for (let y = 1; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const id = at(x, y, z);
        if (id === B.AIR || id === B.LANTERN) continue;
        const glass = id === B.GLASS;
        const lo = [x, y, z];
        const hi = [x + 1, y + 1, z + 1];
        for (let a = 0; a < 3; a++) {
          for (const s of [-1, 1]) {
            const n = [x, y, z];
            n[a] += s;
            const nid = at(n[0], n[1], n[2]);
            // under the walls lies the floor, its top inset: reach down to it
            const floor = a === 1 && s < 0 && n[1] === 0;
            let d: number;
            if (floor) d = I;
            else if (glass) d = solid(nid) ? I : nid === B.GLASS ? 0 : -PANE_DEPTH;
            else d = solid(nid) ? 0 : -I;
            if (s < 0) lo[a] -= d;
            else hi[a] += d;
          }
        }
        const size: V3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
        const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
        p.box(size, mid, glass ? PANE : paint(id));
      }
    }
  }
  p.done();

  const mats: THREE.Material[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.Material).clone();
    mat.transparent = true;
    mat.opacity = 1;
    mat.depthWrite = true;
    m.material = mat;
    m.castShadow = true;
    m.receiveShadow = true;
    mats.push(mat);
  });
  return { root, mats };
}

/**
 * The flight's swirl (DESIGN.md «The flight»): petals (Юля) or fireflies (Оля) going round the
 * house in a rising spiral as it takes off and lands. Two instanced draws with the same materials
 * as the effects' puffs and sparkles (render/effects.ts), so no shader of their own; always in the
 * scene, with nothing drawn while the strength is 0.
 */
export interface HouseSwirl {
  root: THREE.Group;
  /** One frame: `strength` 0..1 (0 draws nothing), petals or fireflies, round the house's middle (its corner's coordinates). */
  update(dt: number, strength: number, kind: 'petals' | 'flies', cx: number, cz: number): void;
}

const SWIRL_N = 110;
const PETALS = ['#fff7ec', '#fff7ec', '#e8463a', '#ffd23a', '#ee6a82'].map((c) => new THREE.Color(c));
const FLIES = ['#fff3a0', '#d6ff8a', '#ffe08a'].map((c) => new THREE.Color(c));

export function createHouseSwirl(): HouseSwirl {
  const root = new THREE.Group();
  root.name = 'house-swirl';
  const petals = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.1, 0.48),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a3a3a }),
    SWIRL_N,
  );
  const flies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    SWIRL_N,
  );
  flies.renderOrder = 10;
  const seeds: { a: number; r: number; h: number; speed: number; spin: number; c: number }[] = [];
  for (let i = 0; i < SWIRL_N; i++) {
    seeds.push({ a: Math.random() * TAU, r: 7.5 + Math.random() * 3, h: i / SWIRL_N, speed: 1.5 + Math.random() * 1.1, spin: 2 + Math.random() * 4, c: Math.random() });
    petals.setColorAt(i, PETALS[Math.floor(seeds[i].c * PETALS.length)]);
    flies.setColorAt(i, FLIES[Math.floor(seeds[i].c * FLIES.length)]);
  }
  for (const m of [petals, flies]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    m.userData.toyNoShadow = true;
    root.add(m);
  }
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let time = 0;
  return {
    root,
    update(dt, strength, kind, cx, cz) {
      const on = kind === 'petals' ? petals : flies;
      const off = on === petals ? flies : petals;
      off.count = 0;
      if (strength <= 0.01) {
        on.count = 0;
        return;
      }
      time += dt;
      for (let i = 0; i < SWIRL_N; i++) {
        const k = seeds[i];
        // up the spiral and round again from the bottom, wider as it rises
        const h = (k.h + time * 0.22) % 1;
        const a = k.a + time * k.speed;
        const r = k.r * (0.8 + 0.4 * h) * (0.7 + 0.3 * strength);
        p.set(cx + Math.sin(a) * r, -0.3 + h * 8 + Math.sin(time * 2 + i) * 0.3, cz + Math.cos(a) * r);
        // grows in at the bottom, melts at the top
        const size = strength * Math.sin(Math.PI * h);
        s.setScalar(Math.max(0.001, size * (kind === 'petals' ? 1 : 0.8 + 0.4 * Math.sin(time * 9 + i * 3))));
        e.set(time * k.spin, a, time * k.spin * 0.7);
        mtx.compose(p, q.setFromEuler(e), s);
        on.setMatrixAt(i, mtx);
      }
      on.count = SWIRL_N;
      on.instanceMatrix.needsUpdate = true;
    },
  };
}
