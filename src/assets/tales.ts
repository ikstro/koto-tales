/**
 * The tales' pieces (DESIGN.md «Tales»): the things lying about for a tale (Пупся's fish, a piece of
 * a treasure map, a ball of yarn, a daisy, a walking pole, a record, a shell, a jar of honey, a sprig of berries, the treasure chest), each turning over a faint sparkle column so a
 * child sees it from afar, and the friends' paper plane. Toy plastic, no real lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { TaleItem } from '../content/tales';
import { glowMaterial } from './buildingParts';
import { createChest } from './props';
import type { V3 } from './parts/kit';
import { along, Build, finishShadows, fx, HP, pool } from './villages';

export interface TaleThing {
  root: THREE.Group;
  update(dt: number, night: number): void;
  /** The chest lifts its lid when found. */
  open?(): void;
}

const COLUMN: Record<TaleItem, string> = {
  fish: '#ffb35c',
  scroll: '#ffe3a3',
  yarn: '#ff9fb2',
  chest: '#ffd23a',
  daisy: '#fff4d8',
  pole: '#8fd0ff',
  disc: '#ffb35c',
  shell: '#ffb3c4',
  honey: '#ffc23d',
  berry: '#ff7a7a',
};
const CREAM_EYE = '#fff4d8';

/** Two crossing fades going up, brightest at the foot. */
function sparkleColumn(hex: string): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const H = 6;
  const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.4);
  const plane = (rot: number): THREE.BufferGeometry => {
    const g = new THREE.PlaneGeometry(0.7, H, 2, 10);
    const pos = g.getAttribute('position');
    const a = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const edge = Math.max(0, 1 - Math.abs(pos.getX(i)) / 0.35);
      const f = edge * Math.pow(1 - (pos.getY(i) + H / 2) / H, 1.3);
      a[i * 3] = c.r * f;
      a[i * 3 + 1] = c.g * f;
      a[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.translate(0, H / 2, 0).rotateY(rot);
  };
  const geo = mergeGeometries([plane(0), plane(HP)])!;
  geo.computeBoundingSphere();
  const mat = glowMaterial(0xffffff, true);
  const mesh = fx(new THREE.Mesh(geo, mat));
  mesh.position.y = 0.1;
  return { mesh, mat };
}

/** The thing itself, centred on its own origin. */
function body(skin: Skin, kind: TaleItem): THREE.Object3D {
  switch (kind) {
    case 'fish': {
      // Пупся's goldfish: a round orange body, a forked tail, a fin on top, a big eye
      const b = new Build(skin, 'tale-fish');
      b.ball(0.2, [0, 0, 0], '#f08a24', { s: [1.5, 1, 0.62], seg: 16 });
      b.ball(0.14, [0.1, -0.04, 0], '#ffc46b', { s: [1.4, 0.7, 0.64], seg: 12 });
      for (const s of [-1, 1]) b.box([0.16, 0.08, 0.05], [-0.36, s * 0.07, 0], '#e0583f', [0, 0, s * 0.6]);
      b.box([0.16, 0.08, 0.04], [-0.02, 0.2, 0], '#e0583f', [0, 0, -0.3]);
      for (const s of [-1, 1]) {
        b.ball(0.05, [0.18, 0.05, s * 0.11], CREAM_EYE, { seg: 10 });
        b.ball(0.028, [0.2, 0.05, s * 0.135], '#2e2a28', { seg: 8 });
      }
      b.finish();
      return b.root;
    }
    case 'scroll': {
      // a rolled piece of map tied with a coral ribbon, a corner unrolled
      const b = new Build(skin, 'tale-scroll');
      b.cyl(0.1, 0.56, [0, 0, 0], '#f1dfb0', { rot: [0, 0, HP], seg: 14 });
      for (const s of [-1, 1]) b.cyl(0.11, 0.04, [s * 0.29, 0, 0], '#c9a66b', { rot: [0, 0, HP], seg: 14 });
      b.cyl(0.108, 0.07, [0, 0, 0], '#e0583f', { rot: [0, 0, HP], seg: 14 });
      b.box([0.4, 0.02, 0.2], [0.02, -0.09, 0.14], '#f6e8c2', [0.25, 0, 0]);
      b.box([0.06, 0.022, 0.06], [0.1, -0.075, 0.18], '#e0583f', [0.25, 0.78, 0]);
      b.finish();
      return b.root;
    }
    case 'yarn': {
      // a pink ball wound round and round, a loose end hanging off
      const b = new Build(skin, 'tale-yarn');
      b.ball(0.21, [0, 0, 0], '#ee6a82', { seg: 16 });
      for (let i = 0; i < 3; i++) {
        const g = new THREE.TorusGeometry(0.205, 0.018, 6, 24);
        b.geo(g, [0, 0, 0], '#c94b66', { rot: [0.5 + i * 0.9, i * 1.1, 0.3] });
      }
      b.cyl(0.02, 0.26, [0.17, -0.2, 0.06], '#c94b66', { rot: [0.3, 0, 0.6], seg: 6 });
      b.finish();
      return b.root;
    }
    case 'daisy': {
      // one big white daisy tipped back to the sky: a yellow button, a green stem with a leaf
      const b = new Build(skin, 'tale-daisy');
      b.cyl(0.028, 0.56, [0, -0.12, 0], '#43a047', { seg: 8 });
      b.ball(0.1, [0.1, -0.2, 0], '#66bb6a', { s: [1.15, 0.28, 0.6], rot: [0, 0, 0.5], seg: 10 });
      const tilt = new THREE.Euler(-0.45, 0, 0);
      const headAt = (x: number, y: number): V3 => {
        const v = new THREE.Vector3(x, y, 0).applyEuler(tilt);
        return [v.x, v.y + 0.18, v.z];
      };
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        b.ball(0.1, headAt(Math.cos(a) * 0.2, Math.sin(a) * 0.2), '#fff9ee', { s: [1.15, 0.5, 0.26], rot: [tilt.x, 0, a], seg: 10 });
      }
      b.ball(0.11, headAt(0, 0), '#ffd23a', { s: [1, 1, 0.5], rot: [tilt.x, 0, 0], seg: 14 });
      b.finish();
      return b.root;
    }
    case 'pole': {
      // a walking pole lying at a slant: grey shaft, black grip with a coral strap, a little basket and a steel tip
      const b = new Build(skin, 'tale-pole');
      const dir = new THREE.Vector3(0.74, 0.67, 0);
      const q = along(dir.x, dir.y, dir.z);
      const on = (s: number, dx = 0, dy = 0): V3 => [dir.x * s + dx, dir.y * s + dy, 0];
      b.cyl(0.024, 0.86, on(0), '#9aa2aa', { q, seg: 10 });
      b.cyl(0.04, 0.17, on(0.42), '#2e2a28', { q, seg: 10 });
      b.cyl(0.05, 0.03, on(0.51), '#2e2a28', { q, seg: 10 });
      b.geo(new THREE.TorusGeometry(0.075, 0.014, 6, 16), on(0.44, 0.05, -0.05), '#e0583f', { rot: [0, 0, 0.74] });
      b.cyl(0.085, 0.022, on(-0.33), '#2e2a28', { q, seg: 12 });
      b.cyl(0.03, 0.03, on(-0.33), '#7a8088', { q, seg: 8 });
      b.cyl(0.024, 0.08, on(-0.47), '#d4d8dc', { q, r1: 0.005, seg: 8 });
      b.finish();
      return b.root;
    }
    case 'disc': {
      // a black record with fine grooves and a coral label, leaning back; thick enough to see edge-on
      const b = new Build(skin, 'tale-disc');
      const lean = { rot: [HP - 0.2, 0, 0] as const, seg: 28 };
      b.cyl(0.31, 0.05, [0, 0, 0], '#1d1a19', lean);
      [0.27, 0.22, 0.17].forEach((r, i) => {
        b.cyl(r, 0.054 + i * 0.006, [0, 0, 0], '#4a4440', lean);
        b.cyl(r - 0.012, 0.057 + i * 0.006, [0, 0, 0], '#1d1a19', lean);
      });
      b.cyl(0.12, 0.076, [0, 0, 0], '#e0583f', lean);
      b.cyl(0.024, 0.082, [0, 0, 0], '#fff4d8', lean);
      b.finish();
      return b.root;
    }
    case 'shell': {
      // a scallop tipped back to the sky: pink and cream ribs fanning from a hinge with two little ears
      const b = new Build(skin, 'tale-shell');
      const tilt = new THREE.Euler(-0.5, 0, 0);
      const on = (x: number, y: number, z = 0): V3 => {
        const v = new THREE.Vector3(x, y - 0.2, z).applyEuler(tilt);
        return [v.x, v.y, v.z];
      };
      b.ball(0.3, on(0, 0.23, -0.02), '#e8879b', { s: [1.08, 0.82, 0.16], rot: [tilt.x, 0, 0], seg: 16 });
      for (let i = 0; i < 7; i++) {
        const a = (i - 3) * 0.36;
        const z = 0.035 * Math.cos(a * 1.2);
        b.ball(0.11, on(Math.sin(a) * 0.24, Math.cos(a) * 0.24, z), i % 2 ? '#fff0d6' : '#f58fa6', { s: [0.72, 2.05, 0.42], rot: [tilt.x, 0, -a], seg: 12 });
      }
      b.box([0.24, 0.07, 0.07], on(0, -0.005), '#e8879b', [tilt.x, 0, 0]);
      b.ball(0.055, on(0, 0.02, 0.02), '#fff0d6', { s: [1.1, 0.8, 0.7], rot: [tilt.x, 0, 0], seg: 10 });
      b.finish();
      return b.root;
    }
    case 'honey': {
      // a squat jar of golden honey, a cream cloth over its mouth tied with a string, the ends hanging at the front
      const b = new Build(skin, 'tale-honey');
      b.cyl(0.19, 0.26, [0, -0.08, 0], '#f5a81c', { seg: 18 });
      b.ball(0.19, [0, -0.21, 0], '#e08f12', { s: [1, 0.3, 1], seg: 16 });
      b.ball(0.19, [0, 0.05, 0], '#f5a81c', { s: [1, 0.42, 1], seg: 16 });
      b.ball(0.05, [-0.1, -0.07, 0.155], '#ffdc85', { s: [0.5, 2.1, 0.3], rot: [0, -0.56, 0], seg: 10 });
      b.cyl(0.14, 0.08, [0, 0.13, 0], '#f5a81c', { seg: 16 });
      b.cyl(0.19, 0.09, [0, 0.16, 0], '#fff4d8', { r1: 0.145, seg: 18 });
      b.ball(0.155, [0, 0.2, 0], '#fff4d8', { s: [1, 0.4, 1], top: true, seg: 16 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.ball(0.045, [Math.sin(a) * 0.175, 0.112, Math.cos(a) * 0.175], '#fff4d8', { s: [1.1, 0.8, 1.1], seg: 8 });
      }
      b.geo(new THREE.TorusGeometry(0.155, 0.014, 6, 24), [0, 0.175, 0], '#b5763a', { rot: [HP, 0, 0] });
      b.ball(0.026, [0, 0.175, 0.156], '#b5763a', { seg: 8 });
      for (const s of [-1, 1]) b.cyl(0.012, 0.14, [s * 0.03, 0.115, 0.178], '#b5763a', { rot: [0.12, 0, s * 0.35], seg: 6 });
      b.finish();
      return b.root;
    }
    case 'berry': {
      // a green sprig with leaves along it and three plump red berries set by turns on its sides, each with a dark little crown
      const b = new Build(skin, 'tale-berry');
      b.cyl(0.022, 0.62, [0, -0.02, 0], '#3f8f3f', { rot: [0, 0, -0.06], seg: 8 });
      for (const [x, y, r, turn] of [[0.11, 0.3, 0.14, 0.75], [-0.1, 0.27, 0.12, -0.8], [0.13, -0.27, 0.13, 1.05]] as const) {
        b.ball(r, [x, y, 0], '#55b04f', { s: [1, 0.42, 0.24], rot: [0, 0, turn], seg: 12 });
      }
      for (const [x, y, s] of [[-0.11, 0.1, 1], [0.115, -0.03, 1], [-0.1, -0.17, 1]] as const) {
        const r = 0.1;
        b.cyl(0.012, Math.abs(x), [x / 2, y + 0.02, 0.01], '#3f8f3f', { rot: [0, 0, s * HP], seg: 6 });
        b.ball(r, [x, y, 0.03], '#e0343a', { seg: 16 });
        b.ball(r * 0.3, [x - r * 0.42, y + r * 0.42, 0.03 + r * 0.68], '#ff9a8f', { seg: 8 });
        b.ball(r * 0.26, [x + r * 0.2, y - r * 0.3, 0.03 + r * 0.9], '#6b1c22', { s: [1, 1, 0.4], seg: 8 });
      }
      b.finish();
      return b.root;
    }
    case 'chest': {
      const chest = createChest(skin);
      chest.root.scale.setScalar(1.25);
      chest.root.userData.chest = chest;
      return chest.root;
    }
  }
}

/** A thing to find for a tale: it bobs and turns (the chest only stands), with its sparkle column. */
export function createTaleThing(skin: Skin, kind: TaleItem): TaleThing {
  const root = new THREE.Group();
  root.name = `tale-${kind}`;
  const spin = new THREE.Group();
  const it = body(skin, kind);
  spin.add(it);
  const still = kind === 'chest';
  // bigger than a real one, to be seen from afar
  if (!still) it.scale.setScalar(1.5);
  spin.position.y = still ? 0 : 0.75;
  root.add(spin);
  const col = sparkleColumn(COLUMN[kind]);
  root.add(col.mesh);
  const pl = pool(parseInt(COLUMN[kind].slice(1), 16), 0.9, [0, 0.05, 0]);
  pl.mesh.visible = true;
  root.add(pl.mesh);
  finishShadows(root);
  it.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  let t = Math.random() * 6;
  let opened = false;
  return {
    root,
    update(dt, night) {
      t += dt;
      if (!still) {
        spin.rotation.y = t * 1.5;
        spin.position.y = 0.75 + Math.sin(t * 2.2) * 0.1;
      }
      const tw = 0.5 + 0.5 * Math.sin(t * 3.1);
      col.mat.opacity = opened ? Math.max(0, col.mat.opacity - dt) : 0.22 + 0.3 * night + 0.06 * tw;
      pl.mat.opacity = opened ? Math.max(0, pl.mat.opacity - dt) : 0.4 + 0.3 * night;
    },
    open: still
      ? () => {
          opened = true;
          (it.userData.chest as { setOpen(o: boolean): void } | undefined)?.setOpen(true);
        }
      : undefined,
  };
}

// ─── the paper plane ─────────────────────────────────────────────────────────

const PAPER = '#fff4d8';
const PAPER_D = '#e9dcb8';

/** Triangles both ways round (paper has two sides), each with its own colour. */
function paper(tris: [THREE.Vector3Tuple, THREE.Vector3Tuple, THREE.Vector3Tuple, string][]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const [a, b, d, hex] of tris) {
    c.set(hex);
    for (const v of [a, b, d, a, d, b]) {
      pos.push(...v);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export interface PlaneModel {
  root: THREE.Group;
  /** `flying`: the wings rock; on the ground it only breathes. */
  update(dt: number, flying: boolean, night: number): void;
}

/** A folded paper dart, nose to +Z, with a round stamp in the sender's colour on its back. */
export function createPlane(skin: Skin, stamp: string): PlaneModel {
  const root = new THREE.Group();
  root.name = 'tale-plane';
  const tilt = new THREE.Group();
  root.add(tilt);
  const N: THREE.Vector3Tuple = [0, 0.06, 0.62];
  const TL: THREE.Vector3Tuple = [-0.4, 0.12, -0.36];
  const TC: THREE.Vector3Tuple = [0, 0.05, -0.36];
  const TR: THREE.Vector3Tuple = [0.4, 0.12, -0.36];
  const K: THREE.Vector3Tuple = [0, -0.12, -0.32];
  const geo = paper([
    [N, TC, TL, PAPER],
    [N, TR, TC, PAPER],
    [N, K, TC, PAPER_D],
  ]);
  const dart = new THREE.Mesh(geo, skin.partMaterial(0xffffff, { vertexColors: true }));
  dart.castShadow = true;
  tilt.add(dart);
  const seal = new Build(skin, `tale-plane-seal-${stamp}`);
  seal.cyl(0.07, 0.02, [0.16, 0.1, -0.16], stamp, { seg: 12, rot: [0, 0, 0.12] });
  seal.finish();
  tilt.add(seal.root);
  const col = sparkleColumn('#ffe3a3');
  col.mesh.scale.set(0.8, 0.5, 0.8);
  root.add(col.mesh);
  finishShadows(root);
  dart.receiveShadow = true;
  let t = 0;
  return {
    root,
    update(dt, flying, night) {
      t += dt;
      tilt.rotation.z = flying ? Math.sin(t * 3.4) * 0.35 : 0;
      tilt.rotation.x = flying ? Math.sin(t * 2.1) * 0.08 : 0;
      tilt.position.y = flying ? 0 : 0.14 + Math.sin(t * 2.4) * 0.05;
      col.mat.opacity = flying ? 0 : 0.18 + 0.25 * night + 0.06 * Math.sin(t * 3.1);
    },
  };
}
