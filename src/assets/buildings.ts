/**
 * Models of the kit's buildings (content/buildings.ts) and the portal pair. Toy
 * pieces in the skin's plastic, origin at the floor centre, front towards +Z.
 * Each model animates itself from `update`; the systems only move and show it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingId } from '../content/buildings';
import { Kit, type Paint, type V3 } from './parts/kit';
import {
  CORAL, CORAL_DARK, CREAM, INK, WOOD, MUSTARD, TEAL, MINT, CHARCOAL, STEEL, STEEL_DARK, SOLAR_BLUE, SOLAR_BLUE_LIGHT,
  WOOD_DARK, WARM, TAU, C_WARM, C_WARM_SOFT, C_CORAL, C_OFF, ownGlow, setGlow, powerBulb, markShadows, octagon, fadeDisc,
  glowMaterial, stepped,
} from './buildingParts';
import { createBigSpeaker, createDanceFloor, createDiscoBall, createDjConsole, createTesla, createTrafficLight } from './disco';

/** How a building's power network is doing (systems/power.ts), for its lights and motion. */
export interface PowerView {
  /** Joined to a network at all. */
  linked: boolean;
  /** The network has enough: it works and its bulb is lit. */
  on: boolean;
  /** The network is short: everything on it blinks. */
  low: boolean;
  /** A battery's charge, 0..1. */
  charge: number;
  /** Where the sun is: compass yaw (radians, 0 = +Z) and height 0..1 (0 = set). */
  sunYaw: number;
  sunUp: number;
}

/** What a standing building is told every frame. */
export interface BuildingTick {
  /** Music time in beats (the song's own tempo); `playing` = its music is on (or, for the rest, music is near). */
  beat: number;
  playing: boolean;
  /** 0 = day … 1 = deep night. */
  night: number;
  power?: PowerView;
  /** A traffic light's colour: 0 green, 1 yellow, 2 red. */
  signal?: 0 | 1 | 2;
  /** A tesla tower: seconds since it last struck (Infinity: not yet). */
  zap?: number;
  /** The DJ's song: 0 disco, 1 rock, 2 happy, 3 lullaby. */
  song?: number;
  /** Heroes' feet (world) — a dance floor lights the tiles under them. */
  feet?: THREE.Vector3[];
}

export interface BuildingModel {
  root: THREE.Group;
  update(dt: number, k: BuildingTick): void;
  /** Where wires hang from, in the model's own space (before it is turned). */
  socket?: THREE.Vector3;
  /** A tesla tower's ball, where its lightning starts (model space). */
  tip?: THREE.Vector3;
}

export function createBuilding(skin: Skin, id: BuildingId): BuildingModel {
  switch (id) {
    case 'tent':
      return createTent(skin);
    case 'boombox':
      return createBoombox(skin);
    case 'windmill':
      return createWindmill(skin);
    case 'pole':
      return createPole(skin);
    case 'lamp':
      return createLamp(skin);
    case 'solar':
      return createSolar(skin);
    case 'battery':
      return createBattery(skin);
    case 'generator':
      return createGenerator(skin);
    case 'bigspeaker':
      return createBigSpeaker(skin);
    case 'dancefloor':
      return createDanceFloor(skin);
    case 'discoball':
      return createDiscoBall(skin);
    case 'djconsole':
      return createDjConsole(skin);
    case 'tesla':
      return createTesla(skin);
    case 'trafficlight':
      return createTrafficLight(skin);
    default:
      return createLanternGhost();
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
  lcdMat.userData.own = true;
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
  const model = createBuilding(skin, id);
  const g = model.root;
  // where its wires would hang (the kit shows them while the ghost walks along)
  g.userData.socket = model.socket;
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

// ─── the power buildings (DESIGN.md «Power») ────────────────────────────────

/** The windmill: a steel lattice mast, a cream nacelle, three coral blades, a tail vane. */
function createWindmill(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'windmill';
  const kit = new Kit('windmill', skin);
  const p = kit.part('mast', root);
  const LEG0 = 0.3;
  const LEG1 = 0.14;
  const half = (y: number): number => LEG0 + ((LEG1 - LEG0) * (y - 0.2)) / 3.8;
  p.box([0.9, 0.24, 0.9], [0, 0.12, 0], STEEL_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.beam([sx * LEG0, 0.2, sz * LEG0], [sx * LEG1, 4.0, sz * LEG1], 0.09, STEEL);
  const levels = [0.35, 1.1, 1.85, 2.6, 3.35, 4.0];
  levels.forEach((y, i) => {
    const h = half(y);
    for (const s of [-1, 1]) {
      p.box([2 * h, 0.07, 0.07], [0, y, s * h], CREAM);
      p.box([0.07, 0.07, 2 * h], [s * h, y, 0], CREAM);
    }
    if (i === levels.length - 1) return;
    const y1 = levels[i + 1];
    const h1 = half(y1);
    const flip = i % 2 ? -1 : 1;
    for (const s of [-1, 1]) {
      p.beam([-flip * h, y, s * h], [flip * h1, y1, s * h1], 0.05, STEEL_DARK);
      p.beam([s * h, y, -flip * h], [s * h1, y1, flip * h1], 0.05, STEEL_DARK);
    }
  });
  // top plate, nacelle, nose and tail
  p.box([0.42, 0.12, 0.42], [0, 4.06, 0], STEEL_DARK);
  p.box([0.4, 0.4, 0.9], [0, 4.32, 0.04], CREAM);
  p.box([0.3, 0.3, 0.08], [0, 4.32, 0.52], CORAL);
  p.box([0.44, 0.06, 0.5], [0, 4.55, 0.0], CORAL);
  p.beam([0, 4.3, -0.4], [0, 4.36, -0.85], 0.08, STEEL);
  p.box([0.05, 0.46, 0.4], [0, 4.52, -0.85], CORAL);
  p.box([0.06, 0.12, 0.3], [0, 4.7, -0.85], CREAM);
  // a plate by the door for the bulb: the bulb sits on the base
  p.done();

  const rotor = new THREE.Group();
  rotor.position.set(0, 4.32, 0.66);
  root.add(rotor);
  const r = kit.part('rotor', rotor);
  r.box([0.24, 0.24, 0.2], [0, 0, 0], CORAL);
  r.box([0.14, 0.14, 0.1], [0, 0, 0.14], MUSTARD);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const at = (d: number, z: number): V3 => [-Math.sin(a) * d, Math.cos(a) * d, z];
    r.box([0.26, 1.4, 0.05], at(0.85, 0.03 * (i % 2 ? -1 : 1)), CORAL, [0, 0, a]);
    r.box([0.27, 0.42, 0.06], at(1.37, 0.03 * (i % 2 ? -1 : 1)), CREAM, [0, 0, a]);
    r.box([0.05, 1.2, 0.09], at(0.8, 0.03 * (i % 2 ? -1 : 1)), CORAL_DARK, [0, 0, a]);
  }
  r.done();

  const bulb = powerBulb(skin, root, [0.1, 0.12, 0.45]);
  markShadows(root);
  let t = 0;
  return {
    root,
    socket: new THREE.Vector3(0, 2.0, 0.24),
    update(dt, k) {
      t += dt;
      rotor.rotation.z -= dt * TAU;
      bulb.update(t, k.power);
    },
  };
}

/** The pole: a wooden pole with a crossarm and two cream insulators. */
function createPole(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'pole';
  const kit = new Kit('pole', skin);
  const p = kit.part('pole', root);
  p.box([0.34, 0.2, 0.34], [0, 0.1, 0], WOOD_DARK);
  p.box([0.18, 3.1, 0.18], [0, 1.75, 0], WOOD);
  p.box([0.22, 0.06, 0.22], [0, 3.33, 0], STEEL_DARK);
  p.box([1.1, 0.1, 0.12], [0, 2.82, 0], WOOD_DARK);
  for (const s of [-1, 1]) {
    p.beam([s * 0.05, 2.45, 0], [s * 0.38, 2.78, 0], 0.07, WOOD_DARK);
    p.box([0.1, 0.17, 0.1], [s * 0.42, 2.96, 0], CREAM);
    p.box([0.14, 0.05, 0.14], [s * 0.42, 3.07, 0], CORAL);
    p.box([0.12, 0.05, 0.12], [s * 0.42, 2.9, 0], MINT);
  }
  // a junction knob on the crossarm where the wire is hung
  p.box([0.12, 0.12, 0.12], [0, 2.95, 0.14], MUSTARD);
  // a bit of the pole's wear: two steel straps
  for (const y of [1.0, 2.2]) p.box([0.21, 0.07, 0.21], [0, y, 0], STEEL_DARK);
  p.done();
  const bulb = powerBulb(skin, root, [0, 0.62, 0.09]);
  markShadows(root);
  let t = 0;
  return {
    root,
    socket: new THREE.Vector3(0, 2.98, 0.14),
    update(dt, k) {
      t += dt;
      bulb.update(t, k.power);
    },
  };
}

/** The street lamp: a teal pole with an arm and a lamp head; its glass glows when the network is fed. */
function createLamp(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'lamp';
  const kit = new Kit('lamp', skin);
  const p = kit.part('pole', root);
  p.box([0.4, 0.16, 0.4], [0, 0.08, 0], CHARCOAL);
  p.box([0.28, 0.1, 0.28], [0, 0.21, 0], STEEL_DARK);
  p.box([0.14, 3.2, 0.14], [0, 1.78, 0], TEAL);
  for (const y of [0.5, 1.6, 2.9]) p.box([0.19, 0.1, 0.19], [0, y, 0], MINT);
  p.box([0.2, 0.08, 0.2], [0, 3.44, 0], CHARCOAL);
  p.box([0.1, 0.1, 0.8], [0, 3.3, 0.4], CHARCOAL);
  p.beam([0, 2.75, 0.05], [0, 3.27, 0.5], 0.06, TEAL);
  // the head: hood, glass window below, bottom plate
  p.box([0.44, 0.07, 0.44], [0, 3.37, 0.8], CHARCOAL);
  p.box([0.3, 0.07, 0.3], [0, 3.44, 0.8], TEAL);
  p.box([0.36, 0.04, 0.36], [0, 3.11, 0.8], STEEL_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.04, 0.2, 0.04], [sx * 0.17, 3.21, 0.8 + sz * 0.17], CHARCOAL);
  p.done();
  const glassMat = ownGlow(skin, '#ffd98a');
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.3), glassMat);
  glass.position.set(0, 3.21, 0.8);
  root.add(glass);

  const haloMat = glowMaterial(0xffc866);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), haloMat);
  halo.position.copy(glass.position);
  halo.visible = false;
  const poolMat = glowMaterial(0xffb85a, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pool = new THREE.Mesh(fadeDisc(2.1), poolMat);
  pool.position.set(0, 0.04, 0.7);
  pool.visible = false;
  root.add(halo, pool);

  const bulb = powerBulb(skin, root, [0, 0.86, 0.07]);
  markShadows(root);
  halo.receiveShadow = false;
  pool.receiveShadow = false;
  let t = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(0, 3.5, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const lit = !!pw && pw.linked && (pw.low ? Math.floor(t * 6) % 2 === 0 : pw.on);
      const night = k.night;
      const key = lit ? 'on' + Math.round(night * 20) : 'off';
      bulb.update(t, pw);
      if (key === last) return;
      last = key;
      if (lit) {
        setGlow(glassMat, C_WARM_SOFT, 0.35 + 0.65 * night);
        haloMat.opacity = 0.06 + 0.3 * night;
        poolMat.opacity = 0.7 * night;
      } else {
        setGlow(glassMat, C_OFF, 0);
        haloMat.opacity = 0;
        poolMat.opacity = 0;
      }
      halo.visible = lit && haloMat.opacity > 0.01;
      pool.visible = lit && poolMat.opacity > 0.01;
    },
  };
}

/** The solar panel: a stand with a cream-framed panel of blue cells that follows the sun. */
function createSolar(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'solar';
  const kit = new Kit('solar', skin);
  const PIVOT = 0.74;
  const p = kit.part('stand', root);
  p.box([1.3, 0.14, 1.0], [0, 0.07, 0], CHARCOAL);
  p.box([1.1, 0.06, 0.8], [0, 0.17, 0], STEEL_DARK);
  p.box([0.2, PIVOT - 0.2, 0.2], [0, 0.2 + (PIVOT - 0.2) / 2, 0], STEEL);
  p.box([0.3, 0.12, 0.3], [0, PIVOT - 0.12, 0], STEEL_DARK);
  // the junction box the wire hangs from
  p.box([0.26, 0.2, 0.12], [0.0, 0.36, 0.17], CHARCOAL);
  p.box([0.26, 0.05, 0.14], [0.0, 0.48, 0.17], MUSTARD);
  p.done();

  const yawG = new THREE.Group();
  yawG.position.set(0, PIVOT, 0);
  const tiltG = new THREE.Group();
  yawG.add(tiltG);
  root.add(yawG);
  const q = kit.part('panel', tiltG);
  q.box([1.8, 0.08, 1.3], [0, 0, 0], CREAM);
  q.box([1.5, 0.05, 1.05], [0, -0.065, 0], CHARCOAL);
  q.box([1.8, 0.1, 0.07], [0, 0.03, 0.615], CREAM);
  q.box([1.8, 0.1, 0.07], [0, 0.03, -0.615], CREAM);
  q.box([0.07, 0.1, 1.3], [0.865, 0.03, 0], CREAM);
  q.box([0.07, 0.1, 1.3], [-0.865, 0.03, 0], CREAM);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      q.box([0.36, 0.04, 0.31], [-0.6 + i * 0.4, 0.045, -0.37 + j * 0.37], (i + j) % 2 ? SOLAR_BLUE : SOLAR_BLUE_LIGHT);
    }
  }
  q.done();

  const bulb = powerBulb(skin, root, [-0.4, 0.07, 0.5]);
  markShadows(root);
  let yaw = 0;
  let tilt = 0;
  let t = 0;
  const smooth = (e0: number, e1: number, x: number): number => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  return {
    root,
    socket: new THREE.Vector3(0, 0.5, 0.25),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const up = pw ? pw.sunUp : 0;
      if (pw && up > 0.03) {
        const target = pw.sunYaw - root.rotation.y;
        const d = ((((target - yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
        yaw += d * Math.min(1, dt * 2.2);
      }
      const want = smooth(0.02, 0.15, up) * (1.1 + (0.15 - 1.1) * up);
      tilt += (want - tilt) * Math.min(1, dt * 2.2);
      yawG.rotation.y = yaw;
      tiltG.rotation.x = tilt;
      bulb.update(t, pw);
    },
  };
}

/** The battery: a charcoal toy cell with a coral band, a mustard «+» and five studs that show the charge. */
function createBattery(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'battery';
  const kit = new Kit('battery', skin);
  const p = kit.part('cell', root);
  p.box([0.88, 0.1, 0.68], [0, 0.05, 0], STEEL_DARK);
  p.box([0.78, 1.3, 0.58], [0, 0.75, 0], CHARCOAL);
  p.box([0.83, 0.26, 0.63], [0, 1.12, 0], CORAL);
  p.box([0.83, 0.05, 0.63], [0, 0.93, 0], CORAL_DARK);
  p.box([0.26, 0.86, 0.03], [0, 0.55, 0.295], '#1d1a19');
  // the terminal and a mustard plus
  p.box([0.22, 0.1, 0.22], [0, 1.45, 0], STEEL_DARK);
  p.box([0.38, 0.1, 0.12], [0, 1.55, 0], MUSTARD);
  p.box([0.12, 0.1, 0.38], [0, 1.55, 0], MUSTARD);
  p.done();

  const on = skin.partMaterial(WARM, { emissive: true });
  const low = skin.partMaterial('#ff6a4a', { emissive: true });
  const off = skin.partMaterial('#4a4440');
  const studGeo = new THREE.BoxGeometry(0.15, 0.11, 0.05);
  const studs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(studGeo, off);
    s.position.set(0, 0.2 + i * 0.16, 0.33);
    root.add(s);
    studs.push(s);
  }
  const bulb = powerBulb(skin, root, [0.27, 0.17, 0.29]);
  markShadows(root);
  let t = 0;
  let shown = -1;
  return {
    root,
    socket: new THREE.Vector3(0, 1.62, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const charge = pw ? pw.charge : 0;
      const n = Math.ceil(Math.min(1, Math.max(0, charge)) * 5 - 0.0001);
      if (n !== shown) {
        shown = n;
        studs.forEach((s, i) => {
          s.material = i < n ? (charge < 0.25 ? low : on) : off;
        });
      }
      bulb.update(t, pw);
    },
  };
}

/** A cog: a disc with `teeth` boxes round it, flat along Z. */
function gearGeo(r: number, teeth: number, thick: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(r, r, thick, 14).rotateX(Math.PI / 2)];
  const w = ((TAU * r) / teeth) * 0.5;
  for (let i = 0; i < teeth; i++) {
    parts.push(new THREE.BoxGeometry(0.09, w, thick).translate(r + 0.02, 0, 0).rotateZ((i / teeth) * TAU));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((x) => x.dispose());
  return g;
}

const SMOKE = 6;

/** The engine generator: a coral engine on a steel skid, a spinning flywheel, two meshing cogs, a puffing chimney. */
function createGenerator(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'generator';
  const kit = new Kit('generator', skin);
  const skid = kit.part('skid', root);
  skid.box([1.9, 0.14, 1.5], [0, 0.07, 0], STEEL_DARK);
  for (const sx of [-1, 1]) skid.box([0.14, 0.1, 1.54], [sx * 0.88, 0.17, 0], STEEL);
  skid.done();

  const body = new THREE.Group();
  root.add(body);
  const p = kit.part('engine', body);
  p.box([1.1, 0.8, 0.8], [-0.2, 0.54, 0], CORAL);
  p.box([1.14, 0.1, 0.84], [-0.2, 0.2, 0], CORAL_DARK);
  p.box([1.14, 0.08, 0.84], [-0.2, 0.9, 0], CORAL_DARK);
  for (const x of [-0.55, -0.2]) {
    p.box([0.28, 0.26, 0.4], [x, 1.07, 0], CHARCOAL);
    p.box([0.2, 0.06, 0.3], [x, 1.23, 0], CREAM);
  }
  // chimney at the back left
  p.box([0.18, 0.62, 0.18], [-0.6, 1.25, -0.3], CHARCOAL);
  p.box([0.26, 0.07, 0.26], [-0.6, 1.58, -0.3], STEEL_DARK);
  // shaft to the flywheel and a control plate with two dials
  p.box([0.3, 0.14, 0.14], [0.45, 0.75, 0], STEEL);
  p.box([0.34, 0.26, 0.04], [0.12, 0.6, 0.41], '#1d1a19');
  p.box([0.09, 0.09, 0.03], [0.04, 0.62, 0.44], CREAM);
  p.box([0.09, 0.09, 0.03], [0.2, 0.62, 0.44], CORAL);
  // the junction box the wire hangs from
  p.box([0.24, 0.14, 0.24], [0.1, 1.01, 0.2], CHARCOAL);
  p.box([0.26, 0.05, 0.26], [0.1, 1.1, 0.2], MUSTARD);
  p.done();

  // flywheel: a ring with mustard spokes and a cream weight, turning about X
  const wheel = new THREE.Group();
  wheel.position.set(0.62, 0.78, 0);
  body.add(wheel);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 22).rotateY(Math.PI / 2), skin.partMaterial(CHARCOAL));
  ring.castShadow = true;
  wheel.add(ring);
  const w = kit.part('wheel', wheel);
  w.box([0.12, 0.1, 0.86], [0, 0, 0], MUSTARD);
  w.box([0.12, 0.86, 0.1], [0, 0, 0], MUSTARD);
  w.box([0.2, 0.22, 0.22], [0, 0, 0], CORAL);
  w.box([0.16, 0.15, 0.15], [0.02, 0.42, 0], CREAM);
  w.done();

  // two meshing cogs on the front of the block
  const NA = 8;
  const NB = 6;
  const gA = new THREE.Mesh(gearGeo(0.2, NA, 0.06), skin.partMaterial(MUSTARD));
  gA.position.set(-0.56, 0.44, 0.43);
  const gB = new THREE.Mesh(gearGeo(0.155, NB, 0.06), skin.partMaterial(CREAM));
  gB.position.set(-0.14, 0.44, 0.43);
  gA.castShadow = gB.castShadow = true;
  body.add(gA, gB);

  // smoke: little grey cubes rising and shrinking away
  const smoke = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#bdb8b0'), SMOKE);
  smoke.frustumCulled = false;
  root.add(smoke);

  const bulb = powerBulb(skin, root, [0.7, 0.07, 0.75]);
  markShadows(root);
  const m = new THREE.Matrix4();
  const qn = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let t = 0;
  let angA = 0;
  return {
    root,
    socket: new THREE.Vector3(0.1, 1.14, 0.2),
    update(dt, k) {
      t += dt;
      body.position.set(Math.sin(t * 53) * 0.007, Math.abs(Math.sin(t * 37)) * 0.012, 0);
      wheel.rotation.x += dt * 7;
      angA += dt * 2.4;
      gA.rotation.z = angA;
      gB.rotation.z = Math.PI / NB - (angA * NA) / NB;
      for (let i = 0; i < SMOKE; i++) {
        const life = (t * 0.55 + i / SMOKE) % 1;
        pos.set(-0.6 + life * 0.35 + Math.sin(t * 2 + i * 2) * 0.05, 1.7 + life * 1.2, -0.3);
        const s = 0.08 + 0.22 * Math.sin(Math.PI * life) ** 0.7;
        scl.set(s, s, s);
        qn.setFromEuler(e.set(life * 2 + i, life * 3, 0));
        smoke.setMatrixAt(i, m.compose(pos, qn, scl));
      }
      smoke.instanceMatrix.needsUpdate = true;
      bulb.update(t, k.power);
    },
  };
}

// ─── the lighthouse ─────────────────────────────────────────────────────────

export interface LighthouseModel {
  root: THREE.Group;
  /** Where wires hang from: a junction box by the door. */
  socket: THREE.Vector3;
  update(dt: number, k: { lit: boolean; low: boolean; night: number }): void;
}

/** A long tapered fan of light along +Z whose brightness dies away towards the far end (additive). */
function beamGeometry(len: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, 12, 6, true);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.55, 1);
  g.translate(0, 0, len / 2);
  const pos = g.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.pow(1 - pos.getZ(i) / len, 1.4);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/**
 * The lighthouse by the water: a stepped octagonal tower in cream and coral, a dark door, a teal
 * balcony with a railing, a glass lamp room with a lamp that turns, a mustard dome and a spike.
 * Lit: the lamp glows and two beams sweep round (stronger at night); short of power it blinks.
 */
export function createLighthouse(skin: Skin): LighthouseModel {
  const root = new THREE.Group();
  root.name = 'lighthouse';
  const kit = new Kit('lighthouse', skin);
  const p = kit.part('tower', root);
  const STONE = '#d7c08c';
  p.box([2.9, 0.22, 2.9], [0, 0.11, 0], '#c4ab78');
  p.box([2.5, 0.18, 2.5], [0, 0.31, 0], STONE);
  const RING_H = 1.15;
  const ringS = (i: number): number => 2.2 - 0.13 * i;
  for (let i = 0; i < 6; i++) octagon(p, ringS(i), RING_H, 0.4 + i * RING_H, i % 2 ? CORAL : CREAM);
  const front = (y: number): number => ringS(Math.min(5, Math.max(0, Math.floor((y - 0.4) / RING_H)))) / 2;
  // the door at the base and two slit windows
  p.box([0.62, 0.92, 0.05], [0, 0.86, 1.1], CHARCOAL);
  p.box([0.5, 0.8, 0.06], [0, 0.82, 1.12], INK);
  p.box([0.38, 0.14, 0.06], [0, 1.27, 1.12], INK);
  p.box([0.12, 0.1, 0.08], [0.17, 0.78, 1.15], MUSTARD);
  for (const y of [3.0, 5.0]) {
    p.box([0.26, 0.42, 0.04], [0, y, front(y) + 0.01], CHARCOAL);
    p.box([0.17, 0.34, 0.06], [0, y, front(y) + 0.02], INK);
  }
  // the junction box by the door
  p.box([0.3, 0.34, 0.24], [0.9, 0.57, 1.15], CHARCOAL);
  p.box([0.32, 0.06, 0.26], [0.9, 0.77, 1.15], MUSTARD);

  // the balcony and its railing
  const BY = 7.3;
  octagon(p, 2.5, 0.2, BY, TEAL);
  const RR = 1.15 / Math.cos(Math.PI / 8);
  const rv = (k: number): V3 => {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    return [RR * Math.sin(a), 0, RR * Math.cos(a)];
  };
  for (let k = 0; k < 8; k++) {
    const a = rv(k);
    const b = rv(k + 1);
    p.box([0.09, 0.4, 0.09], [a[0], BY + 0.4, a[2]], TEAL);
    p.beam([a[0], BY + 0.58, a[2]], [b[0], BY + 0.58, b[2]], 0.07, TEAL);
    p.beam([a[0], BY + 0.34, a[2]], [b[0], BY + 0.34, b[2]], 0.05, MINT);
  }

  // the lamp room: glass panels between slim posts, a pedestal inside, the roof and the dome
  const LY = BY + 0.2;
  const LH = 1.2;
  const glass: Paint = { c: '#cfeff2', clear: true };
  const LA = 0.8;
  const LR = LA / Math.cos(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    p.box([0.663, LH, 0.04], [LA * Math.sin(a), LY + LH / 2, LA * Math.cos(a)], glass, [0, a, 0]);
    const v = Math.PI / 8 + a;
    p.box([0.07, LH + 0.04, 0.07], [LR * Math.sin(v), LY + LH / 2, LR * Math.cos(v)], CHARCOAL);
  }
  p.box([0.5, 0.35, 0.5], [0, LY + 0.175, 0], CHARCOAL);
  p.box([1.9, 0.12, 1.9], [0, LY + LH + 0.06, 0], CHARCOAL, [0, Math.PI / 8, 0]);
  const RY = LY + LH + 0.12;
  octagon(p, 1.7, 0.18, RY, MUSTARD);
  octagon(p, 1.25, 0.2, RY + 0.18, MUSTARD);
  octagon(p, 0.75, 0.2, RY + 0.38, MUSTARD);
  p.box([0.08, 0.5, 0.08], [0, RY + 0.83, 0], CHARCOAL);
  p.box([0.16, 0.16, 0.16], [0, RY + 1.14, 0], CORAL);
  p.done();

  // the lamp and its beams turn together
  const turret = new THREE.Group();
  turret.position.set(0, LY + 0.35 + 0.28, 0);
  root.add(turret);
  const lampMat = ownGlow(skin, '#ffd98a');
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), lampMat);
  turret.add(core);
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.07), lampMat);
    lens.position.z = s * 0.2;
    turret.add(lens);
  }
  const beamMat = glowMaterial(0xfff0c0, true);
  const beamGeo = beamGeometry(9, 0.1, 1.1);
  const beams = new THREE.Group();
  for (const s of [0, 1]) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.y = s * Math.PI;
    b.frustumCulled = false;
    beams.add(b);
  }
  beams.visible = false;
  turret.add(beams);
  const haloMat = glowMaterial(0xffc866);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), haloMat);
  halo.visible = false;
  turret.add(halo);

  markShadows(root);
  beams.traverse((o) => (o.receiveShadow = false));
  halo.receiveShadow = false;
  let t = 0;
  return {
    root,
    socket: new THREE.Vector3(0.9, 0.8, 1.15),
    update(dt, k) {
      t += dt;
      const blink = Math.floor(t * 6) % 2 === 0;
      const on = k.lit && (!k.low || blink);
      if (on) setGlow(lampMat, C_WARM_SOFT, 0.7 + 0.5 * k.night);
      else setGlow(lampMat, C_OFF, 0);
      const swing = k.lit && !k.low;
      beams.visible = swing;
      beamMat.opacity = 0.1 + 0.5 * k.night;
      turret.rotation.y = -(t * TAU) / 6;
      haloMat.opacity = on ? 0.1 + 0.3 * k.night : 0;
      halo.visible = on;
    },
  };
}

// ─── the boat and the bridge ────────────────────────────────────────────────

/** A little toy rowing boat: coral hull, cream rim, a wooden seat and two oars; bobs on the waterline. */
export function createBoat(skin: Skin): { root: THREE.Group; update(dt: number): void } {
  const root = new THREE.Group();
  root.name = 'boat';
  const body = new THREE.Group();
  root.add(body);
  const p = new Kit('boat', skin).part('boat', body);
  p.box([0.9, 0.14, 1.9], [0, -0.1, -0.05], CORAL_DARK);
  p.box([0.4, 0.1, 1.5], [0, -0.22, -0.05], CORAL_DARK);
  p.box([1.0, 0.18, 0.12], [0, 0.0, -1.0], CORAL);
  // the walls follow the outline: stern, sides, a pointed bow
  const out: V3[] = [
    [-0.56, 0, -1.0],
    [-0.6, 0, 0.4],
    [0, 0, 1.35],
    [0.6, 0, 0.4],
    [0.56, 0, -1.0],
  ];
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    p.beam([a[0], 0.06, a[2]], [b[0], 0.06, b[2]], 0.17, CORAL);
    p.beam([a[0], 0.2, a[2]], [b[0], 0.2, b[2]], 0.17, CORAL);
    p.beam([a[0], 0.34, a[2]], [b[0], 0.34, b[2]], 0.13, CREAM);
  }
  p.beam([-0.56, 0.06, -1.0], [0.56, 0.06, -1.0], 0.17, CORAL);
  p.beam([-0.56, 0.2, -1.0], [0.56, 0.2, -1.0], 0.17, CORAL);
  p.beam([-0.56, 0.34, -1.0], [0.56, 0.34, -1.0], 0.13, CREAM);
  p.box([1.0, 0.1, 0.34], [0, 0.22, -0.1], WOOD);
  p.box([0.9, 0.08, 0.26], [0, 0.18, -0.7], WOOD);
  p.box([0.1, 0.14, 0.1], [0, 0.34, 1.3], CREAM);
  for (const s of [-1, 1]) {
    p.box([0.1, 0.14, 0.1], [s * 0.6, 0.45, 0.0], CHARCOAL);
    p.beam([s * 0.35, 0.52, 0.2], [s * 1.55, -0.02, -0.28], 0.07, WOOD);
    p.box([0.08, 0.06, 0.5], [s * 1.62, -0.03, -0.3], CREAM);
  }
  p.done();
  markShadows(root);
  let t = Math.random() * 10;
  return {
    root,
    update(dt) {
      t += dt;
      body.position.y = Math.sin(t * 1.7) * 0.04;
      body.rotation.z = Math.sin(t * 1.3) * 0.045;
      body.rotation.x = Math.sin(t * 1.1 + 1) * 0.03;
    },
  };
}

/**
 * A toy plank bridge along Z from -length/2 to +length/2, 3 wide. The deck's top is exactly
 * y = 0 (bodies walk on flat cells there); only the railings and the beams under it arch.
 */
export function createBridge(skin: Skin, length: number): THREE.Group {
  const root = new THREE.Group();
  root.name = 'bridge';
  const L = length;
  const half = L / 2;
  const p = new Kit(`bridge-${L}`, skin).part('bridge', root);
  const arch = (z: number): number => 1 - (z / half) ** 2;
  const N = Math.max(4, Math.round(L / 0.5));
  const d = L / N;
  for (let i = 0; i < N; i++) p.box([3.0, 0.14, d - 0.03], [0, -0.07, -half + d * (i + 0.5)], i % 2 ? '#a87238' : '#8a5a2b');
  // beams under the deck, arching up in the middle
  const SEG = 8;
  for (const s of [-1, 1]) {
    for (let j = 0; j < SEG; j++) {
      const z0 = -half + (L * j) / SEG;
      const z1 = -half + (L * (j + 1)) / SEG;
      p.beam([s * 1.2, -0.75 + 0.55 * arch(z0), z0], [s * 1.2, -0.75 + 0.55 * arch(z1), z1], 0.17, WOOD_DARK);
    }
  }
  // piles going down into the water
  const piles = Math.max(2, Math.round(L / 3) + 1);
  for (let k = 0; k < piles; k++) {
    const z = -half + 0.35 + (k * (L - 0.7)) / (piles - 1);
    for (const s of [-1, 1]) p.box([0.26, 2.9, 0.26], [s * 1.2, -1.55, z], WOOD);
    p.box([2.7, 0.14, 0.22], [0, -0.22, z], WOOD_DARK);
  }
  // railings: posts, a top rail (teal) and a lower rail (mint), arching up in the middle
  const posts = Math.round(L) + 1;
  const top: number[] = [];
  const zs: number[] = [];
  for (let k = 0; k < posts; k++) {
    const z = -half + 0.2 + (k * (L - 0.4)) / (posts - 1);
    const h = 0.8 + 0.22 * arch(z);
    zs.push(z);
    top.push(h);
    for (const s of [-1, 1]) {
      p.box([0.13, h, 0.13], [s * 1.4, h / 2, z], TEAL);
      if (k === 0 || k === posts - 1) p.box([0.2, 0.1, 0.2], [s * 1.4, h + 0.05, z], CREAM);
    }
  }
  for (let k = 0; k < posts - 1; k++) {
    for (const s of [-1, 1]) {
      p.beam([s * 1.4, top[k] - 0.04, zs[k]], [s * 1.4, top[k + 1] - 0.04, zs[k + 1]], 0.1, TEAL);
      p.beam([s * 1.4, top[k] * 0.45, zs[k]], [s * 1.4, top[k + 1] * 0.45, zs[k + 1]], 0.07, MINT);
    }
  }
  p.done();
  markShadows(root);
  return root;
}
