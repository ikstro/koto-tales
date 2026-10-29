/**
 * Elves of the forest: slim, long-legged, pointed ears, a leaf cap (the elder:
 * silver hair, a long robe, a gold circlet and a little staff). Three adults
 * differ in tunic and trim colours; the kid is small with a big head.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceId } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const SKIN = '#f3d0a8';
const SKIN_ELDER = '#f0cba4';
const GOLD = '#e0a92e';
const WOOD = '#8a5a2b';
const LEAF = ['..#.', '.##.', '###.', '###.', '.##.', '..#.'];

interface Look {
  id: string;
  face: FaceId;
  tunic: string;
  trim: string;
  cap: string;
  hair: string;
  pants: string;
  boots: string;
  /** Limb scale, head scale, width scale. */
  k: number;
  hk: number;
  w: number;
  height: number;
  elder?: boolean;
}

const LOOKS: Record<string, Look> = {
  elf_1: { id: 'elf_1', face: 'elf', tunic: '#4f8a3c', trim: GOLD, cap: '#3f7a34', hair: '#b8873a', pants: '#8b7a4a', boots: '#6e4520', k: 1, hk: 1, w: 1, height: 1.58 },
  elf_2: { id: 'elf_2', face: 'elf', tunic: '#d6a53a', trim: '#3f7a34', cap: '#6e9c3c', hair: '#6e4520', pants: '#5a7a3a', boots: '#7a4a24', k: 1, hk: 1, w: 1, height: 1.58 },
  elf_3: { id: 'elf_3', face: 'elf', tunic: '#2f7d6b', trim: '#ffe3a3', cap: '#c98a2a', hair: '#e8c46a', pants: '#a08a5c', boots: '#8a5a2b', k: 1, hk: 1, w: 1, height: 1.58 },
  elf_elder: { id: 'elf_elder', face: 'elf_elder', tunic: '#4b7a42', trim: GOLD, cap: GOLD, hair: '#cfd7de', pants: '#4b7a42', boots: '#6e4520', k: 1.04, hk: 1, w: 1, height: 1.62, elder: true },
  elf_kid: { id: 'elf_kid', face: 'elf', tunic: '#7fae44', trim: GOLD, cap: '#4f8a3c', hair: '#d6a640', pants: '#9a8a58', boots: '#7a4a24', k: 0.58, hk: 0.86, w: 0.8, height: 1.04 },
};

function make(skin: Skin, L: Look): Rig {
  const { k, hk, w } = L;
  const elder = !!L.elder;
  const kit = new Kit(L.id, skin, faceAtlas(L.face));
  const legH = 0.58 * k;
  const bodyH = 0.48 * k;
  const torsoW = 0.34 * w;
  const { root, parts } = bipedFrame({ legH, hipX: 0.1 * w, bodyH, armX: 0.235 * w, shoulderY: bodyH - 0.04 });
  const skinC = elder ? SKIN_ELDER : SKIN;

  // legs: trousers and tall boots, or the elder's robe slice down to the boots
  for (const leg of [parts.legL, parts.legR]) {
    const p = kit.part(leg.name, leg);
    if (elder) {
      p.box([0.2, legH * 0.8, 0.27], [0, -legH * 0.4, 0], L.tunic)
        .box([0.21, 0.04, 0.28], [0, -legH * 0.78, 0], L.trim)
        .box([0.14, 0.12, 0.2], [0, -legH + 0.06, 0.02], L.boots);
    } else {
      p.box([0.13 * w, legH * 0.7, 0.14 * w], [0, -legH * 0.35, 0], L.pants)
        .box([0.15 * w, 0.04, 0.16 * w], [0, -legH * 0.69, 0], L.trim)
        .box([0.15 * w, legH * 0.3, 0.19 * w], [0, -legH + legH * 0.15, 0.015], L.boots);
    }
    p.done();
  }

  // body: tunic with a belt, a hem that flares over the hips, a leaf print
  const body = kit.part('body', parts.body);
  body
    .box([torsoW, bodyH * 0.72, 0.22 * w], [0, bodyH * 0.64, 0], L.tunic)
    .box([torsoW + 0.04, 0.05, 0.24 * w], [0, bodyH * 0.3, 0], L.trim)
    .box([torsoW + 0.07, bodyH * 0.42, 0.27 * w], [0, bodyH * 0.1, 0], L.tunic)
    .box([torsoW + 0.08, 0.04, 0.28 * w], [0, -bodyH * 0.1, 0], L.trim)
    .box([0.18 * w, 0.05, 0.23 * w], [0, bodyH - 0.01, 0], L.trim);
  if (elder) body.box([torsoW + 0.04, bodyH * 0.9, 0.05], [0, bodyH * 0.55, -0.15 * w], L.tunic);
  body.pixels(LEAF, { '#': L.trim }, [-0.06 * w, bodyH * 0.84, 0.11 * w], 0.026 * w, 0.012).done();

  // head: face box, pointed ears, hair, and the cap or circlet
  const hw = 0.4 * hk;
  const hh = 0.4 * hk;
  const hd = 0.38 * hk;
  const head = kit.part('head', parts.head);
  head
    .box([hw, hh, hd], [0, hh / 2, 0], { s: 0, face: true })
    .box([0.24 * hk, 0.07 * hk, 0.075], [hw / 2 + 0.08 * hk, hh * 0.52, 0], { s: 0 }, [0, 0, 0.5])
    .box([0.24 * hk, 0.07 * hk, 0.075], [-hw / 2 - 0.08 * hk, hh * 0.52, 0], { s: 0 }, [0, 0, -0.5])
    // hair: top, fringe, sides, back
    .box([hw + 0.04, 0.07 * hk, hd + 0.04], [0, hh + 0.005, -0.005], L.hair)
    .box([hw + 0.04, 0.09 * hk, 0.05], [0, hh - 0.045 * hk, hd / 2 + 0.015], L.hair)
    .box([0.045, hh * 0.32, hd * 0.85], [hw / 2 + 0.012, hh * 0.82, -0.02], L.hair)
    .box([0.045, hh * 0.32, hd * 0.85], [-hw / 2 - 0.012, hh * 0.82, -0.02], L.hair);
  if (elder) {
    // long silver hair down the back and a gold circlet with a green jewel
    head
      .box([hw + 0.05, hh * 1.3, 0.07], [0, hh * 0.38, -hd / 2 - 0.03], L.hair)
      .box([0.05, hh * 0.9, hd * 0.8], [hw / 2 + 0.015, hh * 0.45, -0.03], L.hair)
      .box([0.05, hh * 0.9, hd * 0.8], [-hw / 2 - 0.015, hh * 0.45, -0.03], L.hair)
      .box([hw + 0.07, 0.04, hd + 0.07], [0, hh * 0.8, 0], GOLD)
      .box([0.06, 0.07, 0.03], [0, hh * 0.8, hd / 2 + 0.04], '#3f9a52');
  } else {
    // leaf cap: a crown, a leaf tip sweeping back and up, a gold leaf badge
    head
      .box([hw + 0.06, 0.1 * hk, hd + 0.06], [0, hh + 0.075 * hk, -0.01], L.cap)
      .box([hw * 0.74, 0.08 * hk, hd * 0.6], [0, hh + 0.16 * hk, -hd * 0.12], L.cap)
      .box([hw * 0.5, 0.07 * hk, hd * 0.5], [0, hh + 0.2 * hk, -hd * 0.42], L.cap, [0.25, 0, 0])
      .box([hw * 0.26, 0.06 * hk, hd * 0.5], [0, hh + 0.245 * hk, -hd * 0.78], L.cap, [0.55, 0, 0])
      .box([hw * 0.12, 0.05 * hk, hd * 0.3], [0, hh + 0.31 * hk, -hd * 1.05], L.cap, [0.9, 0, 0])
      .box([0.11 * hk, 0.11 * hk, 0.03], [0, hh + 0.075 * hk, hd / 2 + 0.03], L.trim, [0, 0, Math.PI / 4]);
  }
  head.done();

  // arms: sleeves and bare hands; the elder's right hand holds a little staff
  for (const arm of [parts.armL, parts.armR]) {
    const a = kit.part(arm.name, arm);
    const sleeve = bodyH * 0.55;
    a.box([0.115 * w, sleeve, 0.14 * w], [0, -sleeve / 2 + 0.03, 0], L.tunic)
      .box([0.12 * w, 0.035, 0.145 * w], [0, -sleeve + 0.03, 0], L.trim)
      .box([0.09 * w, 0.1 * k, 0.1 * w], [0, -sleeve - 0.02, 0], skinC);
    if (elder && arm === parts.armR) {
      const top = 0.28;
      const bottom = -(legH + 0.4);
      a.box([0.05, top - bottom, 0.05], [0, (top + bottom) / 2, 0.1], WOOD)
        .box([0.1, 0.1, 0.1], [0, top + 0.05, 0.1], GOLD, [0, 0, Math.PI / 4])
        .box([0.04, 0.12, 0.04], [0, top + 0.17, 0.1], '#3f9a52')
        .box([0.11, 0.11, 0.13], [0, -sleeve - 0.02, 0.04], skinC);
    }
    a.done();
  }

  return { type: 'biped', root, parts, height: L.height, eyes: kit.eyes };
}

export const buildElfElder = (skin: Skin): Rig => make(skin, LOOKS.elf_elder);
export const buildElf1 = (skin: Skin): Rig => make(skin, LOOKS.elf_1);
export const buildElf2 = (skin: Skin): Rig => make(skin, LOOKS.elf_2);
export const buildElf3 = (skin: Skin): Rig => make(skin, LOOKS.elf_3);
export const buildElfKid = (skin: Skin): Rig => make(skin, LOOKS.elf_kid);
