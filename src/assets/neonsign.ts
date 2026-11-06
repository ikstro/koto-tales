/**
 * The neon sign: a dark plum board in a mustard frame on two teal posts, with glass tubes bent into
 * a cat's head (ears, eyes, whiskers, a little smile) and a heart beside it, no letters. Fed, the
 * tubes shine, softly by day and strongly at night, with a halo on the board and a pool on the
 * ground; they flicker gently, the heart beats (on the beat when music is near), the cat winks now
 * and then. Unfed the tubes are pale glass. Origin at the floor centre of the 2×1 footprint, front
 * towards +Z; glows are own emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, MUSTARD, TEAL, fadeDisc, glowMaterial, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, fx, pool } from './villages';

const BOARD = '#262b3d';
const CAT_HEX = '#ffc861';
const HEART_HEX = '#ff5a7a';
const C_CAT = new THREE.Color(CAT_HEX);
const C_HEART = new THREE.Color(HEART_HEX);
/** Unlit glass tube. */
const C_GLASS = new THREE.Color('#a29fa6');

const BOARD_Y = 1.31;
const TUBE_Z = 0.13;
const TUBE_R = 0.036;
const THIN_R = 0.024;
const CAT_X = -0.46;
const CAT_S = 0.95;
const HEART_X = 0.5;
const HEART_Y = 1.3;

type Pts = readonly (readonly [number, number])[];

const HEAD: Pts = [
  [0, -0.4],
  [-0.22, -0.36],
  [-0.37, -0.16],
  [-0.38, 0.1],
  [-0.37, 0.44],
  [-0.14, 0.21],
  [0.14, 0.21],
  [0.37, 0.44],
  [0.38, 0.1],
  [0.37, -0.16],
  [0.22, -0.36],
];
const SMILE: Pts = [
  [-0.13, -0.19],
  [-0.07, -0.25],
  [0, -0.17],
  [0.07, -0.25],
  [0.13, -0.19],
];
const WHISKERS: Pts[] = [
  [
    [0.22, -0.07],
    [0.46, -0.02],
  ],
  [
    [0.22, -0.15],
    [0.46, -0.19],
  ],
];
const HEART: Pts = [
  [0, -0.36],
  [-0.2, -0.13],
  [-0.35, 0.06],
  [-0.33, 0.24],
  [-0.17, 0.31],
  [0, 0.16],
  [0.17, 0.31],
  [0.33, 0.24],
  [0.35, 0.06],
  [0.2, -0.13],
];

/** A glass tube bent through the points, lying in the XY plane. */
function tube(pts: Pts, closed: boolean, r: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    closed,
    'catmullrom',
    0.25,
  );
  return new THREE.TubeGeometry(curve, pts.length * 8, r, 6, closed);
}

const eyeGeo = new THREE.SphereGeometry(0.056, 10, 8);
const haloGeo = fadeDisc(0.72);

export function createNeonsign(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'neonsign';
  const b = new Build(skin, 'neonsign');
  root.add(b.root);

  // two posts behind the board on charcoal feet
  for (const s of [-1, 1]) {
    b.box([0.44, 0.1, 0.8], [s * 0.72, 0.05, 0], CHARCOAL);
    b.box([0.14, 1.86, 0.12], [s * 0.72, 1.03, -0.11], TEAL);
    b.box([0.2, 0.06, 0.18], [s * 0.72, 0.2, -0.11], MUSTARD);
    b.box([0.2, 0.06, 0.18], [s * 0.72, 1.98, -0.11], MUSTARD);
  }

  // the board and its frame, standing a little proud of it
  b.box([1.9, 1.28, 0.1], [0, BOARD_Y, 0], BOARD);
  for (const s of [-1, 1]) {
    b.box([1.98, 0.06, 0.16], [0, BOARD_Y + s * 0.65, 0], MUSTARD);
    b.box([0.06, 1.3, 0.16], [s * 0.96, BOARD_Y, 0], MUSTARD);
  }

  // the junction box with the power bulb, under the board on the right
  b.box([0.3, 0.3, 0.16], [0.72, 0.42, 0], CHARCOAL);
  b.box([0.34, 0.05, 0.2], [0.72, 0.59, 0], MUSTARD);

  // the cat: head, smile, whiskers; the nose is its own colour
  const catAt = [CAT_X, BOARD_Y, TUBE_Z] as const;
  b.glowGeo('cat', CAT_HEX, tube(HEAD, true, TUBE_R / CAT_S), catAt, { s: CAT_S });
  b.glowGeo('cat', CAT_HEX, tube(SMILE, false, THIN_R), catAt, { s: CAT_S });
  for (const w of WHISKERS) {
    b.glowGeo('cat', CAT_HEX, tube(w, false, THIN_R), catAt, { s: CAT_S });
    b.glowGeo('cat', CAT_HEX, tube(w.map(([x, y]) => [-x, y] as const), false, THIN_R), catAt, { s: CAT_S });
  }
  b.glowBall('nose', HEART_HEX, 0.05, [CAT_X, BOARD_Y - 0.09, TUBE_Z]);

  // the heart has its own group: it beats
  const heart = new Build(skin, 'neonsign-heart');
  heart.root.position.set(HEART_X, HEART_Y, TUBE_Z);
  heart.glowGeo('tube', HEART_HEX, tube(HEART, true, TUBE_R), [0, 0, 0]);
  const heartMat = heart.finish().tube;
  b.root.add(heart.root);

  const { cat: catMat, nose: noseMat } = b.finish();

  // the eyes are the cat's tube, apart so one can wink
  const eyes = [-1, 1].map((s) => {
    const e = fx(new THREE.Mesh(eyeGeo, catMat));
    e.position.set(CAT_X + s * 0.145, BOARD_Y + 0.04, TUBE_Z);
    e.scale.y = 1.35;
    b.root.add(e);
    return e;
  });

  // a soft halo on the board behind each picture, a pool on the ground
  const halos = [
    { hex: 0xffb24a, x: CAT_X, y: BOARD_Y },
    { hex: 0xff4a78, x: HEART_X, y: HEART_Y },
  ].map(({ hex, x, y }) => {
    const mat = glowMaterial(hex, true);
    const mesh = fx(new THREE.Mesh(haloGeo, mat));
    mesh.rotation.x = HP;
    mesh.position.set(x, y, 0.07);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, mat };
  });
  const glow = pool(0xffa86a, 1.7, [0, 0.04, 0.85]);
  root.add(glow.mesh);

  const bulb = powerBulb(skin, b.root, [0.72, 0.4, 0.08]);
  finishShadows(root);

  setGlow(catMat, C_GLASS, 0);
  setGlow(noseMat, C_GLASS, 0);
  setGlow(heartMat, C_GLASS, 0);

  let t = 0;
  let shining = false;
  return {
    root,
    socket: new THREE.Vector3(0.72, 2.0, -0.11),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const low = !!pw && pw.linked && pw.low;
      const lit = !!pw && (low ? Math.floor(t * 6) % 2 === 0 : pw.on);
      if (!lit) {
        if (!shining) return;
        shining = false;
        setGlow(catMat, C_GLASS, 0);
        setGlow(noseMat, C_GLASS, 0);
        setGlow(heartMat, C_GLASS, 0);
        for (const h of halos) h.mesh.visible = false;
        glow.mesh.visible = false;
        heart.root.scale.setScalar(1);
        eyes[1].scale.y = 1.35;
        return;
      }
      shining = true;
      // a slow breath with a small shiver, and every few seconds the cat's tube stutters
      const breath = 0.93 + 0.07 * Math.sin(t * 2.3) * Math.sin(t * 7.1);
      const stutter = t % 7.3 < 0.2 && Math.floor(t * 28) % 2 === 0 ? 0.6 : 1;
      const level = (0.4 + 0.85 * k.night) * breath;
      setGlow(catMat, C_CAT, level * stutter);
      setGlow(noseMat, C_HEART, level);

      // the heart: on the beat near music, otherwise a calm double beat
      const frac = k.beat - Math.floor(k.beat);
      const beat = k.playing ? Math.exp(-frac * 6) : Math.max(0, Math.sin(t * 2.4)) ** 6;
      heart.root.scale.setScalar(1 + beat * 0.09);
      setGlow(heartMat, C_HEART, level * (1 + beat * 0.3));

      // the right eye winks
      eyes[1].scale.y = t % 5.2 < 0.24 ? 0.25 : 1.35;

      for (const h of halos) {
        h.mesh.visible = true;
        h.mat.opacity = (0.1 + 0.42 * k.night) * breath;
      }
      glow.mesh.visible = k.night > 0.03;
      glow.mat.opacity = 0.42 * k.night * breath;
    },
  };
}
