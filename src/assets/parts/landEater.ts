/**
 * «Пожирач земель» — the Land Eater, the first boss. A giant stone beast whose
 * body is a cave: a dark arched mouth-entrance at the front with a stone lower
 * jaw that drops open like a drawbridge, two amber eyes glowing in the dark, a
 * spiky ridge along the back, four thick arched legs. Dark slate bricks with a
 * few moss patches. ~7 blocks tall, ~10 long, facing +Z.
 *
 * Rig: quadruped (head, body, legFL, legFR, legBL, legBR). Extra named nodes
 * the boss system drives itself (they are not rig parts, so the animator
 * leaves them alone): `jaw` (rotation.x opens it), `bossEyes` (scaled to flare),
 * `ember` (the glowing throat, shown while the mouth is open), `crack1..3`
 * (glowing armour cracks, shown one by one as lanterns break the armour).
 *
 * Shadows: only the body's stone mesh casts (one caster); every other mesh is
 * marked `userData.toyNoShadow` with castShadow off.
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { mulberry32 } from '../../world/rng';
import { quadFrame } from './frames';
import { Kit, type PartBuilder, type Paint, type V3 } from './kit';

const SLATE = ['#5d646e', '#677079', '#565c66', '#717a84', '#60666f'];
const SLATE_DARK = '#40454d';
const SLATE_LIGHT = '#9aa1aa';
const RIM = '#959ca5';
const MOSS = ['#6e9a3c', '#5b8433', '#86ad4c'];
const CAVE = '#100d0c';
const TOOTH = '#cfc8b6';
const TONGUE = '#7c3a30';
const AMBER: Paint = { c: '#ffb12e', glow: true };
const AMBER_HOT: Paint = { c: '#ffe27a', glow: true };
const CRACK: Paint = { c: '#ffa526', glow: true };
const EMBER: Paint = { c: '#ff7a1c', glow: true };

/** Body pivot (the back hips) in model space. */
const LEG_H = 3.0;
const BACK_Z = -3.0;
const FRONT_Z = 3.0;
const LEG_X = 2.6;
/** The front plane of the cave mouth (model z). */
const MOUTH_Z = 4.4;

type Band = { y0: number; y1: number; hw: number; open: number; z0: number; z1: number };
/** Horizontal slices of the dome: half width, half width of the mouth opening, z extent. */
const BANDS: Band[] = [
  { y0: 0.6, y1: 1.6, hw: 3.0, open: 1.6, z0: -4.2, z1: MOUTH_Z },
  { y0: 1.6, y1: 3.2, hw: 3.5, open: 1.6, z0: -4.7, z1: MOUTH_Z },
  { y0: 3.2, y1: 3.6, hw: 3.4, open: 1.3, z0: -4.6, z1: MOUTH_Z },
  { y0: 3.6, y1: 4.0, hw: 3.2, open: 0.8, z0: -4.4, z1: MOUTH_Z },
  { y0: 4.0, y1: 4.6, hw: 2.9, open: 0, z0: -4.2, z1: MOUTH_Z - 0.1 },
  { y0: 4.6, y1: 5.2, hw: 2.3, open: 0, z0: -3.8, z1: MOUTH_Z - 0.6 },
  { y0: 5.2, y1: 5.7, hw: 1.5, open: 0, z0: -3.2, z1: MOUTH_Z - 1.3 },
];
/** The cave is hollow from here to the mouth plane. */
const CAVE_BACK = 3.0;

export function build(skin: Skin): Rig {
  const kit = new Kit('landEater', skin);
  const rand = mulberry32(0x1a4d);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  const { root, parts } = quadFrame({
    legH: LEG_H,
    legX: LEG_X,
    backZ: BACK_Z,
    frontZ: FRONT_Z,
    head: [0, 2.5 - LEG_H, 3.3 - BACK_Z],
    tail: [0, 0, 0],
    tailLen: 0.5,
  });
  // no tail on a cave
  parts.tail.removeFromParent();
  const rigParts: Record<string, THREE.Object3D> = { ...parts };
  delete rigParts.tail;
  delete rigParts.tail2;

  /** Model space → body-pivot space. */
  const bp = (x: number, y: number, z: number): V3 => [x, y - LEG_H, z - BACK_Z];
  const body = kit.part('body', parts.body);
  const box = (b: PartBuilder, s: V3, at: V3, p: Paint, rot?: V3) => b.box(s, bp(...at), p, rot);

  // ── the dome, band by band; the front part of each band leaves the mouth open ──
  for (const b of BANDS) {
    const h = b.y1 - b.y0;
    const y = (b.y0 + b.y1) / 2;
    const c = pick(SLATE);
    if (b.open > 0) {
      // solid behind the cave, two cheeks beside the mouth
      box(body, [b.hw * 2, h, CAVE_BACK - b.z0], [0, y, (b.z0 + CAVE_BACK) / 2], c);
      const cheek = b.hw - b.open;
      for (const s of [-1, 1]) box(body, [cheek, h, b.z1 - CAVE_BACK], [s * (b.open + cheek / 2), y, (CAVE_BACK + b.z1) / 2], c);
    } else {
      box(body, [b.hw * 2, h, b.z1 - b.z0], [0, y, (b.z0 + b.z1) / 2], c);
    }
    // bricks on both sides: a staggered row per band, slightly proud of the wall
    const rows = h > 1 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const bh = h / rows - 0.08;
      const by = b.y0 + (h / rows) * (r + 0.5);
      let z = b.z0 + 0.15 + (r % 2) * 0.5;
      while (z < b.z1 - 0.4) {
        const len = 0.8 + rand() * 0.6;
        const zl = Math.min(len, b.z1 - 0.15 - z);
        for (const s of [-1, 1]) if (rand() < 0.85) box(body, [0.14, bh, zl - 0.08], [s * (b.hw + 0.05), by, z + zl / 2], pick(SLATE));
        z += len;
      }
    }
    // the top of the band where the next one steps in: a ledge of stones
    const next = BANDS[BANDS.indexOf(b) + 1];
    if (next && next.hw < b.hw - 0.15) {
      for (let z = b.z0 + 0.3; z < b.z1 - 0.3; z += 0.9 + rand() * 0.4) {
        for (const s of [-1, 1]) {
          const w = b.hw - next.hw;
          if (rand() < 0.7) box(body, [w - 0.05, 0.12, 0.7], [s * (next.hw + w / 2), b.y1 + 0.05, z], pick(SLATE));
        }
      }
    }
  }
  // back wall bricks and a rounded rump
  for (let y = 0.9; y < 5.4; y += 0.7) {
    for (let x = -3; x <= 3; x += 1.1) {
      const band = BANDS.find((b) => y >= b.y0 && y < b.y1);
      if (!band || Math.abs(x) > band.hw - 0.4 || rand() < 0.2) continue;
      box(body, [0.95, 0.6, 0.14], [x + (rand() - 0.5) * 0.2, y, band.z0 - 0.05], pick(SLATE));
    }
  }
  // roof stones on the top band
  for (let z = -3.0; z < 3.0; z += 0.9) box(body, [1.2 + rand() * 0.6, 0.16, 0.75], [(rand() - 0.5) * 0.6, 5.76, z], pick(SLATE));

  // ── the mouth: dark cave, a lighter stone rim around the arch, upper fangs ──
  box(body, [3.3, 3.5, 0.2], [0, 2.35, CAVE_BACK + 0.1], CAVE); // back of the cave
  for (const s of [-1, 1]) box(body, [0.1, 3.0, MOUTH_Z - CAVE_BACK], [s * 1.55, 2.1, (CAVE_BACK + MOUTH_Z) / 2], CAVE);
  box(body, [3.1, 0.1, MOUTH_Z - CAVE_BACK], [0, 0.62, (CAVE_BACK + MOUTH_Z) / 2], CAVE); // floor
  box(body, [2.6, 0.1, MOUTH_Z - CAVE_BACK], [0, 3.55, (CAVE_BACK + MOUTH_Z) / 2], CAVE); // ceiling
  box(body, [1.6, 0.1, MOUTH_Z - CAVE_BACK], [0, 3.95, (CAVE_BACK + MOUTH_Z) / 2], CAVE);
  box(body, [1.8, 0.22, 1.1], [0, 0.72, CAVE_BACK + 0.7], TONGUE); // a tongue on the cave floor
  // the arch rim: pillars, shoulders and a keystone, standing out of the front
  for (const s of [-1, 1]) {
    box(body, [0.6, 2.7, 0.35], [s * 1.9, 1.95, MOUTH_Z + 0.12], RIM);
    box(body, [0.62, 0.5, 0.35], [s * 1.62, 3.45, MOUTH_Z + 0.12], RIM, [0, 0, s * 0.5]);
    box(body, [0.6, 0.45, 0.35], [s * 1.05, 3.92, MOUTH_Z + 0.12], RIM, [0, 0, s * 0.3]);
    // fangs hanging from the arch, at the sides so the eyes stay visible
    box(body, [0.32, 0.55, 0.3], [s * 1.2, 2.95, MOUTH_Z - 0.05], TOOTH, [0, 0, Math.PI / 4]);
    box(body, [0.22, 0.4, 0.22], [s * 1.38, 3.05, MOUTH_Z - 0.08], TOOTH, [0, 0, Math.PI / 4]);
    // heavy brows over the arch
    box(body, [1.4, 0.38, 0.5], [s * 0.85, 4.38, MOUTH_Z + 0.05], SLATE_DARK, [0, 0, -s * 0.22]);
  }
  box(body, [0.7, 0.5, 0.4], [0, 4.1, MOUTH_Z + 0.14], RIM);
  // stones of the front face above the arch
  for (const [x, y] of [[-2.4, 4.2], [2.4, 4.2], [-2.7, 3.0], [2.7, 3.0], [-2.6, 1.6], [2.6, 1.6], [-1.2, 4.9], [1.2, 4.9]] as const) {
    box(body, [0.9, 0.6, 0.12], [x, y, MOUTH_Z + 0.04], pick(SLATE));
  }

  // ── the spiky ridge along the back (leaning back), smaller spikes on the shoulders ──
  const spike = (x: number, z: number, y0: number, hgt: number, w: number) => {
    const tilt = -0.28;
    const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(tilt, 0, 0));
    const tiers: [number, number, string][] = [
      [w, hgt * 0.42, SLATE_DARK],
      [w * 0.64, hgt * 0.36, '#555b64'],
      [w * 0.32, hgt * 0.32, SLATE_LIGHT],
    ];
    let along = 0;
    for (const [tw, th, col] of tiers) {
      const c = up.clone().multiplyScalar(along + th / 2);
      box(body, [tw, th, tw], [x + c.x, y0 + c.y, z + c.z], col, [tilt, Math.PI / 4, 0]);
      along += th * 0.92;
    }
  };
  for (let i = 0; i < 9; i++) {
    const z = 3.0 - i * 0.82;
    const mid = 1 - Math.abs(i - 3.5) / 5;
    spike(0, z, 5.7, 1.2 + mid * 1.0, 0.85);
  }
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) spike(s * 1.9, 2.0 - i * 1.0 + s * 0.2, 5.15, 0.7 + rand() * 0.4, 0.5);
  }

  // ── moss patches on the roof steps and the shoulders ──
  const moss = (x: number, y: number, z: number, n: number) => {
    for (let i = 0; i < n; i++) box(body, [0.5 + rand() * 0.6, 0.1, 0.5 + rand() * 0.6], [x + (rand() - 0.5) * 0.9, y, z + (rand() - 0.5) * 0.9], pick(MOSS));
  };
  moss(2.0, 4.66, -1.5, 5);
  moss(-2.1, 4.66, 1.2, 4);
  moss(-1.0, 5.78, -2.4, 3);
  moss(2.8, 4.05, 2.6, 2);
  moss(-3.0, 3.66, -3.0, 3);
  // a few hanging tufts down the cheeks
  for (const [x, y, z] of [[3.47, 3.0, 2.2], [-3.57, 2.6, -1.4], [3.57, 2.2, -3.2]] as const) box(body, [0.12, 0.7, 0.5], [x, y, z], MOSS[1]);
  const bodyMeshes = body.done();

  // ── armour cracks: three sets that glow one by one ──
  const crackSet = (i: number, lines: V3[][]) => {
    const g = new THREE.Group();
    g.name = `crack${i}`;
    g.visible = false;
    parts.body.add(g);
    const p = kit.part(`crack${i}`, g);
    for (const line of lines) for (let k = 0; k < line.length - 1; k++) p.beam(bp(...line[k]), bp(...line[k + 1]), 0.17, CRACK);
    p.done();
  };
  /** A point on the dome's side wall at this height (just proud of the bricks). */
  const wall = (s: number, y: number, z: number): V3 => [s * ((BANDS.find((b) => y >= b.y0 && y < b.y1)?.hw ?? 3.4) + 0.1), y, z];
  const side = (s: number, z: number, y: number): V3[][] => [
    [wall(s, y + 1.4, z - 0.2), wall(s, y + 1.0, z + 0.3), wall(s, y + 0.6, z - 0.1), wall(s, y + 0.2, z + 0.5), wall(s, y - 0.25, z + 0.1)],
    [wall(s, y + 0.6, z - 0.1), wall(s, y + 0.4, z - 0.8), wall(s, y + 0.1, z - 1.0)],
  ];
  /** A zigzag down the front cheek beside the mouth. */
  const front = (s: number): V3[] => [[s * 2.5, 3.7, MOUTH_Z + 0.1], [s * 2.95, 3.0, MOUTH_Z + 0.1], [s * 2.55, 2.4, MOUTH_Z + 0.1], [s * 3.05, 1.7, MOUTH_Z + 0.1], [s * 2.7, 1.1, MOUTH_Z + 0.1]];
  crackSet(1, [...side(1, -0.6, 2.0), front(1), [[2.95, 4.3, 0.8], [2.95, 4.05, 1.4]]]);
  crackSet(2, [...side(-1, 0.9, 1.95), front(-1), [[-2.95, 4.3, -1.6], [-2.95, 4.05, -2.2]]]);
  crackSet(3, [
    [[0.2, 5.79, -2.6], [-0.4, 5.79, -1.6], [0.3, 5.79, -0.5], [-0.2, 5.79, 0.6], [0.4, 5.79, 1.8]],
    [[-0.4, 5.79, -1.6], [-1.2, 5.79, -1.1]],
    [[-1.1, 4.75, MOUTH_Z + 0.12], [-0.7, 4.45, MOUTH_Z + 0.12], [-0.9, 4.1, MOUTH_Z + 0.12]],
    [[1.6, 4.8, MOUTH_Z - 0.4], [2.2, 4.3, MOUTH_Z + 0.05], [2.0, 3.7, MOUTH_Z + 0.15]],
  ]);

  // ── the glowing throat, seen only while the mouth is open ──
  const ember = new THREE.Group();
  ember.name = 'ember';
  ember.visible = false;
  parts.body.add(ember);
  kit
    .part('ember', ember)
    .box([2.2, 0.9, 0.08], bp(0, 1.25, CAVE_BACK + 0.24), EMBER)
    .box([1.2, 0.5, 0.08], bp(0, 1.95, CAVE_BACK + 0.24), EMBER)
    .done();

  // ── the lower jaw: a stone slab hinged at the mouth's bottom edge; rotation.x > 0 drops it open ──
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(...bp(0, 0.6, MOUTH_Z + 0.25));
  parts.body.add(jaw);
  const jp = kit.part('jaw', jaw);
  jp.box([3.5, 1.65, 0.45], [0, 0.82, 0], SLATE_DARK);
  for (const [x, y] of [[-1.1, 0.45], [0.3, 0.4], [1.2, 0.55], [-0.5, 1.1], [0.9, 1.15]] as const) jp.box([0.9, 0.42, 0.1], [x, y, 0.26], pick(SLATE));
  for (let i = 0; i < 5; i++) jp.box([0.36, 0.36, 0.3], [-1.3 + i * 0.65, 1.72, 0.02], TOOTH, [0, 0, Math.PI / 4]);
  // the inside of the jaw is dark, so it reads as a mouth when it drops
  jp.box([3.2, 1.4, 0.06], [0, 0.85, -0.25], CAVE);
  jp.done();

  // ── head: just the two amber eyes, deep in the dark (the idle sway makes them look around) ──
  const eyes = new THREE.Group();
  eyes.name = 'bossEyes';
  eyes.position.set(0, 0, 0.35);
  parts.head.add(eyes);
  const ep = kit.part('bossEyes', eyes);
  for (const s of [-1, 1]) {
    ep.box([0.64, 0.44, 0.1], [s * 0.58, 0, 0], AMBER, [0, 0, s * 0.18]);
    ep.box([0.24, 0.17, 0.11], [s * 0.5, 0.04, 0.01], AMBER_HOT);
    ep.box([0.09, 0.36, 0.12], [s * 0.64, -0.01, 0.02], CAVE);
  }
  ep.done();

  // ── four thick arched legs: shoulder knob, knee, shin, a wide foot with pale claws ──
  for (const leg of [parts.legFL, parts.legFR, parts.legBL, parts.legBR]) {
    const s = leg.name.endsWith('L') ? 1 : -1;
    const p = kit.part(leg.name, leg);
    p.box([1.7, 1.7, 1.7], [s * 0.35, 0.25, 0], pick(SLATE))
      .box([1.5, 1.35, 1.45], [s * 1.25, 0.55, 0], pick(SLATE), [0, 0, s * -0.35])
      .box([1.25, 2.6, 1.3], [s * 1.65, -1.45, 0.05], pick(SLATE))
      .box([1.32, 0.5, 1.36], [s * 1.65, -0.6, 0.05], SLATE_DARK)
      .box([1.6, 0.5, 1.8], [s * 1.7, -2.75, 0.15], SLATE_DARK)
      .box([0.6, 0.12, 0.6], [s * 1.3, 1.25, 0.1], MOSS[0]);
    for (const dx of [-0.5, 0, 0.5]) p.box([0.3, 0.26, 0.38], [s * 1.7 + dx, -2.86, 1.1], TOOTH);
    p.done();
  }

  // One shadow caster: the body's stone; everything else only receives.
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

  return { type: 'quadruped', root, parts: rigParts, height: 7 };
}
