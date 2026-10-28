/**
 * Льоша: blond bowl cut with a jagged fringe, navy tee with a light-blue cat
 * on the chest, dark-grey trousers, white sneakers. Bow in the left hand.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas } from '../faces';
import { bipedFrame } from './frames';
import { addBow } from './gear';
import { Kit } from './kit';

const SHIRT = '#22306e';
const CAT = '#86aef0';
const SKIN = '#f6c9a2';
const TROUSERS = '#454a57';
const SHOES = '#f7f7f4';

const CAT_ART = [
  '.#...#..',
  '.##.##..',
  '.#####..',
  '.#####..',
  '..###...',
  '.#####.#',
  '.#####.#',
  '.######.',
];

export function build(skin: Skin): Rig {
  const kit = new Kit('lyosha', skin, faceAtlas('lyosha'));
  const { root, parts } = bipedFrame({ legH: 0.5, hipX: 0.115, bodyH: 0.46, armX: 0.315, shoulderY: 0.42 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.2, 0.41, 0.22], [0, -0.2, 0], TROUSERS)
      .box([0.21, 0.11, 0.27], [0, -0.445, 0.025], SHOES)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.48, 0.46, 0.27], [0, 0.23, 0], SHIRT)
    .box([0.5, 0.06, 0.29], [0, 0.03, 0], SHIRT)
    .pixels(CAT_ART, { '#': CAT }, [-0.12, 0.38, 0.135], 0.03, 0.012)
    .done();

  const hair = { s: 1 };
  const shade = { s: 2 };
  kit
    .part('head', parts.head)
    .box([0.5, 0.48, 0.46], [0, 0.24, 0], { s: 0, face: true })
    .box([0.05, 0.1, 0.09], [0.265, 0.2, 0], { s: 3 })
    .box([0.05, 0.1, 0.09], [-0.265, 0.2, 0], { s: 3 })
    // bowl cut: cap, back, sides to ear level, thick fringe with jagged tips
    .box([0.55, 0.1, 0.51], [0, 0.5, -0.005], hair)
    .box([0.42, 0.04, 0.38], [0, 0.565, -0.02], hair)
    .box([0.55, 0.36, 0.06], [0, 0.33, -0.245], hair)
    .box([0.06, 0.2, 0.47], [0.27, 0.38, -0.01], hair)
    .box([0.06, 0.2, 0.47], [-0.27, 0.38, -0.01], hair)
    .box([0.56, 0.12, 0.06], [0, 0.43, 0.25], hair)
    .box([0.09, 0.06, 0.05], [-0.21, 0.35, 0.25], shade)
    .box([0.1, 0.045, 0.05], [-0.08, 0.355, 0.25], hair)
    .box([0.09, 0.065, 0.05], [0.05, 0.345, 0.25], shade)
    .box([0.1, 0.045, 0.05], [0.19, 0.355, 0.25], hair)
    .box([0.12, 0.03, 0.2], [0.1, 0.555, 0.08], shade)
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    kit
      .part(arm.name, arm)
      .box([0.16, 0.17, 0.18], [0, -0.045, 0], SHIRT)
      .box([0.13, 0.3, 0.15], [0, -0.27, 0], SKIN)
      .done();
  }
  const tool = addBow(kit, parts.armL, -0.4);

  return { type: 'biped', root, parts: { ...parts, tool }, height: 1.52, eyes: kit.eyes };
}
