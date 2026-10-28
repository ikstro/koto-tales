/** Arrow, campfire, treasure chest and the house furniture (bed, cushion, door). Materials from the skin. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import { Kit } from './parts/kit';

/** An arrow ≈0.75 blocks long, origin at its middle, pointing +Z. */
export function createArrow(skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = 'arrow';
  new Kit('arrow', skin)
    .part('arrow', g)
    .box([0.04, 0.04, 0.62], [0, 0, 0], '#caa26a')
    .box([0.09, 0.09, 0.08], [0, 0, 0.33], '#9aa4ad')
    .box([0.05, 0.05, 0.06], [0, 0, 0.395], '#9aa4ad')
    .box([0.012, 0.11, 0.14], [0, 0, -0.26], '#ef5350')
    .box([0.11, 0.012, 0.14], [0, 0, -0.26], '#fafafa')
    .done();
  return g;
}

export interface Campfire {
  root: THREE.Group;
  update(dt: number): void;
}

const FLAMES = 7;
const SPARKS = 4;

/** Stones, crossed logs, glowing embers, rising flame cubes and a flickering warm light. Origin bottom centre. */
export function createCampfire(skin: Skin): Campfire {
  const root = new THREE.Group();
  root.name = 'campfire';
  const p = new Kit('campfire', skin).part('campfire', root);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.box([0.17, 0.13, 0.17], [Math.cos(a) * 0.4, 0.065, Math.sin(a) * 0.4], i % 2 ? '#8f8f96' : '#7a7a82', [0, a, 0]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    p.box([0.11, 0.11, 0.62], [0, 0.1 + i * 0.03, 0], '#6b4a2b', [0.12, a, 0]);
  }
  p.box([0.34, 0.05, 0.34], [0, 0.03, 0], { c: '#ff6d1f', glow: true }, [0, 0.4, 0]);
  p.done();

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const flames = new THREE.InstancedMesh(unit, skin.partMaterial('#ff8a1f', { emissive: true }), FLAMES);
  const sparks = new THREE.InstancedMesh(unit, skin.partMaterial('#ffd84a', { emissive: true }), SPARKS);
  flames.frustumCulled = sparks.frustumCulled = false;
  root.add(flames, sparks);

  const light = new THREE.PointLight(0xffa64d, 3, 5, 1.4);
  light.position.set(0, 0.7, 0);
  root.add(light);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const seed = (i: number) => (Math.sin(i * 91.7) * 43758.5) % 1;
  let t = 0;

  const place = (mesh: THREE.InstancedMesh, i: number, life: number, base: number, rise: number, k: number) => {
    const s = Math.abs(seed(i + k));
    const a = s * Math.PI * 2;
    const r = (1 - life) * 0.11 + 0.02;
    pos.set(Math.cos(a + life * 2) * r, 0.1 + life * rise, Math.sin(a + life * 2) * r);
    const size = base * (1 - life * 0.85);
    scl.set(size, size, size);
    q.setFromEuler(e.set(life * 2 + s, life * 3, 0));
    mesh.setMatrixAt(i, m.compose(pos, q, scl));
  };

  const update = (dt: number) => {
    t += dt;
    for (let i = 0; i < FLAMES; i++) place(flames, i, (t * 1.3 + i / FLAMES) % 1, 0.2, 0.62, 0);
    for (let i = 0; i < SPARKS; i++) place(sparks, i, (t * 0.9 + i / SPARKS + 0.13) % 1, 0.1, 0.9, 7);
    flames.instanceMatrix.needsUpdate = true;
    sparks.instanceMatrix.needsUpdate = true;
    light.intensity = 3 + Math.sin(t * 13) * 0.45 + Math.sin(t * 7.3 + 1) * 0.35 + Math.sin(t * 23) * 0.2;
  };
  update(0);
  return { root, update };
}

export interface Chest {
  root: THREE.Group;
  setOpen(open: boolean): void;
}

/**
 * A wooden chest with dark straps and gold inside, origin bottom centre,
 * front +Z. The lid hinges at the back edge and animates itself (it eases
 * while the chest is being rendered), so the game only calls setOpen.
 */
export function createChest(skin: Skin): Chest {
  const root = new THREE.Group();
  root.name = 'chest';
  const kit = new Kit('chest', skin);
  const WOOD = '#a8692f';
  const DARK = '#5b3818';
  const GOLD = '#ffcf33';
  const W = 0.72;
  const D = 0.5;
  const H = 0.36;
  const t = 0.06;
  kit
    .part('base', root)
    .box([W, t, D], [0, t / 2, 0], WOOD)
    .box([W, H, t], [0, H / 2, D / 2 - t / 2], WOOD)
    .box([W, H, t], [0, H / 2, -D / 2 + t / 2], WOOD)
    .box([t, H, D - 2 * t], [W / 2 - t / 2, H / 2, 0], WOOD)
    .box([t, H, D - 2 * t], [-W / 2 + t / 2, H / 2, 0], WOOD)
    .box([0.07, H + 0.005, D + 0.01], [0.22, H / 2, 0], DARK)
    .box([0.07, H + 0.005, D + 0.01], [-0.22, H / 2, 0], DARK)
    .box([W + 0.01, 0.05, D + 0.01], [0, 0.025, 0], DARK)
    // treasure inside
    .box([W - 2 * t, 0.2, D - 2 * t], [0, 0.18, 0], { c: GOLD, glow: true })
    .box([0.12, 0.05, 0.12], [-0.12, 0.3, 0.04], { c: GOLD, glow: true }, [0, 0.5, 0])
    .box([0.1, 0.05, 0.1], [0.1, 0.3, -0.05], { c: GOLD, glow: true }, [0, 0.2, 0])
    .box([0.07, 0.09, 0.07], [0.02, 0.31, 0.06], { c: '#ff5c8a', glow: true }, [0, 0.785, 0])
    .done();

  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, H, -D / 2);
  root.add(lid);
  const lidMeshes = kit
    .part('lid', lid)
    .box([W + 0.02, 0.12, D + 0.02], [0, 0.06, D / 2], WOOD)
    .box([W - 0.08, 0.07, D - 0.12], [0, 0.155, D / 2], WOOD)
    .box([0.075, 0.2, D + 0.04], [0.22, 0.09, D / 2], DARK)
    .box([0.075, 0.2, D + 0.04], [-0.22, 0.09, D / 2], DARK)
    .box([0.11, 0.13, 0.035], [0, -0.01, D + 0.02], GOLD)
    .box([0.04, 0.05, 0.01], [0, -0.02, D + 0.04], DARK)
    .done();

  let target = 0;
  let angle = 0;
  let vel = 0;
  let last = -1;
  const OPEN = -1.95;
  // A spring with a little overshoot; driven from render so no update() is needed.
  lidMeshes[0].onBeforeRender = () => {
    const now = performance.now() / 1000;
    const dt = last < 0 ? 0 : Math.min(0.05, now - last);
    last = now;
    const k = 90;
    const c = 11;
    vel += (-(angle - target) * k - vel * c) * dt;
    angle += vel * dt;
    if (target === 0 && angle > 0) {
      angle = 0;
      vel = 0;
    }
    lid.rotation.x = angle;
  };

  return {
    root,
    setOpen(open: boolean) {
      target = open ? OPEN : 0;
    },
  };
}

// ─── house furniture ────────────────────────────────────────────────────────

export interface Bed {
  root: THREE.Group;
  /** 0 = the blanket covers the sleeper, 1 = folded at the foot of the bed. */
  fold(k: number): void;
}

const mixN = (a: number, b: number, k: number) => a + (b - a) * k;
const PILLOW = '#fff1d0';

/**
 * A child's bed, 1×2 blocks, origin at the floor centre, head end towards -Z:
 * plank base, cream sheet, headboard with gold knobs, a pillow and a blanket
 * that folds to the foot. `height` is the sheet top; 0 gives only the bedding
 * (pillow + blanket), to lay on top of a BED block.
 */
export function createBed(skin: Skin, blanketColor: string, height = 0.75): Bed {
  const root = new THREE.Group();
  root.name = 'bed';
  const kit = new Kit('bed', skin);
  const H = height;
  if (H > 0) {
    const WOOD = '#b5793c';
    const DARK = '#7d5128';
    kit
      .part('frame', root)
      .box([0.98, H - 0.18, 1.94], [0, (H - 0.18) / 2, 0], WOOD)
      .box([1.0, 0.06, 1.96], [0, H - 0.2, 0], DARK)
      .box([0.92, 0.18, 1.86], [0, H - 0.09, 0], '#f6ecd6')
      .box([1.04, H + 0.5, 0.12], [0, (H + 0.5) / 2, -0.97], WOOD)
      .box([1.1, 0.08, 0.16], [0, H + 0.54, -0.97], DARK)
      .box([0.12, 0.1, 0.12], [0.46, H + 0.63, -0.97], '#eab02b')
      .box([0.12, 0.1, 0.12], [-0.46, H + 0.63, -0.97], '#eab02b')
      .box([1.04, H + 0.18, 0.12], [0, (H + 0.18) / 2, 0.97], WOOD)
      .box([1.1, 0.06, 0.16], [0, H + 0.21, 0.97], DARK)
      // the pillow never moves: one mesh with the frame
      .box([0.78, 0.16, 0.48], [0, H + 0.08, -0.66], PILLOW)
      .done();
  }
  const bedding = new THREE.Group();
  bedding.position.y = H;
  root.add(bedding);
  if (H <= 0) kit.part('pillow', bedding).box([0.78, 0.16, 0.48], [0, 0.08, -0.66], PILLOW).done();

  const band = new THREE.Color(blanketColor).lerp(new THREE.Color('#ffffff'), 0.3).getStyle();
  const blanket = new THREE.Group();
  const hem = new THREE.Group();
  bedding.add(blanket, hem);
  kit.part('blanket', blanket).box([0.98, 0.2, 1.12], [0, 0, 0], blanketColor).done();
  kit.part('hem', hem).box([0.86, 0.02, 0.24], [0, 0, 0], band).done();

  const fold = (k: number) => {
    const sy = mixN(1, 1.15, k);
    const sz = mixN(1, 0.4, k);
    blanket.position.set(0, mixN(0.34, 0.1, k), mixN(0.37, 0.7, k));
    blanket.scale.set(1, sy, sz);
    hem.position.set(0, blanket.position.y + 0.1 * sy + 0.01, blanket.position.z - 0.56 * sz + 0.13);
    hem.scale.set(1, 1, mixN(1, 0.6, k));
  };
  fold(1);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  return { root, fold };
}

/** Base and top of the cushion as one geometry, coloured per vertex (one draw call). */
const cushionGeo = (() => {
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const base = paint(new THREE.CylinderGeometry(0.66, 0.68, 0.12, 20).translate(0, 0.06, 0), '#2f918b');
  const top = paint(new THREE.CylinderGeometry(0.54, 0.62, 0.06, 20).translate(0, 0.14, 0), '#59b3ab');
  const g = mergeGeometries([base, top], false)!;
  base.dispose();
  top.dispose();
  return g;
})();
/** Height of the cushion's top, where Пупся lies. */
export const CUSHION_TOP = 0.17;

/** Пупся's round teal cushion, origin bottom centre. */
export function createCushion(skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cushion';
  const mesh = new THREE.Mesh(cushionGeo, skin.partMaterial(0xffffff, { vertexColors: true }));
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

export interface Door {
  root: THREE.Group;
  /** 0 = closed, 1 = open (values past 1 overswing, for a spring). */
  setOpen(k: number): void;
}

const DOOR_OPEN = -1.72;

/**
 * A plank door one block wide and two high, origin at the bottom of the
 * hinged (left) edge, the leaf running towards +X; it opens outwards (+Z).
 * Visual only: the doorway stays air, so it never blocks anyone.
 */
export function createDoor(skin: Skin): Door {
  const root = new THREE.Group();
  root.name = 'door';
  const leaf = new THREE.Group();
  root.add(leaf);
  new Kit('door', skin)
    .part('door', leaf)
    .box([0.31, 1.96, 0.1], [0.16, 0.98, 0], '#b5793c')
    .box([0.31, 1.96, 0.1], [0.47, 0.98, 0], '#a8692f')
    .box([0.3, 1.96, 0.1], [0.775, 0.98, 0], '#b8803f')
    .box([0.9, 0.14, 0.05], [0.46, 0.42, 0.07], '#7d5128')
    .box([0.9, 0.14, 0.05], [0.46, 1.52, 0.07], '#7d5128')
    .box([0.9, 0.14, 0.05], [0.46, 0.42, -0.07], '#7d5128')
    .box([0.9, 0.14, 0.05], [0.46, 1.52, -0.07], '#7d5128')
    .box([0.1, 0.1, 0.24], [0.8, 0.98, 0], '#eab02b')
    .done();
  leaf.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  return {
    root,
    setOpen(k: number) {
      leaf.rotation.y = DOOR_OPEN * k;
    },
  };
}
