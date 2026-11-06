/**
 * The popcorn machine: a coral-and-cream striped cart on two big spoked wheels and two short legs,
 * a mustard rim, a little shelf in front with two striped paper cups; on it a glass box with steel
 * corners, heaped with popcorn, a steel pot hanging inside; over it a striped roof with a scalloped
 * edge and a mustard knob. While it works the box glows warm, the pot rocks and kernels jump out of
 * it and fall on the heap, faster while the party eats. Four seats on the ground round it, the
 * cat's last. Origin at the floor centre of the 1×1, front towards +Z; no lights, a pool at night.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { C_OFF, CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL, STEEL_DARK, TAU, powerBulb, setGlow } from './buildingParts';
import type { V3 } from './parts/kit';
import { Build, HP, finishShadows, fx, mergeCached, place, pool, tint } from './villages';

const MUSTARD_DARK = '#c98f1c';
const GLASS = '#dff4f6';
const CORN = '#fff0c4';
const CORN_DEEP = '#f6d27a';
const C_INSIDE = new THREE.Color('#ffd98a');

/** The cart's body and the glass box on it. */
const CART_W = 0.8;
const CART_D = 0.7;
const CART_Y0 = 0.24;
const CART_Y1 = 0.86;
const BOX_Y0 = 0.92;
const BOX_Y1 = 1.56;
const BOX_W = 0.72;
const BOX_D = 0.6;
const POT_Y = 1.4;
const WHEEL_R = 0.26;
const KERNELS = 12;

/** A seat on the ground: its position is the sitting surface, facing its local +Z (yaw `ry`). */
function seatAt(parent: THREE.Object3D, at: V3, ry: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

/** A small rough lump of popped corn, about 0.1 across. */
function kernelGeo(): THREE.BufferGeometry {
  return mergeCached('popcorn/kernel', [
    tint(place(new THREE.IcosahedronGeometry(0.042, 0), [0, 0, 0]), CORN),
    tint(place(new THREE.IcosahedronGeometry(0.032, 0), [0.03, 0.018, 0.01]), CORN),
    tint(place(new THREE.IcosahedronGeometry(0.028, 0), [-0.024, 0.024, -0.012]), CORN_DEEP),
  ], true);
}

export function createPopcorn(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'popcorn';
  const b = new Build(skin, 'popcorn');
  root.add(b.root);

  // the cart's body in stripes all round, a dark foot band, a mustard rim
  const H = CART_Y1 - CART_Y0;
  const Y = (CART_Y0 + CART_Y1) / 2;
  const stripes = (n: number, span: number, put: (at: number, w: number, c: string) => void): void => {
    for (let i = 0; i < n; i++) put(-span / 2 + (i + 0.5) * (span / n), span / n, i % 2 ? CREAM : CORAL);
  };
  stripes(7, CART_W, (x, w, c) => {
    b.box([w, H, CART_D], [x, Y, 0], c);
  });
  stripes(7, CART_D - 0.02, (z, w, c) => {
    b.box([CART_W + 0.01, H, w], [0, Y, z], c);
  });
  b.box([CART_W + 0.03, 0.06, CART_D + 0.03], [0, CART_Y0 + 0.03, 0], CORAL_DARK);
  b.box([CART_W + 0.08, 0.06, CART_D + 0.08], [0, CART_Y1 + 0.03, 0], MUSTARD);

  // two short legs at the back, the axle, the shelf in front with two paper cups
  for (const s of [-1, 1]) b.box([0.09, CART_Y0, 0.09], [s * 0.3, CART_Y0 / 2, -0.28], STEEL_DARK);
  b.box([CART_W + 0.06, 0.05, 0.05], [0, WHEEL_R, 0.06], STEEL_DARK);
  b.box([0.5, 0.04, 0.13], [-0.1, 0.62, CART_D / 2 + 0.06], MUSTARD);
  for (const x of [-0.24, -0.02]) {
    const cup = 0.2;
    b.cyl(0.05, cup, [x, 0.64 + cup / 2, CART_D / 2 + 0.06], CREAM, { r1: 0.066, seg: 8 });
    b.cyl(0.053, cup * 0.34, [x, 0.64 + cup * 0.2, CART_D / 2 + 0.06], CORAL, { r1: 0.056, seg: 8 });
    b.cyl(0.06, cup * 0.26, [x, 0.64 + cup * 0.66, CART_D / 2 + 0.06], CORAL, { r1: 0.063, seg: 8 });
    for (const [dx, dy, dz] of [[-0.03, 0, 0], [0.03, 0.005, 0.01], [0, 0.03, -0.01]] as const) {
      b.geo(new THREE.IcosahedronGeometry(0.04, 0), [x + dx, 0.64 + cup + 0.01 + dy, CART_D / 2 + 0.06 + dz], CORN);
    }
  }

  // a little junction box at the back the wire hangs from
  b.box([0.2, 0.22, 0.06], [0.2, 0.6, -CART_D / 2 - 0.03], CHARCOAL);
  b.box([0.22, 0.04, 0.08], [0.2, 0.72, -CART_D / 2 - 0.03], MUSTARD);

  // the glass box: a floor, steel corners, a top
  const floorY = CART_Y1 + 0.06;
  b.box([BOX_W, 0.02, BOX_D], [0, floorY + 0.01, 0], MUSTARD_DARK);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box([0.05, BOX_Y1 - BOX_Y0, 0.05], [(sx * BOX_W) / 2, (BOX_Y0 + BOX_Y1) / 2, (sz * BOX_D) / 2], STEEL);
  }
  // the heap: low in front, high at the back
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 46; i++) {
    const x = (rnd() - 0.5) * (BOX_W - 0.14);
    const z = (rnd() - 0.5) * (BOX_D - 0.14);
    const height = 0.08 + 0.14 * (0.5 - z / (BOX_D - 0.14)) * (1 - Math.abs(x) * 1.4);
    const y = floorY + 0.05 + rnd() * height;
    b.geo(new THREE.IcosahedronGeometry(0.055 + rnd() * 0.03, 0), [x, y, z], i % 4 === 0 ? CORN_DEEP : CORN, { rot: [rnd() * 3, rnd() * 3, 0] });
  }

  // the roof: eaves, three stepped striped layers, a scalloped edge, a knob
  const RY = BOX_Y1;
  b.box([BOX_W + 0.2, 0.06, BOX_D + 0.2], [0, RY + 0.03, 0], MUSTARD);
  // the same seven stripes run up every step, each step two narrower
  const band = (BOX_W + 0.14) / 7;
  [BOX_D + 0.14, BOX_D - 0.08, BOX_D - 0.3].forEach((d, layer) => {
    for (let i = layer; i < 7 - layer; i++) {
      b.box([band, 0.09, d], [(i - 3) * band, RY + 0.1 + layer * 0.09, 0], i % 2 ? CREAM : CORAL);
    }
  });
  const edgeW = BOX_W + 0.2;
  const edgeD = BOX_D + 0.2;
  for (let i = 0; i < 8; i++) {
    const c = i % 2 ? CREAM : CORAL;
    const x = -edgeW / 2 + (i + 0.5) * (edgeW / 8);
    for (const s of [-1, 1]) b.box([edgeW / 8 - 0.015, 0.07, 0.02], [x, RY - 0.025, (s * edgeD) / 2], c);
  }
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? CREAM : CORAL;
    const z = -edgeD / 2 + (i + 0.5) * (edgeD / 6);
    for (const s of [-1, 1]) b.box([0.02, 0.07, edgeD / 6 - 0.015], [(s * edgeW) / 2, RY - 0.025, z], c);
  }
  b.ball(0.07, [0, RY + 0.3, 0], MUSTARD);

  // the warm light along the inside of the top
  const insideMat = b.glowBox('inside', '#ffd98a', [BOX_W - 0.08, 0.025, BOX_D - 0.08], [0, BOX_Y1 - 0.02, 0]).finish().inside;
  setGlow(insideMat, C_OFF, 0);

  // the wheels: a dark tyre, a mustard rim, chunky cream spokes
  for (const s of [-1, 1]) {
    const w = new Build(skin, 'popcorn-wheel');
    w.root.position.set(s * (CART_W / 2 + 0.05), WHEEL_R, 0.06);
    const side = { rot: [0, 0, HP] as const, seg: 20 };
    w.geo(new THREE.TorusGeometry(WHEEL_R - 0.04, 0.04, 6, 22), [0, 0, 0], CHARCOAL, { rot: [0, HP, 0] });
    w.geo(new THREE.TorusGeometry(WHEEL_R - 0.075, 0.02, 6, 22), [0, 0, 0], MUSTARD, { rot: [0, HP, 0] });
    w.cyl(0.055, 0.09, [0, 0, 0], CORAL, { ...side, seg: 10 });
    for (let i = 0; i < 3; i++) w.box([0.03, 2 * (WHEEL_R - 0.07), 0.035], [0, 0, 0], CREAM, [(i / 3) * Math.PI, 0, 0]);
    w.finish();
    root.add(w.root);
  }

  // the pot hanging inside: it rocks while it works
  const pot = new Build(skin, 'popcorn-pot');
  pot.root.position.set(0, BOX_Y1 - 0.02, 0.05);
  pot.box([0.03, 0.1, 0.03], [0, -0.05, 0], STEEL_DARK);
  pot.cyl(0.11, 0.1, [0, POT_Y - BOX_Y1 - 0.03, 0], STEEL, { r1: 0.14, seg: 14 });
  pot.cyl(0.145, 0.02, [0, POT_Y - BOX_Y1 + 0.03, 0], MUSTARD, { seg: 14 });
  pot.box([0.38, 0.025, 0.04], [0, POT_Y - BOX_Y1 + 0.02, 0], STEEL_DARK);
  pot.finish();
  root.add(pot.root);

  // the kernels, one instanced draw: only while it works
  const kernels = new THREE.InstancedMesh(kernelGeo(), b.kit.vertexColourMaterial(false), KERNELS);
  kernels.frustumCulled = false;
  kernels.visible = false;
  root.add(fx(kernels));
  const jumpX = new Float32Array(KERNELS);
  const jumpZ = new Float32Array(KERNELS);
  for (let i = 0; i < KERNELS; i++) {
    const a = (i / KERNELS) * TAU * 3.7;
    jumpX[i] = Math.sin(a) * (0.16 + (i % 3) * 0.05);
    jumpZ[i] = Math.cos(a) * (0.1 + (i % 2) * 0.05);
  }

  // the glass, in one see-through box
  const glassMat = (skin.partMaterial(GLASS, { transparent: true }) as THREE.MeshStandardMaterial).clone();
  glassMat.userData.own = true;
  glassMat.opacity = 0.15;
  glassMat.depthWrite = false;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_Y1 - BOX_Y0, BOX_D), glassMat);
  glass.position.y = (BOX_Y0 + BOX_Y1) / 2;
  root.add(glass);

  const glow = pool(0xffd98a, 1.4, [0, 0.04, 0.6]);
  root.add(glow.mesh);

  const bulb = powerBulb(skin, root, [0.27, 0.68, CART_D / 2]);
  finishShadows(root);
  const seats = [
    seatAt(root, [-0.95, 0, 0.1], HP),
    seatAt(root, [0.95, 0, 0.1], -HP),
    seatAt(root, [0, 0, 0.98], Math.PI),
    seatAt(root, [0, 0, -0.95], 0),
  ];

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  let t = 0;
  let pace = 0;
  let popped = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(0.2, 0.62, -CART_D / 2 - 0.06),
    seats,
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      pace += ((on ? (k.eat !== undefined ? 1.8 : 1) : 0) - pace) * Math.min(1, dt * 3);
      popped += dt * pace;
      pot.root.rotation.z = Math.sin(t * 5) * 0.14 * pace;
      const key = on ? 'on' + Math.round(k.night * 10) : 'off';
      if (key !== last) {
        last = key;
        if (on) setGlow(insideMat, C_INSIDE, 0.7 + 0.5 * k.night);
        else setGlow(insideMat, C_OFF, 0);
        glow.mesh.visible = on;
        glow.mat.opacity = 0.05 + 0.4 * k.night;
      }
      kernels.visible = pace > 0.05;
      if (!kernels.visible) return;
      for (let i = 0; i < KERNELS; i++) {
        // out of the pot, up, and down on the heap
        const u = (popped * 0.95 + i / KERNELS) % 1;
        const y = POT_Y + 0.04 + 0.42 * u - 0.82 * u * u;
        pos.set(jumpX[i] * (0.35 + u), y, 0.05 + jumpZ[i] * (0.35 + u));
        q.setFromEuler(e.set(u * 7 + i, u * 5, 0));
        kernels.setMatrixAt(i, m4.compose(pos, q, one));
      }
      kernels.instanceMatrix.needsUpdate = true;
    },
  };
}
