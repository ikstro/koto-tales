/**
 * Кролик: a small toy rabbit that hops round the yard. Soft warm grey-brown, a cream belly and
 * bib, a round cream tail, big hind feet, two long upright ears with a pink inside, round dark
 * eyes and a pink button nose. ~0.45 tall to the ear tips.
 */
import type { Rig, Skin } from '../../contracts';
import { RABBIT_FACE, faceAtlas, type FaceSpec } from '../faces';
import { quadFrame } from './frames';
import { Kit } from './kit';

export const face: FaceSpec = RABBIT_FACE;

const FUR = face.swatches[0];
const DEEP = face.swatches[1];
const CREAM = face.swatches[2];
const EAR_IN = face.swatches[3];
const NOSE = '#ee8f96';

export function build(skin: Skin): Rig {
  const kit = new Kit('rabbit', skin, faceAtlas('rabbit', face));
  const { root, parts } = quadFrame({
    legH: 0.07,
    legX: 0.075,
    backZ: -0.08,
    frontZ: 0.09,
    head: [0, 0.11, 0.2],
    tail: [0, 0.09, -0.08],
    tailLen: 0.03,
  });

  // body: pivot at the back hips, the round rump behind, the chest forward
  kit
    .part('body', parts.body)
    .box([0.17, 0.14, 0.26], [0, 0.065, 0.1], FUR)
    .box([0.2, 0.16, 0.15], [0, 0.075, 0.015], FUR)
    .box([0.205, 0.05, 0.1], [0, 0.135, 0.01], DEEP)
    // the cream belly and bib
    .box([0.13, 0.02, 0.22], [0, -0.008, 0.1], CREAM)
    .box([0.11, 0.1, 0.02], [0, 0.05, 0.232], CREAM)
    .done();

  for (const leg of [parts.legFL, parts.legFR]) {
    kit
      .part(leg.name, leg)
      .box([0.055, 0.06, 0.06], [0, -0.035, 0], FUR)
      .box([0.06, 0.03, 0.08], [0, -0.055, 0.012], CREAM)
      .done();
  }
  for (const leg of [parts.legBL, parts.legBR]) {
    kit
      .part(leg.name, leg)
      .box([0.07, 0.06, 0.1], [0, -0.03, 0], DEEP)
      .box([0.075, 0.03, 0.15], [0, -0.055, 0.03], CREAM)
      .done();
  }

  const head = kit
    .part('head', parts.head)
    .box([0.17, 0.15, 0.14], [0, 0.05, 0.04], { s: 0, face: true })
    // the little muzzle and the button nose
    .box([0.09, 0.05, 0.03], [0, 0.005, 0.12], { s: 2 })
    .box([0.04, 0.025, 0.02], [0, 0.03, 0.135], NOSE);
  for (const s of [1, -1]) {
    head
      // the long upright ear, leaning out a little, a pink inside
      .box([0.055, 0.16, 0.035], [s * 0.05, 0.19, 0.02], { s: 0 }, [0, 0, -s * 0.09])
      .box([0.03, 0.12, 0.012], [s * 0.05, 0.19, 0.04], { s: 3 }, [0, 0, -s * 0.09]);
  }
  head.done();

  // the round tail: a cream ball with a smaller one tucked behind it
  kit.part('tail', parts.tail).box([0.095, 0.095, 0.08], [0, 0, -0.02], CREAM).done();
  kit.part('tail2', parts.tail2).box([0.06, 0.06, 0.03], [0, 0, -0.015], CREAM).done();

  return { type: 'quadruped', root, parts, height: 0.45, eyes: kit.eyes };
}
