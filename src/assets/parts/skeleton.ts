/**
 * Кістлявчик — a cheerful little skeleton: round skull with big sockets and
 * sky-blue sparkle eyes, a crooked smile, rib bars, thin bones and a red bow
 * tie, because he dresses up for visitors.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const BONE = '#f1ece0';
const TIE = '#ff5a3c';

export function build(skin: Skin): Rig {
  const kit = new Kit('skeleton', skin, faceAtlas('skeleton'));
  const { root, parts } = bipedFrame({ legH: 0.56, hipX: 0.1, bodyH: 0.5, armX: 0.27, shoulderY: 0.46 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.09, 0.52, 0.09], [0, -0.27, 0], BONE)
      .box([0.12, 0.08, 0.13], [0, -0.04, 0], BONE)
      .box([0.13, 0.06, 0.2], [0, -0.53, 0.04], BONE)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.3, 0.09, 0.15], [0, 0.03, 0], BONE)
    .box([0.07, 0.5, 0.07], [0, 0.25, -0.04], BONE)
    .box([0.34, 0.05, 0.18], [0, 0.2, 0], BONE)
    .box([0.38, 0.05, 0.2], [0, 0.28, 0], BONE)
    .box([0.4, 0.05, 0.2], [0, 0.36, 0], BONE)
    .box([0.46, 0.07, 0.14], [0, 0.45, -0.01], BONE)
    .box([0.07, 0.06, 0.04], [0, 0.47, 0.085], TIE)
    .box([0.08, 0.1, 0.035], [0.07, 0.47, 0.085], TIE)
    .box([0.08, 0.1, 0.035], [-0.07, 0.47, 0.085], TIE)
    .done();

  kit
    .part('head', parts.head)
    .box([0.46, 0.44, 0.42], [0, 0.25, 0], { s: 0, face: true })
    .box([0.38, 0.05, 0.36], [0, 0.49, 0], { s: 0 })
    .box([0.3, 0.07, 0.3], [0, 0.02, 0.02], { s: 1 })
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    kit
      .part(arm.name, arm)
      .box([0.1, 0.1, 0.1], [0, -0.01, 0], BONE)
      .box([0.08, 0.42, 0.08], [0, -0.23, 0], BONE)
      .box([0.11, 0.09, 0.11], [0, -0.48, 0], BONE)
      .done();
    arm.rotation.x = -0.2;
  }

  return { type: 'biped', root, parts, height: 1.6, eyes: kit.eyes };
}
