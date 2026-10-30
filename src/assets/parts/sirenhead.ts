/**
 * Сиреноголовий — a tall, gangly toy robot-puppet in warm brown plastic: long
 * thin legs on chunky block feet, a narrow chest of stacked plates, long arms
 * hanging low to chunky hands with three short rounded claws, and a thin pole
 * neck holding a small head block with big round friendly eyes and a little
 * «ooo» singing mouth. On top a short post carries two toy loudspeaker horns,
 * stepped boxes widening outward to the left and right, each with a coral
 * glowing ring in its mouth (glow parts, no lights).
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame, type BipedDims } from './frames';
import { Kit, type PartBuilder, type V3 } from './kit';

const BODY = '#8a5a3c';
const JOINT = '#6b4630';
const RING = { c: '#ff5a3c', glow: true };
const THROAT = '#3e2618';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: [BODY],
  pal: { K: '#26180e', W: '#fff6e0', M: '#4a2014', p: '#c9705a' },
  open: [
    '........',
    'WWW..WWW',
    'WKW..WKW',
    'WWW..WWW',
    'p......p',
    '...MM...',
    '...MM...',
    '........',
  ],
  closed: { 1: '........', 2: 'KKK..KKK', 3: '........' },
};

const DIMS: BipedDims = { legH: 1.0, hipX: 0.11, bodyH: 0.64, armX: 0.27, shoulderY: 0.56 };

/**
 * One loudspeaker horn opening towards `side` (+1 = left, −1 = right), turned a
 * little to the front and up so the glowing ring in its mouth shows.
 */
function horn(p: PartBuilder, side: number, y: number): void {
  const yaw = 0.5;
  const tilt = 0.25;
  const rot: V3 = [0, -side * yaw, side * tilt];
  const dir: V3 = [side * Math.cos(tilt) * Math.cos(yaw), Math.sin(tilt), Math.cos(tilt) * Math.sin(yaw)];
  const at = (t: number): V3 => [side * 0.05 + dir[0] * t, y + dir[1] * t, dir[2] * t];
  const steps: [number, number][] = [
    [0.06, 0.1],
    [0.14, 0.16],
    [0.22, 0.23],
    [0.3, 0.31],
  ];
  for (const [t, s] of steps) p.box([0.09, s, s], at(t), BODY, rot);
  // rim, glowing ring and the dark middle of the mouth
  p.box([0.04, 0.36, 0.36], at(0.36), JOINT, rot);
  p.box([0.02, 0.27, 0.27], at(0.385), RING, rot);
  p.box([0.02, 0.13, 0.13], at(0.393), THROAT, rot);
}

export function build(skin: Skin): Rig {
  const kit = new Kit('sirenhead', skin, faceAtlas('sirenhead', face));
  const { root, parts } = bipedFrame(DIMS);

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.14, 0.1, 0.14], [0, -0.03, 0], JOINT)
      .box([0.1, 0.4, 0.1], [0, -0.27, 0], BODY)
      .box([0.13, 0.1, 0.13], [0, -0.5, 0], JOINT)
      .box([0.1, 0.38, 0.1], [0, -0.73, 0], BODY)
      .box([0.2, 0.11, 0.3], [0, -0.945, 0.04], JOINT)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.32, 0.12, 0.18], [0, 0.04, 0], JOINT)
    .box([0.12, 0.14, 0.1], [0, 0.16, 0], BODY)
    // stacked chest plates, wider towards the shoulders
    .box([0.28, 0.1, 0.17], [0, 0.27, 0], BODY)
    .box([0.32, 0.03, 0.15], [0, 0.335, 0], JOINT)
    .box([0.34, 0.1, 0.18], [0, 0.4, 0], BODY)
    .box([0.38, 0.03, 0.16], [0, 0.465, 0], JOINT)
    .box([0.42, 0.11, 0.19], [0, 0.535, 0], BODY)
    .box([0.12, 0.05, 0.12], [0, 0.615, 0], JOINT)
    .done();

  const head = kit
    .part('head', parts.head)
    .box([0.36, 0.32, 0.28], [0, 0.36, 0], { s: 0, face: true })
    // pole neck, post and the bar that holds the horns
    .box([0.07, 0.22, 0.07], [0, 0.1, 0], JOINT)
    .box([0.07, 0.14, 0.07], [0, 0.58, 0], JOINT)
    .box([0.14, 0.12, 0.12], [0, 0.68, 0], BODY);
  horn(head, 1, 0.68);
  horn(head, -1, 0.68);
  head.done();

  for (const arm of [parts.armL, parts.armR]) {
    const side = arm === parts.armL ? 1 : -1;
    const p = kit
      .part(arm.name, arm)
      .box([0.13, 0.12, 0.13], [0, -0.02, 0], JOINT)
      .box([0.08, 0.36, 0.08], [0, -0.24, 0], BODY)
      .box([0.11, 0.09, 0.11], [0, -0.44, 0], JOINT)
      .box([0.08, 0.34, 0.08], [0, -0.64, 0], BODY)
      .box([0.16, 0.14, 0.15], [0, -0.86, 0], JOINT);
    // three short rounded claws
    for (const z of [-0.045, 0, 0.045]) p.box([0.04, 0.07, 0.04], [side * 0.02, -0.96, z + 0.01], BODY);
    p.done();
  }

  return { type: 'biped', root, parts, height: 2.5, eyes: kit.eyes };
}
