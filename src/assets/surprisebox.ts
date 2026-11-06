/**
 * The surprise box: a toy capsule machine. A coral cabinet with a teal band and a cream front, a
 * big mustard turning knob with a teal grip, a coin slot with a coin's mark, a dark hatch with a
 * little tray; on top a round see-through globe heaped with coloured balls under a mustard cap.
 * When it is paid the knob turns once, the balls jostle and a two-coloured capsule rolls out into
 * the tray, waits there a moment and is gone. Origin at the floor centre of the 1×1, front towards
 * +Z; it needs no power and nothing on it is lit.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL } from './buildingParts';
import { Build, HP, finishShadows } from './villages';

const MUSTARD_DARK = '#c98f1c';
const GLASS = '#dff4f6';
const PINK = '#ee6a82';
const BLUE = '#2f7fd6';
const GREEN = '#3fa142';
const BALLS = [CORAL, MUSTARD, BLUE, PINK, GREEN, CREAM, MINT];

/** The globe's centre and radius; the front of the cabinet; the knob's height. */
const GLOBE_Y = 1.45;
const GLOBE_R = 0.43;
const FRONT = 0.43;
const KNOB_Y = 0.66;
const BALL_R = 0.1;
/** How long the knob's turn takes, when the capsule comes out, when it is gone (seconds). */
const TURN = 0.75;
const OUT = 0.6;
const GONE = 3.4;

const ease = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** The balls' spots inside the globe, heaped in rings from the bottom up. */
function ballSpots(): [number, number, number][] {
  const out: [number, number, number][] = [[0, -0.3, 0]];
  const rings: [number, number, number][] = [
    [-0.28, 0.17, 6],
    [-0.13, 0.27, 8],
    [0.03, 0.26, 8],
    [0.05, 0.08, 2],
    [0.19, 0.16, 5],
  ];
  rings.forEach(([y, r, n], ri) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + ri * 0.5) / n) * TAU;
      out.push([Math.sin(a) * r, y, Math.cos(a) * r]);
    }
  });
  return out;
}

export function createSurprisebox(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'surprisebox';
  const b = new Build(skin, 'surprisebox');
  root.add(b.root);

  // the cabinet: a foot, a body with a teal band, a mustard top
  b.box([0.96, 0.1, 0.96], [0, 0.05, 0], CORAL_DARK);
  b.box([0.86, 0.84, 0.86], [0, 0.52, 0], CORAL);
  b.box([0.875, 0.07, 0.875], [0, 0.135, 0], TEAL);
  b.box([0.92, 0.08, 0.92], [0, 0.98, 0], MUSTARD);
  b.cyl(0.33, 0.1, [0, 1.07, 0], MUSTARD_DARK, { seg: 20, r1: 0.3 });

  // the cream front with three coloured dots along its top
  b.box([0.68, 0.52, 0.02], [0, 0.66, FRONT + 0.01], CREAM);
  [PINK, BLUE, GREEN].forEach((c, i) => b.disc(0.035, 0.012, [-0.1 + i * 0.1, 0.87, FRONT + 0.02], [0, 0, 1], c));

  // the plate round the knob
  b.disc(0.19, 0.02, [-0.09, KNOB_Y, FRONT + 0.02], [0, 0, 1], STEEL);
  b.disc(0.155, 0.012, [-0.09, KNOB_Y, FRONT + 0.04], [0, 0, 1], STEEL_DARK);

  // the coin slot, a mustard coin's mark above it
  b.box([0.14, 0.24, 0.025], [0.24, KNOB_Y, FRONT + 0.03], STEEL);
  b.box([0.025, 0.1, 0.012], [0.24, KNOB_Y - 0.04, FRONT + 0.045], CHARCOAL);
  b.disc(0.04, 0.012, [0.24, KNOB_Y + 0.07, FRONT + 0.042], [0, 0, 1], MUSTARD);

  // the hatch and its tray
  b.box([0.44, 0.2, 0.02], [0, 0.29, FRONT + 0.01], MUSTARD);
  b.box([0.34, 0.14, 0.02], [0, 0.285, FRONT + 0.02], CHARCOAL);
  b.box([0.4, 0.035, 0.1], [0, 0.19, FRONT + 0.03], MUSTARD_DARK);

  // the cap on the globe
  b.cyl(0.22, 0.07, [0, GLOBE_Y + GLOBE_R - 0.03, 0], MUSTARD, { seg: 20, r1: 0.18 });
  b.cyl(0.14, 0.05, [0, GLOBE_Y + GLOBE_R + 0.03, 0], MUSTARD_DARK, { seg: 16, r1: 0.1 });
  b.ball(0.065, [0, GLOBE_Y + GLOBE_R + 0.09, 0], CORAL);
  b.finish();

  // the knob: it turns once when paid
  const knob = new Build(skin, 'surprisebox-knob');
  knob.root.position.set(-0.09, KNOB_Y, FRONT + 0.05);
  knob.cyl(0.13, 0.06, [0, 0, 0.03], MUSTARD, { rot: [HP, 0, 0], seg: 20 });
  knob.box([0.27, 0.075, 0.08], [0, 0, 0.09], TEAL);
  knob.box([0.06, 0.09, 0.09], [0.11, 0, 0.09], MINT);
  knob.finish();
  root.add(knob.root);

  // the balls, one instanced draw
  const spots = ballSpots();
  const heap = new THREE.Group();
  heap.position.y = GLOBE_Y;
  root.add(heap);
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 12, 9), skin.partMaterial(0xffffff), spots.length);
  balls.castShadow = true;
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, y, z], i) => {
    balls.setMatrixAt(i, m4.makeTranslation(x, y, z));
    balls.setColorAt(i, col.set(BALLS[(i * 3) % BALLS.length]));
  });
  heap.add(balls);

  // the glass over them, and a soft shine on its upper left
  const glassMat = (skin.partMaterial(GLASS, { transparent: true }) as THREE.MeshStandardMaterial).clone();
  glassMat.userData.own = true;
  glassMat.opacity = 0.16;
  glassMat.depthWrite = false;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, 26, 18), glassMat);
  glass.position.y = GLOBE_Y;
  root.add(glass);
  const shineMat = (skin.partMaterial('#ffffff', { transparent: true }) as THREE.MeshStandardMaterial).clone();
  shineMat.userData.own = true;
  shineMat.opacity = 0.55;
  shineMat.depthWrite = false;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R + 0.004, 12, 8, 5.2, 0.5, 0.55, 0.42), shineMat);
  shine.position.y = GLOBE_Y;
  root.add(shine);

  // the capsule: a cream cup and a coloured dome that changes every time
  const capsule = new THREE.Group();
  capsule.visible = false;
  root.add(capsule);
  const dome = (skin.partMaterial(CORAL) as THREE.MeshStandardMaterial).clone();
  dome.userData.own = true;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 7, 0, TAU, 0, HP), dome);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 7, 0, TAU, HP, HP), skin.partMaterial(CREAM));
  top.castShadow = cup.castShadow = true;
  capsule.add(top, cup);

  finishShadows(root);
  let last = Infinity;
  let drops = 0;
  let turned = false;
  return {
    root,
    update(_dt, k) {
      const p = k.pulse ?? Infinity;
      if (p < last) {
        drops++;
        dome.color.set(BALLS[(drops * 2) % 5]);
      }
      last = p;
      if (p >= GONE) {
        if (turned) {
          turned = false;
          capsule.visible = false;
          knob.root.rotation.z = 0;
          heap.position.y = GLOBE_Y;
        }
        return;
      }
      turned = true;
      // the knob's one full turn; the heap shakes with it
      const turn = ease(p / TURN);
      knob.root.rotation.z = -turn * TAU;
      heap.rotation.y = drops * 0.9 + turn * 0.9;
      const shake = p < TURN ? 1 - p / TURN : 0;
      heap.position.y = GLOBE_Y + Math.abs(Math.sin(p * 17)) * 0.035 * shake;
      // out of the hatch, a drop into the tray, a little bounce
      capsule.visible = p > OUT - 0.2;
      const u = Math.min(1, Math.max(0, (p - OUT + 0.2) / 0.3));
      const after = p - OUT - 0.1;
      const bounce = after > 0 ? Math.abs(Math.sin(after * 11)) * 0.05 * Math.exp(-after * 5) : 0;
      capsule.position.set(0, 0.32 - u * 0.012 + bounce, FRONT - 0.04 + u * 0.09);
      capsule.rotation.set(u * 2.4, 0, 0.3);
      capsule.scale.setScalar(Math.max(0.0001, 1 - ease((p - (GONE - 0.35)) / 0.35)));
    },
  };
}
