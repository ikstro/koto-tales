/**
 * Сиренка — a tall, gangly toy who sings instead of growling: long thin legs
 * and dangly arms in soft grey-teal plastic, a little neck, and a head that is
 * a toy siren lamp — a coral dome cap over a glowing warm-white lens band. Her
 * face is printed on the front of the head: big round friendly eyes and a
 * small round "ooo" mouth, as if she is always mid-song. Glow parts only.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const BODY = '#93b2b8';
const DARK = '#5e7d86';
const CORAL = '#e8463a';
const LENS = { c: '#ffe3a3', glow: true };

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: ['#a9c6cb', '#5e7d86'],
  pal: { K: '#26301c', W: '#ffffff', M: '#5b2f3c', P: '#ee6a82' },
  open: [
    '........',
    '.WW..WW.',
    'WWKKWWKK',
    'WWKKWWKK',
    '.WW..WW.',
    '........',
    '...MM...',
    '...MM...',
  ],
  closed: { 1: '........', 2: '........', 3: 'KKKKKKKK', 4: '........' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('siren', skin, faceAtlas('siren', face));
  const { root, parts } = bipedFrame({ legH: 0.88, hipX: 0.09, bodyH: 0.6, armX: 0.22, shoulderY: 0.55 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.12, 0.82, 0.13], [0, -0.42, 0], BODY)
      .box([0.15, 0.08, 0.22], [0, -0.84, 0.04], DARK)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.3, 0.6, 0.2], [0, 0.3, 0], BODY)
    .box([0.32, 0.06, 0.22], [0, 0.03, 0], DARK)
    .done();

  kit
    .part('head', parts.head)
    .box([0.1, 0.1, 0.1], [0, 0.05, 0], DARK)
    .box([0.44, 0.4, 0.38], [0, 0.3, 0], { s: 0, face: true })
    // the siren lamp: a dark collar, a glowing lens band with coral ribs, a stepped coral dome
    .box([0.48, 0.05, 0.42], [0, 0.525, 0], DARK)
    .box([0.42, 0.14, 0.36], [0, 0.62, 0], LENS)
    .box([0.05, 0.14, 0.38], [-0.12, 0.62, 0], CORAL)
    .box([0.05, 0.14, 0.38], [0.12, 0.62, 0], CORAL)
    .box([0.46, 0.1, 0.4], [0, 0.74, 0], CORAL)
    .box([0.34, 0.08, 0.3], [0, 0.83, 0], CORAL)
    .box([0.2, 0.05, 0.18], [0, 0.895, 0], CORAL)
    .box([0.08, 0.04, 0.08], [0, 0.935, 0], LENS)
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    kit
      .part(arm.name, arm)
      .box([0.1, 0.74, 0.1], [0, -0.36, 0], BODY)
      .box([0.13, 0.12, 0.13], [0, -0.76, 0], DARK)
      .done();
    arm.rotation.x = -0.15;
  }

  return { type: 'biped', root, parts, height: 2.4, eyes: kit.eyes };
}
