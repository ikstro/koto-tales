/**
 * Collectable items: small props, 0.4–0.6 blocks, origin at the bottom centre,
 * front facing +Z. One mesh per colour; geometry cached across skins.
 */
import * as THREE from 'three';
import type { ItemId, Skin } from '../contracts';
import { Kit, type PartBuilder, type Paint, type V3 } from './parts/kit';

type Builder = (p: PartBuilder) => void;

const GOLD = '#ffc928';
const GOLD_DARK = '#e39a12';
const STEM_GREEN = '#43a047';
const LEAF_GREEN = '#66bb6a';
const WOOD = '#8a5a2b';
const WOOD_LIGHT = '#b07a3e';
const VINYL = '#1d1a19';
const GROOVE = '#3a3532';
const STEAM: Paint = { c: '#ffffff', clear: true };

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

/** A flat round piece facing +Z (strips through the centre make a 24-sided disc); `tilt` leans it back. */
export function roundFace(p: PartBuilder, d: number, at: V3, depth: number, paint: Paint, tilt = 0): void {
  const w = d * Math.tan(Math.PI / 24);
  for (let k = 0; k < 12; k++) p.box([d, w, depth], at, paint, [tilt, 0, (k * Math.PI) / 12]);
}

/** A round drum along `axis` (strips through the centre, like `roundFace`), `h` long. */
function drumAlong(p: PartBuilder, d: number, at: V3, h: number, paint: Paint, axis: V3): void {
  const w = d * Math.tan(Math.PI / 24);
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis).normalize());
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let k = 0; k < 12; k++) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (k * Math.PI) / 12).premultiply(lean);
    e.setFromQuaternion(q, 'XYZ');
    p.box([d, h, w], at, paint, [e.x, e.y, e.z]);
  }
}

/** A flat flower facing +Z (`rot` turns it): `n` petals round an eye. */
export function bloom(p: PartBuilder, at: V3, d: number, petal: Paint, eye: Paint, n = 8, rot: V3 = [0, 0, 0]): void {
  const e = new THREE.Euler(...rot);
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n;
    v.set(Math.cos(a) * d * 0.31, Math.sin(a) * d * 0.31, 0).applyEuler(e);
    p.box([d * 0.4, (d * 1.5) / n, d * 0.1], [at[0] + v.x, at[1] + v.y, at[2] + v.z], petal, [rot[0], rot[1], a]);
  }
  v.set(0, 0, d * 0.05).applyEuler(e);
  p.box([d * 0.3, d * 0.3, d * 0.12], [at[0] + v.x, at[1] + v.y, at[2] + v.z], eye, rot);
}

/** One level of something round: six strips through the centre make a twelve-sided slab `w` across. */
function slab(p: PartBuilder, w: number, h: number, at: V3, paint: Paint): void {
  for (let k = 0; k < 6; k++) p.box([w, h, w * Math.tan(Math.PI / 12)], at, paint, [0, (k * Math.PI) / 6, 0]);
}

/** A plump round lump: a ball of slabs. */
function puff(p: PartBuilder, d: number, at: V3, paint: Paint): void {
  for (const [y, r] of [
    [-0.4, 0.6],
    [-0.21, 0.88],
    [0, 1],
    [0.21, 0.88],
    [0.4, 0.6],
  ]) {
    slab(p, d * r, d * 0.21, [at[0], at[1] + y * d, at[2]], paint);
  }
}

/** A record standing on edge in a little wooden stand, leaning back: black vinyl, grooves, a label in its colour. */
function record(label: string): Builder {
  const tilt = -0.14;
  const at: V3 = [0, 0.29, 0];
  return (p) => {
    p.box([0.36, 0.05, 0.2], [0, 0.025, 0], WOOD)
      .box([0.22, 0.07, 0.03], [0, 0.085, 0.075], WOOD_LIGHT)
      .box([0.22, 0.12, 0.03], [0, 0.11, -0.01], WOOD_LIGHT);
    // black vinyl with fine pale grooves, each ring a step thicker so both sides show them
    roundFace(p, 0.46, at, 0.03, VINYL, tilt);
    [0.41, 0.34, 0.27].forEach((d, i) => {
      roundFace(p, d, at, 0.034 + i * 0.008, GROOVE, tilt);
      roundFace(p, d - 0.014, at, 0.038 + i * 0.008, VINYL, tilt);
    });
    roundFace(p, 0.17, at, 0.06, label, tilt);
    roundFace(p, 0.04, at, 0.066, '#fff4d8', tilt);
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
  // «Серце Пожирача»: a chunky slate stone heart with glowing amber cracks and a hot core
  eater_heart: (p) => {
    const stone = '#4f555e';
    const dark = '#3b4048';
    const amber = { c: '#ffa526', glow: true };
    const hot = { c: '#ffe27a', glow: true };
    p.box([0.3, 0.05, 0.26], [0, 0.025, 0], '#6c727b')
      // the heart: two lobes on top, tapering to a point below
      .box([0.2, 0.18, 0.2], [-0.1, 0.42, 0], stone)
      .box([0.2, 0.18, 0.2], [0.1, 0.42, 0], stone)
      .box([0.4, 0.14, 0.2], [0, 0.32, 0], stone)
      .box([0.3, 0.1, 0.2], [0, 0.22, 0], dark)
      .box([0.18, 0.08, 0.18], [0, 0.13, 0], dark)
      .box([0.08, 0.06, 0.14], [0, 0.08, 0], dark)
      // glowing cracks on the front and a hot core showing through
      .box([0.12, 0.12, 0.012], [0.02, 0.32, 0.104], hot)
      .box([0.03, 0.14, 0.012], [-0.08, 0.38, 0.104], amber, [0, 0, 0.5])
      .box([0.03, 0.12, 0.012], [0.1, 0.24, 0.104], amber, [0, 0, -0.6])
      .box([0.03, 0.1, 0.012], [0.12, 0.44, 0.104], amber, [0, 0, 0.3])
      .box([0.03, 0.1, 0.012], [-0.04, 0.17, 0.094], amber, [0, 0, -0.3])
      .box([0.012, 0.1, 0.03], [0.205, 0.36, 0.02], amber)
      .box([0.012, 0.1, 0.03], [-0.205, 0.32, -0.02], amber)
      .box([0.045, 0.045, 0.045], [0.2, 0.52, 0.06], hot, [0.6, 0.6, 0])
      .box([0.035, 0.035, 0.035], [-0.22, 0.2, 0.08], hot, [0.6, 0.6, 0]);
  },
  // A heart that gives a heart back: bright toy-red, softly glowing so it is easy to spot.
  heart: (p) => {
    const red = { c: '#ff4d6d', glow: true };
    const deep = { c: '#e0304f', glow: true };
    p.box([0.18, 0.16, 0.16], [-0.09, 0.44, 0], red)
      .box([0.18, 0.16, 0.16], [0.09, 0.44, 0], red)
      .box([0.36, 0.12, 0.16], [0, 0.34, 0], red)
      .box([0.26, 0.1, 0.16], [0, 0.24, 0], deep)
      .box([0.14, 0.08, 0.16], [0, 0.155, 0], deep)
      .box([0.06, 0.06, 0.14], [0, 0.1, 0], deep)
      .box([0.06, 0.06, 0.012], [-0.1, 0.47, 0.085], { c: '#ffd1da', glow: true });
  },
  // Бабусин пиріжок: a golden pasty with a crimped ridge and a curl of steam, on a coral-checked napkin
  babusia_pie: (p) => {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) p.box([0.11, 0.025, 0.11], [(i - 2) * 0.11, 0.0125, (j - 2) * 0.11], (i + j) % 2 ? '#e0583f' : '#fff4d8');
    }
    // the pasty: thin slices along its length, an oval from above and a dome from the side
    const L = 0.25;
    for (let i = 0; i < 13; i++) {
      const x = (i - 6) * 0.04;
      const k = Math.sqrt(Math.max(0, 1 - (x / L) ** 2));
      const h = 0.05 + 0.15 * k;
      p.box([0.042, h * 0.55, 0.08 + 0.2 * k], [x, 0.025 + h * 0.275, 0], '#d9902a');
      p.box([0.042, h * 0.8, 0.06 + 0.15 * k], [x, 0.025 + h * 0.4, 0], '#e8a93a');
      p.box([0.042, h, 0.04 + 0.09 * k], [x, 0.025 + h * 0.5, 0], '#f2bd55');
      // the crimped ridge along the top: a rope of little slanted pinches
      if (i > 0 && i < 12) p.box([0.024, 0.04, 0.1], [x, 0.03 + h, 0], '#c97f24', [0, 0.65, 0]);
    }
    // a little curl of steam, see-through and thinning as it rises
    const curl = (s: number): V3 => [0.02 + 0.055 * Math.sin(s * 7.5), 0.25 + s * 0.27, 0.01];
    for (let i = 0; i < 9; i++) p.beam(curl(i / 9), curl((i + 1) / 9), 0.038 - i * 0.002, STEAM);
  },
  // Кишенькова колонка: a round-cornered teal speaker, one big cone, a tiny mustard button, a carrying loop
  pocket_speaker: (p) => {
    const teal = '#2f918b';
    p.box([0.46, 0.34, 0.2], [0, 0.21, 0], teal)
      .box([0.38, 0.42, 0.2], [0, 0.21, 0], teal)
      .box([0.43, 0.39, 0.2], [0, 0.21, 0], teal)
      .box([0.34, 0.03, 0.14], [0, 0.015, 0], '#226e69');
    // the loop on top, a stud at each foot of it
    p.box([0.07, 0.03, 0.09], [-0.11, 0.43, 0], '#226e69')
      .box([0.07, 0.03, 0.09], [0.11, 0.43, 0], '#226e69')
      .box([0.04, 0.08, 0.05], [-0.11, 0.47, 0], '#ffe3a3')
      .box([0.04, 0.08, 0.05], [0.11, 0.47, 0], '#ffe3a3')
      .box([0.26, 0.04, 0.05], [0, 0.52, 0], '#ffe3a3');
    // the cone: dark ring, grey bowl, a cream cap
    const at = (z: number): V3 => [-0.01, 0.2, z];
    roundFace(p, 0.34, at(0.105), 0.02, '#1d1a19');
    roundFace(p, 0.3, at(0.112), 0.02, '#ffe3a3');
    roundFace(p, 0.27, at(0.118), 0.02, '#4a4440');
    roundFace(p, 0.19, at(0.122), 0.02, '#2e2a28');
    roundFace(p, 0.1, at(0.13), 0.03, '#ffe3a3');
    p.box([0.05, 0.05, 0.02], [0.17, 0.355, 0.105], '#eab02b');
  },
  // Платівка польки: a record with a coral label on its little stand
  disc_polka: record('#e0583f'),
  // Платівка вальсу: a record with a sky-blue label on its little stand
  disc_waltz: record('#6fb7ff'),
  // Платівка твісту: a record with a mustard label on its little stand
  disc_twist: record('#eab02b'),
  // Кишенькова хмаринка: a plump white toy cloud with three blue drops hanging under it
  pocket_cloud: (p) => {
    const white = '#fbfdff';
    p.box([0.4, 0.05, 0.18], [0, 0.25, 0], '#d3e4f4');
    puff(p, 0.27, [-0.16, 0.34, 0], white);
    puff(p, 0.25, [0.17, 0.335, 0.01], white);
    puff(p, 0.33, [-0.01, 0.4, 0], white);
    puff(p, 0.2, [0.08, 0.33, 0.1], white);
    puff(p, 0.19, [-0.09, 0.33, -0.1], white);
    const blue = '#3f9bf0';
    for (const [x, y, z] of [
      [-0.14, 0.05, 0.03],
      [0.0, 0.0, 0.05],
      [0.14, 0.035, 0.0],
    ]) {
      // a teardrop, its point up towards the cloud, a tiny pale glint
      for (const [dy, w] of [
        [0.014, 0.06],
        [0.042, 0.105],
        [0.074, 0.115],
        [0.104, 0.09],
        [0.134, 0.062],
        [0.164, 0.036],
        [0.19, 0.016],
      ]) {
        slab(p, w, 0.032, [x, y + dy, z], blue);
      }
      p.box([0.018, 0.032, 0.012], [x - 0.02, y + 0.08, z + 0.05], '#cfeaff');
    }
  },
  // Чарівна лійка: a green toy watering can, a daisy on its side, mint sparkles off its rose
  magic_can: (p) => {
    const green = '#3fa142';
    const dark = '#2c7a30';
    const x = -0.06;
    const up = -Math.PI / 2;
    roundFace(p, 0.32, [x, 0.02, 0], 0.04, dark, up);
    roundFace(p, 0.3, [x, 0.16, 0], 0.26, green, up);
    roundFace(p, 0.32, [x, 0.295, 0], 0.03, dark, up);
    roundFace(p, 0.24, [x, 0.308, 0], 0.012, '#1f4f22', up);
    // the spout and its mustard rose
    p.beam([0.04, 0.09, 0], [0.235, 0.3, 0], 0.075, green)
      .beam([0.04, 0.05, 0], [0.13, 0.15, 0], 0.06, dark)
      .beam([0.225, 0.29, 0], [0.265, 0.33, 0], 0.13, '#eab02b')
      .beam([0.26, 0.325, 0], [0.272, 0.337, 0], 0.095, '#b98514');
    // the hoop handle over the back
    const hoop: V3[] = [
      [x - 0.14, 0.09, 0],
      [x - 0.215, 0.16, 0],
      [x - 0.215, 0.29, 0],
      [x - 0.15, 0.385, 0],
      [x - 0.03, 0.4, 0],
      [x + 0.05, 0.31, 0],
    ];
    hoop.slice(1).forEach((b, i) => p.beam(hoop[i], b, 0.042, dark));
    bloom(p, [x, 0.165, 0.152], 0.2, '#fff9ec', '#ffd23a');
    const mint = { c: '#b6ffd0', glow: true };
    p.box([0.04, 0.04, 0.04], [0.33, 0.27, 0.02], mint, [0.6, 0.6, 0])
      .box([0.032, 0.032, 0.032], [0.3, 0.19, -0.02], mint, [0.6, 0.6, 0])
      .box([0.03, 0.03, 0.03], [0.34, 0.39, 0.03], mint, [0.6, 0.6, 0]);
  },
  // Бабусина котлетка: a golden-brown oval cutlet on a little cream plate with a coral line, a green sprig lying on it
  babusia_cutlet: (p) => {
    const up = -Math.PI / 2;
    roundFace(p, 0.34, [0, 0.012, 0], 0.024, '#e6d3ab', up);
    roundFace(p, 0.56, [0, 0.036, 0], 0.024, '#fff4d8', up);
    roundFace(p, 0.49, [0, 0.0495, 0], 0.005, '#e0583f', up);
    roundFace(p, 0.47, [0, 0.0515, 0], 0.006, '#fbeccb', up);
    // the cutlet: four oval levels, each a row of thin strips, browner underneath
    const H = 0.13;
    ['#8e5220', '#a8672a', '#bd7d35', '#cf9444'].forEach((c, j) => {
      const s = Math.sqrt(1 - (j / 4) ** 2);
      for (let i = 0; i < 13; i++) {
        const x = (i - 6) * 0.034;
        const k = 1 - (x / (0.215 * s)) ** 2;
        if (k > 0) p.box([0.036, H / 4, 0.31 * s * Math.sqrt(k)], [x, 0.056 + ((j + 0.5) * H) / 4, 0], c);
      }
    });
    // crumbs of the golden crust
    for (const [x, y, z, c] of [
      [-0.1, 0.168, 0.04, '#e5b35e'],
      [-0.03, 0.19, -0.05, '#e5b35e'],
      [-0.07, 0.178, -0.02, '#8e5220'],
      [0.03, 0.188, 0.06, '#8e5220'],
      [0.12, 0.16, 0.03, '#e5b35e'],
      [0.15, 0.135, -0.04, '#8e5220'],
      [-0.15, 0.135, -0.03, '#e5b35e'],
    ] as const) {
      p.box([0.03, 0.018, 0.03], [x, y, z], c, [0, x * 9, 0]);
    }
    // the sprig lying on top: a stalk, two side stalks and three curly tufts
    const stalk = '#43a047';
    p.beam([-0.05, 0.195, 0.03], [0.09, 0.215, -0.03], 0.02, stalk)
      .beam([0.0, 0.2, 0.01], [0.03, 0.22, 0.07], 0.016, stalk)
      .beam([0.03, 0.205, -0.005], [0.02, 0.22, -0.08], 0.016, stalk);
    puff(p, 0.085, [0.105, 0.225, -0.035], '#3fa142');
    puff(p, 0.07, [0.035, 0.228, 0.08], '#66bb6a');
    puff(p, 0.07, [0.02, 0.228, -0.09], '#66bb6a');
  },
  // Супер-ліхтарик: a chunky mustard hand torch lying on its side, a coral switch, its big lens glowing
  super_torch: (p) => {
    const axis: V3 = [-0.78, 0.2, 0.59];
    const at = (s: number): V3 => [0.22 + axis[0] * s, 0.105 + axis[1] * s, -0.16 + axis[2] * s];
    const mustard = '#eab02b';
    const dark = '#4a2c14';
    drumAlong(p, 0.17, at(0.01), 0.05, dark, axis);
    drumAlong(p, 0.2, at(0.16), 0.26, mustard, axis);
    for (const s of [0.07, 0.125]) drumAlong(p, 0.215, at(s), 0.024, dark, axis);
    drumAlong(p, 0.24, at(0.3), 0.05, mustard, axis);
    drumAlong(p, 0.29, at(0.365), 0.09, '#ffd23a', axis);
    drumAlong(p, 0.315, at(0.415), 0.03, '#e0583f', axis);
    drumAlong(p, 0.25, at(0.432), 0.012, { c: '#ffe9a0', glow: true }, axis);
    drumAlong(p, 0.13, at(0.438), 0.012, { c: '#fffdf0', glow: true }, axis);
    // the big coral switch on top
    const sw = at(0.215);
    p.box([0.11, 0.04, 0.07], [sw[0], sw[1] + 0.1, sw[2]], '#e0583f', [0, 0.64, -0.2]);
  },
  // Морозилка-хлопавка: an ice-blue party popper with a chunky snowflake, a coral pull ring, icy bits flying off
  freeze_popper: (p) => {
    const roll = 0.38;
    const at = (s: number, z = 0): V3 => [-0.12 + s * Math.sin(roll), 0.075 + s * Math.cos(roll), z];
    const axis: V3 = [Math.sin(roll), Math.cos(roll), 0];
    const stripes = ['#8fe3ff', '#59bfe8'];
    for (let i = 0; i < 8; i++) drumAlong(p, 0.11 + i * 0.03, at(i * 0.055), 0.058, stripes[i % 2], axis);
    drumAlong(p, 0.36, at(0.43), 0.04, '#ffffff', axis);
    drumAlong(p, 0.29, at(0.446), 0.012, '#2f7fb0', axis);
    // the chunky snowflake on the front: three bars and a pair of little arms on each end
    const c = at(0.25, 0.122);
    const white = '#ffffff';
    const v = new THREE.Vector3();
    const e = new THREE.Euler(0.22, 0, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 - roll;
      if (k < 3) p.box([0.18, 0.032, 0.022], c, white, [0.22, 0, a]);
      for (const side of [-1, 1]) {
        v.set(Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0).applyEuler(e);
        p.box([0.05, 0.022, 0.02], [c[0] + v.x, c[1] + v.y, c[2] + v.z], white, [0.22, 0, a + side * 1.05]);
      }
    }
    // the pull string and its ring, lying by the tip
    const coral = '#e0583f';
    p.beam([-0.12, 0.06, 0], [-0.2, 0.03, 0.02], 0.022, coral)
      .box([0.11, 0.02, 0.026], [-0.25, 0.013, 0.07], coral)
      .box([0.11, 0.02, 0.026], [-0.25, 0.013, -0.02], coral)
      .box([0.026, 0.02, 0.11], [-0.3, 0.013, 0.025], coral)
      .box([0.026, 0.02, 0.11], [-0.2, 0.013, 0.025], coral);
    // little icy bits just leaving the mouth
    const ice = { c: '#d7f8ff', glow: true };
    p.box([0.05, 0.05, 0.05], [0.13, 0.57, 0.03], ice, [0.6, 0.6, 0])
      .box([0.04, 0.04, 0.04], [0.25, 0.54, -0.02], ice, [0.6, 0.6, 0])
      .box([0.035, 0.035, 0.035], [0.2, 0.61, 0.06], ice, [0.6, 0.6, 0])
      .box([0.04, 0.04, 0.04], [0.04, 0.56, -0.05], ice, [0.6, 0.6, 0])
      .box([0.03, 0.03, 0.03], [0.3, 0.46, 0.04], ice, [0.6, 0.6, 0]);
  },
  // Гумова рибка: a bright yellow rubber fish with big coral lips and one surprised round eye on each side
  rubber_fish: (p) => {
    const yellow = '#ffd92e';
    const belly = '#fff0a6';
    const coral = '#e8463a';
    const y = 0.205;
    const L = 0.235;
    for (let i = 0; i < 12; i++) {
      const x = (i - 5.5) * 0.04;
      const k = Math.sqrt(Math.max(0, 1 - (x / L) ** 2));
      const h = 0.1 + 0.3 * k;
      const w = 0.08 + 0.2 * k;
      p.box([0.042, h * 0.72, w], [x, y, 0], yellow)
        .box([0.042, h, w * 0.72], [x, y, 0], yellow)
        .box([0.042, h * 0.86, w * 0.88], [x, y, 0], yellow)
        .box([0.042, 0.04, w * 0.6], [x, y - h * 0.47, 0], belly);
    }
    // the tail fan behind, a coral fin on top, a little fin on each side
    p.beam([0.21, y, 0], [0.34, y + 0.17, 0], 0.09, yellow, 0.06)
      .beam([0.21, y, 0], [0.34, y - 0.15, 0], 0.09, yellow, 0.06)
      .box([0.05, 0.13, 0.05], [0.22, y, 0], '#f0b51e')
      .beam([0.1, 0.38, 0], [0.03, 0.46, 0], 0.06, coral, 0.04)
      .beam([-0.02, 0.385, 0], [0.03, 0.46, 0], 0.06, coral, 0.04)
      .box([0.1, 0.03, 0.04], [0.035, 0.385, 0], coral);
    for (const s of [1, -1]) {
      p.box([0.11, 0.03, 0.08], [0.03, 0.14, s * 0.15], '#ffb01e', [s * 0.5, 0, -0.3]);
      // the eye: big white ball, a black pupil looking forward, a glint
      roundFace(p, 0.15, [-0.075, 0.285, s * 0.135], 0.03, '#ffffff');
      roundFace(p, 0.085, [-0.09, 0.285, s * 0.148], 0.024, '#1d1a19');
      p.box([0.026, 0.026, 0.01], [-0.075, 0.305, s * 0.163], '#ffffff');
    }
    // the big lips, pushed out for a kiss
    p.box([0.09, 0.06, 0.06], [-0.265, y + 0.01, 0], '#7a2a20')
      .box([0.1, 0.075, 0.2], [-0.285, y + 0.06, 0], coral)
      .box([0.11, 0.055, 0.15], [-0.29, y + 0.062, 0], coral)
      .box([0.1, 0.075, 0.2], [-0.285, y - 0.04, 0], coral)
      .box([0.11, 0.055, 0.15], [-0.29, y - 0.042, 0], coral)
      .box([0.03, 0.02, 0.08], [-0.33, y + 0.082, 0], '#ff9a8c');
  },
  // Дзвіночок до бабусі: a small brass bell with a coral ribbon bow and a daisy on the knot
  babusia_bell: (p) => {
    const brass = '#d8a23a';
    const dark = '#b07f22';
    const up = -Math.PI / 2;
    // the clapper peeps out under the rim
    p.box([0.09, 0.07, 0.09], [0, 0.035, 0], dark);
    // the flared body, thin levels from the rim up
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      roundFace(p, 0.2 + 0.24 * (1 - t) ** 2.4, [0, 0.085 + t * 0.31, 0], 0.034, i === 0 ? dark : brass, up);
    }
    roundFace(p, 0.135, [0, 0.41, 0], 0.03, dark, up);
    // the ring on top
    p.box([0.03, 0.09, 0.04], [-0.06, 0.46, 0], brass)
      .box([0.03, 0.09, 0.04], [0.06, 0.46, 0], brass)
      .box([0.15, 0.03, 0.04], [0, 0.51, 0], brass);
    // the ribbon round its neck, the bow in front, two tails, the daisy on the knot
    const coral = '#e0583f';
    roundFace(p, 0.235, [0, 0.31, 0], 0.045, coral, up);
    p.box([0.15, 0.1, 0.04], [0.095, 0.325, 0.12], coral, [0, 0, 0.3])
      .box([0.15, 0.1, 0.04], [-0.095, 0.325, 0.12], coral, [0, 0, -0.3])
      .beam([0.02, 0.3, 0.125], [0.085, 0.17, 0.18], 0.05, coral, 0.02)
      .beam([-0.02, 0.3, 0.125], [-0.085, 0.17, 0.18], 0.05, coral, 0.02);
    bloom(p, [0, 0.315, 0.15], 0.15, '#fff9ec', '#ffd23a');
  },
  // Платівка «Гопак»: a record with its own label on its little stand
  disc_hopak: record('#e8463a'),
  // Платівка «Реггі»: a record with its own label on its little stand
  disc_reggae: record('#3fa142'),
  // Платівка «Марш»: a record with its own label on its little stand
  disc_march: record('#2f7fd6'),
  // Платівка «Космос»: a record with its own label on its little stand
  disc_space: record('#8a5cd6'),
  // Платівка «Робо-фанк»: a record with its own label on its little stand
  disc_funk: record('#7ff3ff'),
  // Платівка «Рибний блюз»: a record with its own label on its little stand
  disc_blues: record('#2f918b'),
  // Платівка «Мур-мур-біт»: a record with its own label on its little stand
  disc_purr: record('#ee6a82'),
  // Платівка «Колядка»: a record with its own label on its little stand
  disc_carol: record('#ffe3a3'),
  // Платівка «Бабусина пісня»: a record with its own label on its little stand
  disc_granny: record('#ffd23a'),
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
