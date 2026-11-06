/**
 * The toy drum kit, on a round mustard rug: a big blue bass drum facing the front with coral rims and
 * a cream head, a small tom riding on top of it, a steel snare on a tripod with two sticks resting
 * across it, one gold cymbal on a tall stand, and a little coral stool behind. A tap makes the drum
 * that was hit jump and squash for a quarter of a second; the cymbal wobbles and rings down. Needs no
 * power. Origin at the floor centre of the 2×2 footprint, front towards +Z.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL, STEEL_DARK, TAU, WOOD } from './buildingParts';
import { Build, HP, finishShadows } from './villages';

const BLUE = '#2f7fd6';
const BLUE_DARK = '#1f56b0';
const MUSTARD_DARK = '#c98f1c';
const STICK = '#e2b878';

const RUG = 0.03;
const BASS_R = 0.44;
const BASS_Z = -0.05;
const BASS_D = 0.5;
const SNARE_AT = [-0.63, 0.52, 0.36] as const;
const CYMBAL_AT = [0.6, 1.18, 0.12] as const;
const CYMBAL_TILT = 0.3;
const TOM_TILT = 0.4;

/** How long a drum's jump lasts, and how long the cymbal rings. */
const HIT = 0.25;
const RING = 1.4;

function tripod(b: Build, x: number, z: number, top: number, wide: number): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    b.beam([x, top, z], [x + Math.sin(a) * wide, RUG + 0.02, z + Math.cos(a) * wide], 0.035, STEEL_DARK);
  }
}

export function createDrums(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'drums';
  const b = new Build(skin, 'drums');
  root.add(b.root);

  // the rug
  b.cyl(0.97, RUG, [0, RUG / 2, 0], MUSTARD, { seg: 36 });
  b.cyl(0.86, RUG + 0.004, [0, RUG / 2, 0], MUSTARD_DARK, { seg: 36 });
  b.cyl(0.82, RUG + 0.008, [0, RUG / 2, 0], MUSTARD, { seg: 36 });

  // the stool behind
  b.cyl(0.19, 0.04, [0, RUG + 0.02, -0.72], CHARCOAL, { seg: 16 });
  b.cyl(0.04, 0.42, [0, RUG + 0.23, -0.72], STEEL, { seg: 10 });
  b.cyl(0.23, 0.1, [0, RUG + 0.47, -0.72], CORAL, { seg: 18 });
  b.cyl(0.19, 0.02, [0, RUG + 0.53, -0.72], CORAL_DARK, { seg: 18 });

  // the stands: the snare's tripod and the cymbal's, with a tall steel pole
  tripod(b, SNARE_AT[0], SNARE_AT[2], SNARE_AT[1] - 0.14, 0.24);
  b.cyl(0.024, 0.14, [SNARE_AT[0], SNARE_AT[1] - 0.07, SNARE_AT[2]], STEEL, { seg: 10 });
  tripod(b, CYMBAL_AT[0], CYMBAL_AT[2], 0.5, 0.26);
  b.cyl(0.024, CYMBAL_AT[1] - 0.4, [CYMBAL_AT[0], (CYMBAL_AT[1] + 0.4) / 2, CYMBAL_AT[2]], STEEL, { seg: 10 });
  b.cyl(0.045, 0.05, [CYMBAL_AT[0], 0.72, CYMBAL_AT[2]], STEEL_DARK, { seg: 10 });
  b.finish();

  // the bass drum and the tom riding on it: they jump together, squashing onto the rug
  const bass = new Build(skin, 'drums-bass');
  bass.root.position.set(0, RUG, BASS_Z);
  const y = BASS_R + 0.05;
  const along = { rot: [HP, 0, 0] as const, seg: 32 };
  bass.cyl(BASS_R, BASS_D, [0, y, 0], BLUE, along);
  bass.cyl(BASS_R - 0.025, 0.02, [0, y, BASS_D / 2 + 0.012], CREAM, along);
  bass.cyl(0.17, 0.012, [0, y, BASS_D / 2 + 0.024], MUSTARD, { ...along, seg: 24 });
  bass.cyl(0.1, 0.014, [0, y, BASS_D / 2 + 0.026], CREAM, { ...along, seg: 24 });
  for (const s of [-1, 1]) bass.geo(new THREE.TorusGeometry(BASS_R + 0.01, 0.04, 8, 36), [0, y, s * (BASS_D / 2 + 0.005)], CORAL);
  // the lugs round the shell, the two little feet that hold it
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    bass.box([0.06, 0.06, 0.2], [Math.cos(a) * (BASS_R + 0.01), y + Math.sin(a) * (BASS_R + 0.01), 0], MUSTARD, [0, 0, a]);
  }
  for (const s of [-1, 1]) bass.beam([s * 0.3, y - 0.2, 0.08], [s * 0.42, 0.015, 0.14], 0.04, STEEL_DARK);
  // the tom: a short post, a tilted drum looking up and to the front
  const tomY = 2 * BASS_R + 0.26;
  const tomAt = { rot: [TOM_TILT, 0, 0] as const, seg: 24 };
  const onTom = (d: number): [number, number, number] => [0, tomY + Math.cos(TOM_TILT) * d, Math.sin(TOM_TILT) * d];
  bass.cyl(0.03, 0.2, [0, 2 * BASS_R + 0.13, -0.03], STEEL, { seg: 10 });
  bass.cyl(0.21, 0.2, [0, tomY, 0], BLUE, tomAt);
  bass.cyl(0.19, 0.012, onTom(0.102), CREAM, tomAt);
  bass.cyl(0.222, 0.035, onTom(0.09), CORAL, tomAt);
  bass.cyl(0.222, 0.035, onTom(-0.09), BLUE_DARK, tomAt);
  bass.finish();
  root.add(bass.root);

  // the snare
  const snare = new Build(skin, 'drums-snare');
  snare.root.position.set(SNARE_AT[0], SNARE_AT[1], SNARE_AT[2]);
  snare.cyl(0.25, 0.15, [0, 0.075, 0], STEEL, { seg: 26 });
  snare.cyl(0.235, 0.012, [0, 0.156, 0], CREAM, { seg: 26 });
  snare.cyl(0.262, 0.035, [0, 0.14, 0], CORAL, { seg: 26 });
  snare.cyl(0.262, 0.035, [0, 0.012, 0], CORAL, { seg: 26 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    snare.box([0.03, 0.1, 0.03], [Math.sin(a) * 0.252, 0.075, Math.cos(a) * 0.252], STEEL_DARK);
  }
  snare.finish();
  root.add(snare.root);

  // the two sticks resting across it
  const sticks = new Build(skin, 'drums-sticks');
  sticks.root.position.set(SNARE_AT[0], SNARE_AT[1] + 0.175, SNARE_AT[2]);
  for (const [a, c] of [
    [[-0.3, 0.012, 0.12], [0.3, 0.012, -0.06]],
    [[-0.28, 0.038, -0.14], [0.3, 0.038, 0.1]],
  ] as const) {
    sticks.beam(a, c, 0.03, STICK);
    sticks.ball(0.026, c, WOOD, { seg: 8 });
  }
  sticks.finish();
  root.add(sticks.root);

  // the cymbal, turning about the top of its pole
  const cym = new Build(skin, 'drums-cymbal');
  cym.root.position.set(CYMBAL_AT[0], CYMBAL_AT[1], CYMBAL_AT[2]);
  cym.root.rotation.x = CYMBAL_TILT;
  cym.cyl(0.36, 0.022, [0, 0, 0], MUSTARD, { r1: 0.33, seg: 36 });
  cym.cyl(0.27, 0.028, [0, 0.002, 0], MUSTARD_DARK, { seg: 32 });
  cym.cyl(0.24, 0.034, [0, 0.002, 0], MUSTARD, { seg: 32 });
  cym.cyl(0.11, 0.05, [0, 0.03, 0], MUSTARD_DARK, { r1: 0.05, seg: 18 });
  cym.cyl(0.02, 0.08, [0, 0.07, 0], STEEL, { seg: 8 });
  cym.finish();
  root.add(cym.root);

  finishShadows(root);
  /** How far through its jump drum `i` is (0..1), or -1 when it is not jumping. */
  const jump = (pulse: number | undefined, drum: number, i: number): number => (pulse !== undefined && pulse < HIT && drum === i ? pulse / HIT : -1);
  const hop = (g: THREE.Object3D, baseY: number, x: number, up: number): void => {
    if (x < 0) {
      g.position.y = baseY;
      g.scale.set(1, 1, 1);
      return;
    }
    const sq = (1 - x) * (1 - x);
    g.position.y = baseY + Math.sin(x * Math.PI) * up;
    g.scale.set(1 + sq * 0.12, 1 - sq * 0.2, 1 + sq * 0.12);
  };
  return {
    root,
    update(_dt, k) {
      const p = k.pulse;
      const drum = k.drum ?? 0;
      const xs = jump(p, drum, 1);
      hop(bass.root, RUG, jump(p, drum, 0), 0.1);
      hop(snare.root, SNARE_AT[1], xs, 0.12);
      // the sticks fly up off the snare a little further
      const fly = xs < 0 ? 0 : Math.sin(xs * Math.PI);
      sticks.root.position.y = SNARE_AT[1] + 0.175 + fly * 0.26;
      sticks.root.rotation.y = fly * 0.3;
      // the cymbal rings down when it is hit, and only shivers for the others
      const wob = p !== undefined && p < RING ? (drum === 2 ? 0.32 : 0.05) * Math.exp(-p * 3) : 0;
      cym.root.rotation.x = CYMBAL_TILT + wob * Math.sin((p ?? 0) * 24);
      cym.root.rotation.z = wob * Math.cos((p ?? 0) * 19) * 0.7;
    },
  };
}
