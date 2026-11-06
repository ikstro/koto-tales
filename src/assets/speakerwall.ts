/**
 * The wall of speakers: twelve cabinets stacked four wide and three high in a black-and-teal
 * checker, each with one big round cone in a mustard ring. The cones thump on the beat in a wave
 * from the middle outwards, the bottom row hardest; the whole wall shudders a little and dust hops
 * along its mustard cap. The bulb sits in the plinth at the right end and the wire hangs from a
 * small box on the right side. Origin at the floor centre of the 4×1 footprint, front towards +Z.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MUSTARD, TEAL, powerBulb } from './buildingParts';
import { Build, HP, finishShadows, mergeCached, tint } from './villages';

const DARK = '#1d1a19';
const GREY = '#4a4440';
const MUSTARD_DARK = '#c98f1c';
const TEAL_DARK = '#226e69';

const COLS = 4;
const ROWS = 3;
const CELL_W = 0.96;
const CELL_H = 0.9;
/** The top of the plinth, and the front of the cabinets. */
const BASE = 0.22;
const FRONT = 0.41;
const R = 0.39;
const DUST = 8;
const TOP = BASE + ROWS * CELL_H + 0.08;

const CAPS = [CREAM, MUSTARD, CORAL].map((c) => new THREE.Color(c));

const beatFrac = (beat: number): number => beat - Math.floor(beat);
/** A disc standing on its back, facing +Z (r0 towards the front). */
const facing = (r0: number, r1: number, h: number, seg = 28): THREE.BufferGeometry => new THREE.CylinderGeometry(r0, r1, h, seg).rotateX(HP);

export function createSpeakerwall(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'speakerwall';
  const b = new Build(skin, 'speakerwall');
  root.add(b.root);
  const body = b.root;

  // the plinth and the dark core the cabinets stand round
  b.box([3.96, BASE, 0.92], [0, BASE / 2, 0], CHARCOAL);
  b.box([3.98, 0.05, 0.94], [0, BASE - 0.02, 0], MUSTARD);
  b.box([3.78, ROWS * CELL_H - 0.04, 0.72], [0, BASE + (ROWS * CELL_H) / 2, 0], DARK);

  // the cabinets, each with four little mustard screws and a ring for its cone
  const spots: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * CELL_W;
      const y = BASE + (r + 0.5) * CELL_H;
      spots.push([x, y]);
      b.box([CELL_W - 0.03, CELL_H - 0.03, 0.82], [x, y, 0], (r + c) % 2 ? TEAL : CHARCOAL);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.box([0.06, 0.06, 0.02], [x + sx * 0.4, y + sy * 0.37, FRONT + 0.008], MUSTARD);
      b.geo(facing(R + 0.04, R + 0.04, 0.04), [x, y, FRONT + 0.012], MUSTARD);
    }
  }

  // the mustard trim: the cap on top, a band under it, strips up the two ends
  b.box([3.96, 0.08, 0.92], [0, TOP - 0.04, 0], MUSTARD);
  b.box([3.9, 0.035, 0.86], [0, TOP - 0.095, 0], MUSTARD_DARK);
  for (const s of [-1, 1]) b.box([0.06, ROWS * CELL_H, 0.06], [s * 1.93, BASE + (ROWS * CELL_H) / 2, FRONT + 0.015], MUSTARD);

  // the little box on the right side the wire hangs from
  b.box([0.06, 0.34, 0.3], [1.95, 2.4, 0], CHARCOAL);
  b.box([0.07, 0.05, 0.32], [1.95, 2.59, 0], TEAL_DARK);
  b.finish();

  // the cones and their caps: two instanced draws, moved together
  const coneGeo = mergeCached('speakerwall/cone', [tint(facing(R, R, 0.05), DARK), tint(facing(R * 0.72, R * 0.86, 0.07).translate(0, 0, 0.05), GREY)]);
  const capGeo = facing(R * 0.28, R * 0.34, 0.07, 18).translate(0, 0, 0.1);
  const n = spots.length;
  const cones = new THREE.InstancedMesh(coneGeo, b.kit.vertexColourMaterial(false), n);
  const caps = new THREE.InstancedMesh(capGeo, skin.partMaterial(0xffffff), n);
  cones.frustumCulled = false;
  caps.frustumCulled = false;
  cones.castShadow = true;
  body.add(cones, caps);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const set = (i: number, thump: number): void => {
    pos.set(spots[i][0], spots[i][1], FRONT + 0.03);
    scl.set(1 + thump * 0.035, 1 + thump * 0.035, 1 + thump * 1.3);
    m4.compose(pos, q.identity(), scl);
    cones.setMatrixAt(i, m4);
    caps.setMatrixAt(i, m4);
  };
  for (let i = 0; i < n; i++) {
    set(i, 0);
    caps.setColorAt(i, CAPS[Math.floor(i / COLS)]);
  }

  // dust on the top that hops on the beat
  const dust = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#d8d0c0'), DUST);
  dust.frustumCulled = false;
  dust.visible = false;
  root.add(dust);

  const bulb = powerBulb(skin, body, [1.68, 0.1, 0.46]);
  finishShadows(root);
  let t = 0;
  let still = true;
  return {
    root,
    socket: new THREE.Vector3(1.98, 2.4, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = !!pw && pw.on && k.playing;
      dust.visible = live;
      if (!live) {
        if (still) return;
        still = true;
        for (let i = 0; i < n; i++) set(i, 0);
        cones.instanceMatrix.needsUpdate = true;
        caps.instanceMatrix.needsUpdate = true;
        body.scale.set(1, 1, 1);
        return;
      }
      still = false;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / COLS);
        const fromMiddle = Math.abs((i % COLS) - (COLS - 1) / 2) + row * 0.5;
        set(i, Math.exp(-beatFrac(k.beat - fromMiddle * 0.05) * 7) * (1.15 - row * 0.2));
      }
      cones.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
      const thump = Math.exp(-beatFrac(k.beat) * 7);
      body.scale.set(1 + thump * 0.006, 1 - thump * 0.012, 1 + thump * 0.02);
      for (let i = 0; i < DUST; i++) {
        const f = beatFrac(k.beat + i * 0.25);
        const hop = Math.sin(Math.min(1, f * 2.2) * Math.PI) * (0.16 + 0.06 * (i % 2));
        pos.set(-1.68 + i * 0.48, TOP + 0.05 + hop, ((i * 5) % 3) * 0.2 - 0.2);
        scl.setScalar(0.08);
        q.setFromEuler(e.set(f * 4 + i, f * 3, 0));
        dust.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      dust.instanceMatrix.needsUpdate = true;
    },
  };
}
