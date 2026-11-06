/**
 * The toy train: a flat ring of track, a rounded square five blocks across (sand bed, wooden
 * sleepers, steel rails, all under 0.12 high so everyone walks over it), and at the back a tiny
 * station on a cream platform: a cream house with a teal door, warm windows, a plain clock, a coral
 * roof and little canopies. A coral engine with a mustard-banded boiler, chimney and cowcatcher pulls
 * three open wagons in mustard, blue and mint round and round while fed, faster with the party on
 * board, puffing small cream clouds. Its cab has a low open back and a hinged roof that folds away
 * while someone rides, so the hero stays in sight. The seats are the cab and the wagons. Origin at
 * the floor centre of the 7×7 footprint, front towards +Z; glows are own, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, INK, MINT, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL, WOOD, WOOD_DARK, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, fx, mergeCached, place, tint } from './villages';

/** The track's middle line: half the square, the corners' radius, a straight, a whole lap. */
const HALF = 2.5;
const CORNER = 1;
const STRAIGHT = 2 * (HALF - CORNER);
const SIDE = STRAIGHT + (CORNER * Math.PI) / 2;
const LAP = SIDE * 4;
const GAUGE = 0.22;
const RAIL_TOP = 0.12;

/** Blocks a second: running, and with the party on board. */
const RUN = 1.5;
const FAST = 2.8;
/** Where the engine starts, so a still picture taken a moment later shows the train along the front. */
const START = 3.4 - RUN * 3.2;
/** Each car's distance behind the engine. */
const BEHIND = [0, 1.2, 2.22, 3.24];
/** Height of the wagons' floor; a seat stands 0.4 over it. */
const FLOOR = 0.42;
const SEAT_Y = FLOOR + 0.4;
const CHIMNEY: readonly [number, number, number] = [0, 1.34, 0.46];
const ROOF_Y = 1.14;
const PUFFS = 6;

const BED = '#d9b676';
const BLUE = '#2f7fd6';
const WAGONS = [MUSTARD, BLUE, MINT];
const WAGON_RIMS = ['#c98f1c', '#1f56b0', TEAL];
const PUFF = '#fff1d8';
const C_LAMP = new THREE.Color('#ffe08a');
const C_WINDOW = new THREE.Color('#ffd98a');

interface At {
  x: number;
  z: number;
  yaw: number;
}

/** Where `s` blocks along the track is, and its heading (0 = +Z): first along the front towards +X, then up the right side, the back and the left. */
function along(s: number, o: At): At {
  const u = ((s % LAP) + LAP) % LAP;
  const side = Math.floor(u / SIDE);
  const w = u - side * SIDE;
  let x: number;
  let z: number;
  let dx: number;
  let dz: number;
  if (w < STRAIGHT) {
    x = w - STRAIGHT / 2;
    z = HALF;
    dx = 1;
    dz = 0;
  } else {
    const f = (w - STRAIGHT) / CORNER;
    x = STRAIGHT / 2 + CORNER * Math.sin(f);
    z = STRAIGHT / 2 + CORNER * Math.cos(f);
    dx = Math.cos(f);
    dz = -Math.sin(f);
  }
  for (let i = 0; i < side; i++) {
    const px = x;
    const pd = dx;
    x = z;
    z = -px;
    dx = dz;
    dz = -pd;
  }
  o.x = x;
  o.z = z;
  o.yaw = Math.atan2(dx, dz);
  return o;
}

const here: At = { x: 0, z: 0, yaw: 0 };

/** The bed, sleepers and rails, laid along the whole lap. */
function layTrack(b: Build): void {
  const bedStep = LAP / 80;
  for (let i = 0; i < 80; i++) {
    along((i + 0.5) * bedStep, here);
    b.box([0.82, 0.03, bedStep + 0.03], [here.x, 0.015, here.z], BED, [0, here.yaw, 0]);
  }
  const sleepers = 46;
  for (let i = 0; i < sleepers; i++) {
    along(((i + 0.5) * LAP) / sleepers, here);
    b.box([0.72, 0.05, 0.13], [here.x, 0.05, here.z], i % 2 ? WOOD : WOOD_DARK, [0, here.yaw, 0]);
  }
  const step = LAP / 64;
  for (let i = 0; i < 64; i++) {
    along((i + 0.5) * step, here);
    const sx = Math.cos(here.yaw) * GAUGE;
    const sz = -Math.sin(here.yaw) * GAUGE;
    for (const s of [-1, 1]) {
      b.box([0.06, 0.05, step + 0.05], [here.x + s * sx, RAIL_TOP - 0.025, here.z + s * sz], STEEL, [0, here.yaw, 0]);
    }
  }
}

/** The tiny station behind the track's back straight. */
function buildStation(b: Build): void {
  const z = -3.16;
  const front = -3.02;
  b.box([3.3, 0.12, 0.62], [0, 0.06, z], CREAM);
  b.box([3.3, 0.125, 0.08], [0, 0.0625, -2.89], MUSTARD);
  // the house
  b.box([1.24, 0.92, 0.42], [0, 0.58, -3.23], CREAM);
  b.box([1.28, 0.12, 0.46], [0, 0.18, -3.23], CORAL);
  b.box([0.3, 0.58, 0.03], [0, 0.41, front], TEAL);
  b.box([0.05, 0.05, 0.03], [0.09, 0.4, front + 0.02], MUSTARD);
  for (const s of [-1, 1]) {
    b.box([0.32, 0.34, 0.03], [s * 0.4, 0.74, front - 0.005], WOOD);
    b.glowBox('win', '#ffd98a', [0.24, 0.26, 0.02], [s * 0.4, 0.74, front + 0.008]);
  }
  // the roof in three steps, the clock under its ridge, the canopies to the sides
  b.box([1.56, 0.1, 0.66], [0, 1.09, -3.2], CORAL_DARK);
  b.box([1.28, 0.11, 0.52], [0, 1.19, -3.22], CORAL);
  b.box([0.86, 0.11, 0.36], [0, 1.3, -3.24], CORAL);
  b.box([0.42, 0.09, 0.2], [0, 1.4, -3.26], CORAL_DARK);
  b.cyl(0.13, 0.04, [0, 1.2, -2.95], CREAM, { rot: [HP, 0, 0], seg: 14 });
  b.box([0.025, 0.09, 0.012], [0, 1.24, -2.925], INK);
  b.box([0.07, 0.025, 0.012], [0.03, 1.2, -2.925], INK);
  for (const s of [-1, 1]) {
    b.box([0.54, 0.06, 0.5], [s * 1.34, 1.0, -3.12], TEAL);
    b.box([0.58, 0.03, 0.54], [s * 1.34, 1.04, -3.12], MINT);
    for (const x of [1.14, 1.56]) b.box([0.06, 0.86, 0.06], [s * x, 0.55, -3.0], STEEL_DARK);
  }
  // a bench on one side, a small post with a bell on the other
  b.box([0.5, 0.05, 0.16], [-1.34, 0.32, -3.28], WOOD);
  b.box([0.5, 0.16, 0.04], [-1.34, 0.42, -3.36], WOOD);
  for (const x of [-1.54, -1.14]) b.box([0.05, 0.2, 0.14], [x, 0.21, -3.28], WOOD_DARK);
  b.box([0.05, 0.56, 0.05], [1.34, 0.4, -3.28], STEEL_DARK);
  b.cyl(0.07, 0.1, [1.34, 0.68, -3.28], MUSTARD, { r1: 0.04, seg: 10 });
}

/** A wheel: its car, its spot on the car, its size against the wheel model. */
interface Wheel {
  car: number;
  x: number;
  y: number;
  z: number;
  s: number;
}

const WHEEL_R = 0.15;
const wheels: Wheel[] = [];
for (let car = 0; car < 4; car++) {
  const r = car === 0 ? 0.17 : 0.13;
  for (const z of car === 0 ? [0.3, -0.34] : [0.28, -0.28]) {
    for (const s of [-1, 1]) wheels.push({ car, x: s * GAUGE, y: RAIL_TOP + r, z, s: r / WHEEL_R });
  }
}

function wheelGeometry(): THREE.BufferGeometry {
  const axis = { rot: [0, 0, HP] as const, seg: 14 };
  const cyl = (r: number, h: number, hex: string): THREE.BufferGeometry =>
    tint(place(new THREE.CylinderGeometry(r, r, h, axis.seg), [0, 0, 0], { rot: axis.rot }), hex);
  return mergeCached(
    'toytrain/wheel',
    [
      cyl(WHEEL_R, 0.06, CHARCOAL),
      cyl(WHEEL_R * 0.62, 0.075, CORAL),
      tint(place(new THREE.BoxGeometry(0.085, WHEEL_R * 1.5, 0.04), [0, 0, 0]), CREAM),
    ],
    true,
  );
}

/** The coral engine, front towards +Z. */
function buildEngine(b: Build): void {
  const axis = { rot: [HP, 0, 0] as const, seg: 16 };
  b.box([0.5, 0.12, 1.3], [0, 0.34, 0], CHARCOAL);
  b.box([0.74, 0.04, 0.64], [0, FLOOR - 0.02, -0.34], WOOD_DARK);
  // the boiler, its bands, the dark front with the lamp
  b.cyl(0.27, 0.72, [0, 0.72, 0.32], CORAL, axis);
  for (const z of [0.1, 0.34, 0.58]) b.cyl(0.285, 0.05, [0, 0.72, z], MUSTARD, axis);
  b.cyl(0.25, 0.05, [0, 0.72, 0.7], CHARCOAL, axis);
  b.box([0.56, 0.1, 0.72], [0, 0.45, 0.32], CORAL_DARK);
  // the chimney, the dome, a little whistle
  b.cyl(0.085, 0.26, [0, 1.08, CHIMNEY[2]], CHARCOAL, { seg: 12 });
  b.cyl(0.09, 0.1, [0, 1.26, CHIMNEY[2]], MUSTARD, { r1: 0.15, seg: 12 });
  b.ball(0.12, [0, 1.0, 0.14], MUSTARD, { seg: 12 });
  // the cowcatcher in three steps
  b.box([0.56, 0.08, 0.1], [0, 0.33, 0.72], MUSTARD);
  b.box([0.46, 0.08, 0.1], [0, 0.25, 0.8], MUSTARD);
  b.box([0.36, 0.07, 0.1], [0, 0.18, 0.88], MUSTARD);
  // the cab: a front wall with a round window, sides with window gaps, a low back
  b.box([0.74, 0.7, 0.07], [0, 0.77, -0.02], CORAL);
  b.cyl(0.11, 0.08, [0, 0.86, -0.02], CREAM, axis);
  b.box([0.74, 0.08, 0.09], [0, ROOF_Y - 0.03, -0.02], CREAM);
  for (const s of [-1, 1]) {
    const x = s * 0.35;
    b.box([0.07, 0.34, 0.68], [x, FLOOR + 0.17, -0.34], CORAL);
    b.box([0.08, 0.05, 0.7], [x, FLOOR + 0.35, -0.34], MUSTARD);
    b.box([0.07, 0.34, 0.08], [x, FLOOR + 0.54, -0.64], CORAL);
    b.box([0.07, 0.34, 0.08], [x, FLOOR + 0.54, -0.04], CORAL);
    b.box([0.07, 0.04, 0.68], [x, ROOF_Y - 0.03, -0.34], CORAL);
  }
  b.box([0.74, 0.22, 0.07], [0, FLOOR + 0.11, -0.66], CORAL);
  b.box([0.22, 0.06, 0.12], [0, 0.36, -0.72], CHARCOAL);
  b.lens('lamp', '#ffe08a', 0.09, 0.05, [0, 0.8, 0.72], [0, 0, 1]);
}

/** An open wagon, front towards +Z. */
function buildWagon(b: Build, i: number): void {
  const c = WAGONS[i];
  const rim = WAGON_RIMS[i];
  b.box([0.46, 0.1, 0.84], [0, 0.34, 0], CHARCOAL);
  b.box([0.74, 0.04, 0.84], [0, FLOOR - 0.02, 0], rim);
  for (const s of [-1, 1]) {
    b.box([0.06, 0.36, 0.84], [s * 0.35, FLOOR + 0.18, 0], c);
    b.box([0.74, 0.36, 0.06], [0, FLOOR + 0.18, s * 0.42], c);
    b.box([0.1, 0.06, 0.9], [s * 0.35, FLOOR + 0.38, 0], rim);
    b.box([0.8, 0.06, 0.1], [0, FLOOR + 0.38, s * 0.42], rim);
    b.box([0.14, 0.06, 0.14], [0, 0.36, s * 0.48], CHARCOAL);
  }
  for (const s of [-1, 1]) b.box([0.02, 0.14, 0.22], [s * 0.385, FLOOR + 0.18, 0], CREAM);
}

export function createToytrain(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'toytrain';

  const b = new Build(skin, 'toytrain');
  root.add(b.root);
  layTrack(b);
  buildStation(b);
  const winMat = b.finish().win;

  // the cars: each its own group, moved along the track
  const engine = new Build(skin, 'toytrain-engine');
  buildEngine(engine);
  const roof = new THREE.Group();
  roof.position.set(0, ROOF_Y, -0.68);
  engine.root.add(roof);
  const rp = engine.part('roof', roof);
  rp.box([0.84, 0.06, 0.78], [0, 0.03, 0.34], CREAM);
  rp.box([0.7, 0.05, 0.64], [0, 0.085, 0.34], CORAL_DARK);
  const lampMat = engine.finish().lamp;
  const cars: THREE.Object3D[] = [engine.root];
  WAGONS.forEach((_, i) => {
    const w = new Build(skin, `toytrain-wagon${i}`);
    buildWagon(w, i);
    w.finish();
    cars.push(w.root);
  });
  root.add(...cars);

  const seats = cars.map((car, i) => {
    const s = new THREE.Object3D();
    s.name = 'seat';
    s.position.set(0, SEAT_Y, i === 0 ? -0.32 : 0);
    s.userData.face = 0;
    car.add(s);
    return s;
  });

  // all the wheels, one instanced draw
  const wheelMesh = new THREE.InstancedMesh(wheelGeometry(), b.kit.vertexColourMaterial(false), wheels.length);
  wheelMesh.frustumCulled = false;
  wheelMesh.castShadow = true;
  root.add(wheelMesh);

  // the engine's puffs: one instanced draw of soft balls, each left behind where it was born
  const puffMat = skin.partMaterial(PUFF, { transparent: true });
  const puffs = fx(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), puffMat, PUFFS));
  puffs.frustumCulled = false;
  root.add(puffs);
  const born = new Float32Array(PUFFS * 3);
  const age = new Float32Array(PUFFS).map((_, i) => i / PUFFS);

  const bulb = powerBulb(skin, root, [0.34, 0.36, -3.02]);
  finishShadows(root);
  wheelMesh.receiveShadow = false;

  const m4 = new THREE.Matrix4();
  const size = new THREE.Vector3();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const moveTrain = (s: number): void => {
    for (let i = 0; i < cars.length; i++) {
      along(s - BEHIND[i], here);
      const car = cars[i];
      car.position.set(here.x, 0, here.z);
      car.rotation.y = here.yaw;
      car.updateMatrix();
      seats[i].userData.face = here.yaw;
    }
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      m4.makeRotationX(s / (WHEEL_R * w.s));
      m4.scale(size.setScalar(w.s));
      m4.setPosition(w.x, w.y, w.z);
      wheelMesh.setMatrixAt(i, m4.premultiply(cars[w.car].matrix));
    }
    wheelMesh.instanceMatrix.needsUpdate = true;
  };

  let t = 0;
  let s = START;
  let speed = 0;
  let open = 0;
  let last = '';
  moveTrain(s);
  return {
    root,
    seats,
    socket: new THREE.Vector3(0.9, 0.9, -3.3),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      speed += ((on ? (k.busy ? FAST : RUN) : 0) - speed) * Math.min(1, dt * 1.4);
      if (speed > 0.002) {
        s = (s + speed * dt) % LAP;
        moveTrain(s);
      }

      // the cab's roof folds back over the rear while someone rides
      open += ((k.busy ? 1 : 0) - open) * Math.min(1, dt * 5);
      roof.rotation.x = -1.7 * open;

      // the puffs drift up from where the chimney was, swell and shrink away
      puffs.visible = on;
      if (on) {
        const sinY = Math.sin(engine.root.rotation.y);
        const cosY = Math.cos(engine.root.rotation.y);
        for (let i = 0; i < PUFFS; i++) {
          age[i] += Math.min(dt, 0.1) * (0.5 + speed * 0.22);
          if (age[i] >= 1) {
            age[i] -= 1;
            born[i * 3] = engine.root.position.x + sinY * CHIMNEY[2];
            born[i * 3 + 1] = CHIMNEY[1];
            born[i * 3 + 2] = engine.root.position.z + cosY * CHIMNEY[2];
          }
          const a = age[i];
          const r = 0.09 + 0.12 * Math.sin(Math.min(1, a * 1.15) * Math.PI);
          v.set(born[i * 3] + 0.1 * Math.sin(a * TAU + i), born[i * 3 + 1] + a * 0.9, born[i * 3 + 2]);
          puffs.setMatrixAt(i, m4.compose(v, q.identity(), size.setScalar(born[i * 3 + 1] ? r : 0)));
        }
        puffs.instanceMatrix.needsUpdate = true;
      }

      const key = (on ? 'on' : 'off') + Math.round(k.night * 10);
      if (key === last) return;
      last = key;
      const glow = on ? 0.3 + 0.7 * k.night : 0;
      setGlow(lampMat, C_LAMP, glow);
      setGlow(winMat, C_WINDOW, on ? 0.2 + 0.8 * k.night : 0);
    },
  };
}
