/**
 * The record player: a little wooden stand with a shelf of coloured record sleeves, and on it a
 * wooden deck with a cream top. A black record turns on a steel platter while its music plays, its
 * label glowing in the song's colour, and a slim steel arm swings over to rest on it; a smoked lid
 * stands open at the back and a small brass horn sings in front of it. Needs no power, so it
 * has no bulb. Origin at the floor centre of the 1×1 footprint, front towards +Z; glows are own
 * emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { SONG_COLOURS, SONG_IDS } from '../content/music';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, WOOD, WOOD_DARK, setGlow } from './buildingParts';
import { Build, HP, along, finishShadows, pool } from './villages';

const VINYL = '#1d1a19';
const GROOVE = '#3a3532';
const BRASS_DARK = '#9c6e16';
const SMOKE = '#8fb5b8';

/** The top of the deck, where the record's platter stands. */
const DECK = 0.82;
const REC_X = -0.13;
const REC_Z = 0.05;
/** The arm's pivot, and how far it is turned at rest and on the record. */
const ARM_X = 0.33;
const ARM_Z = 0.3;
const ARM_REST = -3.1;
const ARM_PLAY = -2.4;
const HORN_X = 0.31;
const HORN_Z = -0.16;
const LID_OPEN = -1.7;
const LID_L = 0.6;

/** The bell of the horn, from its throat up to the rim: radius, height. */
const BELL: [number, number][] = [
  [0.035, 0],
  [0.045, 0.1],
  [0.08, 0.19],
  [0.16, 0.26],
];

const SONG = SONG_IDS.map((id) => new THREE.Color(SONG_COLOURS[id]));
const C_LABEL = new THREE.Color(CORAL);

const lathe = (pts: [number, number][]): THREE.LatheGeometry => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 20);

export function createTurntable(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'turntable';
  const b = new Build(skin, 'turntable');
  root.add(b.root);

  // the stand: four legs, a shelf and a top
  for (const x of [-0.38, 0.38]) for (const z of [-0.34, 0.34]) b.box([0.08, 0.62, 0.08], [x, 0.31, z], WOOD_DARK);
  b.box([0.84, 0.05, 0.74], [0, 0.17, 0], WOOD);
  b.box([0.92, 0.06, 0.84], [0, 0.63, 0], WOOD_DARK);
  // the sleeves on the shelf, spines to the front
  [CORAL, MUSTARD, MINT, CREAM, CORAL, MINT].forEach((c, i) => b.box([0.06, 0.34 - (i % 2) * 0.03, 0.5], [-0.27 + i * 0.09, 0.365 - (i % 2) * 0.015, 0], c));

  // the deck: a wooden box, a cream top, two knobs on its front
  b.box([0.9, 0.13, 0.82], [0, 0.725, 0], WOOD);
  b.box([0.86, 0.02, 0.78], [0, DECK - 0.01, 0], CREAM);
  b.cyl(0.035, 0.05, [0.22, 0.725, 0.42], CORAL, { rot: [HP, 0, 0], seg: 10 });
  b.cyl(0.035, 0.05, [0.34, 0.725, 0.42], MINT, { rot: [HP, 0, 0], seg: 10 });

  // the platter under the record
  b.cyl(0.3, 0.025, [REC_X, DECK + 0.012, REC_Z], STEEL, { seg: 28 });

  // the arm's post, and its rest for when the music stops
  b.cyl(0.06, 0.03, [ARM_X, DECK + 0.015, ARM_Z], CHARCOAL, { seg: 12 });
  b.cyl(0.032, 0.12, [ARM_X, DECK + 0.07, ARM_Z], STEEL_DARK, { seg: 10 });
  b.box([0.05, 0.08, 0.05], [ARM_X - 0.015, DECK + 0.04, -0.07], STEEL_DARK);

  // the horn: a neck on a little foot, a brass bell looking up and out to the front
  const hornAt = [HORN_X, DECK + 0.14, HORN_Z] as const;
  b.cyl(0.06, 0.03, [HORN_X, DECK + 0.015, HORN_Z], CHARCOAL, { seg: 12 });
  b.cyl(0.03, 0.14, [HORN_X, DECK + 0.07, HORN_Z], STEEL_DARK, { seg: 10 });
  const q = along(0, 0.78, 0.62);
  b.geo(lathe(BELL), hornAt, MUSTARD, { q });
  b.geo(lathe(BELL.map(([r, y]): [number, number] => [r * 0.84, y + 0.004]).reverse()), hornAt, BRASS_DARK, { q });

  // the lid, hinged on the back edge and standing open: a smoked pane in a dark frame
  const lid = new THREE.Group();
  lid.position.set(0, DECK + 0.01, -0.39);
  lid.rotation.x = LID_OPEN;
  b.root.add(lid);
  const l = b.part('lid', lid);
  l.box([0.8, 0.012, LID_L - 0.04], [0, 0.02, LID_L / 2], { c: SMOKE, clear: true });
  l.box([0.86, 0.035, 0.05], [0, 0.02, LID_L - 0.01], CHARCOAL);
  l.box([0.86, 0.035, 0.05], [0, 0.02, 0.02], CHARCOAL);
  for (const s of [-1, 1]) l.box([0.05, 0.035, LID_L], [s * 0.41, 0.02, LID_L / 2], CHARCOAL);
  for (const s of [-1, 1]) b.box([0.16, 0.03, 0.05], [s * 0.25, DECK + 0.015, -0.38], STEEL_DARK);

  // the arm: it turns on the post
  const armG = new Build(skin, 'turntable-arm');
  armG.root.position.set(ARM_X, DECK, ARM_Z);
  armG.root.rotation.y = ARM_REST;
  armG.beam([0, 0.13, -0.09], [0, 0.1, 0.36], 0.028, STEEL);
  armG.box([0.05, 0.05, 0.07], [0, 0.135, -0.1], CHARCOAL);
  armG.box([0.07, 0.03, 0.1], [0, 0.09, 0.39], CORAL);
  armG.box([0.02, 0.03, 0.02], [0, 0.07, 0.42], STEEL_DARK);
  armG.finish();
  b.root.add(armG.root);

  // the record, with a cream tick so the turning shows
  const rec = new Build(skin, 'turntable-record');
  rec.root.position.set(REC_X, DECK + 0.03, REC_Z);
  rec.cyl(0.275, 0.014, [0, 0, 0], VINYL, { seg: 32 });
  rec.cyl(0.235, 0.017, [0, 0, 0], GROOVE, { seg: 32 });
  rec.cyl(0.205, 0.02, [0, 0, 0], VINYL, { seg: 32 });
  rec.cyl(0.165, 0.023, [0, 0, 0], GROOVE, { seg: 32 });
  rec.cyl(0.135, 0.026, [0, 0, 0], VINYL, { seg: 32 });
  rec.cyl(0.018, 0.06, [0, 0.015, 0], STEEL, { seg: 10 });
  rec.box([0.03, 0.008, 0.08], [0, 0.015, 0.195], CREAM);
  const labelMat = rec.glowGeo('label', CORAL, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 24), [0, 0, 0]).finish().label;
  b.root.add(rec.root);
  b.finish();

  // a small soft pool in the song's colour on the ground in front
  const glow = pool(0xffd98a, 1.1, [0, 0.04, 0.72]);
  root.add(glow.mesh);

  finishShadows(root);
  let spin = 0;
  let arm = ARM_REST;
  let last = '';
  return {
    root,
    update(dt, k) {
      const on = k.playing;
      spin += ((on ? 2.6 : 0) - spin) * Math.min(1, dt * 3);
      rec.root.rotation.y -= dt * spin;
      arm += ((on ? ARM_PLAY : ARM_REST) - arm) * Math.min(1, dt * 3);
      armG.root.rotation.y = arm;
      glow.mesh.visible = on;
      if (on) glow.mat.opacity = 0.04 + 0.26 * k.night;
      const song = Math.max(0, Math.min(SONG.length - 1, k.song ?? 0));
      const key = on ? 'on' + song : 'off';
      if (key === last) return;
      last = key;
      if (on) {
        setGlow(labelMat, SONG[song], 0.9);
        glow.mat.color.copy(SONG[song]);
      } else setGlow(labelMat, C_LABEL, 0);
    },
  };
}
