/**
 * «Шелохмаське чудовисько» — the lake monster, the second boss. A toy
 * plesiosaur in deep teal plastic: a wide hull that rides low in the water,
 * three round humps along its back, a long curving neck with a broad head,
 * paddle flippers and a tapering tail. Cream belly plates, amber eyes, a dark
 * maw with pale fangs. ~7 blocks tall with the neck up, ~13 long, facing +Z.
 *
 * Rig: quadruped (head, body, legFL…legBR, tail, tail2 — the animator sways
 * the neck and wags the tail). Extra named nodes the boss system drives
 * itself (they are not rig parts, so the animator leaves them alone): `jaw`
 * (rotation.x opens it), `bossEyes` (scaled to flare), `ember` (the glowing
 * throat, shown while the mouth is open), `crack1..3` (glowing slime cracks,
 * shown one by one as the fish lure it out), `bossMouth` (where a shot counts
 * as into the mouth — it follows the neck as it lifts).
 *
 * Shadows: only the body's hull mesh casts (one caster); every other mesh is
 * marked `userData.toyNoShadow` with castShadow off.
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { mulberry32 } from '../../world/rng';
import { quadFrame } from './frames';
import { Kit, type PartBuilder, type Paint, type V3 } from './kit';

const TEAL = ['#3a9484', '#328474', '#42a693', '#2b7263'];
const TEAL_DARK = '#1d564a';
const TEAL_LIGHT = '#58b8a4';
const BELLY = '#cfe6d4';
const MAW = '#0e2e2a';
const TOOTH = '#f2ead2';
const AMBER: Paint = { c: '#ffb12e', glow: true };
const AMBER_HOT: Paint = { c: '#ffe27a', glow: true };
const CRACK: Paint = { c: '#ffa526', glow: true };
const EMBER: Paint = { c: '#ff7a1c', glow: true };

/** Body pivot (the hips) in model space. */
const LEG_H = 1.1;
const BACK_Z = -2.6;
const FRONT_Z = 1.4;
const LEG_X = 1.45;
/** The head pivot sits at the neck's base, so the whole neck sways with it. */
const NECK_BASE: V3 = [0, 2.9, 2.6];
/** The tail pivot at the hull's rump. */
const TAIL_BASE: V3 = [0, 2.4, -3.9];

export function build(skin: Skin): Rig {
  const kit = new Kit('nessie', skin);
  const rand = mulberry32(0x9e51);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  const { root, parts } = quadFrame({
    legH: LEG_H,
    legX: LEG_X,
    backZ: BACK_Z,
    frontZ: FRONT_Z,
    head: [NECK_BASE[0], NECK_BASE[1] - LEG_H, NECK_BASE[2] - BACK_Z],
    tail: [TAIL_BASE[0], TAIL_BASE[1] - LEG_H, TAIL_BASE[2] - BACK_Z],
    tailLen: 2.6,
  });

  /** Model space → body-pivot space. */
  const bp = (x: number, y: number, z: number): V3 => [x, y - LEG_H, z - BACK_Z];
  const body = kit.part('body', parts.body);
  const box = (b: PartBuilder, s: V3, at: V3, p: Paint, rot?: V3) => b.box(s, bp(...at), p, rot);

  // ── the hull: three bands of teal, a cream belly underneath ──
  const bands: { y0: number; y1: number; hw: number; z0: number; z1: number }[] = [
    { y0: 0.6, y1: 1.5, hw: 1.75, z0: -3.9, z1: 1.9 },
    { y0: 1.5, y1: 2.5, hw: 2.25, z0: -4.3, z1: 2.3 },
    { y0: 2.5, y1: 3.1, hw: 1.7, z0: -3.5, z1: 1.9 },
  ];
  for (const b of bands) box(body, [b.hw * 2, b.y1 - b.y0, b.z1 - b.z0], [0, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2], pick(TEAL));
  box(body, [3.1, 0.24, 4.8], [0, 0.74, -0.9], BELLY);
  // a rim of pale plates where the water laps it
  for (let z = -3.6; z < 1.8; z += 0.85) box(body, [3.3, 0.14, 0.6], [(rand() - 0.5) * 0.1, 1.52, z], pick([BELLY, TEAL_LIGHT]));

  // ── three round humps along the back: the classic silhouette ──
  for (const z of [-3.2, -1.5, 0.2]) {
    box(body, [1.7, 0.7, 1.8], [0, 3.35, z], pick(TEAL));
    box(body, [1.05, 0.5, 1.1], [0, 3.95, z + 0.05], pick(TEAL));
  }
  // lighter spots on the hull, like waterweed on an old monster
  for (const [x, y, z] of [
    [2.1, 2.0, -2.6], [-2.15, 1.9, -0.9], [1.6, 2.7, 0.6], [-1.7, 2.75, -3.0], [2.25, 1.8, 1.4],
  ] as const) box(body, [0.5 + rand() * 0.4, 0.12, 0.5 + rand() * 0.5], [x, y, z], TEAL_LIGHT);

  const bodyMeshes = body.done();

  // ── the neck: six segments along a forward curve, under the head pivot ──
  const headP = kit.part('neck', parts.head);
  const neckPts: [number, number][] = [[0, 0], [0.75, 0.28], [1.5, 0.66], [2.2, 1.18], [2.85, 1.85], [3.4, 2.62], [3.75, 3.45]];
  for (let i = 0; i < neckPts.length - 1; i++) {
    const [y0, z0] = neckPts[i];
    const [y1, z1] = neckPts[i + 1];
    const k = i / (neckPts.length - 2);
    const w = 1.5 - k * 0.45;
    const d = 1.15 - k * 0.3;
    const len = Math.hypot(y1 - y0, z1 - z0) + 0.14;
    headP.box([w, len, d], [0, (y0 + y1) / 2, (z0 + z1) / 2], pick(TEAL), [Math.atan2(z1 - z0, y1 - y0), 0, 0]);
    // a pale throat stripe down the front of every other segment
    if (i % 2 === 0) headP.box([w * 0.5, len * 0.8, 0.1], [0, (y0 + y1) / 2 + 0.05, (z0 + z1) / 2 + d / 2 - 0.02], BELLY, [Math.atan2(z1 - z0, y1 - y0), 0, 0]);
  }
  // a small frill of fins down the back of the neck
  for (let i = 1; i < 6; i++) {
    const [y, z] = neckPts[i];
    headP.box([0.16, 0.34, 0.42], [0, y + 0.22, z - 0.5], TEAL_DARK, [0.35, 0, 0]);
  }

  // ── the head: a broad skull, a round crown, a blunt snout ──
  headP.box([1.7, 1.15, 2.0], [0, 3.9, 4.0], pick(TEAL));
  headP.box([1.8, 0.55, 1.3], [0, 4.55, 3.5], pick(TEAL));
  headP.box([1.2, 0.7, 0.5], [0, 3.7, 5.15], TEAL_DARK);
  // nostrils on the snout
  for (const s of [-1, 1]) headP.box([0.14, 0.1, 0.14], [s * 0.32, 4.1, 5.2], MAW);
  // heavy brow ridges over the eyes
  for (const s of [-1, 1]) headP.box([0.55, 0.24, 0.75], [s * 0.6, 4.52, 3.9], TEAL_DARK, [0, 0, -s * 0.2]);
  // upper fangs hanging under the skull's front
  for (const x of [-0.45, 0, 0.45]) headP.box([0.2, 0.2, 0.2], [x, 3.38, 4.72], TOOTH, [0, 0, Math.PI / 4]);
  // the dark maw behind them, seen when the jaw drops
  headP.box([1.3, 0.5, 0.62], [0, 3.42, 4.72], MAW);
  headP.done();

  // the mouth node: a shot here counts as into the mouth (it follows the neck)
  const mouth = new THREE.Object3D();
  mouth.name = 'bossMouth';
  mouth.position.set(0, 3.55, 5.0);
  parts.head.add(mouth);

  // ── the glowing throat, seen only while the mouth is open ──
  const ember = new THREE.Group();
  ember.name = 'ember';
  ember.visible = false;
  parts.head.add(ember);
  kit
    .part('ember', ember)
    .box([1.0, 0.35, 0.1], [0, 3.42, 4.42], EMBER)
    .box([0.5, 0.2, 0.1], [0, 3.7, 4.42], EMBER)
    .done();

  // ── the lower jaw: a slab hinged at the head's bottom edge; rotation.x > 0 drops it open ──
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, 3.3, 4.5);
  parts.head.add(jaw);
  const jp = kit.part('jaw', jaw);
  jp.box([1.45, 0.4, 1.7], [0, -0.2, 0.85], TEAL_DARK);
  for (const x of [-0.48, -0.16, 0.16, 0.48]) jp.box([0.17, 0.17, 0.17], [x, 0.05, 1.32], TOOTH, [0, 0, Math.PI / 4]);
  // the inside of the jaw is dark, so it reads as a mouth when it drops
  jp.box([1.35, 0.34, 0.08], [0, -0.2, 0.06], MAW);
  jp.done();

  // ── the eyes: two amber lanterns deep in the brows (the group is scaled to flare) ──
  const eyes = new THREE.Group();
  eyes.name = 'bossEyes';
  eyes.position.set(0, 4.15, 3.7);
  parts.head.add(eyes);
  const ep = kit.part('bossEyes', eyes);
  for (const s of [-1, 1]) {
    ep.box([0.16, 0.5, 0.46], [s * 0.88, 0, 0], AMBER);
    ep.box([0.18, 0.22, 0.2], [s * 0.89, 0.03, 0.05], AMBER_HOT);
    ep.box([0.19, 0.09, 0.5], [s * 0.88, 0.01, 0.01], MAW);
  }
  ep.done();

  // ── four paddle flippers: a shoulder blob and a flat paddle turned out ──
  for (const leg of [parts.legFL, parts.legFR, parts.legBL, parts.legBR]) {
    const s = leg.name.endsWith('L') ? 1 : -1;
    const front = leg.name.startsWith('legF');
    const p = kit.part(leg.name, leg);
    p.box([1.25, 1.1, 1.35], [s * 0.25, 0.35, 0], pick(TEAL));
    p.box([1.9, 0.26, 1.15], [s * 0.95, front ? -0.45 : -0.35, front ? 0.2 : 0.05], front ? pick(TEAL) : TEAL_DARK, [0, 0.2 * s, s * -0.4]);
    p.box([0.5, 0.16, 0.4], [s * 0.35, 0.95, 0.1], TEAL_LIGHT);
    p.done();
  }

  // ── the tail: two tapering segments under the tail pivots, flukes at the tip ──
  const tp = kit.part('tail', parts.tail);
  tp.box([1.4, 1.3, 1.6], [0, 0.1, -0.7], pick(TEAL));
  tp.box([1.0, 0.95, 1.5], [0, 0.28, -2.0], pick(TEAL));
  tp.box([0.14, 0.4, 0.6], [0, 0.75, -1.6], TEAL_DARK);
  tp.done();
  const t2 = kit.part('tail2', parts.tail2);
  t2.box([0.7, 0.65, 1.3], [0, 0.32, -0.55], TEAL_DARK);
  for (const s of [-1, 1]) t2.box([0.55, 0.14, 0.75], [s * 0.38, 0.48, -1.05], pick(TEAL), [0, 0, s * 0.5]);
  t2.done();

  // ── slime cracks: three sets that glow one by one as the fish lure her out ──
  const crackSet = (i: number, lines: V3[][], parent: THREE.Object3D, local = false) => {
    const g = new THREE.Group();
    g.name = `crack${i}`;
    g.visible = false;
    parent.add(g);
    const p = kit.part(`crack${i}`, g);
    for (const line of lines) {
      for (let k = 0; k < line.length - 1; k++) {
        const a = local ? line[k] : bp(...line[k]);
        const b = local ? line[k + 1] : bp(...line[k + 1]);
        p.beam(a, b, 0.17, CRACK);
      }
    }
    p.done();
  };
  // 1: down the neck's side (head-pivot local, so it sways with the neck)
  crackSet(1, [
    [[-0.72, 0.35, 0.12], [-0.68, 0.95, 0.4], [-0.78, 1.55, 0.78], [-0.7, 2.1, 1.3]],
    [[-0.72, 1.0, 0.42], [-0.55, 1.3, 0.85]],
  ], parts.head, true);
  // 2: the hull's right flank
  crackSet(2, [
    [[2.28, 1.2, 1.1], [2.32, 1.85, 0.7], [2.26, 2.35, 1.3]],
    [[2.32, 1.85, 0.7], [2.3, 2.05, 0.0]],
  ], parts.body);
  // 3: across the humps' backs
  crackSet(3, [
    [[-1.0, 4.25, -3.2], [0, 4.3, -2.4], [1.0, 4.25, -1.6], [0.4, 4.3, -0.8], [-0.5, 4.25, 0.2]],
    [[0, 4.3, -2.4], [0, 3.3, -2.35]],
  ], parts.body);

  // One shadow caster: the hull's stone; everything else only receives.
  const caster = bodyMeshes.find((m) => m.name === 'body_vc');
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m === caster) {
      m.castShadow = true;
      return;
    }
    m.castShadow = false;
    m.receiveShadow = true;
    m.userData.toyNoShadow = true;
  });

  return { type: 'quadruped', root, parts: { ...parts }, height: 7 };
}
