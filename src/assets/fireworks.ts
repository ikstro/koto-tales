/**
 * The fireworks launcher: a low wooden crate with a mustard band and a burst printed on its front,
 * six fat cream tubes in two rows, each with a coloured stripe and a round cap in its colour, and a
 * curly fuse up the crate's side with a little tip. When it fires the crate jolts, the tip lights,
 * the caps hop one after the other and a soft puff rolls out of each tube. Origin at the floor
 * centre of the 1×1, front towards +Z; the salute in the sky is the game's, this is the toy below.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { C_OFF, C_WARM, CHARCOAL, CORAL, CREAM, MUSTARD, TAU, TEAL, WOOD, WOOD_DARK, setGlow } from './buildingParts';
import { Build, finishShadows, fx } from './villages';

const PINK = '#ee6a82';
const BLUE = '#2f7fd6';
const GREEN = '#3fa142';
const TUBE = '#fff1c8';

/** Crate height, and the six tubes: x, z, how far they stand out of it, their colour. */
const CRATE = 0.42;
const TUBES: readonly [number, number, number, string][] = [
  [-0.27, -0.18, 0.5, TEAL],
  [0, -0.18, 0.6, CORAL],
  [0.27, -0.18, 0.5, BLUE],
  [-0.27, 0.16, 0.34, MUSTARD],
  [0, 0.16, 0.4, PINK],
  [0.27, 0.16, 0.34, GREEN],
];
const TUBE_R = 0.115;
/** How long the puffs last, seconds. */
const PUFF_LIFE = 1.3;

export function createFireworks(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'fireworks';
  const b = new Build(skin, 'fireworks');
  root.add(b.root);
  const body = b.root;

  // the crate: planks, a band, corner posts, a dark top the tubes stand in
  b.box([0.92, CRATE, 0.82], [0, CRATE / 2, 0], WOOD);
  for (const y of [0.13, 0.27]) b.box([0.94, 0.02, 0.84], [0, y, 0], WOOD_DARK);
  b.box([0.96, 0.08, 0.86], [0, CRATE - 0.03, 0], MUSTARD);
  b.box([0.86, 0.02, 0.76], [0, CRATE + 0.015, 0], CHARCOAL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.1, CRATE - 0.06, 0.1], [sx * 0.44, (CRATE - 0.06) / 2, sz * 0.39], WOOD_DARK);

  // the burst printed on the front: rays round a mustard middle
  const pz = 0.42;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.box([0.035, 0.1, 0.012], [Math.sin(a) * 0.1, 0.18 + Math.cos(a) * 0.1, pz], i % 2 ? CREAM : CORAL, [0, 0, -a]);
  }
  b.box([0.07, 0.07, 0.014], [0, 0.18, pz], MUSTARD, [0, 0, Math.PI / 4]);

  // the tubes
  for (const [x, z, h, c] of TUBES) {
    b.cyl(TUBE_R, h, [x, CRATE + h / 2, z], TUBE, { seg: 14 });
    b.cyl(TUBE_R + 0.004, 0.08, [x, CRATE + h * 0.56, z], c, { seg: 14 });
    b.cyl(TUBE_R + 0.014, 0.035, [x, CRATE + 0.02, z], WOOD_DARK, { seg: 14 });
  }

  // the fuse: out of the crate's side, a curl up its edge, a small tip
  const F = [
    [0.47, 0.18, 0.28],
    [0.51, 0.26, 0.3],
    [0.48, 0.36, 0.34],
    [0.51, 0.46, 0.3],
    [0.47, 0.54, 0.26],
  ] as const;
  for (let i = 0; i + 1 < F.length; i++) b.beam(F[i], F[i + 1], 0.028, CHARCOAL);
  const tipMat = b.glowBall('tip', '#ffd23a', 0.042, [0.47, 0.56, 0.26]).finish().tip;
  setGlow(tipMat, C_OFF, 0);

  // the six caps, one instanced draw: they hop when it fires
  const capGeo = new THREE.SphereGeometry(TUBE_R + 0.022, 12, 7, 0, TAU, 0, Math.PI / 2).scale(1, 0.72, 1);
  const caps = new THREE.InstancedMesh(capGeo, skin.partMaterial(0xffffff), TUBES.length);
  caps.castShadow = true;
  caps.frustumCulled = false;
  const col = new THREE.Color();
  const cream = new THREE.Color(CREAM);
  TUBES.forEach(([, , , c], i) => caps.setColorAt(i, col.set(c)));
  body.add(caps);

  // the puffs: little round clouds, each tinted by its tube
  const puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), skin.partMaterial(0xffffff), TUBES.length);
  puffs.frustumCulled = false;
  puffs.visible = false;
  TUBES.forEach(([, , , c], i) => puffs.setColorAt(i, col.set(c).lerp(cream, 0.72)));
  root.add(fx(puffs));

  finishShadows(root);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const setCaps = (p: number): void => {
    for (let i = 0; i < TUBES.length; i++) {
      const [x, z, h] = TUBES[i];
      const u = (p - i * 0.06) / 0.5;
      const hop = u > 0 && u < 1 ? 4 * u * (1 - u) * 0.34 : 0;
      caps.setMatrixAt(i, m4.compose(pos.set(x, CRATE + h + hop, z), q, one));
    }
    caps.instanceMatrix.needsUpdate = true;
  };
  setCaps(Infinity);
  let rested = true;
  let lit = false;
  return {
    root,
    update(_dt, k) {
      const p = k.pulse ?? Infinity;
      const going = p < PUFF_LIFE;
      if (going !== lit) {
        lit = going;
        if (going) setGlow(tipMat, C_WARM, 1.4);
        else setGlow(tipMat, C_OFF, 0);
      }
      if (!going) {
        if (rested) return;
        rested = true;
        body.scale.set(1, 1, 1);
        setCaps(Infinity);
        puffs.visible = false;
        return;
      }
      rested = false;
      const jolt = Math.exp(-p * 9);
      body.scale.set(1 + jolt * 0.04, 1 - jolt * 0.08, 1 + jolt * 0.04);
      setCaps(p);
      puffs.visible = true;
      for (let i = 0; i < TUBES.length; i++) {
        const [x, z, h] = TUBES[i];
        const life = (p - i * 0.06) / PUFF_LIFE;
        const s = life <= 0 || life >= 1 ? 0.0001 : 0.15 * Math.sin(Math.PI * Math.sqrt(life));
        pos.set(x + Math.sin(i * 2.4) * life * 0.3, CRATE + h + 0.12 + life * 1.05, z + Math.cos(i * 2.4) * life * 0.3);
        puffs.setMatrixAt(i, m4.compose(pos, q, scl.setScalar(s)));
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
  };
}
