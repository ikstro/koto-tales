/**
 * Collectable items: small props, 0.4–0.6 blocks, origin at the bottom centre,
 * front facing +Z. One mesh per colour; geometry cached across skins.
 */
import * as THREE from 'three';
import type { ItemId, Skin } from '../contracts';
import { Kit, type PartBuilder } from './parts/kit';

type Builder = (p: PartBuilder) => void;

const GOLD = '#ffc928';
const GOLD_DARK = '#e39a12';
const STEM_GREEN = '#43a047';
const LEAF_GREEN = '#66bb6a';

function crystal(color: string, light: string): Builder {
  const glow = { c: color, glow: true };
  const shine = { c: light, glow: true };
  return (p) =>
    p
      .box([0.36, 0.07, 0.3], [0, 0.035, 0], '#8d8a99')
      .box([0.26, 0.05, 0.22], [0.02, 0.09, -0.01], '#a9a6b6')
      .box([0.15, 0.34, 0.15], [0, 0.26, 0], glow, [0, Math.PI / 4, 0])
      .box([0.1, 0.1, 0.1], [0, 0.46, 0], glow, [0, Math.PI / 4, 0])
      .box([0.05, 0.05, 0.05], [0, 0.535, 0], shine, [0, Math.PI / 4, 0])
      .box([0.1, 0.22, 0.1], [0.11, 0.17, 0.04], glow, [0, Math.PI / 4, -0.45])
      .box([0.09, 0.18, 0.09], [-0.11, 0.15, -0.03], glow, [0, Math.PI / 4, 0.5])
      .box([0.03, 0.2, 0.03], [-0.03, 0.27, 0.075], shine, [0, 0, 0]);
}

function mushroom(cap: string, spot: string | null): Builder {
  return (p) => {
    p.box([0.14, 0.22, 0.14], [0, 0.11, 0], '#f3ead7')
      .box([0.18, 0.04, 0.18], [0, 0.02, 0], '#e6dcc4')
      .box([0.5, 0.08, 0.5], [0, 0.24, 0], cap)
      .box([0.42, 0.08, 0.42], [0, 0.31, 0], cap)
      .box([0.3, 0.07, 0.3], [0, 0.375, 0], cap)
      .box([0.14, 0.04, 0.14], [0, 0.42, 0], cap);
    if (spot) {
      // spots on the top tiers, scattered so they never read as a face
      p.box([0.07, 0.02, 0.07], [0.06, 0.415, 0.08], spot)
        .box([0.06, 0.02, 0.06], [-0.09, 0.415, -0.02], spot)
        .box([0.05, 0.02, 0.05], [0.17, 0.355, -0.12], spot)
        .box([0.06, 0.02, 0.06], [-0.18, 0.355, 0.15], spot)
        .box([0.05, 0.02, 0.05], [0.19, 0.285, 0.17], spot)
        .box([0.05, 0.02, 0.05], [-0.04, 0.42, -0.1], spot);
    }
  };
}

function flower(petal: string, centre: string): Builder {
  return (p) => {
    p.box([0.04, 0.34, 0.04], [0, 0.17, 0], STEM_GREEN)
      .box([0.14, 0.03, 0.06], [0.07, 0.1, 0], LEAF_GREEN, [0, 0, 0.45])
      .box([0.12, 0.03, 0.06], [-0.06, 0.17, 0], LEAF_GREEN, [0, 0, -0.45]);
    // head tilted back a little so it faces the camera above
    const cy = 0.37;
    const tilt: [number, number, number] = [-0.5, 0, 0];
    const at = (x: number, y: number, z = 0): [number, number, number] => {
      const v = new THREE.Vector3(x, y, z).applyEuler(new THREE.Euler(...tilt));
      return [v.x, v.y + cy, v.z];
    };
    p.box([0.08, 0.08, 0.06], at(0, 0, 0.01), centre, tilt);
    for (const [x, y] of [
      [0.085, 0],
      [-0.085, 0],
      [0, 0.085],
      [0, -0.085],
    ]) {
      p.box([0.09, 0.09, 0.04], at(x, y), petal, tilt);
    }
    for (const [x, y] of [
      [0.07, 0.07],
      [-0.07, 0.07],
      [0.07, -0.07],
      [-0.07, -0.07],
    ]) {
      p.box([0.06, 0.06, 0.035], at(x, y, -0.005), petal, tilt);
    }
  };
}

const ITEM_BUILDERS: Record<ItemId, Builder> = {
  coin: (p) =>
    p
      .box([0.42, 0.24, 0.07], [0, 0.22, 0], GOLD)
      .box([0.24, 0.42, 0.07], [0, 0.22, 0], GOLD)
      .box([0.34, 0.34, 0.07], [0, 0.22, 0], GOLD)
      .box([0.16, 0.16, 0.085], [0, 0.22, 0], GOLD_DARK)
      .box([0.06, 0.22, 0.09], [0, 0.22, 0], GOLD_DARK),
  crystal_red: crystal('#ff4d5a', '#ffc2c6'),
  crystal_blue: crystal('#3fa9ff', '#c9e9ff'),
  crystal_green: crystal('#3fdc7a', '#c8ffd9'),
  crystal_purple: crystal('#b25cff', '#ead2ff'),
  crystal_yellow: crystal('#ffd92e', '#fff6c2'),
  apple: (p) =>
    p
      .box([0.38, 0.24, 0.38], [0, 0.18, 0], '#e53935')
      .box([0.3, 0.36, 0.3], [0, 0.2, 0], '#e53935')
      .box([0.2, 0.04, 0.2], [0, 0.02, 0], '#c62828')
      .box([0.14, 0.04, 0.14], [0, 0.385, 0], '#c62828')
      .box([0.05, 0.08, 0.012], [-0.1, 0.24, 0.192], '#ff9e94')
      .box([0.035, 0.1, 0.035], [0, 0.41, 0], '#6d4c2f')
      .box([0.13, 0.03, 0.07], [0.07, 0.42, 0], LEAF_GREEN, [0, 0, 0.4]),
  mushroom_red: mushroom('#e53935', '#ffffff'),
  mushroom_brown: mushroom('#9c7258', '#c9a98f'),
  feather: (p) => {
    const tilt: [number, number, number] = [0, 0, 0.3];
    const e = new THREE.Euler(...tilt);
    const at = (x: number, y: number): [number, number, number] => {
      const v = new THREE.Vector3(x, y, 0).applyEuler(e);
      return [v.x + 0.07, v.y, v.z];
    };
    p.box([0.025, 0.56, 0.03], at(0, 0.28), '#f5f5f5', tilt);
    const widths = [0.12, 0.16, 0.18, 0.18, 0.16, 0.13, 0.08];
    widths.forEach((w, i) => {
      const y = 0.15 + i * 0.055;
      const col = i >= 5 ? '#64b5f6' : '#e3f2fd';
      p.box([w, 0.06, 0.02], at(-0.01, y), col, tilt);
    });
  },
  earth_seed: (p) =>
    p
      .box([0.4, 0.04, 0.4], [0, 0.02, 0], { c: '#2e7d32', glow: true })
      .box([0.22, 0.24, 0.22], [0, 0.2, 0], { c: '#7cff3a', glow: true })
      .box([0.28, 0.16, 0.28], [0, 0.18, 0], { c: '#7cff3a', glow: true })
      .box([0.12, 0.08, 0.12], [0, 0.34, 0], { c: '#7cff3a', glow: true })
      .box([0.06, 0.06, 0.012], [-0.06, 0.24, 0.146], { c: '#f4ffb0', glow: true })
      .box([0.03, 0.1, 0.03], [0, 0.42, 0], STEM_GREEN)
      .box([0.12, 0.025, 0.06], [0.06, 0.47, 0], LEAF_GREEN, [0, 0, 0.45])
      .box([0.1, 0.025, 0.05], [-0.05, 0.46, 0], LEAF_GREEN, [0, 0, -0.45])
      .box([0.045, 0.045, 0.045], [0.22, 0.32, 0.06], { c: '#fff59d', glow: true }, [0.6, 0.6, 0])
      .box([0.035, 0.035, 0.035], [-0.2, 0.12, 0.1], { c: '#fff59d', glow: true }, [0.6, 0.6, 0])
      .box([0.04, 0.04, 0.04], [-0.06, 0.5, -0.18], { c: '#fff59d', glow: true }, [0.6, 0.6, 0]),
  key_gold: (p) =>
    p
      // bow (a square ring) on top, shaft, two teeth
      .box([0.22, 0.05, 0.05], [0, 0.52, 0], GOLD)
      .box([0.22, 0.05, 0.05], [0, 0.34, 0], GOLD)
      .box([0.05, 0.2, 0.05], [0.085, 0.43, 0], GOLD)
      .box([0.05, 0.2, 0.05], [-0.085, 0.43, 0], GOLD)
      .box([0.06, 0.06, 0.03], [0, 0.43, 0], { c: '#4fc3f7', glow: true })
      .box([0.05, 0.33, 0.05], [0, 0.165, 0], GOLD)
      .box([0.09, 0.045, 0.05], [0.065, 0.03, 0], GOLD_DARK)
      .box([0.07, 0.04, 0.05], [0.055, 0.11, 0], GOLD_DARK),
  flower_yellow: flower('#ffe23b', '#ff8f00'),
  flower_blue: flower('#64b5f6', '#fff8e1'),
};

export const ITEM_IDS = Object.keys(ITEM_BUILDERS) as ItemId[];

/** Builds one item template (callers clone it). */
export function buildItem(id: ItemId, skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = `item:${id}`;
  const build = ITEM_BUILDERS[id];
  if (!build) throw new Error(`no item model for "${id}"`);
  const kit = new Kit(`item:${id}`, skin);
  const p = kit.part('item', g);
  build(p);
  p.done();
  return g;
}
