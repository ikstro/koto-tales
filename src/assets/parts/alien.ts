/**
 * Aliens of the crater: a big bulb of a head with huge dark eyes, thin
 * antennae with little balls, a silver suit with a collar and boots. Green,
 * lilac and mint skins; the elder is taller with three antennae and a cape;
 * the kid is nearly all head.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, faceSwatches, type FaceId } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const SUIT = '#e0e4e8';
const SUIT_DARK = '#9aa3ad';
const BOOT = '#6c737b';

interface Look {
  id: string;
  face: FaceId;
  suit: string;
  trim: string;
  ball: string;
  boots: string;
  antennas: 2 | 3;
  k: number;
  hk: number;
  cape?: string;
  height: number;
}

const LOOKS: Record<string, Look> = {
  alien_1: { id: 'alien_1', face: 'alien', suit: SUIT, trim: '#e0583f', ball: '#ffe3a3', boots: BOOT, antennas: 2, k: 1, hk: 1, height: 1.3 },
  alien_2: { id: 'alien_2', face: 'alien_lilac', suit: '#e6e9ec', trim: '#2f918b', ball: '#e0583f', boots: '#5a626b', antennas: 2, k: 1, hk: 1, height: 1.3 },
  alien_3: { id: 'alien_3', face: 'alien_mint', suit: '#d6dbe0', trim: '#eab02b', ball: '#ffd23a', boots: BOOT, antennas: 2, k: 1, hk: 1, height: 1.3 },
  alien_elder: { id: 'alien_elder', face: 'alien_elder', suit: '#b4bcc4', trim: '#eab02b', ball: '#ffe3a3', boots: '#4f565e', antennas: 3, k: 1.14, hk: 1.02, cape: '#7a5a8a', height: 1.5 },
  alien_kid: { id: 'alien_kid', face: 'alien_kid', suit: '#e6e9ec', trim: '#eab02b', ball: '#e0583f', boots: BOOT, antennas: 2, k: 0.62, hk: 0.98, height: 0.9 },
};

function make(skin: Skin, L: Look): Rig {
  const { k, hk } = L;
  const kit = new Kit(L.id, skin, faceAtlas(L.face));
  const skinC = faceSwatches(L.face)[0];
  const skinDark = faceSwatches(L.face)[1];
  const legH = 0.38 * k;
  const bodyH = 0.34 * k;
  const bw = 0.34 * (0.45 + 0.55 * k);
  const bd = 0.22 * (0.5 + 0.5 * k);
  const { root, parts } = bipedFrame({ legH, hipX: 0.085 * (0.4 + 0.6 * k), bodyH, armX: bw / 2 + 0.07, shoulderY: bodyH - 0.04 });

  // slim legs in the suit, big round-toed boots
  for (const leg of [parts.legL, parts.legR]) {
    const lw = 0.12 * (0.4 + 0.6 * k);
    kit
      .part(leg.name, leg)
      .box([lw, legH * 0.66, lw], [0, -legH * 0.33, 0], L.suit)
      .box([lw + 0.02, legH * 0.34, 0.2 * (0.5 + 0.5 * k)], [0, -legH + legH * 0.17, 0.035], L.boots)
      .done();
  }

  // body: a suit with a collar ring, a stripe and a belt buckle; the elder's cape
  const body = kit.part('body', parts.body);
  body
    .box([bw, bodyH, bd], [0, bodyH / 2, 0], L.suit)
    .box([bw + 0.02, 0.04, bd + 0.02], [0, bodyH * 0.92, 0], L.trim)
    .box([bw + 0.02, 0.05 * k + 0.015, bd + 0.02], [0, bodyH * 0.28, 0], L.trim)
    .box([0.08 * k + 0.03, 0.08 * k + 0.03, 0.02], [0, bodyH * 0.28, bd / 2 + 0.014], SUIT_DARK)
    .box([0.1, bodyH * 0.3, 0.015], [0, bodyH * 0.6, bd / 2 + 0.005], SUIT_DARK);
  if (L.cape) {
    body
      .box([bw + 0.08, bodyH * 1.05, 0.04], [0, bodyH * 0.42, -bd / 2 - 0.03], L.cape)
      .box([bw + 0.1, 0.05, bd + 0.08], [0, bodyH - 0.01, 0], L.cape);
  }
  body.done();

  // head: bulb dome, cheeks, antennae with little balls
  const hw = 0.52 * hk;
  const hh = 0.42 * hk;
  const hd = 0.44 * hk;
  const head = kit.part('head', parts.head);
  head
    .box([hw, hh, hd], [0, hh / 2 + 0.01, 0], { s: 0, face: true })
    .box([hw - 0.12, 0.07, hd - 0.1], [0, hh + 0.04, -0.01], { s: 0 })
    .box([hw - 0.28, 0.05, hd - 0.2], [0, hh + 0.09, -0.02], { s: 0 })
    .box([0.1 * hk, 0.06, 0.07], [hw / 2 + 0.025, hh * 0.38, 0], { s: 1 })
    .box([0.1 * hk, 0.06, 0.07], [-hw / 2 - 0.025, hh * 0.38, 0], { s: 1 });
  const n = L.antennas;
  const xs = n === 2 ? [-hw * 0.26, hw * 0.26] : [-hw * 0.3, 0, hw * 0.3];
  const lens = n === 2 ? [0.15, 0.15] : [0.13, 0.19, 0.13];
  xs.forEach((x, i) => {
    const out = n === 2 ? (i === 0 ? 0.22 : -0.22) : i === 0 ? 0.3 : i === 2 ? -0.3 : 0;
    const len = lens[i] * (0.6 + 0.4 * k);
    const base = hh + 0.1;
    // stalk skin-coloured, the ball a plain colour; the stalk leans outwards
    head.box([0.026, len, 0.026], [x - Math.sin(out) * len * 0.5, base + len / 2 - 0.02, -0.02], { s: 1 }, [0, 0, out]);
    head.box([0.07, 0.07, 0.07], [x - Math.sin(out) * len, base + len + 0.0, -0.02], L.ball);
  });
  head.done();

  // arms: suit sleeves, bare thin hands in the skin colour
  for (const arm of [parts.armL, parts.armR]) {
    const aw = 0.085 * (0.5 + 0.5 * k) + 0.02;
    const len = bodyH * 0.75;
    kit
      .part(arm.name, arm)
      .box([aw + 0.02, len * 0.7, aw + 0.02], [0, -len * 0.35 + 0.02, 0], L.suit)
      .box([aw + 0.025, 0.035, aw + 0.025], [0, -len * 0.7 + 0.02, 0], L.trim)
      .box([aw, len * 0.34, aw], [0, -len * 0.84, 0], skinC)
      .done();
  }
  void skinDark;

  return { type: 'biped', root, parts, height: L.height, eyes: kit.eyes };
}

export const buildAlienElder = (skin: Skin): Rig => make(skin, LOOKS.alien_elder);
export const buildAlien1 = (skin: Skin): Rig => make(skin, LOOKS.alien_1);
export const buildAlien2 = (skin: Skin): Rig => make(skin, LOOKS.alien_2);
export const buildAlien3 = (skin: Skin): Rig => make(skin, LOOKS.alien_3);
export const buildAlienKid = (skin: Skin): Rig => make(skin, LOOKS.alien_kid);
