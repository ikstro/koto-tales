/**
 * Соломія: long chestnut hair down to the waist, side-swept fringe with a pink
 * clip, pink sweater with a ribbed hem and a little heart, light-grey
 * leggings, pink shoes. A magic wand with a pink star in the left hand.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas } from '../faces';
import { bipedFrame } from './frames';
import { addWand } from './gear';
import { Kit } from './kit';

const SWEATER = '#f47fb4';
const RIB = '#d9548f';
const HAIR = '#7a3b20';
const SKIN = '#f8d3b4';
const LEGGINGS = '#d4d7e2';
const SHOES = '#ff5d9e';

const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

export function build(skin: Skin): Rig {
  const kit = new Kit('solomiia', skin, faceAtlas('solomiia'));
  const { root, parts } = bipedFrame({ legH: 0.48, hipX: 0.11, bodyH: 0.45, armX: 0.31, shoulderY: 0.41 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.19, 0.4, 0.21], [0, -0.19, 0], LEGGINGS)
      .box([0.2, 0.1, 0.26], [0, -0.43, 0.025], SHOES)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.47, 0.39, 0.27], [0, 0.26, 0], SWEATER)
    .box([0.12, 0.05, 0.28], [0, 0.44, 0], SWEATER)
    .box([0.49, 0.08, 0.29], [0, 0.04, 0], RIB)
    .pixels(HEART, { '#': RIB }, [-0.105, 0.36, 0.135], 0.03, 0.012)
    // long hair falling down the back to the waist
    .box([0.52, 0.36, 0.08], [0, 0.27, -0.17], HAIR)
    .box([0.44, 0.08, 0.07], [0, 0.07, -0.165], HAIR)
    .done();

  const hair = { s: 1 };
  const shade = { s: 2 };
  kit
    .part('head', parts.head)
    .box([0.5, 0.48, 0.46], [0, 0.24, 0], { s: 0, face: true })
    .box([0.55, 0.1, 0.51], [0, 0.5, -0.005], hair)
    .box([0.44, 0.05, 0.4], [0, 0.57, -0.02], hair)
    .box([0.56, 0.5, 0.07], [0, 0.25, -0.25], hair)
    // long sides framing the face
    .box([0.07, 0.5, 0.45], [0.275, 0.22, -0.02], hair)
    .box([0.07, 0.5, 0.45], [-0.275, 0.22, -0.02], hair)
    .box([0.07, 0.12, 0.2], [0.275, -0.07, 0.08], shade)
    .box([0.07, 0.12, 0.2], [-0.275, -0.07, 0.08], shade)
    // side-swept fringe, deeper on her right
    .box([0.3, 0.17, 0.06], [-0.11, 0.395, 0.25], hair)
    .box([0.27, 0.1, 0.06], [0.135, 0.43, 0.25], hair)
    .box([0.12, 0.05, 0.06], [-0.05, 0.31, 0.25], shade)
    // pink clip
    .box([0.12, 0.06, 0.04], [0.16, 0.37, 0.28], { s: 3 })
    .box([0.04, 0.03, 0.01], [0.13, 0.375, 0.3], { s: 4 })
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    kit
      .part(arm.name, arm)
      .box([0.15, 0.36, 0.17], [0, -0.14, 0], SWEATER)
      .box([0.13, 0.1, 0.14], [0, -0.37, 0], SKIN)
      .done();
  }
  const tool = addWand(kit, parts.armL, -0.39);

  return { type: 'biped', root, parts: { ...parts, tool }, height: 1.5, eyes: kit.eyes };
}
