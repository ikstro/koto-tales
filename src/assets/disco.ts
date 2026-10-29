/**
 * The disco and defence buildings (content/buildings.ts, stage B2): big speaker, dance
 * floor, disco ball, DJ console, tesla tower, traffic light. Same conventions as
 * buildings.ts: toy pieces, origin at the floor centre of the footprint, front towards +Z,
 * every model animates itself from `update`. Every one has the power bulb; parts that only
 * show while it works are hidden when `power` is missing (ghosts are built from these).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { Kit } from './parts/kit';
import {
  CORAL,
  CREAM,
  MINT,
  MUSTARD,
  CHARCOAL,
  STEEL,
  STEEL_DARK,
  C_OFF,
  ownGlow,
  setGlow,
  powerBulb,
  markShadows,
  fadeDisc,
  glowMaterial,
} from './buildingParts';

// ─── shared bits ────────────────────────────────────────────────────────────

const PARTY = ['#e8463a', '#ffd23a', '#59b3ab', '#6fb7ff', '#ee6a82'].map((c) => new THREE.Color(c));
const DARK = '#1d1a19';
const GREY = '#4a4440';

/** Merges geometries, each baked with its own vertex colour (one mesh, one draw). */
function coloured(parts: [THREE.BufferGeometry, string][]): THREE.BufferGeometry {
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

const disc = (r0: number, r1: number, h: number, seg = 20): THREE.BufferGeometry => new THREE.CylinderGeometry(r0, r1, h, seg);
/** A disc standing on its back, facing +Z. */
const facing = (r0: number, r1: number, h: number, seg = 20): THREE.BufferGeometry => disc(r0, r1, h, seg).rotateX(Math.PI / 2);

/** A speaker cone: dark ring, cone, cap, facing +Z; centred on its ring. */
function coneGeo(r: number, cap: string): THREE.BufferGeometry {
  return cached(`cone/${r}/${cap}`, () =>
    coloured([
      [facing(r, r, 0.06), DARK],
      [facing(r * 0.72, r * 0.84, 0.05).translate(0, 0, 0.02), GREY],
      [facing(r * 0.3, r * 0.3, 0.05, 14).translate(0, 0, 0.045), cap],
    ]),
  );
}

const beatFrac = (beat: number): number => beat - Math.floor(beat);

// ─── the big speaker ────────────────────────────────────────────────────────

const DUST = 4;
const LEDS = 5;

/** A tall charcoal tower speaker: bass, mid and tweeter cones that thump, a colour-cycling LED strip, dust hopping on top. */
export function createBigSpeaker(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'bigspeaker';
  const body = new THREE.Group();
  root.add(body);
  const kit = new Kit('bigspeaker', skin);
  const p = kit.part('cabinet', body);
  p.box([0.98, 0.1, 0.8], [0, 0.05, 0], DARK);
  p.box([0.86, 2.4, 0.7], [0, 1.3, 0], CHARCOAL);
  p.box([0.74, 2.2, 0.03], [0, 1.3, 0.355], '#3a3532');
  p.box([0.5, 0.8, 0.02], [0, 1.3, -0.36], DARK);
  // mustard trim: the cap on top, a band under it and the corner strips
  p.box([0.94, 0.1, 0.78], [0, 2.55, 0], MUSTARD);
  p.box([0.88, 0.04, 0.72], [0, 2.48, 0], '#c98f1c');
  for (const sx of [-1, 1]) p.box([0.04, 2.3, 0.04], [sx * 0.44, 1.3, 0.34], MUSTARD);
  p.done();

  const mat = kit.vertexColourMaterial(false);
  const cones: { g: THREE.Mesh; k: number }[] = [];
  for (const [y, r, cap, k] of [
    [0.95, 0.31, CREAM, 1.0],
    [1.62, 0.2, MUSTARD, 0.7],
    [2.1, 0.11, CORAL, 0.45],
  ] as const) {
    const m = new THREE.Mesh(coneGeo(r, cap), mat);
    m.position.set(0, y, 0.37);
    m.castShadow = true;
    body.add(m);
    cones.push({ g: m, k });
  }

  // LED strip at the base: unlit tiles, one instanced draw, colours cycle on the beat
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  ledMat.userData.own = true;
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), ledMat, LEDS);
  const m4 = new THREE.Matrix4();
  const off = new THREE.Color('#3a3532');
  for (let i = 0; i < LEDS; i++) {
    leds.setMatrixAt(i, m4.makeTranslation((i - 2) * 0.13, 0.27, 0.385));
    leds.setColorAt(i, off);
  }
  body.add(leds);

  // dust on the top that hops on the beat
  const dust = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#d8d0c0'), DUST);
  dust.frustumCulled = false;
  dust.visible = false;
  root.add(dust);

  const bulb = powerBulb(skin, body, [0.25, 0.45, 0.37]);
  markShadows(root);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let t = 0;
  let lastBeat = -1;
  let ledOn = false;
  return {
    root,
    socket: new THREE.Vector3(0, 2.3, -0.37),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const on = !!pw && pw.on;
      bulb.update(t, pw);
      const live = on && k.playing;
      const frac = beatFrac(k.beat);
      const thump = live ? Math.exp(-frac * 7) : 0;
      for (const c of cones) c.g.scale.set(1 + thump * 0.1 * c.k, 1 + thump * 0.1 * c.k, 1 + thump * 1.1 * c.k);
      body.scale.set(1 + thump * 0.02, 1 - thump * 0.025, 1 + thump * 0.02);
      const b = Math.floor(k.beat);
      if (on && (b !== lastBeat || !ledOn)) {
        lastBeat = b;
        ledOn = true;
        for (let i = 0; i < LEDS; i++) leds.setColorAt(i, k.playing ? PARTY[(b + i) % PARTY.length] : PARTY[0]);
        leds.instanceColor!.needsUpdate = true;
      } else if (!on && ledOn) {
        ledOn = false;
        for (let i = 0; i < LEDS; i++) leds.setColorAt(i, off);
        leds.instanceColor!.needsUpdate = true;
      }
      dust.visible = live;
      if (!live) return;
      for (let i = 0; i < DUST; i++) {
        const f = beatFrac(k.beat + i * 0.25);
        const hop = Math.sin(Math.min(1, f * 2.2) * Math.PI) * (0.14 + 0.05 * (i % 2));
        pos.set(-0.27 + i * 0.18, 2.63 + hop, ((i * 5) % 3) * 0.12 - 0.12);
        scl.setScalar(0.07);
        q.setFromEuler(e.set(f * 4 + i, f * 3, 0));
        dust.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      dust.instanceMatrix.needsUpdate = true;
    },
  };
}

// ─── the dance floor ────────────────────────────────────────────────────────

const PITCH = 0.94;

/** A low dark platform with nine unlit tiles that light in changing patterns on the beat; the one under each hero glows brightest. */
export function createDanceFloor(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'dancefloor';
  const kit = new Kit('dancefloor', skin);
  const p = kit.part('platform', root);
  p.box([3, 0.1, 3], [0, 0.05, 0], CHARCOAL);
  for (const s of [-1, 1]) {
    p.box([3, 0.15, 0.08], [0, 0.075, s * 1.46], GREY);
    p.box([0.08, 0.15, 2.84], [s * 1.46, 0.075, 0], GREY);
    for (const sx of [-1, 1]) if (!(s === 1 && sx === 1)) p.box([0.16, 0.19, 0.16], [sx * 1.42, 0.095, s * 1.42], MUSTARD);
  }
  // the corner post that carries the bulb
  p.box([0.2, 0.7, 0.2], [1.38, 0.5, 1.38], CHARCOAL);
  p.box([0.26, 0.08, 0.26], [1.38, 0.89, 1.38], MUSTARD);
  p.box([0.26, 0.08, 0.26], [1.38, 0.17, 1.38], MUSTARD);
  p.done();

  const tileMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  tileMat.userData.own = true;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), tileMat, 9);
  const m4 = new THREE.Matrix4();
  const dimA = new THREE.Color('#44585a');
  const dimB = new THREE.Color('#3a4b4d');
  const dim = (i: number): THREE.Color => ((i % 3) + Math.floor(i / 3)) % 2 === 0 ? dimA : dimB;
  for (let i = 0; i < 9; i++) {
    tiles.setMatrixAt(i, m4.makeTranslation(((i % 3) - 1) * PITCH, 0.125, (Math.floor(i / 3) - 1) * PITCH));
    tiles.setColorAt(i, dim(i));
  }
  root.add(tiles);

  const bulb = powerBulb(skin, root, [1.38, 0.5, 1.48]);
  markShadows(root);
  tiles.receiveShadow = false;
  const col = new THREE.Color();
  const local = new THREE.Vector3();
  const white = new THREE.Color(1, 1, 1);
  let t = 0;
  let wasOn = false;
  return {
    root,
    socket: new THREE.Vector3(1.38, 0.97, 1.38),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      if (!pw || !pw.on) {
        if (wasOn) {
          wasOn = false;
          for (let i = 0; i < 9; i++) tiles.setColorAt(i, dim(i));
          tiles.instanceColor!.needsUpdate = true;
        }
        return;
      }
      wasOn = true;
      const beat = k.playing ? k.beat : t * 2;
      const b = Math.floor(beat);
      const flash = Math.exp(-(beat - b) * 3.5);
      const pat = Math.floor(b / 4) % 4;
      // which tiles are under the heroes
      let under = 0;
      if (k.feet && k.feet.length) {
        root.updateWorldMatrix(true, false);
        for (const f of k.feet) {
          local.copy(f);
          root.worldToLocal(local);
          const ix = Math.round(local.x / PITCH) + 1;
          const iz = Math.round(local.z / PITCH) + 1;
          if (ix >= 0 && ix < 3 && iz >= 0 && iz < 3 && Math.abs(local.x) < 1.5 && Math.abs(local.z) < 1.5) under |= 1 << (iz * 3 + ix);
        }
      }
      for (let i = 0; i < 9; i++) {
        const x = i % 3;
        const z = Math.floor(i / 3);
        let c = -1;
        if (pat === 0) c = (x + z * 2 + b) % 5;
        else if (pat === 1) c = (x + z + b) % 2 === 0 ? b % 5 : -1;
        else if (pat === 2) c = (b % 2 === 0) === (x === 1 && z === 1) ? (b + (x === 1 && z === 1 ? 0 : 2)) % 5 : -1;
        else c = z === b % 3 ? b % 5 : (x + b) % 3 === 0 ? (b + 2) % 5 : -1;
        if (c < 0) col.copy(dim(i)).multiplyScalar(1.15);
        else col.copy(PARTY[c]).multiplyScalar(0.5 + 0.5 * flash);
        if (under & (1 << i)) {
          if (c < 0) col.copy(PARTY[(i + b) % 5]);
          col.multiplyScalar(1.5).lerp(white, 0.3);
        }
        tiles.setColorAt(i, col);
      }
      tiles.instanceColor!.needsUpdate = true;
    },
  };
}

// ─── the disco ball ─────────────────────────────────────────────────────────

const SPOTS = 11;

/** A slim stand holding a spinning faceted mirror ball; when fed, coloured spots circle on the ground (stronger at night). */
export function createDiscoBall(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'discoball';
  const kit = new Kit('discoball', skin);
  const p = kit.part('stand', root);
  p.box([0.7, 0.12, 0.7], [0, 0.06, 0], CHARCOAL);
  p.box([0.5, 0.06, 0.5], [0, 0.15, 0], STEEL_DARK);
  p.box([0.14, 2.6, 0.14], [0, 1.45, -0.3], STEEL);
  for (const y of [0.6, 1.5, 2.4]) p.box([0.19, 0.08, 0.19], [0, y, -0.3], MUSTARD);
  p.box([0.2, 0.08, 0.2], [0, 2.78, -0.3], STEEL_DARK);
  p.box([0.1, 0.1, 0.4], [0, 2.74, -0.1], STEEL);
  p.box([0.04, 0.12, 0.04], [0, 2.69, 0.0], STEEL_DARK);
  // the control box with the bulb
  p.box([0.36, 0.44, 0.24], [0, 0.34, 0.1], DARK);
  p.box([0.38, 0.05, 0.26], [0, 0.58, 0.1], CORAL);
  p.done();

  // the ball: a flat-shaded icosahedron with each facet a little different
  const ballGeo = cached('discoball/ball', () => {
    const g = new THREE.IcosahedronGeometry(0.4, 1).toNonIndexed();
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    const tone = ['#f4f6f8', '#d3d9e0', '#ffe3a3', '#b3bcc6', '#e6eaee'].map((c) => new THREE.Color(c));
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) {
      const c = tone[(f * 7 + (f >> 2)) % tone.length];
      for (let v = 0; v < 3; v++) {
        a[(f * 3 + v) * 3] = c.r;
        a[(f * 3 + v) * 3 + 1] = c.g;
        a[(f * 3 + v) * 3 + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.computeBoundingSphere();
    return g;
  });
  const ball = new THREE.Mesh(ballGeo, kit.vertexColourMaterial(false));
  ball.position.set(0, 2.25, 0);
  ball.rotation.x = 0.25;
  ball.castShadow = true;
  root.add(ball);

  // coloured spots on the ground: one instanced additive draw, colours fixed per spot
  const spotMat = glowMaterial(0xffffff, true);
  spotMat.polygonOffset = true;
  spotMat.polygonOffsetFactor = -2;
  const spots = new THREE.InstancedMesh(fadeDisc(0.6), spotMat, SPOTS);
  spots.frustumCulled = false;
  spots.visible = false;
  for (let i = 0; i < SPOTS; i++) spots.setColorAt(i, PARTY[i % PARTY.length]);
  root.add(spots);

  const bulb = powerBulb(skin, root, [0, 0.34, 0.22]);
  markShadows(root);
  spots.receiveShadow = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let t = 0;
  let spin = 0;
  return {
    root,
    socket: new THREE.Vector3(0, 2.0, -0.37),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const on = !!pw && pw.on;
      bulb.update(t, pw);
      spin += ((on ? 1.3 : 0) - spin) * Math.min(1, dt * 2);
      ball.rotation.y += dt * spin;
      spots.visible = on;
      if (!on) return;
      spotMat.opacity = 0.22 + 0.6 * k.night;
      const pulse = k.playing ? Math.exp(-beatFrac(k.beat) * 5) * 0.2 : 0;
      for (let i = 0; i < SPOTS; i++) {
        const a = t * (0.3 + (i % 3) * 0.13) * (i % 2 ? 1 : -1) + i * 1.7;
        const r = 1.5 + (((i * 37) % 100) / 100) * 3.4 + Math.sin(t * 0.7 + i) * 0.25;
        pos.set(Math.cos(a) * r, 0.03, Math.sin(a) * r);
        scl.set(0.8 + 0.35 * (i % 4) + pulse, 1, 0.8 + 0.35 * (i % 4) + pulse);
        spots.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      spots.instanceMatrix.needsUpdate = true;
    },
  };
}

// ─── the DJ console ─────────────────────────────────────────────────────────

const SONG = ['#e8463a', '#8a5cd6', '#ffd23a', '#6fb7ff'].map((c) => new THREE.Color(c));

/** A desk with two spinning records, a mixer whose sliders wiggle on the beat, a screen showing the song's colour and headphones. */
export function createDjConsole(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'djconsole';
  const kit = new Kit('djconsole', skin);
  const p = kit.part('desk', root);
  p.box([1.9, 0.06, 0.84], [0, 0.03, 0], DARK);
  p.box([1.84, 0.76, 0.8], [0, 0.44, 0], CHARCOAL);
  p.box([1.96, 0.1, 0.92], [0, 0.87, 0], '#3a3532');
  p.box([1.96, 0.03, 0.94], [0, 0.805, 0], MUSTARD);
  p.box([1.84, 0.08, 0.02], [0, 0.62, 0.41], CORAL);
  p.box([1.0, 0.26, 0.02], [-0.3, 0.3, 0.41], DARK);
  for (let i = 0; i < 5; i++) p.box([0.04, 0.2, 0.025], [-0.7 + i * 0.2, 0.3, 0.415], GREY);
  // two platters with their tonearms
  for (const s of [-1, 1]) {
    p.box([0.7, 0.07, 0.7], [s * 0.62, 0.955, 0.05], STEEL_DARK);
    p.box([0.06, 0.05, 0.06], [s * 0.62 + s * 0.27, 1.0, -0.22], STEEL);
    p.beam([s * 0.89, 1.02, -0.22], [s * 0.77, 1.02, 0.1], 0.03, STEEL);
  }
  // the mixer
  p.box([0.42, 0.06, 0.74], [0, 0.95, 0.03], CHARCOAL);
  for (const x of [-0.12, 0, 0.12]) p.box([0.03, 0.02, 0.34], [x, 0.985, 0.1], DARK);
  p.box([0.3, 0.02, 0.03], [0, 0.985, 0.33], DARK);
  for (const x of [-0.1, 0.1]) p.box([0.07, 0.05, 0.07], [x, 0.99, -0.2], CREAM);
  // the screen's foot and the headphones (coral cups, a steel band)
  p.box([0.2, 0.14, 0.1], [0, 0.99, -0.34], CHARCOAL);
  for (const s of [-1, 1]) {
    p.box([0.1, 0.2, 0.2], [-0.72 + s * 0.22, 1.02, -0.36], CORAL);
    p.box([0.05, 0.14, 0.06], [-0.72 + s * 0.22, 1.19, -0.36], STEEL_DARK);
  }
  p.box([0.5, 0.05, 0.06], [-0.72, 1.26, -0.36], STEEL_DARK);
  p.done();

  // records: black discs with a coral label and a cream tick so the spin shows
  const recGeo = cached('djconsole/record', () =>
    coloured([
      [disc(0.29, 0.29, 0.03), DARK],
      [disc(0.22, 0.22, 0.034), '#2a2623'],
      [disc(0.1, 0.1, 0.04), CORAL],
      [new THREE.BoxGeometry(0.03, 0.045, 0.07).translate(0, 0, 0.055), CREAM],
      [disc(0.015, 0.015, 0.06), STEEL],
    ]),
  );
  const records: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(recGeo, kit.vertexColourMaterial(false));
    r.position.set(s * 0.62, 1.005, 0.05);
    r.castShadow = true;
    root.add(r);
    records.push(r);
  }

  // sliders: three faders and a cross-fader as one instanced draw
  const knobs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.05, 0.06), skin.partMaterial(0xffffff), 4);
  const knobCol = [CORAL, MINT, MUSTARD, CREAM].map((c) => new THREE.Color(c));
  knobCol.forEach((c, i) => knobs.setColorAt(i, c));
  root.add(knobs);
  const m4 = new THREE.Matrix4();

  // the screen, tilted towards the player
  const screenG = new THREE.Group();
  screenG.position.set(0, 1.1, -0.33);
  screenG.rotation.x = -0.35;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.06), skin.partMaterial(CHARCOAL));
  bezel.castShadow = true;
  const screenMat = ownGlow(skin, '#ffd23a');
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.02), screenMat);
  screen.position.z = 0.035;
  screenG.add(bezel, screen);
  root.add(screenG);

  const bulb = powerBulb(skin, root, [0.8, 0.3, 0.4]);
  markShadows(root);
  let t = 0;
  let spin = 0;
  let last = '';
  const place = (bt: number, wig: number): void => {
    for (let i = 0; i < 3; i++) {
      const z = 0.1 + Math.sin(bt * Math.PI * (1 + i * 0.5) + i * 1.3) * 0.12 * wig;
      knobs.setMatrixAt(i, m4.makeTranslation(-0.12 + i * 0.12, 1.01, z));
    }
    knobs.setMatrixAt(3, m4.makeTranslation(Math.sin(bt * Math.PI * 0.5) * 0.1 * wig, 1.01, 0.33));
    knobs.instanceMatrix.needsUpdate = true;
  };
  place(0, 0);
  return {
    root,
    socket: new THREE.Vector3(0, 0.6, -0.45),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const on = !!pw && pw.on;
      bulb.update(t, pw);
      spin += ((on ? 3.5 : 0) - spin) * Math.min(1, dt * 3);
      records[0].rotation.y -= dt * spin;
      records[1].rotation.y += dt * spin * 0.9;
      place(k.playing ? k.beat : t * 2, on ? 1 : 0);
      const song = Math.max(0, Math.min(3, k.song ?? 0));
      const key = on ? 'on' + song : 'off';
      if (key === last) return;
      last = key;
      if (on) setGlow(screenMat, SONG[song], 0.9);
      else setGlow(screenMat, C_OFF, 0);
    },
  };
}

// ─── the tesla tower ────────────────────────────────────────────────────────

const SPARKS = 10;
const BALL_Y = 3.8;
const C_BALL = new THREE.Color('#e6eaee');
const C_BALL_HOT = new THREE.Color('#bfe4ff');

/** A toy tesla coil: a stack of copper rings under a big silver ball; crackles when fed, flashes when it strikes. */
export function createTesla(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'tesla';
  const kit = new Kit('tesla', skin);
  const p = kit.part('base', root);
  p.box([0.96, 0.14, 0.96], [0, 0.07, 0], DARK);
  p.box([0.86, 0.2, 0.86], [0, 0.24, 0], CHARCOAL);
  p.box([0.9, 0.05, 0.9], [0, 0.365, 0], MUSTARD);
  // feet bolts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.1, 0.06, 0.1], [sx * 0.38, 0.17, sz * 0.38], STEEL);
  p.done();

  // the coil: a steel core with copper rings, narrowing upwards; neck and collar
  const coilGeo = cached('tesla/coil', () => {
    const parts: [THREE.BufferGeometry, string][] = [[disc(0.17, 0.2, 3.0, 12).translate(0, 1.9, 0), STEEL_DARK]];
    for (let i = 0; i < 12; i++) {
      const r = 0.38 - i * 0.012;
      parts.push([disc(r, r, 0.12, 14).translate(0, 0.52 + i * 0.2, 0), i % 2 ? '#b8643c' : '#d98a55']);
    }
    parts.push([disc(0.3, 0.38, 0.1, 14).translate(0, 0.43, 0), '#8a4a2a']);
    parts.push([disc(0.26, 0.26, 0.08, 14).translate(0, 2.98, 0), MUSTARD]);
    parts.push([disc(0.12, 0.12, 0.34, 10).translate(0, 3.2, 0), STEEL]);
    parts.push([disc(0.2, 0.12, 0.1, 12).translate(0, 3.4, 0), STEEL_DARK]);
    return coloured(parts);
  });
  const coil = new THREE.Mesh(coilGeo, kit.vertexColourMaterial(false));
  coil.castShadow = true;
  root.add(coil);

  const ballMat = ownGlow(skin, '#e6eaee');
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 12), ballMat);
  ball.position.set(0, BALL_Y, 0);
  ball.castShadow = true;
  root.add(ball);

  // sparks: tiny glowing streaks round the ball, jittering
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#d8f0ff', { emissive: true }), SPARKS);
  sparks.frustumCulled = false;
  sparks.visible = false;
  root.add(sparks);

  const bulb = powerBulb(skin, root, [0.22, 0.24, 0.43]);
  markShadows(root);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  let t = 0;
  let jitter = 0;
  const scatter = (reach: number): void => {
    for (let i = 0; i < SPARKS; i++) {
      dir.set(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize();
      const d = 0.4 + Math.random() * reach;
      pos.copy(dir).multiplyScalar(d).add(new THREE.Vector3(0, BALL_Y, 0));
      q.setFromUnitVectors(Z, dir);
      const s = Math.random() < 0.7 ? 1 : 0;
      scl.set(0.035, 0.035, (0.1 + Math.random() * 0.2) * s);
      sparks.setMatrixAt(i, m4.compose(pos, q, scl));
    }
    sparks.instanceMatrix.needsUpdate = true;
  };
  return {
    root,
    socket: new THREE.Vector3(-0.25, 0.4, 0.3),
    tip: new THREE.Vector3(0, BALL_Y, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const on = !!pw && pw.on;
      bulb.update(t, pw);
      sparks.visible = on;
      const zap = k.zap ?? Infinity;
      if (!on) {
        setGlow(ballMat, C_BALL, 0);
        return;
      }
      const striking = zap < 0.25;
      setGlow(ballMat, C_BALL_HOT, striking ? 0.5 + 1.4 * (1 - zap / 0.25) : 0.18 + 0.12 * Math.sin(t * 9));
      jitter -= dt;
      if (striking || jitter <= 0) {
        jitter = 0.07;
        scatter(striking ? 0.8 : 0.3);
      }
    },
  };
}

// ─── the traffic light ──────────────────────────────────────────────────────

const LAMP = [
  { lit: new THREE.Color('#ff4a3a'), dull: new THREE.Color('#5a2a26'), y: 2.78 },
  { lit: new THREE.Color('#ffd23a'), dull: new THREE.Color('#5a4a22'), y: 2.45 },
  { lit: new THREE.Color('#4ae06a'), dull: new THREE.Color('#27402b'), y: 2.12 },
];

/** A traffic light on a pole: three round lamps in a dark head; the one for the signal glows when fed, the yellow blinks when power is short. */
export function createTrafficLight(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'trafficlight';
  const kit = new Kit('trafficlight', skin);
  const p = kit.part('pole', root);
  p.box([0.5, 0.12, 0.5], [0, 0.06, 0], DARK);
  p.box([0.14, 1.9, 0.14], [0, 1.05, 0], STEEL);
  for (const y of [0.7, 1.5]) p.box([0.19, 0.08, 0.19], [0, y, 0], MUSTARD);
  p.box([0.3, 0.5, 0.24], [0, 0.37, 0], CHARCOAL);
  p.box([0.32, 0.05, 0.26], [0, 0.64, 0], CORAL);
  // the head: a dark box with a mustard frame, a hood over each lamp and a cap
  p.box([0.52, 1.12, 0.32], [0, 2.45, 0], CHARCOAL);
  p.box([0.58, 0.06, 0.38], [0, 3.01, 0], MUSTARD);
  p.box([0.58, 0.06, 0.38], [0, 1.9, 0], MUSTARD);
  for (const l of LAMP) p.box([0.36, 0.04, 0.08], [0, l.y + 0.19, 0.2], DARK);
  p.box([0.1, 0.1, 0.1], [0, 3.1, 0], STEEL_DARK);
  p.done();

  const lampGeo = cached('trafficlight/lamp', () => facing(0.16, 0.16, 0.09, 16));
  const mats = LAMP.map((l) => ownGlow(skin, '#' + l.dull.getHexString()));
  mats.forEach((m, i) => {
    const mesh = new THREE.Mesh(lampGeo, m);
    mesh.position.set(0, LAMP[i].y, 0.19);
    root.add(mesh);
  });

  const bulb = powerBulb(skin, root, [0, 0.4, 0.12]);
  markShadows(root);
  let t = 0;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(0, 3.06, 0),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      const low = !!pw && pw.linked && pw.low;
      // which lamp burns: the signal's (red 0, yellow 1, green 2 in LAMP), yellow only, or none
      const sig = k.signal ?? 0;
      const lit = low ? (Math.floor(t * 3) % 2 === 0 ? 1 : -1) : on ? (sig === 2 ? 0 : sig === 1 ? 1 : 2) : -1;
      const key = String(lit);
      if (key === last) return;
      last = key;
      mats.forEach((m, i) => {
        if (i === lit) setGlow(m, LAMP[i].lit, 1);
        else setGlow(m, LAMP[i].dull, 0);
      });
    },
  };
}
