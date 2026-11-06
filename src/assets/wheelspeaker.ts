/**
 * The speaker on wheels: a tall mustard toy cabinet with a dark front, a big cone and a little one,
 * rolling on four chunky black wheels with cream hubs. A steel pull-handle with a coral grip leans
 * out at the back and a coral pennant flies from a thin pole on top, trailing behind when it rolls.
 * It bounces on the beat while its music plays. Needs no power. Origin at its feet (the engine moves
 * and turns the root), front towards +Z, the way it goes.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL, STEEL_DARK, TAU } from './buildingParts';
import { Build, HP, finishShadows, mergeCached, tint } from './villages';

const DARK = '#1d1a19';
const GREY = '#4a4440';
const MUSTARD_DARK = '#c98f1c';
const TREAD = '#45403c';

const WHEEL_R = 0.2;
const AXLE_X = 0.41;
const AXLE_Z = 0.27;
/** The cabinet's floor and roof, and its front. */
const FLOOR = 0.3;
const ROOF = 1.28;
const FRONT = 0.26;
const FLAG_AT = [0.24, 1.72, -0.16] as const;

const beatFrac = (beat: number): number => beat - Math.floor(beat);
/** A disc standing on its back, facing +Z (r0 towards the front). */
const facing = (r0: number, r1: number, h: number, seg = 24): THREE.BufferGeometry => new THREE.CylinderGeometry(r0, r1, h, seg).rotateX(HP);

/** A speaker cone: dark ring, grey cone, a cap in `cap`, facing +Z from its ring. */
function coneGeo(key: string, r: number, cap: string): THREE.BufferGeometry {
  return mergeCached(`wheelspeaker/${key}`, [
    tint(facing(r, r, 0.05), DARK),
    tint(facing(r * 0.72, r * 0.86, 0.06).translate(0, 0, 0.04), GREY),
    tint(facing(r * 0.3, r * 0.34, 0.06, 14).translate(0, 0, 0.08), cap),
  ]);
}

export function createWheelspeaker(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'wheelspeaker';
  const b = new Build(skin, 'wheelspeaker');
  root.add(b.root);
  const body = b.root;

  // the chassis and the two axle blocks under it
  b.box([0.68, 0.09, 0.66], [0, 0.26, 0], CHARCOAL);
  for (const z of [-AXLE_Z, AXLE_Z]) b.box([0.12, 0.1, 0.1], [0, 0.19, z], STEEL_DARK);

  // the cabinet: mustard, a dark front, a coral roof, cream corner guards
  const H = ROOF - FLOOR;
  const midY = (ROOF + FLOOR) / 2;
  b.box([0.66, H, 0.5], [0, midY, 0], MUSTARD);
  b.box([0.56, H - 0.1, 0.03], [0, midY, FRONT - 0.005], '#3a3532');
  b.box([0.7, 0.08, 0.54], [0, ROOF + 0.03, 0], CORAL);
  b.box([0.64, 0.03, 0.48], [0, ROOF - 0.02, 0], CORAL_DARK);
  b.box([0.7, 0.05, 0.54], [0, FLOOR + 0.02, 0], MUSTARD_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.05, H - 0.04, 0.05], [sx * 0.335, midY, sz * 0.25], CREAM);
  // a carrying strap on the roof
  b.box([0.3, 0.05, 0.08], [0, ROOF + 0.13, 0.04], CHARCOAL);
  for (const s of [-1, 1]) b.box([0.05, 0.08, 0.08], [s * 0.13, ROOF + 0.09, 0.04], CHARCOAL);

  // the pull-handle, leaning out at the back
  for (const s of [-1, 1]) {
    b.beam([s * 0.22, 0.34, -0.25], [s * 0.22, 1.08, -0.43], 0.045, STEEL);
    b.box([0.07, 0.07, 0.05], [s * 0.22, 0.36, -0.26], STEEL_DARK);
  }
  b.box([0.56, 0.08, 0.08], [0, 1.09, -0.43], CORAL);
  b.box([0.5, 0.03, 0.09], [0, 1.09, -0.43], CORAL_DARK);

  // the pole for the flag
  b.box([0.03, FLAG_AT[1] - ROOF + 0.02, 0.03], [FLAG_AT[0], (FLAG_AT[1] + ROOF) / 2, FLAG_AT[2]], STEEL_DARK);
  b.box([0.07, 0.07, 0.07], [FLAG_AT[0], FLAG_AT[1] + 0.02, FLAG_AT[2]], MUSTARD);
  b.box([0.09, 0.03, 0.09], [FLAG_AT[0], ROOF + 0.08, FLAG_AT[2]], CHARCOAL);
  b.finish();

  // the two cones, thumping on their own
  const mat = b.kit.vertexColourMaterial(false);
  const cones: { m: THREE.Mesh; k: number }[] = [];
  for (const [key, r, y, cap, k] of [
    ['bass', 0.24, 0.62, CREAM, 1],
    ['top', 0.13, 1.07, CORAL, 0.6],
  ] as const) {
    const m = new THREE.Mesh(coneGeo(key, r, cap), mat);
    m.position.set(0, y, FRONT + 0.015);
    m.castShadow = true;
    body.add(m);
    cones.push({ m, k });
  }

  // the pennant: it swings on the pole
  const flag = new Build(skin, 'wheelspeaker-flag');
  flag.root.position.set(FLAG_AT[0], 0, FLAG_AT[2]);
  const pennant = new THREE.Shape();
  pennant.moveTo(0, 0);
  pennant.lineTo(-0.36, 0.1);
  pennant.lineTo(0, 0.22);
  pennant.lineTo(0, 0);
  flag.geo(new THREE.ExtrudeGeometry(pennant, { depth: 0.025, bevelEnabled: false }), [0, FLAG_AT[1] - 0.24, -0.012], CORAL);
  flag.finish();
  body.add(flag.root);

  // an axle: two chunky wheels with lumpy treads, cream hubs and a cross so the turning shows
  const axle = new Build(skin, 'wheelspeaker-axle');
  const side = { rot: [0, 0, HP] as const, seg: 18 };
  for (const s of [-1, 1]) {
    const x = s * AXLE_X;
    axle.cyl(WHEEL_R - 0.015, 0.15, [x, 0, 0], CHARCOAL, side);
    axle.cyl(0.1, 0.17, [x, 0, 0], CREAM, side);
    axle.box([0.175, 0.18, 0.035], [x, 0, 0], CORAL);
    axle.box([0.175, 0.035, 0.18], [x, 0, 0], CORAL);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      axle.box([0.15, 0.035, 0.08], [x, Math.cos(a) * (WHEEL_R - 0.015), Math.sin(a) * (WHEEL_R - 0.015)], TREAD, [a, 0, 0]);
    }
  }
  axle.box([0.74, 0.04, 0.04], [0, 0, 0], STEEL);
  axle.finish();
  const front = axle.root;
  const rear = front.clone();
  front.position.set(0, WHEEL_R, AXLE_Z);
  rear.position.set(0, WHEEL_R, -AXLE_Z);
  root.add(front, rear);

  finishShadows(root);
  let t = 0;
  let roll = 0;
  let trail = 0;
  return {
    root,
    update(dt, k) {
      t += dt;
      const speed = k.walk ?? 0;
      roll += (speed * dt) / WHEEL_R;
      front.rotation.x = rear.rotation.x = roll;
      const thump = k.playing ? Math.exp(-beatFrac(k.beat) * 7) : 0;
      for (const c of cones) c.m.scale.set(1 + thump * 0.09 * c.k, 1 + thump * 0.09 * c.k, 1 + thump * 1.3 * c.k);
      body.scale.set(1 + thump * 0.03, 1 - thump * 0.04, 1 + thump * 0.03);
      body.position.y = k.playing ? Math.sin(beatFrac(k.beat) * Math.PI) * 0.025 : 0;
      body.rotation.x = Math.min(0.08, speed * 0.018);
      // the pennant flies out over the roof, and behind when it rolls
      trail += (Math.min(1, speed / 3) - trail) * Math.min(1, dt * 4);
      flag.root.rotation.y = -trail * 1.25 + Math.sin(t * (3 + speed * 3)) * (0.12 + trail * 0.14);
    },
  };
}
