/**
 * The Ferris wheel: two coral twelve-sided rims joined by a mustard hub, cream spokes with a round
 * bulb on each, standing on two teal A-frames over a thin mint boarding mat. Six open tubs in six
 * toy colours hang between the rims on long arms and stay level (open, so a hero inside stays in
 * sight from the steep camera), the lowest one just off the ground. Fed, the wheel turns slowly and
 * the tubs sway a little; at dusk the spoke bulbs chase round in warm colours with soft halos and a
 * warm pool below. A small charcoal booth in the corner carries the power bulb and the wire. Origin
 * at the floor centre of the 5×3 footprint, front towards +Z; glows are own or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL, glowMaterial, powerBulb } from './buildingParts';
import { Build, HP, finishShadows, fx, mergeCached, place, pool, tint } from './villages';

/** The wheel's centre, its rim's radius, where the two rims and the A-frames stand along z. */
const AXLE_Y = 3.41;
const RIM_R = 1.95;
const RIM_Z = 0.56;
const FRAME_Z = 0.8;
/** The rim's corners (and spokes), the tubs, and how far a tub's floor hangs under its pin. */
const CORNERS = 12;
const TUBS = 6;
const HANG = 1.3;
/** A seat stands this far over the tub's floor (a rider's feet go 0.4 below it). */
const SEAT_UP = 0.42;
const BULB_R = 1.5;
/** Radians a second; the angle it starts at leaves a tub at the bottom once a still picture is taken. */
const RATE = 0.22;
const START = 0.7;

const TUB_COLOURS = [CORAL, MUSTARD, '#2f7fd6', MINT, '#ee6a82', '#3fa142'].map((c) => new THREE.Color(c));
const LIGHTS = ['#ffd23a', '#ff9a3c', '#ffd98a', '#ff6a4a', '#7fe0c8', '#ffe3a3'].map((c) => new THREE.Color(c));
const DULL = new THREE.Color('#a8926a');
const FRONT_AXIS = new THREE.Vector3(0, 0, 1);

const bulbGeo = new THREE.SphereGeometry(0.085, 10, 8);
const haloGeo = new THREE.SphereGeometry(0.17, 8, 6);

const rimPoint = (i: number, r: number, z: number): [number, number, number] => {
  const a = -HP + (i * TAU) / CORNERS;
  return [Math.cos(a) * r, Math.sin(a) * r, z];
};

/** One tub, its pin at the origin: greys and white, so each instance's colour paints it. */
function tubGeometry(): THREE.BufferGeometry {
  const f = -HANG;
  const part = (size: [number, number, number], at: [number, number, number], hex: string): THREE.BufferGeometry =>
    tint(place(new THREE.BoxGeometry(...size), at), hex);
  const parts = [part([0.96, 0.06, 0.84], [0, f + 0.03, 0], '#a8a8a8')];
  for (const s of [-1, 1]) {
    parts.push(part([0.07, 0.5, 0.84], [s * 0.445, f + 0.28, 0], '#dcdcdc'));
    parts.push(part([0.96, 0.5, 0.07], [0, f + 0.28, s * 0.385], '#dcdcdc'));
    parts.push(part([0.11, 0.07, 0.9], [s * 0.45, f + 0.55, 0], '#ffffff'));
    parts.push(part([1.0, 0.07, 0.11], [0, f + 0.55, s * 0.39], '#ffffff'));
    // the arm up from the rim to the pin
    parts.push(part([0.06, HANG - 0.5, 0.05], [0, -(HANG - 0.5) / 2, s * 0.44], '#8c8c8c'));
    parts.push(tint(place(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10), [0, 0, s * 0.45], { rot: [HP, 0, 0] }), '#ffffff'));
  }
  return mergeCached('ferriswheel/tub', parts);
}

export function createFerriswheel(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'ferriswheel';

  // what stands still: the mat, the A-frames, the axle, the booth
  const b = new Build(skin, 'ferriswheel');
  root.add(b.root);
  b.box([1.5, 0.05, 1.1], [0, 0.025, 0.3], MINT);
  b.box([1.3, 0.06, 0.16], [0, 0.03, 0.9], CREAM);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      b.beam([sx * 1.75, 0.06, sz * 1.2], [0, AXLE_Y, sz * FRAME_Z], 0.2, TEAL);
      b.box([0.44, 0.1, 0.42], [sx * 1.75, 0.05, sz * 1.2], CORAL);
    }
    b.box([1.86, 0.12, 0.13], [0, 1.45, sz * 0.99], MINT);
    b.box([0.9, 0.1, 0.12], [0, 2.45, sz * 0.88], MINT);
    b.cyl(0.24, 0.16, [0, AXLE_Y, sz * (FRAME_Z + 0.03)], MUSTARD, { rot: [HP, 0, 0], seg: 12 });
    b.cyl(0.12, 0.05, [0, AXLE_Y, sz * (FRAME_Z + 0.13)], CORAL_DARK, { rot: [HP, 0, 0], seg: 10 });
  }
  for (const sx of [-1, 1]) b.box([0.14, 0.08, 2.4], [sx * 1.75, 0.04, 0], CORAL_DARK);
  b.cyl(0.1, 1.7, [0, AXLE_Y, 0], STEEL, { rot: [HP, 0, 0], seg: 10 });
  b.box([0.42, 0.62, 0.5], [-2.2, 0.31, 1.2], CHARCOAL);
  b.box([0.5, 0.07, 0.58], [-2.2, 0.655, 1.2], MUSTARD);
  b.box([0.3, 0.14, 0.03], [-2.2, 0.58, 1.46], STEEL_DARK);
  b.finish();

  // what turns: the two rims, spokes and the hub
  const w = new Build(skin, 'ferriswheel-wheel');
  w.root.position.y = AXLE_Y;
  root.add(w.root);
  for (const z of [-RIM_Z, RIM_Z]) {
    for (let i = 0; i < CORNERS; i++) {
      w.beam(rimPoint(i, RIM_R, z), rimPoint(i + 1, RIM_R, z), 0.13, CORAL);
      w.beam(rimPoint(i, 1.02, z), rimPoint(i + 1, 1.02, z), 0.06, MINT);
      w.beam(rimPoint(i, 0.2, z), rimPoint(i, RIM_R, z), 0.07, CREAM);
      const big = i % 2 === 0;
      w.box(big ? [0.2, 0.2, 0.16] : [0.15, 0.15, 0.15], rimPoint(i, RIM_R, z), big ? MUSTARD : CORAL_DARK);
    }
    w.cyl(0.3, 0.1, [0, 0, z], MUSTARD, { rot: [HP, 0, 0], seg: 12 });
    w.cyl(0.16, 0.06, [0, 0, z + Math.sign(z) * 0.07], CORAL, { rot: [HP, 0, 0], seg: 10 });
  }
  w.cyl(0.2, RIM_Z * 2, [0, 0, 0], CORAL_DARK, { rot: [HP, 0, 0], seg: 12 });
  w.finish();

  // the bulbs on the spokes of both rims (round, unlit material), halos on the front ones
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  bulbMat.userData.own = true;
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, CORNERS * 2);
  const haloMat = glowMaterial(0xffffff);
  const halos = fx(new THREE.InstancedMesh(haloGeo, haloMat, CORNERS));
  halos.visible = false;
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < CORNERS; i++) {
    const [x, y] = rimPoint(i, BULB_R, 0);
    bulbs.setMatrixAt(i, m4.makeTranslation(x, y, RIM_Z + 0.07));
    bulbs.setMatrixAt(i + CORNERS, m4.makeTranslation(x, y, -RIM_Z - 0.07));
    halos.setMatrixAt(i, m4.makeTranslation(x, y, RIM_Z + 0.07));
    bulbs.setColorAt(i, DULL);
    bulbs.setColorAt(i + CORNERS, DULL);
    halos.setColorAt(i, DULL);
  }
  w.root.add(bulbs, halos);

  // the tubs: one instanced draw, each kept level by hand; a seat over every floor
  const tubs = new THREE.InstancedMesh(tubGeometry(), w.kit.vertexColourMaterial(false), TUBS);
  tubs.frustumCulled = false;
  tubs.castShadow = true;
  TUB_COLOURS.forEach((c, i) => tubs.setColorAt(i, c));
  root.add(tubs);
  const seats: THREE.Object3D[] = [];
  for (let i = 0; i < TUBS; i++) {
    const s = new THREE.Object3D();
    s.name = 'seat';
    s.userData.face = 0;
    root.add(s);
    seats.push(s);
  }

  const glow = pool(0xffd98a, 3.2, [0, 0.06, 0.3]);
  root.add(glow.mesh);
  const bulb = powerBulb(skin, root, [-2.2, 0.36, 1.45]);
  finishShadows(root);
  bulbs.receiveShadow = false;

  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  const place6 = (turn: number, sway: number, t: number): void => {
    for (let i = 0; i < TUBS; i++) {
      const a = -HP + (i * TAU) / TUBS + turn;
      const lean = sway * Math.sin(t * 1.3 + i * 1.9);
      pos.set(Math.cos(a) * RIM_R, AXLE_Y + Math.sin(a) * RIM_R, 0);
      tubs.setMatrixAt(i, m4.compose(pos, q.setFromAxisAngle(FRONT_AXIS, lean), one));
      const down = HANG - SEAT_UP;
      seats[i].position.set(pos.x + Math.sin(lean) * down, pos.y - Math.cos(lean) * down, 0);
    }
    tubs.instanceMatrix.needsUpdate = true;
  };

  let t = 0;
  let rate = 0;
  let turn = START;
  let key = -1;
  w.root.rotation.z = turn;
  place6(turn, 0, 0);
  return {
    root,
    seats,
    socket: new THREE.Vector3(-2.2, 0.7, 1.2),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      rate += ((on ? RATE : 0) - rate) * Math.min(1, dt * 1.5);
      if (rate > 1e-4) {
        turn = (turn - rate * dt) % TAU;
        w.root.rotation.z = turn;
        place6(turn, (0.05 * rate) / RATE, t);
      }
      // the spoke bulbs: warm colours walking round from dusk on
      const x = Math.min(1, Math.max(0, (k.night - 0.08) / 0.4));
      const lit = on ? x * x * (3 - 2 * x) : 0;
      const step = Math.floor(t * 2.5);
      const now = lit > 0.01 ? (step % LIGHTS.length) * 100 + Math.round(lit * 40) : 0;
      if (now === key) return;
      key = now;
      halos.visible = glow.mesh.visible = lit > 0.01;
      haloMat.opacity = 0.2 * lit;
      glow.mat.opacity = 0.32 * lit;
      for (let i = 0; i < CORNERS; i++) {
        col.copy(DULL).lerp(LIGHTS[(i + step) % LIGHTS.length], lit);
        bulbs.setColorAt(i, col);
        bulbs.setColorAt(i + CORNERS, col);
        halos.setColorAt(i, col);
      }
      bulbs.instanceColor!.needsUpdate = true;
      halos.instanceColor!.needsUpdate = true;
    },
  };
}
