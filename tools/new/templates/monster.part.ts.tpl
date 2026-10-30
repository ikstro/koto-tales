/**
 * TODO({{id}}): the model. Describe the toy in a sentence here (DESIGN.md materials, no lights).
 * Rig: biped (head, body, armL, armR, legL, legR); nearest examples parts/zombie.ts, parts/skeleton.ts.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const BODY = '#8a6bbd';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: ['#c9b8e8', '#6b5a92'],
  pal: { K: '#26301c', W: '#ffffff', M: '#5b2f3c' },
  open: [
    '........',
    '........',
    '........',
    '.WK..WK.',
    '.KK..KK.',
    '........',
    '..MMMM..',
    '........',
  ],
  closed: { 3: '........', 4: '.KK..KK.' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('{{id}}', skin, faceAtlas('{{id}}', face));
  const { root, parts } = bipedFrame({ legH: 0.54, hipX: 0.12, bodyH: 0.5, armX: 0.33, shoulderY: 0.45 });
  for (const leg of [parts.legL, parts.legR]) kit.part(leg.name, leg).box([0.2, 0.5, 0.22], [0, -0.25, 0], BODY).done();
  kit.part('body', parts.body).box([0.5, 0.48, 0.28], [0, 0.26, 0], BODY).done();
  kit.part('head', parts.head).box([0.5, 0.5, 0.46], [0, 0.25, 0], { s: 0, face: true }).done();
  for (const arm of [parts.armL, parts.armR]) kit.part(arm.name, arm).box([0.14, 0.46, 0.16], [0, -0.2, 0], BODY).done();
  return { type: 'biped', root, parts, height: 1.62, eyes: kit.eyes };
}
