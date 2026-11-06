/**
 * The bubble machine: a round pink tub on a charcoal foot, a cream band, a mustard rim, full of
 * white suds, with a big mustard ring on a stick rising out of the suds like a giant bubble wand
 * and a little coral crank on its side. Fed: the crank turns, the wand rocks, a soapy film shimmers
 * in the ring and soft see-through bubbles rise and drift; on a shot the tub squeezes and one big
 * bubble swells on the ring and floats off. Origin at the floor centre of the 1×1 footprint, front
 * towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MUSTARD, STEEL_DARK, TAU, glowMaterial, powerBulb } from './buildingParts';
import { Build, finishShadows, fx } from './villages';

const PINK = '#ee6a82';
const PINK_DARK = '#c94f68';
const SUDS = '#fffaf2';
const SUDS_BLUE = '#dcefff';

/** Where the wand is hinged, in the suds, and the ring on top of it. */
const WAND_Y = 0.52;
const RING_UP = 0.62;
const RING_R = 0.27;
const RING_Y = WAND_Y + RING_UP;

const SMALL = 14;
const BIG = SMALL;
/** Seconds a small bubble lives; how high it rises. */
const LIFE = 4.4;
const RISE = 2.8;
/** How long the big one takes to swell on the ring, and how long it floats after. */
const SWELL = 0.45;
const FLOAT = 3.6;

/**
 * A bubble of radius 1: nearly clear in the middle, pink and blue at the rim as the fixed camera
 * sees it, a small bright spot on the sun's side. All in vertex colours: no texture, no new shader.
 */
function bubbleGeo(): THREE.BufferGeometry {
  const view = new THREE.Vector3(0, 0.72, 0.69).normalize();
  const sun = new THREE.Vector3(-0.45, 0.72, 0.52).normalize();
  const g = new THREE.SphereGeometry(1, 20, 14);
  const nor = g.getAttribute('normal');
  const c = new Float32Array(nor.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i);
    const rim = 0.8 * (1 - Math.abs(n.dot(view))) ** 2.4;
    const side = 0.5 + 0.5 * n.x;
    const spot = Math.max(0, n.dot(sun)) ** 14;
    c[i * 3] = rim * (0.45 + 0.55 * side) + spot + 0.03;
    c[i * 3 + 1] = rim * 0.72 + spot + 0.04;
    c[i * 3 + 2] = rim * (1 - 0.3 * side) + spot + 0.06;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** The film in the ring: a round skin whose colours run round its edge. */
function filmGeo(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(RING_R - 0.015, 24);
  const pos = g.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    const edge = Math.hypot(pos.getX(i), pos.getY(i)) / RING_R;
    c[i * 3] = (0.2 + 0.8 * edge) * (0.65 + 0.35 * Math.sin(a));
    c[i * 3 + 1] = (0.2 + 0.8 * edge) * (0.7 + 0.3 * Math.sin(a + 2.1));
    c[i * 3 + 2] = 0.3 + 0.7 * edge;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

let bubbleShape: THREE.BufferGeometry | null = null;
let filmShape: THREE.BufferGeometry | null = null;

/** Each small bubble's own way up; fixed, so nothing is drawn at random. */
const WAY = Array.from({ length: SMALL }, (_, i) => ({
  a: i * 2.39996,
  r: 0.05 + 0.05 * ((i * 0.618) % 1),
  out: 0.5 + 1.1 * ((i * 0.37) % 1),
}));

export function createBubbler(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'bubbler';
  const b = new Build(skin, 'bubbler');
  root.add(b.root);

  // the tub: foot, body, band, rim
  b.cyl(0.47, 0.08, [0, 0.04, 0], CHARCOAL, { seg: 24 });
  b.cyl(0.4, 0.44, [0, 0.3, 0], PINK, { r1: 0.44, seg: 24 });
  b.cyl(0.45, 0.07, [0, 0.42, 0], CREAM, { seg: 24 });
  b.cyl(0.47, 0.06, [0, 0.54, 0], MUSTARD, { seg: 24 });
  b.cyl(0.4, 0.03, [0, 0.56, 0], PINK_DARK, { seg: 24 });

  // the suds, heaped up round the wand
  for (const [x, z, r, c] of [
    [-0.2, 0.14, 0.15, SUDS],
    [0.2, 0.16, 0.14, SUDS],
    [0.02, 0.26, 0.12, SUDS_BLUE],
    [-0.24, -0.1, 0.14, SUDS_BLUE],
    [0.23, -0.12, 0.15, SUDS],
    [0, -0.24, 0.14, SUDS],
    [0, 0.02, 0.17, SUDS],
  ] as const) {
    b.ball(r, [x, 0.6 + r * 0.25, z], c, { seg: 12 });
  }

  // the stud the wire hangs from, at the back
  b.box([0.1, 0.16, 0.08], [0, 0.46, -0.45], CHARCOAL);

  // the crank on the right side turns
  const crank = new THREE.Group();
  crank.position.set(0.44, 0.27, 0);
  b.root.add(crank);
  const cp = b.part('crank', crank);
  cp.box([0.06, 0.05, 0.05], [0, 0, 0], STEEL_DARK);
  cp.box([0.03, 0.2, 0.05], [0.03, 0.08, 0], CORAL);
  cp.box([0.04, 0.05, 0.05], [0.03, 0.17, 0], CREAM);

  // the wand rocks on its hinge in the suds
  const wand = new Build(skin, 'bubbler-wand');
  wand.root.position.y = WAND_Y;
  wand.box([0.07, RING_UP - RING_R + 0.02, 0.07], [0, (RING_UP - RING_R) / 2, 0], MUSTARD);
  wand.geo(new THREE.TorusGeometry(RING_R, 0.04, 8, 32), [0, RING_UP, 0], MUSTARD);
  wand.cyl(0.03, 0.03, [0, RING_UP + RING_R + 0.04, 0], CORAL, { seg: 8 });
  wand.finish();
  b.root.add(wand.root);

  // the film in the ring
  const filmMat = glowMaterial(0xffffff, true);
  const film = fx(new THREE.Mesh((filmShape ??= filmGeo()), filmMat));
  film.position.y = RING_UP;
  film.visible = false;
  wand.root.add(film);

  const bulb = powerBulb(skin, b.root, [0, 0.22, 0.4]);
  b.finish();

  // the bubbles: one instanced additive draw, the last one is the big one
  const bubbleMat = glowMaterial(0xffffff, true);
  bubbleMat.side = THREE.FrontSide;
  bubbleMat.opacity = 1;
  const bubbles = new THREE.InstancedMesh((bubbleShape ??= bubbleGeo()), bubbleMat, SMALL + 1);
  bubbles.frustumCulled = false;
  bubbles.visible = false;
  // frames and sprites fit the machine, not the bubbles
  bubbles.boundingBox = new THREE.Box3(new THREE.Vector3(-0.4, 0.5, -0.4), new THREE.Vector3(0.4, 2, 0.4));
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i <= SMALL; i++) bubbles.setColorAt(i, white);
  root.add(fx(bubbles));

  finishShadows(root);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  let t = 0;
  let spin = 0;
  let on = 0;
  return {
    root,
    socket: new THREE.Vector3(0, 0.52, -0.45),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = !!pw?.on;
      on += ((live ? 1 : 0) - on) * Math.min(1, dt * 2);
      spin += ((live ? 4 : 0) - spin) * Math.min(1, dt * 3);
      crank.rotation.x = (crank.rotation.x + spin * dt) % TAU;

      const p = k.pulse ?? Infinity;
      const squeeze = Math.exp(-p * 7);
      b.root.scale.set(1 + squeeze * 0.05, 1 - squeeze * 0.07, 1 + squeeze * 0.05);
      wand.root.rotation.x = on * (0.15 * Math.sin(t * 1.4) - 0.22 * squeeze);

      film.visible = on > 0.02;
      bubbles.visible = film.visible;
      if (!film.visible) return;
      filmMat.opacity = (0.12 + 0.04 * Math.sin(t * 2.6)) * on;

      for (let i = 0; i < SMALL; i++) {
        const w = WAY[i];
        const u = (t / LIFE + i / SMALL) % 1;
        const out = w.out * u;
        pos.set(
          Math.sin(w.a) * out + Math.sin(t * 0.9 + i) * 0.1 * u,
          RING_Y + (i % 3 === 0 ? -0.1 : 0.05) + u * RISE,
          Math.cos(w.a) * out + 0.1,
        );
        scl.setScalar(w.r * Math.min(1, u * 7) * (1 + u * 0.7));
        bubbles.setMatrixAt(i, m4.compose(pos, q, scl));
        bubbles.setColorAt(i, col.setScalar(Math.min(1, u * 7, (1 - u) * 6) * on));
      }

      // the big one: swells on the ring, then floats away
      if (p < SWELL + FLOAT) {
        const swell = Math.min(1, p / SWELL);
        const fly = Math.max(0, p - SWELL);
        pos.set(Math.sin(fly * 0.8) * 0.3, RING_Y + swell * 0.1 + fly * 0.85, 0.06 + fly * 0.1);
        scl.setScalar(0.1 + 0.3 * swell);
        bubbles.setMatrixAt(BIG, m4.compose(pos, q, scl));
        bubbles.setColorAt(BIG, col.setScalar(Math.min(1, (SWELL + FLOAT - p) * 2.5)));
      } else {
        bubbles.setMatrixAt(BIG, m4.makeScale(0, 0, 0));
      }
      bubbles.instanceMatrix.needsUpdate = true;
      bubbles.instanceColor!.needsUpdate = true;
    },
  };
}
