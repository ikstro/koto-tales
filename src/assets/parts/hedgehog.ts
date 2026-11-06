/**
 * Їжачок: a round little hedgehog with a dome of chunky brown spikes (blocks, light at the tips,
 * swept back), a cream face and belly, a pointy snout with a black button nose, rosy cheeks,
 * small round ears and stubby feet. ~0.6 tall.
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { quadFrame } from './frames';
import { Kit, type V3 } from './kit';

const CREAM = '#f3dfbb';
const BROWN = '#7a5233';
const DARK = '#5a3b22';
const TIP = '#c39a68';
const NOSE = '#26211c';

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: [CREAM, BROWN],
  pal: { K: NOSE, W: '#ffffff', P: '#f4a6a0' },
  open: [
    '........',
    '........',
    '.WK..WK.',
    '.KK..KK.',
    '.KK..KK.',
    'PP....PP',
    '........',
    '........',
  ],
  closed: { 2: '........', 3: '........', 4: '.KK..KK.' },
};

export function build(skin: Skin): Rig {
  const kit = new Kit('hedgehog', skin, faceAtlas('hedgehog', face));
  const { root, parts } = quadFrame({
    legH: 0.13,
    legX: 0.14,
    backZ: -0.15,
    frontZ: 0.13,
    head: [0, 0.08, 0.3],
    tail: [0, 0.1, -0.1],
    tailLen: 0.05,
  });

  // the dome: pivot at the back hips, the middle of the dome a little forward of it
  const c: V3 = [0, 0.14, 0.11];
  const body = kit
    .part('body', parts.body)
    .box([0.5, 0.26, 0.52], [c[0], c[1] - 0.02, c[2]], BROWN)
    .box([0.42, 0.38, 0.46], [c[0], c[1], c[2]], BROWN)
    .box([0.3, 0.44, 0.34], [c[0], c[1] + 0.01, c[2]], BROWN)
    // the cream belly and bib
    .box([0.34, 0.04, 0.42], [0, 0, 0.13], CREAM)
    .box([0.26, 0.2, 0.04], [0, 0.08, 0.37], CREAM);

  // spikes in staggered rows over the dome, each a square block and a lighter tip, swept back
  const n = new THREE.Vector3();
  for (let ring = 0; ring < 5; ring++) {
    const along = 0.62 - ring * 0.44; // from over the neck to the rump
    // round the dome from the left side over the back to the right; every other ring staggered
    for (let i = 0; i < 6; i++) {
      const a = (i + (ring % 2) * 0.5) * 0.56;
      n.set(Math.cos(a), Math.sin(a), along).normalize();
      const base: V3 = [c[0] + n.x * 0.215, c[1] + n.y * 0.205, c[2] + n.z * 0.245];
      n.z -= 0.45;
      n.normalize();
      const mid: V3 = [base[0] + n.x * 0.09, base[1] + n.y * 0.09, base[2] + n.z * 0.09];
      const tip: V3 = [base[0] + n.x * 0.15, base[1] + n.y * 0.15, base[2] + n.z * 0.15];
      body.beam(base, mid, 0.085, i % 2 ? DARK : BROWN).beam(mid, tip, 0.05, TIP);
    }
  }
  body.done();

  for (const leg of [parts.legFL, parts.legFR, parts.legBL, parts.legBR]) {
    kit
      .part(leg.name, leg)
      .box([0.12, 0.12, 0.14], [0, -0.06, 0], DARK)
      .box([0.13, 0.04, 0.16], [0, -0.11, 0.015], CREAM)
      .done();
  }

  kit
    .part('head', parts.head)
    .box([0.32, 0.26, 0.22], [0, 0.07, 0.09], { s: 0, face: true })
    // the pointy snout and its button nose
    .box([0.17, 0.11, 0.1], [0, 0.0, 0.24], CREAM)
    .box([0.11, 0.08, 0.07], [0, -0.005, 0.31], CREAM)
    .box([0.075, 0.06, 0.04], [0, 0.015, 0.355], NOSE)
    // little round ears and the spiky fringe running back from the brow
    .box([0.1, 0.1, 0.05], [0.15, 0.22, 0.06], BROWN)
    .box([0.1, 0.1, 0.05], [-0.15, 0.22, 0.06], BROWN)
    .box([0.05, 0.05, 0.02], [0.15, 0.215, 0.09], '#f4a6a0')
    .box([0.05, 0.05, 0.02], [-0.15, 0.215, 0.09], '#f4a6a0')
    .box([0.26, 0.05, 0.14], [0, 0.215, 0.02], BROWN)
    .done();

  // a stub of a tail
  kit.part('tail', parts.tail).box([0.08, 0.07, 0.08], [0, 0, -0.02], DARK).done();
  kit.part('tail2', parts.tail2).box([0.05, 0.05, 0.04], [0, 0, 0], BROWN).done();

  return { type: 'quadruped', root, parts, height: 0.62, eyes: kit.eyes };
}
