/**
 * The mini sun: a cream mast with mustard bands on a charcoal foot, and on top a small glowing sun,
 * a round yellow core in a mustard ring with eight chunky rays, long and short by turns, leaning back
 * so it looks up at the camera and turning slowly. Unfed it is plain yellow plastic. Fed it shines; at
 * night it has a warm halo and a warm pool on the ground. Origin at the floor centre of the 1×1
 * footprint, front towards +Z; glows are own emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CREAM, MUSTARD, STEEL_DARK, TAU, WARM, powerBulb, setGlow } from './buildingParts';
import { Build, finishShadows, pool } from './villages';

const RAY = '#ffb52e';
const C_CORE = new THREE.Color('#ffdc5a');
const C_RAY = new THREE.Color(RAY);
const C_CORE_OFF = new THREE.Color(WARM);
const C_RAY_OFF = new THREE.Color(MUSTARD);

const MAST_TOP = 2.12;
const SUN_Y = 2.42;
const CORE_R = 0.3;
const RAYS = 8;
/** How far the sun leans back (a turn about X), so its face looks up at the camera. */
const LEAN = -0.75;

export function createMinisun(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'minisun';
  const b = new Build(skin, 'minisun');
  root.add(b.root);

  // the foot, the mast and its bands, the cup the sun sits in
  b.box([0.74, 0.14, 0.74], [0, 0.07, 0], CHARCOAL);
  b.box([0.5, 0.08, 0.5], [0, 0.18, 0], STEEL_DARK);
  b.box([0.16, MAST_TOP - 0.22, 0.16], [0, (MAST_TOP + 0.22) / 2, 0], CREAM);
  for (const y of [0.9, 1.45, 1.96]) b.box([0.21, 0.09, 0.21], [0, y, 0], MUSTARD);
  b.cyl(0.08, 0.1, [0, MAST_TOP + 0.03, 0], MUSTARD, { r1: 0.15, seg: 10 });
  // the knob the wire hangs from
  b.box([0.13, 0.13, 0.13], [0, 1.78, 0.13], MUSTARD);

  // the sun: the core stays, the rays turn inside the lean
  b.glowBall('core', WARM, CORE_R, [0, SUN_Y, 0]);
  const lean = new THREE.Group();
  lean.position.set(0, SUN_Y, 0);
  lean.rotation.x = LEAN;
  b.root.add(lean);
  const rays = new Build(skin, 'minisun-rays');
  lean.add(rays.root);
  rays.geo(new THREE.TorusGeometry(CORE_R + 0.025, 0.04, 6, 20), [0, 0, 0], MUSTARD);
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * TAU;
    const long = i % 2 === 0;
    const h = long ? 0.3 : 0.2;
    const d = CORE_R + 0.03 + h / 2;
    rays.glowGeo('rays', RAY, new THREE.ConeGeometry(long ? 0.13 : 0.1, h, 4), [Math.sin(a) * d, Math.cos(a) * d, 0], { rot: [0, 0, -a], s: [1, 1, 0.6] });
  }
  const rayMat = rays.finish().rays;
  const coreMat = b.finish().core;
  setGlow(coreMat, C_CORE_OFF, 0);
  setGlow(rayMat, C_RAY_OFF, 0);

  // the halo is a soft round fade turned to the fixed camera; the pool lies on the ground
  const glow = pool(0xffc866, 1.15, [0, SUN_Y, 0]);
  glow.mesh.rotation.x = Math.PI / 6;
  const ground = pool(0xffb85a, 4.2, [0, 0.05, 0]);
  root.add(glow.mesh, ground.mesh);
  // sprites and pictures are framed by the bounding boxes: on the toy, not on how far its light falls
  for (const m of [glow.mesh, ground.mesh]) m.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0, 0.1));

  const bulb = powerBulb(skin, b.root, [0, 0.62, 0.08]);
  finishShadows(root);
  let t = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(0, 1.84, 0.13),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      if (pw?.on) rays.root.rotation.z -= dt * 0.35;
      const lit = !!pw && pw.linked && (pw.low ? Math.floor(t * 6) % 2 === 0 : pw.on);
      const key = lit ? 'on' + Math.round(k.night * 20) : 'off';
      if (key === last) return;
      last = key;
      if (lit) {
        setGlow(coreMat, C_CORE, 0.6 + 0.6 * k.night);
        setGlow(rayMat, C_RAY, 0.4 + 0.5 * k.night);
      } else {
        setGlow(coreMat, C_CORE_OFF, 0);
        setGlow(rayMat, C_RAY_OFF, 0);
      }
      glow.mat.opacity = 0.5 * k.night;
      ground.mat.opacity = 0.75 * k.night;
      glow.mesh.visible = ground.mesh.visible = lit && k.night > 0.03;
    },
  };
}
