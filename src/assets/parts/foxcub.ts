/**
 * Лисеня: a little orange fox cub — big pointy ears with dark tips, a white muzzle with a black
 * button nose, white cheek tufts, chest and belly, dark socks and a fat bushy tail with a white
 * tip. ~0.9 tall to the ear tips.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { quadFrame } from './frames';
import { Kit } from './kit';

const FUR = '#e8792b';
const DEEP = '#c9611d';
const WHITE = '#fbf3e4';
const SOCK = '#5a3a2a';
const NOSE = '#26211c';
const EAR_IN = '#ffd9b0';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: [FUR, DEEP, WHITE],
  pal: { K: NOSE, W: WHITE, G: '#ffffff' },
  open: [
    '........',
    '........',
    '.KK..KK.',
    '.KG..GK.',
    'WKK..KKW',
    'WW....WW',
    'WWWWWWWW',
    'WWWWWWWW',
  ],
  closed: { 2: '........', 3: '........', 4: 'WKK..KKW' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('foxcub', skin, faceAtlas('foxcub', face));
  const { root, parts } = quadFrame({
    legH: 0.25,
    legX: 0.1,
    backZ: -0.2,
    frontZ: 0.2,
    head: [0, 0.2, 0.46],
    tail: [0, 0.15, -0.05],
    tailLen: 0.28,
  });

  // body: pivot at the back hips, torso reaching forward along +Z
  kit
    .part('body', parts.body)
    .box([0.3, 0.27, 0.6], [0, 0.09, 0.2], FUR)
    .box([0.31, 0.08, 0.3], [0, 0.2, 0.12], DEEP)
    // white chest and belly
    .box([0.22, 0.22, 0.04], [0, 0.06, 0.505], WHITE)
    .box([0.22, 0.03, 0.42], [0, -0.045, 0.24], WHITE)
    .done();

  for (const leg of [parts.legFL, parts.legFR]) {
    kit
      .part(leg.name, leg)
      .box([0.11, 0.22, 0.12], [0, -0.11, 0], FUR)
      .box([0.12, 0.11, 0.135], [0, -0.195, 0.008], SOCK)
      .done();
  }
  for (const leg of [parts.legBL, parts.legBR]) {
    kit
      .part(leg.name, leg)
      .box([0.12, 0.24, 0.15], [0, -0.12, 0], DEEP)
      .box([0.13, 0.11, 0.155], [0, -0.195, 0.008], SOCK)
      .done();
  }

  const head = kit.part('head', parts.head);
  head
    .box([0.38, 0.3, 0.28], [0, 0.06, 0.1], { s: 0, face: true })
    // the white muzzle with the button nose
    .box([0.18, 0.11, 0.13], [0, -0.03, 0.29], WHITE)
    .box([0.12, 0.08, 0.06], [0, -0.03, 0.37], WHITE)
    .box([0.075, 0.055, 0.04], [0, 0.0, 0.405], NOSE);
  for (const s of [1, -1]) {
    head
      // the cheek tuft
      .box([0.07, 0.1, 0.14], [s * 0.215, -0.03, 0.12], WHITE, [0, 0, s * 0.35])
      // the big ear: three steps to a dark tip, a pale inside
      .box([0.19, 0.1, 0.07], [s * 0.115, 0.255, 0.08], FUR)
      .box([0.14, 0.09, 0.06], [s * 0.13, 0.34, 0.08], FUR)
      .box([0.08, 0.07, 0.05], [s * 0.145, 0.415, 0.08], SOCK)
      .box([0.1, 0.13, 0.02], [s * 0.122, 0.285, 0.118], EAR_IN);
  }
  head.done();

  // the bushy tail, fat in the middle, a white tip
  parts.tail.rotation.x = 0.42;
  parts.tail2.rotation.x = 0.3;
  kit.part('tail', parts.tail).box([0.14, 0.14, 0.14], [0, 0, -0.04], FUR).box([0.25, 0.25, 0.24], [0, 0, -0.19], FUR).done();
  kit.part('tail2', parts.tail2).box([0.23, 0.23, 0.16], [0, 0, -0.09], WHITE).box([0.13, 0.13, 0.07], [0, 0, -0.2], WHITE).done();

  return { type: 'quadruped', root, parts, height: 0.9, eyes: kit.eyes };
}
