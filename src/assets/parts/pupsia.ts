/**
 * Пупся: a tabby cat — warm brown fur with dark stripe bands, an "M" on the
 * forehead, white chest, belly and front paws, pink nose, big green eyes,
 * whiskers, a two-segment striped tail held up.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas } from '../faces';
import { quadFrame } from './frames';
import { Kit } from './kit';

const FUR = '#9a8770'; // brown-grey, like the real Пупся
const STRIPE = '#3b3029';
const WHITE = '#f7f2ea';

export function build(skin: Skin): Rig {
  const kit = new Kit('pupsia', skin, faceAtlas('pupsia'));
  const { root, parts } = quadFrame({
    legH: 0.3,
    legX: 0.11,
    backZ: -0.27,
    frontZ: 0.27,
    head: [0, 0.25, 0.66],
    tail: [0, 0.2, -0.08],
    tailLen: 0.3,
  });

  // body: pivot at the back hips, torso reaches forward along +Z
  const b = kit.part('body', parts.body).box([0.36, 0.34, 0.78], [0, 0.1, 0.27], FUR);
  for (const z of [0.0, 0.14, 0.28, 0.42]) {
    b.box([0.37, 0.025, 0.06], [0, 0.272, z], STRIPE);
    b.box([0.012, 0.17, 0.06], [0.184, 0.17, z], STRIPE);
    b.box([0.012, 0.17, 0.06], [-0.184, 0.17, z], STRIPE);
  }
  b.box([0.37, 0.03, 0.1], [0, 0.27, -0.08], STRIPE);
  b.box([0.26, 0.26, 0.02], [0, 0.03, 0.665], WHITE)
    .box([0.24, 0.02, 0.56], [0, -0.075, 0.36], WHITE)
    .done();

  for (const leg of [parts.legFL, parts.legFR]) {
    kit
      .part(leg.name, leg)
      .box([0.13, 0.26, 0.14], [0, -0.11, 0], FUR)
      .box([0.14, 0.07, 0.17], [0, -0.265, 0.012], WHITE)
      .done();
  }
  for (const leg of [parts.legBL, parts.legBR]) {
    kit.part(leg.name, leg).box([0.14, 0.33, 0.17], [0, -0.135, 0], FUR).done();
  }

  const fur = { s: 0 };
  kit
    .part('head', parts.head)
    .box([0.42, 0.34, 0.32], [0, 0.06, 0.12], { s: 0, face: true })
    // pointy ears with pink insides
    .box([0.13, 0.1, 0.08], [0.14, 0.27, 0.05], fur)
    .box([0.13, 0.1, 0.08], [-0.14, 0.27, 0.05], fur)
    .box([0.08, 0.07, 0.07], [0.155, 0.35, 0.05], fur)
    .box([0.08, 0.07, 0.07], [-0.155, 0.35, 0.05], fur)
    .box([0.04, 0.05, 0.05], [0.17, 0.405, 0.05], fur)
    .box([0.04, 0.05, 0.05], [-0.17, 0.405, 0.05], fur)
    .box([0.07, 0.09, 0.01], [0.145, 0.29, 0.092], { s: 3 })
    .box([0.07, 0.09, 0.01], [-0.145, 0.29, 0.092], { s: 3 })
    // muzzle, nose, whiskers
    .box([0.2, 0.1, 0.06], [0, -0.05, 0.3], { s: 2 })
    .box([0.07, 0.04, 0.03], [0, -0.005, 0.33], { s: 3 })
    .box([0.17, 0.012, 0.012], [0.18, -0.03, 0.31], { s: 4 }, [0, 0, 0.12])
    .box([0.17, 0.012, 0.012], [0.18, -0.07, 0.31], { s: 4 }, [0, 0, -0.08])
    .box([0.17, 0.012, 0.012], [-0.18, -0.03, 0.31], { s: 4 }, [0, 0, -0.12])
    .box([0.17, 0.012, 0.012], [-0.18, -0.07, 0.31], { s: 4 }, [0, 0, 0.08])
    .done();

  // tail held up and back; the second segment curls further up, dark tip
  parts.tail.rotation.x = 0.85;
  parts.tail2.rotation.x = 0.35;
  kit.part('tail', parts.tail).box([0.09, 0.09, 0.32], [0, 0, -0.15], FUR).done();
  kit.part('tail2', parts.tail2).box([0.08, 0.08, 0.26], [0, 0, -0.12], STRIPE).done();

  return { type: 'quadruped', root, parts, height: 1.0, eyes: kit.eyes };
}
