/**
 * Давид: a light-brown buzz cut (shaved sides, a little longer on top, a tiny
 * fringe), brown eyes and a big open grin with teeth, round pink cheeks; a
 * lemon-yellow tee, blue jeans, white sneakers with grey soles. A friendly toy
 * sword with a gold crossguard always in the right hand; the throwing axe
 * appears in the left one while he throws.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { addAxe } from './gear';
import { Kit } from './kit';

const SHIRT = '#f2f09a';
const SHIRT_HEM = '#dcd56c';
const SKIN = '#f4c6a0';
const JEANS = '#3f70b8';
const JEANS_CUFF = '#355f9e';
const SHOES = '#f4f4f1';
const SOLES = '#a7acb5';
const BLADE = '#d9e0e6';
const BLADE_SHINE = '#f4f7f9';
const GUARD = '#eab02b';
const GRIP = '#8a5228';

export const face: FaceSpec = {
  // skin, hair, hair shade, ear, cheek, shaved sides
  swatches: [SKIN, '#a77a4e', '#8c623c', '#e7b08a', '#f29b8c', '#dcb18c'],
  pal: { H: '#a77a4e', K: '#2a1a10', B: '#7a4a24', W: '#ffffff', P: '#f39a8a', M: '#8e3a36', R: '#ef7f86' },
  open: [
    'HHHHHHHH',
    '........',
    '.BW..BW.',
    '.KB..KB.',
    'P......P',
    '.MWWWWM.',
    '..MRRM..',
    '........',
  ],
  closed: { 2: '........', 3: '.KK..KK.' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('david', skin, faceAtlas('david', face));
  const { root, parts } = bipedFrame({ legH: 0.5, hipX: 0.115, bodyH: 0.46, armX: 0.315, shoulderY: 0.42 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.2, 0.41, 0.22], [0, -0.2, 0], JEANS)
      .box([0.205, 0.05, 0.225], [0, -0.37, 0], JEANS_CUFF)
      .box([0.21, 0.08, 0.27], [0, -0.43, 0.025], SHOES)
      .box([0.215, 0.035, 0.275], [0, -0.4825, 0.025], SOLES)
      .done();
  }

  kit
    .part('body', parts.body)
    .box([0.48, 0.46, 0.27], [0, 0.23, 0], SHIRT)
    .box([0.5, 0.06, 0.29], [0, 0.03, 0], SHIRT_HEM)
    .box([0.16, 0.03, 0.02], [0, 0.445, 0.135], SHIRT_HEM)
    .done();

  const hair = { s: 1 };
  const shade = { s: 2 };
  const shaved = { s: 5 };
  kit
    .part('head', parts.head)
    .box([0.5, 0.48, 0.46], [0, 0.24, 0], { s: 0, face: true })
    .box([0.05, 0.1, 0.09], [0.265, 0.2, 0], { s: 3 })
    .box([0.05, 0.1, 0.09], [-0.265, 0.2, 0], { s: 3 })
    // buzz cut: a short top, shaved sides and back, a tiny fringe
    .box([0.52, 0.05, 0.48], [0, 0.495, 0], hair)
    .box([0.42, 0.02, 0.38], [0, 0.525, 0.01], hair)
    .box([0.02, 0.15, 0.44], [0.255, 0.395, 0], shaved)
    .box([0.02, 0.15, 0.44], [-0.255, 0.395, 0], shaved)
    .box([0.5, 0.2, 0.02], [0, 0.38, -0.235], shaved)
    .box([0.44, 0.045, 0.03], [0, 0.455, 0.24], hair)
    .box([0.08, 0.025, 0.035], [-0.12, 0.425, 0.24], shade)
    .box([0.08, 0.025, 0.035], [0.08, 0.425, 0.24], shade)
    .done();

  for (const arm of [parts.armL, parts.armR]) {
    const b = kit
      .part(arm.name, arm)
      .box([0.16, 0.17, 0.18], [0, -0.045, 0], SHIRT)
      .box([0.13, 0.3, 0.15], [0, -0.27, 0], SKIN);
    if (arm === parts.armR) {
      // the toy sword, always in the right hand: grip out of the fist, gold guard, a short blunt blade
      b.box([0.055, 0.09, 0.055], [0, -0.44, 0], GRIP)
        .box([0.2, 0.045, 0.07], [0, -0.5, 0], GUARD)
        .box([0.08, 0.3, 0.03], [0, -0.67, 0], BLADE)
        .box([0.02, 0.26, 0.034], [0, -0.66, 0], BLADE_SHINE)
        .box([0.05, 0.04, 0.03], [0, -0.835, 0], BLADE);
    }
    b.done();
  }
  const tool = addAxe(kit, parts.armL, -0.4);

  return { type: 'biped', root, parts: { ...parts, tool }, height: 1.48, eyes: kit.eyes };
}
