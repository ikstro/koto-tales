/**
 * The power station (content/buildings.ts `station`, the last power reward): a big toy plant on
 * the whole 3×3. Same conventions as buildings.ts: origin at the floor centre, front towards +Z,
 * static parts merged by the Kit, the model animates itself from `update`. Its glow is own
 * emissive and additive halos only, never a light (DESIGN.md «Performance»).
 *
 * `socket` is the crackling ball on top of the big copper coil: systems/power.ts starts its arcs
 * there.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { Kit, type PartBuilder } from './parts/kit';
import {
  CORAL,
  CORAL_DARK,
  CREAM,
  INK,
  MUSTARD,
  TEAL,
  MINT,
  CHARCOAL,
  STEEL,
  STEEL_DARK,
  TAU,
  C_WARM_SOFT,
  C_OFF,
  ownGlow,
  setGlow,
  powerBulb,
  markShadows,
  octagon,
  glowMaterial,
} from './buildingParts';

const COPPER = '#c87533';
const COPPER_DARK = '#9a5424';
const TEAL_DARK = '#226e69';
const STEAM = 7;
const SPARKS = 6;

/** The hall's front wall (z) and the dome's centre. */
const FRONT = 0.55;
const HALL_Z = -0.25;
const DOME_Y = 1.62;
/** The crackling ball on the big coil. */
const BALL = new THREE.Vector3(0, 3.62, HALL_Z);

/** An octagonal coil: copper rings stacked between cream insulator plates, from y0 to y1. */
function coil(p: PartBuilder, x: number, z: number, y0: number, y1: number, r: number): void {
  const n = Math.max(3, Math.round((y1 - y0) / 0.11));
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + h * (i + 0.5);
    const s = r * 2 * (1 - 0.12 * (i / n));
    const c = i % 2 ? COPPER_DARK : COPPER;
    const t = s * 0.4142;
    p.box([s, h * 0.8, t], [x, y, z], c);
    p.box([t, h * 0.8, s], [x, y, z], c);
    p.box([s, h * 0.8, t], [x, y, z], c, [0, Math.PI / 4, 0]);
    p.box([s, h * 0.8, t], [x, y, z], c, [0, -Math.PI / 4, 0]);
  }
  p.box([r * 0.9, y1 - y0, r * 0.9], [x, (y0 + y1) / 2, z], CHARCOAL);
}

/**
 * A charcoal plinth with a steel deck; a cream hall with a coral band, a dark door and two warm
 * windows; a stepped teal dome; on top of the dome a tall copper coil with a glowing ball that
 * crackles (sparks jump round it, a soft halo flickers); two short copper coils by the front
 * corners; a striped chimney at the back right puffing steam; a big mustard wheel turning on the
 * left wall; a gauge by the door whose needle trembles; the power bulb on the front.
 */
export function createStation(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'station';
  const kit = new Kit('station', skin);
  const p = kit.part('plant', root);
  // plinth and deck, with a step at the front
  p.box([2.92, 0.2, 2.92], [0, 0.1, 0], CHARCOAL);
  p.box([2.72, 0.06, 2.72], [0, 0.23, 0], STEEL_DARK);
  p.box([0.9, 0.1, 0.3], [0, 0.05, 1.4], STEEL);
  // the hall
  const HW = 2.1;
  const HD = 1.6;
  const HY = 0.26;
  const HH = 1.2;
  p.box([HW, HH, HD], [0, HY + HH / 2, HALL_Z], CREAM);
  p.box([HW + 0.04, 0.16, HD + 0.04], [0, HY + 0.1, HALL_Z], CORAL);
  p.box([HW + 0.06, 0.12, HD + 0.06], [0, HY + HH, HALL_Z], CORAL_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.1, HH, 0.1], [(sx * HW) / 2, HY + HH / 2, HALL_Z + (sz * HD) / 2], TEAL);
  // the door with a lightning sign, and the gauge's dial next to it
  p.box([0.5, 0.74, 0.05], [-0.35, HY + 0.45, FRONT + 0.01], TEAL_DARK);
  p.box([0.42, 0.66, 0.04], [-0.35, HY + 0.43, FRONT + 0.03], INK);
  p.box([0.06, 0.06, 0.04], [-0.2, HY + 0.42, FRONT + 0.06], MUSTARD);
  p.box([0.16, 0.16, 0.03], [-0.35, HY + 0.96, FRONT + 0.01], MUSTARD);
  p.box([0.05, 0.12, 0.03], [-0.35, HY + 0.96, FRONT + 0.03], INK, [0, 0, 0.5]);
  octagonFacing(p, 0.42, 0.05, 0.45, HY + 0.62, FRONT, CHARCOAL);
  octagonFacing(p, 0.34, 0.03, 0.45, HY + 0.62, FRONT + 0.05, CREAM);
  p.box([0.06, 0.06, 0.03], [0.45, HY + 0.62, FRONT + 0.08], CORAL);
  // the dome: stepped octagons, a mint band, a cap the coil stands on
  octagon(p, 1.9, 0.08, DOME_Y - 0.36, MINT, 0, HALL_Z);
  const tiers = [1.7, 1.45, 1.15, 0.82];
  tiers.forEach((s, i) => octagon(p, s, 0.2, DOME_Y - 0.28 + i * 0.2, i % 2 ? TEAL_DARK : TEAL, 0, HALL_Z));
  octagon(p, 0.6, 0.12, DOME_Y + 0.52, STEEL_DARK, 0, HALL_Z);
  // the big coil and its crown ring
  coil(p, 0, HALL_Z, DOME_Y + 0.64, BALL.y - 0.42, 0.24);
  octagon(p, 0.62, 0.08, BALL.y - 0.42, CREAM, 0, HALL_Z);
  p.box([0.1, 0.2, 0.1], [0, BALL.y - 0.28, HALL_Z], STEEL);
  // two short coils on the front corners, cream caps with a copper knob
  for (const s of [-1, 1]) {
    const x = s * 1.12;
    const z = 1.05;
    p.box([0.5, 0.12, 0.5], [x, 0.32, z], CHARCOAL);
    coil(p, x, z, 0.38, 1.2, 0.16);
    octagon(p, 0.36, 0.08, 1.2, CREAM, x, z);
    p.box([0.14, 0.14, 0.14], [x, 1.35, z], COPPER);
  }
  // the chimney at the back right: coral and cream bands
  const CX = 0.95;
  const CZ = -1.0;
  for (let i = 0; i < 7; i++) p.box([0.42 - i * 0.015, 0.36, 0.42 - i * 0.015], [CX, 0.44 + i * 0.36, CZ], i % 2 ? CREAM : CORAL);
  p.box([0.5, 0.1, 0.5], [CX, 0.44 + 7 * 0.36 - 0.13, CZ], CHARCOAL);
  // the wheel's axle box on the left wall
  p.box([0.16, 0.34, 0.34], [-HW / 2 - 0.08, HY + 0.62, HALL_Z + 0.1], STEEL_DARK);
  p.done();

  // warm windows (one own glow for both)
  const winMat = ownGlow(skin, '#ffd98a');
  for (const x of [0.3, 0.75]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.03), winMat);
    w.position.set(x, HY + 0.98, FRONT + 0.005);
    w.scale.x = x > 0.5 ? 0.9 : 1;
    root.add(w);
  }

  // the gauge's needle
  const needle = new THREE.Group();
  needle.position.set(0.45, HY + 0.62, FRONT + 0.08);
  root.add(needle);
  const nm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.02).translate(0, 0.06, 0), skin.partMaterial(INK));
  needle.add(nm);

  // the big wheel on the left wall, turning about X
  const wheel = new THREE.Group();
  wheel.position.set(-HW / 2 - 0.2, HY + 0.62, HALL_Z + 0.1);
  root.add(wheel);
  const w = kit.part('wheel', wheel);
  octagonX(w, 0.82, 0.08, MUSTARD);
  octagonX(w, 0.58, 0.1, CHARCOAL);
  w.box([0.12, 0.7, 0.1], [0, 0, 0], MUSTARD);
  w.box([0.12, 0.1, 0.7], [0, 0, 0], MUSTARD);
  w.box([0.16, 0.18, 0.18], [0, 0, 0], CORAL);
  w.box([0.12, 0.12, 0.12], [0.02, 0.33, 0], CREAM);
  w.done();

  // the crackling ball, its halo and the sparks jumping round it
  const ballMat = ownGlow(skin, '#7cc8ff');
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), ballMat);
  ball.position.copy(BALL);
  root.add(ball);
  const haloMat = glowMaterial(0x9fdcff);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 8), haloMat);
  halo.position.copy(BALL);
  root.add(halo);
  const sparkMat = ownGlow(skin, '#a8e4ff');
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), sparkMat, SPARKS);
  sparks.frustumCulled = false;
  root.add(sparks);

  // steam: soft cream cubes rising and swelling away from the chimney
  const steam = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#f2ece0'), STEAM);
  steam.frustumCulled = false;
  root.add(steam);
  const STACK_TOP = 0.44 + 7 * 0.36 - 0.08;

  const bulb = powerBulb(skin, root, [0.85, HY + 0.3, FRONT]);
  markShadows(root);
  halo.receiveShadow = false;
  sparks.castShadow = false;
  steam.castShadow = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  let t = 0;
  let last = '';
  return {
    root,
    socket: BALL.clone(),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      // it always makes power: the plant runs whether or not anything is joined
      wheel.rotation.x -= dt * 2.2;
      needle.rotation.z = -0.5 + Math.sin(t * 1.3) * 0.25 + Math.sin(t * 23) * 0.04;
      // the ball crackles: brightness flickers, sparks jump to new places a few times a second
      const flick = 0.75 + 0.25 * Math.sin(t * 31) * Math.sin(t * 17);
      setGlow(ballMat, col.set('#7cc8ff'), 0.45 + 0.4 * flick);
      haloMat.opacity = (0.1 + 0.32 * k.night) * flick;
      const hop = Math.floor(t * 9);
      for (let i = 0; i < SPARKS; i++) {
        const r = Math.sin(hop * 12.9898 + i * 78.233) * 43758.5453;
        const f = r - Math.floor(r);
        const a = f * TAU + i;
        const up = (f * 7.3) % 1;
        pos.set(BALL.x + Math.cos(a) * 0.3, BALL.y - 0.1 + up * 0.3, BALL.z + Math.sin(a) * 0.3);
        q.setFromEuler(e.set(up * 3, a, f * 2));
        const live = (i + hop) % 3 !== 0 ? 1 : 0;
        scl.set(live, live, live * (0.6 + f));
        sparks.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      sparks.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < STEAM; i++) {
        const life = (t * 0.4 + i / STEAM) % 1;
        pos.set(CX + life * 0.5 + Math.sin(t * 1.5 + i * 2) * 0.08, STACK_TOP + life * 1.8, CZ - life * 0.2);
        const s = 0.12 + 0.38 * Math.sin(Math.PI * life) ** 0.6;
        scl.set(s, s, s);
        q.setFromEuler(e.set(life * 2 + i, life * 2.5, 0));
        steam.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      steam.instanceMatrix.needsUpdate = true;
      // the windows: warm while the network has enough, blinking when it is short
      const lit = !pw || !pw.linked ? true : pw.low ? Math.floor(t * 6) % 2 === 0 : pw.on;
      const key = lit ? 'on' + Math.round(k.night * 10) : 'off';
      if (key !== last) {
        last = key;
        if (lit) setGlow(winMat, C_WARM_SOFT, 0.4 + 0.6 * k.night);
        else setGlow(winMat, C_OFF, 0);
      }
    },
  };
}

/** A flat octagon facing +Z at (x, y), `s` across, `d` deep, its back on `z`. */
function octagonFacing(p: PartBuilder, s: number, d: number, x: number, y: number, z: number, paint: string): void {
  const t = s * 0.4142;
  const at: [number, number, number] = [x, y, z + d / 2];
  p.box([s, t, d], at, paint);
  p.box([t, s, d], at, paint);
  p.box([s, t, d], at, paint, [0, 0, Math.PI / 4]);
  p.box([s, t, d], at, paint, [0, 0, -Math.PI / 4]);
}

/** A flat octagon facing ±X at the origin (a wheel turning about X). */
function octagonX(p: PartBuilder, s: number, d: number, paint: string): void {
  const t = s * 0.4142;
  p.box([d, s, t], [0, 0, 0], paint);
  p.box([d, t, s], [0, 0, 0], paint);
  p.box([d, s, t], [0, 0, 0], paint, [Math.PI / 4, 0, 0]);
  p.box([d, s, t], [0, 0, 0], paint, [-Math.PI / 4, 0, 0]);
}
