/**
 * The beehive: a round straw hive of fat golden rings with a little dark door and a landing board,
 * on a low wooden stool, a jar of honey with a coral lid on the stool's front corner, and four fat
 * striped bees circling it, faster while the party eats. Four seats on the ground round it, the
 * cat's last. Origin at the floor centre of the 1×1, front towards +Z; no power, no glow.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CORAL, CORAL_DARK, CREAM, INK, MUSTARD, TAU, WOOD, WOOD_DARK } from './buildingParts';
import type { V3 } from './parts/kit';
import { Build, HP, finishShadows, fx, mergeCached, place, tint } from './villages';

const STRAW = '#e9bb5a';
const STRAW_DARK = '#c9933f';
const HONEY = '#f0a31c';
const BEE = '#ffc928';
const BEE_DARK = '#3b2414';
const WING = '#fff6e2';

/** The stool's top, and where the hive stands on it. */
const TOP = 0.33;
const HX = -0.09;
const HZ = -0.09;
const HIVE_R = 0.38;
const RINGS = 7;
const BEES = 4;

/** A seat on the ground: its position is the sitting surface, facing its local +Z (yaw `ry`). */
function seatAt(parent: THREE.Object3D, at: V3, ry: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

/** A fat bee facing +Z: a yellow body, two dark bands, a dark head. */
function beeBody(): THREE.BufferGeometry {
  return mergeCached('beehive/bee', [
    tint(place(new THREE.SphereGeometry(1, 10, 8), [0, 0, 0], { s: [0.088, 0.078, 0.125] }), BEE),
    tint(place(new THREE.CylinderGeometry(0.09, 0.09, 0.036, 12), [0, 0, -0.018], { rot: [HP, 0, 0], s: [1, 1, 0.9] }), BEE_DARK),
    tint(place(new THREE.CylinderGeometry(0.074, 0.074, 0.032, 12), [0, 0, -0.072], { rot: [HP, 0, 0], s: [1, 1, 0.9] }), BEE_DARK),
    tint(place(new THREE.SphereGeometry(0.058, 10, 8), [0, 0.006, 0.108]), BEE_DARK),
  ]);
}

/** Its two wings, spread and a little up: they beat by squashing in y. */
function beeWings(): THREE.BufferGeometry {
  return mergeCached('beehive/wings', [
    tint(place(new THREE.SphereGeometry(1, 8, 6), [-0.09, 0.09, -0.01], { s: [0.095, 0.014, 0.055], rot: [0, 0, -0.45] }), WING),
    tint(place(new THREE.SphereGeometry(1, 8, 6), [0.09, 0.09, -0.01], { s: [0.095, 0.014, 0.055], rot: [0, 0, 0.45] }), WING),
  ]);
}

export function createBeehive(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'beehive';
  const b = new Build(skin, 'beehive');
  root.add(b.root);

  // the stool
  b.box([0.94, 0.07, 0.94], [0, TOP - 0.035, 0], WOOD);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box([0.13, 0.27, 0.13], [sx * 0.37, 0.135, sz * 0.37], WOOD_DARK);
    b.box([0.07, 0.05, 0.64], [sx * 0.37, 0.12, 0], WOOD_DARK);
  }

  // the hive: a dome under fat rings of straw, a knob on top
  b.ball(1, [HX, TOP, HZ], STRAW_DARK, { top: true, s: [HIVE_R - 0.02, 0.72, HIVE_R - 0.02] });
  for (let i = 0; i < RINGS; i++) {
    const f = i / RINGS;
    const r = HIVE_R * Math.sqrt(1 - f * f);
    b.geo(new THREE.TorusGeometry(r, 0.064, 6, 20), [HX, TOP + 0.05 + f * 0.66, HZ], i % 2 ? STRAW_DARK : STRAW, { rot: [HP, 0, 0] });
  }
  b.ball(0.11, [HX, TOP + 0.74, HZ], MUSTARD, { s: [1, 0.8, 1] });

  // the door and its landing board
  const front = HZ + HIVE_R + 0.04;
  b.disc(0.145, 0.05, [HX, TOP + 0.14, front - 0.03], [0, 0, 1], WOOD);
  b.disc(0.1, 0.05, [HX, TOP + 0.14, front - 0.01], [0, 0, 1], INK);
  b.box([0.3, 0.035, 0.13], [HX, TOP + 0.03, front + 0.04], WOOD_DARK);

  // the jar of honey on the stool's corner, a coral cloth lid tied with cream, one drip
  const JX = 0.31;
  const JZ = 0.31;
  b.cyl(0.125, 0.25, [JX, TOP + 0.125, JZ], HONEY, { seg: 14 });
  b.cyl(0.128, 0.07, [JX, TOP + 0.12, JZ], CREAM, { seg: 14 });
  b.cyl(0.14, 0.05, [JX, TOP + 0.28, JZ], CORAL, { seg: 14 });
  b.cyl(0.105, 0.03, [JX, TOP + 0.255, JZ], CORAL_DARK, { seg: 14 });
  b.box([0.05, 0.1, 0.03], [JX + 0.05, TOP + 0.21, JZ + 0.118], '#ffc94a');

  b.finish();

  // the bees, two instanced draws
  const bodies = new THREE.InstancedMesh(beeBody(), b.kit.vertexColourMaterial(false), BEES);
  const wings = new THREE.InstancedMesh(beeWings(), b.kit.vertexColourMaterial(false), BEES);
  bodies.frustumCulled = wings.frustumCulled = false;
  root.add(fx(bodies), fx(wings));

  finishShadows(root);
  const seats = [
    seatAt(root, [-0.92, 0, 0.1], HP),
    seatAt(root, [0.92, 0, 0.1], -HP),
    seatAt(root, [0, 0, 0.92], Math.PI),
    seatAt(root, [0, 0, -0.9], 0),
  ];

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const flap = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let t = 0;
  let pace = 1;
  let way = 0;
  const fly = (): void => {
    flap.y = 0.45 + 0.75 * Math.abs(Math.sin(t * 46));
    for (let i = 0; i < BEES; i++) {
      // two go one way round, two the other, at their own heights
      const dir = i % 2 ? -1 : 1;
      const a = dir * (way * 1.5 + (i * TAU) / BEES);
      const r = 0.6 + 0.09 * Math.sin(way * 1.3 + i * 2.1);
      pos.set(HX + Math.sin(a) * r, 0.86 + i * 0.1 + 0.13 * Math.sin(way * 2.2 + i * 1.7), HZ + Math.cos(a) * r);
      q.setFromAxisAngle(up, a + (dir * Math.PI) / 2);
      bodies.setMatrixAt(i, m4.compose(pos, q, one));
      wings.setMatrixAt(i, m4.compose(pos, q, flap));
    }
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  };
  fly();

  return {
    root,
    seats,
    update(dt, k) {
      t += dt;
      pace += ((k.eat !== undefined ? 2.8 : 1) - pace) * Math.min(1, dt * 3);
      way += dt * pace;
      fly();
    },
  };
}
