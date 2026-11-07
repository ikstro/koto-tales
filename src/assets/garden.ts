/**
 * The garden bed («Грядка», content/buildings.ts `garden`, rules content/garden.ts): a low wooden
 * raised bed of dark soil with six planting spots (3×2), a little teal watering can resting on its
 * right rim. Four crops, each in three stages (sprout, growing, ripe): potato, carrot, cherry and
 * apple. Every stage of every crop is built up front in each spot and only shown or hidden, all in
 * the skin's one vertex-coloured plastic, so nothing new is ever compiled mid-play. Origin at the
 * floor centre of the 3×2 footprint, front towards +Z.
 *
 * systems/garden.ts tells it what grows through `BuildingTick.garden`; counters there start the
 * motions (the crop popping off at a harvest, the can watering, a wiggle). With no word from the
 * game (the kit sprite, the preview, the ghost) it shows ripe carrots.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { markShadows, MINT, TEAL, WOOD, WOOD_DARK } from './buildingParts';
import { Kit, type PartBuilder } from './parts/kit';

/** What the game tells the bed each frame. */
export interface GardenLook {
  /** Index in CROPS (content/garden.ts): 0 potato, 1 carrot, 2 cherry, 3 apple; -1 bare soil. */
  crop: number;
  /** 0 sprout, 1 growing, 2 ripe. */
  stage: number;
  /** Ripe and the party is near: the crop breathes. */
  near: boolean;
  /** Counters: each new one starts its motion. */
  harvests: number;
  waters: number;
  wiggles: number;
}

const BOARD = '#9a6a35';
const SOIL = '#5b3a22';
const SOIL_DARK = '#462b18';
const LEAF = '#4f9a3c';
const LEAF_LIGHT = '#6dbb4a';
const LEAF_DARK = '#3a7a2c';
const STEM = '#5d8a2e';
const POTATO = '#c9a063';
const POTATO_DARK = '#a97c45';
const CARROT = '#f08a24';
const CARROT_TOP = '#7cc24f';
const CHERRY = '#d7263d';
const TRUNK = '#7a5230';
const APPLE = '#e53935';
const BLOSSOM = '#fff4e0';
const YOLK = '#ffd23a';
const DROP = '#7fcfff';

/** Soil surface, where the crops stand. */
const SOIL_Y = 0.36;
const SPOTS: readonly [number, number][] = [
  [-0.92, -0.42],
  [0, -0.42],
  [0.92, -0.42],
  [-0.92, 0.42],
  [0, 0.42],
  [0.92, 0.42],
];
/** Each spot is turned a little, so the rows look planted by hand. */
const TURN = [0.3, -0.5, 1.1, -0.9, 0.6, -0.2];

const N_CROPS = 4;
const N_STAGES = 3;

type V2 = readonly [number, number];

/** A leaf: a flat box tilted out from the stem at angle `a` (around y), `up` its lift. */
function leaf(p: PartBuilder, a: number, r: number, y: number, size: readonly [number, number, number], paint: string, up = 0.45): void {
  // long along its own x: turned to point out along `a`, its outer end lifted by `up`
  p.box(size, [Math.sin(a) * r, y, Math.cos(a) * r], paint, [0, a - Math.PI / 2, up]);
}

/** A ring of leaves round the stem. */
function leafRing(p: PartBuilder, n: number, r: number, y: number, size: readonly [number, number, number], paints: string[], phase = 0, up = 0.45): void {
  for (let i = 0; i < n; i++) leaf(p, phase + (i / n) * Math.PI * 2, r, y, size, paints[i % paints.length], up);
}

function potato(p: PartBuilder, stage: number): void {
  if (stage === 0) {
    p.box([0.03, 0.08, 0.03], [0, 0.04, 0], STEM);
    leafRing(p, 2, 0.05, 0.08, [0.1, 0.025, 0.07], [LEAF_LIGHT], 0.4, 0.5);
    return;
  }
  if (stage === 1) {
    p.box([0.04, 0.2, 0.04], [0, 0.1, 0], STEM);
    leafRing(p, 5, 0.1, 0.13, [0.15, 0.04, 0.1], [LEAF, LEAF_LIGHT], 0.2);
    leafRing(p, 3, 0.05, 0.22, [0.12, 0.04, 0.09], [LEAF_LIGHT], 1, 0.6);
    return;
  }
  // ripe: a round leafy bush with little white flowers, potatoes peeping out of the soil
  p.box([0.36, 0.14, 0.32], [0, 0.16, 0], LEAF);
  p.box([0.26, 0.12, 0.24], [0.02, 0.28, -0.01], LEAF_LIGHT);
  leafRing(p, 6, 0.2, 0.14, [0.16, 0.05, 0.11], [LEAF_DARK, LEAF], 0.3, 0.35);
  for (const [x, z] of [[-0.08, 0.06], [0.1, -0.05], [0.02, 0.12]] as V2[]) {
    p.box([0.06, 0.05, 0.06], [x, 0.36, z], BLOSSOM);
    p.box([0.03, 0.02, 0.03], [x, 0.39, z], YOLK);
  }
  for (const [x, z, s] of [[0.22, 0.17, 1], [-0.2, 0.2, 0.85], [0.05, 0.25, 0.75]] as const) {
    p.box([0.14 * s, 0.1 * s, 0.11 * s], [x, 0.03, z], POTATO, [0, 0.4 * x, 0]);
    p.box([0.04 * s, 0.03, 0.04 * s], [x + 0.03, 0.03 + 0.05 * s, z + 0.02], POTATO_DARK);
  }
}

function carrot(p: PartBuilder, stage: number): void {
  const fronds = (n: number, h: number, lean: number, leaves: boolean) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const tip: [number, number, number] = [Math.sin(a) * lean, h * (0.85 + 0.15 * ((i * 7) % 3) / 2), Math.cos(a) * lean];
      p.beam([0, 0.02, 0], tip, 0.03, i % 2 ? CARROT_TOP : LEAF);
      if (leaves) {
        // feathery: little leaflets along the stem
        for (const k of [0.45, 0.7, 0.95]) p.box([0.09, 0.025, 0.05], [tip[0] * k, tip[1] * k, tip[2] * k], i % 2 ? LEAF : CARROT_TOP, [0.3, a, 0.4]);
      }
    }
  };
  if (stage === 0) {
    fronds(3, 0.12, 0.04, false);
    return;
  }
  if (stage === 1) {
    fronds(5, 0.3, 0.1, true);
    return;
  }
  // ripe: tall feathery tops over a fat orange shoulder showing above the soil
  fronds(6, 0.44, 0.15, true);
  p.box([0.17, 0.1, 0.17], [0, 0.04, 0], CARROT);
  p.box([0.12, 0.04, 0.12], [0, 0.1, 0], CARROT);
  p.box([0.05, 0.03, 0.05], [0, 0.13, 0], LEAF_DARK);
}

/** A bush or a little tree: a trunk and a blocky crown (bottom at `y0`). */
function crown(p: PartBuilder, trunkH: number, w: number, h: number): void {
  p.box([0.06, trunkH, 0.06], [0, trunkH / 2, 0], TRUNK);
  p.box([w, h, w * 0.9], [0, trunkH + h / 2, 0], LEAF);
  p.box([w * 0.7, h * 0.45, w * 0.64], [0.02, trunkH + h + h * 0.2, -0.01], LEAF_LIGHT);
  p.box([w * 0.5, h * 0.5, 0.06], [-w * 0.18, trunkH + h * 0.45, w * 0.47], LEAF_DARK);
}

function cherry(p: PartBuilder, stage: number): void {
  if (stage === 0) {
    p.box([0.03, 0.14, 0.03], [0, 0.07, 0], TRUNK);
    leafRing(p, 2, 0.05, 0.13, [0.1, 0.025, 0.06], [LEAF_LIGHT], 0.9);
    return;
  }
  if (stage === 1) {
    crown(p, 0.2, 0.3, 0.18);
    return;
  }
  // ripe: a round little bush hung with pairs of red cherries
  crown(p, 0.24, 0.4, 0.26);
  const top = 0.24;
  for (const [a, y] of [[0.3, 0.06], [1.5, 0.12], [2.6, 0.04], [3.7, 0.14], [4.9, 0.08]] as V2[]) {
    const r = 0.21;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r * 0.9;
    p.box([0.015, 0.08, 0.015], [x, top + y + 0.05, z], STEM);
    p.box([0.08, 0.08, 0.08], [x - 0.035, top + y, z], CHERRY);
    p.box([0.08, 0.08, 0.08], [x + 0.04, top + y - 0.02, z + 0.01], CHERRY);
  }
}

function apple(p: PartBuilder, stage: number): void {
  if (stage === 0) {
    p.box([0.035, 0.2, 0.035], [0, 0.1, 0], TRUNK);
    leafRing(p, 2, 0.05, 0.19, [0.11, 0.025, 0.07], [LEAF_LIGHT], 0.2);
    return;
  }
  if (stage === 1) {
    crown(p, 0.42, 0.34, 0.24);
    return;
  }
  // ripe: a sapling with a fuller crown and red apples on it
  crown(p, 0.46, 0.44, 0.32);
  for (const [x, y, z] of [[0.22, 0.56, 0.1], [-0.2, 0.64, 0.13], [0.06, 0.54, 0.21], [-0.1, 0.76, -0.2], [0.16, 0.75, -0.15], [-0.03, 0.84, 0.17]] as const) {
    p.box([0.1, 0.1, 0.1], [x, y, z], APPLE);
    p.box([0.02, 0.04, 0.02], [x, y + 0.07, z], TRUNK);
  }
}

const CROP_BUILDERS = [potato, carrot, cherry, apple];

/** The raised bed: boards round a box of soil, corner posts, a mound in each spot. */
function bed(p: PartBuilder): void {
  const W = 2.92;
  const D = 1.92;
  const T = 0.12;
  const H = 0.42;
  // soil
  p.box([W - 2 * T, SOIL_Y - 0.02, D - 2 * T], [0, (SOIL_Y - 0.02) / 2, 0], SOIL);
  for (const [x, z] of SPOTS) p.box([0.5, 0.05, 0.42], [x, SOIL_Y - 0.005, z], SOIL_DARK);
  // two boards a side, the lower a shade darker
  for (const [y, h, c] of [[0.11, 0.2, BOARD], [0.31, 0.2, WOOD]] as const) {
    p.box([W, h, T], [0, y, D / 2 - T / 2], c);
    p.box([W, h, T], [0, y, -D / 2 + T / 2], c);
    p.box([T, h, D - 2 * T], [W / 2 - T / 2, y, 0], c);
    p.box([T, h, D - 2 * T], [-W / 2 + T / 2, y, 0], c);
  }
  // corner posts, a little taller, with a darker cap
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.07);
      const z = sz * (D / 2 - 0.07);
      p.box([0.17, H + 0.08, 0.17], [x, (H + 0.08) / 2, z], WOOD_DARK);
      p.box([0.13, 0.04, 0.13], [x, H + 0.1, z], WOOD);
    }
  }
}

/** A toy watering can: a teal body, a long spout with a rose forward (+Z), a handle on top. */
function can(p: PartBuilder): void {
  p.box([0.2, 0.2, 0.24], [0, 0.1, 0], TEAL);
  p.box([0.21, 0.04, 0.25], [0, 0.2, 0], MINT);
  p.beam([0, 0.08, 0.1], [0, 0.26, 0.3], 0.05, TEAL);
  p.box([0.08, 0.08, 0.04], [0, 0.27, 0.32], MINT);
  p.box([0.04, 0.1, 0.04], [0, 0.28, -0.06], TEAL);
  p.box([0.04, 0.04, 0.18], [0, 0.33, 0.0], TEAL);
  p.box([0.04, 0.1, 0.04], [0, 0.28, 0.06], TEAL);
}

/** Drops falling from the can: three layers that cycle down. */
function drops(p: PartBuilder, seed: number): void {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9; i++) p.box([0.045, 0.11, 0.045], [(rnd() - 0.5) * 0.5, rnd() * 0.25, (rnd() - 0.5) * 1.1], DROP);
}

const ease = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** How long the can's round takes (seconds). */
const WATER_T = 2.2;
const POP_T = 0.45;
const GROW_T = 0.55;
const CAN_REST = new THREE.Vector3(1.4, 0.42, 0);

export function createGarden(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'garden';
  const kit = new Kit('garden', skin);
  const frame = new THREE.Group();
  root.add(frame);
  const b = kit.part('bed', frame);
  bed(b);
  b.done();

  // the six spots, each with every stage of every crop, all hidden but one
  const spots: THREE.Group[] = [];
  const plants: THREE.Group[][] = [];
  SPOTS.forEach(([x, z], i) => {
    const spot = new THREE.Group();
    spot.position.set(x, SOIL_Y, z);
    spot.rotation.y = TURN[i];
    root.add(spot);
    spots.push(spot);
    const row: THREE.Group[] = [];
    for (let c = 0; c < N_CROPS; c++) {
      for (let st = 0; st < N_STAGES; st++) {
        const g = new THREE.Group();
        g.visible = false;
        spot.add(g);
        const p = kit.part(`crop${c}${st}`, g);
        CROP_BUILDERS[c](p, st);
        p.done();
        row.push(g);
      }
    }
    plants.push(row);
  });

  // the watering can and its drops
  const canPivot = new THREE.Group();
  canPivot.position.copy(CAN_REST);
  root.add(canPivot);
  const cp = kit.part('can', canPivot);
  can(cp);
  cp.done();
  canPivot.rotation.y = 0.5;
  const rain = new THREE.Group();
  rain.visible = false;
  root.add(rain);
  const layers: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    rain.add(g);
    const p = kit.part(`drops${i}`, g);
    drops(p, i + 1);
    p.done();
    layers.push(g);
  }
  markShadows(root);
  root.traverse((o) => {
    // the drops cast no shadow
    if (o.parent && layers.includes(o.parent as THREE.Group)) o.castShadow = false;
  });

  // what is shown, and what the game wants shown
  let shownCrop = 1;
  let shownStage = 2;
  let wantCrop = 1;
  let wantStage = 2;
  let near = false;
  let mode: 'idle' | 'pop' | 'grow' = 'idle';
  let modeT = 0;
  let waterT = Infinity;
  let wiggleT = Infinity;
  let seen: { harvests: number; waters: number; wiggles: number } | null = null;
  let t = 0;

  const show = () => {
    for (const row of plants) row.forEach((g, k) => (g.visible = shownCrop >= 0 && k === shownCrop * N_STAGES + shownStage));
  };
  show();

  return {
    root,
    update(dt, k) {
      t += dt;
      const g = k.garden;
      if (g) {
        wantCrop = g.crop;
        wantStage = Math.max(0, Math.min(2, g.stage));
        near = g.near;
        if (!seen) {
          // the first word: shown as it is, no motion
          seen = { harvests: g.harvests, waters: g.waters, wiggles: g.wiggles };
          shownCrop = wantCrop;
          shownStage = wantStage;
          show();
        }
        if (g.harvests !== seen.harvests && shownCrop >= 0) {
          mode = 'pop';
          modeT = 0;
        }
        if (g.waters !== seen.waters) waterT = 0;
        if (g.wiggles !== seen.wiggles) wiggleT = 0;
        seen.harvests = g.harvests;
        seen.waters = g.waters;
        seen.wiggles = g.wiggles;
      }
      modeT += dt;
      if (mode === 'pop' && modeT >= POP_T) mode = 'idle';
      if (mode !== 'pop' && (wantCrop !== shownCrop || wantStage !== shownStage)) {
        const grew = wantCrop >= 0;
        shownCrop = wantCrop;
        shownStage = wantStage;
        show();
        mode = grew ? 'grow' : 'idle';
        modeT = 0;
      }
      if (mode === 'grow' && modeT >= GROW_T) mode = 'idle';

      // each spot: popping off, growing in, breathing when ripe and near, a wiggle
      wiggleT += dt;
      const wig = wiggleT < 1 ? Math.sin(wiggleT * 28) * 0.22 * Math.exp(-wiggleT * 5) : 0;
      // the bed itself gives a little squash, so a bare one answers a tap too
      const bounce = wiggleT < 0.6 ? Math.sin(wiggleT * 20) * Math.exp(-wiggleT * 7) * 0.08 : 0;
      frame.scale.set(1 + bounce * 0.5, 1 - bounce, 1 + bounce * 0.5);
      spots.forEach((spot, i) => {
        let s = 1;
        let sy = 1;
        let lift = 0;
        if (mode === 'pop') {
          // up with a little jump, then gone
          const a = modeT / POP_T;
          s = a < 0.3 ? 1 + 0.35 * ease(a / 0.3) : 1.35 * (1 - ease((a - 0.3) / 0.7));
          lift = Math.sin(Math.min(1, a) * Math.PI) * 0.35;
        } else if (mode === 'grow') {
          // grows in with a springy overshoot, the spots one after another
          const a = Math.max(0, modeT - i * 0.04) / (GROW_T - 0.2);
          s = a >= 1 ? 1 : Math.max(0.001, 1 - Math.exp(-6 * a) * Math.cos(9 * a));
        } else if (near && shownStage === 2) {
          const b = Math.sin(t * 2.6 + i * 0.7);
          sy = 1 + 0.05 * b;
          s = 1 - 0.015 * b;
        }
        spot.scale.set(s, s * sy, s);
        spot.position.y = SOIL_Y + lift;
        spot.rotation.z = wig * (i % 2 ? 1 : -1);
        spot.rotation.x = wig * 0.5;
      });

      // the can's round: up over the bed, along the rows pouring, back onto the rim
      waterT += dt;
      if (waterT < WATER_T) {
        const a = waterT;
        const up = ease(a / 0.35) * (1 - ease((a - (WATER_T - 0.4)) / 0.4));
        const along = ease((a - 0.35) / (WATER_T - 0.8));
        const x = THREE.MathUtils.lerp(-0.95, 0.95, along);
        canPivot.position.set(THREE.MathUtils.lerp(CAN_REST.x, x, up), THREE.MathUtils.lerp(CAN_REST.y, 1.35, up), THREE.MathUtils.lerp(CAN_REST.z, -0.25, up));
        canPivot.rotation.set(0.75 * up, 0.5 * (1 - up), 0);
        const pouring = a > 0.3 && a < WATER_T - 0.35;
        rain.visible = pouring;
        if (pouring) {
          rain.position.set(canPivot.position.x, SOIL_Y, 0);
          const fall = canPivot.position.y + 0.1 - SOIL_Y;
          layers.forEach((l, i) => (l.position.y = fall * (1 - ((a * 2.4 + i / 3) % 1))));
        }
      } else if (rain.visible || canPivot.position.y !== CAN_REST.y) {
        rain.visible = false;
        canPivot.position.copy(CAN_REST);
        canPivot.rotation.set(0, 0.5, 0);
      }
    },
  };
}
