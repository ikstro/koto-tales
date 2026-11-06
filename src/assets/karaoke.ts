/**
 * The karaoke stage: a low coral stage heroes walk onto, with a round mustard spot and a ball
 * microphone on a steel stand in the middle. At the back a small blue screen on two posts shows a
 * ball bouncing along a row of dots, which light as it passes (no words), and two little speakers
 * thump in the corners. A row of stage bulbs along the front edge glows softly and chases on the
 * beat while the party sings. Origin at the floor centre of the 3×2 footprint, front towards +Z;
 * the screen, dots and bulbs are own glow, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, STEEL, STEEL_DARK, TAU, powerBulb, setGlow } from './buildingParts';
import { Build, HP, finishShadows, mergeCached, pool, tint } from './villages';

const DARK = '#1d1a19';
const GREY = '#4a4440';
const MUSTARD_DARK = '#c98f1c';
const SCREEN = '#1f56b0';

/** The stage's top: heroes walk on it, so it stays flat and low. */
const STAGE = 0.1;
const MIC_Z = 0.12;
const LAMPS = 11;
/** The screen's middle and front; its row of dots. */
const SCREEN_Y = 1.14;
const SCREEN_Z = -0.76;
const DOTS = 5;
const DOT_Y = 0.94;
const DOT_STEP = 0.24;

const C_SCREEN = new THREE.Color(SCREEN);
const C_SCREEN_OFF = new THREE.Color('#2c3442');
const C_DOT = new THREE.Color('#ffe3a3');
const C_DOT_DONE = new THREE.Color('#ffd23a');
const C_DOT_OFF = new THREE.Color('#3a3f4c');
const C_LAMP_OFF = new THREE.Color('#a8926a');
const C_LAMP_SOFT = new THREE.Color('#d9a860');
const C_LAMP_DIM = new THREE.Color('#7a6340');
const CHASE = ['#ffd23a', '#ff6a4a', '#7fe0c8'].map((c) => new THREE.Color(c));

const beatFrac = (beat: number): number => beat - Math.floor(beat);
/** A disc standing on its back, facing +Z (r0 towards the front). */
const facing = (r0: number, r1: number, h: number, seg = 20): THREE.BufferGeometry => new THREE.CylinderGeometry(r0, r1, h, seg).rotateX(HP);

/** An unlit material of its own, so a small lamp stays bright by day. */
function lit(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  m.userData.own = true;
  return m;
}

export function createKaraoke(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'karaoke';
  const b = new Build(skin, 'karaoke');
  root.add(b.root);

  // the stage: a dark skirt, a coral top with its board seams, a mustard edge
  b.box([2.94, 0.08, 1.94], [0, 0.04, 0], CHARCOAL);
  b.box([2.86, 0.02, 1.86], [0, STAGE - 0.01, 0], CORAL);
  for (const z of [-0.62, -0.31, 0, 0.31, 0.62]) b.box([2.86, 0.004, 0.02], [0, STAGE + 0.001, z], CORAL_DARK);
  b.box([2.9, 0.025, 0.2], [0, STAGE - 0.012, 0.86], CHARCOAL);
  b.box([2.92, 0.02, 0.03], [0, STAGE - 0.01, 0.745], MUSTARD);
  // the singer's spot
  b.cyl(0.56, 0.008, [0, STAGE + 0.002, MIC_Z], MUSTARD, { seg: 32 });
  b.cyl(0.44, 0.012, [0, STAGE + 0.002, MIC_Z], CREAM, { seg: 32 });

  // the screen on its posts, a frame round it, a shelf between the posts for the bulb
  for (const s of [-1, 1]) {
    b.box([0.09, 0.66, 0.09], [s * 0.62, STAGE + 0.33, SCREEN_Z - 0.05], STEEL_DARK);
    b.box([0.24, 0.05, 0.24], [s * 0.62, STAGE + 0.025, SCREEN_Z - 0.05], CHARCOAL);
  }
  b.box([1.42, 0.86, 0.08], [0, SCREEN_Y, SCREEN_Z - 0.05], CHARCOAL);
  b.box([1.48, 0.05, 0.1], [0, SCREEN_Y + 0.44, SCREEN_Z - 0.05], MUSTARD);
  b.box([1.48, 0.05, 0.1], [0, SCREEN_Y - 0.44, SCREEN_Z - 0.05], MUSTARD);
  b.box([1.15, 0.26, 0.05], [0, 0.4, SCREEN_Z - 0.05], CHARCOAL);
  b.box([1.15, 0.03, 0.07], [0, 0.54, SCREEN_Z - 0.05], MUSTARD_DARK);
  // the box behind the screen the wire hangs from
  b.box([0.2, 0.2, 0.06], [0, SCREEN_Y + 0.1, SCREEN_Z - 0.12], STEEL_DARK);

  // the two speakers in the back corners
  for (const s of [-1, 1]) {
    const x = s * 1.2;
    b.box([0.46, 0.74, 0.4], [x, STAGE + 0.37, -0.72], CHARCOAL);
    b.box([0.5, 0.05, 0.44], [x, STAGE + 0.76, -0.72], MUSTARD);
    b.box([0.38, 0.66, 0.02], [x, STAGE + 0.37, -0.515], '#3a3532');
    b.geo(facing(0.06, 0.06, 0.03, 12), [x, STAGE + 0.63, -0.505], CORAL);
  }

  // the screen's face: it glows on its own
  const faceMat = b.glowBox('face', SCREEN, [1.28, 0.74, 0.02], [0, SCREEN_Y, SCREEN_Z]).finish().face;

  // the speakers' cones
  const coneGeo = mergeCached('karaoke/cone', [
    tint(facing(0.16, 0.16, 0.04), DARK),
    tint(facing(0.11, 0.135, 0.05).translate(0, 0, 0.03), GREY),
    tint(facing(0.05, 0.055, 0.05, 12).translate(0, 0, 0.05), CREAM),
  ]);
  const cones = [-1, 1].map((s) => {
    const m = new THREE.Mesh(coneGeo, b.kit.vertexColourMaterial(false));
    m.position.set(s * 1.2, STAGE + 0.3, -0.495);
    b.root.add(m);
    return m;
  });

  // the microphone: a base, a pole, a dark grip, a round head with a steel band
  const mic = new Build(skin, 'karaoke-mic');
  mic.root.position.set(0, STAGE, MIC_Z);
  mic.cyl(0.2, 0.035, [0, 0.03, 0], CHARCOAL, { seg: 20 });
  mic.cyl(0.13, 0.03, [0, 0.055, 0], STEEL_DARK, { seg: 20 });
  mic.cyl(0.024, 0.95, [0, 0.52, 0], STEEL, { seg: 10 });
  mic.cyl(0.045, 0.05, [0, 0.72, 0], STEEL_DARK, { seg: 10 });
  mic.cyl(0.036, 0.2, [0, 1.06, 0], CHARCOAL, { r1: 0.056, seg: 12 });
  mic.cyl(0.075, 0.035, [0, 1.17, 0], CORAL, { seg: 14 });
  mic.ball(0.115, [0, 1.27, 0], GREY, { seg: 16 });
  mic.cyl(0.118, 0.03, [0, 1.27, 0], STEEL, { seg: 18 });
  mic.finish();
  b.root.add(mic.root);

  // the dots and the ball on the screen, unlit so they stay bright
  const m4 = new THREE.Matrix4();
  const dotX = (i: number): number => (i - (DOTS - 1) / 2) * DOT_STEP;
  const dots = new THREE.InstancedMesh(facing(0.05, 0.05, 0.015, 14), lit(), DOTS);
  for (let i = 0; i < DOTS; i++) {
    dots.setMatrixAt(i, m4.makeTranslation(dotX(i), DOT_Y, SCREEN_Z + 0.018));
    dots.setColorAt(i, C_DOT_OFF);
  }
  b.root.add(dots);
  const ballMat = lit();
  ballMat.color.set(CORAL);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), ballMat);
  ball.visible = false;
  b.root.add(ball);

  // the stage bulbs along the front edge: low domes, one instanced draw
  const dome = new THREE.SphereGeometry(0.085, 12, 5, 0, TAU, 0, HP).scale(1, 0.32, 1);
  const lamps = new THREE.InstancedMesh(dome, lit(), LAMPS);
  for (let i = 0; i < LAMPS; i++) {
    lamps.setMatrixAt(i, m4.makeTranslation(-1.3 + (i * 2.6) / (LAMPS - 1), STAGE - 0.005, 0.86));
    lamps.setColorAt(i, C_LAMP_OFF);
  }
  b.root.add(lamps);

  // a soft pool round the singer's spot
  const glow = pool(0xffd98a, 1.7, [0, STAGE + 0.03, MIC_Z]);
  root.add(glow.mesh);

  const bulb = powerBulb(skin, b.root, [0.4, 0.38, SCREEN_Z - 0.03]);
  finishShadows(root);
  let t = 0;
  let last = -9;
  let lastDot = -9;
  return {
    root,
    socket: new THREE.Vector3(0, SCREEN_Y + 0.1, SCREEN_Z - 0.15),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      const singing = on && !!k.busy;
      const thump = on && k.playing ? Math.exp(-beatFrac(k.beat) * 7) : 0;
      for (const c of cones) c.scale.set(1 + thump * 0.08, 1 + thump * 0.08, 1 + thump * 1.2);
      mic.root.rotation.z = singing ? Math.sin(k.beat * Math.PI) * 0.035 : 0;

      // the bulbs: -2 dark, -1 soft, else the step of the chase
      const step = !on ? -2 : singing ? Math.floor(k.beat * 2) % 3 : -1;
      if (step !== last) {
        last = step;
        for (let i = 0; i < LAMPS; i++) {
          if (step === -2) lamps.setColorAt(i, C_LAMP_OFF);
          else if (step === -1) lamps.setColorAt(i, C_LAMP_SOFT);
          else lamps.setColorAt(i, i % 3 === step ? CHASE[(i + step) % 3] : C_LAMP_DIM);
        }
        lamps.instanceColor!.needsUpdate = true;
      }

      // the ball hops from dot to dot, on the beat while they sing, slowly otherwise
      ball.visible = on;
      const bt = singing ? k.beat : t * 0.7;
      const hops = DOTS - 1;
      const at = ((Math.floor(bt) % hops) + hops) % hops;
      if (on) {
        const f = beatFrac(bt);
        ball.position.set(dotX(at) + f * DOT_STEP, DOT_Y + 0.11 + Math.sin(f * Math.PI) * 0.26, SCREEN_Z + 0.04);
      }
      const dotKey = on ? at : -1;
      if (dotKey !== lastDot) {
        lastDot = dotKey;
        for (let i = 0; i < DOTS; i++) dots.setColorAt(i, !on ? C_DOT_OFF : i <= at ? C_DOT_DONE : C_DOT);
        dots.instanceColor!.needsUpdate = true;
        if (on) setGlow(faceMat, C_SCREEN, 0.75);
        else setGlow(faceMat, C_SCREEN_OFF, 0);
      }

      glow.mesh.visible = on;
      if (on) glow.mat.opacity = (0.03 + 0.3 * k.night) * (singing ? 0.8 + 0.2 * thump : 0.45);
    },
  };
}
