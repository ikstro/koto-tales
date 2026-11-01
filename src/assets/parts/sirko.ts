/**
 * Сірко: the yard dog — warm grey fur with a darker saddle and floppy ears,
 * a white chest, muzzle and paw tips, a black nose, a dark brow patch over
 * one eye, a coral collar with a mustard tag, an up-curled white-tipped tail.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { quadFrame } from './frames';
import { Kit } from './kit';

const FUR = '#a99880'; // warm grey, like a real yard dog
const DARK = '#77664f'; // the saddle, the ears, the hind legs
const WHITE = '#f7f2ea';
const NOSE = '#26211c';
const COLLAR = '#e0583f';
const TAG = '#ffd23a';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: [FUR, DARK, WHITE],
  pal: { K: NOSE, W: WHITE, T: '#f49ab3' },
  open: [
    '........',
    '........',
    '........',
    '.WK..KW.',
    '.KK..KK.',
    '..WWWW..',
    '..WWWW..',
    '..WTTW..',
  ],
  closed: { 3: '........', 4: '.KK..KK.' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('sirko', skin, faceAtlas('sirko', face));
  const { root, parts } = quadFrame({
    legH: 0.34,
    legX: 0.12,
    backZ: -0.28,
    frontZ: 0.28,
    head: [0, 0.24, 0.6],
    tail: [0, 0.18, -0.08],
    tailLen: 0.26,
  });

  // body: pivot at the back hips, torso reaching forward along +Z
  kit
    .part('body', parts.body)
    .box([0.38, 0.36, 0.82], [0, 0.12, 0.26], FUR)
    // the darker saddle on the back
    .box([0.39, 0.12, 0.44], [0, 0.24, 0.1], DARK)
    // white chest at the neck and the belly stripe
    .box([0.3, 0.26, 0.04], [0, 0.06, 0.66], WHITE)
    .box([0.3, 0.03, 0.5], [0, -0.07, 0.32], WHITE)
    .done();

  for (const leg of [parts.legFL, parts.legFR]) {
    kit
      .part(leg.name, leg)
      .box([0.14, 0.3, 0.16], [0, -0.15, 0], FUR)
      .box([0.15, 0.09, 0.17], [0, -0.295, 0.012], WHITE)
      .done();
  }
  for (const leg of [parts.legBL, parts.legBR]) {
    kit
      .part(leg.name, leg)
      .box([0.15, 0.34, 0.18], [0, -0.17, 0], DARK)
      .box([0.16, 0.09, 0.19], [0, -0.295, 0.012], WHITE)
      .done();
  }

  const head = kit.part('head', parts.head);
  head
    .box([0.42, 0.34, 0.32], [0, 0.08, 0.12], { s: 0, face: true })
    // floppy ears hanging at the sides, flaring out a little
    .box([0.1, 0.26, 0.18], [0.26, -0.04, 0.1], DARK, [0, 0, -0.18])
    .box([0.1, 0.26, 0.18], [-0.26, -0.04, 0.1], DARK, [0, 0, 0.18])
    // white muzzle with the black nose
    .box([0.22, 0.13, 0.12], [0, -0.02, 0.34], WHITE)
    .box([0.1, 0.06, 0.05], [0, 0.03, 0.41], NOSE)
    // a dark brow patch over one eye, like a real yard dog
    .box([0.1, 0.05, 0.02], [0.11, 0.235, 0.282], DARK)
    // the coral collar with a mustard tag
    .box([0.44, 0.08, 0.42], [0, -0.12, 0.02], COLLAR)
    .box([0.09, 0.11, 0.04], [0, -0.19, 0.24], TAG)
    .done();

  // an up-curled sickle tail with a white tip
  parts.tail.rotation.x = 0.9;
  parts.tail2.rotation.x = 0.55;
  kit.part('tail', parts.tail).box([0.1, 0.1, 0.3], [0, 0, -0.13], DARK).done();
  kit.part('tail2', parts.tail2).box([0.09, 0.09, 0.24], [0, 0, -0.1], WHITE).done();

  return { type: 'quadruped', root, parts, height: 0.95, eyes: kit.eyes };
}
