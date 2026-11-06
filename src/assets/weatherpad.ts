/**
 * The weather pad: a knee-high teal console shaped like a wedge, on a charcoal foot. Its slope faces
 * the sky and carries a big round dial in four coloured picture zones: a sun, a cloud with drops, a
 * snowflake, a rainbow. A stubby mustard pointer turns to the weather with a springy wobble; on the
 * ledge in front a big coral button sinks when it is pressed, and the whole console gives a little
 * squash. No power. Origin at the floor centre, front towards +Z; plain plastic throughout.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, MUSTARD, TAU, TEAL, WARM } from './buildingParts';
import { Build, HP, TEAL_D, finishShadows } from './villages';

const MUSTARD_DARK = '#c98f1c';
const CORAL_LIGHT = '#f08a70';
const ZONE_SUN = '#8fd3ff';
const ZONE_RAIN = '#5f7aa6';
const ZONE_SNOW = '#d9f0ff';
const ZONE_BOW = '#fff1c8';
const CLOUD = '#fbf7ee';
const DROP = '#8fd3ff';
const FLAKE = '#2f7fd6';
const BOW_RED = '#e8463a';
const BOW_GREEN = '#3fa142';

/** The wedge, seen from the side: a low ledge in front, then the slope up to the back. */
const LEDGE_Y = 0.34;
const BACK_Y = 0.72;
const FRONT_Z = 0.46;
const SLOPE_Z = 0.1;
const BACK_Z = -0.44;
const HALF_W = 0.45;
/** How far the slope leans from upright, and its middle. */
const PANEL_TILT = Math.PI / 2 - Math.atan2(BACK_Y - LEDGE_Y, SLOPE_Z - BACK_Z);
const PANEL_Y = (LEDGE_Y + BACK_Y) / 2;
const PANEL_Z = (SLOPE_Z + BACK_Z) / 2;
const DIAL_R = 0.3;
/** Each picture's middle, away from the dial's centre along its diagonal. */
const ICON = 0.137;
const FACE_Z = 0.034;
const BTN_Z = 0.285;

/** The pointer's turn for a weather (it points up at 0, and goes clockwise round the zones). */
const zoneTurn = (w: number): number => -(Math.PI / 4 + w * HP);

function wedge(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // drawn in (−z, y), then stood on its side and pushed out along x
  s.moveTo(-FRONT_Z, 0.08);
  s.lineTo(-BACK_Z, 0.08);
  s.lineTo(-BACK_Z, BACK_Y);
  s.lineTo(-SLOPE_Z, LEDGE_Y);
  s.lineTo(-FRONT_Z, LEDGE_Y);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: HALF_W * 2, bevelEnabled: false });
}

/** A quarter of the dial, starting at `from` (radians, counter-clockwise from +X). */
const quarter = (from: number): THREE.BufferGeometry => new THREE.CircleGeometry(DIAL_R, 10, from, HP);

/** Half a ring, standing like a rainbow. */
const bow = (r: number, w: number): THREE.BufferGeometry => new THREE.RingGeometry(r - w, r, 14, 1, 0, Math.PI);

export function createWeatherpad(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'weatherpad';
  const b = new Build(skin, 'weatherpad');
  root.add(b.root);
  const body = b.root;

  // the foot and the wedge, a darker skirt round it and a cream stripe
  b.box([0.98, 0.08, 0.98], [0, 0.04, 0.01], CHARCOAL);
  b.geo(wedge(), [-HALF_W, 0, 0], TEAL, { rot: [0, HP, 0] });
  b.box([HALF_W * 2 + 0.02, 0.07, FRONT_Z - BACK_Z + 0.02], [0, 0.115, (FRONT_Z + BACK_Z) / 2], TEAL_D);
  b.box([HALF_W * 2 + 0.02, 0.03, 0.03], [0, 0.28, FRONT_Z], CREAM);
  for (const s of [-1, 1]) {
    for (const y of [0.22, 0.3, 0.38]) b.box([0.02, 0.03, 0.3], [s * (HALF_W + 0.005), y, -0.2], TEAL_D);
  }

  // the collar of the button on the ledge
  b.cyl(0.175, 0.05, [0, LEDGE_Y + 0.025, BTN_Z], MUSTARD, { seg: 20 });
  b.cyl(0.155, 0.012, [0, LEDGE_Y + 0.052, BTN_Z], MUSTARD_DARK, { seg: 20 });

  // the button
  const button = new Build(skin, 'weatherpad-button');
  button.root.position.set(0, LEDGE_Y + 0.05, BTN_Z);
  body.add(button.root);
  button.cyl(0.14, 0.09, [0, 0.045, 0], CORAL_DARK, { seg: 20 });
  button.cyl(0.13, 0.04, [0, 0.1, 0], CORAL, { seg: 20 });
  button.cyl(0.09, 0.012, [0, 0.122, 0], CORAL_LIGHT, { seg: 18 });
  button.finish();

  // the panel on the slope: its own space, the dial lies in its XY plane looking along +Z
  const d = new Build(skin, 'weatherpad-dial');
  d.root.position.set(0, PANEL_Y, PANEL_Z);
  d.root.rotation.x = -PANEL_TILT;
  body.add(d.root);
  const face = { rot: [HP, 0, 0] as const };
  d.cyl(DIAL_R + 0.035, 0.03, [0, 0, 0.012], MUSTARD, { ...face, seg: 28 });
  d.geo(quarter(0), [0, 0, FACE_Z - 0.004], ZONE_SUN);
  d.geo(quarter(-HP), [0, 0, FACE_Z - 0.004], ZONE_RAIN);
  d.geo(quarter(Math.PI), [0, 0, FACE_Z - 0.004], ZONE_SNOW);
  d.geo(quarter(HP), [0, 0, FACE_Z - 0.004], ZONE_BOW);
  d.box([DIAL_R * 2, 0.014, 0.01], [0, 0, FACE_Z], MUSTARD_DARK);
  d.box([0.014, DIAL_R * 2, 0.01], [0, 0, FACE_Z], MUSTARD_DARK);

  // the sun
  d.cyl(0.05, 0.012, [ICON, ICON, FACE_Z + 0.002], WARM, { ...face, seg: 14 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    d.box([0.016, 0.034, 0.01], [ICON + Math.sin(a) * 0.076, ICON + Math.cos(a) * 0.076, FACE_Z], MUSTARD, [0, 0, -a]);
  }
  // the cloud with its drops
  const ry = -ICON + 0.022;
  for (const [x, y, r] of [
    [-0.05, 0, 0.036],
    [0, 0.018, 0.05],
    [0.052, 0, 0.034],
  ] as const) {
    d.cyl(r, 0.012, [ICON + x, ry + y, FACE_Z + 0.002], CLOUD, { ...face, seg: 12 });
  }
  d.box([0.13, 0.03, 0.012], [ICON, ry - 0.02, FACE_Z + 0.002], CLOUD);
  for (const [x, y] of [
    [-0.05, -0.07],
    [0, -0.086],
    [0.05, -0.07],
  ] as const) {
    d.box([0.022, 0.04, 0.01], [ICON + x, ry + y, FACE_Z], DROP, [0, 0, -0.3]);
  }
  // the snowflake
  for (let i = 0; i < 3; i++) {
    d.box([0.022, 0.17, 0.01], [-ICON, -ICON, FACE_Z + 0.002 + i * 0.001], FLAKE, [0, 0, (i / 3) * Math.PI]);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    d.box([0.05, 0.016, 0.01], [-ICON + Math.sin(a) * 0.058, -ICON + Math.cos(a) * 0.058, FACE_Z + 0.002], FLAKE, [0, 0, -a]);
  }
  // the rainbow
  const wy = ICON - 0.05;
  d.geo(bow(0.105, 0.028), [-ICON, wy, FACE_Z + 0.002], BOW_RED);
  d.geo(bow(0.077, 0.026), [-ICON, wy, FACE_Z + 0.003], MUSTARD);
  d.geo(bow(0.051, 0.026), [-ICON, wy, FACE_Z + 0.004], BOW_GREEN);

  // the pointer: a mustard arrow on a dark hub
  const pointer = new Build(skin, 'weatherpad-pointer');
  pointer.root.position.z = FACE_Z + 0.012;
  d.root.add(pointer.root);
  const arrow = new THREE.Shape();
  arrow.moveTo(-0.045, 0);
  arrow.lineTo(0.045, 0);
  arrow.lineTo(0, 0.135);
  arrow.closePath();
  pointer.geo(new THREE.ExtrudeGeometry(arrow, { depth: 0.024, bevelEnabled: false }), [0, 0, 0], MUSTARD);
  pointer.cyl(0.058, 0.034, [0, 0, 0.012], CHARCOAL, { ...face, seg: 16 });
  pointer.cyl(0.03, 0.04, [0, 0, 0.016], CORAL, { ...face, seg: 12 });
  pointer.finish();
  d.finish();
  b.finish();

  pointer.root.rotation.z = zoneTurn(0);
  finishShadows(root);
  let was = 0;
  let goal = zoneTurn(0);
  let turn = goal;
  let speed = 0;
  return {
    root,
    update(dt, k) {
      // the pointer always goes on round, clockwise, to the new zone
      const w = k.weather ?? 0;
      if (w !== was) {
        was = w;
        goal -= (((goal - zoneTurn(w)) % TAU) + TAU) % TAU || TAU;
      }
      const h = Math.min(dt, 1 / 30);
      speed += (90 * (goal - turn) - 9 * speed) * h;
      turn += speed * h;
      pointer.root.rotation.z = turn;
      // down in a blink, back with a little bounce
      const p = k.pulse;
      const press = p === undefined || p > 0.8 ? 0 : p < 0.08 ? p / 0.08 : Math.exp(-(p - 0.08) * 8) * Math.cos((p - 0.08) * 20);
      button.root.position.y = LEDGE_Y + 0.05 - 0.055 * Math.max(0, press);
      const squash = 0.03 * press;
      body.scale.set(1 + squash, 1 - squash, 1 + squash);
    },
  };
}
