/**
 * One procedural animator per rig type. It turns any Rig (code-built, .glb or
 * drawn) into a CharacterModel: walk cycle scaled by speed, idle breathing,
 * one-shot actions (attack, cast, hurt, happy) that fall back to idle by
 * themselves, and a held 'sleep'.
 *
 * Every animated part keeps its rest transform; each frame a target pose is
 * written as offsets from rest, then the joints ease towards it (dt = 0 snaps).
 * The game moves and turns `model.root`; the animator only touches the rig's
 * own root (inside it) and the parts.
 */
import * as THREE from 'three';
import type { CharacterModel, ModelAction, Rig } from '../contracts';

type OneShot = 'attack' | 'cast' | 'hurt' | 'happy';
export const ACTION_TIME: Record<OneShot, number> = { attack: 0.55, cast: 0.9, hurt: 0.45, happy: 0.95 };

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 before a, 1 after b, smooth in between. */
const ramp = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 0 в†’ 1 в†’ 0 over [a, b]. */
const arc = (a: number, b: number, x: number) => (x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a)));

/** Channels: 0..2 rotation x/y/z (absolute = rest + offset), 3..5 position offset x/y/z. */
class Joint {
  readonly rest: number[];
  readonly cur = new Float64Array(6);
  readonly tgt = new Float64Array(6);

  constructor(readonly obj: THREE.Object3D) {
    const r = obj.rotation;
    const p = obj.position;
    this.rest = [r.x, r.y, r.z, p.x, p.y, p.z];
  }

  apply(extraRy = 0): void {
    const r = this.rest;
    const c = this.cur;
    this.obj.rotation.set(r[0] + c[0], r[1] + c[1] + extraRy, r[2] + c[2]);
    this.obj.position.set(r[3] + c[3], r[4] + c[4], r[5] + c[5]);
  }
}

interface State {
  t: number;
  phase: number;
  walk: number;
  action: ModelAction;
  at: number;
  spin: number;
}

type J = Joint | undefined;
const add = (j: J, ch: number, v: number) => {
  if (j) j.tgt[ch] += v;
};
/** Blend a rotation channel towards an absolute angle. */
const mixRot = (j: J, axis: number, abs: number, k: number) => {
  if (!j || k <= 0) return;
  const off = abs - j.rest[axis];
  j.tgt[axis] += (off - j.tgt[axis]) * k;
};
/** Blend any channel towards an offset from rest. */
const mixOff = (j: J, ch: number, v: number, k: number) => {
  if (!j || k <= 0) return;
  j.tgt[ch] += (v - j.tgt[ch]) * k;
};

function isUnder(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let o = obj.parent; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

interface Ctx {
  rig: Rig;
  root: Joint;
  j: Record<string, Joint>;
  /** Parts that do not hang under `body` (flat .glb hierarchies) and must be carried along with it. */
  loose: Set<string>;
  hasTool: boolean;
  legs: { j: Joint; side: number; k: number }[];
  /** Lying-down lift for bipeds (half the body depth). */
  lie: number;
}

/** Common root-level reactions shared by every rig type. */
function rootReactions(s: State, c: Ctx, lean: number): void {
  const a = s.at;
  if (s.action === 'hurt') {
    const k = a < 0.08 ? a / 0.08 : 1 - ramp(0.08, ACTION_TIME.hurt, a);
    add(c.root, 0, -0.3 * k * lean);
    add(c.root, 5, -0.2 * k);
    add(c.root, 4, 0.06 * k);
  } else if (s.action === 'happy') {
    add(c.root, 4, 0.45 * arc(0, 0.6, a));
    s.spin = TAU * ramp(0.02, 0.7, a);
  }
}

/** Carry loose parts along with the body's vertical offset. */
function carry(c: Ctx, names: string[], dy: number): void {
  for (const n of names) if (c.loose.has(n)) add(c.j[n], 4, dy);
}

function biped(s: State, c: Ctx): void {
  const { j } = c;
  const { walk: w, phase: ph, t, at: a } = s;
  const sw = Math.sin(ph);
  const still = 1 - w;

  // locomotion + idle
  add(j.legL, 0, -sw * 0.75 * w);
  add(j.legR, 0, sw * 0.75 * w);
  add(j.armL, 0, sw * 0.6 * w);
  add(j.armR, 0, -sw * 0.6 * w);
  let bob = Math.abs(Math.cos(ph)) * 0.045 * w + Math.sin(t * 2.2) * 0.008 * still;
  add(j.body, 1, sw * 0.07 * w);
  add(j.armL, 2, (0.05 + Math.sin(t * 2.2) * 0.025) * still);
  add(j.armR, 2, -(0.05 + Math.sin(t * 2.2) * 0.025) * still);
  add(j.head, 1, Math.sin(t * 0.6) * 0.2 * still);
  add(j.head, 0, Math.sin(t * 1.1) * 0.04 * still);

  switch (s.action) {
    case 'attack': {
      const env = ramp(0, 0.1, a) * (1 - ramp(0.42, 0.55, a));
      if (c.hasTool) {
        const draw = ramp(0.06, 0.26, a);
        const released = ramp(0.28, 0.33, a);
        mixRot(j.armL, 0, -1.55, env);
        mixRot(j.armL, 2, -0.08, env);
        mixRot(j.armR, 0, -1.5 + 0.45 * released, env);
        mixRot(j.armR, 2, 0.5 * (1 - released) - 0.35 * released, env);
        mixOff(j.armR, 5, -0.13 * draw * (1 - released), env);
        mixRot(j.body, 1, -0.22, env);
        mixRot(j.head, 1, 0.18, env);
        mixRot(j.legL, 0, -0.25, env);
        mixRot(j.legR, 0, 0.2, env);
      } else {
        const raise = ramp(0, 0.16, a) * (1 - ramp(0.16, 0.32, a));
        const swipe = ramp(0.16, 0.3, a);
        mixOff(j.armL, 0, -0.9 * raise + 0.7 * swipe, env);
        mixOff(j.armR, 0, -0.9 * raise + 0.7 * swipe, env);
        mixOff(j.body, 0, 0.35, env);
        mixOff(c.root, 5, 0.25, env);
      }
      break;
    }
    case 'cast': {
      const up = ramp(0, 0.2, a);
      const fwd = ramp(0.55, 0.66, a);
      const env = up * (1 - ramp(0.78, 0.9, a));
      const shake = Math.sin(t * 45) * 0.06 * (1 - fwd);
      mixRot(j.armL, 0, -2.85 + 1.3 * fwd + shake, env);
      mixRot(j.armR, 0, -2.85 + 1.3 * fwd - shake, env);
      mixRot(j.armL, 2, 0.3 * (1 - fwd), env);
      mixRot(j.armR, 2, -0.3 * (1 - fwd), env);
      mixRot(j.head, 0, -0.25 * (1 - fwd), env);
      bob += 0.05 * env;
      add(c.root, 4, 0.12 * arc(0.5, 0.8, a));
      break;
    }
    case 'hurt': {
      const k = a < 0.08 ? a / 0.08 : 1 - ramp(0.08, ACTION_TIME.hurt, a);
      add(j.head, 0, -0.35 * k);
      add(j.armL, 2, 0.6 * k);
      add(j.armR, 2, -0.6 * k);
      break;
    }
    case 'happy': {
      const env = ramp(0, 0.1, a) * (1 - ramp(0.8, 0.95, a));
      const hop = arc(0, 0.6, a);
      const wave = Math.sin(t * 18) * 0.25;
      mixRot(j.armL, 0, 0, env);
      mixRot(j.armR, 0, 0, env);
      mixRot(j.armL, 2, 2.7 + wave, env);
      mixRot(j.armR, 2, -2.7 + wave, env);
      mixRot(j.legL, 0, -0.35 * hop, env);
      mixRot(j.legR, 0, 0.35 * hop, env);
      mixRot(j.head, 0, -0.15, env);
      break;
    }
    case 'sleep': {
      for (const n of ['head', 'armL', 'armR', 'legL', 'legR', 'body']) {
        const p = j[n];
        if (!p) continue;
        p.tgt.fill(0);
        mixRot(p, 0, 0, 1);
      }
      mixRot(j.armL, 2, 0.1, 1);
      mixRot(j.armR, 2, -0.1, 1);
      mixRot(j.head, 1, 0.25, 1);
      add(j.head, 0, Math.sin(t * 1.4) * 0.03);
      bob = 0;
      add(c.root, 0, -Math.PI / 2);
      add(c.root, 4, c.lie);
      add(c.root, 5, c.rig.height * 0.45);
      break;
    }
  }
  add(j.body, 4, bob);
  carry(c, ['head', 'armL', 'armR', 'tool', 'hair'], bob);
  rootReactions(s, c, 1);
}

function quadruped(s: State, c: Ctx): void {
  const { j } = c;
  const { walk: w, phase: ph, t, at: a } = s;
  const sw = Math.sin(ph);
  const still = 1 - w;

  add(j.legFL, 0, -sw * 0.7 * w);
  add(j.legBR, 0, -sw * 0.7 * w);
  add(j.legFR, 0, sw * 0.7 * w);
  add(j.legBL, 0, sw * 0.7 * w);
  let drop = Math.abs(Math.cos(ph)) * 0.03 * w + Math.sin(t * 2.5) * 0.006 * still;
  add(j.body, 0, Math.sin(ph * 2) * 0.025 * w);
  add(j.head, 1, (Math.sin(t * 0.5) * 0.35 + Math.sin(t * 1.3) * 0.05) * still);
  add(j.head, 0, -sw * 0.04 * w + Math.sin(t * 0.9) * 0.04 * still);
  add(j.tail, 1, Math.sin(t * 2.4) * (0.3 - 0.12 * w));
  add(j.tail2, 1, Math.sin(t * 2.4 - 0.9) * 0.4);
  add(j.tail, 0, 0.2 * w);

  switch (s.action) {
    case 'attack': {
      const crouch = ramp(0, 0.14, a) * (1 - ramp(0.16, 0.24, a));
      const leap = arc(0.18, 0.46, a);
      const env = 1 - ramp(0.46, 0.55, a);
      drop -= 0.09 * crouch;
      add(c.root, 4, 0.3 * leap);
      add(c.root, 5, 0.45 * ramp(0.18, 0.42, a) * env);
      mixOff(j.legFL, 0, -1.1, leap);
      mixOff(j.legFR, 0, -1.0, leap);
      mixOff(j.legBL, 0, 0.9, leap);
      mixOff(j.legBR, 0, 0.9, leap);
      add(j.body, 0, -0.2 * leap + 0.12 * crouch);
      add(j.head, 0, 0.2 * leap - 0.15 * crouch);
      add(j.tail, 0, -0.5 * crouch);
      break;
    }
    case 'cast': {
      const env = ramp(0, 0.2, a) * (1 - ramp(0.75, 0.9, a));
      const paddle = Math.sin(t * 14) * 0.35;
      mixOff(j.body, 0, -0.75, env);
      mixOff(j.legFL, 0, -0.9 + paddle, env);
      mixOff(j.legFR, 0, -0.9 - paddle, env);
      mixOff(j.head, 0, 0.6, env);
      add(j.tail, 0, 0.3 * env);
      add(c.root, 4, 0.05 * env);
      break;
    }
    case 'hurt': {
      const k = a < 0.08 ? a / 0.08 : 1 - ramp(0.08, ACTION_TIME.hurt, a);
      add(j.head, 0, -0.3 * k);
      add(j.tail, 0, 0.5 * k);
      break;
    }
    case 'happy': {
      const hop = arc(0, 0.6, a);
      mixOff(j.legFL, 0, -0.6, hop);
      mixOff(j.legFR, 0, -0.6, hop);
      mixOff(j.legBL, 0, 0.5, hop);
      mixOff(j.legBR, 0, 0.5, hop);
      add(j.tail, 0, 0.4);
      add(j.head, 0, -0.2 * hop);
      break;
    }
    case 'sleep': {
      for (const p of Object.values(j)) p.tgt.fill(0);
      drop = -0.2 + Math.sin(t * 1.6) * 0.006;
      for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) mixRot(j[n], 0, -1.45, 1);
      add(j.head, 0, 0.3);
      add(j.head, 4, -0.04);
      add(j.head, 1, 0.2);
      if (j.tail) {
        mixRot(j.tail, 0, 0, 1);
        add(j.tail, 1, 1.25);
      }
      if (j.tail2) {
        mixRot(j.tail2, 0, 0, 1);
        add(j.tail2, 1, 1.2);
      }
      break;
    }
  }
  add(j.body, 4, drop);
  if (s.action === 'sleep') carry(c, ['head', 'legFL', 'legFR', 'legBL', 'legBR', 'tail', 'tail2'], drop);
  else carry(c, ['head', 'legFL', 'legFR', 'tail', 'tail2'], drop);
  rootReactions(s, c, 1);
}

function spider(s: State, c: Ctx): void {
  const { j } = c;
  const { walk: w, phase: ph, t, at: a } = s;
  const still = 1 - w;
  let drop = Math.abs(Math.sin(ph)) * 0.015 * w + Math.sin(t * 3) * 0.008 * still;
  add(j.body, 2, Math.sin(ph) * 0.04 * w);
  add(j.head, 1, Math.sin(t * 0.8) * 0.15 * still);

  for (const { j: leg, side, k } of c.legs) {
    const group = (k + (side > 0 ? 0 : 1)) % 2;
    const phi = ph + group * Math.PI;
    const swing = Math.sin(phi) * 0.35 * w;
    const lift = Math.max(0, Math.cos(phi)) * 0.45 * w;
    add(leg, 1, -side * swing);
    add(leg, 2, side * (lift + Math.sin(t * 2 + k * 1.7 + side) * 0.03 * still));
  }

  switch (s.action) {
    case 'attack':
    case 'cast': {
      const rear = ramp(0, 0.18, a) * (1 - ramp(0.3, 0.42, a));
      const lunge = arc(0.25, 0.5, a);
      add(j.body, 0, -0.45 * rear);
      for (const { j: leg, side, k } of c.legs) {
        if (k === 0) mixOff(leg, 2, side * 1.0 + Math.sin(t * 20) * 0.15, rear);
      }
      add(c.root, 5, 0.35 * lunge);
      add(c.root, 4, (s.action === 'cast' ? 0.25 : 0.1) * lunge);
      break;
    }
    case 'hurt': {
      const k = a < 0.08 ? a / 0.08 : 1 - ramp(0.08, ACTION_TIME.hurt, a);
      add(j.body, 0, -0.3 * k);
      for (const l of c.legs) add(l.j, 2, l.side * 0.4 * k);
      break;
    }
    case 'happy': {
      const env = ramp(0, 0.1, a) * (1 - ramp(0.8, 0.95, a));
      for (const { j: leg, side, k } of c.legs) add(leg, 2, side * (0.4 + Math.sin(t * 20 + k) * 0.3) * env);
      break;
    }
    case 'sleep': {
      drop = -0.14 + Math.sin(t * 1.5) * 0.005;
      for (const { j: leg, side, k } of c.legs) {
        leg.tgt.fill(0);
        add(leg, 2, side * 0.3);
        add(leg, 1, -side * (k < 2 ? -0.45 : 0.45));
      }
      if (j.head) j.head.tgt.fill(0);
      add(j.head, 0, 0.12);
      break;
    }
  }
  add(j.body, 4, drop);
  carry(
    c,
    ['head', ...c.legs.map((l) => l.j.obj.name)],
    drop,
  );
  rootReactions(s, c, 1);
}

function staticPose(s: State, c: Ctx): void {
  rootReactions(s, c, 1);
}

const POSES = { biped, quadruped, spider, static: staticPose };
/** Blocks per walk cycle, and the speed at which the cycle is at full swing. */
const GAIT = {
  biped: { stride: 1.6, full: 2.5 },
  quadruped: { stride: 1.2, full: 2.5 },
  spider: { stride: 0.9, full: 2.0 },
  static: { stride: 1, full: 1 },
};

export function animate(rig: Rig): CharacterModel {
  const outer = new THREE.Group();
  outer.name = `model:${rig.type}`;
  outer.add(rig.root);

  const j: Record<string, Joint> = {};
  for (const [name, obj] of Object.entries(rig.parts)) j[name] = new Joint(obj);
  const loose = new Set<string>();
  const body = rig.parts.body;
  if (body) for (const name of Object.keys(rig.parts)) if (name !== 'body' && !isUnder(rig.parts[name], body)) loose.add(name);

  const legs: Ctx['legs'] = [];
  if (rig.type === 'spider') {
    rig.root.updateMatrixWorld(true);
    const local = new THREE.Vector3();
    const found: { j: Joint; side: number; z: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const p = rig.parts[`leg${i}`];
      if (!p) continue;
      p.getWorldPosition(local);
      rig.root.worldToLocal(local);
      found.push({ j: j[`leg${i}`], side: local.x >= 0 ? 1 : -1, z: local.z });
    }
    for (const side of [1, -1]) {
      found
        .filter((f) => f.side === side)
        .sort((p, q) => q.z - p.z)
        .forEach((f, k) => legs.push({ j: f.j, side, k }));
    }
  }

  let lie = 0.15;
  if (rig.type === 'biped' && body) {
    const box = new THREE.Box3().setFromObject(body);
    if (!box.isEmpty()) lie = Math.max(0.08, (box.max.z - box.min.z) / 2);
  }

  const ctx: Ctx = { rig, root: new Joint(rig.root), j, loose, hasTool: !!rig.parts.tool, legs, lie };
  const all = [ctx.root, ...Object.values(j)];
  const pose = POSES[rig.type];
  const gait = GAIT[rig.type];
  const s: State = { t: 0, phase: 0, walk: 0, action: 'idle', at: 0, spin: 0 };

  let first = true;
  let slow = 0; // seconds of slow easing left (lying down / getting up)
  let blinkIn = 2 + Math.random() * 3;
  let blinkLeft = 0;

  const model: CharacterModel = {
    root: outer,
    height: rig.height,
    play(action: ModelAction) {
      if (s.action === 'sleep' && action !== 'sleep') slow = 0.8;
      if (action === 'sleep' && s.action !== 'sleep') slow = 0.8;
      if (action === 'sleep' && s.action === 'sleep') return;
      s.action = action;
      s.at = 0;
    },
    update(dt: number, moveSpeed: number) {
      const snap = first || dt <= 0;
      first = false;
      dt = snap ? 0 : Math.min(dt, 0.1);
      s.t += dt;
      if (s.action !== 'idle' && s.action !== 'sleep') {
        s.at += dt;
        if (s.at >= ACTION_TIME[s.action]) {
          s.action = 'idle';
          s.at = 0;
        }
      }
      const speed = s.action === 'sleep' ? 0 : Math.max(0, moveSpeed);
      const wt = Math.min(1, speed / gait.full);
      s.walk = snap ? wt : s.walk + (wt - s.walk) * (1 - Math.exp(-8 * dt));
      s.phase = (s.phase + (dt * speed * TAU) / gait.stride) % TAU;
      if (s.walk < 0.01 && speed === 0) s.phase *= Math.exp(-4 * dt);
      s.spin = 0;

      for (const q of all) q.tgt.fill(0);
      pose(s, ctx);

      slow = Math.max(0, slow - dt);
      const rate = slow > 0 || s.action === 'sleep' ? 5 : 18;
      const k = snap ? 1 : 1 - Math.exp(-rate * dt);
      for (const q of all) {
        for (let i = 0; i < 6; i++) q.cur[i] += (q.tgt[i] - q.cur[i]) * k;
      }
      ctx.root.apply(s.spin);
      for (const q of Object.values(j)) q.apply();

      // eyes: blink now and then, shut while sleeping
      if (rig.eyes) {
        blinkIn -= dt;
        if (blinkIn <= 0) {
          blinkLeft = 0.13;
          blinkIn = 2 + Math.random() * 3.5;
        }
        blinkLeft = Math.max(0, blinkLeft - dt);
        const shut = s.action === 'sleep' || blinkLeft > 0;
        rig.eyes.mesh.material = shut ? rig.eyes.closed : rig.eyes.open;
      }
      if (rig.parts.tool) rig.parts.tool.visible = s.action === 'attack' && s.at < 0.5;
      rig.root.visible = !(s.action === 'hurt' && Math.floor(s.at * 24) % 2 === 1);
    },
    dispose() {
      outer.removeFromParent();
      rig.root.visible = true;
    },
  };
  return model;
}
