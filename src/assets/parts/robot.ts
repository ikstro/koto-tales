/**
 * Robots of the meadows: boxy toy machines with a screen face (eyes drawn on a
 * dark screen), one or two antennae with a warm bulb, rivets and panel lines.
 * The elder is an old brass-and-copper model with a wind-up key; the kid is
 * rounder, with a single antenna.
 */
import type { Rig, Skin } from '../../contracts';
import { faceAtlas, type FaceId } from '../faces';
import { bipedFrame } from './frames';
import { Kit } from './kit';

const STEEL_DARK = '#6c737b';
const STEEL_LIGHT = '#d5d9dd';
const RIVET = '#e8ebee';
const BULB = { c: '#ffd23a', glow: true };

interface Look {
  id: string;
  face: FaceId;
  body: string;
  head: string;
  accent: string;
  limb: string;
  foot: string;
  panel: string;
  antennas: 1 | 2;
  /** Scale of the limbs, of the head; rounded = chamfered head and body. */
  k: number;
  hk: number;
  rounded?: boolean;
  old?: boolean;
  height: number;
}

const LOOKS: Record<string, Look> = {
  robot_1: { id: 'robot_1', face: 'robot', body: '#2f918b', head: '#c4c9ce', accent: '#ffe3a3', limb: '#8b95a0', foot: '#5a626b', panel: '#256f6a', antennas: 2, k: 1, hk: 1, height: 1.5 },
  robot_2: { id: 'robot_2', face: 'robot', body: '#c4c9ce', head: '#7f93a6', accent: '#e0583f', limb: '#8b95a0', foot: '#5a626b', panel: '#a3a9af', antennas: 1, k: 1, hk: 1, height: 1.5 },
  robot_3: { id: 'robot_3', face: 'robot', body: '#8b95a0', head: '#59b3ab', accent: '#eab02b', limb: '#c4c9ce', foot: '#4f565e', panel: '#6f7983', antennas: 2, k: 1, hk: 1, height: 1.5 },
  robot_elder: { id: 'robot_elder', face: 'robot_elder', body: '#c79a3e', head: '#b8793a', accent: '#59b3ab', limb: '#9a6a34', foot: '#6e4520', panel: '#a67c2e', antennas: 2, k: 1, hk: 1.04, old: true, height: 1.52 },
  robot_kid: { id: 'robot_kid', face: 'robot_kid', body: '#e8b84a', head: '#c4c9ce', accent: '#e0583f', limb: '#8b95a0', foot: '#5a626b', panel: '#cf9d34', antennas: 1, k: 0.56, hk: 1.0, rounded: true, height: 0.95 },
};

function make(skin: Skin, L: Look): Rig {
  const { k, hk } = L;
  const kit = new Kit(L.id, skin, faceAtlas(L.face));
  const legH = 0.46 * k;
  const bodyH = 0.46 * k;
  const bw = 0.5 * (0.5 + 0.5 * k);
  const bd = 0.34 * (0.5 + 0.5 * k);
  const { root, parts } = bipedFrame({ legH, hipX: 0.14 * (0.4 + 0.6 * k), bodyH, armX: bw / 2 + 0.11 * k + 0.05, shoulderY: bodyH - 0.07 });

  // legs: a steel shank, a knee cap in the accent colour and a big dark foot
  for (const leg of [parts.legL, parts.legR]) {
    const lw = 0.15 * (0.4 + 0.6 * k);
    kit
      .part(leg.name, leg)
      .box([lw, legH * 0.62, lw + 0.01], [0, -legH * 0.31, 0], L.limb)
      .box([lw + 0.03, 0.06, lw + 0.04], [0, -legH * 0.4, 0], L.accent)
      .box([lw + 0.06, legH * 0.26, 0.28 * (0.5 + 0.5 * k)], [0, -legH + legH * 0.13, 0.04], L.foot)
      .done();
  }

  // body: a box with panel lines, a chest plate with rivets, a waist ring
  const body = kit.part('body', parts.body);
  body
    .box([bw, bodyH, bd], [0, bodyH / 2 + 0.02, 0], L.body)
    .box([bw - 0.06, 0.07 * k + 0.02, bd - 0.04], [0, 0.0, 0], L.foot)
    .box([bw + 0.012, 0.018, bd + 0.012], [0, bodyH * 0.78, 0], L.panel)
    .box([bw + 0.012, 0.018, bd + 0.012], [0, bodyH * 0.2, 0], L.panel)
    .box([bw * 0.62, bodyH * 0.42, 0.025], [0, bodyH * 0.52, bd / 2 + 0.008], L.panel)
    .box([bw * 0.2, 0.07 * k + 0.02, 0.03], [-bw * 0.14, bodyH * 0.56, bd / 2 + 0.02], L.accent)
    .box([bw * 0.2, 0.07 * k + 0.02, 0.03], [bw * 0.14, bodyH * 0.56, bd / 2 + 0.02], STEEL_LIGHT);
  for (const sx of [-1, 1]) {
    for (const sy of [0.34, 0.7]) {
      body.box([0.03, 0.03, 0.02], [sx * bw * 0.27, bodyH * sy, bd / 2 + 0.02], RIVET);
    }
  }
  for (const sx of [-1, 1]) for (const sy of [0.1, 0.9]) body.box([0.035, 0.035, 0.02], [sx * (bw / 2 - 0.05), bodyH * sy + 0.02, bd / 2 + 0.01], RIVET);
  if (L.rounded) {
    body.box([bw - 0.08, bodyH, bd + 0.02], [0, bodyH / 2 + 0.02, 0], L.body).box([bw + 0.02, bodyH - 0.1, bd - 0.1], [0, bodyH / 2 + 0.02, 0], L.body);
  }
  if (L.old) {
    // wind-up key on the back, a few patina patches
    body
      .box([0.045, 0.12, 0.05], [0, bodyH * 0.55, -bd / 2 - 0.06], STEEL_DARK)
      .box([0.2, 0.05, 0.04], [0, bodyH * 0.62, -bd / 2 - 0.1], L.accent)
      .box([bw * 0.2, 0.05, 0.03], [bw * 0.22, bodyH * 0.9, bd / 2 + 0.008], L.accent)
      .box([0.07, 0.1, 0.03], [-bw * 0.4, bodyH * 0.2, bd / 2 + 0.008], L.accent);
  }
  body.done();

  // head: a box (rounded: a chamfered stack), a dark screen with the face, ear bolts, antennae
  const hw = 0.46 * hk * (L.rounded ? 0.95 : 1);
  const hh = 0.34 * hk * (L.rounded ? 1.15 : 1);
  const hd = 0.4 * hk * (L.rounded ? 0.95 : 1);
  const y0 = 0.05;
  const head = kit.part('head', parts.head);
  head.box([0.16, 0.08, 0.16], [0, 0.02, 0], STEEL_DARK);
  if (L.rounded) {
    head
      .box([hw, hh - 0.1, hd - 0.1], [0, y0 + hh / 2, 0], L.head)
      .box([hw - 0.1, hh, hd - 0.1], [0, y0 + hh / 2, 0], L.head)
      .box([hw - 0.1, hh - 0.1, hd], [0, y0 + hh / 2, 0], L.head);
  } else {
    head.box([hw, hh, hd], [0, y0 + hh / 2, 0], L.head);
  }
  const frontZ = hd / 2;
  head
    .box([hw * 0.84, hh * 0.72, 0.02], [0, y0 + hh * 0.5, frontZ + 0.002], L.foot)
    .box([hw * 0.74, hh * 0.62, 0.03], [0, y0 + hh * 0.5, frontZ + 0.01], { s: 0, face: true })
    .box([0.06, 0.1, 0.1], [hw / 2 + 0.03, y0 + hh * 0.5, 0], L.accent)
    .box([0.06, 0.1, 0.1], [-hw / 2 - 0.03, y0 + hh * 0.5, 0], L.accent)
    .box([hw + 0.02, 0.02, hd + 0.02], [0, y0 + hh * 0.9, 0], L.panel);
  const top = y0 + hh;
  const stalk = L.antennas === 2 ? 0.15 : 0.12;
  const at = L.antennas === 2 ? [-hw * 0.28, hw * 0.28] : [0];
  at.forEach((x, i) => {
    const lean = L.old && i === 1 ? 0.35 : L.antennas === 2 ? (i === 0 ? 0.12 : -0.12) : 0;
    head.box([0.03, stalk, 0.03], [x - Math.sin(lean) * stalk * 0.5, top + stalk / 2, -0.02], STEEL_DARK, [0, 0, lean]);
    head.box([0.075, 0.075, 0.075], [x - Math.sin(lean) * stalk, top + stalk + 0.03, -0.02], BULB);
  });
  head.done();

  // arms: a round shoulder, a steel upper arm, a forearm in the body colour and a claw hand
  for (const arm of [parts.armL, parts.armR]) {
    const aw = 0.11 * (0.4 + 0.6 * k) + 0.02;
    const len = bodyH * 0.72;
    kit
      .part(arm.name, arm)
      .box([aw + 0.05, aw + 0.05, aw + 0.05], [0, 0.0, 0], L.accent)
      .box([aw, len * 0.45, aw], [0, -len * 0.3, 0], L.limb)
      .box([aw + 0.02, len * 0.4, aw + 0.02], [0, -len * 0.7, 0], L.body)
      .box([aw + 0.02, 0.1 * k + 0.03, aw + 0.04], [0, -len - 0.03, 0.01], L.foot)
      .done();
  }

  return { type: 'biped', root, parts, height: L.height, eyes: kit.eyes };
}

export const buildRobotElder = (skin: Skin): Rig => make(skin, LOOKS.robot_elder);
export const buildRobot1 = (skin: Skin): Rig => make(skin, LOOKS.robot_1);
export const buildRobot2 = (skin: Skin): Rig => make(skin, LOOKS.robot_2);
export const buildRobot3 = (skin: Skin): Rig => make(skin, LOOKS.robot_3);
export const buildRobotKid = (skin: Skin): Rig => make(skin, LOOKS.robot_kid);
