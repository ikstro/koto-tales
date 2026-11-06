/**
 * The candy floss cart: a long pink cart on four chunky wheels, cream polka dots on its front, a
 * cream counter; at the left a round steel drum with mustard teeth and a pink cloud rising out of
 * it, turning while it works, a glowing pink ring round its rim; at the right a rack holding three
 * big puffs of pink and white floss on sticks, swaying a little. Four seats on the ground, the
 * cat's last. Origin at the floor centre of the 2×1, front towards +Z; no lights, a pool at night.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { C_OFF, CHARCOAL, CREAM, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL, powerBulb, setGlow } from './buildingParts';
import type { V3 } from './parts/kit';
import { Build, HP, finishShadows, mergeCached, place, pool } from './villages';

const PINK = '#ee6a82';
const PINK_DARK = '#c94e68';
const FLOSS = '#fbaec4';
const FLOSS_DEEP = '#f58aa9';
const FLOSS_WHITE = '#fff3f4';
const STICK = '#fff1c8';
const C_RING = new THREE.Color('#ffa0c0');

/** The counter's top, the drum's place and size, the rack's place. */
const TOP = 0.88;
const DRUM_X = -0.42;
const DRUM_R = 0.42;
const DRUM_H = 0.26;
const RACK_X = 0.46;
const WHEEL_R = 0.15;

/** A seat on the ground: its position is the sitting surface, facing its local +Z (yaw `ry`). */
function seatAt(parent: THREE.Object3D, at: V3, ry: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

/**
 * A soft lumpy ball of floss: smooth normals, `main` melting into `deep` in slow swirls. The lumps
 * and swirls use whole turns of the angle, so the sphere's seam closes.
 */
function flossGeo(r: number, seed: number, main: string, deep: string, at: V3, squash = 1): THREE.BufferGeometry {
  const W = 22;
  const g = new THREE.SphereGeometry(1, W, 16);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const colours = new Float32Array(pos.count * 3);
  const a = new THREE.Color(main);
  const d = new THREE.Color(deep);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const az = Math.atan2(v.x, v.z);
    const k = r * (1 + 0.15 * Math.sin(3 * az + seed + v.y * 4) + 0.11 * Math.sin(5 * az - seed * 2 + v.y * 7) + 0.09 * Math.sin(v.y * 9 + seed));
    pos.setXYZ(i, v.x * k, v.y * k * squash, v.z * k);
    const f = 0.5 + 0.5 * Math.sin(2 * az + v.y * 5 + seed);
    c.copy(a).lerp(d, f * f);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.computeVertexNormals();
  // the seam's two columns share one normal
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let row = 0; row <= 16; row++) {
    const i = row * (W + 1);
    const j = i + W;
    v.set(nor.getX(i) + nor.getX(j), nor.getY(i) + nor.getY(j), nor.getZ(i) + nor.getZ(j)).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    nor.setXYZ(j, v.x, v.y, v.z);
  }
  return place(g, at);
}

export function createCandyfloss(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'candyfloss';
  const b = new Build(skin, 'candyfloss');
  root.add(b.root);

  // the cart: a foot band, a pink body, a cream counter on a mustard rim
  b.box([1.84, 0.08, 0.74], [0, 0.26, 0], PINK_DARK);
  b.box([1.8, 0.56, 0.7], [0, 0.54, 0], PINK);
  b.box([1.9, 0.05, 0.8], [0, TOP - 0.065, 0], MUSTARD);
  b.box([1.86, 0.04, 0.76], [0, TOP - 0.02, 0], CREAM);

  // cream polka dots on the front, in two offset rows
  const dots: readonly [number, number][] = [
    [-0.74, 0.65],
    [-0.42, 0.65],
    [-0.1, 0.65],
    [0.22, 0.65],
    [-0.58, 0.44],
    [-0.26, 0.44],
    [0.06, 0.44],
    [0.38, 0.44],
  ];
  for (const [x, y] of dots) b.disc(0.07, 0.016, [x, y, 0.35], [0, 0, 1], CREAM);

  // the axles, and a little junction box at the back the wire hangs from
  for (const x of [-0.68, 0.68]) b.box([0.06, 0.06, 0.9], [x, WHEEL_R, 0], STEEL_DARK);
  b.box([0.22, 0.24, 0.06], [0.6, 0.6, -0.38], CHARCOAL);
  b.box([0.24, 0.04, 0.08], [0.6, 0.73, -0.38], MUSTARD);

  // the drum's stand, the rack and its three sticks
  b.cyl(DRUM_R - 0.06, 0.04, [DRUM_X, TOP + 0.02, 0], STEEL_DARK, { seg: 20 });
  b.box([0.86, 0.1, 0.34], [RACK_X, TOP + 0.05, 0], TEAL);
  b.box([0.88, 0.03, 0.36], [RACK_X, TOP + 0.11, 0], MUSTARD);
  b.finish();

  // the wheels
  for (const x of [-0.68, 0.68]) {
    for (const z of [-1, 1]) {
      const w = new Build(skin, 'candyfloss-wheel');
      w.root.position.set(x, WHEEL_R, z * 0.4);
      const side = { rot: [HP, 0, 0] as const, seg: 18 };
      w.cyl(WHEEL_R, 0.1, [0, 0, 0], CHARCOAL, side);
      w.cyl(0.085, 0.11, [0, 0, 0], MUSTARD, side);
      w.cyl(0.03, 0.12, [0, 0, 0], STEEL, { ...side, seg: 8 });
      w.finish();
      root.add(w.root);
    }
  }

  // the drum: it turns while it works, with the cloud growing out of it
  const drum = new Build(skin, 'candyfloss-drum');
  drum.root.position.set(DRUM_X, TOP + 0.04, 0);
  drum.cyl(DRUM_R - 0.05, DRUM_H, [0, DRUM_H / 2, 0], STEEL, { r1: DRUM_R, seg: 24 });
  drum.cyl(DRUM_R - 0.04, 0.02, [0, DRUM_H + 0.005, 0], FLOSS_DEEP, { seg: 24 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    drum.box([0.1, DRUM_H * 0.7, 0.04], [Math.sin(a) * (DRUM_R - 0.03), DRUM_H * 0.5, Math.cos(a) * (DRUM_R - 0.03)], MUSTARD, [0, a + HP, 0]);
  }
  const ringMat = drum.glowGeo('ring', '#ffa0c0', new THREE.TorusGeometry(DRUM_R + 0.002, 0.026, 6, 28), [0, DRUM_H, 0], { rot: [HP, 0, 0] }).finish().ring;
  setGlow(ringMat, C_OFF, 0);
  const cloud = new THREE.Mesh(mergeCached('candyfloss/cloud', [flossGeo(0.34, 1.3, FLOSS_WHITE, FLOSS_DEEP, [0, DRUM_H + 0.13, 0], 0.72)]), drum.kit.vertexColourMaterial(false));
  cloud.castShadow = true;
  drum.root.add(cloud);
  root.add(drum.root);

  // the floss on sticks, swaying a little from the rack
  const rack = new Build(skin, 'candyfloss-rack');
  rack.root.position.set(RACK_X, TOP + 0.12, 0);
  const STICKS: readonly [number, number, number, number, string, string][] = [
    [-0.27, 0.06, 0.62, 0.24, FLOSS, FLOSS_DEEP],
    [0.02, -0.07, 0.9, 0.28, FLOSS_WHITE, FLOSS],
    [0.27, 0.06, 0.6, 0.24, FLOSS, FLOSS_WHITE],
  ];
  for (const [x, z, h] of STICKS) rack.cyl(0.024, h, [x, h / 2, z], STICK, { seg: 8 });
  rack.finish();
  const puffs = new THREE.Mesh(
    mergeCached(
      'candyfloss/puffs',
      STICKS.map(([x, z, h, r, main, deep], i) => flossGeo(r, i * 2.1, main, deep, [x, h + r * 0.7, z])),
    ),
    rack.kit.vertexColourMaterial(false),
  );
  puffs.castShadow = true;
  rack.root.add(puffs);
  root.add(rack.root);

  const glow = pool(0xffb3c8, 1.5, [0, 0.04, 0.7]);
  root.add(glow.mesh);

  const bulb = powerBulb(skin, root, [0.72, 0.56, 0.35]);
  finishShadows(root);
  const seats = [
    seatAt(root, [-0.55, 0, 0.95], Math.PI),
    seatAt(root, [0.55, 0, 0.95], Math.PI),
    seatAt(root, [1.42, 0, 0.1], -HP),
    seatAt(root, [-1.42, 0, 0.1], HP),
  ];

  let t = 0;
  let spin = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(0.6, 0.62, -0.42),
    seats,
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      spin += ((on ? (k.eat !== undefined ? 11 : 6) : 0) - spin) * Math.min(1, dt * 2);
      drum.root.rotation.y += spin * dt;
      // the cloud breathes as it spins, the sticks sway only while the cart is alive
      const live = spin / 6;
      const breathe = 1 + 0.03 * Math.sin(t * 4) * live;
      drum.root.scale.set(breathe, 1, breathe);
      rack.root.rotation.z = Math.sin(t * 1.7) * 0.022 * live;
      const key = on ? 'on' + Math.round(k.night * 10) : 'off';
      if (key === last) return;
      last = key;
      if (on) setGlow(ringMat, C_RING, 0.7 + 0.6 * k.night);
      else setGlow(ringMat, C_OFF, 0);
      glow.mesh.visible = on;
      glow.mat.opacity = 0.04 + 0.36 * k.night;
    },
  };
}
