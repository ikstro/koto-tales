/**
 * Бджілка: a fat little toy bee hovering at about the heroes' chest — a round yellow head with
 * big black eyes, rosy cheeks and a smile, two dark feelers with balls, a plump body in yellow
 * and dark stripes ending in a blunt cream nub, tiny dark legs and two see-through wings beating
 * fast. ~0.55 long, its middle ~1.2 above the ground.
 *
 * Rig: biped with its feet up in the air. `Beat` keeps the wings going and `Hover` keeps the
 * whole bee bobbing whether it moves or not; both are moved as the scene updates, no engine code.
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit, type PartBuilder } from './kit';

const YELLOW = '#ffc928';
const DARK = '#3a2a1e';
const NUB = '#ffe3a3';
const WING = { c: '#e6f6ff', clear: true };

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: [YELLOW, DARK],
  pal: { K: '#231710', W: '#ffffff', P: '#f49a6e', M: '#7a3a1e' },
  open: [
    '........',
    '.KK..KK.',
    '.KW..KW.',
    '.KK..KK.',
    'P......P',
    '..M..M..',
    '...MM...',
    '........',
  ],
  closed: { 1: '........', 2: '........', 3: '.KK..KK.' },
};

/** A wing beating fast, hinged at the back. */
class Beat extends THREE.Group {
  override updateMatrixWorld(force?: boolean): void {
    const side = this.name === 'wingL' ? 1 : -1;
    this.rotation.z = side * (0.42 + Math.sin(performance.now() * 0.045) * 0.5);
    super.updateMatrixWorld(force);
  }
}

/** Everything that flies: a quick little bob on top of the animator's own. */
class Hover extends THREE.Group {
  override updateMatrixWorld(force?: boolean): void {
    this.position.y = Math.sin(performance.now() * 0.0042) * 0.05;
    super.updateMatrixWorld(force);
  }
}

/** One round slice of the body across z, a `d` thick. */
function slice(p: PartBuilder, z: number, len: number, d: number, paint: string): void {
  const y = 0.15;
  p.box([d, d * 0.7, len], [0, y, z], paint)
    .box([d * 0.7, d, len], [0, y, z], paint)
    .box([d * 0.88, d * 0.88, len], [0, y, z], paint);
}

export function build(skin: Skin): Rig {
  const kit = new Kit('bee', skin, faceAtlas('bee', face));
  const { root, parts } = bipedFrame({ legH: 1.03, hipX: 0.09, bodyH: 0.15, armX: 0.13, shoulderY: 0.05 });
  const hover = new Hover();
  hover.name = 'hover';
  root.add(hover);
  hover.add(parts.body, parts.legL, parts.legR);
  parts.head.position.z = 0.09;
  parts.armL.position.z = 0.03;
  parts.armR.position.z = 0.03;
  parts.legL.position.z = -0.09;
  parts.legR.position.z = -0.09;

  const body = kit.part('body', parts.body);
  slice(body, 0.05, 0.09, 0.31, YELLOW);
  slice(body, -0.035, 0.08, 0.34, DARK);
  slice(body, -0.115, 0.08, 0.33, YELLOW);
  slice(body, -0.19, 0.07, 0.27, DARK);
  slice(body, -0.25, 0.05, 0.19, YELLOW);
  body.box([0.07, 0.07, 0.06], [0, 0.15, -0.295], NUB).done();

  kit
    .part('head', parts.head)
    .box([0.3, 0.28, 0.18], [0, 0, 0.06], { s: 0, face: true })
    .box([0.24, 0.32, 0.14], [0, 0, 0.05], { s: 0 })
    .box([0.34, 0.2, 0.14], [0, 0, 0.05], { s: 0 })
    // the feelers
    .beam([0.06, 0.15, 0.06], [0.12, 0.28, 0.1], 0.024, DARK)
    .beam([-0.06, 0.15, 0.06], [-0.12, 0.28, 0.1], 0.024, DARK)
    .box([0.06, 0.06, 0.06], [0.125, 0.295, 0.1], DARK)
    .box([0.06, 0.06, 0.06], [-0.125, 0.295, 0.1], DARK)
    .done();

  for (const limb of [parts.armL, parts.armR, parts.legL, parts.legR]) {
    kit.part(limb.name, limb).box([0.04, 0.1, 0.05], [0, -0.04, 0], DARK).done();
  }

  for (const [name, s] of [
    ['wingL', 1],
    ['wingR', -1],
  ] as const) {
    const wing = new Beat();
    wing.name = name;
    wing.position.set(s * 0.07, 0.3, -0.05);
    parts.body.add(wing);
    kit
      .part(name, wing)
      .box([0.34, 0.016, 0.16], [s * 0.18, 0, 0], WING)
      .box([0.24, 0.016, 0.22], [s * 0.19, 0, -0.01], WING)
      .done();
  }

  return { type: 'biped', root, parts, height: 1.4, eyes: kit.eyes };
}
