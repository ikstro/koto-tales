/**
 * Сова: a round brown owl flying over the party's heads — a big head with huge cream-ringed
 * eyes and a mustard beak, two dark ear tufts, a cream belly with little darts, small mustard
 * feet tucked under it and two broad wings. ~0.75 tall itself, its middle ~1.5 above the ground.
 *
 * Rig: biped with its feet up in the air, so the animator's walk swings the empty `armL`/`armR`
 * pivots; each `Wing` reads that swing and flaps up and down instead (an arm turns forward and
 * back, both ways at once), so a cheer lifts both wings and a dance takes them in turn. `Hover`
 * holds the whole bird up with a slow bob. Both are moved as the scene updates, no engine code.
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const BROWN = '#8a6238';
const DARK = '#5f4226';
const LIGHT = '#b08552';
const CREAM = '#f2dfb8';
const BEAK = '#eab02b';

/** How far the wings stand open while it hangs in the air (0 = folded, ~1.57 = straight out). */
const OPEN = 0.95;

/** The 8×8 face printed on the head's front (`src/assets/faces.ts`). Swatch 0 is the head's colour. */
export const face: FaceSpec = {
  swatches: [BROWN, DARK, CREAM],
  pal: { K: '#2a1a10', W: '#fbf0d6', G: '#ffffff' },
  open: [
    '........',
    '.WW..WW.',
    'WGKWWGKW',
    'WKKWWKKW',
    'WKKWWKKW',
    '.WW..WW.',
    '........',
    '........',
  ],
  closed: { 2: 'WWWWWWWW', 3: 'WWWWWWWW', 4: 'WKKWWKKW' },
};

/** One wing, hinged at the shoulder: opens by how far the animator swung its arm, with a slow flutter. */
class Wing extends THREE.Group {
  private arm?: THREE.Object3D | undefined;

  override updateMatrixWorld(force?: boolean): void {
    const left = this.name === 'wingL';
    this.arm ??= this.parent?.getObjectByName(left ? 'armL' : 'armR');
    const swing = Math.min(1, Math.abs(this.arm?.rotation.x ?? 0));
    const flutter = Math.sin(performance.now() * 0.006) * 0.14;
    this.rotation.z = (left ? 1 : -1) * (OPEN + flutter + swing * 1.05);
    super.updateMatrixWorld(force);
  }
}

/** Everything that flies: a slow bob on top of the animator's own. */
class Hover extends THREE.Group {
  override updateMatrixWorld(force?: boolean): void {
    this.position.y = Math.sin(performance.now() * 0.0028) * 0.07;
    super.updateMatrixWorld(force);
  }
}

export function build(skin: Skin): Rig {
  const kit = new Kit('owl', skin, faceAtlas('owl', face));
  const { root, parts } = bipedFrame({ legH: 1.2, hipX: 0.1, bodyH: 0.28, armX: 0.25, shoulderY: 0.27 });
  const hover = new Hover();
  hover.name = 'hover';
  root.add(hover);
  hover.add(parts.body, parts.legL, parts.legR);

  kit
    .part('body', parts.body)
    .box([0.46, 0.28, 0.38], [0, 0.15, 0], BROWN)
    .box([0.36, 0.34, 0.3], [0, 0.13, 0], BROWN)
    // the cream belly with rows of little darts
    .box([0.3, 0.25, 0.03], [0, 0.14, 0.19], CREAM)
    .box([0.08, 0.03, 0.012], [-0.08, 0.2, 0.208], LIGHT)
    .box([0.08, 0.03, 0.012], [0.08, 0.2, 0.208], LIGHT)
    .box([0.08, 0.03, 0.012], [0, 0.13, 0.208], LIGHT)
    .box([0.08, 0.03, 0.012], [-0.09, 0.07, 0.205], LIGHT)
    .box([0.08, 0.03, 0.012], [0.09, 0.07, 0.205], LIGHT)
    // the short fan of a tail
    .box([0.24, 0.05, 0.18], [0, 0.04, -0.22], DARK, [0.45, 0, 0])
    .box([0.16, 0.05, 0.16], [0, 0.08, -0.2], BROWN, [0.45, 0, 0])
    .done();

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.07, 0.08, 0.07], [0, -0.01, 0.04], BEAK)
      .box([0.12, 0.04, 0.13], [0, -0.05, 0.07], BEAK)
      .done();
  }

  kit
    .part('head', parts.head)
    .box([0.5, 0.36, 0.42], [0, 0.18, 0], { s: 0, face: true })
    .box([0.36, 0.035, 0.3], [0, 0.375, 0], { s: 0 })
    // the ear tufts and the fat little beak
    .box([0.09, 0.11, 0.09], [0.2, 0.4, 0.02], DARK, [0, 0, -0.35])
    .box([0.09, 0.11, 0.09], [-0.2, 0.4, 0.02], DARK, [0, 0, 0.35])
    .box([0.09, 0.1, 0.06], [0, 0.135, 0.235], BEAK)
    .box([0.05, 0.05, 0.04], [0, 0.1, 0.26], BEAK)
    .done();

  for (const [name, s] of [
    ['wingL', 1],
    ['wingR', -1],
  ] as const) {
    const wing = new Wing();
    wing.name = name;
    wing.position.set(s * 0.24, 0.27, 0);
    parts.body.add(wing);
    kit
      .part(name, wing)
      .box([0.05, 0.26, 0.3], [s * 0.02, -0.13, -0.01], BROWN)
      .box([0.045, 0.14, 0.24], [s * 0.02, -0.32, -0.03], DARK)
      .box([0.04, 0.09, 0.14], [s * 0.02, -0.43, -0.05], LIGHT)
      .box([0.06, 0.1, 0.2], [s * 0.022, -0.08, 0.02], LIGHT)
      .done();
  }

  return { type: 'biped', root, parts, height: 1.9, eyes: kit.eyes };
}
