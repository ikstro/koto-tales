/**
 * The electric fence: three short teal posts on charcoal feet, knee-high, with two copper rails held
 * off them by white insulators, mustard caps on the end posts and a copper ball on the middle one
 * (the zap starts there), a little mustard plate with a dark bolt hanging on the top rail and a
 * cabinet with the power bulb at the right end. Fed, tiny pale arcs crawl along the rails and jump
 * between them; a zap lights both rails and a pale flash along the fence. Origin at the floor
 * centre of the 3×1 footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, INK, MUSTARD, STEEL_DARK, TEAL, glowMaterial, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, fx } from './villages';

const COPPER = '#d9854a';
const COPPER_DARK = '#a8622f';
const INSULATOR = '#f8f4ea';

const POSTS = [-1.16, 0, 1.16];
const POST_H = 0.76;
const RAILS = [0.28, 0.62];
const RAIL_Z = 0.2;
const RAIL_X0 = -1.34;
const RAIL_X1 = 1.23;
/** Seconds a strike's flash lasts. */
const FLASH = 0.4;

const CRAWLERS = 6;
const JUMPERS = 2;
const ARCS = CRAWLERS + JUMPERS;

const C_COPPER = new THREE.Color(COPPER);
const C_ARC = new THREE.Color('#c8f2ff');

/** A jagged spark one unit long along Y, thin as a thread. */
function zigGeo(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0, -0.5],
    [0.07, -0.2],
    [-0.06, 0.08],
    [0.05, 0.3],
    [0, 0.5],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const d = new THREE.Vector3(bx - ax, by - ay, 0);
    const g = new THREE.BoxGeometry(0.024, d.length() + 0.01, 0.024);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    g.translate((ax + bx) / 2, (ay + by) / 2, 0);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  return m;
}

/** A soft ball of light for the flash: its edge fades as the fixed camera sees it. */
function flashGeo(): THREE.BufferGeometry {
  const view = new THREE.Vector3(0, 0.72, 0.69).normalize();
  const g = new THREE.SphereGeometry(1, 14, 10);
  const nor = g.getAttribute('normal');
  const a = new Float32Array(nor.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = Math.max(0, n.fromBufferAttribute(nor, i).dot(view)) ** 5;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

let zig: THREE.BufferGeometry | null = null;
let flashShape: THREE.BufferGeometry | null = null;

export function createEfence(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'efence';
  const b = new Build(skin, 'efence');
  root.add(b.root);

  POSTS.forEach((x, i) => {
    b.box([0.42, 0.1, 0.46], [x, 0.05, 0.04], CHARCOAL);
    b.box([0.18, POST_H - 0.1, 0.18], [x, (POST_H + 0.1) / 2, 0], TEAL);
    if (i === 1) b.box([0.24, 0.05, 0.24], [x, POST_H, 0], COPPER_DARK);
    else b.box([0.26, 0.08, 0.26], [x, POST_H + 0.02, 0], MUSTARD);
    // a white insulator for each rail: a stem off the post and a fat grooved head round the rail
    for (const y of RAILS) {
      b.cyl(0.05, 0.1, [x, y, 0.13], INSULATOR, { rot: [HP, 0, 0], seg: 10 });
      b.cyl(0.1, 0.05, [x, y, RAIL_Z - 0.035], INSULATOR, { rot: [HP, 0, 0], seg: 14 });
      b.cyl(0.075, 0.04, [x, y, RAIL_Z + 0.005], STEEL_DARK, { rot: [HP, 0, 0], seg: 14 });
      b.cyl(0.1, 0.05, [x, y, RAIL_Z + 0.04], INSULATOR, { rot: [HP, 0, 0], seg: 14 });
    }
  });
  b.ball(0.08, [0, POST_H + 0.08, 0], COPPER, { seg: 12 });

  // the plate on the top rail, between the middle and the right post: a dark bolt, no words
  const PX = 0.58;
  const PZ = RAIL_Z + 0.03;
  for (const s of [-1, 1]) b.box([0.03, 0.09, 0.03], [PX + s * 0.08, 0.56, RAIL_Z], STEEL_DARK);
  b.box([0.28, 0.24, 0.03], [PX, 0.42, RAIL_Z + 0.01], MUSTARD);
  b.beam([PX + 0.05, 0.51, PZ], [PX - 0.04, 0.41, PZ], 0.05, INK, 0.012);
  b.beam([PX - 0.05, 0.42, PZ], [PX + 0.05, 0.42, PZ], 0.05, INK, 0.012);
  b.beam([PX + 0.04, 0.43, PZ], [PX - 0.05, 0.33, PZ], 0.05, INK, 0.012);

  // the cabinet at the right end, the rails run into it
  b.box([0.27, 0.52, 0.36], [1.36, 0.3, 0.06], CHARCOAL);
  b.box([0.31, 0.06, 0.4], [1.36, 0.59, 0.06], MUSTARD);

  // the rails: copper that lights up when it strikes
  for (const y of RAILS) {
    b.glowGeo('rail', COPPER, new THREE.CylinderGeometry(0.04, 0.04, RAIL_X1 - RAIL_X0, 8), [(RAIL_X0 + RAIL_X1) / 2, y, RAIL_Z], { rot: [0, 0, HP] });
  }
  const railMat = b.finish().rail;
  setGlow(railMat, C_COPPER, 0);

  // the sparks: one instanced additive draw
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xc8f2ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  arcMat.userData.own = true;
  const arcs = new THREE.InstancedMesh((zig ??= zigGeo()), arcMat, ARCS);
  arcs.frustumCulled = false;
  arcs.visible = false;
  root.add(fx(arcs));

  // the flash: a long soft glow along the fence
  const flashMat = glowMaterial(0xbfeaff, true);
  flashMat.side = THREE.FrontSide;
  const flash = fx(new THREE.Mesh((flashShape ??= flashGeo()), flashMat));
  flash.position.set(0, 0.5, RAIL_Z);
  flash.scale.set(1.7, 0.55, 0.5);
  flash.visible = false;
  root.add(flash);

  const bulb = powerBulb(skin, b.root, [1.36, 0.32, 0.24]);
  finishShadows(root);

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const z = new THREE.Vector3(0, 0, 1);
  const flat = new THREE.Quaternion().setFromAxisAngle(z, HP);
  const flatFlip = new THREE.Quaternion().setFromAxisAngle(z, -HP);
  const up = new THREE.Quaternion();
  const upFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const railCol = new THREE.Color();
  const span = RAIL_X1 - RAIL_X0 - 0.2;
  let t = 0;
  let lit = false;
  return {
    root,
    socket: new THREE.Vector3(1.36, 0.62, 0.06),
    tip: new THREE.Vector3(0, POST_H + 0.12, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      if (!pw?.on) {
        if (lit) {
          lit = false;
          arcs.visible = false;
          flash.visible = false;
          setGlow(railMat, C_COPPER, 0);
        }
        return;
      }
      lit = true;
      const zap = k.zap ?? Infinity;
      const f = zap < FLASH ? 1 - zap / FLASH : 0;

      // the rails hum faintly and flare on a strike
      setGlow(railMat, railCol.copy(C_COPPER).lerp(C_ARC, f), 0.12 + 1.1 * f);
      flash.visible = f > 0;
      flashMat.opacity = 0.42 * f;

      arcs.visible = true;
      arcMat.opacity = 0.65 + 0.3 * k.night;
      const hop = Math.floor(t * 15);
      for (let i = 0; i < ARCS; i++) {
        const flip = (hop + i) % 2 === 0;
        if (i < CRAWLERS) {
          // crawling along a rail, the two rails opposite ways
          const dir = i % 2 ? 1 : -1;
          const u = (((t * 0.32 * dir + i / CRAWLERS) % 1) + 1) % 1;
          pos.set(RAIL_X0 + 0.1 + u * span, RAILS[i % 2] + (flip ? 0.03 : -0.03), RAIL_Z + 0.05);
          scl.set(1, 0.3 + 0.16 * Math.sin(t * 9 + i) + 0.3 * f, 1);
          arcs.setMatrixAt(i, m4.compose(pos, flip ? flat : flatFlip, scl));
        } else {
          // a little spark jumping between the rails, somewhere else every moment
          const seed = Math.floor(t * 2.6) + i * 3;
          pos.set(RAIL_X0 + 0.2 + ((seed * 0.618) % 1) * (span - 0.2), (RAILS[0] + RAILS[1]) / 2, RAIL_Z + 0.03);
          scl.set(1.2, RAILS[1] - RAILS[0], 1);
          arcs.setMatrixAt(i, m4.compose(pos, flip ? up : upFlip, scl));
        }
      }
      arcs.instanceMatrix.needsUpdate = true;
    },
  };
}
