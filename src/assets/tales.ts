/**
 * The tales' pieces (DESIGN.md «Tales»): the things lying about for a tale (Пупся's fish, a piece of
 * a treasure map, a ball of yarn, the treasure chest), each turning over a faint sparkle column so a
 * child sees it from afar, and the friends' paper plane. Toy plastic, no real lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { TaleItem } from '../content/tales';
import { glowMaterial } from './buildingParts';
import { createChest } from './props';
import { Build, finishShadows, fx, HP, pool } from './villages';

export interface TaleThing {
  root: THREE.Group;
  update(dt: number, night: number): void;
  /** The chest lifts its lid when found. */
  open?(): void;
}

const COLUMN: Record<TaleItem, string> = { fish: '#ffb35c', scroll: '#ffe3a3', yarn: '#ff9fb2', chest: '#ffd23a' };
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
