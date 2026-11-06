/**
 * The bass cannon: a fat, squat toy cannon on a coral carriage with two big wheels, its dark barrel
 * ringed in mustard and its mouth one huge speaker cone with a cream cap. On each bass blow it kicks
 * back on the carriage, the muzzle jumps, the cone punches out and a soft warm ring flashes round
 * the rim; while it has power the cone breathes gently between blows. Friendly, not a weapon: no
 * fire, no smoke. Origin at the floor centre of the 2×2 footprint, front towards +Z; glows are own
 * emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL_DARK, TAU, glowMaterial, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, fx, mergeCached, tint } from './villages';

const DARK = '#1d1a19';
const GREY = '#4a4440';
const BARREL = '#3a3532';
const MUSTARD_DARK = '#c98f1c';

const WHEEL_R = 0.47;
const WHEEL_X = 0.78;
const WHEEL_Z = -0.08;
/** Where the barrel turns on the carriage, and how far it looks up. */
const PIVOT_Y = 0.94;
const PIVOT_Z = -0.08;
const ELEV = 0.2;
/** The barrel along its own +Z: its back, its mouth, the radius at each end. */
const BACK = -0.6;
const MOUTH = 0.74;
const R_BACK = 0.44;
const R_MOUTH = 0.58;
const CONE_R = 0.56;

const C_FLASH = new THREE.Color('#ffd98a');
const C_RIM = new THREE.Color(MUSTARD);

const ALONG = { rot: [HP, 0, 0] as const, seg: 30 };

/** A soft ring in the XY plane: bright in the middle of its width, nothing at the two edges. */
function softRing(r0: number, r1: number): THREE.BufferGeometry {
  const seg = 40;
  const g = new THREE.RingGeometry(r0, r1, seg, 2);
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(i / (seg + 1)) === 1 ? 1 : 0;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function createBasscannon(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'basscannon';

  // the carriage: it shoves back a little with the blow
  const b = new Build(skin, 'basscannon');
  root.add(b.root);
  const rig = b.root;
  b.box([1.04, 0.22, 1.62], [0, 0.17, -0.02], CORAL);
  b.box([1.08, 0.05, 1.66], [0, 0.29, -0.02], CORAL_DARK);
  b.box([1.0, 0.08, 1.2], [0, 0.04, -0.02], CHARCOAL);
  // the two cheeks, stepping up to the barrel's pins
  for (const s of [-1, 1]) {
    const x = s * 0.57;
    b.box([0.11, 0.3, 1.4], [x, 0.44, -0.08], CORAL);
    b.box([0.11, 0.24, 0.96], [x, 0.71, -0.08], CORAL);
    b.box([0.11, 0.22, 0.5], [x, 0.94, PIVOT_Z], CORAL);
    b.box([0.13, 0.05, 0.54], [x, 1.06, PIVOT_Z], CORAL_DARK);
    b.cyl(0.11, 0.14, [x, PIVOT_Y, PIVOT_Z], MUSTARD, { rot: [0, 0, HP], seg: 14 });
    b.cyl(0.05, 0.16, [x, PIVOT_Y, PIVOT_Z], MUSTARD_DARK, { rot: [0, 0, HP], seg: 10 });
  }
  // the axle
  b.box([1.5, 0.09, 0.09], [0, WHEEL_R, WHEEL_Z], STEEL_DARK);
  // the tail, with the little box the wire hangs from
  b.box([0.26, 0.42, 0.12], [0, 0.46, -0.84], CHARCOAL);
  b.box([0.3, 0.05, 0.14], [0, 0.69, -0.84], MUSTARD);
  // a plate on the front for the bulb
  b.box([0.3, 0.26, 0.04], [0.3, 0.19, 0.8], CHARCOAL);

  // the barrel: it turns on its pins and slides back in a blow
  const pivot = new THREE.Group();
  pivot.position.set(0, PIVOT_Y, PIVOT_Z);
  pivot.rotation.x = -ELEV;
  rig.add(pivot);
  const g = new Build(skin, 'basscannon-gun');
  pivot.add(g.root);
  g.cyl(R_BACK, MOUTH - BACK, [0, 0, (BACK + MOUTH) / 2], BARREL, { ...ALONG, r1: R_MOUTH });
  g.ball(R_BACK, [0, 0, BACK], BARREL, { s: [1, 1, 0.62], seg: 18 });
  g.ball(0.11, [0, 0, BACK - 0.34], CORAL, { seg: 14 });
  g.cyl(0.07, 0.12, [0, 0, BACK - 0.26], MUSTARD, { ...ALONG, seg: 12 });
  // the mustard bands, and the fat lip round the mouth
  g.cyl(R_BACK + 0.04, 0.09, [0, 0, BACK + 0.08], MUSTARD, ALONG);
  g.cyl(0.52, 0.1, [0, 0, 0.2], MUSTARD, ALONG);
  g.cyl(R_MOUTH + 0.075, 0.14, [0, 0, MOUTH - 0.04], MUSTARD, ALONG);
  g.cyl(R_MOUTH + 0.03, 0.04, [0, 0, MOUTH - 0.13], MUSTARD_DARK, ALONG);
  const rimMat = g.glowGeo('rim', MUSTARD, new THREE.TorusGeometry(R_MOUTH + 0.04, 0.03, 8, 40), [0, 0, MOUTH + 0.035]).finish().rim;
  setGlow(rimMat, C_RIM, 0);

  // the cone in the mouth: it punches out on its own
  const cone = new THREE.Mesh(
    mergeCached('basscannon/cone', [
      tint(new THREE.CylinderGeometry(CONE_R, CONE_R, 0.05, 36).rotateX(HP), DARK),
      tint(new THREE.CylinderGeometry(CONE_R * 0.42, CONE_R * 0.9, 0.17, 36).rotateX(HP).translate(0, 0, 0.09), GREY),
      tint(new THREE.CylinderGeometry(CONE_R * 0.3, CONE_R * 0.4, 0.09, 24).rotateX(HP).translate(0, 0, 0.2), CREAM),
    ]),
    g.kit.vertexColourMaterial(false),
  );
  cone.position.z = MOUTH + 0.01;
  cone.castShadow = true;
  g.root.add(cone);

  // the soft ring that flashes on the rim
  const ringMat = glowMaterial(0xffd98a, true);
  const ring = fx(new THREE.Mesh(softRing(R_MOUTH - 0.02, R_MOUTH + 0.24), ringMat));
  ring.position.z = MOUTH + 0.09;
  ring.visible = false;
  g.root.add(ring);

  // the two big wheels: dark tyres, cream discs, coral spokes, mustard hubs
  const wheel = new Build(skin, 'basscannon-wheel');
  const side = { rot: [0, 0, HP] as const, seg: 26 };
  wheel.cyl(WHEEL_R, 0.2, [0, 0, 0], CHARCOAL, side);
  wheel.cyl(WHEEL_R - 0.11, 0.22, [0, 0, 0], CREAM, side);
  wheel.cyl(0.13, 0.25, [0, 0, 0], MUSTARD, { rot: [0, 0, HP], seg: 14 });
  for (let i = 0; i < 3; i++) wheel.box([0.235, 0.06, (WHEEL_R - 0.12) * 2], [0, 0, 0], CORAL, [(i / 3) * Math.PI, 0, 0]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    wheel.box([0.2, 0.05, 0.13], [0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R], '#45403c', [a, 0, 0]);
  }
  wheel.finish();
  const wheelL = wheel.root;
  const wheelR = wheelL.clone();
  wheelL.position.set(-WHEEL_X, WHEEL_R + 0.02, WHEEL_Z);
  wheelR.position.set(WHEEL_X, WHEEL_R + 0.02, WHEEL_Z);
  root.add(wheelL, wheelR);

  const bulb = powerBulb(skin, rig, [0.3, 0.19, 0.81]);
  b.finish();
  finishShadows(root);
  let t = 0;
  let flashing = false;
  return {
    root,
    socket: new THREE.Vector3(0, 0.62, -0.9),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      const p = on ? k.pulse : undefined;
      // a sharp shove, then an easy settle
      const kick = p === undefined ? 0 : p < 0.05 ? p / 0.05 : Math.exp(-(p - 0.05) * 7);
      g.root.position.z = -0.22 * kick;
      pivot.rotation.x = -ELEV - 0.1 * kick;
      rig.position.z = -0.06 * kick;
      wheelL.position.z = wheelR.position.z = WHEEL_Z - 0.06 * kick;
      wheelL.rotation.x = wheelR.rotation.x = (-0.06 * kick) / WHEEL_R;
      const breathe = on ? 0.1 * Math.sin(t * 2.2) : 0;
      cone.scale.set(1 + kick * 0.03, 1 + kick * 0.03, 1 + breathe + kick * 1.7);
      // the flash lasts about half a second
      const flash = p === undefined ? 0 : Math.max(0, 1 - p / 0.55);
      ring.visible = flash > 0;
      if (flash > 0) {
        flashing = true;
        ringMat.opacity = flash * flash * 0.5;
        ring.scale.setScalar(1 + (1 - flash) * 0.35);
        setGlow(rimMat, C_FLASH, flash * 1.2);
      } else if (flashing) {
        flashing = false;
        setGlow(rimMat, C_RIM, 0);
      }
    },
  };
}
