/**
 * The laser show: a squat charcoal box on a steel foot with a mustard trim, a slotted front and a
 * coral knob; on top a little teal drum that turns slowly with four stubby lamps leaning outwards,
 * one to each corner. At night, while it is fed, each lamp throws a thin soft beam up to 14 blocks
 * across the sky; the beams fan slowly and swap their colours on the beat. By day only the lamps
 * themselves glow a little. Origin at the floor centre, front towards +Z; the beams are additive and
 * start hidden, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL, glowMaterial, octagon, powerBulb } from './buildingParts';
import { Build, finishShadows, fx, mergeCached, tint } from './villages';

const SLOT = '#4a4441';
const LENS_OFF = '#6a625c';

const LAMPS = 4;
const HEAD_Y = 0.72;
/** A lamp's foot on the drum, how long it is to the glass. */
const LAMP_R = 0.2;
const LAMP_LEN = 0.27;
/** A beam's greatest length; how far from straight up it leans, and how far that sways. */
const REACH = 14;
const LEAN = 0.62;
const SWAY = 0.26;
/** The colours the beams pass round on the beat. */
const BEAM = ['#ff4f6e', '#ffc23a', '#3fe6c0', '#5aa8ff', '#b07bff'].map((c) => new THREE.Color(c));
const C_LENS_OFF = new THREE.Color(LENS_OFF);

/** A thin open tube one block long from y = 0 up, widening a little and fading out towards its end. */
function beamGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.1, 0.03, 1, 7, 6, true).translate(0, 0.5, 0);
  const pos = g.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = (1 - pos.getY(i)) ** 1.3;
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** A lamp's can, from its foot along +Y: a dark can with a mustard ring round the glass. */
function canGeo(): THREE.BufferGeometry {
  return mergeCached('lasers/can', [
    tint(new THREE.CylinderGeometry(0.1, 0.075, 0.22, 12).translate(0, 0.11, 0), STEEL_DARK),
    tint(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 12).translate(0, 0.235, 0), MUSTARD),
  ]);
}

export function createLasers(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'lasers';
  const b = new Build(skin, 'lasers');
  root.add(b.root);

  // the foot, the box, the trim
  b.box([0.94, 0.08, 0.94], [0, 0.04, 0], STEEL_DARK);
  b.box([0.84, 0.44, 0.84], [0, 0.3, 0], CHARCOAL);
  b.box([0.9, 0.07, 0.9], [0, 0.54, 0], MUSTARD);
  // the front: three slots, the bulb, a knob
  for (const y of [0.2, 0.28, 0.36]) b.box([0.26, 0.035, 0.02], [-0.22, y, 0.425], SLOT);
  b.box([0.13, 0.13, 0.05], [0.28, 0.28, 0.435], CORAL);
  b.box([0.03, 0.08, 0.02], [0.28, 0.28, 0.465], CREAM);
  // the box the wire goes into, at the back
  b.box([0.2, 0.16, 0.05], [0, 0.42, -0.44], STEEL_DARK);
  // the collar the head turns on
  octagon(b.p, 0.44, 0.1, 0.575, STEEL);

  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  b.root.add(head);
  const hp = b.part('head', head);
  octagon(hp, 0.56, 0.16, -0.05, TEAL);
  octagon(hp, 0.4, 0.05, 0.11, MUSTARD);
  hp.box([0.14, 0.08, 0.14], [0, 0.19, 0], CORAL);
  b.finish();

  // the lamps, their glass, their beams: one instanced draw each, all on the head
  const cans = new THREE.InstancedMesh(canGeo(), b.kit.vertexColourMaterial(false), LAMPS);
  cans.castShadow = true;
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  lensMat.userData.own = true;
  const lenses = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 14).translate(0, LAMP_LEN, 0), lensMat, LAMPS);
  const beamMat = glowMaterial(0xffffff, true);
  beamMat.side = THREE.FrontSide;
  const beams = fx(new THREE.InstancedMesh(beamGeo(), beamMat, LAMPS));
  beams.visible = false;
  beams.frustumCulled = false;
  // the beams reach far past any camera's edge; the kit plate's sprite frames the toy, not them
  beams.boundingBox = new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 0.5, 0.4));
  head.add(cans, lenses, beams);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const long = new THREE.Vector3();
  const col = new THREE.Color();
  /** Leans every lamp and its beam for the sweep's time `s`. */
  const pose = (s: number): void => {
    for (let i = 0; i < LAMPS; i++) {
      const a = (i / LAMPS) * TAU + Math.PI / 4;
      q.setFromEuler(e.set(LEAN + SWAY * Math.sin(s * 0.55 + i * 1.7), a, 0));
      at.set(Math.sin(a) * LAMP_R, 0.08, Math.cos(a) * LAMP_R);
      cans.setMatrixAt(i, m4.compose(at, q, one));
      lenses.setMatrixAt(i, m4);
      beams.setMatrixAt(i, m4.compose(at, q, long.set(1, REACH * (0.86 + 0.14 * Math.sin(s * 0.8 + i * 2.3)), 1)));
    }
    cans.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    beams.instanceMatrix.needsUpdate = true;
  };
  pose(0);
  for (let i = 0; i < LAMPS; i++) {
    lenses.setColorAt(i, C_LENS_OFF);
    beams.setColorAt(i, BEAM[i]);
  }

  const bulb = powerBulb(skin, b.root, [0.03, 0.28, 0.42]);
  finishShadows(root);
  let t = 0;
  let sweep = 0;
  let level = 0;
  let lit = false;
  return {
    root,
    socket: new THREE.Vector3(0, 0.42, -0.46),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      level += ((on ? 1 : 0) - level) * Math.min(1, dt * 3);
      if (level < 0.01) {
        level = 0;
        beams.visible = false;
        if (lit) {
          lit = false;
          for (let i = 0; i < LAMPS; i++) lenses.setColorAt(i, C_LENS_OFF);
          lenses.instanceColor!.needsUpdate = true;
        }
        return;
      }
      lit = true;
      sweep += dt * level;
      head.rotation.y += dt * 0.3 * level;
      pose(sweep);
      const dark = Math.min(1, Math.max(0, (k.night - 0.12) / 0.5));
      const dusk = dark * dark * (3 - 2 * dark);
      const bt = k.playing ? k.beat : t * 2;
      const step = Math.floor(bt);
      const flash = Math.exp(-(bt - step) * 4);
      for (let i = 0; i < LAMPS; i++) {
        const c = BEAM[(i + step) % BEAM.length];
        lenses.setColorAt(i, col.copy(c).multiplyScalar((0.6 + 0.7 * dusk) * level + 0.25 * flash));
        beams.setColorAt(i, col.copy(c).multiplyScalar(0.8 + 0.4 * flash));
      }
      lenses.instanceColor!.needsUpdate = true;
      beams.instanceColor!.needsUpdate = true;
      beams.visible = dusk > 0.01;
      beamMat.opacity = 0.7 * dusk * level;
    },
  };
}
