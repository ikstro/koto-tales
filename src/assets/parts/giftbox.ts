/**
 * Подарунок-втікач — Бабуся's joke: a wrapped gift box that got up and ran off. The whole coral box
 * is its head, with a giggle printed on the front and cream dots at the corners; a cream lid, a
 * mustard ribbon round the sides and over the top, a fat bow. It trots on two tiny cream legs in
 * little coral shoes and holds its small arms out with glee. Only 0.9 blocks tall.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const CORAL = '#e8604a';
const CREAM = '#ffeec6';
const RIBBON = '#ffd23a';
const RIBBON_D = '#eab02b';
const SHOE = '#c8432e';

/** The 8×8 face printed on the box's front (`src/assets/faces.ts`): laughing eyes, a wide-open giggle. */
export const face: FaceSpec = {
  // coral box, cream lid, ribbon, the ribbon's shade
  swatches: [CORAL, CREAM, RIBBON, RIBBON_D],
  pal: { c: '#ffe3a3', K: '#4a2c14', p: '#f6a08a', M: '#5b2f3c', T: '#ffb3a8' },
  open: [
    'c......c',
    '........',
    '.K....K.',
    'K.K..K.K',
    '.p....p.',
    '..MMMM..',
    '...TT...',
    'c......c',
  ],
  closed: { 2: '........', 3: 'KKK..KKK' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('giftbox', skin, faceAtlas('giftbox', face));
  const { root, parts } = bipedFrame({ legH: 0.19, hipX: 0.15, bodyH: 0.08, armX: 0.34, shoulderY: 0.24 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.1, 0.14, 0.1], [0, -0.07, 0], CREAM)
      .box([0.14, 0.07, 0.22], [0, -0.155, 0.05], SHOE)
      .done();
  }

  // the box's cream foot, under the printed side
  kit.part('body', parts.body).box([0.56, 0.1, 0.48], [0, 0.045, 0], CREAM).done();

  const cream = { s: 1 };
  const ribbon = { s: 2 };
  const shade = { s: 3 };
  kit
    .part('head', parts.head)
    .box([0.58, 0.38, 0.5], [0, 0.19, 0], { s: 0, face: true })
    // the ribbon down both sides and the back (the front stays free for the face)
    .box([0.6, 0.38, 0.12], [0, 0.19, 0], ribbon)
    .box([0.12, 0.38, 0.02], [0, 0.19, -0.255], ribbon)
    // the lid, the ribbon crossing over it
    .box([0.64, 0.09, 0.56], [0, 0.415, 0], cream)
    .box([0.66, 0.1, 0.12], [0, 0.415, 0], ribbon)
    .box([0.12, 0.1, 0.58], [0, 0.415, 0], ribbon)
    // the bow: two fat loops, their hollows, a knot, two tails on the lid
    .box([0.22, 0.12, 0.12], [-0.13, 0.53, 0], ribbon, [0, 0, -0.42])
    .box([0.22, 0.12, 0.12], [0.13, 0.53, 0], ribbon, [0, 0, 0.42])
    .box([0.1, 0.05, 0.125], [-0.16, 0.55, 0], shade, [0, 0, -0.42])
    .box([0.1, 0.05, 0.125], [0.16, 0.55, 0], shade, [0, 0, 0.42])
    .box([0.1, 0.1, 0.14], [0, 0.51, 0], shade)
    .box([0.08, 0.02, 0.2], [-0.1, 0.47, 0.13], ribbon, [0, 0.5, 0])
    .box([0.08, 0.02, 0.2], [0.1, 0.47, 0.13], ribbon, [0, -0.5, 0])
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    kit
      .part(arm.name, arm)
      .box([0.08, 0.14, 0.09], [0, -0.07, 0], CREAM)
      .box([0.1, 0.08, 0.11], [0, -0.17, 0], CORAL)
      .done();
  }
  // held out to the sides, a little forward: running off and delighted about it
  parts.armL.rotation.set(-0.3, 0, 0.6);
  parts.armR.rotation.set(-0.3, 0, -0.6);

  return { type: 'biped', root, parts, height: 0.9, eyes: kit.eyes };
}
