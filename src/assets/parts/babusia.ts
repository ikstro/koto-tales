/**
 * Бабуся, the queen of flowers and weather: short soft wavy ash-blonde hair with a
 * side-swept fringe, black cat-eye glasses, a big toothy smile and rosy freckled
 * cheeks. A coral turtleneck with ribbed rows and a thin silver chain, a square-link
 * black-and-white watch on the left wrist, dark-grey leggings, grey-navy trainers. On
 * her head a wreath of white daisies and red poppies instead of a crown. Her arms bend at the
 * elbow (`foreL`, `foreR`, straight at rest). Walking poles (`poleL`, `poleR`) and a teal coffee
 * cup (`cup`) are hidden parts the game can show (systems/babusia.ts holds them).
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { POLE } from '../../content/babusia';
import { BABUSIA_FACE, faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit, type PartBuilder, type V3 } from './kit';

export const face: FaceSpec = BABUSIA_FACE;

const SKIN = face.swatches[0];
const SWEATER = '#e0583f';
const RIB = '#c4452f';
const CHAIN = '#e9eef2';
const LEGGINGS = '#474a54';
const TRAINERS = '#4c5a72';
const TRAINER_LACE = '#aeb9c8';
const SOLES = '#d5d9df';
const FRAME = '#0e0b10';
const WATCH_WHITE = '#f6f6f2';
const PETAL = '#fbfaf2';
const DAISY_EYE = '#f6c323';
const POPPY = '#e8392e';
const POPPY_DEEP = '#c32a26';
const POPPY_EYE = '#2b2422';
const LEAF = '#3fa142';
const LEAF_DARK = '#2f8236';
const POLE_COLOUR = '#cfd6dc';
const POLE_DARK = '#3a4254';
const CUP = '#56b5ab';
const CUP_SHADE = '#3f9c93';
const COFFEE = '#b98a58';

const RIB_DASHES = '#.#.#.#.#.#.#.#.#.#';
const RIB_GAP = '...................';
const RIB_ROWS = [RIB_DASHES, RIB_DASHES, RIB_GAP, RIB_GAP, RIB_GAP, RIB_DASHES, RIB_DASHES, RIB_GAP, RIB_GAP, RIB_GAP, RIB_DASHES, RIB_DASHES];

/** Rotation that lays a flat flower on the wreath, leaning outwards along (nx, nz). */
function lean(nx: number, nz: number, spin: number): V3 {
  const tilt = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(nx * 0.8, 1, nz > 0 ? nz : nz * 0.3).normalize(),
  );
  const q = tilt.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

/** The wreath sits back on the head: high over the fringe, lower at the nape, so the glasses stay in view from above. */
const ringY = (z: number): number => 0.495 + z * 0.125;

function daisy(b: PartBuilder, x: number, z: number, nx: number, nz: number, spin: number): void {
  const y = ringY(z);
  b.box([0.105, 0.025, 0.105], [x, y, z], PETAL, lean(nx, nz, spin))
    .box([0.105, 0.025, 0.105], [x, y, z], PETAL, lean(nx, nz, spin + Math.PI / 4))
    .box([0.05, 0.02, 0.05], [x + nx * 0.01, y + 0.016, z + nz * 0.01], DAISY_EYE, lean(nx, nz, spin));
}

function poppy(b: PartBuilder, x: number, z: number, nx: number, nz: number, spin: number): void {
  const y = ringY(z);
  b.box([0.125, 0.03, 0.125], [x, y, z], POPPY_DEEP, lean(nx, nz, spin))
    .box([0.125, 0.03, 0.125], [x + nx * 0.004, y + 0.006, z + nz * 0.004], POPPY, lean(nx, nz, spin + Math.PI / 4))
    .box([0.04, 0.02, 0.04], [x + nx * 0.01, y + 0.018, z + nz * 0.01], POPPY_EYE, lean(nx, nz, spin));
}

function leaf(b: PartBuilder, x: number, z: number, nx: number, nz: number): void {
  b.box([0.07, 0.018, 0.07], [x, ringY(z) - 0.02, z], LEAF_DARK, lean(nx, nz, Math.PI / 4));
}

export function build(skin: Skin): Rig {
  const kit = new Kit('babusia', skin, faceAtlas('babusia'));
  const { root, parts } = bipedFrame({ legH: 0.52, hipX: 0.12, bodyH: 0.53, armX: 0.335, shoulderY: 0.42 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.2, 0.43, 0.22], [0, -0.205, 0], LEGGINGS)
      .box([0.21, 0.08, 0.29], [0, -0.455, 0.03], TRAINERS)
      .box([0.215, 0.035, 0.295], [0, -0.5025, 0.03], SOLES)
      .box([0.11, 0.015, 0.1], [0, -0.41, 0.09], TRAINER_LACE)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.5, 0.42, 0.29], [0, 0.25, 0], SWEATER)
    .box([0.52, 0.07, 0.31], [0, 0.035, 0], RIB)
    .pixels(RIB_ROWS, { '#': RIB }, [-0.228, 0.35, 0.144], 0.024, 0.008)
    // the turtleneck: a chunky roll that stands proud of the chest, so it shows from above
    .box([0.4, 0.09, 0.42], [0, 0.5, 0.01], SWEATER)
    .box([0.42, 0.03, 0.44], [0, 0.46, 0.01], RIB)
    // the thin silver chain
    .beam([-0.14, 0.445, 0.156], [-0.095, 0.325, 0.156], 0.013, CHAIN, 0.006)
    .beam([-0.095, 0.325, 0.156], [0, 0.265, 0.156], 0.013, CHAIN, 0.006)
    .beam([0.14, 0.445, 0.156], [0.095, 0.325, 0.156], 0.013, CHAIN, 0.006)
    .beam([0.095, 0.325, 0.156], [0, 0.265, 0.156], 0.013, CHAIN, 0.006)
    .done();

  const hair = { s: 1 };
  const shade = { s: 2 };
  const light = { s: 4 };
  const head = kit
    .part('head', parts.head)
    .box([0.5, 0.46, 0.44], [0, 0.23, 0], { s: 0, face: true })
    .box([0.05, 0.1, 0.09], [0.265, 0.24, 0.02], { s: 3 })
    .box([0.05, 0.1, 0.09], [-0.265, 0.24, 0.02], { s: 3 })
    // short soft hair: a cap, waves swept over the top into a little dome, curls at the nape
    .box([0.55, 0.07, 0.5], [0, 0.445, -0.005], hair)
    .box([0.22, 0.05, 0.12], [-0.11, 0.5, 0.13], hair, [0, 0.32, 0])
    .box([0.22, 0.05, 0.12], [0.11, 0.505, 0.14], light, [0, -0.28, 0])
    .box([0.25, 0.07, 0.13], [-0.12, 0.515, 0.02], light, [0, 0.3, 0])
    .box([0.25, 0.07, 0.13], [0.12, 0.52, 0.03], hair, [0, -0.3, 0])
    .box([0.25, 0.06, 0.13], [-0.11, 0.505, -0.1], hair, [0, 0.34, 0])
    .box([0.25, 0.06, 0.13], [0.12, 0.51, -0.09], shade, [0, -0.26, 0])
    .box([0.22, 0.05, 0.12], [-0.1, 0.495, -0.2], shade, [0, 0.28, 0])
    .box([0.22, 0.05, 0.12], [0.11, 0.495, -0.2], hair, [0, -0.3, 0])
    .box([0.38, 0.045, 0.11], [0, 0.545, 0.03], hair, [0, 0.42, 0])
    .box([0.3, 0.035, 0.09], [0.03, 0.55, -0.09], light, [0, 0.5, 0])
    .box([0.55, 0.38, 0.06], [0, 0.27, -0.245], hair)
    .box([0.34, 0.04, 0.02], [0.08, 0.34, -0.28], shade)
    .box([0.3, 0.04, 0.02], [-0.1, 0.2, -0.28], shade)
    .box([0.2, 0.05, 0.06], [-0.16, 0.06, -0.245], hair)
    .box([0.2, 0.05, 0.06], [0.14, 0.065, -0.245], shade)
    .box([0.06, 0.13, 0.46], [0.27, 0.41, -0.01], hair)
    .box([0.06, 0.13, 0.46], [-0.27, 0.41, -0.01], hair)
    .box([0.07, 0.15, 0.16], [0.275, 0.27, -0.13], hair)
    .box([0.07, 0.15, 0.16], [-0.275, 0.27, -0.13], hair)
    // side-swept fringe: from a parting on her right, falling lower towards her left
    .box([0.56, 0.06, 0.06], [0, 0.425, 0.245], hair)
    .box([0.36, 0.04, 0.06], [0.1, 0.39, 0.245], hair)
    .box([0.18, 0.025, 0.065], [0.19, 0.38, 0.25], shade)
    .box([0.22, 0.025, 0.065], [0.0, 0.41, 0.25], light);

  // black cat-eye glasses, a thick top bar so they read from above
  for (const side of [1, -1]) {
    head
      .box([0.21, 0.036, 0.03], [side * 0.13, 0.348, 0.235], FRAME)
      .box([0.2, 0.024, 0.03], [side * 0.13, 0.215, 0.235], FRAME)
      .box([0.03, 0.14, 0.03], [side * 0.03, 0.28, 0.235], FRAME)
      .box([0.03, 0.14, 0.03], [side * 0.225, 0.28, 0.235], FRAME)
      .box([0.05, 0.03, 0.03], [side * 0.24, 0.37, 0.235], FRAME)
      .box([0.02, 0.03, 0.22], [side * 0.255, 0.325, 0.12], FRAME);
  }
  head.box([0.06, 0.026, 0.03], [0, 0.31, 0.235], FRAME);

  // the wreath: a green ring round the crown, flowers leaning out so they read from above
  head
    .box([0.5, 0.04, 0.06], [0, ringY(0.2) - 0.03, 0.2], LEAF)
    .box([0.54, 0.04, 0.06], [0, ringY(-0.255) - 0.03, -0.255], LEAF)
    .box([0.06, 0.04, 0.48], [0.27, ringY(-0.03) - 0.03, -0.03], LEAF, [-0.125, 0, 0])
    .box([0.06, 0.04, 0.48], [-0.27, ringY(-0.03) - 0.03, -0.03], LEAF, [-0.125, 0, 0]);
  leaf(head, 0.135, 0.245, 0.2, 1);
  leaf(head, -0.14, 0.245, -0.2, 1);
  leaf(head, 0.325, 0.03, 1, 0);
  leaf(head, -0.325, -0.1, -1, 0);
  leaf(head, 0, -0.31, 0, -1);

  daisy(head, -0.07, 0.205, 0, 1, 0.2);
  poppy(head, 0.065, 0.207, 0, 1, 0.5);
  daisy(head, 0.2, 0.2, 0.3, 0.95, 0.1);
  daisy(head, -0.205, 0.2, -0.3, 0.95, 0.4);
  daisy(head, 0.28, 0.095, 1, 0.1, 0.3);
  poppy(head, 0.285, -0.04, 1, 0, 0.1);
  daisy(head, 0.28, -0.175, 1, -0.2, 0.6);
  daisy(head, -0.28, 0.1, -1, 0.1, 0.5);
  daisy(head, -0.285, -0.03, -1, 0, 0.2);
  poppy(head, -0.28, -0.17, -1, -0.2, 0.3);
  daisy(head, 0.2, -0.265, 0.3, -0.95, 0.2);
  poppy(head, 0.06, -0.27, 0, -1, 0.6);
  daisy(head, -0.08, -0.268, 0, -1, 0.4);
  daisy(head, -0.205, -0.262, -0.3, -0.95, 0.7);
  head.done();

  // the arm: the upper part here, the forearm with the cuff, hand and watch on its own joint;
  // the two overlap at the elbow so a bent arm shows no gap
  const forearm = (arm: THREE.Object3D, name: string): THREE.Group => {
    kit.part(arm.name, arm).box([0.16, 0.25, 0.18], [0, -0.085, 0], SWEATER).done();
    const fore = new THREE.Group();
    fore.name = name;
    fore.position.set(0, -POLE.upper, 0);
    arm.add(fore);
    const b = kit
      .part(name, fore)
      .box([0.16, 0.21, 0.18], [0, -0.055, 0], SWEATER)
      .box([0.165, 0.045, 0.185], [0, -0.14, 0], RIB)
      .box([0.13, 0.1, 0.15], [0, -POLE.fore, 0], SKIN);
    if (arm === parts.armL) addWatch(b);
    b.done();
    return fore;
  };
  const foreL = forearm(parts.armL, 'foreL');
  const foreR = forearm(parts.armR, 'foreR');

  const poleL = addPole(kit, foreL, 'poleL', 1);
  const poleR = addPole(kit, foreR, 'poleR', -1);
  const cup = addCup(kit, foreR);

  return { type: 'biped', root, parts: { ...parts, foreL, foreR, poleL, poleR, cup }, height: 1.62, eyes: kit.eyes };
}

/** The watch over the left cuff: a black band with white square links, a dial on the outer side. */
function addWatch(b: PartBuilder): void {
  const y = -0.14;
  b.box([0.18, 0.06, 0.2], [0, y, 0], FRAME);
  for (const t of [-0.066, 0, 0.066]) {
    b.box([0.036, 0.036, 0.01], [t, y, 0.1], WATCH_WHITE).box([0.036, 0.036, 0.01], [t, y, -0.1], WATCH_WHITE);
  }
  for (const t of [-0.066, 0.066]) b.box([0.01, 0.036, 0.036], [-0.09, y, t], WATCH_WHITE);
  b.box([0.016, 0.09, 0.1], [0.094, y, 0], FRAME).box([0.01, 0.06, 0.07], [0.101, y, 0], WATCH_WHITE);
}

/**
 * A Nordic walking pole, straight down from the fist as built: a dark grip through the hand, a
 * thin silver shaft, a small basket near the tip. The game leans it back so the tip stays on the
 * ground (`poleAngle`). Hidden by default.
 */
function addPole(kit: Kit, fore: THREE.Object3D, name: string, side: number): THREE.Group {
  const pole = new THREE.Group();
  pole.name = name;
  pole.position.set(0, -POLE.fore, 0);
  fore.add(pole);
  const tip: V3 = [side * 0.03, -POLE.len, 0];
  const at = (k: number): V3 => [tip[0] * k, tip[1] * k, tip[2] * k];
  kit
    .part(name, pole)
    .box([0.06, 0.15, 0.06], [0, 0.02, 0], POLE_DARK)
    .beam(at(0), at(0.92), 0.028, POLE_COLOUR)
    .box([0.1, 0.018, 0.1], at(0.88), POLE_DARK)
    .beam(at(0.92), tip, 0.02, POLE_DARK)
    .done();
  pole.visible = false;
  return pole;
}

/** The small teal cup in the right hand: rim up while the arm hangs, its handle in the fist. Hidden by default. */
function addCup(kit: Kit, fore: THREE.Object3D): THREE.Group {
  const cup = new THREE.Group();
  cup.name = 'cup';
  cup.position.set(0, -POLE.fore, 0);
  fore.add(cup);
  kit
    .part('cup', cup)
    .box([0.11, 0.05, 0.11], [0, -0.02, 0.13], CUP_SHADE)
    .box([0.145, 0.08, 0.145], [0, 0.04, 0.13], CUP)
    .box([0.115, 0.012, 0.115], [0, 0.077, 0.13], COFFEE)
    .box([0.03, 0.05, 0.06], [0, 0.03, 0.04], CUP)
    .done();
  cup.visible = false;
  return cup;
}
