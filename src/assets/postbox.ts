/**
 * The postbox in the heroes' yard (DESIGN.md «Home»): a toy letterbox on a wooden post, a blue
 * brick box with two studs on its flat top and a slot between them, its long side to the camera, a
 * little door at the left end, and a coral flag on that side lying along the box; it springs up
 * when something waits inside, a letter peeks out of the slot and the box breathes gently. Opening it swings the door down and, for a
 * parcel or a gift, a small mustard parcel with a coral ribbon hops out of the top. Built once with
 * the house; the skin's plain materials only (no glow, no light). Origin at the ground centre.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { CORAL, CORAL_DARK, CREAM, MUSTARD, WOOD, WOOD_DARK } from './buildingParts';
import { Build, finishShadows } from './villages';

const BLUE = '#2f7fd6';
const BLUE_DARK = '#2566b0';
const INK = '#4a2c14';
const STEEL = '#b7bcc2';

/** The box: length along X, depth along Z, its bottom on the post. */
const L = 0.74;
const D = 0.46;
const H = 0.44;
const POST_H = 0.9;
const TOP = POST_H + H;
/** The whole piece a little bigger than life, so it reads as a toy beside the heroes. */
const SCALE = 1.35;

/** The flag: down along the box, up standing tall (rotation about Z; a springy pop). */
const FLAG_DOWN = Math.PI / 2;
const FLAG_UP = 0;
const DOOR_OPEN = 1.35;
/** Ready pop (DESIGN.md «Motion»): stiffness / damping. */
const K = 380;
const C = 10;

export interface PostboxModel {
  root: THREE.Group;
  /** Where a letter drops in (above the slot), local to the root. */
  slot: THREE.Vector3;
  /** The flag: up while something waits inside (it pops with a spring). */
  setFull(full: boolean): void;
  /** Opens for one thing: the door swings, a parcel hops out of the top (`parcel`). */
  open(parcel: boolean): void;
  update(dt: number): void;
}

interface Spring {
  x: number;
  v: number;
  to: number;
}
const stepSpring = (s: Spring, dt: number): void => {
  // a few small steps keep a stiff spring steady on a slow frame
  const n = Math.max(1, Math.ceil(dt / 0.012));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (K * (s.to - s.x) - C * s.v) * h;
    s.x += s.v * h;
  }
};

export function createPostbox(skin: Skin): PostboxModel {
  const b = new Build(skin, 'postbox');
  const root = b.root;
  root.name = 'postbox';

  // the post on a little wooden foot
  b.box([0.16, POST_H, 0.16], [0, POST_H / 2, 0], WOOD);
  b.box([0.34, 0.08, 0.34], [0, 0.04, 0], WOOD_DARK);
  b.box([0.5, 0.06, 0.2], [0, POST_H - 0.03, 0], WOOD_DARK);

  // the box that breathes (its own group, scaled from its bottom)
  const body = new THREE.Group();
  body.position.y = POST_H;
  root.add(body);
  const bp = b.part('body', body);
  bp.box([L, H, D], [0, H / 2, 0], BLUE);
  // a slightly darker rim round the top and the bottom, like a moulded brick
  bp.box([L + 0.03, 0.05, D + 0.03], [0, 0.025, 0], BLUE_DARK);
  bp.box([L + 0.03, 0.04, D + 0.03], [0, H - 0.02, 0], BLUE_DARK);
  // two studs on top, at the ends; the slot between them
  for (const x of [-0.22, 0.22]) {
    bp.box([0.16, 0.07, 0.16], [x, H + 0.035, 0], BLUE);
    bp.box([0.1, 0.012, 0.1], [x, H + 0.075, 0], '#5a9be2');
  }
  bp.box([0.22, 0.014, 0.07], [0, H + 0.007, 0], INK);

  // a letter peeking out of the slot while something waits (cream, a coral stamp)
  const peek = new THREE.Group();
  peek.position.set(0, H, 0);
  peek.visible = false;
  body.add(peek);
  const kp = b.part('peek', peek);
  kp.box([0.2, 0.14, 0.025], [0, 0.07, 0], CREAM);
  kp.box([0.05, 0.05, 0.03], [0.06, 0.1, 0], CORAL);
  kp.beam([-0.09, 0.13, 0.014], [0, 0.07, 0.014], 0.018, INK, 0.004);
  kp.beam([0.09, 0.13, 0.014], [0, 0.07, 0.014], 0.018, INK, 0.004);

  // the door at the left end, hinged at its bottom edge
  const door = new THREE.Group();
  door.position.set(-L / 2 - 0.015, 0.05, 0);
  body.add(door);
  const dp = b.part('door', door);
  dp.box([0.03, H - 0.1, D - 0.06], [0, (H - 0.1) / 2, 0], BLUE_DARK);
  dp.box([0.05, 0.06, 0.12], [-0.03, H - 0.2, 0], STEEL);

  // the flag on the camera side near the right end: an arm and a coral plate
  const flag = new THREE.Group();
  flag.position.set(L / 2 - 0.05, 0.12, D / 2 + 0.03);
  body.add(flag);
  const fp = b.part('flag', flag);
  fp.box([0.06, 0.66, 0.035], [0, 0.33, 0], STEEL);
  fp.box([0.27, 0.2, 0.03], [0.135, 0.55, 0], CORAL);
  fp.box([0.27, 0.035, 0.032], [0.135, 0.46, 0.001], CORAL_DARK);
  fp.box([0.08, 0.08, 0.05], [0, 0, -0.005], STEEL);

  // the parcel that hops out (hidden until then)
  const parcel = new THREE.Group();
  parcel.visible = false;
  root.add(parcel);
  const pp = b.part('parcel', parcel);
  pp.box([0.3, 0.24, 0.3], [0, 0.12, 0], MUSTARD);
  pp.box([0.31, 0.25, 0.06], [0, 0.12, 0], CORAL);
  pp.box([0.06, 0.25, 0.31], [0, 0.12, 0], CORAL);
  pp.box([0.09, 0.08, 0.09], [-0.05, 0.28, 0], CORAL, [0, 0, 0.6]);
  pp.box([0.09, 0.08, 0.09], [0.05, 0.28, 0], CORAL, [0, 0, -0.6]);

  b.finish();
  finishShadows(root);
  root.traverse((o) => (o.userData.casts = true));
  root.scale.setScalar(SCALE);

  const flagS: Spring = { x: FLAG_DOWN, v: 0, to: FLAG_DOWN };
  const doorS: Spring = { x: 0, v: 0, to: 0 };
  let full = false;
  let t = 0;
  let doorT = 0;
  let hop = -1;
  flag.rotation.z = FLAG_DOWN;

  return {
    root,
    slot: new THREE.Vector3(0, TOP + 0.25, 0).multiplyScalar(SCALE),
    setFull(f) {
      if (f === full) return;
      full = f;
      flagS.to = f ? FLAG_UP : FLAG_DOWN;
      // a little kick so it pops rather than glides
      flagS.v += f ? -9 : 4;
      peek.visible = f;
    },
    open(withParcel) {
      doorS.to = DOOR_OPEN;
      doorS.v += 6;
      doorT = 1.1;
      if (withParcel) {
        hop = 0;
        parcel.visible = true;
      }
    },
    update(dt) {
      t += dt;
      stepSpring(flagS, dt);
      flag.rotation.z = flagS.x;
      if (doorT > 0 && (doorT -= dt) <= 0) doorS.to = 0;
      stepSpring(doorS, dt);
      door.rotation.z = doorS.x;
      // breathing while something waits
      const k = full ? 1 : 0;
      const s = 1 + 0.035 * k * Math.sin(t * 3.2);
      body.scale.set(2 - s, s, 2 - s);
      if (hop >= 0) {
        hop += dt;
        const up = Math.min(1, hop / 0.35);
        // out of the top with an overshoot, a turn, then gone
        const back = 1 + 2.4 * Math.pow(up - 1, 3) + 1.4 * Math.pow(up - 1, 2);
        parcel.position.set(0, TOP + 0.05 + 0.7 * back, 0);
        parcel.rotation.y = hop * 4;
        const shrink = hop > 0.9 ? Math.max(0, 1 - (hop - 0.9) / 0.2) : 1;
        parcel.scale.setScalar(shrink);
        if (hop > 1.1) {
          hop = -1;
          parcel.visible = false;
        }
      }
    },
  };
}
