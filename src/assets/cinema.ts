/**
 * The cinema under the stars: a big screen in a charcoal frame on two wooden posts, coral curtains
 * tied back at its sides, a mustard pelmet with a row of little warm bulbs and a teal board under
 * it, all on a wooden deck. In front stands a small mint projector on a stool with its lens to the
 * screen and two reels on top facing the audience. `k.film` is the url of a tale's picture: it is
 * loaded once, centred on a warm dark screen, keeps its shape and fades in; the reels turn and a
 * soft beam and a warm pool show. With no film, or no power, the screen is plain dark blue. Origin
 * at the floor centre of the 3×1 footprint, front towards +Z; glows are unlit or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, STEEL, STEEL_DARK, TAU, TEAL, WOOD, WOOD_DARK, glowMaterial, powerBulb } from './buildingParts';
import { Build, HP, finishShadows, fx, mergeCached, place, pool, tint } from './villages';

const FRAME_Z = -0.24;
const SCREEN_Y = 1.9;
const SCREEN_W = 2.2;
const SCREEN_H = 1.66;
const SCREEN_Z = FRAME_Z + 0.065;
const PICTURE = 1.5;
const STOOL_Z = 0.25;
const STOOL_H = 0.5;
const REEL_Y = 1.02;
const BULBS = 9;
const PELMET_Y = 2.88;
/** How fast the picture fades (a whole fade in this many seconds). */
const FADE = 0.7;

const DARK_BLUE = new THREE.Color('#16284e');
const WARM_DARK = new THREE.Color('#2c1a12');
const LIT = new THREE.Color('#ffd98a');
const DULL = new THREE.Color('#a8926a');

const loader = new THREE.TextureLoader();
/** An empty picture: the material's shader stays the same when a real one comes in. */
const NOTHING = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
NOTHING.colorSpace = THREE.SRGBColorSpace;
NOTHING.needsUpdate = true;

const reelGeo = (): THREE.BufferGeometry => {
  const parts = [tint(place(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), [0, 0, 0], { rot: [HP, 0, 0] }), CHARCOAL)];
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    parts.push(tint(place(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), [Math.sin(a) * 0.09, Math.cos(a) * 0.09, 0], { rot: [HP, 0, 0] }), CREAM));
  }
  parts.push(tint(place(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), [0, 0, 0], { rot: [HP, 0, 0] }), MUSTARD));
  return mergeCached('cinema/reel', parts, true);
};

/** A soft wedge of light from the lens to the screen, bright at the lens, nothing at the screen. */
function beamGeo(): THREE.BufferGeometry {
  const lens = [0, 0.74, STOOL_Z - 0.22];
  const w = SCREEN_W / 2 - 0.1;
  const y0 = SCREEN_Y - SCREEN_H / 2 + 0.1;
  const y1 = SCREEN_Y + SCREEN_H / 2 - 0.1;
  const z = SCREEN_Z + 0.03;
  const corners = [
    [-w, y0, z],
    [w, y0, z],
    [w, y1, z],
    [-w, y1, z],
  ];
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < 4; i++) {
    pos.push(...lens, ...corners[i], ...corners[(i + 1) % 4]);
    col.push(1, 1, 1, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function createCinema(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'cinema';
  const b = new Build(skin, 'cinema');
  root.add(b.root);

  // the deck and the two posts
  b.box([2.96, 0.1, 0.96], [0, 0.05, 0], WOOD_DARK);
  for (let i = 0; i < 5; i++) b.box([0.54, 0.03, 0.9], [-1.18 + i * 0.59, 0.105, 0], WOOD);
  for (const s of [-1, 1]) {
    b.box([0.2, 2.86, 0.2], [s * 1.36, 1.5, FRAME_Z], WOOD);
    b.box([0.3, 0.14, 0.3], [s * 1.36, 0.17, FRAME_Z], CORAL_DARK);
  }

  // the frame, the board under it, the pelmet with its top bar
  b.box([2.56, 1.92, 0.1], [0, SCREEN_Y, FRAME_Z], CHARCOAL);
  b.box([2.56, 0.08, 0.14], [0, SCREEN_Y - 0.97, FRAME_Z], MUSTARD);
  b.box([2.52, 0.8, 0.08], [0, 0.52, FRAME_Z], TEAL);
  b.box([2.52, 0.08, 0.1], [0, 0.72, FRAME_Z], CREAM);
  b.box([2.96, 0.2, 0.26], [0, PELMET_Y, FRAME_Z + 0.02], MUSTARD);
  b.box([2.96, 0.05, 0.3], [0, PELMET_Y - 0.11, FRAME_Z + 0.02], CORAL);

  // the curtains: pleats either side, tied back
  for (const s of [-1, 1]) {
    [1.22, 1.13].forEach((x, i) => b.box([0.1, 1.84, 0.1], [s * x, SCREEN_Y - 0.02, FRAME_Z + 0.09], i ? CORAL_DARK : CORAL));
    b.box([0.24, 0.07, 0.14], [s * 1.17, 1.44, FRAME_Z + 0.1], MUSTARD);
  }

  // the stool and the projector
  b.cyl(0.19, 0.07, [0, STOOL_H - 0.03, STOOL_Z], CORAL, { seg: 12 });
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + (i * TAU) / 3;
    b.beam([Math.sin(a) * 0.16, 0.12, STOOL_Z + Math.cos(a) * 0.16], [Math.sin(a) * 0.08, STOOL_H - 0.05, STOOL_Z + Math.cos(a) * 0.08], 0.05, WOOD_DARK);
  }
  b.box([0.42, 0.28, 0.32], [0, STOOL_H + 0.14, STOOL_Z], MINT);
  b.box([0.44, 0.05, 0.34], [0, STOOL_H + 0.3, STOOL_Z], TEAL);
  b.cyl(0.08, 0.1, [0, 0.74, STOOL_Z - 0.2], STEEL_DARK, { rot: [HP, 0, 0], seg: 10 });
  b.box([0.05, 0.22, 0.05], [-0.16, 0.9, STOOL_Z - 0.03], STEEL);
  b.box([0.05, 0.22, 0.05], [0.16, 0.9, STOOL_Z - 0.03], STEEL);
  b.finish();

  // the two reels, one instanced draw
  const reels = new THREE.InstancedMesh(reelGeo(), b.kit.vertexColourMaterial(false), 2);
  reels.castShadow = true;
  root.add(reels);
  const m4 = new THREE.Matrix4();
  const spinReels = (a: number): void => {
    reels.setMatrixAt(0, m4.makeRotationZ(a).setPosition(-0.16, REEL_Y, STOOL_Z));
    reels.setMatrixAt(1, m4.makeRotationZ(a * 1.3).setPosition(0.16, REEL_Y, STOOL_Z));
    reels.instanceMatrix.needsUpdate = true;
  };
  spinReels(0);

  // the screen itself: an unlit plane, and the picture on an unlit plane over it
  const screenMat = new THREE.MeshBasicMaterial({ color: DARK_BLUE.clone(), toneMapped: false });
  screenMat.userData.own = true;
  const screen = fx(new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat));
  screen.position.set(0, SCREEN_Y, SCREEN_Z);
  root.add(screen);
  const picMat = new THREE.MeshBasicMaterial({ map: NOTHING, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  picMat.userData.own = true;
  const picture = fx(new THREE.Mesh(new THREE.PlaneGeometry(PICTURE, PICTURE), picMat));
  picture.position.set(0, SCREEN_Y, SCREEN_Z + 0.015);
  root.add(picture);

  // the little bulbs along the pelmet
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  bulbMat.userData.own = true;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat, BULBS);
  for (let i = 0; i < BULBS; i++) {
    bulbs.setMatrixAt(i, m4.makeTranslation(-1.28 + (i * 2.56) / (BULBS - 1), PELMET_Y + 0.01, FRAME_Z + 0.16));
    bulbs.setColorAt(i, DULL);
  }
  root.add(bulbs);

  const beamMat = glowMaterial(0xffe8b0, true);
  const beam = fx(new THREE.Mesh(beamGeo(), beamMat));
  beam.visible = false;
  root.add(beam);
  const glow = pool(0xffd98a, 2.4, [0, 0.14, 1.1]);
  root.add(glow.mesh);

  const bulb = powerBulb(skin, root, [1.36, 0.62, FRAME_Z + 0.1]);
  finishShadows(root);
  reels.receiveShadow = false;

  // the film: `shown` is on the plane, `waiting` has loaded and goes up once the old one has faded
  let asked: string | null = null;
  let shown: THREE.Texture | null = null;
  let waiting: THREE.Texture | null = null;
  const fit = (tex: THREE.Texture): void => {
    const im = tex.image as { width: number; height: number };
    const r = im.width / im.height || 1;
    picture.scale.set(Math.min(1, r), Math.min(1, 1 / r), 1);
  };
  const ask = (url: string | null): void => {
    asked = url;
    waiting?.dispose();
    waiting = null;
    if (!url) return;
    loader.load(url, (tex) => {
      if (asked !== url) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      waiting = tex;
    });
  };

  const col = new THREE.Color();
  let t = 0;
  let fade = 0;
  let turn = 0;
  let key = -1;
  return {
    root,
    socket: new THREE.Vector3(1.36, 2.7, FRAME_Z),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const on = !!pw && pw.on;
      const film = k.film ?? null;
      if (film !== asked) ask(film);

      // fade down whenever something else must go up, up once the wanted picture is on
      const want = on && film !== null && !waiting && shown !== null ? 1 : 0;
      fade = want > fade ? Math.min(want, fade + dt / FADE) : Math.max(want, fade - dt / FADE);
      if (fade === 0 && waiting) {
        shown?.dispose();
        shown = waiting;
        waiting = null;
        picMat.map = shown;
        fit(shown);
      } else if (fade === 0 && shown && film === null) {
        shown.dispose();
        shown = null;
        picMat.map = NOTHING;
      }
      picMat.opacity = fade;
      screenMat.color.copy(DARK_BLUE).lerp(WARM_DARK, fade);
      beam.visible = glow.mesh.visible = fade > 0.01;
      if (fade > 0.01) {
        beamMat.opacity = 0.1 * fade;
        glow.mat.opacity = (0.1 + 0.3 * k.night) * fade;
        turn += dt * 2.4;
        spinReels(turn);
      }

      // the pelmet bulbs: from dusk on, a slow run; one in three a little brighter
      const lit = on ? Math.min(1, Math.max(0, (k.night - 0.08) / 0.25)) : 0;
      const step = Math.floor(t * 2) % 3;
      const now = lit > 0.01 ? step * 100 + Math.round(lit * 20) : 0;
      if (now === key) return;
      key = now;
      for (let i = 0; i < BULBS; i++) {
        col.copy(DULL).lerp(LIT, lit * (i % 3 === step ? 1 : 0.7));
        bulbs.setColorAt(i, col);
      }
      bulbs.instanceColor!.needsUpdate = true;
    },
  };
}
