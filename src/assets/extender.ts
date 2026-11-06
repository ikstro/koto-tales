/**
 * The super extender: a slim teal mast three blocks tall with a big cable drum at its foot, cream
 * flanges round fat coral coils. The coral cable climbs the mast through a little junction box
 * (the power bulb is on it) and runs out along a long mustard arm, where it hangs down with a big
 * toy plug on the end, well above a hero's head. While it works the plug sways and warm sparks run up
 * the cable. Origin at the floor centre of the 1×1 footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, TEAL, powerBulb } from './buildingParts';
import { Build, HP, finishShadows } from './villages';

const MAST_Z = -0.22;
const ARM_Y = 2.72;
const ARM_END = 0.92;
const DRUM_Y = 0.52;
const DRUM_Z = 0.16;
const SPARKS = 4;
const HANG = 2.63;

/** The cable's road: off the drum, up the mast's front, under the arm. */
const CABLE: readonly (readonly [number, number, number])[] = [
  [0, 0.82, DRUM_Z],
  [0, 1.25, -0.09],
  [0, 2.5, -0.09],
  [0.16, HANG, MAST_Z],
  [ARM_END, HANG, MAST_Z],
];

export function createExtender(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'extender';
  const b = new Build(skin, 'extender');
  root.add(b.root);

  // the foot and the mast with its bands, a cap and the knob the wire hangs from
  b.box([0.9, 0.12, 0.9], [0, 0.06, 0], CHARCOAL);
  b.box([0.2, 2.86, 0.2], [0, 1.53, MAST_Z], TEAL);
  for (const y of [1.3, 2.2]) b.box([0.25, 0.09, 0.25], [0, y, MAST_Z], MINT);
  b.box([0.27, 0.08, 0.27], [0, 2.98, MAST_Z], CHARCOAL);
  b.box([0.14, 0.1, 0.14], [0, 3.06, MAST_Z], MUSTARD);

  // the long arm and its brace, a little clip for the cable every so often
  b.box([ARM_END + 0.14, 0.1, 0.1], [(ARM_END + 0.04) / 2, ARM_Y, MAST_Z], MUSTARD);
  b.beam([0, 2.1, MAST_Z], [0.62, ARM_Y - 0.03, MAST_Z], 0.06, STEEL_DARK);
  for (const x of [0.32, 0.62, ARM_END - 0.02]) b.box([0.07, 0.1, 0.07], [x, HANG + 0.03, MAST_Z], CHARCOAL);

  // the cable drum: a block under it, cream flanges, fat coils, the steel axle
  const flat = { rot: [HP, 0, 0] as const, seg: 20 };
  b.box([0.42, 0.2, 0.42], [0, 0.22, DRUM_Z], STEEL_DARK);
  for (const z of [-0.09, 0.41]) b.cyl(0.4, 0.05, [0, DRUM_Y, z], CREAM, flat);
  b.cyl(0.27, 0.46, [0, DRUM_Y, DRUM_Z], CORAL_DARK, flat);
  for (let i = 0; i < 4; i++) b.cyl(0.31, 0.1, [0, DRUM_Y, DRUM_Z - 0.17 + i * 0.113], CORAL, flat);
  b.cyl(0.07, 0.56, [0, DRUM_Y, DRUM_Z], STEEL, { rot: [HP, 0, 0], seg: 10 });
  b.cyl(0.11, 0.03, [0, DRUM_Y, 0.45], MUSTARD, flat);

  // the cable, the junction box it goes through
  for (let i = 0; i + 1 < CABLE.length; i++) b.beam(CABLE[i], CABLE[i + 1], 0.05, CORAL);
  b.box([0.3, 0.34, 0.14], [0, 1.74, -0.09], CHARCOAL);
  b.box([0.34, 0.06, 0.18], [0, 1.94, -0.09], MUSTARD);

  // the plug hanging off the arm's end
  const hang = new THREE.Group();
  hang.position.set(ARM_END, HANG, MAST_Z);
  b.root.add(hang);
  const q = b.part('plug', hang);
  q.box([0.05, 0.46, 0.05], [0, -0.23, 0], CORAL);
  q.box([0.13, 0.1, 0.13], [0, -0.46, 0], CHARCOAL);
  q.box([0.26, 0.24, 0.2], [0, -0.62, 0], MUSTARD);
  q.box([0.28, 0.05, 0.22], [0, -0.7, 0], CORAL);
  for (const s of [-1, 1]) q.box([0.06, 0.15, 0.06], [s * 0.07, -0.8, 0], STEEL);
  b.finish();

  // the sparks climbing the cable: one instanced draw, only while it works
  const lengths: number[] = [0];
  for (let i = 0; i + 1 < CABLE.length; i++) {
    const [ax, ay, az] = CABLE[i];
    const [bx, by, bz] = CABLE[i + 1];
    lengths.push(lengths[i] + Math.hypot(bx - ax, by - ay, bz - az));
  }
  const total = lengths[lengths.length - 1];
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, toneMapped: false });
  sparkMat.userData.own = true;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), sparkMat, SPARKS);
  sparks.frustumCulled = false;
  sparks.visible = false;
  root.add(sparks);

  const bulb = powerBulb(skin, b.root, [0, 1.74, -0.02]);
  finishShadows(root);
  sparks.castShadow = false;

  const m4 = new THREE.Matrix4();
  let t = 0;
  let sway = 0;
  return {
    root,
    socket: new THREE.Vector3(0, 3.1, MAST_Z),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      sway += ((on ? 1 : 0) - sway) * Math.min(1, dt * 1.5);
      hang.rotation.z = Math.sin(t * 1.5) * 0.09 * sway;
      hang.rotation.x = Math.sin(t * 1.1 + 1) * 0.05 * sway;
      sparks.visible = on;
      if (!on) return;
      for (let i = 0; i < SPARKS; i++) {
        const d = ((t * 0.28 + i / SPARKS) % 1) * total;
        let s = 0;
        while (s + 2 < lengths.length && lengths[s + 1] < d) s++;
        const f = (d - lengths[s]) / (lengths[s + 1] - lengths[s]);
        const a = CABLE[s];
        const c = CABLE[s + 1];
        sparks.setMatrixAt(i, m4.makeTranslation(a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f));
      }
      sparks.instanceMatrix.needsUpdate = true;
    },
  };
}
