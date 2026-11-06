/**
 * The telescope: a chunky brass spyglass in three steps, a blue lens in its wide end, a little
 * finder on top and a coral focus knob, tilted up across the front so its shape shows, in a fork
 * on a three-legged wooden tripod, and a small coral stool under the eyepiece. Tapped, it swings
 * about for a moment and its lens flashes with a thin warm glint. Origin at the floor centre of
 * the 1×1, front towards +Z; no power, the glint is additive.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, TAU, TEAL, WOOD, WOOD_DARK, glowMaterial, setGlow } from './buildingParts';
import { Build, HP, finishShadows, fx } from './villages';

const BRASS = '#dca63a';
const BRASS_DARK = '#a9751f';
const BRASS_LIGHT = '#f2cd6e';
const LENS = '#8fd0f5';

/** The pivot, how far the tube tilts up, and the lens's distance along it. */
const PIVOT_Y = 1.14;
const TILT = 0.62;
const LENS_X = 0.6;
const C_LENS = new THREE.Color(LENS);
const C_GLINT = new THREE.Color('#fff4c8');
/** How long a tap's swing lasts, and its glint, seconds. */
const SWING_LIFE = 1.6;
const GLINT_LIFE = 0.9;

/** Two thin crossing diamonds, the shape of a glint. */
function glintGeo(): THREE.BufferGeometry {
  const ray = (w: number, h: number): THREE.BufferGeometry => {
    const s = new THREE.Shape();
    s.moveTo(0, h);
    s.lineTo(w, 0);
    s.lineTo(0, -h);
    s.lineTo(-w, 0);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  const a = ray(0.035, 0.34);
  const c = ray(0.28, 0.03);
  const m = mergeGeometries([a, c], false)!;
  a.dispose();
  c.dispose();
  return m;
}

export function createTelescope(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'telescope';
  const b = new Build(skin, 'telescope');
  root.add(b.root);

  // the tripod: three legs to a brass hub, brass feet, little struts that hold them apart
  const HUB = PIVOT_Y - 0.14;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + HP;
    const x = Math.sin(a) * 0.43;
    const z = Math.cos(a) * 0.43;
    b.beam([x, 0.04, z], [x * 0.14, HUB, z * 0.14], 0.08, WOOD);
    b.box([0.13, 0.07, 0.13], [x, 0.035, z], BRASS_DARK, [0, a, 0]);
    b.beam([x * 0.48, 0.52, z * 0.48], [0, 0.56, 0], 0.035, WOOD_DARK);
  }
  b.cyl(0.08, 0.05, [0, 0.56, 0], BRASS_DARK, { seg: 10 });
  b.cyl(0.13, 0.1, [0, HUB, 0], BRASS_DARK, { seg: 12 });

  // the small stool under the eyepiece
  const SX = -0.33;
  const SZ = 0.03;
  b.cyl(0.17, 0.06, [SX, 0.39, SZ], CORAL, { seg: 14 });
  b.cyl(0.13, 0.015, [SX, 0.426, SZ], CREAM, { seg: 14 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    b.beam([SX + Math.sin(a) * 0.14, 0, SZ + Math.cos(a) * 0.14], [SX + Math.sin(a) * 0.09, 0.37, SZ + Math.cos(a) * 0.09], 0.05, WOOD_DARK);
  }
  b.finish();

  // what turns: a fork on the hub, the tube in it
  const head = new THREE.Group();
  head.position.y = PIVOT_Y;
  root.add(head);
  const fork = new Build(skin, 'telescope-fork');
  fork.box([0.3, 0.05, 0.38], [0, -0.1, 0], BRASS_DARK);
  for (const s of [-1, 1]) fork.box([0.12, 0.2, 0.04], [0, 0, s * 0.175], BRASS_DARK);
  fork.finish();
  head.add(fork.root);

  const tube = new Build(skin, 'telescope-tube');
  tube.root.rotation.z = TILT;
  head.add(tube.root);
  const onAxis = { rot: [0, 0, -HP] as const, seg: 18 };
  // from the eyepiece to the wide end, along +X
  tube.cyl(0.06, 0.1, [-0.53, 0, 0], CHARCOAL, { ...onAxis, r1: 0.075 });
  tube.cyl(0.082, 0.26, [-0.36, 0, 0], BRASS_LIGHT, onAxis);
  tube.cyl(0.095, 0.05, [-0.24, 0, 0], BRASS_DARK, onAxis);
  tube.cyl(0.12, 0.36, [-0.05, 0, 0], BRASS, onAxis);
  tube.cyl(0.135, 0.05, [0.13, 0, 0], BRASS_DARK, onAxis);
  tube.cyl(0.155, 0.36, [0.32, 0, 0], BRASS, onAxis);
  tube.cyl(0.162, 0.04, [0.23, 0, 0], TEAL, onAxis);
  tube.cyl(0.19, 0.1, [0.53, 0, 0], BRASS_DARK, { ...onAxis, r1: 0.205 });
  // the pivot pin, the focus knob, the finder on top
  tube.cyl(0.05, 0.36, [0, 0, 0], BRASS_DARK, { rot: [HP, 0, 0], seg: 10 });
  tube.cyl(0.055, 0.07, [-0.22, 0, 0.13], CORAL, { rot: [HP, 0, 0], seg: 10 });
  tube.cyl(0.04, 0.3, [-0.02, 0.19, 0], BRASS_LIGHT, { ...onAxis, seg: 10 });
  tube.cyl(0.052, 0.04, [0.12, 0.19, 0], BRASS_DARK, { ...onAxis, seg: 10 });
  for (const x of [-0.1, 0.06]) tube.box([0.04, 0.09, 0.05], [x, 0.14, 0], BRASS_DARK);
  // the blue lens in the wide end
  const lensMat = tube.lens('lens', LENS, 0.165, 0.03, [LENS_X - 0.03, 0, 0], [1, 0, 0]).finish().lens;
  setGlow(lensMat, C_LENS, 0.12);

  // the glint: a thin warm cross just off the lens, lying towards the camera
  const glintMat = glowMaterial(0xfff0b8);
  const glint = new THREE.Mesh(glintGeo(), glintMat);
  glint.rotation.x = -0.95;
  glint.position.set(Math.cos(TILT) * (LENS_X + 0.03), Math.sin(TILT) * (LENS_X + 0.03), 0);
  glint.visible = false;
  head.add(fx(glint));

  finishShadows(root);
  const c = new THREE.Color();
  let t = 0;
  let flashing = false;
  return {
    root,
    update(dt, k) {
      t += dt;
      const p = k.pulse ?? Infinity;
      const going = p < SWING_LIFE;
      // it looks about the sky very slowly; a tap swings it, dying away
      const swing = going ? Math.sin(p * 8) * Math.exp(-p * 2.4) * 0.5 : 0;
      head.rotation.y = Math.sin(t * 0.3) * 0.1 + swing;
      if (going) {
        flashing = true;
        const g = Math.max(0, 1 - p / GLINT_LIFE);
        glint.visible = g > 0;
        glintMat.opacity = g;
        glint.scale.setScalar(0.7 + 0.5 * Math.sin(Math.min(1, p / GLINT_LIFE) * Math.PI));
        glint.rotation.z = p * 0.8;
        setGlow(lensMat, c.copy(C_LENS).lerp(C_GLINT, g), 0.12 + g * 1.2);
      } else if (flashing) {
        flashing = false;
        glint.visible = false;
        setGlow(lensMat, C_LENS, 0.12);
      }
    },
  };
}
