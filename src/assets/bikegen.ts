/**
 * The bike generator: a charcoal plate with two toys on it. In the left cell a fat copper dynamo drum
 * lies in a teal cradle, a mustard cross turning on its front and a little round bulb on top that
 * brightens as the hero pedals. In the right cell a small coral bike stands on a steel stand, facing
 * the drum, a mustard wire running along the plate from its back wheel. While `k.busy`, the pedals,
 * the chain, the back wheel and the cross turn. Origin at the floor centre of the 2×1 footprint, front
 * towards +Z; glows are own emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL, STEEL_DARK, TEAL, C_WARM_SOFT, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, halo } from './villages';

const COPPER = '#c87533';
const COPPER_DARK = '#9a5424';
const GLASS = '#fff1c8';
const C_GLASS = new THREE.Color('#e9dcb8');

/** The dynamo's axle, the crank, the back wheel's hub, the front wheel's hub. */
const DRUM: readonly [number, number] = [-0.5, 0.56];
const CRANK: readonly [number, number] = [0.46, 0.3];
const REAR: readonly [number, number] = [0.73, 0.36];
const FRONT: readonly [number, number] = [0.22, 0.3];
const CHAIN_Z = 0.075;
const LINKS = 6;

/** A toy wheel lying in the XY plane: a charcoal tyre, a mustard rim, three cream spokes through the hub. */
function wheel(b: Build, r: number, x: number, y: number): void {
  b.geo(new THREE.TorusGeometry(r - 0.035, 0.04, 6, 22), [x, y, 0], CHARCOAL);
  b.geo(new THREE.TorusGeometry(r - 0.085, 0.018, 5, 22), [x, y, 0], MUSTARD);
  for (let i = 0; i < 3; i++) b.box([0.026, 2 * (r - 0.09), 0.026], [x, y, 0], CREAM, [0, 0, (i * Math.PI) / 3]);
  b.cyl(0.045, 0.12, [x, y, 0], STEEL_DARK, { rot: [HP, 0, 0], seg: 10 });
}

export function createBikegen(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'bikegen';
  const b = new Build(skin, 'bikegen');
  root.add(b.root);

  b.box([1.92, 0.08, 0.86], [0, 0.04, 0], CHARCOAL);

  // the dynamo: a cradle, two teal cheeks, a copper drum with darker windings
  const [dx, dy] = DRUM;
  b.box([0.84, 0.2, 0.74], [dx, 0.18, 0], STEEL_DARK);
  b.box([0.88, 0.05, 0.78], [dx, 0.3, 0], MUSTARD);
  b.cyl(0.36, 0.5, [dx, dy, 0], COPPER, { rot: [HP, 0, 0], seg: 22 });
  for (const z of [-0.13, 0, 0.13]) b.cyl(0.375, 0.05, [dx, dy, z], COPPER_DARK, { rot: [HP, 0, 0], seg: 22 });
  for (const s of [-1, 1]) b.cyl(0.4, 0.06, [dx, dy, s * 0.27], TEAL, { rot: [HP, 0, 0], seg: 22 });
  // the collar the little bulb screws into, the bulb itself
  b.cyl(0.08, 0.12, [dx, 0.97, 0], STEEL_DARK, { seg: 10 });
  b.glowBall('lamp', GLASS, 0.11, [dx, 1.13, 0]);
  // the knob the network's wire hangs from
  b.box([0.12, 0.12, 0.12], [dx, 0.93, -0.2], MUSTARD);

  // the bike's stand: an A of steel round the back axle, a coral block under the front wheel
  const [rx, ry] = REAR;
  for (const s of [-1, 1]) {
    b.beam([rx, ry, s * 0.1], [rx - 0.14, 0.09, s * 0.22], 0.05, STEEL);
    b.beam([rx, ry, s * 0.1], [rx + 0.14, 0.09, s * 0.22], 0.05, STEEL);
    b.box([0.4, 0.04, 0.07], [rx, 0.1, s * 0.22], STEEL_DARK);
  }
  b.box([0.04, 0.04, 0.24], [rx, ry, 0], STEEL_DARK);
  const [fx, fy] = FRONT;
  b.box([0.28, 0.05, 0.16], [fx, 0.1, 0], CORAL_DARK);
  wheel(b, 0.2, fx, fy);

  // the frame, the fork, the handlebars and the saddle
  const [cx, cy] = CRANK;
  b.beam([cx, cy, 0], [0.52, 0.57, 0], 0.055, CORAL);
  b.beam([cx, cy, 0], [0.26, 0.6, 0], 0.055, CORAL);
  b.beam([0.52, 0.5, 0], [0.26, 0.62, 0], 0.055, CORAL);
  b.beam([cx, cy, 0], [rx, ry, 0], 0.045, CORAL);
  b.beam([0.52, 0.52, 0], [rx, ry, 0], 0.045, CORAL);
  for (const s of [-1, 1]) b.beam([fx, fy, s * 0.06], [0.25, 0.62, s * 0.03], 0.035, STEEL);
  b.beam([0.25, 0.6, 0], [0.22, 0.84, 0], 0.05, STEEL);
  b.box([0.06, 0.05, 0.46], [0.22, 0.85, 0], STEEL_DARK);
  for (const s of [-1, 1]) b.box([0.08, 0.07, 0.11], [0.22, 0.85, s * 0.21], CREAM);
  b.box([0.26, 0.05, 0.16], [0.54, 0.6, 0], MUSTARD);
  b.box([0.14, 0.04, 0.08], [0.38, 0.6, 0], MUSTARD);

  // the chain's two runs; the links that travel along them are their own draw
  const top: [number, number, number, number] = [rx, ry + 0.06, cx, cy + 0.09];
  const low: [number, number, number, number] = [cx, cy - 0.09, rx, ry - 0.06];
  b.beam([top[0], top[1], CHAIN_Z], [top[2], top[3], CHAIN_Z], 0.016, CHARCOAL);
  b.beam([low[0], low[1], CHAIN_Z], [low[2], low[3], CHAIN_Z], 0.016, CHARCOAL);

  // the wire from the back wheel, along the plate, into the drum's cheek
  const wire = new THREE.CatmullRomCurve3(
    [[0.78, 0.36, 0.1], [0.92, 0.16, 0.28], [0.6, 0.1, 0.36], [0.2, 0.1, 0.36], [-0.04, 0.14, 0.34], [-0.12, 0.34, 0.28]].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  b.geo(new THREE.TubeGeometry(wire, 28, 0.022, 5), [0, 0, 0], MUSTARD);

  // the turning bits: the cross on the drum, the back wheel, the crank with its pedals
  const rotor = new Build(skin, 'bikegen-rotor');
  rotor.root.position.set(dx, dy, 0.31);
  for (const r of [0, HP]) rotor.box([0.6, 0.09, 0.04], [0, 0, 0], MUSTARD, [0, 0, r]);
  rotor.cyl(0.08, 0.06, [0, 0, 0.02], CORAL, { rot: [HP, 0, 0], seg: 12 });
  rotor.finish();
  b.root.add(rotor.root);

  const rear = new Build(skin, 'bikegen-wheel');
  rear.root.position.set(rx, ry, 0);
  wheel(rear, 0.24, 0, 0);
  rear.box([0.06, 0.08, 0.07], [0, 0.155, 0], CORAL);
  rear.cyl(0.06, 0.02, [0, 0, CHAIN_Z], STEEL_DARK, { rot: [HP, 0, 0], seg: 10 });
  rear.finish();
  b.root.add(rear.root);

  const crank = new Build(skin, 'bikegen-crank');
  crank.root.position.set(cx, cy, 0);
  crank.cyl(0.09, 0.024, [0, 0, CHAIN_Z], MUSTARD, { rot: [HP, 0, 0], seg: 12 });
  crank.box([0.03, 0.03, 0.28], [0, 0, 0], STEEL_DARK);
  crank.box([0.04, 0.13, 0.03], [0, 0.055, 0.125], STEEL);
  crank.box([0.04, 0.13, 0.03], [0, -0.055, -0.125], STEEL);
  crank.box([0.05, 0.05, 0.03], [0.05, 0, CHAIN_Z + 0.005], CORAL);
  const pedals: THREE.Object3D[] = [];
  [1, -1].forEach((s, i) => {
    const g = new THREE.Group();
    g.position.set(0, s * 0.11, s * 0.17);
    crank.root.add(g);
    const q = crank.part(i ? 'pedalB' : 'pedalA', g);
    q.box([0.11, 0.03, 0.09], [0, 0, 0], CHARCOAL);
    q.box([0.12, 0.012, 0.02], [0, 0.01, 0], MUSTARD);
    pedals.push(g);
  });
  crank.finish();
  b.root.add(crank.root);

  const mats = b.finish();
  const lampMat = mats.lamp;
  setGlow(lampMat, C_GLASS, 0);
  const glow = halo(0xffd98a, 0.34, [dx, 1.13, 0]);
  root.add(glow.mesh);

  const links = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.026, 0.024), skin.partMaterial(STEEL), LINKS);
  links.frustumCulled = false;
  root.add(links);

  const bulb = powerBulb(skin, b.root, [dx, 0.18, 0.37]);
  finishShadows(root);

  const m4 = new THREE.Matrix4();
  const placeLinks = (phase: number): void => {
    for (let i = 0; i < LINKS; i++) {
      const run = i < LINKS / 2 ? top : low;
      const f = (phase + (i % (LINKS / 2)) / (LINKS / 2)) % 1;
      links.setMatrixAt(i, m4.makeTranslation(run[0] + (run[2] - run[0]) * f, run[1] + (run[3] - run[1]) * f, CHAIN_Z));
    }
    links.instanceMatrix.needsUpdate = true;
  };
  placeLinks(0);

  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.set(0.5, 0.62, 0);
  seat.rotation.y = -HP;
  seat.userData.face = -HP;
  root.add(seat);

  let t = 0;
  let speed = 0;
  let chain = 0;
  let shown = -1;
  return {
    root,
    socket: new THREE.Vector3(dx, 0.98, -0.2),
    seats: [seat],
    update(dt, k) {
      t += dt;
      bulb.update(t, k.power);
      speed += ((k.busy ? 1 : 0) - speed) * Math.min(1, dt * 3);
      if (speed > 0.01) {
        // the rider faces −X: the wheels roll that way, anticlockwise seen from the front
        crank.root.rotation.z += dt * speed * 7;
        for (const p of pedals) p.rotation.z = -crank.root.rotation.z;
        rear.root.rotation.z += dt * speed * 13;
        rotor.root.rotation.z -= dt * speed * 15;
        chain = (chain + dt * speed * 2.4) % 1;
        placeLinks(chain);
      }
      const level = Math.round(speed * 12);
      if (level === shown) return;
      shown = level;
      const v = level / 12;
      if (v > 0) setGlow(lampMat, C_WARM_SOFT, 0.2 + 1.1 * v);
      else setGlow(lampMat, C_GLASS, 0);
      glow.mesh.visible = v > 0.05;
      glow.mat.opacity = 0.34 * v;
    },
  };
}
