/**
 * Зомбік — a sleepy, friendly zombie: soft green skin, mismatched round eyes,
 * a goofy one-tooth grin, a leaf sprouting from a messy tuft, a faded purple
 * shirt with a torn hem and an orange patch, patched brown trousers, bare
 * feet. Arms reach forward in the rest pose.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const SKIN = '#93c45a';
const SHIRT = '#8a6bbd';
const PATCH = '#f0a040';
const TROUSERS = '#6d5a44';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). */
export const face: FaceSpec = {
  // green skin, hair, leaf, stem, stitch
  swatches: ['#93c45a', '#3f5230', '#5fd36a', '#7a5a34', '#4a6b2f'],
  pal: { d: '#7aa948', W: '#ffffff', K: '#26301c', T: '#fffbe6', M: '#5b2f3c' },
  open: [
    '........',
    '.d......',
    '........',
    '.WW...W.',
    '.WK..WK.',
    '......d.',
    '..MTMM..',
    '...MM...',
  ],
  closed: { 3: '........', 4: '.KK..KK.' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('zombie', skin, faceAtlas('zombie', face));
  const { root, parts } = bipedFrame({ legH: 0.54, hipX: 0.12, bodyH: 0.5, armX: 0.33, shoulderY: 0.45 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.2, 0.44, 0.22], [0, -0.21, 0], TROUSERS)
      .box([0.21, 0.11, 0.26], [0, -0.485, 0.02], SKIN)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.5, 0.48, 0.28], [0, 0.26, 0], SHIRT)
    // torn hem
    .box([0.14, 0.05, 0.29], [-0.17, 0.02, 0], SHIRT)
    .box([0.1, 0.04, 0.29], [0.02, 0.015, 0], SHIRT)
    .box([0.08, 0.06, 0.29], [0.19, 0.01, 0], SHIRT)
    .box([0.11, 0.11, 0.012], [0.12, 0.3, 0.145], PATCH)
    .box([0.06, 0.05, 0.012], [-0.15, 0.16, 0.145], PATCH)
    .done();

  const tuft = { s: 1 };
  kit
    .part('head', parts.head)
    .box([0.5, 0.5, 0.46], [0, 0.25, 0], { s: 0, face: true })
    .box([0.05, 0.1, 0.09], [0.265, 0.22, 0], { s: 0 })
    .box([0.05, 0.1, 0.09], [-0.265, 0.22, 0], { s: 0 })
    // messy tuft and a sprouting leaf
    .box([0.22, 0.06, 0.24], [-0.1, 0.52, -0.02], tuft)
    .box([0.16, 0.08, 0.16], [0.11, 0.53, -0.08], tuft)
    .box([0.08, 0.05, 0.1], [0.02, 0.55, 0.1], tuft)
    .box([0.03, 0.14, 0.03], [0.03, 0.62, 0.04], { s: 3 })
    .box([0.16, 0.025, 0.08], [0.11, 0.69, 0.04], { s: 2 }, [0, 0, 0.35])
    .box([0.11, 0.025, 0.06], [-0.05, 0.67, 0.04], { s: 2 }, [0, 0, -0.4])
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    kit
      .part(arm.name, arm)
      .box([0.16, 0.2, 0.18], [0, -0.06, 0], SHIRT)
      .box([0.13, 0.3, 0.15], [0, -0.3, 0], SKIN)
      .done();
    // the classic reach-forward, a bit droopy
    arm.rotation.x = -1.35;
  }

  return { type: 'biped', root, parts, height: 1.62, eyes: kit.eyes };
}
