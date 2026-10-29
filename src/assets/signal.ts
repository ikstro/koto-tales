/**
 * The signal buildings (content/buildings.ts, stage D1 «Сигнал»): the Wi-Fi antenna, the
 * transmitter pad and the radar. Same conventions as disco.ts / prizes.ts: toy pieces, origin at
 * the floor centre of the footprint, front towards +Z, static parts merged by the Kit, every model
 * animates itself from `update`. Each carries the power bulb; parts that only show while it works
 * start hidden (ghosts are built from these). Glows are own emissive or additive, never lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import { swirlTexture, type BuildingModel } from './buildings';
import { Kit } from './parts/kit';
import {
  CORAL,
  CREAM,
  MINT,
  MUSTARD,
  TEAL,
  CHARCOAL,
  STEEL,
  STEEL_DARK,
  TAU,
  C_WARM,
  C_OFF,
  ownGlow,
  setGlow,
  powerBulb,
  markShadows,
  octagon,
  glowMaterial,
} from './buildingParts';

const TEAL_DARK = '#226e69';
const C_TIP = new THREE.Color('#ff6a4a');

/** Merges geometries, each baked with its own vertex colour (one mesh, one draw). */
function baked(parts: [THREE.BufferGeometry, string][]): THREE.BufferGeometry {
  const gs = parts.map(([g0, hex]) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (g !== g0) g0.dispose();
    g.deleteAttribute('uv');
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  const m = mergeGeometries(gs, false)!;
  gs.forEach((g) => g.dispose());
  m.computeBoundingSphere();
  return m;
}

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

const isOn = (pw: { on: boolean } | undefined): boolean => !!pw && pw.on;

// ─── the Wi-Fi antenna ──────────────────────────────────────────────────────

const RINGS = 3;
/** Seconds a ring takes to spread from the mast to the zone's edge. */
const RING_LIFE = 3.6;
/** How far the rings spread (the card's `signal.zone`). */
const WIFI_ZONE = 12;

/** A flat ring of radius 1, bright along its middle and soft at both edges (additive). */
function ringGeo(): THREE.BufferGeometry {
  return cached('wifi/ring', () => {
    const g = new THREE.RingGeometry(0.9, 1, 56, 2).rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    const pos = g.getAttribute('position');
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const v = Math.abs(r - 0.95) < 0.02 ? 1 : 0;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
}

/**
 * A slim teal mast on a charcoal footing with a little cabinet, steel crossbars, three cream
 * panel antennas near the top and a thin rod with a warm tip that blinks while it works. Fed: two
 * or three soft mint rings spread slowly over the ground out to the signal zone (12), faint by day,
 * clearer at dusk.
 */
export function createWifi(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'wifi';
  const kit = new Kit('wifi', skin);
  const p = kit.part('mast', root);
  p.box([0.86, 0.16, 0.86], [0, 0.08, 0], CHARCOAL);
  p.box([0.6, 0.08, 0.6], [0, 0.2, 0], STEEL_DARK);
  // the cabinet at the foot (the bulb is on its front)
  p.box([0.42, 0.56, 0.24], [0, 0.52, 0.2], TEAL_DARK);
  p.box([0.46, 0.06, 0.28], [0, 0.83, 0.2], MUSTARD);
  // the mast: four slim legs braced by steel rings, tapering a little
  const leg = (y: number): number => 0.17 - 0.07 * (y / 4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.beam([sx * leg(0.24), 0.24, sz * leg(0.24)], [sx * leg(3.9), 3.9, sz * leg(3.9)], 0.07, TEAL);
  for (const y of [0.8, 1.5, 2.2, 2.9, 3.55]) {
    const h = leg(y) + 0.04;
    p.box([2 * h + 0.02, 0.06, 2 * h + 0.02], [0, y, 0], y === 2.2 ? MINT : STEEL);
  }
  // two crossbars with a mustard knob where the wire hangs
  p.box([1.0, 0.08, 0.08], [0, 2.2, 0], STEEL_DARK);
  for (const s of [-1, 1]) p.box([0.1, 0.16, 0.1], [s * 0.48, 2.3, 0], CREAM);
  p.box([0.12, 0.12, 0.12], [0, 2.2, 0.14], MUSTARD);
  p.box([0.7, 0.07, 0.07], [0, 3.0, 0], STEEL_DARK);
  // three panel antennas round the top, cream with a coral cap
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    const x = Math.sin(a) * 0.26;
    const z = Math.cos(a) * 0.26;
    p.box([0.22, 0.62, 0.07], [x, 3.42, z], CREAM, [0, a, 0]);
    p.box([0.24, 0.06, 0.09], [x, 3.76, z], CORAL, [0, a, 0]);
  }
  p.box([0.26, 0.1, 0.26], [0, 3.95, 0], STEEL_DARK);
  p.box([0.05, 0.5, 0.05], [0, 4.25, 0], STEEL);
  p.done();

  const tipMat = ownGlow(skin, '#ffd23a');
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), tipMat);
  tip.position.set(0, 4.53, 0);
  root.add(tip);

  // the signal: rings spreading over the ground, one instanced additive draw
  const ringMat = glowMaterial(0x9fe8dc, true);
  ringMat.polygonOffset = true;
  ringMat.polygonOffsetFactor = -2;
  const rings = new THREE.InstancedMesh(ringGeo(), ringMat, RINGS);
  rings.frustumCulled = false;
  rings.visible = false;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < RINGS; i++) rings.setColorAt(i, white);
  root.add(rings);

  const bulb = powerBulb(skin, root, [0, 0.5, 0.32]);
  markShadows(root);
  rings.receiveShadow = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3(0, 0.05, 0);
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  let t = 0;
  let on = 0;
  let lastTip = '';
  return {
    root,
    socket: new THREE.Vector3(0, 2.2, 0.2),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = isOn(pw);
      on += ((live ? 1 : 0) - on) * Math.min(1, dt * 1.5);
      const tipKey = live ? (t % 1.1 < 0.45 ? 'hi' : 'lo') : 'off';
      if (tipKey !== lastTip) {
        lastTip = tipKey;
        if (tipKey === 'off') setGlow(tipMat, C_OFF, 0);
        else setGlow(tipMat, tipKey === 'hi' ? C_WARM : C_TIP, tipKey === 'hi' ? 1.2 : 0.35);
      }
      rings.visible = on > 0.02;
      if (!rings.visible) return;
      ringMat.opacity = (0.22 + 0.5 * k.night) * on;
      for (let i = 0; i < RINGS; i++) {
        const life = (t / RING_LIFE + i / RINGS) % 1;
        const r = 0.6 + life * (WIFI_ZONE - 0.6);
        scl.set(r, 1, r);
        rings.setMatrixAt(i, m4.compose(pos, q, scl));
        // grow in at the mast, fade towards the zone's edge
        const k2 = Math.min(1, life * 8) * (1 - life) ** 1.3;
        rings.setColorAt(i, col.setScalar(k2));
      }
      rings.instanceMatrix.needsUpdate = true;
      rings.instanceColor!.needsUpdate = true;
    },
  };
}

// ─── the transmitter pad ────────────────────────────────────────────────────

/**
 * A round teal pad the party stands on (no solid cells): a darker rim, a ring of cream studs, a
 * mustard centre ring, and a little antenna with a cabinet at the back corner. Fed: a warm swirl
 * opens on the pad and turns, lying flat, like the portal's; the antenna tip blinks.
 */
export function createTransmitter(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'transmitter';
  const kit = new Kit('transmitter', skin);
  const p = kit.part('pad', root);
  octagon(p, 2.92, 0.06, 0, TEAL_DARK);
  octagon(p, 2.76, 0.07, 0.05, TEAL);
  octagon(p, 1.9, 0.02, 0.11, MUSTARD);
  octagon(p, 1.72, 0.022, 0.112, CHARCOAL);
  // studs round the rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + Math.PI / 12;
    p.box([0.16, 0.06, 0.16], [Math.sin(a) * 1.18, 0.14, Math.cos(a) * 1.18], CREAM, [0, a, 0]);
  }
  // the antenna at the back right: a cabinet (the bulb is on its front) and a slim mast
  const AX = 0.92;
  const AZ = -0.92;
  p.box([0.44, 0.5, 0.3], [AX, 0.37, AZ], CHARCOAL);
  p.box([0.48, 0.06, 0.34], [AX, 0.65, AZ], MUSTARD);
  p.box([0.08, 1.15, 0.08], [AX, 1.25, AZ], STEEL);
  p.box([0.4, 0.06, 0.06], [AX, 1.35, AZ], STEEL_DARK);
  p.box([0.3, 0.06, 0.06], [AX, 1.62, AZ], STEEL_DARK);
  for (const s of [-1, 1]) p.box([0.06, 0.14, 0.06], [AX + s * 0.19, 1.42, AZ], CREAM);
  p.done();

  const tipMat = ownGlow(skin, '#ffd23a');
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), tipMat);
  tip.position.set(AX, 1.88, AZ);
  root.add(tip);

  // the swirl lies flat on the pad (its own material: it fades in and out per pad)
  const swirlMat = new THREE.MeshBasicMaterial({
    map: typeof document !== 'undefined' ? swirlTexture() : null,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  swirlMat.userData.own = true;
  const swirl = new THREE.Mesh(cached('transmitter/swirl', () => new THREE.CircleGeometry(0.84, 40).rotateX(-Math.PI / 2)), swirlMat);
  swirl.position.y = 0.14;
  swirl.visible = false;
  root.add(swirl);

  const bulb = powerBulb(skin, root, [AX, 0.37, AZ + 0.15]);
  markShadows(root);
  swirl.receiveShadow = false;
  let t = 0;
  let open = 0;
  let lastTip = '';
  return {
    root,
    socket: new THREE.Vector3(AX, 1.62, AZ + 0.05),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = isOn(pw);
      open += ((live ? 1 : 0) - open) * Math.min(1, dt * 2);
      swirl.visible = open > 0.02;
      if (swirl.visible) {
        swirl.rotation.y = t * 1.4;
        const s = open * (1 + Math.sin(t * 3) * 0.04);
        swirl.scale.set(s, 1, s);
        swirlMat.opacity = 0.95 * open;
      }
      const tipKey = live ? (t % 0.9 < 0.4 ? 'hi' : 'lo') : 'off';
      if (tipKey !== lastTip) {
        lastTip = tipKey;
        if (tipKey === 'off') setGlow(tipMat, C_OFF, 0);
        else setGlow(tipMat, tipKey === 'hi' ? C_WARM : C_TIP, tipKey === 'hi' ? 1.2 : 0.35);
      }
    },
  };
}

// ─── the radar ──────────────────────────────────────────────────────────────

/** Turns an open surface inside out: its inside becomes the front (a bowl seen from within). */
function inward(g0: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = g0.toNonIndexed();
  g0.dispose();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of [pos, nor]) {
      const x = a.getX(i + 1);
      const y = a.getY(i + 1);
      const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return g;
}

/** Where the dish hangs on the head and how far it leans back (facing +Z and up). */
const DISH_Y = 0.85;
const DISH_TILT = 0.55;
/** The dish's rim radius. */
const DISH_R = 0.82;

/** The radar's head (turns about Y): a turntable, a post, a big tilted dish facing +Z, the feed with its horn. */
function radarHead(): THREE.BufferGeometry {
  return cached('radar/head', () => {
    const dishAt = new THREE.Matrix4().compose(
      new THREE.Vector3(0, DISH_Y, 0.06),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - DISH_TILT, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    // the bowl: cream inside, steel back, a coral rim
    const inner = inward(new THREE.CylinderGeometry(DISH_R - 0.02, 0.2, 0.32, 22, 1, true).translate(0, 0.18, 0));
    const back = new THREE.CylinderGeometry(DISH_R + 0.02, 0.23, 0.36, 22, 1, true).translate(0, 0.16, 0);
    const bottom = new THREE.CylinderGeometry(0.23, 0.23, 0.05, 14);
    const rim = new THREE.TorusGeometry(DISH_R, 0.05, 6, 22).rotateX(Math.PI / 2).translate(0, 0.34, 0);
    // the feed: three struts to a mustard horn in front of the bowl
    const struts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 2;
      const from = new THREE.Vector3(Math.cos(a) * (DISH_R - 0.06), 0.34, Math.sin(a) * (DISH_R - 0.06));
      const to = new THREE.Vector3(0, 0.95, 0);
      const d = to.clone().sub(from);
      const g = new THREE.BoxGeometry(0.04, d.length(), 0.04);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      struts.push(g);
    }
    const dish: [THREE.BufferGeometry, string][] = [
      [inner, CREAM],
      [back, STEEL_DARK],
      [bottom, STEEL],
      [rim, CORAL],
      ...struts.map((g): [THREE.BufferGeometry, string] => [g, STEEL]),
      [new THREE.BoxGeometry(0.16, 0.18, 0.16).translate(0, 0.98, 0), MUSTARD],
      [new THREE.BoxGeometry(0.1, 0.06, 0.1).translate(0, 1.1, 0), CORAL],
    ];
    for (const [g] of dish) g.applyMatrix4(dishAt);
    return baked([
      [new THREE.CylinderGeometry(0.42, 0.46, 0.14, 16).translate(0, 0.07, 0), STEEL_DARK],
      [new THREE.BoxGeometry(0.46, 0.2, 0.4).translate(0, 0.24, -0.04), TEAL],
      [new THREE.BoxGeometry(0.16, 0.56, 0.16).translate(0, 0.6, 0), STEEL],
      [new THREE.BoxGeometry(0.3, 0.1, 0.2).translate(0, 0.86, 0.02), STEEL_DARK],
      ...dish,
    ]);
  });
}

/**
 * A short cream tower on a 2×2 charcoal base, teal bands, a little door and a window, a low railed
 * platform on top; on it a big dish on a turntable that sweeps slowly round while it works, with a
 * small coral light on top of the dish that blinks.
 */
export function createRadar(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'radar';
  const kit = new Kit('radar', skin);
  const p = kit.part('tower', root);
  p.box([1.9, 0.16, 1.9], [0, 0.08, 0], CHARCOAL);
  p.box([1.6, 0.08, 1.6], [0, 0.2, 0], STEEL_DARK);
  // the tower: a cream block narrowing once, teal bands
  p.box([1.12, 0.86, 1.12], [0, 0.67, 0], CREAM);
  p.box([1.18, 0.1, 1.18], [0, 1.13, 0], TEAL);
  p.box([0.9, 0.32, 0.9], [0, 1.34, 0], CREAM);
  p.box([1.3, 0.1, 1.3], [0, 1.55, 0], TEAL);
  // a door, a window, a junction box (the wire hangs from it)
  p.box([0.36, 0.56, 0.04], [-0.22, 0.52, 0.57], TEAL_DARK);
  p.box([0.05, 0.05, 0.03], [-0.1, 0.54, 0.6], MUSTARD);
  p.box([0.28, 0.16, 0.04], [0, 1.36, 0.46], CHARCOAL);
  p.box([0.22, 0.24, 0.14], [0.3, 0.84, 0.62], CHARCOAL);
  p.box([0.24, 0.05, 0.16], [0.3, 0.98, 0.62], MUSTARD);
  // a low railing round the platform
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.07, 0.2, 0.07], [sx * 0.6, 1.7, sz * 0.6], STEEL);
  for (const s of [-1, 1]) {
    p.box([1.27, 0.05, 0.05], [0, 1.78, s * 0.6], STEEL);
    p.box([0.05, 0.05, 1.27], [s * 0.6, 1.78, 0], STEEL);
  }
  p.done();

  const head = new THREE.Group();
  head.position.y = 1.6;
  root.add(head);
  const dish = new THREE.Mesh(radarHead(), kit.vertexColourMaterial(false));
  dish.castShadow = true;
  head.add(dish);
  // the blinking light sits on the dish's highest point (the back of the rim)
  const lightMat = ownGlow(skin, CORAL);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), lightMat);
  const c = Math.cos(Math.PI / 2 - DISH_TILT);
  const s = Math.sin(Math.PI / 2 - DISH_TILT);
  light.position.set(0, DISH_Y + 0.34 * c + DISH_R * s + 0.08, 0.06 + 0.34 * s - DISH_R * c);
  head.add(light);

  const bulb = powerBulb(skin, root, [-0.3, 0.98, 0.56]);
  markShadows(root);
  let t = 0;
  let speed = 0;
  let lastLight = '';
  return {
    root,
    socket: new THREE.Vector3(0.3, 1.0, 0.62),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = isOn(pw);
      speed += ((live ? 0.7 : 0) - speed) * Math.min(1, dt * 1.2);
      head.rotation.y += dt * speed;
      const key = live ? (t % 1.3 < 0.25 ? 'hi' : 'lo') : 'off';
      if (key !== lastLight) {
        lastLight = key;
        if (key === 'off') setGlow(lightMat, C_OFF, 0);
        else setGlow(lightMat, C_TIP, key === 'hi' ? 1.3 : 0.25);
      }
    },
  };
}
