/**
 * Models of the kit's buildings (content/buildings.ts) and the portal pair. Toy
 * pieces in the skin's plastic, origin at the floor centre, front towards +Z.
 * Each model animates itself from `update`; the systems only move and show it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingId } from '../content/buildings';
import { Kit } from './parts/kit';

export interface BuildingModel {
  root: THREE.Group;
  /** `beat` = music time in beats (120 a minute); `playing` = its music is on; `night` 0..1. */
  update(dt: number, k: { beat: number; playing: boolean; night: number }): void;
}

const CORAL = '#e0583f';
const CORAL_DARK = '#b8432f';
const CREAM = '#ffe3a3';
const INK = '#3b2414';
const WOOD = '#8a5a2b';
const MUSTARD = '#eab02b';
const TEAL = '#2f918b';
const MINT = '#59b3ab';
const CHARCOAL = '#2e2a28';

export function createBuilding(skin: Skin, id: BuildingId): BuildingModel {
  if (id === 'tent') return createTent(skin);
  if (id === 'boombox') return createBoombox(skin);
  return createLanternGhost();
}

/** A stepped triangle (toy bricks can't be slanted): rows from the base up, centred on x = 0. */
function stepped(p: ReturnType<Kit['part']>, halfW: number, height: number, z: number, depth: number, colour: string, rows = 5): void {
  const h = height / rows;
  for (let i = 0; i < rows; i++) {
    const w = 2 * halfW * (1 - (i + 0.5) / rows);
    if (w > 0.05) p.box([w, h, depth], [0, h * (i + 0.5), z], colour);
  }
}

/**
 * The tent: a coral A-frame on a dark groundsheet, cream ridge and trim, a dark door
 * opening at the front, poles, guy ropes with pegs and a little lamp under the ridge.
 */
function createTent(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'tent';
  const W = 1.3;
  const H = 1.8;
  const D = 2.6;
  const slope = Math.atan2(H, W);
  const L = Math.hypot(W, H);
  const p = new Kit('tent', skin).part('tent', root);
  p.box([2.9, 0.06, 2.9], [0, 0.03, 0], '#2a5a58');
  p.box([L, 0.09, D], [-W / 2, H / 2, 0], CORAL, [0, 0, slope]);
  p.box([L, 0.09, D], [W / 2, H / 2, 0], CORAL, [0, 0, -slope]);
  // cream stripes along the slopes, a ridge cap and the bottom trim
  for (const s of [-1, 1]) {
    p.box([0.1, 0.1, D + 0.02], [s * W * 0.5, H * 0.5 + 0.06, 0], CREAM, [0, 0, -s * slope]);
    p.box([0.14, 0.14, D + 0.04], [s * (W - 0.02), 0.1, 0], CREAM);
  }
  p.box([0.26, 0.14, D + 0.1], [0, H + 0.02, 0], CREAM);
  stepped(p, W - 0.05, H - 0.05, -D / 2 + 0.05, 0.08, CORAL_DARK);
  stepped(p, W - 0.05, H - 0.05, D / 2 - 0.05, 0.08, CORAL_DARK);
  stepped(p, 0.62, 1.25, D / 2 - 0.0, 0.06, INK, 4);
  // poles, ropes, pegs
  p.box([0.09, 0.42, 0.09], [0, H + 0.2, D / 2 + 0.04], WOOD);
  p.box([0.09, 0.42, 0.09], [0, H + 0.2, -D / 2 - 0.04], WOOD);
  for (const s of [-1, 1]) {
    p.beam([0, H + 0.12, s * (D / 2 + 0.04)], [0, 0.06, s * 1.45], 0.035, CREAM);
    p.box([0.1, 0.16, 0.1], [0, 0.08, s * 1.45], WOOD);
  }
  // a flag on the front pole and a warm lamp hanging under the ridge
  p.box([0.04, 0.24, 0.32], [0, H + 0.42, D / 2 + 0.2], MUSTARD);
  p.box([0.14, 0.18, 0.14], [0, H - 0.32, D / 2 - 0.12], { c: '#ffd23a', glow: true });
  p.done();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  return { root, update() {} };
}

const NOTES = 4;

/**
 * The boombox: a mustard radio with two speaker cones that thump on the beat, a handle,
 * a telescopic antenna with a ball, a glowing display and notes floating up while it plays.
 */
function createBoombox(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'boombox';
  const body = new THREE.Group();
  root.add(body);
  const BW = 1.3;
  const BH = 0.78;
  const BD = 0.56;
  const y0 = 0.1;
  const kit = new Kit('boombox', skin);
  kit
    .part('body', body)
    .box([BW, BH, BD], [0, y0 + BH / 2, 0], MUSTARD)
    .box([BW + 0.04, 0.08, BD + 0.04], [0, y0 + 0.04, 0], '#c98f1c')
    .box([0.2, 0.1, 0.4], [-0.45, 0.05, 0], CHARCOAL)
    .box([0.2, 0.1, 0.4], [0.45, 0.05, 0], CHARCOAL)
    // the cassette deck and buttons between the speakers
    .box([0.34, 0.26, 0.03], [0, y0 + 0.36, BD / 2 + 0.01], CHARCOAL)
    .box([0.22, 0.12, 0.02], [0, y0 + 0.36, BD / 2 + 0.03], CREAM)
    .box([0.07, 0.05, 0.07], [-0.12, y0 + BH + 0.025, 0.12], CORAL)
    .box([0.07, 0.05, 0.07], [0, y0 + BH + 0.025, 0.12], TEAL)
    .box([0.07, 0.05, 0.07], [0.12, y0 + BH + 0.025, 0.12], CREAM)
    // handle
    .box([0.08, 0.3, 0.08], [-0.42, y0 + BH + 0.15, -0.05], CHARCOAL)
    .box([0.08, 0.3, 0.08], [0.42, y0 + BH + 0.15, -0.05], CHARCOAL)
    .box([0.92, 0.08, 0.1], [0, y0 + BH + 0.3, -0.05], CHARCOAL)
    // antenna: a tech kid's favourite part
    .beam([0.55, y0 + BH, -0.18], [0.85, y0 + BH + 0.95, -0.25], 0.035, '#b7bcc2')
    .box([0.1, 0.1, 0.1], [0.86, y0 + BH + 0.98, -0.25], CORAL)
    .done();

  // two speaker cones: dark rings with cream caps; they thump on every beat
  const ringGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 20).rotateX(Math.PI / 2);
  const coneGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.05, 20).rotateX(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14).rotateX(Math.PI / 2);
  const cones: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.38, y0 + BH * 0.5, BD / 2);
    const ring = new THREE.Mesh(ringGeo, skin.partMaterial(CHARCOAL));
    const cone = new THREE.Mesh(coneGeo, skin.partMaterial('#4a4440'));
    cone.position.z = 0.02;
    const cap = new THREE.Mesh(capGeo, skin.partMaterial(CREAM));
    cap.position.z = 0.045;
    g.add(ring, cone, cap);
    body.add(g);
    cones.push(g);
  }

  // the display changes colour on the beat (its own material: shared ones must not blink)
  const lcdMat = (skin.partMaterial(MINT, { emissive: true }) as THREE.MeshStandardMaterial).clone();
  const lcd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.02), lcdMat);
  lcd.position.set(0, y0 + BH - 0.14, BD / 2 + 0.01);
  body.add(lcd);
  const LCD = [new THREE.Color(MINT), new THREE.Color('#ffd23a'), new THREE.Color('#ff8a6a'), new THREE.Color('#9ad0ff')];

  // floating notes: a head and a stem each, one instanced draw
  const noteGeo = mergeGeometries([
    new THREE.BoxGeometry(0.16, 0.12, 0.06),
    new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(0.06, 0.15, 0),
    new THREE.BoxGeometry(0.12, 0.05, 0.04).translate(0.11, 0.28, 0),
  ])!;
  const notes = new THREE.InstancedMesh(noteGeo, skin.partMaterial('#ffd23a', { emissive: true }), NOTES);
  notes.frustumCulled = false;
  root.add(notes);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let t = 0;
  let lastBeat = -1;
  let shown = 0;

  return {
    root,
    update(dt, k) {
      t += dt;
      shown += ((k.playing ? 1 : 0) - shown) * Math.min(1, dt * 3);
      const beat = k.beat;
      const frac = beat - Math.floor(beat);
      const thump = k.playing ? Math.exp(-frac * 7) : 0;
      for (const c of cones) c.scale.set(1 + thump * 0.12, 1 + thump * 0.12, 1 + thump * 1.2);
      body.scale.set(1 + thump * 0.025, 1 - thump * 0.03, 1 + thump * 0.025);
      const b = Math.floor(beat);
      if (k.playing && b !== lastBeat) {
        lastBeat = b;
        lcdMat.color.copy(LCD[b % LCD.length]);
        lcdMat.emissive.copy(lcdMat.color).multiplyScalar(0.85);
      }
      for (let i = 0; i < NOTES; i++) {
        const life = (t * 0.45 + i / NOTES) % 1;
        const side = i % 2 ? 1 : -1;
        pos.set(side * (0.35 + life * 0.5) + Math.sin(t * 2 + i) * 0.1, 1.1 + life * 1.6, 0.1);
        const s = shown * Math.sin(life * Math.PI) * 1.1;
        scl.set(s, s, s);
        q.setFromEuler(e.set(0, 0, Math.sin(t * 3 + i) * 0.35));
        notes.setMatrixAt(i, m.compose(pos, q, scl));
      }
      notes.instanceMatrix.needsUpdate = true;
      notes.visible = shown > 0.02;
    },
  };
}

/** The lantern's ghost: just the block's cube (the real one is a world block). */
function createLanternGhost(): BuildingModel {
  const root = new THREE.Group();
  root.name = 'lantern-ghost';
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  box.position.y = 0.5;
  root.add(box);
  return { root, update() {} };
}

// ─── the ghost: where a building will stand ─────────────────────────────────

const ghostMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.42, depthWrite: false });

/** A see-through copy of a building that shows where it will go; one shared warm material. */
export function createGhost(skin: Skin, id: BuildingId): THREE.Group {
  const g = createBuilding(skin, id).root;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = ghostMat;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 5;
  });
  g.userData.casts = false;
  return g;
}

/** The ghost breathes so the child sees it is not built yet. */
export function breatheGhost(t: number): void {
  ghostMat.opacity = 0.32 + Math.sin(t * 5) * 0.1;
}

// ─── the portal pair ────────────────────────────────────────────────────────

export interface PortalModel {
  root: THREE.Group;
  /** 0 = shut (the swirl shrunk to nothing), 1 = open. */
  setOpen(k: number): void;
  update(dt: number): void;
}

let swirlTex: THREE.CanvasTexture | null = null;

/** A warm magic swirl: cream heart, mustard and coral arms (the golden-hour palette, no neon). */
function swirlTexture(): THREE.CanvasTexture {
  if (swirlTex) return swirlTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#fff6d6');
  g.addColorStop(0.35, '#ffd23a');
  g.addColorStop(0.75, '#f08a3a');
  g.addColorStop(1, '#e0583f');
  x.fillStyle = g;
  x.beginPath();
  x.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  x.fill();
  x.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    x.strokeStyle = arm % 2 ? 'rgba(255, 246, 214, 0.75)' : 'rgba(224, 88, 63, 0.55)';
    x.lineWidth = 10;
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const k = i / 60;
      const a = arm * (Math.PI / 2) + k * Math.PI * 2.2;
      const r = k * s * 0.47;
      const px = s / 2 + Math.cos(a) * r;
      const py = s / 2 + Math.sin(a) * r;
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.stroke();
  }
  swirlTex = new THREE.CanvasTexture(c);
  swirlTex.colorSpace = THREE.SRGBColorSpace;
  return swirlTex;
}

const SPARKS = 6;

/**
 * A portal arch: teal pillars with mint bands, a stepped top with a mustard keystone,
 * a cream doorstep, and a turning warm swirl inside with sparks circling it.
 */
export function createPortal(skin: Skin): PortalModel {
  const root = new THREE.Group();
  root.name = 'portal';
  const p = new Kit('portal', skin).part('arch', root);
  p.box([3.4, 0.16, 1.2], [0, 0.08, 0], CREAM);
  for (const s of [-1, 1]) {
    p.box([0.62, 2.9, 0.62], [s * 1.35, 0.16 + 1.45, 0], TEAL);
    for (const y of [0.7, 1.6, 2.5]) p.box([0.66, 0.14, 0.66], [s * 1.35, y, 0], MINT);
    p.box([0.24, 0.12, 0.24], [s * 1.35, 3.12, 0], TEAL);
  }
  p.box([3.36, 0.5, 0.7], [0, 3.31, 0], TEAL);
  p.box([2.2, 0.3, 0.72], [0, 3.71, 0], TEAL);
  p.box([0.62, 0.62, 0.78], [0, 3.62, 0], MUSTARD);
  for (const x of [-1.2, -0.45, 0.45, 1.2]) p.box([0.22, 0.1, 0.22], [x, 3.92 - (Math.abs(x) > 1 ? 0.3 : 0), 0], MINT);
  p.done();

  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 40),
    new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  swirl.position.set(0, 1.62, 0);
  root.add(swirl);

  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin.partMaterial('#fff1b0', { emissive: true }), SPARKS);
  sparks.frustumCulled = false;
  root.add(sparks);

  const glow = new THREE.PointLight(0xffb24a, 2.2, 6, 1.6);
  glow.position.set(0, 1.6, 0.6);
  root.add(glow);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== swirl) o.receiveShadow = true;
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let open = 1;
  let t = 0;
  return {
    root,
    setOpen(k) {
      open = k;
    },
    update(dt) {
      t += dt;
      swirl.rotation.z = -t * 1.6;
      const s = Math.max(0.001, open * (1 + Math.sin(t * 3) * 0.03));
      swirl.scale.set(s, s, 1);
      glow.intensity = 2.2 * open;
      for (let i = 0; i < SPARKS; i++) {
        const a = t * 1.3 + (i / SPARKS) * Math.PI * 2;
        const r = 1.18 + Math.sin(t * 2 + i) * 0.08;
        pos.set(Math.cos(a) * r, 1.62 + Math.sin(a) * r, 0.05 + Math.sin(t * 3 + i) * 0.1);
        const k = open * (0.7 + 0.3 * Math.sin(t * 5 + i * 2));
        scl.set(k, k, k);
        sparks.setMatrixAt(i, m.compose(pos, q, scl));
      }
      sparks.instanceMatrix.needsUpdate = true;
    },
  };
}
