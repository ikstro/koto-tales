/**
 * The food and fun buildings (content/buildings.ts, stage D2 «Їжа і решта»): the picnic, the
 * ice-cream kiosk, the swings, and the snacks the party eats. Same conventions as signal.ts /
 * prizes.ts: toy pieces, origin at the floor centre of the footprint, front towards +Z, static
 * parts merged by the Kit, every model animates itself from `update`. Glows are own emissive or
 * additive, never lights.
 *
 * Seats: each seat's world position is where a sitter's hips rest (the surface it sits on), and
 * the sitter faces the seat's local +Z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterModel, Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { Kit, type V3 } from './parts/kit';
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
  WOOD,
  C_OFF,
  ownGlow,
  setGlow,
  powerBulb,
  markShadows,
  octagon,
} from './buildingParts';

const WICKER = '#c8964a';
const WICKER_DARK = '#9c6b2e';
const APPLE = '#e53935';
const APPLE_DARK = '#c62828';
const LEAF = '#4f9a3c';
const PINK = '#ee6a82';
const WAFFLE = '#d9a35b';
const WAFFLE_DARK = '#b47c3a';
const CHOC = '#7a4a24';
const TEAL_DARK = '#226e69';

const ease = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** A seat: an empty object whose position is the sitting surface, facing its local +Z (yaw `ry`). */
function seatAt(parent: THREE.Object3D, at: V3, ry: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

// ─── the picnic ─────────────────────────────────────────────────────────────

const BLANKET_Y = 0.04;
const BASKET_Z = 0.3;

/**
 * A checked coral-and-cream blanket over most of the 3×3, a wicker basket with a handle and two
 * hinged lids full of apples, two cream plates and cups along the front. Four seats on the
 * blanket round the basket: the heroes at its sides and in front facing in, the cat behind it facing the front.
 * While the party eats the lids swing open and the apples inside bob.
 */
export function createPicnic(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'picnic';
  const kit = new Kit('picnic', skin);
  const p = kit.part('blanket', root);
  const N = 6;
  const S = 2.7 / N;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      p.box([S, BLANKET_Y, S], [-1.35 + S * (i + 0.5), BLANKET_Y / 2, -1.35 + S * (k + 0.5)], (i + k) % 2 ? CORAL : CREAM);
    }
  }
  // a hem round the edge and a corner folded over
  for (const s of [-1, 1]) {
    p.box([2.78, BLANKET_Y * 0.8, 0.06], [0, BLANKET_Y * 0.4, s * 1.38], CORAL_DARK);
    p.box([0.06, BLANKET_Y * 0.8, 2.78], [s * 1.38, BLANKET_Y * 0.4, 0], CORAL_DARK);
  }
  p.box([0.34, 0.03, 0.34], [1.18, BLANKET_Y + 0.015, -1.18], CREAM, [0, Math.PI / 4, 0]);
  // two plates with a bite each and two cups along the front
  for (const s of [-1, 1]) {
    const x = s * 0.62;
    const z = 1.0;
    p.box([0.4, 0.03, 0.17], [x, BLANKET_Y + 0.015, z], CREAM);
    p.box([0.17, 0.03, 0.4], [x, BLANKET_Y + 0.015, z], CREAM);
    p.box([0.3, 0.035, 0.3], [x, BLANKET_Y + 0.02, z], '#f6e7c4', [0, Math.PI / 4, 0]);
    // a sandwich on one, an apple half on the other
    if (s < 0) {
      p.box([0.2, 0.04, 0.14], [x, BLANKET_Y + 0.055, z], MUSTARD);
      p.box([0.21, 0.025, 0.15], [x, BLANKET_Y + 0.085, z], LEAF);
      p.box([0.2, 0.04, 0.14], [x, BLANKET_Y + 0.115, z], MUSTARD);
    } else {
      p.box([0.14, 0.09, 0.14], [x, BLANKET_Y + 0.08, z], APPLE);
      p.box([0.1, 0.012, 0.1], [x, BLANKET_Y + 0.13, z], CREAM);
    }
    p.box([0.13, 0.17, 0.13], [s * 0.18, BLANKET_Y + 0.085, 1.12], s < 0 ? TEAL : CORAL);
    p.box([0.09, 0.012, 0.09], [s * 0.18, BLANKET_Y + 0.172, 1.12], CREAM);
    p.box([0.04, 0.09, 0.04], [s * 0.18 + s * 0.09, BLANKET_Y + 0.09, 1.12], s < 0 ? TEAL : CORAL);
  }
  // the basket: woven walls (light and dark bands), a rim, a handle over the top
  const BW = 0.74;
  const BD = 0.5;
  const BH = 0.36;
  const by = BLANKET_Y;
  p.box([BW, BH, BD], [0, by + BH / 2, BASKET_Z], WICKER);
  for (const y of [0.08, 0.2]) {
    p.box([BW + 0.02, 0.05, BD + 0.02], [0, by + y, BASKET_Z], WICKER_DARK);
  }
  for (const x of [-0.24, 0, 0.24]) p.box([0.04, BH - 0.02, BD + 0.025], [x, by + BH / 2, BASKET_Z], WICKER_DARK);
  p.box([BW + 0.05, 0.05, BD + 0.05], [0, by + BH, BASKET_Z], WICKER_DARK);
  // apples inside, peeking out when the lids open
  for (const [x, z] of [
    [-0.14, -0.08],
    [0.13, 0.07],
    [0.0, 0.1],
  ] as const) {
    p.box([0.15, 0.13, 0.15], [x, by + BH - 0.02, BASKET_Z + z], APPLE);
  }
  for (const s of [-1, 1]) p.beam([s * 0.33, by + BH, BASKET_Z], [s * 0.22, by + BH + 0.34, BASKET_Z], 0.06, WICKER_DARK);
  p.box([0.5, 0.06, 0.06], [0, by + BH + 0.35, BASKET_Z], WICKER_DARK);
  p.done();

  // the two lids, hinged on the long outer edges (the handle stands between them), opening outwards
  const lids: { g: THREE.Group; s: number }[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0, by + BH + 0.03, BASKET_Z + (s * BD) / 2);
    root.add(hinge);
    const q = kit.part(s < 0 ? 'lidBack' : 'lidFront', hinge);
    q.box([BW + 0.04, 0.05, BD / 2 - 0.01], [0, 0.0, (-s * BD) / 4], WICKER);
    q.box([BW + 0.04, 0.02, 0.05], [0, 0.03, (-s * BD) / 2 + s * 0.035], WICKER_DARK);
    q.box([0.08, 0.04, 0.06], [0, 0.02, (-s * BD) / 4], CORAL);
    q.done();
    lids.push({ g: hinge, s });
  }
  // an apple that pops up out of the opened basket and bobs
  const pop = new THREE.Group();
  pop.position.set(0, by + BH - 0.05, BASKET_Z);
  root.add(pop);
  const a = kit.part('pop', pop);
  a.box([0.17, 0.15, 0.17], [0, 0.075, 0], APPLE);
  a.box([0.12, 0.17, 0.12], [0, 0.085, 0], APPLE_DARK);
  a.box([0.025, 0.07, 0.025], [0, 0.19, 0], CHOC);
  a.box([0.08, 0.02, 0.045], [0.04, 0.2, 0], LEAF, [0, 0, 0.4]);
  a.done();
  pop.visible = false;

  markShadows(root);
  const seats = [
    seatAt(root, [-0.95, BLANKET_Y, 0.15], Math.PI / 2),
    seatAt(root, [0.95, BLANKET_Y, 0.15], -Math.PI / 2),
    seatAt(root, [0, BLANKET_Y, 0.95], Math.PI),
    seatAt(root, [0, BLANKET_Y, -0.85], 0),
  ];
  let open = 0;
  return {
    root,
    seats,
    update(dt, k) {
      const eating = k.eat !== undefined;
      open += ((eating ? 1 : 0) - open) * Math.min(1, dt * 4);
      const e = ease(open);
      const t = k.eat ?? 0;
      for (const l of lids) l.g.rotation.x = l.s * 2.3 * e;
      pop.visible = e > 0.05;
      pop.position.y = by + BH - 0.05 + e * (0.18 + Math.abs(Math.sin(t * 3.2)) * 0.1);
      pop.rotation.y = t * 1.5;
    },
  };
}

// ─── the ice-cream kiosk ────────────────────────────────────────────────────

/** The kiosk's front face (the counter), in the back row: z = -1 … 0. */
const KIOSK_FRONT = -0.08;
const STOOL_H = 0.55;
const STOOLS_X = [-1.15, -0.4, 0.35];

/**
 * A kiosk along the back row: a cream counter with a coral band and a glowing chilled window
 * of tubs (pink, mint, chocolate), slim posts, a coral-and-cream striped awning, a flat roof with
 * a big ice-cream cone on top that turns slowly while it works. In front: three coral stools and a
 * spot on the ground for the cat, all facing the counter. Unfed, the window is dark.
 */
export function createIcecream(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'icecream';
  const kit = new Kit('icecream', skin);
  const p = kit.part('kiosk', root);
  const F = KIOSK_FRONT;
  // the counter block and its band
  p.box([2.84, 0.08, 0.92], [0, 0.04, -0.5], CHARCOAL);
  p.box([2.76, 1.04, 0.84], [0, 0.6, F - 0.42], CREAM);
  p.box([2.8, 0.18, 0.86], [0, 0.2, F - 0.42], CORAL);
  p.box([2.92, 0.08, 0.36], [0, 1.15, F - 0.08], MUSTARD);
  p.box([2.8, 0.06, 0.8], [0, 1.14, F - 0.44], CREAM);
  // the window's frame
  p.box([1.72, 0.08, 0.06], [-0.2, 0.98, F + 0.02], TEAL);
  p.box([1.72, 0.08, 0.06], [-0.2, 0.4, F + 0.02], TEAL);
  for (const x of [-1.06, 0.66]) p.box([0.08, 0.66, 0.06], [x, 0.69, F + 0.02], TEAL);
  // the tubs in the window
  const TUBS = [PINK, MINT, CHOC, '#fff1c8'];
  TUBS.forEach((c, i) => {
    const x = -0.82 + i * 0.41;
    p.box([0.32, 0.18, 0.06], [x, 0.56, F + 0.03], STEEL);
    p.box([0.28, 0.16, 0.07], [x, 0.7, F + 0.03], c);
  });
  // the back wall, the posts and the roof
  p.box([2.76, 0.86, 0.1], [0, 1.6, -0.95], TEAL);
  p.box([1.1, 0.5, 0.04], [0, 1.6, -0.89], CREAM);
  for (const s of [-1, 1]) {
    p.box([0.12, 0.86, 0.12], [s * 1.33, 1.6, F - 0.06], TEAL);
    p.box([0.1, 0.86, 0.8], [s * 1.38, 1.6, -0.5], TEAL_DARK);
  }
  p.box([3.04, 0.1, 1.1], [0, 2.08, -0.47], CORAL_DARK);
  p.box([2.96, 0.1, 1.02], [0, 2.17, -0.47], CREAM);
  p.box([2.5, 0.04, 0.6], [0, 2.23, -0.47], MINT);
  // the awning: stripes slanting forward from the roof's edge, a scalloped edge
  const AW = 10;
  const slope = 0.45;
  const L = 0.62;
  for (let i = 0; i < AW; i++) {
    const x = -1.5 + (i + 0.5) * (3.0 / AW);
    const c = i % 2 ? CREAM : CORAL;
    p.box([3.0 / AW, 0.05, L], [x, 2.02 - (Math.sin(slope) * L) / 2, F + 0.05 + (Math.cos(slope) * L) / 2], c, [slope, 0, 0]);
    p.box([3.0 / AW - 0.04, 0.12, 0.04], [x, 2.02 - Math.sin(slope) * L - 0.06, F + 0.06 + Math.cos(slope) * L], c);
  }
  // the stand the big cone sits in: a mustard cup on the roof
  octagon(p, 0.5, 0.1, 2.25, MUSTARD, 0, -0.47);
  octagon(p, 0.3, 0.12, 2.35, '#c98f1c', 0, -0.47);
  // a little junction box on the side the wire hangs from
  p.box([0.16, 0.24, 0.24], [1.47, 1.0, -0.6], CHARCOAL);
  p.box([0.18, 0.05, 0.26], [1.47, 1.14, -0.6], MUSTARD);
  // three stools at the counter and the cat's cushion on the ground
  for (const x of STOOLS_X) {
    p.box([0.34, 0.05, 0.34], [x, 0.025, 0.55], CHARCOAL);
    p.box([0.1, STOOL_H - 0.1, 0.1], [x, (STOOL_H - 0.1) / 2 + 0.05, 0.55], STEEL);
    p.box([0.22, 0.04, 0.22], [x, 0.2, 0.55], STEEL_DARK);
    octagon(p, 0.42, 0.08, STOOL_H - 0.08, CORAL, x, 0.55);
    octagon(p, 0.34, 0.012, STOOL_H - 0.002, CORAL_DARK, x, 0.55);
  }
  p.box([0.5, 0.04, 0.42], [0.95, 0.02, 0.8], MINT);
  p.done();

  // the chilled window: one own glow behind the tubs
  const glassMat = ownGlow(skin, '#c8f2ff');
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.5, 0.03), glassMat);
  glass.position.set(-0.2, 0.69, F - 0.005);
  root.add(glass);

  // the big cone on the roof: a stepped waffle cone, two scoops and a cherry
  const cone = new THREE.Group();
  cone.position.set(0, 2.38, -0.47);
  cone.scale.setScalar(1.15);
  root.add(cone);
  const c = kit.part('cone', cone);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const w = 0.12 + (i / (steps - 1)) * 0.42;
    c.box([w, 0.12, w], [0, 0.06 + i * 0.12, 0], i % 2 ? WAFFLE_DARK : WAFFLE);
  }
  const top = 0.06 + steps * 0.12;
  c.box([0.62, 0.26, 0.62], [0, top + 0.1, 0], PINK);
  c.box([0.5, 0.36, 0.5], [0, top + 0.15, 0], PINK);
  c.box([0.48, 0.2, 0.48], [0, top + 0.4, 0], CREAM);
  c.box([0.36, 0.3, 0.36], [0, top + 0.44, 0], CREAM);
  c.box([0.13, 0.13, 0.13], [0, top + 0.66, 0], CORAL);
  c.box([0.025, 0.12, 0.025], [0.03, top + 0.76, 0], CHOC);
  for (const [x, z, col] of [
    [0.2, 0.26, MUSTARD],
    [-0.24, 0.18, MINT],
    [0.1, -0.24, TEAL],
    [-0.16, -0.2, CORAL],
  ] as const) {
    c.box([0.06, 0.03, 0.03], [x, top + 0.42, z], col);
  }
  c.done();

  const bulb = powerBulb(skin, root, [1.05, 0.62, F]);
  markShadows(root);
  const seats = [
    ...STOOLS_X.map((x) => seatAt(root, [x, STOOL_H, 0.55], Math.PI)),
    seatAt(root, [0.95, 0.04, 0.85], Math.PI),
  ];
  const col = new THREE.Color();
  let t = 0;
  let spin = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(1.47, 1.1, -0.6),
    seats,
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const lit = !!pw && pw.linked && (pw.low ? Math.floor(t * 6) % 2 === 0 : pw.on);
      const key = lit ? 'on' + Math.round(k.night * 10) : 'off';
      if (key !== last) {
        last = key;
        if (lit) setGlow(glassMat, col.set('#c8f2ff'), 0.55 + 0.45 * k.night);
        else setGlow(glassMat, C_OFF, 0);
      }
      const on = !!pw && pw.on;
      spin += ((on ? (k.eat !== undefined ? 2.2 : 0.7) : 0) - spin) * Math.min(1, dt * 1.5);
      cone.rotation.y += spin * dt;
      // a happy little hop of the cone while the party eats
      const hop = on && k.eat !== undefined ? Math.abs(Math.sin(k.eat * 4)) * 0.06 : 0;
      cone.position.y = 2.38 + hop;
    },
  };
}

// ─── the swings ─────────────────────────────────────────────────────────────

const BAR_Y = 2.85;
const ROPE = 2.38;

/**
 * Two A-frames of teal legs in the end cells, a mustard top bar between them, and two swings on
 * cream ropes in the middle cells (a coral and a mustard plank). Each swing turns about the bar by
 * `k.swing[i]` (+ = forward); its seat is the plank's top and moves with it.
 */
export function createSwings(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'swings';
  const kit = new Kit('swings', skin);
  const p = kit.part('frame', root);
  for (const s of [-1, 1]) {
    const x = s * 1.5;
    for (const z of [-1, 1]) {
      p.beam([x, 0.02, z * 0.44], [x, BAR_Y, 0], 0.14, TEAL);
      p.box([0.24, 0.1, 0.22], [x, 0.05, z * 0.44], CORAL);
    }
    p.box([0.1, 0.1, 0.62], [x, 1.1, 0], MINT);
    p.box([0.26, 0.26, 0.26], [x, BAR_Y, 0], MUSTARD);
    p.box([0.16, 0.08, 0.16], [x, BAR_Y + 0.17, 0], CORAL);
  }
  p.box([3.1, 0.14, 0.14], [0, BAR_Y, 0], MUSTARD);
  for (const x of [-0.5, 0.5]) {
    for (const d of [-0.24, 0.24]) p.box([0.1, 0.18, 0.18], [x + d, BAR_Y, 0], STEEL_DARK);
  }
  p.done();

  const pivots: THREE.Group[] = [];
  const seats: THREE.Object3D[] = [];
  [-0.5, 0.5].forEach((x, i) => {
    const g = new THREE.Group();
    g.position.set(x, BAR_Y, 0);
    root.add(g);
    const q = kit.part(i ? 'swingB' : 'swingA', g);
    for (const d of [-0.24, 0.24]) {
      q.box([0.04, ROPE - 0.04, 0.04], [d, -ROPE / 2, 0], CREAM);
      for (let k = 1; k < 6; k++) q.box([0.06, 0.04, 0.06], [d, -k * (ROPE / 6), 0], WOOD);
    }
    q.box([0.62, 0.08, 0.38], [0, -ROPE, 0], i ? MUSTARD : CORAL);
    q.box([0.64, 0.03, 0.4], [0, -ROPE - 0.05, 0], i ? '#c98f1c' : CORAL_DARK);
    q.done();
    pivots.push(g);
    seats.push(seatAt(g, [0, -ROPE + 0.04, 0], 0));
  });

  markShadows(root);
  return {
    root,
    seats,
    update(_dt, k) {
      // + forward (towards +Z): a positive turn about X would swing the seat back
      for (let i = 0; i < pivots.length; i++) pivots[i].rotation.x = -(k.swing?.[i] ?? 0);
    },
  };
}

// ─── snacks ─────────────────────────────────────────────────────────────────

export type SnackKind = 'apple' | 'icecream' | 'fish';

/** Merges boxes, each with its own vertex colour (one mesh, one draw). */
function boxes(list: [V3, V3, string, V3?][]): THREE.BufferGeometry {
  const gs = list.map(([size, at, hex, rot]) => {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.deleteAttribute('uv');
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    g.translate(at[0], at[1], at[2]);
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

/** Snack shapes standing on y = 0, up = +Y, about a hero's hand in size. */
const SNACKS: Record<SnackKind, () => THREE.BufferGeometry> = {
  apple: () =>
    boxes([
      [[0.15, 0.1, 0.15], [0, 0.065, 0], APPLE],
      [[0.12, 0.15, 0.12], [0, 0.075, 0], APPLE],
      [[0.08, 0.02, 0.08], [0, 0.01, 0], APPLE_DARK],
      [[0.03, 0.012, 0.012], [-0.045, 0.1, 0.076], '#ff9e94'],
      [[0.016, 0.05, 0.016], [0, 0.165, 0], CHOC],
      [[0.06, 0.014, 0.03], [0.03, 0.17, 0], LEAF, [0, 0, 0.4]],
    ]),
  icecream: () =>
    boxes([
      [[0.04, 0.05, 0.04], [0, 0.025, 0], WAFFLE_DARK],
      [[0.07, 0.06, 0.07], [0, 0.075, 0], WAFFLE],
      [[0.1, 0.06, 0.1], [0, 0.135, 0], WAFFLE_DARK],
      [[0.13, 0.03, 0.13], [0, 0.175, 0], WAFFLE],
      [[0.15, 0.08, 0.15], [0, 0.22, 0], PINK],
      [[0.11, 0.1, 0.11], [0, 0.24, 0], PINK],
      [[0.1, 0.06, 0.1], [0, 0.29, 0], CREAM],
      [[0.04, 0.04, 0.04], [0, 0.33, 0], CORAL],
    ]),
  fish: () =>
    boxes([
      [[0.2, 0.08, 0.09], [0, 0.045, 0], '#7fa6c9'],
      [[0.12, 0.1, 0.1], [0.02, 0.05, 0], '#7fa6c9'],
      [[0.14, 0.02, 0.1], [0.01, 0.012, 0], '#cfe0ee'],
      [[0.06, 0.04, 0.02], [0.02, 0.1, 0], '#5b84aa'],
      // the tail fin and the eye
      [[0.06, 0.1, 0.03], [-0.13, 0.05, 0], '#5b84aa'],
      [[0.02, 0.02, 0.1], [0.08, 0.06, 0], INK],
    ]),
};
const snackGeo = new Map<SnackKind, THREE.BufferGeometry>();
let fallbackMat: THREE.Material | null = null;

/**
 * A small snack standing on its own origin, up = +Y (an apple, an ice-cream cone, a fish for the
 * cat). `skin` (or a ready vertex-colour material) gives it the world's plastic.
 */
export function createSnack(kind: SnackKind, skin?: Skin | THREE.Material): THREE.Object3D {
  let geo = snackGeo.get(kind);
  if (!geo) snackGeo.set(kind, (geo = SNACKS[kind]()));
  let mat: THREE.Material;
  if (skin instanceof THREE.Material) mat = skin;
  else if (skin) mat = skin.partMaterial(0xffffff, { vertexColors: true });
  else mat = fallbackMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `snack:${kind}`;
  mesh.castShadow = true;
  return mesh;
}

/** A vertex-coloured plastic the model already draws with (so the snack needs no new shader). */
function plasticOf(model: CharacterModel): THREE.Material | undefined {
  let found: THREE.Material | undefined;
  model.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!found && m && !Array.isArray(m) && (m as THREE.MeshStandardMaterial).vertexColors && !m.transparent) found = m;
  });
  return found;
}

/** A part's own meshes (not the bow hanging under it) as a box in its own space. */
function handBox(arm: THREE.Object3D): THREE.Box3 {
  arm.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(arm.matrixWorld).invert();
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  const m = new THREE.Matrix4();
  const walk = (o: THREE.Object3D): void => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.visible) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(b.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)));
    }
    for (const ch of o.children) if (ch.name !== 'tool') walk(ch);
  };
  walk(arm);
  return box;
}

/**
 * Puts a snack where it reads as being eaten and returns it (the caller removes it with
 * `removeFromParent()`): a biped holds it in the right hand (the left if it has none), standing
 * out of the fist along the arm's front so it comes up to the mouth with the hand; a quadruped
 * (or anything without arms) gets it on the ground just in front of its face.
 */
export function holdSnack(model: CharacterModel, kind: SnackKind, skin?: Skin): THREE.Object3D {
  const snack = createSnack(kind, skin ?? plasticOf(model));
  const size = Math.min(1.4, Math.max(0.6, model.height / 1.5));
  const type = model.root.name.split(':')[1];
  const arm = type === 'biped' ? (model.root.getObjectByName('armR') ?? model.root.getObjectByName('armL')) : undefined;
  if (!arm) {
    // on the ground where the head dips to it (animate.ts 'eat'), turned across the face
    snack.scale.setScalar(type === 'quadruped' ? 1.2 * model.height : size);
    snack.position.set(0, 0, 0.78 * model.height);
    if (kind === 'fish') snack.rotation.y = Math.PI / 2 + 0.3;
    model.root.add(snack);
    return snack;
  }
  const box = handBox(arm);
  const hand = new THREE.Group();
  hand.name = 'snack';
  if (box.isEmpty()) hand.position.set(0, -0.4 * size, 0.04);
  else hand.position.set((box.min.x + box.max.x) / 2, box.min.y + 0.05 * size, box.max.z - 0.02);
  // the snack's up runs along the arm's front (+Z): forwards while resting, up at the mouth
  hand.rotation.x = Math.PI / 2;
  snack.scale.setScalar(size);
  snack.position.y = kind === 'icecream' ? -0.06 * size : -0.03 * size;
  hand.add(snack);
  arm.add(hand);
  return hand;
}
