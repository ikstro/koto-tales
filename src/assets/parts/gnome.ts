/**
 * Gnomes of the hills: short and stocky, a big beard, a tall red pointy hat
 * that droops at the tip, a belt and boots. The elder has the longest white
 * beard and a gold band on the hat; the kid has no beard and a small hat.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceId } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const HAT = '#cc4631';
const HAT_DARK = '#a8362c';
const GOLD = '#e0a92e';
const BELT = '#5a3a1e';

interface Look {
  id: string;
  face: FaceId;
  coat: string;
  coatDark: string;
  hat: string;
  band: string;
  beard: string;
  boots: string;
  mitts: string;
  /** Scale of the whole figure, and of the head on it. */
  k: number;
  hk: number;
  /** 0 = no beard, 1 = chest, 2 = belt, 3 = belly. */
  beardLen: number;
  height: number;
  gold?: boolean;
  /** The king: a gold crown instead of the hat, a red cape with a cream collar. */
  king?: { cape: string; collar: string };
}

const LOOKS: Record<string, Look> = {
  gnome_1: { id: 'gnome_1', face: 'gnome', coat: '#3a6ea5', coatDark: '#2d5584', hat: HAT, band: '#eab02b', beard: '#c9742f', boots: '#5a3a1e', mitts: '#7a4a24', k: 1, hk: 1, beardLen: 2, height: 1.1 },
  gnome_2: { id: 'gnome_2', face: 'gnome', coat: '#4a8f3d', coatDark: '#386f2f', hat: HAT, band: '#ffe3a3', beard: '#7a4a2a', boots: '#4a3018', mitts: '#6e4520', k: 1, hk: 1, beardLen: 2, height: 1.1 },
  gnome_3: { id: 'gnome_3', face: 'gnome', coat: '#d9a02b', coatDark: '#b3801f', hat: HAT_DARK, band: '#2f918b', beard: '#b9b5ad', boots: '#5a3a1e', mitts: '#7a4a24', k: 1, hk: 1, beardLen: 2, height: 1.1 },
  gnome_elder: { id: 'gnome_elder', face: 'gnome_elder', coat: '#7a5a8a', coatDark: '#5e436c', hat: HAT, band: GOLD, beard: '#f1ede4', boots: '#4a3018', mitts: '#6e4520', k: 1.04, hk: 1, beardLen: 3, height: 1.15, gold: true },
  gnome_king: {
    id: 'gnome_king', face: 'gnome', coat: '#2f5fa8', coatDark: '#244a84', hat: GOLD, band: GOLD, beard: '#c9742f', boots: '#4a3018', mitts: '#6e4520',
    k: 1.12, hk: 1.04, beardLen: 4, height: 1.32, gold: true, king: { cape: '#c8372c', collar: '#fff4e0' },
  },
  gnome_kid: { id: 'gnome_kid', face: 'gnome_kid', coat: '#e0583f', coatDark: '#b8432f', hat: '#3a6ea5', band: '#ffe3a3', beard: '#000000', boots: '#5a3a1e', mitts: '#7a4a24', k: 0.74, hk: 0.92, beardLen: 0, height: 0.82 },
};

function make(skin: Skin, L: Look): Rig {
  const { k, hk } = L;
  const kit = new Kit(L.id, skin, faceAtlas(L.face));
  const legH = 0.2 * k;
  const bodyH = 0.3 * k;
  const torsoW = 0.44 * k;
  const torsoD = 0.32 * k;
  const { root, parts } = bipedFrame({ legH, hipX: 0.1 * k, bodyH, armX: 0.26 * k, shoulderY: bodyH - 0.04 });

  // stout legs with big boots
  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.17 * k, legH * 0.55, 0.19 * k], [0, -legH * 0.27, 0], L.coatDark)
      .box([0.19 * k, legH * 0.55, 0.26 * k], [0, -legH + legH * 0.27, 0.03 * k], L.boots)
      .done();
  }

  // body: round coat, belt with a buckle, collar
  const body = kit
    .part('body', parts.body)
    .box([torsoW, bodyH * 0.9, torsoD], [0, bodyH * 0.5, 0], L.coat)
    .box([torsoW + 0.02, 0.05 * k + 0.01, torsoD + 0.02], [0, bodyH * 0.2, 0], BELT)
    .box([0.07 * k + 0.02, 0.06 * k + 0.02, 0.02], [0, bodyH * 0.2, torsoD / 2 + 0.02], GOLD)
    .box([torsoW + 0.02, 0.05, torsoD + 0.02], [0, bodyH - 0.03, 0], L.coatDark)
    .box([torsoW - 0.06, 0.06 * k, torsoD + 0.02], [0, -0.01, 0], L.coatDark);
  if (L.king) {
    // the red cape to the heels and a cream collar with dark specks
    const capeH = bodyH + legH - 0.03;
    const cy = (bodyH - (legH - 0.03)) / 2;
    body
      .box([torsoW + 0.1, capeH, 0.05], [0, cy, -torsoD / 2 - 0.03], L.king.cape)
      .box([torsoW + 0.18, capeH * 0.4, 0.05], [0, -legH * 0.55, -torsoD / 2 - 0.05], L.king.cape)
      .box([torsoW + 0.12, 0.08, torsoD + 0.12], [0, bodyH - 0.01, -0.01], L.king.collar);
    for (const x of [-0.16, 0, 0.16]) body.box([0.03, 0.04, 0.02], [x * k, bodyH - 0.01, -torsoD / 2 - 0.07], '#2b2420');
  }
  body.done();

  // head: big and round with a nose; hat and beard are plain colours of the same part
  const big = k > 0.9 ? 1 : 1.12;
  const hw = 0.4 * hk * big;
  const hh = 0.31 * hk * big;
  const hd = 0.36 * hk * big;
  const head = kit.part('head', parts.head);
  head
    .box([hw, hh, hd], [0, hh / 2, 0], { s: 0, face: true })
    .box([0.07 * hk, 0.09 * hk, 0.07], [0, hh * 0.45, hd / 2 + 0.03], { s: 0 })
    .box([0.045, 0.09 * hk, 0.075], [hw / 2 + 0.02, hh * 0.45, 0], { s: 1 })
    .box([0.045, 0.09 * hk, 0.075], [-hw / 2 - 0.02, hh * 0.45, 0], { s: 1 });
  if (L.king) {
    // the crown: a gold band with five points and red and teal jewels, over a ginger mop
    const cr = '#e0a92e';
    head
      .box([hw + 0.03, 0.06, hd + 0.03], [0, hh + 0.02, 0], L.beard)
      .box([hw * 0.86, 0.11, hd * 0.86], [0, hh + 0.09, 0], cr)
      .box([hw * 0.72, 0.04, hd * 0.72], [0, hh + 0.06, 0], '#c23a2e');
    for (const [x, z, h] of [[0, hd * 0.43, 0.16], [-hw * 0.4, hd * 0.43, 0.12], [hw * 0.4, hd * 0.43, 0.12], [-hw * 0.4, -hd * 0.43, 0.12], [hw * 0.4, -hd * 0.43, 0.12]] as const) {
      head.box([0.08, h, 0.08], [x, hh + 0.14 + h / 2, z], cr, [0, Math.PI / 4, 0]);
      head.box([0.06, 0.06, 0.06], [x, hh + 0.16 + h, z], cr);
    }
    head.box([0.07, 0.07, 0.03], [0, hh + 0.09, hd * 0.43 + 0.03], '#c23a2e', [0, 0, Math.PI / 4]);
    head.box([0.05, 0.05, 0.03], [-hw * 0.22, hh + 0.09, hd * 0.43 + 0.03], '#2f918b');
    head.box([0.05, 0.05, 0.03], [hw * 0.22, hh + 0.09, hd * 0.43 + 0.03], '#2f918b');
  } else {
    // hat: brim, three drooping tiers, a band
    const th = L.beardLen ? 0.62 : 0.55;
    head
      .box([hw + 0.1, 0.05, hd + 0.1], [0, hh + 0.005, 0], L.hat)
      .box([hw + 0.02, 0.035 + 0.02 * hk, hd + 0.02], [0, hh + 0.04, 0], L.band)
      .box([hw * 0.88, 0.14 * th, hd * 0.88], [0, hh + 0.12 * th, -0.01], L.hat)
      .box([hw * 0.66, 0.14 * th, hd * 0.66], [0, hh + 0.25 * th, -0.05], L.hat)
      .box([hw * 0.44, 0.13 * th, hd * 0.44], [0, hh + 0.375 * th, -0.1], L.hat)
      .box([hw * 0.26, 0.11 * th, hd * 0.26], [0, hh + 0.48 * th, -0.17], L.hat, [0.45, 0, 0])
      .box([hw * 0.15, 0.08 * th, hd * 0.15], [0, hh + 0.5 * th, -0.28], L.hat, [1.1, 0, 0]);
  }
  // beard: moustache, big front, down the chest; shorter for lesser gnomes, longest for the king
  if (L.beardLen) {
    const len = [0, 0.14, 0.22, 0.3, 0.32][L.beardLen] * k;
    head
      .box([hw + 0.04, hh * 0.46, 0.06], [0, hh * 0.2, hd / 2 + 0.025], L.beard)
      .box([hw * 0.82, 0.08, 0.06], [0, hh * 0.44, hd / 2 + 0.04], L.beard)
      .box([hw * 0.7, len, 0.1], [0, hh * 0.02 - len / 2, hd / 2 + 0.01], L.beard)
      .box([hw * 0.44, len * 0.5, 0.1], [0, hh * 0.02 - len * 1.25, hd / 2 + 0.0], L.beard)
      .box([0.04, hh * 0.46, hd * 0.75], [hw / 2 + 0.012, hh * 0.22, 0.02], L.beard)
      .box([0.04, hh * 0.46, hd * 0.75], [-hw / 2 - 0.012, hh * 0.22, 0.02], L.beard);
  }
  head.done();

  // arms: short coat sleeves and mitts
  for (const arm of [parts.armL, parts.armR]) {
    const sl = bodyH * 0.6;
    kit
      .part(arm.name, arm)
      .box([0.14 * k, sl, 0.16 * k], [0, -sl / 2 + 0.03, 0], L.coat)
      .box([0.15 * k, 0.04, 0.17 * k], [0, -sl + 0.03, 0], L.coatDark)
      .box([0.12 * k, 0.1 * k, 0.12 * k], [0, -sl - 0.02, 0], L.mitts)
      .done();
  }

  return { type: 'biped', root, parts, height: L.height, eyes: kit.eyes };
}

export const buildGnomeElder = (skin: Skin): Rig => make(skin, LOOKS.gnome_elder);
export const buildGnome1 = (skin: Skin): Rig => make(skin, LOOKS.gnome_1);
export const buildGnome2 = (skin: Skin): Rig => make(skin, LOOKS.gnome_2);
export const buildGnome3 = (skin: Skin): Rig => make(skin, LOOKS.gnome_3);
export const buildGnomeKid = (skin: Skin): Rig => make(skin, LOOKS.gnome_kid);
export const buildGnomeKing = (skin: Skin): Rig => make(skin, LOOKS.gnome_king);

