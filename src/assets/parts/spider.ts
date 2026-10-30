/**
 * Павучок — a round, fuzzy indigo spider with big shiny eyes, rosy cheeks,
 * two tiny fangs and a light heart on its back. Eight two-segment legs.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { spiderFrame } from './frames';
import { Kit } from './kit';

const BODY = '#5c6bc0';
const LIGHT = '#aab4ec';
const LEG = '#3f4a9a';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). */
export const face: FaceSpec = {
  // body, legs, belly, fang
  swatches: ['#5c6bc0', '#3f4a9a', '#9fa8da', '#ffffff'],
  pal: { K: '#16163a', W: '#ffffff', R: '#ff8a80', F: '#ffffff', P: '#ff9ec7' },
  open: [
    'K......K',
    '........',
    '.KW..KW.',
    '.KK..KK.',
    '.KK..KK.',
    'P......P',
    '..F..F..',
    '..F..F..',
  ],
  closed: { 2: '........', 3: '........', 4: '.KK..KK.' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('spider', skin, faceAtlas('spider', face));
  const { root, parts } = spiderFrame({
    bodyY: 0.32,
    head: [0, 0.0, 0.06],
    legX: 0.24,
    legZ: [0.06, -0.06, -0.18, -0.3],
  });

  kit
    .part('body', parts.body)
    .box([0.6, 0.38, 0.6], [0, 0.08, -0.22], BODY)
    .box([0.5, 0.5, 0.5], [0, 0.08, -0.22], BODY)
    .box([0.4, 0.06, 0.4], [0, 0.34, -0.22], BODY)
    .box([0.4, 0.3, 0.06], [0, 0.08, -0.5], BODY)
    .done();
  // heart on the back (seen from the game camera above)
  const h = kit.part('body', parts.body);
  const heart = ['.#.#.', '#####', '#####', '.###.', '..#..'];
  heart.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') h.box([0.05, 0.02, 0.05], [-0.1 + c * 0.05, 0.375, -0.12 - r * 0.05], LIGHT);
    }
  });
  h.done();

  kit
    .part('head', parts.head)
    .box([0.44, 0.36, 0.3], [0, 0.06, 0.13], { s: 0, face: true })
    .box([0.36, 0.05, 0.24], [0, 0.26, 0.11], { s: 0 })
    .done();

  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const k = i % 4;
    const dz = [0.16, 0.05, -0.06, -0.17][k];
    const p = kit.part(`leg${i}`, parts[`leg${i}`]);
    const knee: [number, number, number] = [side * 0.22, 0.13, dz * 1.3];
    const foot: [number, number, number] = [side * 0.36, -0.31, dz * 2.1];
    p.beam([0, 0, 0], knee, 0.085, LEG).beam(knee, foot, 0.075, LEG).box([0.1, 0.1, 0.1], knee, LEG).box([0.09, 0.05, 0.09], [foot[0], foot[1] + 0.02, foot[2]], LEG).done();
  }

  return { type: 'spider', root, parts, height: 0.7, eyes: kit.eyes };
}
