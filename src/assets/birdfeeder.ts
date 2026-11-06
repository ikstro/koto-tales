/**
 * The bird feeder: a wooden post on a cross foot carrying a wide tray of seeds under a little stepped
 * coral roof on two posts. Three fat toy birds (blue, coral, mustard) stand on the tray's edge and
 * hop along it by turns on the beat, pecking now and then; a fourth, mint one circles the feeder with
 * its wings flapping. No power: their song is its music. Origin at the floor centre, front towards +Z.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, SOLAR_BLUE_LIGHT, TAU, WOOD, WOOD_DARK } from './buildingParts';
import type { Kit } from './parts/kit';
import { Build, WOODL, WOODL_D, finishShadows } from './villages';

const SEED = '#d9a35b';
const SEED_D = '#a8743a';
const MUSTARD_DARK = '#c98f1c';
const BLUE_DARK = '#2361ad';
const MINT_DARK = '#3f9c93';
const BEAK = '#f08a24';
const CHEST = '#fff1d8';

/** The tray's floor, the top of its rim. */
const TRAY_Y = 1.22;
const RIM_Y = TRAY_Y + 0.1;
const TRAY_W = 0.92;
const TRAY_D = 0.9;
const ROOF_Y = 1.78;
const ROOF_Z = -0.09;

/** A bird's feet are at its origin, it looks along +Z. `folded`: its wings lie along its sides. */
function bird(kit: Kit, name: string, parent: THREE.Object3D, body: string, tail: string, folded: boolean): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  const p = kit.part(name, g);
  for (const s of [-1, 1]) p.box([0.035, 0.07, 0.05], [s * 0.05, 0.035, 0.02], BEAK);
  p.box([0.21, 0.18, 0.27], [0, 0.15, -0.01], body);
  p.box([0.15, 0.13, 0.03], [0, 0.14, 0.13], CHEST);
  p.box([0.17, 0.15, 0.16], [0, 0.29, 0.08], body);
  p.box([0.055, 0.045, 0.08], [0, 0.28, 0.19], BEAK);
  p.box([0.178, 0.035, 0.035], [0, 0.31, 0.11], CHARCOAL);
  p.box([0.11, 0.04, 0.16], [0, 0.2, -0.19], tail, [0.4, 0, 0]);
  if (folded) for (const s of [-1, 1]) p.box([0.03, 0.11, 0.18], [s * 0.112, 0.16, -0.03], tail);
  p.done();
  return g;
}

/** One flapping wing of the flier, hinged at its shoulder, `s` = −1 its left, 1 its right. */
function wing(kit: Kit, name: string, parent: THREE.Object3D, s: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(s * 0.1, 0.2, -0.02);
  parent.add(g);
  const p = kit.part(name, g);
  p.box([0.2, 0.03, 0.18], [s * 0.1, 0, 0], MINT_DARK);
  p.done();
  return g;
}

/** Each perched bird: its colours, its two spots along the edge (x, z), its facing. */
const PERCHES: { body: string; tail: string; a: readonly [number, number]; b: readonly [number, number]; yaw: number }[] = [
  { body: SOLAR_BLUE_LIGHT, tail: BLUE_DARK, a: [-0.2, 0.415], b: [0, 0.415], yaw: -0.3 },
  { body: CORAL, tail: CORAL_DARK, a: [0.33, 0.415], b: [0.16, 0.415], yaw: 0.35 },
  { body: MUSTARD, tail: MUSTARD_DARK, a: [-0.425, 0.22], b: [-0.425, 0.02], yaw: -1.2 },
];

export function createBirdfeeder(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'birdfeeder';
  const b = new Build(skin, 'birdfeeder');
  root.add(b.root);

  // the post and its cross foot
  b.box([0.9, 0.1, 0.16], [0, 0.05, 0], WOOD_DARK);
  b.box([0.16, 0.1, 0.9], [0, 0.05, 0], WOOD_DARK);
  b.box([0.16, TRAY_Y - 0.1, 0.16], [0, 0.1 + (TRAY_Y - 0.1) / 2, 0], WOODL);
  b.box([0.2, 0.06, 0.2], [0, 0.72, 0], WOOD);
  for (const s of [-1, 1]) {
    b.beam([s * 0.34, 0.1, 0], [s * 0.07, 0.5, 0], 0.07, WOOD);
    b.beam([0, 0.1, s * 0.34], [0, 0.5, s * 0.07], 0.07, WOOD);
    // the arms under the tray
    b.beam([0, 0.92, 0], [s * 0.34, TRAY_Y - 0.02, 0], 0.07, WOOD);
  }

  // the tray and its rim
  b.box([TRAY_W, 0.06, TRAY_D], [0, TRAY_Y, 0], WOODL);
  for (const s of [-1, 1]) {
    b.box([TRAY_W, 0.1, 0.06], [0, TRAY_Y + 0.05, s * (TRAY_D / 2 - 0.03)], WOODL_D);
    b.box([0.06, 0.1, TRAY_D], [s * (TRAY_W / 2 - 0.03), TRAY_Y + 0.05, 0], WOODL_D);
  }
  // the seeds: a heap and a scatter
  b.box([0.6, 0.05, 0.56], [0, TRAY_Y + 0.05, 0.03], SEED);
  b.box([0.42, 0.05, 0.38], [0, TRAY_Y + 0.09, 0.03], SEED_D);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = 0.1 + (i % 5) * 0.06;
    b.box([0.05, 0.03, 0.04], [Math.sin(a) * r, TRAY_Y + 0.12 + (i % 3) * 0.008, 0.03 + Math.cos(a) * r * 0.9], i % 2 ? SEED : CREAM, [0, a, 0]);
  }

  // the roof on two posts, stepped, with a cream ridge
  for (const s of [-1, 1]) b.box([0.07, ROOF_Y - TRAY_Y, 0.07], [s * 0.4, (ROOF_Y + TRAY_Y) / 2, -0.28], WOODL_D);
  b.box([0.98, 0.07, 0.74], [0, ROOF_Y + 0.035, ROOF_Z], CORAL);
  b.box([0.98, 0.03, 0.76], [0, ROOF_Y - 0.01, ROOF_Z], CORAL_DARK);
  b.box([0.94, 0.07, 0.5], [0, ROOF_Y + 0.105, ROOF_Z], CORAL);
  b.box([0.9, 0.07, 0.26], [0, ROOF_Y + 0.175, ROOF_Z], CORAL);
  b.box([0.86, 0.04, 0.09], [0, ROOF_Y + 0.23, ROOF_Z], CREAM);
  b.finish();

  // the three on the edge, the one in the air
  const kit = b.kit;
  const birds = PERCHES.map((p, i) => bird(kit, `bird${i}`, root, p.body, p.tail, true));
  const flyer = bird(kit, 'flyer', root, MINT, MINT_DARK, false);
  const wings = [wing(kit, 'wingL', flyer, -1), wing(kit, 'wingR', flyer, 1)];
  flyer.scale.setScalar(0.9);

  /** Puts all four where they are at beat `bt`, time `t`. */
  const pose = (bt: number, t: number): void => {
    const step = Math.floor(bt);
    const f = bt - step;
    const bob = Math.exp(-f * 5);
    for (let i = 0; i < birds.length; i++) {
      const g = birds[i];
      const p = PERCHES[i];
      const turn = step + 300 - i;
      const hopping = turn % 3 === 0;
      const n = Math.floor(turn / 3);
      const from = n % 2 ? p.a : p.b;
      const to = n % 2 ? p.b : p.a;
      const k = hopping ? f : 1;
      g.position.set(from[0] + (to[0] - from[0]) * k, RIM_Y + (hopping ? Math.sin(f * Math.PI) * 0.13 : 0), from[1] + (to[1] - from[1]) * k);
      g.rotation.set(!hopping && turn % 3 === 1 && n % 2 ? Math.sin(f * Math.PI) * 0.65 : 0, p.yaw, 0, 'YXZ');
      const s = hopping ? 0 : bob * 0.1;
      g.scale.set(1 + s, 1 - s, 1 + s);
    }
    const a = t * 1.15;
    flyer.position.set(Math.sin(a) * 0.74, 1.62 + Math.sin(t * 2.3) * 0.09 + bob * 0.03, Math.cos(a) * 0.74);
    flyer.rotation.set(0, (a + Math.PI / 2) % TAU, -0.28, 'YXZ');
    const flap = Math.sin(t * 17) * 0.75 + 0.15;
    wings[0].rotation.z = -flap;
    wings[1].rotation.z = flap;
  };
  pose(0, 0.4);

  finishShadows(root);
  let t = 0;
  return {
    root,
    update(dt, k) {
      t += dt;
      pose(k.playing ? k.beat : t * 1.6, t);
    },
  };
}
