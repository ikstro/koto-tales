/**
 * The pie oven: a small clay dome on a whitewashed plinth painted with a daisy and a poppy, a brick
 * arch round its mouth with a warm glow inside and two golden pies on the sill, a stack of logs in
 * a niche at the left, a brick chimney at the back with soft round puffs going up, and a wooden
 * peel leaning on the dome. Origin at the floor centre of the 2×1, front towards +Z; no power, it
 * is always warm: the mouth is own glow, by night a pool on the ground in front.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, INK, MUSTARD, WOOD, WOOD_DARK, setGlow } from './buildingParts';
import { Build, finishShadows, fx, pool } from './villages';

const CLAY = '#cf7f4d';
const CLAY_LIGHT = '#dd9663';
const BRICK = '#a9543a';
const BRICK_DARK = '#8a4230';
const PLASTER = '#f6e7c4';
const STONE = '#a2968a';
const LOG = '#c9975a';
const LEAF = '#4f9a3c';
const PETAL = '#fffaf0';
const POPPY = '#e53935';
const CRUST = '#d9a35b';
const CRUST_DARK = '#b47c3a';
const PEEL = '#c99a5e';
const PUFF = '#f4ecdf';

/** The plinth's top; the dome; the mouth's half width, its sill and the spring of its arch. */
const BASE = 0.54;
const DOME_X = 0.86;
const DOME_Y = 0.9;
const DOME_Z = 0.42;
const MOUTH_W = 0.3;
const MOUTH_Y = BASE + 0.05;
const MOUTH_TOP = BASE + 0.26;
const FACE = 0.42;
/** The chimney. */
const CHIM_X = 0.5;
const CHIM_Z = -0.12;
const CHIM_TOP = 1.92;
const PUFFS = 5;

const C_MOUTH = new THREE.Color('#ffa24a');

/** An arch outline in the XY plane: straight sides from y0 to y1, a half circle on top. */
function arch<T extends THREE.Path>(s: T, w: number, y0: number, y1: number): T {
  s.moveTo(-w, y0);
  s.lineTo(w, y0);
  s.lineTo(w, y1);
  s.absarc(0, y1, w, 0, Math.PI, false);
  s.lineTo(-w, y0);
  return s;
}

const slab = (shape: THREE.Shape, depth: number): THREE.BufferGeometry => new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 20, bevelEnabled: false });

export function createPieoven(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'pieoven';
  const b = new Build(skin, 'pieoven');
  root.add(b.root);

  // the stone foot and the whitewashed plinth with a coral line
  b.box([1.94, 0.12, 0.94], [0, 0.06, 0], STONE);
  b.box([1.84, BASE - 0.12, 0.84], [0, (BASE + 0.12) / 2, 0], PLASTER);
  b.box([1.86, 0.04, 0.86], [0, BASE - 0.03, 0], CORAL);

  // the logs in their niche at the left
  b.box([0.66, 0.3, 0.02], [-0.52, 0.29, FACE + 0.001], INK);
  b.box([0.72, 0.03, 0.03], [-0.52, 0.455, FACE + 0.006], WOOD_DARK);
  for (const [x, y] of [
    [-0.72, 0.22],
    [-0.52, 0.22],
    [-0.32, 0.22],
    [-0.62, 0.36],
    [-0.42, 0.36],
  ] as const) {
    b.disc(0.088, 0.05, [x, y, FACE - 0.005], [0, 0, 1], WOOD);
    b.disc(0.06, 0.06, [x, y, FACE - 0.005], [0, 0, 1], LOG);
  }

  // a daisy and a poppy painted on the plinth at the right
  for (const [x, c, eye] of [
    [0.34, PETAL, MUSTARD],
    [0.68, POPPY, INK],
  ] as const) {
    b.box([0.025, 0.14, 0.012], [x, 0.21, FACE + 0.006], LEAF);
    b.box([0.09, 0.03, 0.012], [x + 0.035, 0.2, FACE + 0.006], LEAF, [0, 0, 0.6]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.disc(0.042, 0.012, [x + Math.sin(a) * 0.058, 0.34 + Math.cos(a) * 0.058, FACE], [0, 0, 1], c);
    }
    b.disc(0.036, 0.016, [x, 0.34, FACE + 0.002], [0, 0, 1], eye);
  }

  // the dome
  b.ball(1, [0, BASE, 0], CLAY, { top: true, s: [DOME_X, DOME_Y, DOME_Z], seg: 18 });
  b.box([1.74, 0.05, 0.8], [0, BASE + 0.02, 0], CLAY_LIGHT);

  // the mouth: a clay block standing out of the dome, a brick arch, the dark inside
  b.geo(slab(arch(new THREE.Shape(), 0.44, BASE, MOUTH_TOP), 0.34), [0, 0, 0.1], CLAY);
  const NB = 9;
  for (let i = 0; i < NB; i++) {
    const a = (i / (NB - 1)) * Math.PI;
    const r = MOUTH_W + 0.065;
    b.box([0.12, 0.09, 0.05], [Math.cos(a) * r, MOUTH_TOP + Math.sin(a) * r, 0.44], i % 2 ? BRICK_DARK : BRICK, [0, 0, a + Math.PI / 2]);
  }
  for (const s of [-1, 1]) {
    b.box([0.12, 0.1, 0.05], [s * (MOUTH_W + 0.065), MOUTH_Y + 0.07, 0.44], BRICK_DARK);
    b.box([0.12, 0.09, 0.05], [s * (MOUTH_W + 0.065), MOUTH_Y + 0.165, 0.44], BRICK);
  }
  b.geo(slab(arch(new THREE.Shape(), MOUTH_W, MOUTH_Y, MOUTH_TOP), 0.01), [0, 0, 0.44], CHARCOAL);
  // the sill, and two pies on it
  b.box([0.78, 0.06, 0.1], [0, MOUTH_Y - 0.02, 0.46], BRICK_DARK);
  for (const s of [-1, 1]) {
    const x = s * 0.13;
    const y = MOUTH_Y + 0.01;
    b.box([0.2, 0.06, 0.09], [x, y + 0.03, 0.47], CRUST);
    b.box([0.15, 0.04, 0.07], [x, y + 0.08, 0.47], CRUST);
    b.box([0.12, 0.02, 0.03], [x, y + 0.105, 0.47], CRUST_DARK);
  }

  // the chimney from the dome's back, a cream band, a dark cap
  b.box([0.3, CHIM_TOP - 1.0, 0.3], [CHIM_X, (CHIM_TOP + 1.0) / 2, CHIM_Z], BRICK);
  for (const y of [1.3, 1.5]) b.box([0.31, 0.02, 0.31], [CHIM_X, y, CHIM_Z], BRICK_DARK);
  b.box([0.33, 0.07, 0.33], [CHIM_X, 1.68, CHIM_Z], CREAM);
  b.box([0.38, 0.08, 0.38], [CHIM_X, CHIM_TOP, CHIM_Z], BRICK_DARK);
  b.box([0.2, 0.02, 0.2], [CHIM_X, CHIM_TOP + 0.045, CHIM_Z], CHARCOAL);

  // the peel: its handle on the plinth's ledge, its blade up, leaning on the dome
  const A = [0.8, BASE, 0.28] as const;
  const B = [0.36, 1.55, 0.24] as const;
  const at = (f: number): [number, number, number] => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
  b.beam(A, at(0.62), 0.05, WOOD_DARK);
  b.beam(at(0.58), at(0.64), 0.1, WOOD);
  b.beam(at(0.62), B, 0.26, PEEL, 0.03);

  // the warm inside of the mouth
  const mouthMat = b.glowGeo('mouth', '#ffa24a', new THREE.ShapeGeometry(arch(new THREE.Shape(), MOUTH_W - 0.05, MOUTH_Y, MOUTH_TOP - 0.02), 16), [0, 0, 0.453]).finish().mouth;
  setGlow(mouthMat, C_MOUTH, 0.9);

  // the puffs: soft round clouds going up and melting away
  const puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), skin.partMaterial(PUFF), PUFFS);
  puffs.frustumCulled = false;
  root.add(fx(puffs));

  // a warm pool in front, stronger at night
  const glow = pool(0xffa860, 1.3, [0, 0.04, 1.0]);
  root.add(glow.mesh);

  finishShadows(root);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const rise = (t: number): void => {
    for (let i = 0; i < PUFFS; i++) {
      const life = (t * 0.22 + i / PUFFS) % 1;
      const s = 0.2 * Math.sin(Math.PI * Math.sqrt(life)) + 0.0001;
      pos.set(CHIM_X + life * 0.34 + Math.sin(t * 0.9 + i * 2) * 0.05 * life, CHIM_TOP + 0.08 + life * 1.3, CHIM_Z);
      puffs.setMatrixAt(i, m4.compose(pos, q, scl.setScalar(s)));
    }
    puffs.instanceMatrix.needsUpdate = true;
  };
  rise(0);
  let t = 0;
  let lastNight = -1;
  return {
    root,
    update(dt, k) {
      t += dt;
      rise(t);
      // the glow breathes slowly: embers, not flames
      setGlow(mouthMat, C_MOUTH, 0.85 + 0.12 * Math.sin(t * 1.7) + 0.06 * Math.sin(t * 4.1));
      const n = Math.round(k.night * 10);
      if (n === lastNight) return;
      lastNight = n;
      glow.mesh.visible = k.night > 0.05;
      glow.mat.opacity = 0.5 * k.night;
    },
  };
}
