/**
 * The toast cannon: a chrome toaster in a teal fork on a swivel stand, leaning forward so its two
 * slots look out like a mortar's mouth, with a coral knob, a lever on its right side and a slice of
 * bread peeping out of each slot. It turns to `k.aim`; on a shot one slice jumps out, the toaster
 * kicks back, the lever flicks up, and a fresh slice rises in the slot. A warm line glows in the
 * slots while it works. `tip` follows the slots as it turns. Origin at the floor centre of the 1×1
 * footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, C_OFF, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL, powerBulb, setGlow } from './buildingParts';
import type { PartBuilder } from './parts/kit';
import { Build, HP, finishShadows } from './villages';

const CHROME = '#c8d0d7';
const SHINE = '#fbfdff';
const CRUST = '#b9793a';
const CRUMB = '#f6dfae';
const TOASTED = '#e3b268';

/** The stand's top, where the head turns. */
const HEAD_Y = 0.32;
/** How high above the head the toaster is held, and how far it leans towards +Z. */
const PIVOT_Y = 0.36;
const TILT = 0.55;
/** The fork's arms. */
const FORK_X = 0.44;
/** The toaster's size and its slots (along x, one behind the other). */
const W = 0.66;
const H = 0.46;
const D = 0.4;
const SLOT_Z = [0.085, -0.085];
const REST_Y = 0.07;
const POP = 0.5;

const C_HEAT = new THREE.Color('#ff8a3c');

/** A rounded rectangle centred on the origin in the XY plane. */
function loaf(w: number, h: number, r: number): THREE.Shape {
  const x = w / 2;
  const y = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.absarc(x - r, -y + r, r, -HP, 0, false);
  s.lineTo(x, y - r);
  s.absarc(x - r, y - r, r, 0, HP, false);
  s.lineTo(-x + r, y);
  s.absarc(-x + r, y - r, r, HP, Math.PI, false);
  s.lineTo(-x, -y + r);
  s.absarc(-x + r, -y + r, r, Math.PI, Math.PI + HP, false);
  return s;
}

/** A slice of bread standing up: a crust, a crumb, a toasted middle, a rounded top. */
function slice(p: PartBuilder): void {
  p.box([0.42, 0.34, 0.04], [0, 0, 0], CRUST);
  p.box([0.3, 0.06, 0.04], [0, 0.19, 0], CRUST);
  p.box([0.37, 0.3, 0.052], [0, 0, 0], CRUMB);
  p.box([0.26, 0.05, 0.052], [0, 0.175, 0], CRUMB);
  p.box([0.2, 0.16, 0.056], [0, 0.02, 0], TOASTED);
}

const wrapPi = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export function createToastcannon(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'toastcannon';
  const b = new Build(skin, 'toastcannon');
  root.add(b.root);

  // the stand: a charcoal foot, a mustard ring, a short steel neck
  b.cyl(0.46, 0.1, [0, 0.05, 0], CHARCOAL, { seg: 20 });
  b.cyl(0.36, 0.08, [0, 0.14, 0], MUSTARD, { seg: 20 });
  b.cyl(0.13, 0.16, [0, 0.25, 0], STEEL_DARK, { seg: 14 });
  // the bulb's box in front, the wire's stud behind
  b.box([0.28, 0.18, 0.1], [0, 0.19, 0.38], CHARCOAL);
  b.box([0.3, 0.03, 0.12], [0, 0.29, 0.38], MUSTARD);
  b.box([0.1, 0.2, 0.1], [0, 0.2, -0.38], CHARCOAL);

  // the head: a turntable and a fork, turning about Y
  const head = new Build(skin, 'toastcannon-head');
  head.root.position.y = HEAD_Y;
  head.cyl(0.24, 0.07, [0, 0.035, 0], TEAL, { seg: 18 });
  head.box([2 * FORK_X + 0.07, 0.07, 0.14], [0, 0.04, 0], TEAL);
  for (const s of [-1, 1]) {
    head.box([0.07, PIVOT_Y + 0.04, 0.14], [s * FORK_X, PIVOT_Y / 2 + 0.03, 0], TEAL);
    head.cyl(0.07, 0.08, [s * (FORK_X + 0.005), PIVOT_Y, 0], MUSTARD, { rot: [0, 0, HP], seg: 12 });
    head.cyl(0.035, 0.12, [s * (FORK_X - 0.06), PIVOT_Y, 0], STEEL_DARK, { rot: [0, 0, HP], seg: 8 });
  }
  b.root.add(head.root);

  // the toaster, leaning on its pivot
  const toaster = new Build(skin, 'toastcannon-toaster');
  toaster.root.position.y = PIVOT_Y;
  toaster.root.rotation.x = TILT;
  const shell = new THREE.ExtrudeGeometry(loaf(W - 0.04, H - 0.04, 0.09), { depth: D - 0.04, curveSegments: 6, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  toaster.geo(shell, [0, 0, -(D - 0.04) / 2], CHROME);
  toaster.box([W - 0.04, 0.06, D - 0.02], [0, -H / 2 + 0.01, 0], CHARCOAL);
  // bright streaks on the chrome, front and back
  for (const z of [D / 2 + 0.004, -D / 2 - 0.004]) {
    toaster.box([0.05, 0.3, 0.008], [-0.18, 0.03, z], SHINE, [0, 0, 0.45]);
    toaster.box([0.024, 0.3, 0.008], [-0.1, 0.03, z], SHINE, [0, 0, 0.45]);
  }
  toaster.box([W - 0.16, 0.03, 0.01], [0, -0.13, D / 2 + 0.004], STEEL);
  // the knob on the front
  toaster.cyl(0.055, 0.05, [0.2, -0.05, D / 2 + 0.03], CORAL, { rot: [HP, 0, 0], seg: 12 });
  toaster.box([0.016, 0.06, 0.012], [0.2, -0.03, D / 2 + 0.058], CORAL_DARK);
  // the two slots on top
  for (const z of SLOT_Z) {
    toaster.box([0.5, 0.012, 0.11], [0, H / 2 + 0.002, z], STEEL);
    toaster.box([0.45, 0.016, 0.07], [0, H / 2 + 0.002, z], CHARCOAL);
    toaster.glowBox('heat', '#ff8a3c', [0.41, 0.018, 0.026], [0, H / 2 + 0.002, z]);
  }
  // the lever: a dark groove on the right side and a block that rides in it
  toaster.box([0.012, 0.28, 0.06], [W / 2 + 0.002, 0.02, 0.11], CHARCOAL);
  const lever = new THREE.Group();
  lever.position.set(W / 2 + 0.035, -0.08, 0.11);
  toaster.root.add(lever);
  const lp = toaster.part('lever', lever);
  lp.box([0.07, 0.06, 0.1], [0, 0, 0], CORAL);
  lp.box([0.03, 0.03, 0.05], [-0.04, 0, 0], STEEL);

  // a slice in each slot
  const slices = SLOT_Z.map((z) => {
    const g = new THREE.Group();
    g.position.set(0, REST_Y, z);
    toaster.root.add(g);
    slice(toaster.part('slice', g));
    return g;
  });

  const heatMat = toaster.finish().heat;
  head.root.add(toaster.root);
  head.finish();
  b.finish();
  setGlow(heatMat, C_OFF, 0);

  const bulb = powerBulb(skin, b.root, [0, 0.19, 0.43]);
  finishShadows(root);

  const tipY = HEAD_Y + PIVOT_Y + Math.cos(TILT) * (H / 2 + 0.06);
  const tipZ = Math.sin(TILT) * (H / 2 + 0.06);
  const tip = new THREE.Vector3(0, tipY, tipZ);
  let t = 0;
  let which = 1;
  let lastPulse = Infinity;
  let heat = '';
  return {
    root,
    socket: new THREE.Vector3(0, 0.3, -0.38),
    tip,
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw?.on;
      const key = on ? 'on' : 'off';
      if (key !== heat) {
        heat = key;
        if (on) setGlow(heatMat, C_HEAT, 0.9);
        else setGlow(heatMat, C_OFF, 0);
      }
      if (!on) return;

      // it turns to its target, the short way round
      const was = head.root.rotation.y;
      const yaw = was + wrapPi((k.aim ?? was) - was) * Math.min(1, dt * 8);
      head.root.rotation.y = yaw;
      tip.set(Math.sin(yaw) * tipZ, tipY, Math.cos(yaw) * tipZ);

      // a shot: the slots take turns; the slice jumps, is gone, and a new one rises
      const p = k.pulse ?? Infinity;
      if (p < lastPulse) which = 1 - which;
      lastPulse = p;
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        if (i !== which || p >= 0.9) {
          s.visible = true;
          s.position.y = REST_Y;
        } else if (p < 0.1) {
          s.visible = true;
          s.position.y = REST_Y + POP * (p / 0.1);
        } else if (p < 0.5) {
          s.visible = false;
        } else {
          s.visible = true;
          s.position.y = REST_Y - 0.2 * (1 - (p - 0.5) / 0.4);
        }
      }
      toaster.root.rotation.x = TILT - 0.24 * Math.exp(-p * 12);
      lever.position.y = -0.08 + 0.17 * Math.exp(-p * 4);
    },
  };
}
