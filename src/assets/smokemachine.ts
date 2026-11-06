/**
 * The smoke machine: a small teal box on a charcoal foot with a mustard trumpet of a nozzle in front,
 * a round cream tank on top whose coral lid rattles while it works, a little gauge and the bulb on
 * its face. While fed, soft cream and violet puffs breathe out of the nozzle and roll low over the
 * ground to about five blocks all round, growing and fading, never higher than a hero's knees.
 * Origin at the floor centre, front towards +Z; the puffs are one instanced draw that starts hidden.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, TEAL, powerBulb } from './buildingParts';
import { Build, HP, TEAL_D, finishShadows, fx } from './villages';

const MUSTARD_DARK = '#c98f1c';
const PUFF_CREAM = '#ffeccb';
const PUFF_VIOLET = '#c9b6ff';
const GAUGE = '#fff4dc';

const PUFFS = 44;
/** Seconds a puff lives; how far from the machine the nearest and the farthest roll. */
const LIFE = 7.5;
const NEAR = 2.2;
const FAR = 5;
/** Where the puffs come out. */
const NOZZLE: readonly [number, number, number] = [0, 0.3, 0.5];
const LID_Y = 0.9;
/** How flat a puff is. */
const SQUASH = 0.55;

/** Each puff's way out: spread round by the golden angle, near and far by turns. */
const WAY_X = new Float32Array(PUFFS);
const WAY_Z = new Float32Array(PUFFS);
for (let i = 0; i < PUFFS; i++) {
  const a = i * 2.39996;
  const r = NEAR + (FAR - NEAR) * ((i * 0.618) % 1);
  WAY_X[i] = Math.sin(a) * r;
  WAY_Z[i] = Math.cos(a) * r;
}

/** Unlit see-through puffs: each instance's `aFade` is its opacity; its rim and its underside melt away. */
function puffMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  m.userData.own = true;
  m.onBeforeCompile = (s) => {
    const shared = 'varying float vFade;\nvarying vec3 vRound;\nvarying vec3 vEye;\n';
    s.vertexShader = `attribute float aFade;\n${shared}${s.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vFade = aFade * smoothstep(-0.6, 0.2, normal.y);
      vRound = normalMatrix * (normal * vec3(1.0, ${(1 / SQUASH).toFixed(3)}, 1.0));
      vEye = -mvPosition.xyz;`,
    );
    s.fragmentShader = `${shared}${s.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `diffuseColor.a *= vFade * smoothstep(0.0, 0.8, abs(dot(normalize(vRound), normalize(vEye))));
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'smoke-puff';
  return m;
}

export function createSmokemachine(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'smokemachine';
  const b = new Build(skin, 'smokemachine');
  root.add(b.root);

  // the foot, the box, a darker band and a mustard trim
  b.box([0.92, 0.08, 0.86], [0, 0.04, -0.03], CHARCOAL);
  b.box([0.8, 0.48, 0.72], [0, 0.32, -0.05], TEAL);
  b.box([0.82, 0.08, 0.74], [0, 0.14, -0.05], TEAL_D);
  b.box([0.86, 0.06, 0.78], [0, 0.58, -0.05], MUSTARD);
  // the nozzle: a short tube and a trumpet mouth
  b.cyl(0.075, 0.16, [0, NOZZLE[1], 0.37], STEEL_DARK, { rot: [HP, 0, 0], seg: 12 });
  b.cyl(0.08, 0.1, [0, NOZZLE[1], 0.44], MUSTARD, { rot: [HP, 0, 0], r1: 0.15, seg: 14 });
  b.cyl(0.1, 0.012, [0, NOZZLE[1], 0.495], CHARCOAL, { rot: [HP, 0, 0], seg: 14 });
  // a little gauge on its face
  b.cyl(0.095, 0.03, [-0.26, 0.42, 0.32], MUSTARD_DARK, { rot: [HP, 0, 0], seg: 14 });
  b.cyl(0.075, 0.034, [-0.26, 0.42, 0.323], GAUGE, { rot: [HP, 0, 0], seg: 14 });
  b.beam([-0.26, 0.42, 0.345], [-0.215, 0.47, 0.345], 0.016, CORAL, 0.008);
  // the tank, its band and the neck the lid sits on
  b.cyl(0.24, 0.24, [-0.02, 0.73, -0.1], CREAM, { seg: 16 });
  b.cyl(0.25, 0.05, [-0.02, 0.7, -0.1], MINT, { seg: 16 });
  b.cyl(0.11, 0.05, [-0.02, 0.87, -0.1], STEEL, { seg: 12 });
  // a lever on the side and the box the wire goes into
  b.box([0.06, 0.2, 0.06], [0.3, 0.71, 0.14], STEEL);
  b.box([0.11, 0.11, 0.11], [0.3, 0.83, 0.14], CORAL);
  b.box([0.2, 0.16, 0.05], [0.1, 0.42, -0.43], STEEL_DARK);

  // the lid rattles on its own
  const lid = new THREE.Group();
  lid.position.set(-0.02, LID_Y, -0.1);
  b.root.add(lid);
  const lp = b.part('lid', lid);
  lp.box([0.28, 0.05, 0.28], [0, 0.03, 0], CORAL);
  lp.box([0.2, 0.05, 0.2], [0, 0.07, 0], CORAL_DARK);
  lp.box([0.08, 0.08, 0.08], [0, 0.13, 0], CORAL);
  b.finish();

  // the puffs: their own sphere, because each machine keeps its own fades on it
  const geo = new THREE.SphereGeometry(1, 18, 12);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
  fade.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aFade', fade);
  const puffMat = puffMaterial();
  const puffs = fx(new THREE.InstancedMesh(geo, puffMat, PUFFS));
  puffs.visible = false;
  puffs.frustumCulled = false;
  puffs.renderOrder = 2;
  // the smoke rolls far past the toy; the kit plate's sprite frames the toy, not it
  puffs.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  const cream = new THREE.Color(PUFF_CREAM);
  const violet = new THREE.Color(PUFF_VIOLET);
  const col = new THREE.Color();
  for (let i = 0; i < PUFFS; i++) puffs.setColorAt(i, col.copy(cream).lerp(violet, (i * 0.381) % 1));
  root.add(puffs);

  const bulb = powerBulb(skin, b.root, [0.26, 0.42, 0.31]);
  finishShadows(root);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let t = 0;
  let level = 0;
  return {
    root,
    socket: new THREE.Vector3(0.1, 0.42, -0.45),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      level += ((on ? 1 : 0) - level) * Math.min(1, dt * 1.2);
      lid.position.y = LID_Y + (on ? Math.abs(Math.sin(t * 11)) * 0.022 : 0);
      lid.rotation.z = on ? Math.sin(t * 17) * 0.04 : 0;
      if (level < 0.01) {
        level = 0;
        puffs.visible = false;
        return;
      }
      puffs.visible = true;
      // unlit smoke would shine in the dark: it dims with the night
      puffMat.color.setScalar(1 - 0.5 * k.night);
      for (let i = 0; i < PUFFS; i++) {
        const life = (t / LIFE + i / PUFFS) % 1;
        const out = 1 - (1 - life) * (1 - life);
        const size = 0.2 + (0.6 + 0.3 * ((i * 0.27) % 1)) * out;
        const wob = 0.22 * out;
        pos.set(
          NOZZLE[0] + (WAY_X[i] - NOZZLE[0]) * out + Math.sin(t * 0.7 + i) * wob,
          NOZZLE[1] + (size * 0.3 - NOZZLE[1]) * Math.min(1, out * 3),
          NOZZLE[2] + (WAY_Z[i] - NOZZLE[2]) * out + Math.cos(t * 0.6 + i * 1.3) * wob,
        );
        puffs.setMatrixAt(i, m4.compose(pos, q, scl.set(size, size * SQUASH, size)));
        fade.setX(i, level * 0.5 * Math.min(1, life * 8) * (1 - life) ** 1.2);
      }
      puffs.instanceMatrix.needsUpdate = true;
      fade.needsUpdate = true;
    },
  };
}
