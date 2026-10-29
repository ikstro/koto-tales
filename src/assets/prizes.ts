/**
 * The villages' prizes (content/buildings.ts, stage C1): garland (elves), carousel (gnomes),
 * searchlight (robots), trampoline (aliens). Same conventions as buildings.ts / disco.ts:
 * toy pieces, origin at the floor centre of the footprint, front towards +Z, every model
 * animates itself from `update`; the powered ones carry the little power bulb, and parts that
 * only show while it works are hidden when `power` is missing (ghosts are built from these).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { Kit, type V3 } from './parts/kit';
import {
  CORAL,
  CORAL_DARK,
  CREAM,
  MINT,
  MUSTARD,
  TEAL,
  CHARCOAL,
  STEEL,
  STEEL_DARK,
  WOOD,
  WOOD_DARK,
  TAU,
  C_OFF,
  ownGlow,
  setGlow,
  powerBulb,
  markShadows,
  octagon,
  fadeDisc,
  glowMaterial,
  showColour,
  showPhase,
  showLevel,
} from './buildingParts';

// ─── shared bits ────────────────────────────────────────────────────────────

const PARTY = ['#e8463a', '#ffd23a', '#59b3ab', '#6fb7ff', '#ee6a82', '#8fd45a'].map((c) => new THREE.Color(c));
const DULL = new THREE.Color('#5b5550');

/** Merges geometries, each baked with its own vertex colour (one mesh, one draw). */
function baked(parts: [THREE.BufferGeometry, string][]): THREE.BufferGeometry {
  const gs = parts.map(([g, hex]) => {
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

const beatFrac = (beat: number): number => beat - Math.floor(beat);
const wrapPi = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** An unlit, colour-per-instance material for lit bulbs (changes per frame, so it is this model's own). */
function bulbMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  m.userData.own = true;
  return m;
}

/** How a powered building is doing: 'on' works, 'low' blinks, 'off' is dark or unjoined. */
function powerState(pw: { linked: boolean; on: boolean; low: boolean } | undefined): 'on' | 'low' | 'off' {
  if (!pw) return 'off';
  if (pw.linked && pw.low) return 'low';
  return pw.on ? 'on' : 'off';
}

// ─── the garland (elves) ────────────────────────────────────────────────────

const LEAF = '#4f9a3c';
const LEAF_DARK = '#3a7a30';
const GN = 7;
const G_X = 0.925;
/** The string sags from the cleats to ~2.1 in the middle: the party walks under the lowest bulb (~1.95). */
const wireY = (x: number): number => 2.44 - 0.3 * (1 - (x / G_X) ** 2);
const bulbX = (i: number): number => -0.78 + i * 0.26;

/**
 * Two leaf-green posts with gold collars and a sagging string of chunky coloured bulbs. Fed: the
 * bulbs twinkle in a chase and pop on the beat while music plays; at night they glow with a soft
 * halo and a faint warm pool on the ground. Short of power they blink coral; unfed they are dull.
 */
export function createGarland(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'garland';
  const kit = new Kit('garland', skin);
  const p = kit.part('posts', root);
  for (const s of [-1, 1]) {
    p.box([0.46, 0.3, 0.46], [s, 0.15, 0], LEAF_DARK);
    p.box([0.5, 0.05, 0.5], [s, 0.325, 0], MUSTARD);
    p.box([0.2, 2.0, 0.2], [s, 1.35, 0], LEAF);
    for (const y of [0.8, 1.4, 1.95]) p.box([0.27, 0.08, 0.27], [s, y, 0], MUSTARD);
    p.box([0.32, 0.1, 0.32], [s, 2.4, 0], MUSTARD);
    p.box([0.16, 0.14, 0.16], [s, 2.52, 0], CORAL);
    // two leaves on each post
    p.box([0.3, 0.05, 0.12], [s + 0.2, 0.62, 0.02], LEAF_DARK, [0, 0, 0.5]);
    p.box([0.3, 0.05, 0.12], [s - 0.2, 0.5, -0.02], LEAF_DARK, [0, 0, -0.5]);
    // the cleat the string hangs from
    p.box([0.1, 0.1, 0.1], [s * G_X, 2.44, 0], MUSTARD);
  }
  // the string itself, and a cap above every bulb
  const SEG = 14;
  for (let j = 0; j < SEG; j++) {
    const x0 = -G_X + (2 * G_X * j) / SEG;
    const x1 = -G_X + (2 * G_X * (j + 1)) / SEG;
    p.beam([x0, wireY(x0), 0], [x1, wireY(x1), 0], 0.045, WOOD_DARK);
  }
  for (let i = 0; i < GN; i++) p.box([0.09, 0.09, 0.09], [bulbX(i), wireY(bulbX(i)) - 0.055, 0], CHARCOAL);
  p.done();

  // the bulbs: chunky glass drops, one instanced draw; colour and pop change every frame
  const drop = cached('garland/bulb', () =>
    baked([
      [new THREE.BoxGeometry(0.22, 0.18, 0.22).translate(0, -0.04, 0), '#ffffff'],
      [new THREE.BoxGeometry(0.14, 0.1, 0.14).translate(0, 0.09, 0), '#ffffff'],
    ]),
  );
  const bulbMat = bulbMaterial();
  const bulbs = new THREE.InstancedMesh(drop, bulbMat, GN);
  bulbs.frustumCulled = false;
  root.add(bulbs);

  // night: a halo round every bulb and one warm pool under the string
  const haloMat = glowMaterial(0xffffff);
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), haloMat, GN);
  halos.frustumCulled = false;
  halos.visible = false;
  root.add(halos);
  const poolMat = glowMaterial(0xffb85a, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pool = new THREE.Mesh(fadeDisc(1), poolMat);
  pool.scale.set(2.3, 1, 1.15);
  pool.position.set(0, 0.04, 0.05);
  pool.visible = false;
  root.add(pool);

  const bulb = powerBulb(skin, root, [1, 0.15, 0.23]);
  markShadows(root);
  halos.receiveShadow = false;
  pool.receiveShadow = false;
  bulbs.receiveShadow = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const showCol = new THREE.Color();
  let t = 0;
  return {
    root,
    socket: new THREE.Vector3(1, 2.6, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const st = powerState(pw);
      const blink = Math.floor(t * 6) % 2 === 0;
      const lit = st === 'on' || (st === 'low' && blink);
      const night = k.night;
      const frac = beatFrac(k.beat);
      const parity = Math.floor(k.beat) % 2;
      // a night show: the bulbs run through the show's colours in a wave along the string
      const sh = st === 'on' ? showLevel(k.show) : 0;
      const ph = showPhase(root);
      for (let i = 0; i < GN; i++) {
        const base = sh > 0 ? showColour(k.show!, ph + i * 0.3, showCol).multiplyScalar(1.25) : PARTY[i % PARTY.length];
        let glow = 0;
        let pop = 0;
        if (st === 'on') {
          const tw = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.95);
          glow = 0.5 + 0.7 * tw * tw;
          if (k.playing && i % 2 === parity) {
            pop = Math.exp(-frac * 6);
            glow += pop * 0.5;
          }
          col.copy(base).multiplyScalar(glow);
        } else if (st === 'low') {
          col.copy(lit ? C_CORAL_LIT : DULL_BULB);
        } else {
          col.copy(base).lerp(DULL, 0.62).multiplyScalar(0.7);
        }
        bulbs.setColorAt(i, col);
        const x = bulbX(i);
        pos.set(x, wireY(x) - 0.22, 0);
        scl.setScalar(1 + pop * 0.4);
        bulbs.setMatrixAt(i, m4.compose(pos, q, scl));
        // halo
        const hk = lit ? (st === 'on' ? Math.min(1, glow) : 0.8) : 0;
        halos.setColorAt(i, col.copy(st === 'low' ? C_CORAL_LIT : base).multiplyScalar(hk));
        halos.setMatrixAt(i, m4.compose(pos, q, scl.setScalar(1 + pop * 0.5)));
      }
      bulbs.instanceMatrix.needsUpdate = true;
      bulbs.instanceColor!.needsUpdate = true;
      halos.instanceMatrix.needsUpdate = true;
      halos.instanceColor!.needsUpdate = true;
      const glowing = lit && night > 0.04;
      halos.visible = glowing;
      haloMat.opacity = 0.04 + 0.16 * night;
      pool.visible = glowing;
      poolMat.opacity = 0.5 * night;
    },
  };
}

const C_CORAL_LIT = new THREE.Color('#ff6a4a');
const DULL_BULB = new THREE.Color('#4a4440');

// ─── the carousel (gnomes) ──────────────────────────────────────────────────

const RIM_BULBS = 8;
const SEAT_R = 1.0;
const PLATFORM_TOP = 0.33;
const SEAT_Y = 0.55;

type Animal = 'pony' | 'bunny' | 'bear';

/** A chunky toy animal facing +Z with a mustard saddle; its back (saddle top) is at SEAT_Y. */
function addAnimal(kit: Kit, parent: THREE.Object3D, kind: Animal, n: number): void {
  const p = kit.part(`animal${n}`, parent);
  const body = kind === 'pony' ? CORAL : kind === 'bunny' ? MINT : WOOD;
  const trim = kind === 'pony' ? CREAM : kind === 'bunny' ? CREAM : '#c98f1c';
  const hoof = kind === 'pony' ? CORAL_DARK : kind === 'bunny' ? TEAL : WOOD_DARK;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.13, 0.22, 0.13], [sx * 0.14, 0.11, sz * 0.26], hoof);
  p.box([0.42, 0.3, 0.78], [0, 0.35, 0], body);
  p.box([0.36, 0.06, 0.34], [0, SEAT_Y - 0.03, -0.02], MUSTARD);
  p.box([0.38, 0.1, 0.04], [0, SEAT_Y - 0.02, -0.2], CORAL_DARK);
  if (kind === 'pony') {
    p.box([0.2, 0.36, 0.2], [0, 0.62, 0.36], body, [0.35, 0, 0]);
    p.box([0.24, 0.26, 0.3], [0, 0.78, 0.5], body);
    p.box([0.16, 0.14, 0.14], [0, 0.72, 0.68], trim);
    p.box([0.07, 0.4, 0.2], [0, 0.72, 0.26], trim, [0.35, 0, 0]);
    for (const sx of [-1, 1]) p.box([0.06, 0.12, 0.06], [sx * 0.08, 0.96, 0.42], body);
    p.beam([0, 0.46, -0.38], [0, 0.18, -0.58], 0.09, trim);
  } else if (kind === 'bunny') {
    p.box([0.3, 0.28, 0.28], [0, 0.66, 0.42], body);
    p.box([0.16, 0.1, 0.1], [0, 0.6, 0.6], trim);
    for (const sx of [-1, 1]) p.box([0.07, 0.38, 0.05], [sx * 0.08, 0.98, 0.38], body, [-0.12, 0, sx * 0.1]);
    for (const sx of [-1, 1]) p.box([0.04, 0.28, 0.03], [sx * 0.08, 0.98, 0.405], CORAL, [-0.12, 0, sx * 0.1]);
    p.box([0.16, 0.16, 0.16], [0, 0.42, -0.44], trim);
  } else {
    p.box([0.32, 0.3, 0.3], [0, 0.66, 0.42], body);
    p.box([0.18, 0.14, 0.14], [0, 0.6, 0.6], trim);
    p.box([0.07, 0.07, 0.04], [0, 0.66, 0.67], CHARCOAL);
    for (const sx of [-1, 1]) p.box([0.12, 0.12, 0.08], [sx * 0.14, 0.84, 0.36], body);
    p.box([0.1, 0.1, 0.1], [0, 0.38, -0.42], body);
  }
  p.done();
}

/**
 * A round carousel with no solid cells: a low platform heroes step onto, a centre pole, a
 * coral-and-cream canopy with a scalloped edge, three toy animals on brass poles. Fed: the whole
 * ride turns (the animals rise and fall a little) and the bulbs round the canopy glow.
 * `seats` are the three saddles (children of the turning group); riders sit at their world positions.
 */
export function createCarousel(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'carousel';
  const kit = new Kit('carousel', skin);

  // the base never turns; a small control box with the power bulb stands in the front corner
  const b = kit.part('base', root);
  octagon(b, 2.9, 0.1, 0, CHARCOAL);
  b.box([0.34, 0.3, 0.26], [1.15, 0.15, 1.2], CHARCOAL);
  b.box([0.36, 0.05, 0.28], [1.15, 0.325, 1.2], MUSTARD);
  b.done();

  const spin = new THREE.Group();
  root.add(spin);
  const p = kit.part('ride', spin);
  // platform: a coral rim and a cream top (0.33) with six painted spokes
  octagon(p, 2.7, 0.14, 0.1, CORAL);
  octagon(p, 2.5, 0.09, 0.24, CREAM);
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + 0.26;
    p.box([0.16, 0.015, 0.9], [Math.sin(a) * 0.82, 0.3375, Math.cos(a) * 0.82], i % 2 ? MINT : MUSTARD, [0, a, 0]);
  }
  // hub, centre pole with coral bands
  octagon(p, 0.7, 0.2, PLATFORM_TOP, MUSTARD);
  p.box([0.22, 1.4, 0.22], [0, 1.23, 0], CREAM);
  for (const y of [0.85, 1.25, 1.65]) p.box([0.28, 0.12, 0.28], [0, y, 0], CORAL);
  // canopy: five tiers stepping in, alternating coral and cream, and a finial
  const CY = 1.95;
  const tiers: [number, string][] = [
    [2.5, CORAL],
    [2.1, CREAM],
    [1.65, CORAL],
    [1.2, CREAM],
    [0.75, CORAL],
  ];
  tiers.forEach(([s, c], i) => octagon(p, s, 0.11, CY + i * 0.1, c));
  p.box([0.16, 0.16, 0.16], [0, CY + 0.5 + 0.08, 0], MUSTARD);
  // a scalloped valance: a flap on every flat of the rim
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const c1 = k % 2 ? CORAL_DARK : CREAM;
    const c2 = k % 2 ? CREAM : CORAL_DARK;
    p.box([0.9, 0.2, 0.05], [dx * 1.26, CY - 0.07, dz * 1.26], c1, [0, a, 0]);
    p.box([0.9, 0.05, 0.07], [dx * 1.26, CY - 0.19, dz * 1.26], c2, [0, a, 0]);
  }
  // brass poles from the platform to the canopy, one through every animal
  for (let k = 0; k < 3; k++) {
    const a = (k * TAU) / 3;
    p.box([0.06, CY - PLATFORM_TOP, 0.06], [Math.sin(a) * SEAT_R, (CY + PLATFORM_TOP) / 2, Math.cos(a) * SEAT_R], MUSTARD);
  }
  p.done();

  // the animals, facing along the way round; every seat is a child of the turning group
  const animals: THREE.Group[] = [];
  const seats: THREE.Object3D[] = [];
  (['pony', 'bunny', 'bear'] as const).forEach((kind, k) => {
    const a = (k * TAU) / 3;
    const g = new THREE.Group();
    g.name = kind;
    g.position.set(Math.sin(a) * SEAT_R, PLATFORM_TOP, Math.cos(a) * SEAT_R);
    g.rotation.y = a + Math.PI / 2;
    addAnimal(kit, g, kind, k);
    const seat = new THREE.Object3D();
    seat.name = 'seat';
    seat.position.set(0, SEAT_Y, 0);
    g.add(seat);
    spin.add(g);
    animals.push(g);
    seats.push(seat);
  });

  // the bulbs round the canopy rim (on the corners, between the flaps) and their night halos
  const bulbMat = bulbMaterial();
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), bulbMat, RIM_BULBS);
  const haloMat = glowMaterial(0xffffff);
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 8, 6), haloMat, RIM_BULBS);
  halos.visible = false;
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < RIM_BULBS; i++) {
    const a = ((i + 0.5) * TAU) / RIM_BULBS;
    m4.makeTranslation(Math.sin(a) * 1.34, CY - 0.1, Math.cos(a) * 1.34);
    bulbs.setMatrixAt(i, m4);
    halos.setMatrixAt(i, m4);
    bulbs.setColorAt(i, DULL);
    halos.setColorAt(i, DULL);
  }
  bulbs.frustumCulled = halos.frustumCulled = false;
  spin.add(bulbs, halos);

  const bulb = powerBulb(skin, root, [1.15, 0.17, 1.33]);
  markShadows(root);
  bulbs.receiveShadow = halos.receiveShadow = false;

  const col = new THREE.Color();
  let t = 0;
  let rate = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(1.15, 0.4, 1.2),
    seats,
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const st = powerState(pw);
      rate += ((st === 'on' ? 0.6 : 0) - rate) * Math.min(1, dt * 1.6);
      spin.rotation.y += rate * dt;
      const lift = Math.min(1, rate / 0.6);
      animals.forEach((g, i) => {
        g.position.y = PLATFORM_TOP + lift * (0.045 + 0.045 * Math.sin(spin.rotation.y * 3 + i * 2.1));
      });
      const blink = Math.floor(t * 6) % 2 === 0;
      const night = k.night;
      const lit = st === 'on' || (st === 'low' && blink);
      halos.visible = lit && night > 0.04;
      haloMat.opacity = 0.04 + 0.16 * night;
      // colours change only while something is moving or lit
      if (st === 'on' || last !== st + (lit ? '1' : '0')) {
        last = st + (lit ? '1' : '0');
        for (let i = 0; i < RIM_BULBS; i++) {
          const base = PARTY[i % PARTY.length];
          if (st === 'on') {
            const w = 0.5 + 0.5 * Math.sin(t * 4 - i * 0.8);
            col.copy(base).multiplyScalar(0.55 + 0.7 * w);
          } else if (st === 'low') col.copy(lit ? C_CORAL_LIT : DULL_BULB);
          else col.copy(base).lerp(DULL, 0.62).multiplyScalar(0.7);
          bulbs.setColorAt(i, col);
          halos.setColorAt(i, lit ? col : col.setScalar(0));
        }
        bulbs.instanceColor!.needsUpdate = true;
        halos.instanceColor!.needsUpdate = true;
      }
    },
  };
}

// ─── the searchlight (robots) ───────────────────────────────────────────────

const HEAD_Y = 1.45;
const LENS_Z = 0.36;
const BEAM_LEN = 15;
/** The head tilts so its axis meets the floor ~14 blocks out. */
const TILT = Math.asin((HEAD_Y - 0.02) / 14);

/** A long open cone along +Z that dies away with distance (additive). */
function coneGeometry(len: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, 14, 6, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  const pos = g.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.pow(Math.max(0, 1 - pos.getZ(i) / len), 1.25);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/**
 * A steel and teal pedestal with a yoke and a round lamp head that turns to `aim`. Fed and dark
 * (night > 0.3): the lens burns, a long soft cone leaves it and a bright pool lies where it lands.
 */
export function createSearchlight(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'searchlight';
  const kit = new Kit('searchlight', skin);
  const p = kit.part('base', root);
  p.box([0.92, 0.12, 0.92], [0, 0.06, 0], CHARCOAL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.1, 0.06, 0.1], [sx * 0.38, 0.14, sz * 0.38], STEEL);
  p.box([0.66, 0.5, 0.66], [0, 0.37, 0], TEAL);
  p.box([0.7, 0.07, 0.7], [0, 0.3, 0], MINT);
  p.box([0.5, 0.1, 0.5], [0, 0.67, 0], STEEL_DARK);
  // the control plate on the front: a dial and two rivets, and the bulb below it
  p.box([0.34, 0.2, 0.03], [-0.04, 0.5, 0.335], CHARCOAL);
  p.box([0.1, 0.1, 0.03], [-0.12, 0.5, 0.355], CREAM);
  p.box([0.05, 0.05, 0.03], [0.04, 0.55, 0.355], CORAL);
  p.box([0.05, 0.05, 0.03], [0.04, 0.45, 0.355], MUSTARD);
  p.done();

  // everything above the pedestal turns to the aim
  const pan = new THREE.Group();
  root.add(pan);
  const y = kit.part('yoke', pan);
  octagon(y, 0.6, 0.1, 0.72, STEEL);
  y.box([0.86, 0.08, 0.34], [0, 0.86, 0], STEEL_DARK);
  for (const s of [-1, 1]) {
    y.box([0.08, 0.84, 0.3], [s * 0.39, 1.26, 0], STEEL);
    y.box([0.1, 0.16, 0.34], [s * 0.39, 1.72, 0], TEAL);
    y.box([0.06, 0.14, 0.14], [s * 0.45, HEAD_Y, 0], MUSTARD);
    y.beam([s * 0.3, 0.88, 0], [s * 0.36, 1.2, 0], 0.06, STEEL_DARK);
  }
  y.done();

  // the head tilts: barrel, front rim, back cap, two bands, a little antenna
  const tilt = new THREE.Group();
  tilt.position.set(0, HEAD_Y, 0);
  tilt.rotation.x = TILT;
  pan.add(tilt);
  const cyl = (r: number, h: number, z: number, seg = 18): THREE.BufferGeometry =>
    new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2).translate(0, 0, z);
  const headGeo = cached('searchlight/head', () =>
    baked([
      [cyl(0.27, 0.5, 0.05), STEEL_DARK],
      [cyl(0.31, 0.06, 0.32), MUSTARD],
      [cyl(0.22, 0.16, -0.28), TEAL],
      [cyl(0.285, 0.05, -0.07), CORAL],
      [cyl(0.285, 0.05, 0.12), CORAL],
      [new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(0.1, 0.36, -0.1), STEEL],
      [new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0.1, 0.52, -0.1), CORAL],
    ]),
  );
  const head = new THREE.Mesh(headGeo, kit.vertexColourMaterial(false));
  head.castShadow = true;
  tilt.add(head);
  const lensMat = ownGlow(skin, '#1f3436');
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.03, 18).rotateX(Math.PI / 2), lensMat);
  lens.position.z = 0.335;
  tilt.add(lens);
  setGlow(lensMat, new THREE.Color('#1f3436'), 0);

  // light: a wide soft cone with a narrower hot core, a halo at the lens
  const coneMat = glowMaterial(0xfff0c8, true);
  const coreMat = glowMaterial(0xfff6dc, true);
  const cone = new THREE.Mesh(coneGeometry(BEAM_LEN, 0.26, 1.5), coneMat);
  const core = new THREE.Mesh(coneGeometry(BEAM_LEN, 0.14, 0.5), coreMat);
  cone.position.z = core.position.z = LENS_Z + 0.02;
  cone.frustumCulled = core.frustumCulled = false;
  cone.visible = core.visible = false;
  tilt.add(cone, core);
  const haloMat = glowMaterial(0xffe9b0);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), haloMat);
  halo.position.z = LENS_Z + 0.1;
  halo.visible = false;
  tilt.add(halo);
  // where the axis meets the ground
  const hit = (HEAD_Y - 0.02) / Math.tan(TILT) + LENS_Z * Math.cos(TILT);
  const poolMat = glowMaterial(0xffeab0, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pool = new THREE.Mesh(fadeDisc(1), poolMat);
  pool.scale.set(1.7, 1, 3.4);
  pool.position.set(0, 0.04, hit);
  pool.visible = false;
  pan.add(pool);

  const bulb = powerBulb(skin, root, [0.2, 0.37, 0.335]);
  markShadows(root);
  for (const o of [cone, core, halo, pool]) o.receiveShadow = false;

  const C_LENS = new THREE.Color('#fff1c8');
  const C_DARK_LENS = new THREE.Color('#1f3436');
  let t = 0;
  let yaw = 0;
  let beam = 0;
  return {
    root,
    socket: new THREE.Vector3(0, 0.78, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const st = powerState(pw);
      if (k.aim !== undefined) yaw += wrapPi(k.aim - yaw) * Math.min(1, dt * 4);
      pan.rotation.y = yaw;
      const lit = st === 'on' || (st === 'low' && Math.floor(t * 6) % 2 === 0);
      const want = st === 'on' && k.night > 0.3 ? Math.min(1, (k.night - 0.3) / 0.4) : 0;
      beam += (want - beam) * Math.min(1, dt * 5);
      if (lit) setGlow(lensMat, C_LENS, 0.7 + 0.6 * k.night);
      else setGlow(lensMat, C_DARK_LENS, 0);
      const shown = beam > 0.01;
      cone.visible = core.visible = pool.visible = shown;
      coneMat.opacity = 0.13 * beam;
      coreMat.opacity = 0.24 * beam;
      poolMat.opacity = 0.85 * beam;
      halo.visible = lit && (shown || k.night > 0.3);
      haloMat.opacity = 0.06 + 0.14 * k.night;
    },
  };
}

// ─── the trampoline (aliens) ────────────────────────────────────────────────

const LILAC = '#b79be0';
const LILAC_DARK = '#8e72c8';
const T_FRAME_A = 0.92;
const T_MAT_A = 0.65;
const T_INNER_A = T_FRAME_A - 0.08;
const T_Y = 0.43;
const T_SPRINGS = 16;
const T_DIP = 0.22;

/** Radius of an octagon with flats at the compass points, at angle `a` (0 = +Z) for apothem `ap`. */
function octRadius(ap: number, a: number): number {
  const q = Math.PI / 4;
  const d = (((a + q / 2) % q) + q) % q - q / 2;
  return ap / Math.cos(d);
}

/**
 * A mint octagonal frame on short teal legs, a lilac mat with a cream target and sixteen cream
 * springs. `bounce` presses the mat down and stretches the springs; the mat itself settles with
 * a small wobble.
 */
export function createTrampoline(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'trampoline';
  const kit = new Kit('trampoline', skin);
  const p = kit.part('frame', root);
  const V = T_FRAME_A / Math.cos(Math.PI / 8);
  const vert = (k: number): V3 => {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    return [V * Math.sin(a), T_Y, V * Math.cos(a)];
  };
  for (let k = 0; k < 8; k++) {
    p.beam(vert(k), vert(k + 1), 0.16, MINT);
    const v = vert(k);
    p.box([0.2, 0.2, 0.2], v, k % 2 ? MINT : '#6cc4bb');
  }
  for (let k = 0; k < 8; k += 2) {
    const v = vert(k);
    p.box([0.14, T_Y - 0.1, 0.14], [v[0] * 0.97, (T_Y - 0.1) / 2 + 0.05, v[2] * 0.97], TEAL);
    p.box([0.24, 0.05, 0.24], [v[0], 0.025, v[2]], '#1f6b66');
  }
  p.done();

  // the mat: lilac with a darker binding and a cream target; it moves as one piece
  const mat = new THREE.Group();
  root.add(mat);
  const m = kit.part('mat', mat);
  octagon(m, T_MAT_A * 2, 0.05, 0.41, LILAC_DARK);
  octagon(m, T_MAT_A * 2 - 0.14, 0.055, 0.41, LILAC);
  octagon(m, 0.56, 0.012, 0.462, CREAM);
  octagon(m, 0.28, 0.014, 0.462, CORAL);
  m.done();

  // springs: unit-long coils along +Z, placed between the frame and the mat edge every frame
  const springGeo = cached('trampoline/spring', () =>
    baked([
      [new THREE.BoxGeometry(0.045, 0.045, 1).translate(0, 0, 0.5), '#d2b074'],
      ...[0.1, 0.34, 0.58, 0.82].map((z): [THREE.BufferGeometry, string] => [new THREE.BoxGeometry(0.1, 0.1, 0.17).translate(0, 0, z + 0.04), CREAM]),
    ]),
  );
  const springs = new THREE.InstancedMesh(springGeo, kit.vertexColourMaterial(false), T_SPRINGS);
  springs.frustumCulled = false;
  springs.castShadow = true;
  root.add(springs);

  markShadows(root);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  const place = (d: number): void => {
    mat.position.y = -T_DIP * d;
    const sxz = 1 - 0.04 * d;
    mat.scale.set(sxz, 1, sxz);
    for (let i = 0; i < T_SPRINGS; i++) {
      const a = (i * TAU) / T_SPRINGS;
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      const rf = octRadius(T_INNER_A, a);
      const rm = octRadius(T_MAT_A, a) * sxz;
      from.set(sx * rf, T_Y, cz * rf);
      to.set(sx * rm, 0.435 - T_DIP * d, cz * rm);
      dir.subVectors(to, from);
      const len = dir.length();
      q.setFromUnitVectors(Z, dir.divideScalar(len));
      springs.setMatrixAt(i, m4.compose(from, q, scl.set(1, 1, len)));
    }
    springs.instanceMatrix.needsUpdate = true;
  };
  place(0);

  let x = 0;
  let v = 0;
  return {
    root,
    update(dt, k) {
      const target = Math.min(1, Math.max(0, k.bounce ?? 0));
      // a small damped spring: the mat follows the press and rings a little afterwards
      const steps = Math.max(1, Math.ceil(dt / 0.012));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        v += (320 * (target - x) - 16 * v) * h;
        x += v * h;
      }
      if (Math.abs(x) < 0.0005 && Math.abs(v) < 0.001 && target === 0) {
        if (x !== 0) {
          x = 0;
          v = 0;
          place(0);
        }
        return;
      }
      place(Math.max(-0.25, Math.min(1.2, x)));
    },
  };
}
