/**
 * The mega garland: two tall striped posts at the ends of the 5×1 footprint, each with a coral ball
 * on top, and two sagging strings of big round bulbs between them, high enough to walk under. Fed:
 * while music is near the bulbs blink on the beat, otherwise a slow chase runs along the strings;
 * at night each bulb has a soft halo and a long warm pool lies under them. A night show runs its
 * colours along the strings. Short of power they blink coral; unfed they are dark glass. Origin at
 * the floor centre, front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MUSTARD, TEAL, WOOD_DARK, fadeDisc, glowMaterial, powerBulb, showColour, showLevel, showPhase } from './buildingParts';
import { Build, finishShadows, fx } from './villages';

const POST_X = 2;
const POST_TOP = 3.02;
/** Where the strings end, just inside the posts. */
const END_X = 1.86;
const BULB_DROP = 0.2;
const BULB_R = 0.15;

/** A string hanging from `y` at the posts to `y - sag` in the middle. */
interface Str {
  y: number;
  sag: number;
  z: number;
  n: number;
}
const STRINGS: Str[] = [
  { y: 2.96, sag: 0.34, z: -0.13, n: 11 },
  { y: 2.6, sag: 0.5, z: 0.13, n: 12 },
];
const stringY = (s: Str, x: number): number => s.y - s.sag * (1 - (x / END_X) ** 2);

/** Every bulb in order along the strings; the count runs on along the second string. */
const SPOTS = STRINGS.flatMap((s) =>
  Array.from({ length: s.n }, (_, i) => {
    const x = -END_X + (2 * END_X * (i + 0.5)) / s.n;
    return { x, y: stringY(s, x) - BULB_DROP, z: s.z, wire: stringY(s, x) };
  }),
);
const N = SPOTS.length;

const PARTY = ['#ff5a48', '#ffd23a', '#59d3c4', '#6fb7ff', '#ff7a9a', '#9ae05a'].map((c) => new THREE.Color(c));
const C_DARK = new THREE.Color('#57534f');
const C_LOW = new THREE.Color('#ff6a4a');
const C_LOW_OFF = new THREE.Color('#4a4440');

/** The way the fixed camera looks back at the model, for soft edges on additive balls. */
const VIEW = new THREE.Vector3(0, 0.72, 0.69).normalize();
const SUN = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();

/** Grey vertex colours on a sphere from each vertex's normal. */
function shadedBall(r: number, wide: number, tall: number, shade: (n: THREE.Vector3) => number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, wide, tall);
  const nor = g.getAttribute('normal');
  const c = new Float32Array(nor.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = shade(n.fromBufferAttribute(nor, i));
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

let bulbShape: THREE.BufferGeometry | null = null;
let haloShape: THREE.BufferGeometry | null = null;
let poolShape: THREE.BufferGeometry | null = null;
let ballShape: THREE.BufferGeometry | null = null;

export function createMegagarland(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'megagarland';
  const b = new Build(skin, 'megagarland');
  root.add(b.root);

  for (const s of [-1, 1]) {
    const x = s * POST_X;
    // the foot, a mustard block, a teal post with coral bands, a ball on top
    b.box([0.86, 0.14, 0.86], [x, 0.07, 0], CHARCOAL);
    b.box([0.6, 0.3, 0.6], [x, 0.29, 0], MUSTARD);
    b.box([0.28, POST_TOP - 0.44, 0.28], [x, (POST_TOP + 0.44) / 2, 0], TEAL);
    for (const y of [0.86, 1.4, 1.94, 2.46]) b.box([0.34, 0.14, 0.34], [x, y, 0], CORAL);
    b.box([0.42, 0.08, 0.42], [x, POST_TOP + 0.02, 0], MUSTARD);
    // the cleats the strings hang from
    for (const st of STRINGS) {
      b.box([0.12, 0.1, 0.1], [s * END_X, st.y, st.z], CREAM);
      b.box([0.16, 0.08, 0.3], [x, st.y, st.z * 0.6], CREAM);
    }
  }

  // the strings and a cap over every bulb
  const SEG = 16;
  for (const st of STRINGS) {
    for (let j = 0; j < SEG; j++) {
      const x0 = -END_X + (2 * END_X * j) / SEG;
      const x1 = -END_X + (2 * END_X * (j + 1)) / SEG;
      b.beam([x0, stringY(st, x0), st.z], [x1, stringY(st, x1), st.z], 0.05, WOOD_DARK);
    }
  }
  for (const s of SPOTS) {
    b.box([0.03, BULB_DROP - 0.1, 0.03], [s.x, s.wire - (BULB_DROP - 0.1) / 2, s.z], WOOD_DARK);
    b.box([0.12, 0.08, 0.12], [s.x, s.y + BULB_R + 0.01, s.z], CHARCOAL);
  }
  b.finish();

  // the balls on top: smooth, not faceted, so they do not read as disco balls
  const ballGeo = (ballShape ??= new THREE.SphereGeometry(0.19, 18, 12));
  for (const s of [-1, 1]) {
    const ball = new THREE.Mesh(ballGeo, skin.partMaterial(CORAL));
    ball.position.set(s * POST_X, POST_TOP + 0.22, 0);
    ball.castShadow = true;
    b.root.add(ball);
  }

  // the bulbs: one instanced draw, unlit, lit from the upper left in their own vertex colours
  bulbShape ??= shadedBall(BULB_R, 14, 10, (n) => {
    const d = n.dot(SUN);
    return 0.72 + 0.28 * d + 0.5 * Math.max(0, d) ** 12;
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
  bulbMat.userData.own = true;
  const bulbs = new THREE.InstancedMesh(bulbShape, bulbMat, N);
  bulbs.frustumCulled = false;
  root.add(fx(bulbs));

  // night: a halo round every bulb, fading at its edge, and one long pool under the strings
  haloShape ??= shadedBall(0.33, 12, 9, (n) => Math.max(0, n.dot(VIEW)) ** 4);
  const haloMat = glowMaterial(0xffffff, true);
  haloMat.side = THREE.FrontSide;
  const halos = new THREE.InstancedMesh(haloShape, haloMat, N);
  halos.frustumCulled = false;
  halos.visible = false;
  root.add(fx(halos));
  const poolMat = glowMaterial(0xffb85a, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pool = fx(new THREE.Mesh((poolShape ??= fadeDisc(1)), poolMat));
  pool.scale.set(3.4, 1, 1.5);
  pool.position.set(0, 0.04, 0.05);
  pool.visible = false;
  root.add(pool);

  const bulb = powerBulb(skin, b.root, [POST_X, 0.3, 0.3]);
  finishShadows(root);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const showCol = new THREE.Color();
  const dark = (): void => {
    for (let i = 0; i < N; i++) {
      bulbs.setMatrixAt(i, m4.makeTranslation(SPOTS[i].x, SPOTS[i].y, SPOTS[i].z));
      bulbs.setColorAt(i, C_DARK);
      halos.setMatrixAt(i, m4);
      halos.setColorAt(i, C_DARK);
    }
    bulbs.instanceMatrix.needsUpdate = true;
    bulbs.instanceColor!.needsUpdate = true;
  };
  dark();

  let t = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(POST_X, POST_TOP, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const low = !!pw && pw.linked && pw.low;
      if (!low && !pw?.on) {
        if (last !== 'off') {
          last = 'off';
          dark();
          halos.visible = false;
          pool.visible = false;
        }
        return;
      }
      if (low) {
        const hi = Math.floor(t * 6) % 2 === 0;
        const key = hi ? 'hi' : 'lo';
        if (key === last) return;
        last = key;
        for (let i = 0; i < N; i++) bulbs.setColorAt(i, hi ? C_LOW : C_LOW_OFF);
        bulbs.instanceColor!.needsUpdate = true;
        halos.visible = false;
        pool.visible = false;
        return;
      }
      last = 'on';
      const night = k.night;
      const frac = k.beat - Math.floor(k.beat);
      const parity = Math.floor(k.beat) % 2;
      const sh = showLevel(k.show);
      const ph = showPhase(root);
      const shine = night > 0.04;
      for (let i = 0; i < N; i++) {
        const base = sh > 0 ? showColour(k.show!, ph + i * 0.22, showCol) : PARTY[i % PARTY.length];
        let glow: number;
        let pop = 0;
        if (k.playing) {
          pop = i % 2 === parity ? Math.exp(-frac * 5) : 0;
          glow = 0.42 + 0.9 * pop;
        } else {
          // the slow chase: a soft bright wave walks along the strings
          const w = 0.5 + 0.5 * Math.sin(t * 1.7 - i * 0.6);
          glow = 0.42 + 0.85 * w * w * w;
        }
        col.copy(base).multiplyScalar(glow);
        bulbs.setColorAt(i, col);
        const s = SPOTS[i];
        pos.set(s.x, s.y, s.z);
        scl.setScalar(1 + pop * 0.14);
        bulbs.setMatrixAt(i, m4.compose(pos, q, scl));
        if (shine) {
          halos.setMatrixAt(i, m4);
          halos.setColorAt(i, col.multiplyScalar(0.3 + 0.7 * night));
        }
      }
      bulbs.instanceMatrix.needsUpdate = true;
      bulbs.instanceColor!.needsUpdate = true;
      halos.visible = shine;
      pool.visible = shine;
      if (shine) {
        halos.instanceMatrix.needsUpdate = true;
        halos.instanceColor!.needsUpdate = true;
        haloMat.opacity = 0.08 + 0.6 * night;
        poolMat.opacity = 0.42 * night;
      }
    },
  };
}
