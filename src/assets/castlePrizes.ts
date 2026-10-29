/**
 * The castles' prizes (content/buildings.ts, stage C2): the tree house (elves), the golem
 * (gnomes), the robot helper (robots) and the flying saucer (aliens). Same conventions as
 * prizes.ts: toy pieces, origin at the floor centre of the footprint, front towards +Z, static
 * parts merged by the Kit, every model animates itself from `update`. Glows are own emissive or
 * additive materials, never lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { Kit } from './parts/kit';
import {
  CORAL,
  CORAL_DARK,
  CREAM,
  MINT,
  MUSTARD,
  TEAL,
  CHARCOAL,
  STEEL,
  STEEL_DARK,
  TAU,
  ownGlow,
  setGlow,
  markShadows,
  octagon,
  fadeDisc,
  glowMaterial,
} from './buildingParts';

const PARTY = ['#e8463a', '#ffd23a', '#59b3ab', '#6fb7ff', '#ee6a82', '#8fd45a'].map((c) => new THREE.Color(c));
const C_FRUIT = new THREE.Color('#ffc23a');
const C_WINDOW = new THREE.Color('#ffd98a');
const C_DARK_GLASS = new THREE.Color('#5a4630');

const smooth = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};
const wrapPi = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

// ─── the tree house (elves) ─────────────────────────────────────────────────

const BARK = '#7a4f28';
const BARK_DARK = '#5e3a1c';
const LEAF_A = '#4f9a3c';
const LEAF_B = '#62b047';
const LEAF_C = '#3c7f31';
const PLANK = '#c98f4e';
const PLANK_DARK = '#9c6a34';
/** The hut's floor (where the party lies at night, systems/sleep.ts). */
export const TREEHOUSE_FLOOR = 2.12;
/** Each hangs just under a leaf clump (its stem goes up into the leaves). */
const FRUITS: [number, number, number][] = [
  [-1.7, 2.02, 0.6],
  [1.7, 2.12, 0.5],
  [-1.75, 2.32, -1.1],
  [1.7, 2.42, -1.2],
  [-1.45, 3.34, 0.45],
  [1.5, 3.46, 0.3],
  [-0.7, 3.69, -0.6],
];

let fruitGeo: THREE.BufferGeometry | null = null;
function fruitGeometry(): THREE.BufferGeometry {
  if (!fruitGeo) {
    const parts = FRUITS.map(([x, y, z]) => new THREE.BoxGeometry(0.22, 0.26, 0.22).translate(x, y - 0.03, z));
    fruitGeo = mergeGeometries(parts, false)!;
    parts.forEach((g) => g.dispose());
    fruitGeo.computeBoundingSphere();
  }
  return fruitGeo;
}

/**
 * A chunky toy tree: a bark trunk on root flares, a plank platform on struts, a hut with an open
 * front and a railing, a stepped mustard roof, leaf clumps round the back and sides and a leafy
 * crown above; a ladder leans on the front. Glowing lantern-fruits hang from the leaves: soft by
 * day, bright at night with halos and a warm pool under the tree; the hut's windows light up.
 */
export function createTreehouse(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'treehouse';
  const kit = new Kit('treehouse', skin);
  const F = TREEHOUSE_FLOOR;
  const p = kit.part('tree', root);
  // trunk and roots
  p.box([0.8, F, 0.8], [0, F / 2, 0], BARK);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) p.box([0.34, 0.32, 0.34], [dx * 0.5, 0.16, dz * 0.5], BARK_DARK);
  p.box([0.86, 0.1, 0.86], [0, 0.9, 0], BARK_DARK);
  // struts from the trunk to the platform's corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.beam([sx * 0.3, 1.25, sz * 0.3], [sx * 1.0, F - 0.1, sz * 1.0], 0.13, BARK_DARK);
  // platform
  p.box([2.6, 0.16, 2.6], [0, F - 0.06, 0], PLANK_DARK);
  for (let i = 0; i < 5; i++) p.box([0.46, 0.03, 2.5], [-1.04 + i * 0.52, F + 0.035, 0], i % 2 ? PLANK : '#b77f40');
  // hut: back and side walls with plank seams, an open front with a railing
  const W = 0.92;
  const top = F + W;
  p.box([2.1, W, 0.12], [0, F + W / 2, -0.99], PLANK);
  for (const s of [-1, 1]) {
    p.box([0.12, W, 2.1], [s * 0.99, F + W / 2, 0], PLANK);
    for (const y of [F + 0.3, F + 0.62]) p.box([0.14, 0.05, 2.12], [s * 0.99, y, 0], PLANK_DARK);
    // window frames (the glass is its own glowing piece)
    p.box([0.06, 0.46, 0.46], [s * 1.04, F + 0.5, -0.1], PLANK_DARK);
    // corner posts at the front
    p.box([0.16, W + 0.08, 0.16], [s * 0.99, F + (W + 0.08) / 2, 0.99], BARK_DARK);
  }
  for (const y of [F + 0.3, F + 0.62]) p.box([2.12, 0.05, 0.14], [0, y, -0.99], PLANK_DARK);
  p.box([1.25, 0.08, 0.1], [-0.37, F + 0.48, 1.0], PLANK_DARK);
  for (const x of [-0.85, -0.45, -0.05]) p.box([0.07, 0.42, 0.07], [x, F + 0.24, 1.0], PLANK);
  // roof: stepped mustard tiers with a coral ridge and a little coral flag
  const tiers: [number, string][] = [
    [2.7, MUSTARD],
    [2.2, '#d99c1f'],
    [1.7, MUSTARD],
    [1.2, '#d99c1f'],
    [0.7, MUSTARD],
  ];
  tiers.forEach(([s, c], i) => p.box([s, 0.15, s], [0, top + 0.075 + i * 0.15, 0], c));
  p.box([0.3, 0.12, 0.3], [0, top + 0.81, 0], CORAL);
  p.box([0.05, 0.5, 0.05], [0, top + 1.1, 0], BARK_DARK);
  p.box([0.32, 0.2, 0.03], [0.17, top + 1.25, 0], CORAL);
  // ladder leaning on the front edge
  for (const x of [0.3, 0.8]) p.beam([x, 0, 1.55], [x, F + 0.05, 1.12], 0.08, BARK);
  for (let i = 0; i < 6; i++) {
    const k = (i + 0.5) / 6;
    p.box([0.56, 0.06, 0.09], [0.55, k * F, 1.55 - 0.43 * k], PLANK);
  }
  p.done();

  // leaves: clumps round the back and sides, a crown above the roof (one more merged part)
  const l = kit.part('leaves', root);
  // the trunk goes on up behind the hut into the crown, which leans back so the roof shows
  l.box([0.5, 1.2, 0.5], [0, top + 0.5, -1.25], BARK);
  l.box([3.1, 1.3, 0.9], [0, F + 0.95, -1.5], LEAF_C);
  l.box([0.8, 1.0, 1.9], [-1.5, F + 0.85, -0.55], LEAF_A);
  l.box([0.75, 0.9, 1.7], [1.5, F + 0.9, -0.6], LEAF_B);
  l.box([0.55, 0.5, 0.6], [-1.6, F + 0.3, 0.5], LEAF_B);
  l.box([0.5, 0.45, 0.55], [1.62, F + 0.38, 0.4], LEAF_A);
  l.box([3.0, 0.7, 1.7], [0, top + 1.15, -1.25], LEAF_A);
  l.box([2.1, 0.55, 1.3], [0.15, top + 1.75, -1.3], LEAF_B);
  l.box([1.1, 0.4, 0.9], [-0.25, top + 2.2, -1.35], LEAF_C);
  l.box([0.8, 0.45, 0.8], [1.35, top + 0.8, 0.1], LEAF_C);
  l.box([0.75, 0.4, 0.7], [-1.35, top + 0.65, 0.3], LEAF_B);
  // stems and leaf caps for the fruits
  for (const [x, y, z] of FRUITS) {
    l.box([0.04, 0.2, 0.04], [x, y + 0.2, z], BARK_DARK);
    l.box([0.15, 0.06, 0.15], [x, y + 0.09, z], LEAF_C);
  }
  l.done();

  // the windows and the lantern-fruits: own glows (brighter at night)
  const winMat = ownGlow(skin, '#ffd98a');
  const winGeo = new THREE.BoxGeometry(0.04, 0.36, 0.36);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(s * 1.065, F + 0.5, -0.1);
    root.add(w);
  }
  // the fruits: one merged mesh with their own glow; night halos are one instanced draw
  const fruitMat = ownGlow(skin, '#ffc23a');
  const fruitGeo = fruitGeometry();
  const fruits = new THREE.Mesh(fruitGeo, fruitMat);
  fruits.castShadow = true;
  const haloMat = glowMaterial(0xffc66a);
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 6), haloMat, FRUITS.length);
  const m4 = new THREE.Matrix4();
  FRUITS.forEach(([x, y, z], i) => halos.setMatrixAt(i, m4.makeTranslation(x, y - 0.03, z)));
  halos.frustumCulled = false;
  halos.visible = false;
  root.add(fruits, halos);

  const poolMat = glowMaterial(0xffb85a, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pool = new THREE.Mesh(fadeDisc(1), poolMat);
  pool.scale.set(2.6, 1, 2.6);
  pool.position.y = 0.04;
  pool.visible = false;
  root.add(pool);

  markShadows(root);
  halos.receiveShadow = pool.receiveShadow = false;
  let t = 0;
  let last = -1;
  return {
    root,
    update(dt, k) {
      t += dt;
      const night = k.night;
      // the fruits breathe a little, slower than the music
      const glow = 0.35 + 0.9 * night + 0.08 * Math.sin(t * 1.7);
      const q = Math.round(glow * 40);
      if (q !== last) {
        last = q;
        setGlow(fruitMat, C_FRUIT, glow);
        if (night > 0.3) setGlow(winMat, C_WINDOW, 0.4 + 0.8 * night);
        else setGlow(winMat, C_DARK_GLASS, 0);
      }
      const on = night > 0.05;
      halos.visible = pool.visible = on;
      haloMat.opacity = 0.05 + 0.2 * night;
      poolMat.opacity = 0.45 * night;
    },
  };
}

// ─── the golem (gnomes) ─────────────────────────────────────────────────────

const STONE = '#9b968c';
const STONE_LIGHT = '#b6b0a4';
const STONE_DARK = '#6f6a62';
const MOSS = '#5f9a3a';
const MOSS_DARK = '#477c2c';
const C_EYE = new THREE.Color('#ffcf5a');
const C_CRYSTAL = new THREE.Color('#ff9a3c');
/** Seconds from the start of a slam until the fists hit the ground (systems/defense.ts lands the blow then). */
export const GOLEM_HIT = 0.5;

/**
 * A chunky stone figure on stubby legs: a big torso with a lighter chest plate and an amber
 * crystal heart, moss on the shoulders and head, a heavy brow over two glowing eyes, long arms
 * with big fists. `aim` turns it towards its target; `slam` (seconds since a slam began) raises
 * both arms over the head and brings them down in front with a crouch; the eyes flare as it hits.
 */
export function createGolem(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'golem';
  const kit = new Kit('golem', skin);

  // a ring of little rubble stones at its feet (never turns)
  const r = kit.part('rubble', root);
  const rubble: [number, number, number, string][] = [
    [-0.78, 0.55, 0.26, STONE_DARK],
    [0.82, 0.42, 0.22, STONE],
    [0.62, -0.72, 0.3, STONE_DARK],
  ];
  for (const [x, z, s, c] of rubble) r.box([s, s * 0.7, s * 1.1], [x, s * 0.35, z], c, [0, x * 2, 0]);
  r.done();

  const body = new THREE.Group();
  root.add(body);
  const b = kit.part('body', body);
  for (const s of [-1, 1]) {
    b.box([0.46, 0.62, 0.52], [s * 0.33, 0.31, 0], STONE_DARK);
    b.box([0.54, 0.18, 0.66], [s * 0.33, 0.09, 0.05], STONE);
  }
  b.box([1.02, 0.3, 0.62], [0, 0.74, 0], STONE);
  b.box([1.38, 0.96, 0.88], [0, 1.36, 0], STONE);
  b.box([0.92, 0.56, 0.08], [0, 1.42, 0.46], STONE_LIGHT);
  b.box([0.3, 0.3, 0.06], [0, 1.44, 0.5], STONE_DARK);
  // cracks and chips: darker blocks proud of the surface
  b.box([0.08, 0.32, 0.05], [-0.48, 1.2, 0.45], STONE_DARK);
  b.box([0.24, 0.07, 0.05], [0.42, 1.06, 0.45], STONE_DARK);
  // moss: shoulders, the top of the back and drips down the sides
  b.box([0.92, 0.12, 0.6], [0, 1.9, -0.12], MOSS_DARK);
  b.box([0.16, 0.36, 0.5], [-0.7, 1.62, -0.12], MOSS);
  b.box([0.16, 0.24, 0.42], [0.7, 1.7, -0.14], MOSS);
  b.box([0.6, 0.22, 0.08], [0.2, 1.62, -0.46], MOSS);
  b.done();

  // the crystal heart: its own glow
  const crystalMat = ownGlow(skin, '#ff9a3c');
  const crystal = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.06), crystalMat);
  crystal.position.set(0, 1.44, 0.54);
  crystal.rotation.z = Math.PI / 4;
  body.add(crystal);

  // head: tucked forward between the shoulders
  const head = new THREE.Group();
  head.position.set(0, 1.84, 0.14);
  body.add(head);
  const h = kit.part('head', head);
  h.box([0.64, 0.52, 0.58], [0, 0.26, 0], STONE_LIGHT);
  h.box([0.7, 0.13, 0.16], [0, 0.44, 0.27], STONE_DARK);
  h.box([0.34, 0.06, 0.04], [0, 0.1, 0.3], STONE_DARK);
  h.box([0.42, 0.12, 0.36], [-0.04, 0.57, -0.06], MOSS);
  h.box([0.16, 0.08, 0.16], [0.16, 0.66, -0.04], MOSS_DARK);
  h.done();
  const eyeMat = ownGlow(skin, '#ffcf5a');
  const eyeGeo = new THREE.BoxGeometry(0.14, 0.09, 0.04);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * 0.15, 0.3, 0.3);
    head.add(e);
  }

  // arms on shoulder pivots
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.86, 1.66, 0);
    body.add(arm);
    const a = kit.part(s < 0 ? 'armL' : 'armR', arm);
    a.box([0.48, 0.2, 0.58], [0, 0.06, 0], MOSS);
    a.box([0.38, 0.62, 0.42], [0, -0.28, 0], STONE);
    a.box([0.52, 0.48, 0.54], [0, -0.78, 0.03], STONE_DARK);
    a.box([0.4, 0.08, 0.1], [0, -0.66, 0.29], STONE);
    a.done();
    arms.push(arm);
  }

  markShadows(root);
  let t = 0;
  let face = 0;
  let lastEye = -1;
  return {
    root,
    update(dt, k) {
      t += dt;
      if (k.aim !== undefined) face += wrapPi(k.aim - face) * Math.min(1, dt * 5);
      body.rotation.y = face;
      const s = k.slam ?? Infinity;
      let arm = 0;
      let lean = 0;
      let crouch = 0;
      let flare = 0;
      if (s < GOLEM_HIT) {
        // wind up: both arms swing up over the head, leaning back
        const u = smooth(s / GOLEM_HIT);
        arm = -2.7 * u;
        lean = -0.12 * u;
      } else if (s < GOLEM_HIT + 0.12) {
        // the slam: down in front, a crouch
        const u = smooth((s - GOLEM_HIT) / 0.12);
        arm = -2.7 + 1.6 * u;
        lean = -0.12 + 0.4 * u;
        crouch = 0.14 * u;
        flare = u;
      } else if (s < GOLEM_HIT + 1.0) {
        const u = smooth((s - GOLEM_HIT - 0.12) / 0.88);
        arm = -1.1 * (1 - u);
        lean = 0.28 * (1 - u);
        crouch = 0.14 * (1 - u);
        flare = 1 - u;
      }
      for (const a of arms) a.rotation.x = arm;
      body.rotation.x = lean;
      // a slow stony breath when standing
      body.position.y = -crouch + (s === Infinity || s > GOLEM_HIT + 1 ? Math.sin(t * 1.3) * 0.012 : 0);
      head.rotation.y = s > GOLEM_HIT + 1 ? Math.sin(t * 0.4) * 0.25 : 0;
      // eyes: a slow blink now and then, a flare on the slam
      const blink = (t % 5.3) < 0.12;
      const eye = blink ? 0 : 0.7 + 0.15 * k.night + flare * 1.2;
      const q = Math.round(eye * 30);
      if (q !== lastEye) {
        lastEye = q;
        setGlow(eyeMat, C_EYE, eye);
        setGlow(crystalMat, C_CRYSTAL, 0.5 + 0.3 * k.night + flare);
      }
    },
  };
}

// ─── the robot helper (robots) ──────────────────────────────────────────────

const C_ROBO_EYE = new THREE.Color('#7ff3ff');
const C_ROBO_OFF = new THREE.Color('#2a3a40');
const C_ANTENNA = new THREE.Color('#ff6a4a');
const C_HEART = new THREE.Color('#ffd23a');

/**
 * A friendly toy robot about as tall as Пупся: steel legs on dark feet, a teal body with a
 * cream belly panel and a gold heart light, steel arms with mustard hands (the right one a little
 * blaster), a box head with a dark visor, two round cyan eyes and an antenna with a coral ball.
 * `walk` (speed) swings the legs and arms; `shot` (seconds since it fired) points the blaster arm
 * and flashes the eyes; `wake` (seconds since it was put down) switches the eyes on with a hop.
 */
export function createRobohelper(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'robohelper';
  const kit = new Kit('robohelper', skin);
  const body = new THREE.Group();
  root.add(body);

  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.42, 0);
    root.add(leg);
    const l = kit.part(s < 0 ? 'legL' : 'legR', leg);
    l.box([0.17, 0.34, 0.19], [0, -0.17, 0], STEEL);
    l.box([0.2, 0.06, 0.2], [0, -0.05, 0], STEEL_DARK);
    l.box([0.23, 0.1, 0.32], [0, -0.37, 0.04], CHARCOAL);
    l.done();
    legs.push(leg);
  }

  const t0 = kit.part('torso', body);
  t0.box([0.46, 0.12, 0.32], [0, 0.48, 0], STEEL_DARK);
  t0.box([0.62, 0.5, 0.44], [0, 0.8, 0], TEAL);
  t0.box([0.64, 0.06, 0.46], [0, 1.03, 0], MINT);
  t0.box([0.4, 0.3, 0.04], [0, 0.78, 0.23], CREAM);
  for (const x of [-0.11, 0.11]) t0.box([0.06, 0.06, 0.03], [x, 0.69, 0.255], CORAL);
  t0.box([0.36, 0.3, 0.1], [0, 0.82, -0.26], STEEL_DARK);
  t0.box([0.08, 0.08, 0.04], [0.1, 0.9, -0.32], MUSTARD);
  t0.box([0.14, 0.08, 0.14], [0, 1.08, 0], STEEL_DARK);
  t0.done();
  const heartMat = ownGlow(skin, '#ffd23a');
  const heart = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), heartMat);
  heart.position.set(0, 0.85, 0.26);
  body.add(heart);

  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.38, 0.98, 0);
    body.add(arm);
    const a = kit.part(s < 0 ? 'armL' : 'armR', arm);
    a.box([0.12, 0.12, 0.16], [0, 0, 0], STEEL_DARK);
    a.box([0.13, 0.34, 0.15], [0, -0.2, 0], STEEL);
    if (s < 0) a.box([0.18, 0.14, 0.18], [0, -0.42, 0], MUSTARD);
    else {
      // the blaster: a mustard grip, a teal barrel along -Y (it points forward when the arm is raised)
      a.box([0.18, 0.12, 0.18], [0, -0.41, 0], MUSTARD);
      a.box([0.1, 0.18, 0.1], [0, -0.55, 0], TEAL);
      a.box([0.13, 0.04, 0.13], [0, -0.64, 0], CORAL);
    }
    a.done();
    arms.push(arm);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.1, 0);
  body.add(head);
  const hd = kit.part('head', head);
  hd.box([0.56, 0.4, 0.46], [0, 0.22, 0], STEEL);
  hd.box([0.58, 0.05, 0.48], [0, 0.44, 0], STEEL_DARK);
  hd.box([0.46, 0.24, 0.03], [0, 0.22, 0.235], CHARCOAL);
  for (const s of [-1, 1]) hd.box([0.06, 0.16, 0.16], [s * 0.3, 0.22, 0], MUSTARD);
  hd.box([0.04, 0.22, 0.04], [0, 0.57, 0], STEEL_DARK);
  hd.done();
  const eyeMat = ownGlow(skin, '#7ff3ff');
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * 0.11, 0.23, 0.255);
    head.add(e);
  }
  const ballMat = ownGlow(skin, '#ff6a4a');
  const ball = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), ballMat);
  ball.position.set(0, 0.72, 0);
  head.add(ball);

  markShadows(root);
  let t = 0;
  let phase = 0;
  let stride = 0;
  let lastLook = '';
  return {
    root,
    update(dt, k) {
      t += dt;
      const speed = k.walk ?? 0;
      stride += (Math.min(1, speed / 3) - stride) * Math.min(1, dt * 8);
      phase += dt * (3 + speed * 2.2);
      const sw = Math.sin(phase) * 0.7 * stride;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.8;
      const shot = k.shot ?? Infinity;
      // the blaster arm comes up to point and recoils a little on the shot
      const aimArm = shot < 0.5 ? -1.45 + (shot < 0.08 ? 0.25 * (1 - shot / 0.08) : 0) : sw * 0.8;
      arms[1].rotation.x += (aimArm - arms[1].rotation.x) * Math.min(1, dt * 18);
      // a bob with every step, a hop when it wakes up
      const wake = k.wake ?? 99;
      const hop = wake > 0.55 && wake < 0.95 ? Math.sin(((wake - 0.55) / 0.4) * Math.PI) * 0.22 : 0;
      body.position.y = Math.abs(Math.sin(phase)) * 0.04 * stride + hop;
      for (const l of legs) l.position.y = 0.42 + hop;
      head.rotation.y = speed < 0.3 && shot > 0.5 ? Math.sin(t * 0.8) * 0.35 : 0;
      head.rotation.z = wake < 1.2 ? Math.sin(wake * 14) * 0.1 * (1 - wake / 1.2) : 0;
      // eyes: off while it wakes, then on (a flash on every shot); the antenna blinks slowly
      const eyes = wake < 0.35 ? 0 : wake < 0.5 ? (Math.floor(wake * 30) % 2 ? 1 : 0) : 0.9 + (shot < 0.15 ? 1 : 0);
      const ant = wake < 0.5 ? 0 : (t % 1.6) < 0.8 ? 1 : 0.3;
      const look = `${eyes}|${ant}`;
      if (look !== lastLook) {
        lastLook = look;
        if (eyes > 0) setGlow(eyeMat, C_ROBO_EYE, eyes);
        else setGlow(eyeMat, C_ROBO_OFF, 0);
        setGlow(ballMat, C_ANTENNA, ant);
        setGlow(heartMat, C_HEART, eyes > 0 ? 0.8 : 0.1);
      }
    },
  };
}

// ─── the flying saucer (aliens) ─────────────────────────────────────────────

const LILAC = '#9d82d6';
const LILAC_DARK = '#7a60b8';
const SILVER = '#c9cbd6';
const RIM_N = 8;
const C_DOME = new THREE.Color('#8ff0e0');
const C_HATCH = new THREE.Color('#bfffee');
const C_DULL = new THREE.Color('#5b5550');
/** How high the saucer goes as it lifts off (blocks at lift = 1). */
const LIFT_H = 3.2;

/**
 * A small toy flying saucer on four splayed legs: a silver hull, a lilac rim band with chunky
 * lights that chase round, a glowing mint dome with a little antenna, a glowing hatch underneath.
 * `lift` (0..1) raises it with a wobble and lets a soft beam down from the hatch to the ground.
 */
export function createSaucer(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'saucer';
  const kit = new Kit('saucer', skin);
  const hover = new THREE.Group();
  root.add(hover);
  const p = kit.part('hull', hover);
  // legs: from under the hull out to round mustard feet
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * TAU) / 4;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    p.beam([sx * 0.62, 0.9, cz * 0.62], [sx * 1.12, 0.1, cz * 1.12], 0.12, STEEL_DARK);
    p.box([0.3, 0.08, 0.3], [sx * 1.14, 0.04, cz * 1.14], MUSTARD, [0, a, 0]);
    p.box([0.16, 0.1, 0.16], [sx * 0.86, 0.55, cz * 0.86], LILAC_DARK, [0, a, 0]);
  }
  octagon(p, 1.5, 0.14, 0.8, STEEL_DARK);
  octagon(p, 2.4, 0.2, 0.94, SILVER);
  octagon(p, 2.9, 0.16, 1.14, LILAC);
  octagon(p, 2.95, 0.04, 1.14, LILAC_DARK);
  octagon(p, 2.3, 0.16, 1.3, SILVER);
  octagon(p, 1.6, 0.12, 1.46, STEEL);
  // little portholes on the upper hull
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + Math.PI / 8;
    p.box([0.14, 0.08, 0.04], [Math.sin(a) * 1.08, 1.38, Math.cos(a) * 1.08], CHARCOAL, [0, a, 0]);
  }
  // antenna on the dome
  p.box([0.04, 0.32, 0.04], [0.12, 2.2, -0.1], STEEL_DARK);
  p.done();

  const domeMat = ownGlow(skin, '#8ff0e0');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 9, 0, TAU, 0, Math.PI / 2), domeMat);
  dome.position.y = 1.58;
  dome.castShadow = true;
  hover.add(dome);
  const tipMat = ownGlow(skin, '#ff6a4a');
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), tipMat);
  tip.position.set(0.12, 2.4, -0.1);
  hover.add(tip);
  const hatchMat = ownGlow(skin, '#bfffee');
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), hatchMat);
  hatch.position.y = 0.78;
  hover.add(hatch);

  // the rim lights: one instanced draw; colours chase every frame
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  lightMat.userData.own = true;
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), lightMat, RIM_N);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < RIM_N; i++) {
    const a = (i * TAU) / RIM_N;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);
    lights.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.sin(a) * 1.47, 1.22, Math.cos(a) * 1.47), q, new THREE.Vector3(1, 1, 1)));
    lights.setColorAt(i, C_DULL);
  }
  lights.frustumCulled = false;
  hover.add(lights);

  // the beam: an open cone from the hatch to the ground, brightest at the top, and a pool under it
  const beamGeo = new THREE.CylinderGeometry(0.4, 1.4, 1, 16, 4, true).translate(0, -0.5, 0);
  {
    const pos = beamGeo.getAttribute('position');
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0.35 + 0.65 * (1 + pos.getY(i));
    beamGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const beamMat = glowMaterial(0xb8fff0, true);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  beam.visible = false;
  root.add(beam);
  const poolMat = glowMaterial(0xb8fff0, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pool = new THREE.Mesh(fadeDisc(1.5), poolMat);
  pool.position.y = 0.04;
  pool.visible = false;
  root.add(pool);

  markShadows(root);
  beam.receiveShadow = pool.receiveShadow = false;
  const col = new THREE.Color();
  let t = 0;
  return {
    root,
    update(dt, k) {
      t += dt;
      const lift = Math.max(0, k.lift ?? 0);
      // up it goes with a wobble; on the ground it just breathes its lights
      const up = smooth(lift) * LIFT_H;
      hover.position.y = up + (lift > 0 ? Math.sin(t * 5) * 0.06 * Math.min(1, lift * 3) : 0);
      hover.rotation.z = lift > 0 ? Math.sin(t * 3.1) * 0.06 * Math.min(1, lift * 3) : 0;
      hover.rotation.x = lift > 0 ? Math.cos(t * 2.3) * 0.04 * Math.min(1, lift * 3) : 0;
      const speed = 3 + lift * 14;
      for (let i = 0; i < RIM_N; i++) {
        const w = 0.5 + 0.5 * Math.sin(t * speed - (i * TAU) / RIM_N * 2);
        col.copy(PARTY[i % PARTY.length]).multiplyScalar(0.45 + 0.85 * w * w);
        lights.setColorAt(i, col);
      }
      lights.instanceColor!.needsUpdate = true;
      setGlow(domeMat, C_DOME, 0.35 + 0.25 * k.night + 0.12 * Math.sin(t * 2) + lift * 0.6);
      setGlow(tipMat, C_ANTENNA, (t % 1.2) < 0.6 ? 1 : 0.2);
      setGlow(hatchMat, C_HATCH, 0.3 + lift * 1.4);
      const shown = lift > 0.02;
      beam.visible = pool.visible = shown;
      if (shown) {
        const hgt = hover.position.y + 0.78;
        beam.position.y = hgt;
        beam.scale.set(1, hgt, 1);
        beamMat.opacity = 0.32 * Math.min(1, lift * 2);
        poolMat.opacity = 0.7 * Math.min(1, lift * 2);
      }
    },
  };
}
