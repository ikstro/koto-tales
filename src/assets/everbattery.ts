/**
 * The ever-battery: a huge round toy battery standing on a square foot, charcoal with a coral band
 * under three gold rings, a gold shoulder and a fat gold terminal on top. On its front a glowing mint
 * loop that never ends, with a bright spark running round it for ever; on the shoulder a ring of
 * eight studs (the same eight as the game's charge rings) lights one by one with the charge. Origin at
 * the floor centre of the 2×2 footprint, front towards +Z; glows are own emissive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MUSTARD, STEEL_DARK, TAU, WARM, powerBulb, setGlow } from './buildingParts';
import { Build, finishShadows } from './villages';

const GOLD = WARM;
const GOLD_DARK = '#c98f1c';
const LOOP = '#7fe0c8';
const C_LOOP = new THREE.Color(LOOP);
const C_LOOP_OFF = new THREE.Color('#4f8f84');
const C_SPARK = new THREE.Color('#fff6d8');
const C_STUD_ON = new THREE.Color(WARM);
const C_STUD_LOW = new THREE.Color('#ff6a4a');
const C_STUD_OFF = new THREE.Color('#4a4440');

const BODY_R = 0.84;
const BODY_TOP = 1.66;
const STUDS = 8;
const STUD_R = 0.56;
/** The loop's middle, half its width and its height along the battery's front. */
const LOOP_Y = 0.8;
const LOOP_W = 0.56;
const LOOP_H = 0.82;
const SPARK_STEPS = 64;

/** A figure-of-eight lying on its side, wrapped round the battery's front. */
class Loop extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }

  override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = t * TAU;
    const d = 1 + Math.sin(a) ** 2;
    const u = (LOOP_W * Math.cos(a)) / d;
    const v = (LOOP_H * Math.sin(a) * Math.cos(a)) / d;
    const r = BODY_R + 0.03;
    return out.set(r * Math.sin(u / r), LOOP_Y + v, r * Math.cos(u / r));
  }
}

export function createEverbattery(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'everbattery';
  const b = new Build(skin, 'everbattery');
  root.add(b.root);

  // the square foot
  b.box([1.92, 0.08, 1.92], [0, 0.04, 0], STEEL_DARK);
  b.box([1.82, 0.05, 1.82], [0, 0.1, 0], MUSTARD);

  // the body, its coral band and the gold rings
  const seg = 28;
  b.cyl(BODY_R, BODY_TOP - 0.12, [0, (BODY_TOP + 0.12) / 2, 0], CHARCOAL, { seg });
  b.cyl(BODY_R + 0.012, 0.42, [0, 1.41, 0], CORAL, { seg });
  for (const y of [0.42, 1.2, 1.62]) b.cyl(BODY_R + 0.035, 0.09, [0, y, 0], GOLD, { seg });
  // a cream plus on the band
  b.box([0.28, 0.08, 0.05], [0, 1.41, BODY_R + 0.015], CREAM);
  b.box([0.08, 0.28, 0.05], [0, 1.41, BODY_R + 0.015], CREAM);

  // the shoulder, the top, the terminal
  b.cyl(BODY_R + 0.01, 0.06, [0, BODY_TOP + 0.03, 0], GOLD_DARK, { seg, r1: 0.76 });
  b.cyl(0.76, 0.02, [0, BODY_TOP + 0.07, 0], CHARCOAL, { seg });
  b.cyl(0.3, 0.12, [0, BODY_TOP + 0.13, 0], GOLD_DARK, { seg: 18 });
  b.cyl(0.2, 0.16, [0, BODY_TOP + 0.26, 0], GOLD, { seg: 18 });
  b.cyl(0.13, 0.04, [0, BODY_TOP + 0.36, 0], MUSTARD, { seg: 14 });

  // the loop that never ends
  const curve = new Loop();
  b.glowGeo('loop', LOOP, new THREE.TubeGeometry(curve, 72, 0.05, 6, true), [0, 0, 0]);
  b.glowBall('spark', '#fff6d8', 0.082, [0, 0, 0]);
  const mats = b.finish();
  const spark = b.root.getObjectByName('glow_spark')!;
  spark.visible = false;
  // the spark's road, worked out once
  const road = new Float32Array((SPARK_STEPS + 1) * 3);
  const pt = new THREE.Vector3();
  for (let i = 0; i <= SPARK_STEPS; i++) {
    curve.getPoint(i / SPARK_STEPS, pt);
    pt.toArray(road, i * 3);
    // a touch out of the tube, so it rides on top
    road[i * 3] *= 1.03;
    road[i * 3 + 2] *= 1.03;
  }

  // the charge: eight studs round the top, one instanced draw, unlit so they read at any hour
  const studMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  studMat.userData.own = true;
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12), studMat, STUDS);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < STUDS; i++) {
    const a = (i / STUDS) * TAU;
    studs.setMatrixAt(i, m4.makeTranslation(Math.sin(a) * STUD_R, BODY_TOP + 0.09, Math.cos(a) * STUD_R));
    studs.setColorAt(i, C_STUD_OFF);
  }
  root.add(studs);

  const bulb = powerBulb(skin, b.root, [0, 0.235, BODY_R]);
  finishShadows(root);
  let t = 0;
  let run = 0;
  let shown = -1;
  let lit = false;
  return {
    root,
    socket: new THREE.Vector3(0, BODY_TOP + 0.38, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const charge = pw ? Math.min(1, Math.max(0, pw.charge)) : 0;
      const n = Math.ceil(charge * STUDS - 0.0001);
      const low = charge < 0.25;
      const key = n * 2 + (low ? 1 : 0);
      if (key !== shown) {
        shown = key;
        for (let i = 0; i < STUDS; i++) studs.setColorAt(i, i < n ? (low ? C_STUD_LOW : C_STUD_ON) : C_STUD_OFF);
        studs.instanceColor!.needsUpdate = true;
      }
      const on = !!pw && pw.linked;
      spark.visible = on;
      if (on) {
        lit = true;
        setGlow(mats.loop, C_LOOP, 0.75 + 0.3 * Math.sin(t * 1.7));
        setGlow(mats.spark, C_SPARK, 1.4);
        run = (run + dt * 0.3) % 1;
        const f = run * SPARK_STEPS;
        const i = Math.floor(f) * 3;
        const w = f - Math.floor(f);
        spark.position.set(road[i] + (road[i + 3] - road[i]) * w, road[i + 1] + (road[i + 4] - road[i + 1]) * w, road[i + 2] + (road[i + 5] - road[i + 2]) * w);
      } else if (lit) {
        lit = false;
        setGlow(mats.loop, C_LOOP_OFF, 0);
      }
    },
  };
}
