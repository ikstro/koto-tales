/**
 * The house's furniture (DESIGN.md «Home», content/house.ts HOME): the boys' bunk bed, the
 * kitchen, the table with its chairs, the treasure cabinet and Пупся's aquarium. Toy pieces like
 * the kit's buildings: origin at the floor centre, front towards +Z, static parts merged by the
 * Kit, everything alive animated from `update`. No lights: glow materials only (the house lamp
 * is the one real light, systems/house.ts).
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { createBed, type Bed } from './props';
import { Kit, type V3 } from './parts/kit';
import { CORAL, CORAL_DARK, CREAM, INK, MINT, MUSTARD, STEEL, STEEL_DARK, TEAL, WARM, markShadows, ownGlow, setGlow } from './buildingParts';

const WOOD = '#b5793c';
const WOOD_DARK = '#7d5128';
const WOOD_LIGHT = '#c99a5a';
const TEAL_DARK = '#226e69';
const WHITE = '#fbf3e4';
const GLASS = '#cfeff2';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

/** A seat: an empty object whose position is the sitting surface, facing its local +Z (yaw `ry`). */
function seatAt(parent: THREE.Object3D, at: V3, ry: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

// ─── the bunk bed ───────────────────────────────────────────────────────────

/** How far the lower bed slides out from under the top one (+Z), so the steep camera sees its sleeper. */
export const BUNK_OUT = 1.6;

/**
 * A toy bunk bed seen from above: the top bed (1×2, head towards -Z) on four posts with a guard
 * rail and a ladder on the +X side; the lower bed (head towards -Z too) is slid BUNK_OUT forward
 * from under it, so the steep camera sees its sleeper's face and he can sit up in front of the deck.
 * `low` / `top` are the beddings (pillow + blanket that folds); sheets at `lowH` / `topH`.
 */
export function createBunk(skin: Skin, lowColour: string, topColour: string, lowH: number, topH: number): { root: THREE.Group; low: Bed; top: Bed } {
  const root = new THREE.Group();
  root.name = 'bunk';
  const p = new Kit('bunk', skin).part('bunk', root);
  const POST = 0.12;
  const PX = 0.56;
  const H = topH + 0.62;
  for (const x of [-PX, PX]) for (const z of [-0.95, 0.95]) p.box([POST, H, POST], [x, H / 2, z], WOOD);
  for (const x of [-PX, PX]) for (const z of [-0.95, 0.95]) p.box([0.17, 0.1, 0.17], [x, H + 0.05, z], MUSTARD);
  // the top deck: a slab, a dark rim, a cream sheet, a pillow
  p.box([1.1, 0.14, 1.98], [0, topH - 0.27, 0], WOOD_LIGHT);
  p.box([1.18, 0.06, 2.0], [0, topH - 0.2, 0], WOOD_DARK);
  p.box([0.9, 0.18, 1.84], [0, topH - 0.09, 0], '#f6ecd6');
  p.box([0.78, 0.16, 0.48], [0, topH + 0.08, -0.66], '#fff1d0');
  // head and foot boards of the top bed, and low rails between the posts below
  p.box([1.0, 0.5, 0.08], [0, topH + 0.2, -0.95], WOOD);
  p.box([1.0, 0.36, 0.08], [0, topH + 0.14, 0.95], WOOD);
  p.box([1.0, 0.4, 0.06], [0, 0.6, -0.96], WOOD);
  // the guard rail on the open side, a gap at the head end for the ladder
  p.box([0.07, 0.08, 1.15], [PX, topH + 0.36, 0.36], WOOD_DARK);
  p.box([0.06, 0.36, 0.06], [PX, topH + 0.18, -0.2], WOOD_DARK);
  // the ladder on the +X side by the head end
  for (const z of [-0.78, -0.36]) p.box([0.07, topH + 0.3, 0.07], [PX + 0.1, (topH + 0.3) / 2, z], WOOD_DARK);
  for (let y = 0.3; y < topH; y += 0.38) p.box([0.08, 0.06, 0.4], [PX + 0.1, y, -0.57], MUSTARD);
  p.done();
  const low = createBed(skin, lowColour, lowH);
  low.root.position.z = BUNK_OUT;
  const top = createBed(skin, topColour, 0);
  top.root.position.y = topH;
  root.add(low.root, top.root);
  markShadows(root);
  return { root, low, top };
}

// ─── the kitchen ────────────────────────────────────────────────────────────

const STEAM = 9;
const COUNTER_H = 0.9;

export interface Kitchen {
  root: THREE.Group;
  /** `meal` > 0 while the party eats (more steam, the oven glows brighter). */
  update(dt: number, meal: boolean, night: number): void;
}

/**
 * Along the back wall, four cells wide (local x -2..2, the back at z = -0.35): a counter with jars
 * on a shelf above, the sink under the window, the stove with a pot that steams (its pipe runs
 * up to the roof's chimney) and a tall fridge in the corner.
 */
export function createKitchen(skin: Skin): Kitchen {
  const root = new THREE.Group();
  root.name = 'kitchen';
  const kit = new Kit('kitchen', skin);
  const p = kit.part('kitchen', root);
  const D = 0.7;
  const Z = -0.35 + D / 2;
  // counter + sink cabinets (cells x -2..0): teal doors, cream top, mustard knobs
  p.box([2.0, COUNTER_H - 0.08, D], [-1, (COUNTER_H - 0.08) / 2, Z], TEAL);
  p.box([2.06, 0.08, D + 0.06], [-1, COUNTER_H - 0.04, Z + 0.03], CREAM);
  p.box([2.0, 0.1, 0.04], [-1, 0.05, Z + D / 2 + 0.01], TEAL_DARK);
  for (const x of [-1.75, -1.25, -0.75, -0.25]) {
    p.box([0.42, 0.62, 0.03], [x, 0.44, Z + D / 2 + 0.015], MINT);
    p.box([0.08, 0.08, 0.06], [x + (x < -1 ? 0.13 : -0.13), 0.62, Z + D / 2 + 0.04], MUSTARD);
  }
  // the sink: a steel basin let into the top, a tap that bends over it
  p.box([0.62, 0.03, 0.46], [-0.5, COUNTER_H + 0.005, Z + 0.02], STEEL);
  p.box([0.5, 0.03, 0.34], [-0.5, COUNTER_H + 0.012, Z + 0.02], '#5b6b78');
  p.box([0.07, 0.3, 0.07], [-0.5, COUNTER_H + 0.15, Z - 0.26], STEEL_DARK);
  p.box([0.07, 0.07, 0.26], [-0.5, COUNTER_H + 0.3, Z - 0.16], STEEL_DARK);
  p.box([0.1, 0.05, 0.1], [-0.5, COUNTER_H + 0.27, Z - 0.04], STEEL);
  p.box([0.08, 0.06, 0.08], [-0.32, COUNTER_H + 0.06, Z - 0.26], CORAL);
  p.box([0.08, 0.06, 0.08], [-0.68, COUNTER_H + 0.06, Z - 0.26], '#2f7fd6');
  // a cutting board with a carrot, a bowl of apples
  p.box([0.5, 0.04, 0.34], [-1.45, COUNTER_H + 0.02, Z + 0.04], WOOD_LIGHT);
  p.box([0.26, 0.06, 0.06], [-1.45, COUNTER_H + 0.07, Z + 0.06], '#f08a24', [0, 0.3, 0]);
  p.box([0.06, 0.05, 0.06], [-1.6, COUNTER_H + 0.07, Z + 0.1], '#4f9a3c');
  p.box([0.34, 0.1, 0.34], [-1.0, COUNTER_H + 0.05, Z - 0.05], CREAM);
  for (const [x, z] of [[-1.06, -0.1], [-0.94, 0.0], [-1.0, -0.02]] as const) p.box([0.1, 0.1, 0.1], [x, COUNTER_H + 0.14 + (x === -1.0 ? 0.06 : 0), Z + z], '#e53935');
  // the shelf of jars over the counter
  const SH = 1.95;
  p.box([1.3, 0.07, 0.3], [-1.35, SH, -0.2], WOOD);
  p.box([0.06, 0.22, 0.24], [-1.95, SH - 0.13, -0.22], WOOD_DARK);
  p.box([0.06, 0.22, 0.24], [-0.75, SH - 0.13, -0.22], WOOD_DARK);
  const JARS: [number, string, number][] = [
    [-1.82, '#e0583f', 0.3],
    [-1.55, '#ffc23a', 0.36],
    [-1.28, '#4f9a3c', 0.28],
    [-1.02, '#ee6a82', 0.32],
  ];
  for (const [x, c, h] of JARS) {
    p.box([0.2, h, 0.2], [x, SH + 0.035 + h / 2, -0.2], { c: GLASS, clear: true });
    p.box([0.16, h - 0.08, 0.16], [x, SH + 0.035 + (h - 0.08) / 2 + 0.02, -0.2], c);
    p.box([0.22, 0.06, 0.22], [x, SH + 0.035 + h + 0.03, -0.2], c === '#ffc23a' ? CORAL : MUSTARD);
  }
  // little pans hanging under the shelf
  p.box([0.04, 0.18, 0.04], [-0.9, SH - 0.22, -0.28], STEEL_DARK);
  p.box([0.22, 0.05, 0.22], [-0.9, SH - 0.34, -0.22], CORAL_DARK);

  // the stove (cell x 0..1): cream body, oven window, dark top with two rings, knobs
  const SX0 = 0.5;
  p.box([0.96, COUNTER_H - 0.04, D], [SX0, (COUNTER_H - 0.04) / 2, Z], WHITE);
  p.box([1.0, 0.06, D + 0.04], [SX0, COUNTER_H - 0.02, Z + 0.02], CHARCOAL_TOP);
  for (const x of [SX0 - 0.22, SX0 + 0.22]) p.box([0.3, 0.02, 0.3], [x, COUNTER_H + 0.01, Z + 0.02], '#4a4440');
  p.box([0.7, 0.06, 0.04], [SX0, 0.74, Z + D / 2 + 0.02], STEEL);
  for (const x of [-0.3, -0.1, 0.1, 0.3]) p.box([0.08, 0.08, 0.05], [SX0 + x, 0.8, Z + D / 2 + 0.03], x < 0 ? CORAL : MUSTARD);
  p.box([0.72, 0.46, 0.03], [SX0, 0.36, Z + D / 2 + 0.01], CORAL);
  // the hood and the pipe up through the ceiling to the chimney
  p.box([0.9, 0.24, 0.55], [SX0, 2.05, -0.08], CORAL);
  p.box([0.7, 0.1, 0.45], [SX0, 1.9, -0.06], CORAL_DARK);
  p.box([0.32, 0.9, 0.32], [SX0, 2.6, -0.14], STEEL_DARK);
  // the pot on the left ring: coral with a cream lid; a kettle on the right
  const POT: V3 = [SX0 - 0.22, COUNTER_H + 0.02, Z + 0.02];
  p.box([0.32, 0.26, 0.32], [POT[0], POT[1] + 0.13, POT[2]], '#2f7fd6');
  p.box([0.36, 0.05, 0.36], [POT[0], POT[1] + 0.26, POT[2]], '#2563b8');
  p.box([0.08, 0.05, 0.08], [POT[0], POT[1] + 0.31, POT[2]], CREAM);
  p.box([0.06, 0.05, 0.14], [POT[0] + 0.2, POT[1] + 0.2, POT[2]], '#2563b8');
  p.box([0.06, 0.05, 0.14], [POT[0] - 0.2, POT[1] + 0.2, POT[2]], '#2563b8');
  p.box([0.24, 0.2, 0.24], [SX0 + 0.22, COUNTER_H + 0.12, Z + 0.02], MUSTARD);
  p.box([0.16, 0.05, 0.05], [SX0 + 0.22 + 0.16, COUNTER_H + 0.18, Z + 0.02], MUSTARD);
  p.box([0.1, 0.05, 0.1], [SX0 + 0.22, COUNTER_H + 0.24, Z + 0.02], INK);

  // the fridge (cell x 1..2): tall, cream, two doors, mustard handles, magnets
  const FX = 1.5;
  const FH = 1.95;
  p.box([0.9, FH, 0.72], [FX, FH / 2, -0.35 + 0.36], WHITE);
  p.box([0.92, 0.04, 0.02], [FX, 1.25, -0.35 + 0.73], '#d9cdb5');
  p.box([0.06, 0.38, 0.06], [FX - 0.34, 1.55, -0.35 + 0.76], MUSTARD);
  p.box([0.06, 0.5, 0.06], [FX - 0.34, 0.85, -0.35 + 0.76], MUSTARD);
  for (const [x, y, c] of [
    [FX + 0.1, 1.6, CORAL],
    [FX + 0.25, 1.45, '#2f7fd6'],
    [FX + 0.05, 0.95, '#3fa142'],
    [FX + 0.22, 0.7, '#ee6a82'],
  ] as const) p.box([0.1, 0.1, 0.03], [x, y, -0.35 + 0.735], c);
  // a drawing on the fridge (a sun, a house): Льоша's
  p.box([0.32, 0.4, 0.01], [FX + 0.12, 1.15 - 0.55 + 0.6, -0.35 + 0.735], '#fff8ea');
  p.box([0.1, 0.1, 0.012], [FX + 0.2, 1.33, -0.35 + 0.74], MUSTARD);
  p.box([0.14, 0.1, 0.012], [FX + 0.06, 1.1, -0.35 + 0.74], CORAL);
  p.box([0.06, 0.06, 0.012], [FX + 0.06, 1.18, -0.35 + 0.742], '#2f7fd6');
  p.done();

  // the oven's warm window: its own glow, brighter while cooking
  const ovenMat = ownGlow(skin, '#ffa64a');
  const oven = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.02), ovenMat);
  oven.position.set(SX0, 0.36, Z + D / 2 + 0.03);
  root.add(oven);
  // a soft glow under the pot (the ring is on)
  const ringMat = ownGlow(skin, '#ff6d1f');
  const ring = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.26), ringMat);
  ring.position.set(POT[0], COUNTER_H + 0.025, POT[2]);
  root.add(ring);

  // steam: soft cream cubes rising and swelling from the pot, more while the party eats
  const steam = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#f6f0e6'), STEAM);
  steam.frustumCulled = false;
  steam.castShadow = false;
  root.add(steam);
  markShadows(root);

  const warm = new THREE.Color('#ffa64a');
  const hot = new THREE.Color('#ff6d1f');
  let t = 0;
  let heat = 0.3;
  return {
    root,
    update(dt, meal, night) {
      t += dt;
      heat += ((meal ? 1 : 0.35) - heat) * Math.min(1, dt * 2);
      const flicker = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
      setGlow(ovenMat, warm, (0.35 + 0.5 * heat + 0.25 * night) * flicker);
      setGlow(ringMat, hot, 0.5 + 0.5 * heat);
      const n = Math.round(3 + heat * (STEAM - 3));
      for (let i = 0; i < STEAM; i++) {
        const life = (t * (0.35 + 0.25 * heat) + i / STEAM) % 1;
        const s = i < n ? (0.08 + 0.2 * Math.sin(Math.PI * life) ** 0.6) * (0.8 + 0.5 * heat) : 0;
        pos.set(POT[0] + Math.sin(t * 1.7 + i * 2.1) * 0.06 + life * 0.08, POT[1] + 0.36 + life * 0.85, POT[2] + Math.cos(t * 1.3 + i) * 0.05);
        scl.set(s, s, s);
        q.setFromEuler(e.set(life * 2 + i, life * 2.5, 0));
        steam.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      steam.instanceMatrix.needsUpdate = true;
    },
  };
}

const CHARCOAL_TOP = '#3a3532';

// ─── the table ──────────────────────────────────────────────────────────────

export const TABLE_H = 0.82;
const CHAIR_H = 0.5;

/**
 * A wooden table with a checked cloth, a plate of pies and a teapot; four chairs: two behind it
 * (facing the room), one in front, and Пупся's at the right end with a cushion. `seats` in that
 * order (food.ts gives the last one to the cat).
 */
export function createTable(skin: Skin): { root: THREE.Group; seats: THREE.Object3D[] } {
  const root = new THREE.Group();
  root.name = 'table';
  const p = new Kit('table', skin).part('table', root);
  const W = 1.9;
  const D = 1.15;
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) p.box([0.12, TABLE_H - 0.08, 0.12], [x, (TABLE_H - 0.08) / 2, z], WOOD_DARK);
  p.box([W, 0.08, D], [0, TABLE_H - 0.04, 0], WOOD);
  // the checked cloth
  const N = 6;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < 4; j++) p.box([(W - 0.2) / N, 0.012, (D - 0.2) / 4], [-W / 2 + 0.1 + ((i + 0.5) * (W - 0.2)) / N, TABLE_H + 0.006, -D / 2 + 0.1 + ((j + 0.5) * (D - 0.2)) / 4], (i + j) % 2 ? '#fff1d0' : '#e8463a');
  const TOP = TABLE_H + 0.012;
  // a big plate of pies in the middle, a teapot, cups and plates by the chairs
  p.box([0.5, 0.03, 0.5], [0, TOP + 0.015, 0], CREAM);
  for (const [x, z, r] of [[-0.1, -0.08, 0.3], [0.1, -0.06, -0.4], [0, 0.1, 0.1], [-0.12, 0.12, 0.9], [0.13, 0.12, -0.9]] as const) {
    p.box([0.2, 0.07, 0.12], [x, TOP + 0.065, z], '#d9a35b', [0, r, 0]);
    p.box([0.14, 0.03, 0.04], [x, TOP + 0.11, z], '#b47c3a', [0, r, 0]);
  }
  p.box([0.24, 0.22, 0.24], [0.62, TOP + 0.11, -0.2], TEAL);
  p.box([0.1, 0.06, 0.1], [0.62, TOP + 0.25, -0.2], CREAM);
  p.box([0.16, 0.05, 0.05], [0.77, TOP + 0.15, -0.2], TEAL, [0, 0, 0.5]);
  const PLACES: [number, number][] = [
    [-0.45, -0.38],
    [0.45, -0.38],
    [-0.45, 0.38],
  ];
  for (const [x, z] of PLACES) {
    p.box([0.3, 0.02, 0.3], [x, TOP + 0.01, z], '#fff8ea');
    p.box([0.1, 0.12, 0.1], [x + 0.22, TOP + 0.06, z], [CORAL, MUSTARD, '#2f7fd6'][PLACES.findIndex((q) => q[0] === x && q[1] === z)]);
  }
  // Пупся's bowl at her end
  p.box([0.26, 0.06, 0.26], [W / 2 - 0.25, TOP + 0.03, 0], TEAL);
  // chairs: seat, four legs, a back
  const chair = (x: number, z: number, ry: number, cushion?: string) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const at = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
    for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) p.box([0.07, CHAIR_H - 0.05, 0.07], at(lx, (CHAIR_H - 0.05) / 2, lz), WOOD_DARK);
    p.box([0.46, 0.06, 0.46], at(0, CHAIR_H - 0.03, 0), WOOD, [0, ry, 0]);
    p.box([0.46, 0.5, 0.06], at(0, CHAIR_H + 0.25, -0.21), WOOD, [0, ry, 0]);
    p.box([0.5, 0.06, 0.08], at(0, CHAIR_H + 0.52, -0.21), WOOD_DARK, [0, ry, 0]);
    if (cushion) p.box([0.4, 0.07, 0.4], at(0, CHAIR_H + 0.035, 0.01), cushion, [0, ry, 0]);
  };
  chair(-0.45, -0.95, 0);
  chair(0.45, -0.95, 0);
  chair(-0.45, 0.95, Math.PI);
  chair(W / 2 + 0.42, 0, -Math.PI / 2, MINT);
  p.done();
  markShadows(root);
  const seats = [
    seatAt(root, [-0.45, CHAIR_H, -0.95], 0),
    seatAt(root, [0.45, CHAIR_H, -0.95], 0),
    seatAt(root, [-0.45, CHAIR_H, 0.95], Math.PI),
    seatAt(root, [W / 2 + 0.42, CHAIR_H + 0.07, 0], -Math.PI / 2),
  ];
  return { root, seats };
}

// ─── the treasure cabinet ───────────────────────────────────────────────────

export interface Cabinet {
  root: THREE.Group;
  /** Puts the artifacts on their plinths in order (the rest stay empty). */
  fill(models: (THREE.Object3D | undefined)[]): void;
  update(dt: number): void;
}

const PLINTH_W = 0.46;
/** Each step of the stand: how much higher and how much further back. */
const STEP_UP = 0.4;
const STEP_IN = 0.44;

/**
 * «Полиця скарбів»: a stepped wooden stand against the back wall (2.9 wide), like a little
 * theatre for treasures, so the steep game camera sees every step: drawers below, then rows of
 * four teal plinths, each row a step higher and further back, a teal back board with a mustard
 * crown. A found artifact stands on its plinth, the plinth's top glows gold and the treasure
 * turns slowly; an empty one waits with a dark top. Rows = ceil(slots / 4), at least two.
 * Origin at the floor, the back against z = -depth / 2.
 */
export function createCabinet(skin: Skin, slots: number): Cabinet {
  const root = new THREE.Group();
  root.name = 'treasure-cabinet';
  const p = new Kit('cabinet', skin).part('cabinet', root);
  const W = 2.9;
  const COLS = 4;
  const rows = Math.max(2, Math.ceil(slots / COLS));
  const D = rows * STEP_IN;
  const back = -D / 2;
  const BASE = 0.55;
  const topOf = (r: number) => BASE + r * STEP_UP;
  const frontOf = (r: number) => D / 2 - r * STEP_IN;
  // the steps: each a block from the floor up to its top, from the back to its front edge
  for (let r = 0; r < rows; r++) {
    const h = topOf(r);
    const depth = frontOf(r) - back;
    p.box([W - 0.16, h, depth], [0, h / 2, back + depth / 2], r === 0 ? WOOD_LIGHT : WOOD);
    p.box([W - 0.14, 0.06, 0.06], [0, h - 0.03, frontOf(r) - 0.02], WOOD_DARK);
  }
  // drawers on the front of the lowest step
  for (const x of [-0.7, 0.7]) {
    p.box([1.2, BASE - 0.18, 0.03], [x, BASE / 2, D / 2 + 0.01], WOOD);
    p.box([0.24, 0.06, 0.06], [x, BASE / 2 + 0.05, D / 2 + 0.04], MUSTARD);
  }
  // stepped side boards, the back board and its crown
  const topH = topOf(rows - 1);
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    for (let r = 0; r < rows; r++) {
      const h = topOf(r) + 0.12;
      const z0 = r === 0 ? D / 2 : frontOf(r - 1) - STEP_IN;
      p.box([0.1, h, STEP_IN], [x, h / 2, z0 - STEP_IN / 2], WOOD_DARK);
    }
  }
  const BH = topH + 0.75;
  p.box([W, BH, 0.08], [0, BH / 2, back - 0.04], TEAL_DARK);
  p.box([W + 0.1, 0.1, 0.16], [0, BH + 0.05, back], WOOD_DARK);
  p.box([W - 0.5, 0.14, 0.08], [0, BH + 0.17, back], MUSTARD);
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) p.box([0.18, 0.18, 0.18], [x, BH + 0.19, back], MUSTARD);
  for (let i = 0; i < 5; i++) p.box([0.12, 0.12, 0.04], [-0.8 + i * 0.4, BH - 0.18, back + 0.01], i % 2 ? CORAL : WARM);

  // the plinths
  const anchors: THREE.Object3D[] = [];
  const tops: THREE.Mesh[] = [];
  const slotMat = skin.partMaterial(TEAL);
  const emptyMat = skin.partMaterial('#1d4f4b');
  const goldMat = ownGlow(skin, WARM);
  const plinthGeo = new THREE.BoxGeometry(PLINTH_W, 0.12, PLINTH_W * 0.75);
  const topGeo = new THREE.BoxGeometry(PLINTH_W - 0.06, 0.04, PLINTH_W * 0.75 - 0.06);
  for (let r = 0; r < rows; r++) {
    const y = topOf(r);
    const z = frontOf(r) - STEP_IN / 2;
    for (let c = 0; c < COLS; c++) {
      const i = (rows - 1 - r) * COLS + c; // the top (back) row first, left to right
      const x = -W / 2 + 0.1 + ((c + 0.5) * (W - 0.2)) / COLS;
      const base = new THREE.Mesh(plinthGeo, slotMat);
      base.position.set(x, y + 0.06, z);
      const top = new THREE.Mesh(topGeo, emptyMat);
      top.position.set(x, y + 0.14, z);
      root.add(base, top);
      tops[i] = top;
      const a = new THREE.Group();
      a.name = 'slot';
      a.position.set(x, y + 0.16, z);
      root.add(a);
      anchors[i] = a;
    }
  }
  p.done();
  markShadows(root);
  const gold = new THREE.Color(WARM);
  let t = 0;
  let shown: THREE.Object3D[] = [];
  return {
    root,
    fill(models) {
      for (const o of shown) o.removeFromParent();
      shown = [];
      tops.forEach((top, i) => {
        const m = models[i];
        top.material = m ? goldMat : emptyMat;
        if (!m) return;
        // fit the treasure on its plinth: at most 0.62 tall and 0.5 across
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const k = Math.min(1.8, 0.62 / Math.max(0.01, size.y), 0.5 / Math.max(0.01, size.x, size.z));
        m.scale.multiplyScalar(k);
        m.position.set(0, 0, 0);
        anchors[i].add(m);
        shown.push(m);
      });
    },
    update(dt) {
      t += dt;
      setGlow(goldMat, gold, 0.7 + 0.25 * Math.sin(t * 2.2));
      shown.forEach((m, i) => {
        m.rotation.y = Math.sin(t * 0.6 + i * 1.3) * 0.5;
        m.position.y = 0.02 + 0.02 * Math.sin(t * 1.8 + i);
      });
    },
  };
}

// ─── the aquarium ───────────────────────────────────────────────────────────

const FISH = 4;
const BUBBLES = 10;
const FISH_COLOURS: [string, string][] = [
  ['#f08a24', '#ffd23a'],
  ['#e8463a', '#fff1d0'],
  ['#ffd23a', '#f08a24'],
  ['#ee6a82', '#fff1d0'],
];

export interface Aquarium {
  root: THREE.Group;
  update(dt: number): void;
  /** World point in front of the glass where a watcher sits. */
  front: THREE.Object3D;
}

/**
 * Пупся's aquarium on a wooden stand, its long side along local Z, the glass facing +X (it stands
 * against the left wall): sand, a plant, a little castle rock, four toy fish swimming loops and
 * bubbles rising from a stone.
 */
export function createAquarium(skin: Skin): Aquarium {
  const root = new THREE.Group();
  root.name = 'aquarium';
  const kit = new Kit('aquarium', skin);
  const p = kit.part('aquarium', root);
  const SW = 0.8; // across (x)
  const SL = 1.7; // along (z)
  const STAND = 0.5;
  const TH = 0.85;
  p.box([SW, STAND, SL], [0, STAND / 2, 0], WOOD);
  p.box([SW + 0.06, 0.06, SL + 0.06], [0, STAND - 0.03, 0], WOOD_DARK);
  p.box([0.03, STAND - 0.2, SL - 0.2], [SW / 2 + 0.005, STAND / 2, 0], WOOD_LIGHT);
  p.box([0.05, 0.06, 0.24], [SW / 2 + 0.03, STAND / 2 + 0.05, 0], MUSTARD);
  const y0 = STAND;
  // frame edges (teal), sand, plant, castle rock
  for (const x of [-SW / 2 + 0.03, SW / 2 - 0.03]) for (const z of [-SL / 2 + 0.03, SL / 2 - 0.03]) p.box([0.06, TH, 0.06], [x, y0 + TH / 2, z], TEAL_DARK);
  for (const y of [y0 + 0.03, y0 + TH - 0.03]) {
    p.box([SW, 0.06, 0.06], [0, y, -SL / 2 + 0.03], TEAL_DARK);
    p.box([SW, 0.06, 0.06], [0, y, SL / 2 - 0.03], TEAL_DARK);
    p.box([0.06, 0.06, SL], [-SW / 2 + 0.03, y, 0], TEAL_DARK);
    p.box([0.06, 0.06, SL], [SW / 2 - 0.03, y, 0], TEAL_DARK);
  }
  p.box([SW - 0.08, 0.1, SL - 0.08], [0, y0 + 0.11, 0], '#e8c27a');
  for (const [z, h] of [[-0.5, 0.42], [-0.42, 0.3], [-0.58, 0.24]] as const) p.box([0.08, h, 0.06], [-0.12, y0 + 0.16 + h / 2, z], '#4f9a3c', [0, 0, 0.12]);
  p.box([0.08, 0.36, 0.06], [-0.18, y0 + 0.34, 0.45], '#3fa142', [0, 0, -0.1]);
  p.box([0.2, 0.2, 0.22], [-0.12, y0 + 0.26, 0.15], '#8f8f96');
  p.box([0.1, 0.12, 0.1], [-0.12, y0 + 0.42, 0.15], '#a7a7ae');
  p.box([0.06, 0.08, 0.04], [-0.02, y0 + 0.2, 0.15], '#3b3b40');
  p.box([0.12, 0.08, 0.12], [0.05, y0 + 0.2, -0.2], '#7a7a82');
  p.done();
  // the water: its own see-through material, a little clearer than the kit's glass
  const waterMat = (skin.partMaterial('#7fd4d0', { transparent: true }) as THREE.MeshStandardMaterial).clone();
  waterMat.opacity = 0.22;
  waterMat.userData.own = true;
  const water = new THREE.Mesh(new THREE.BoxGeometry(SW - 0.1, TH - 0.14, SL - 0.1), waterMat);
  water.position.set(0, y0 + TH / 2 - 0.02, 0);
  water.renderOrder = 3;
  root.add(water);
  // a lamp strip along the back edge of the open top (the tank is seen from above)
  new Kit('aquarium-lid', skin).part('lid', root).box([0.14, 0.07, SL + 0.04], [-SW / 2 + 0.07, y0 + TH + 0.035, 0], TEAL).done();

  const fish: THREE.Group[] = [];
  for (let i = 0; i < FISH; i++) {
    const g = new THREE.Group();
    const [body, fin] = FISH_COLOURS[i];
    new Kit(`aqfish${i}`, skin)
      .part('fish', g)
      .box([0.1, 0.13, 0.22], [0, 0, 0], body)
      .box([0.12, 0.08, 0.1], [0, 0, 0.02], body)
      .box([0.06, 0.16, 0.08], [0, 0, -0.14], fin)
      .box([0.04, 0.05, 0.08], [0, 0.09, 0], fin)
      .box([0.105, 0.03, 0.03], [0, 0.025, 0.08], INK)
      .done();
    root.add(g);
    fish.push(g);
  }
  const bubbles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin.partMaterial('#e9fbff', { emissive: true }), BUBBLES);
  bubbles.frustumCulled = false;
  bubbles.castShadow = false;
  root.add(bubbles);
  markShadows(root);
  const front = new THREE.Object3D();
  front.position.set(SW / 2 + 0.75, 0, 0);
  root.add(front);

  let t = 0;
  return {
    root,
    front,
    update(dt) {
      t += dt;
      fish.forEach((f, i) => {
        // each fish swims its own oval, turning to where it goes
        const sp = 0.45 + i * 0.12;
        const a = t * sp + i * 1.7;
        const rz = 0.58 - (i % 2) * 0.14;
        const rx = 0.2;
        const dir = i % 2 ? -1 : 1;
        const z = Math.sin(a * dir) * rz;
        const x = Math.cos(a * dir) * rx * 0.8;
        f.position.set(x, y0 + 0.3 + i * 0.12 + 0.03 * Math.sin(t * 1.3 + i), z);
        f.rotation.y = Math.atan2(-Math.sin(a * dir) * rx * 0.8 * dir, Math.cos(a * dir) * rz * dir);
        f.rotation.z = 0.08 * Math.sin(t * 6 + i);
      });
      for (let i = 0; i < BUBBLES; i++) {
        const life = (t * 0.5 + i / BUBBLES) % 1;
        const s = 0.025 + 0.02 * life;
        pos.set(0.05 + Math.sin(t * 3 + i * 1.9) * 0.02, y0 + 0.24 + life * (TH - 0.36), -0.2 + Math.cos(t * 2.4 + i) * 0.02);
        scl.set(s, s, s);
        bubbles.setMatrixAt(i, m4.compose(pos, q.identity(), scl));
      }
      bubbles.instanceMatrix.needsUpdate = true;
    },
  };
}
