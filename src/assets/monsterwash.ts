/**
 * The monster wash: a tiny cream car wash that fills the 2×2, closed at the back, a mustard-striped
 * ramp in at the front, a coral roof heaped with white foam, two fat blue brushes turning inside,
 * and a board on the roof with a smiling purple monster's face (no words). On its right side a
 * mustard chute with a couple of coins in the tray: what goes in as a monster comes out as money.
 * Fed, the brushes turn lazily; on a wash they race, the foam swells, the walls shake and coins hop
 * out of the chute. Origin at the floor centre, front towards +Z; no lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, INK, MINT, MUSTARD, SOLAR_BLUE_LIGHT, STEEL, STEEL_DARK, TAU, TEAL, WARM, octagon, powerBulb } from './buildingParts';
import type { PartBuilder } from './parts/kit';
import { Build, HP, finishShadows, tint } from './villages';

const BRUSH_LIGHT = '#7fc0ff';
const BRUSH_DARK = '#1f56b0';
const BACK = '#1f5a56';
const FOAM = '#fffaf2';
const FOAM_BLUE = '#dcefff';
const PURPLE = '#8a5bc4';

/** The arch stands a little left, so the chute fits on the right inside the footprint. */
const ARCH_X = -0.1;
const WALL_L = -0.83;
const WALL_R = 0.63;
const WALL_W = 0.26;
const WALL_H = 1.6;
const DEPTH = 1.84;
const ROOF_Y = 1.72;
const BRUSH_Z = 0.15;
const BRUSH_H = 1.36;
const LAZY = 3.5;
const RACE = 20;
/** How long a wash lasts, and when each coin hops. */
const WASH = 1.5;
const COINS = 6;
const COIN_GAP = 0.13;
const COIN_HOP = 0.65;

const MONSTER = ['...ppp...', '.ppppppp.', 'ppwwpwwpp', 'ppwkpwkpp', 'ppppppppp', 'ppkpppkpp', '.ppkkkpp.'];

/** The heap on the roof: x, y, z, radius, colour. */
const SUDS: readonly (readonly [number, number, number, number, string])[] = [
  [-0.6, 0.1, -0.56, 0.24, FOAM],
  [-0.2, 0.12, -0.6, 0.28, FOAM],
  [0.2, 0.12, -0.58, 0.27, FOAM_BLUE],
  [0.6, 0.1, -0.56, 0.24, FOAM],
  [-0.66, 0.1, -0.12, 0.22, FOAM_BLUE],
  [-0.3, 0.16, -0.14, 0.3, FOAM],
  [0.1, 0.18, -0.12, 0.31, FOAM],
  [0.5, 0.14, -0.14, 0.26, FOAM],
  [-0.12, 0.42, -0.36, 0.22, FOAM],
  [0.24, 0.4, -0.32, 0.2, FOAM_BLUE],
  [-0.42, 0.34, -0.42, 0.17, FOAM],
  [0.46, 0.3, -0.46, 0.16, FOAM],
  [0.02, 0.6, -0.42, 0.14, FOAM],
  [-0.72, 0.06, 0.32, 0.2, FOAM],
  [0.72, 0.06, 0.34, 0.18, FOAM_BLUE],
  [-0.74, 0.05, 0.68, 0.14, FOAM],
  [0.74, 0.05, 0.7, 0.13, FOAM],
];

/** One brush: a fat dark body and rows of soft flaps, with two cream stripes so the turning shows. */
function brush(p: PartBuilder): void {
  p.box([0.08, BRUSH_H + 0.1, 0.08], [0, BRUSH_H / 2, 0], STEEL);
  octagon(p, 0.3, BRUSH_H - 0.1, 0.06, BRUSH_DARK);
  const rows = 8;
  const flaps = 10;
  for (let r = 0; r < rows; r++) {
    const y = 0.1 + (r + 0.5) * ((BRUSH_H - 0.12) / rows);
    for (let f = 0; f < flaps; f++) {
      const a = (f / flaps) * TAU;
      const c = f % 5 === 0 ? CREAM : r % 2 ? SOLAR_BLUE_LIGHT : BRUSH_LIGHT;
      p.box([0.1, 0.14, 0.15], [Math.sin(a) * 0.19, y, Math.cos(a) * 0.19], c, [0, a, 0]);
    }
  }
  p.box([0.2, 0.05, 0.2], [0, BRUSH_H + 0.03, 0], MUSTARD);
}

/** The heap of suds as one smooth mesh. */
function sudsGeo(): THREE.BufferGeometry {
  const parts = SUDS.map(([x, y, z, r, c]) => tint(new THREE.SphereGeometry(r, 14, 10).translate(x, y, z), c));
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

let coinShape: THREE.BufferGeometry | null = null;
let sudsShape: THREE.BufferGeometry | null = null;

export function createMonsterwash(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'monsterwash';
  const b = new Build(skin, 'monsterwash');
  root.add(b.root);

  // the floor, the striped ramp in, the closed back
  b.box([1.96, 0.06, 1.96], [0, 0.03, 0], CHARCOAL);
  b.box([1.2, 0.03, 1.5], [ARCH_X, 0.07, 0.08], MINT);
  for (let i = 0; i < 6; i++) b.box([0.2, 0.04, 0.2], [ARCH_X - 0.5 + i * 0.2, 0.08, 0.86], i % 2 ? CHARCOAL : MUSTARD);
  b.box([1.24, WALL_H - 0.06, 0.1], [ARCH_X, WALL_H / 2 + 0.03, -0.87], BACK);

  // the walls
  for (const x of [WALL_L, WALL_R]) {
    b.box([WALL_W, WALL_H - 0.06, DEPTH], [x, WALL_H / 2 + 0.03, 0], CREAM);
    b.box([WALL_W + 0.02, 0.14, DEPTH + 0.02], [x, 1.12, 0], TEAL);
    b.box([WALL_W + 0.02, 0.1, DEPTH + 0.02], [x, 0.14, 0], CORAL);
  }

  // the roof
  b.box([1.82, 0.08, 1.92], [ARCH_X, 1.62, 0], MUSTARD);
  b.box([1.76, 0.18, 1.86], [ARCH_X, ROOF_Y, 0], CORAL);
  b.box([1.8, 0.03, 1.9], [ARCH_X, 1.8, 0], CORAL_DARK);

  // the bar the brushes hang from
  b.box([1.24, 0.06, 0.08], [ARCH_X, 1.54, BRUSH_Z], STEEL_DARK);

  // the board on the roof, a monster's smile on it
  b.box([0.98, 0.76, 0.08], [ARCH_X, 2.16, 0.72], MUSTARD);
  b.box([0.9, 0.68, 0.1], [ARCH_X, 2.16, 0.72], CREAM);
  for (const s of [-1, 1]) b.box([0.08, 0.1, 0.08], [ARCH_X + s * 0.34, 1.8, 0.72], STEEL_DARK);
  b.p.pixels(MONSTER, { p: PURPLE, w: '#ffffff', k: INK }, [ARCH_X - 0.36, 2.44, 0.77], 0.08, 0.02);

  // the chute on the right side: a dark mouth, a slanted mustard trough, a tray at the bottom
  const CZ = 0.3;
  b.box([0.03, 0.34, 0.42], [0.77, 0.86, CZ], CORAL);
  b.box([0.03, 0.24, 0.32], [0.78, 0.86, CZ], CHARCOAL);
  b.beam([0.77, 0.78, CZ], [0.95, 0.3, CZ], 0.05, MUSTARD, 0.36);
  for (const s of [-1, 1]) b.beam([0.77, 0.84, CZ + s * 0.17], [0.96, 0.34, CZ + s * 0.17], 0.03, CORAL, 0.05);
  b.box([0.24, 0.05, 0.44], [0.87, 0.09, CZ], MUSTARD);
  b.box([0.03, 0.12, 0.44], [0.98, 0.14, CZ], CORAL);
  b.cyl(0.09, 0.03, [0.85, 0.13, CZ - 0.06], WARM, { seg: 14 });
  b.cyl(0.09, 0.03, [0.87, 0.16, CZ + 0.02], WARM, { seg: 14 });

  // the brushes
  const brushes = [ARCH_X - 0.33, ARCH_X + 0.33].map((x) => {
    const g = new THREE.Group();
    g.position.set(x, 0.1, BRUSH_Z);
    b.root.add(g);
    brush(b.part('brush', g));
    return g;
  });

  // the foam on the roof: a heap of round suds that swells on a wash
  const foam = new THREE.Mesh((sudsShape ??= sudsGeo()), b.kit.vertexColourMaterial(false));
  foam.position.set(ARCH_X, 1.8, 0);
  foam.castShadow = true;
  b.root.add(foam);

  // foam running down over the front edge of the roof
  for (const [x, y, r] of [
    [WALL_L - 0.02, 1.62, 0.1],
    [WALL_L + 0.1, 1.56, 0.08],
    [WALL_R, 1.6, 0.09],
  ] as const) {
    b.ball(r, [x, y, 0.94], FOAM, { seg: 10 });
  }

  const bulb = powerBulb(skin, b.root, [WALL_R, 0.5, DEPTH / 2]);
  b.finish();

  // the coins that hop out: one instanced draw
  coinShape ??= new THREE.CylinderGeometry(0.11, 0.11, 0.035, 14).rotateX(HP);
  const coins = new THREE.InstancedMesh(coinShape, skin.partMaterial(WARM), COINS);
  coins.frustumCulled = false;
  coins.visible = false;
  root.add(coins);

  finishShadows(root);
  coins.castShadow = true;

  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let t = 0;
  let speed = 0;
  let race = 0;
  return {
    root,
    socket: new THREE.Vector3(WALL_R, 1.82, -0.7),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = !!pw?.on;
      const p = live ? (k.pulse ?? Infinity) : Infinity;
      const washing = p < WASH;
      speed += ((live ? (washing ? RACE : LAZY) : 0) - speed) * Math.min(1, dt * 5);
      race += ((washing ? 1 : 0) - race) * Math.min(1, dt * 6);
      brushes[0].rotation.y += speed * dt;
      brushes[1].rotation.y -= speed * dt;
      for (const g of brushes) {
        g.scale.x = g.scale.z = 1 + race * 0.1;
      }

      // the foam breathes while it works and swells on a wash; the walls shake a little
      const breath = live ? 0.02 * Math.sin(t * 2.6) : 0;
      foam.scale.set(1 + breath + race * 0.06, 1 - breath + race * 0.22, 1 + breath + race * 0.06);
      b.root.position.x = race * 0.012 * Math.sin(t * 46);

      // the coins: each hops off the tray, out to the right and forward, and is gone
      coins.visible = p < COIN_GAP * COINS + COIN_HOP;
      if (!coins.visible) return;
      for (let i = 0; i < COINS; i++) {
        const u = (p - 0.15 - i * COIN_GAP) / COIN_HOP;
        if (u < 0 || u >= 1) {
          coins.setMatrixAt(i, m4.makeScale(0, 0, 0));
          continue;
        }
        const side = i % 3;
        pos.set(0.95 + u * (0.42 + 0.14 * side), 0.2 + 4 * (0.62 + 0.1 * side) * u * (1 - u), 0.3 + u * (0.1 + 0.28 * (i % 4)));
        q.setFromEuler(e.set(0.3, u * 9 + i, 0));
        scl.setScalar(Math.min(1, (1 - u) * 6));
        coins.setMatrixAt(i, m4.compose(pos, q, scl));
      }
      coins.instanceMatrix.needsUpdate = true;
    },
  };
}
