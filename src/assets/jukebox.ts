/**
 * The jukebox: a tall coral toy music cabinet with a rounded arched top. A cream front carries a
 * running arch of round warm lights that cycle their colours; inside the arch a mustard-framed
 * window shows a black record turning under a little steel arm, below it a row of chunky buttons, a
 * grille with mustard slats that thump on the beat, a coin slot and the power bulb. Origin at the
 * floor centre of the 2×2 footprint, front towards +Z; glows are own emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { SONG_COLOURS, SONG_IDS } from '../content/music';
import type { BuildingModel, PowerView } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, pool } from './villages';

const VINYL = '#1d1a19';
const GROOVE = '#3a3532';
const MUSTARD_DARK = '#c98f1c';
const GLASS = '#cfeff2';

/** Where the arch's circle sits, and the front of the cabinet. */
const ARCH_Y = 1.35;
const FRONT = 0.6;
const LIGHT_R = 0.7;
/** The window's sides, its sill and where its round top begins; the record's centre. */
const WIN_W = 0.46;
const WIN_Y = 1.0;
const WIN_TOP = 1.4;
const RECORD_Y = 1.38;
const BUTTONS = 5;

/** The arch's colours, warm and round again. */
const ARCH = ['#ffd23a', '#ff9a3c', '#e8463a', '#ee6a82', '#ffd98a', '#7fe0c8'].map((c) => new THREE.Color(c));
/** The record's label for each song. */
const SONG = SONG_IDS.map((id) => new THREE.Color(SONG_COLOURS[id]));
const C_LABEL = new THREE.Color(CORAL);
/** The card asks for no power: playing, its bulb shows as if the network had enough. */
const SELF_FED: PowerView = { linked: true, on: true, low: false, charge: 0, sunYaw: 0, sunUp: 0 };

const beatFrac = (beat: number): number => beat - Math.floor(beat);

/** An arch outline in the XY plane: straight sides from y0 to y1, a half circle on top. */
function arch<T extends THREE.Path>(s: T, w: number, y0: number, y1: number): T {
  s.moveTo(-w, y0);
  s.lineTo(w, y0);
  s.lineTo(w, y1);
  s.absarc(0, y1, w, 0, Math.PI, false);
  s.lineTo(-w, y0);
  return s;
}

const slab = (shape: THREE.Shape, depth: number, bevel = 0): THREE.BufferGeometry =>
  new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 24, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });

/** The bulbs' spots up the left side, over the arch and down the right. */
function lightSpots(): [number, number][] {
  const spots: [number, number][] = [];
  for (let i = 0; i < 5; i++) spots.push([-LIGHT_R, 0.55 + i * 0.16]);
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI - (i / 14) * Math.PI;
    spots.push([Math.cos(a) * LIGHT_R, ARCH_Y + Math.sin(a) * LIGHT_R]);
  }
  for (let i = 4; i >= 0; i--) spots.push([LIGHT_R, 0.55 + i * 0.16]);
  return spots;
}

export function createJukebox(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'jukebox';
  const b = new Build(skin, 'jukebox');
  root.add(b.root);
  const body = b.root;

  // the foot and the cabinet, one arched piece
  b.box([1.88, 0.12, 1.34], [0, 0.06, 0], CHARCOAL);
  b.box([1.78, 0.06, 1.28], [0, 0.15, 0], MUSTARD);
  b.geo(slab(arch(new THREE.Shape(), 0.82, 0.21, ARCH_Y), 1.14, 0.03), [0, 0, -0.57], CORAL);
  b.box([0.9, 0.9, 0.03], [0, 1.1, -0.61], CORAL_DARK);

  // the front: a cream arch for the lights, a darker one inside it
  b.geo(slab(arch(new THREE.Shape(), 0.79, 0.2, ARCH_Y), 0.05), [0, 0, FRONT], CREAM);
  b.geo(slab(arch(new THREE.Shape(), 0.6, 0.24, ARCH_Y), 0.03), [0, 0, FRONT + 0.05], CORAL_DARK);

  // the window: a dark inside, a mustard frame standing out round it, a sill under it
  b.geo(slab(arch(new THREE.Shape(), WIN_W, WIN_Y, WIN_TOP), 0.01), [0, 0, FRONT + 0.08], CHARCOAL);
  const frame = arch(new THREE.Shape(), WIN_W + 0.06, WIN_Y - 0.06, WIN_TOP);
  frame.holes.push(arch(new THREE.Path(), WIN_W, WIN_Y, WIN_TOP));
  b.geo(slab(frame, 0.1), [0, 0, FRONT + 0.08], MUSTARD);

  // the little arm that rests on the record
  b.box([0.09, 0.09, 0.05], [0.37, 1.72, FRONT + 0.11], STEEL_DARK);
  b.beam([0.37, 1.72, FRONT + 0.14], [0.17, 1.44, FRONT + 0.14], 0.03, STEEL, 0.02);
  b.box([0.05, 0.08, 0.025], [0.16, 1.42, FRONT + 0.14], CREAM, [0, 0, -0.6]);

  // the shelf with the buttons
  b.box([1.14, 0.1, 0.28], [0, 0.77, FRONT + 0.14], MUSTARD);
  b.box([1.06, 0.03, 0.26], [0, 0.71, FRONT + 0.13], MUSTARD_DARK);

  // the grille: a dark panel; the slats thump on their own
  b.box([0.92, 0.4, 0.03], [0, 0.45, FRONT + 0.09], CHARCOAL);
  const slats = new THREE.Group();
  slats.position.set(0, 0.45, FRONT + 0.1);
  body.add(slats);
  const sp = b.part('slats', slats);
  for (let i = 0; i < 5; i++) sp.box([0.84, 0.04, 0.03], [0, (i - 2) * 0.08, 0.015], MUSTARD);

  // the coin slot, opposite the bulb
  b.box([0.17, 0.22, 0.03], [-LIGHT_R, 0.33, FRONT + 0.06], MUSTARD);
  b.box([0.03, 0.13, 0.02], [-LIGHT_R, 0.33, FRONT + 0.08], CHARCOAL);

  // the record behind the glass, with a cream tick so the turning shows
  const rec = new Build(skin, 'jukebox-record');
  rec.root.position.set(0, RECORD_Y, FRONT + 0.11);
  const facing = { rot: [HP, 0, 0] as const, seg: 32 };
  rec.cyl(0.4, 0.02, [0, 0, 0], VINYL, facing);
  rec.cyl(0.34, 0.024, [0, 0, 0], GROOVE, facing);
  rec.cyl(0.29, 0.028, [0, 0, 0], VINYL, facing);
  rec.cyl(0.23, 0.032, [0, 0, 0], GROOVE, facing);
  rec.cyl(0.19, 0.036, [0, 0, 0], VINYL, facing);
  rec.cyl(0.02, 0.06, [0, 0, 0], STEEL, { rot: [HP, 0, 0], seg: 10 });
  rec.box([0.03, 0.09, 0.012], [0, 0.26, 0.018], CREAM);
  const labelMat = rec.glowGeo('label', CORAL, new THREE.CylinderGeometry(0.13, 0.13, 0.042, 24), [0, 0, 0], { rot: [HP, 0, 0] }).finish().label;
  body.add(rec.root);
  b.finish();

  // the glass over it
  const glassGeo = new THREE.ShapeGeometry(arch(new THREE.Shape(), WIN_W, WIN_Y, WIN_TOP), 24);
  const glassMat = skin.partMaterial(GLASS, { transparent: true });
  glassMat.opacity = 0.14;
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.z = FRONT + 0.17;
  body.add(glass);

  // the buttons, one instanced draw; one sinks on each beat
  const buttons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), skin.partMaterial(0xffffff), BUTTONS);
  [CORAL, MINT, MUSTARD, CREAM, CORAL].forEach((c, i) => buttons.setColorAt(i, new THREE.Color(c)));
  body.add(buttons);
  const m4 = new THREE.Matrix4();
  const press = (bt: number, wig: number): void => {
    const down = Math.floor(bt) % BUTTONS;
    const sink = 0.04 * Math.exp(-beatFrac(bt) * 4) * wig;
    for (let i = 0; i < BUTTONS; i++) buttons.setMatrixAt(i, m4.makeTranslation((i - 2) * 0.21, i === down ? 0.88 - sink : 0.88, FRONT + 0.16));
    buttons.instanceMatrix.needsUpdate = true;
  };
  press(0, 0);

  // the arch of lights: unlit round bulbs, one instanced draw, their colours run round
  const spots = lightSpots();
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  lightMat.userData.own = true;
  const bulbGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.05, 12).rotateX(HP);
  const lights = new THREE.InstancedMesh(bulbGeo, lightMat, spots.length);
  const dull = new THREE.Color('#a8926a');
  spots.forEach(([x, y], i) => {
    lights.setMatrixAt(i, m4.makeTranslation(x, y, FRONT + 0.065));
    lights.setColorAt(i, dull);
  });
  body.add(lights);

  // a soft warm pool on the ground in front
  const glow = pool(0xffd98a, 1.5, [0, 0.04, 1.05]);
  root.add(glow.mesh);

  const bulb = powerBulb(skin, body, [LIGHT_R, 0.33, FRONT + 0.05]);
  finishShadows(root);
  const col = new THREE.Color();
  const n = ARCH.length;
  const archColour = (x: number): THREE.Color => {
    const w = ((x % n) + n) % n;
    const i = Math.floor(w);
    const f = w - i;
    return col.copy(ARCH[i]).lerp(ARCH[(i + 1) % n], f * f * (3 - 2 * f));
  };
  let t = 0;
  let spin = 0;
  let lit = false;
  let last = '';
  return {
    root,
    socket: new THREE.Vector3(0, 1.7, -FRONT),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      const on = pw ? pw.on : k.playing;
      bulb.update(t, pw ?? (on ? SELF_FED : undefined));
      spin += ((on ? 3.5 : 0) - spin) * Math.min(1, dt * 3);
      rec.root.rotation.z -= dt * spin;
      const bt = k.playing ? k.beat : t * 2;
      press(bt, on ? 1 : 0);
      const live = on && k.playing;
      const thump = live ? Math.exp(-beatFrac(k.beat) * 7) : 0;
      slats.scale.set(1 + thump * 0.03, 1 + thump * 0.05, 1 + thump * 1.2);
      body.scale.set(1 + thump * 0.012, 1 - thump * 0.016, 1 + thump * 0.012);
      glow.mesh.visible = on;
      if (on) {
        lit = true;
        const pulse = 1 + 0.35 * thump;
        const run = bt * 0.5;
        for (let i = 0; i < spots.length; i++) lights.setColorAt(i, archColour(run - i * 0.24).multiplyScalar(pulse));
        lights.instanceColor!.needsUpdate = true;
        glow.mat.opacity = (0.08 + 0.42 * k.night) * (0.85 + 0.15 * thump);
      } else if (lit) {
        lit = false;
        for (let i = 0; i < spots.length; i++) lights.setColorAt(i, dull);
        lights.instanceColor!.needsUpdate = true;
      }
      const song = Math.max(0, Math.min(SONG.length - 1, k.song ?? 0));
      const key = on ? 'on' + song : 'off';
      if (key === last) return;
      last = key;
      if (on) setGlow(labelMat, SONG[song], 0.9);
      else setGlow(labelMat, C_LABEL, 0);
    },
  };
}
