/**
 * Бабуся's kitchen as toys: five bare ingredients (cherry, potato, carrot, jar of honey, egg in a
 * nest), twelve home-cooked dishes each on its own plate, bowl, glass or pan, and the big coral
 * cooking pot with its wooden spoon. Small props, 0.4–0.6 blocks (the pot ~0.7), origin at the
 * bottom centre, front facing +Z; round things are true round slabs, seen from above at the table.
 * Every dish has its own colour and shape so twelve read apart at sticker size.
 */
import type { PartBuilder, Paint, V3 } from './parts/kit';

export type DishBuilder = (p: PartBuilder) => void;

const CREAM = '#fff0cf';
const CREAM_SHADE = '#f0dcae';
const TEAL = '#2f918b';
const TEAL_LIGHT = '#43aaa3';
const CORAL = '#e0583f';
const CORAL_DARK = '#bf3f2a';
const GREEN = '#3f9d3a';
const GREEN_LIGHT = '#66bb6a';
const DILL = '#4fae4a';
const CHERRY = '#a8132b';
const CHERRY_DARK = '#7a0e22';
const CHERRY_SHINE = '#ff7a86';
const AMBER = '#e8920c';
const AMBER_LIGHT = '#ffb62e';
const ORANGE = '#f08a1c';
const ORANGE_DARK = '#cf700f';
const WOOD = '#8a5a2b';
const WOOD_LIGHT = '#b07a3e';
const DOUGH = '#fff1d4';
const GOLDEN = '#d9962c';
const GOLDEN_LIGHT = '#e8b04a';
const SOUR = '#fffaf0';
const APPLE_RED = '#d8352f';
const APPLE_FLESH = '#fff4c9';
const DARK = '#2a2220';

/** Sides of a round slab, and its radius for a width of 1. */
const ROUND = 16;
const ROUND_R = 0.62;

/** A round slab, spokes side by side so its edge is smooth from above; `n` 1 is a plain square. `y0` is its bottom. */
function disc(p: PartBuilder, d: number, y0: number, h: number, paint: Paint, n = 2, x = 0, z = 0, rot = 0): void {
  if (n === 1) {
    p.box([d, h, d], [x, y0 + h / 2, z], paint, [0, rot, 0]);
    return;
  }
  const r = d * ROUND_R;
  const w = 2 * r * Math.tan(Math.PI / ROUND);
  for (let k = 0; k < ROUND; k++) {
    const a = rot + (k / ROUND) * Math.PI * 2;
    p.box([w, h, r], [x + (Math.sin(a) * r) / 2, y0 + h / 2, z + (Math.cos(a) * r) / 2], paint, [0, a, 0]);
  }
}

/** Turns a local (x, z) by `a` around Y, as a box rotated by `a` would see it. */
function turn(x: number, z: number, a: number): [number, number] {
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
}

/** A flat plate; the top of the rim is at 0.037. */
function plate(p: PartBuilder, d: number, rim: string, inner: string): void {
  disc(p, d, 0, 0.025, rim, 3);
  disc(p, d * 0.72, 0.025, 0.012, inner, 3);
}

/** A bowl `d` wide and `h` tall (rim top at h); an optional band round the rim. */
function bowl(p: PartBuilder, d: number, h: number, paint: string, band?: string): void {
  disc(p, d * 0.45, 0, 0.03, paint, 2);
  disc(p, d * 0.75, 0.03, h * 0.35, paint, 3);
  disc(p, d, 0.03 + h * 0.35, h - 0.03 - h * 0.35, paint, 3);
  if (band) disc(p, d + 0.012, h - 0.05, 0.025, band, 3);
}

/** A small round fruit-like blob: three stacked slabs. */
function cherryBall(p: PartBuilder, x: number, z: number, y0: number, d: number, paint: string): void {
  disc(p, d * 0.6, y0, d * 0.12, paint, 2, x, z);
  disc(p, d, y0 + d * 0.12, d * 0.72, paint, 3, x, z);
  disc(p, d * 0.65, y0 + d * 0.84, d * 0.16, paint, 2, x, z);
}

// two dark-red cherries on green stems joined at the top, one small leaf
const cherry: DishBuilder = (p) => {
  const a: V3 = [-0.1, 0, 0];
  const b: V3 = [0.1, 0, 0.03];
  for (const c of [a, b]) {
    cherryBall(p, c[0], c[2], 0, 0.18, CHERRY);
    p.box([0.035, 0.012, 0.035], [c[0], 0.19, c[2]], CHERRY_DARK);
    p.box([0.04, 0.04, 0.02], [c[0] - 0.04, 0.11, c[2] + 0.085], CHERRY_SHINE);
  }
  const j: V3 = [0.0, 0.5, 0.01];
  p.beam([a[0], 0.19, a[2]], j, 0.026, GREEN);
  p.beam([b[0], 0.19, b[2]], j, 0.026, GREEN);
  p.box([0.045, 0.045, 0.045], j, '#5b7a2a');
  p.box([0.15, 0.02, 0.08], [0.08, 0.49, -0.02], GREEN_LIGHT, [0, 0.4, 0.15]);
  p.box([0.1, 0.022, 0.03], [0.07, 0.492, -0.02], GREEN, [0, 0.4, 0.15]);
};

// a lumpy beige-brown potato with a few darker eyes
const potato: DishBuilder = (p) => {
  const skin = '#b88a55';
  const skin2 = '#c89a62';
  const eye = '#6e4a28';
  p.box([0.38, 0.2, 0.26], [0, 0.1, 0], skin, [0, 0.3, 0])
    .box([0.3, 0.2, 0.3], [0, 0.1, 0], skin, [0, 0.3 + Math.PI / 4, 0])
    .box([0.2, 0.17, 0.2], [0.14, 0.1, 0.07], skin2, [0, 0.5, 0])
    .box([0.18, 0.15, 0.18], [-0.15, 0.09, -0.05], skin2, [0, -0.3, 0])
    .box([0.22, 0.1, 0.17], [0, 0.22, 0.01], skin, [0, 0.3, 0.05])
    .box([0.12, 0.08, 0.12], [-0.06, 0.26, -0.03], skin2, [0, 0.2, 0]);
  p.box([0.045, 0.025, 0.04], [0.05, 0.285, 0.03], eye)
    .box([0.04, 0.025, 0.035], [-0.1, 0.255, 0.07], eye)
    .box([0.04, 0.035, 0.025], [0.05, 0.11, 0.21], eye)
    .box([0.035, 0.03, 0.025], [-0.12, 0.13, 0.15], eye)
    .box([0.04, 0.025, 0.04], [0.19, 0.2, 0.08], eye)
    .box([0.06, 0.02, 0.05], [-0.01, 0.31, -0.05], '#d9b27e');
};

// an orange tapered carrot, leaning, with a green top and faint rings
const carrot: DishBuilder = (p) => {
  const top: V3 = [0.1, 0.36, 0];
  const tip: V3 = [-0.14, 0.03, 0];
  const at = (t: number): V3 => [top[0] + (tip[0] - top[0]) * t, top[1] + (tip[1] - top[1]) * t, 0];
  const lean = -Math.atan2(top[0] - tip[0], top[1] - tip[1]);
  p.beam(at(0), at(0.4), 0.17, ORANGE)
    .beam(at(0.38), at(0.75), 0.12, ORANGE)
    .beam(at(0.73), at(1), 0.065, ORANGE_DARK);
  for (const [t, w] of [
    [0.14, 0.17],
    [0.3, 0.17],
    [0.52, 0.12],
    [0.64, 0.12],
  ]) {
    const c = at(t);
    p.box([w + 0.014, 0.014, w + 0.014], c, ORANGE_DARK, [0, 0, lean]);
  }
  p.box([0.14, 0.03, 0.14], [top[0], top[1] + 0.01, 0], '#2f7f32', [0, 0, lean]);
  p.beam([top[0], top[1], 0], [0.05, 0.53, 0], 0.04, GREEN)
    .beam([top[0], top[1], 0], [0.18, 0.54, 0.02], 0.04, GREEN_LIGHT)
    .beam([top[0], top[1], 0], [0.0, 0.47, -0.02], 0.035, GREEN)
    .box([0.06, 0.05, 0.03], [0.05, 0.55, 0], GREEN_LIGHT, [0, 0, 0.2])
    .box([0.06, 0.05, 0.03], [0.185, 0.56, 0.02], GREEN, [0, 0, -0.2]);
};

// a small jar of amber honey with a cream cloth lid tied with a coral cord
const honey: DishBuilder = (p) => {
  const jar = '#f0a020';
  disc(p, 0.3, 0, 0.26, jar, 3);
  disc(p, 0.26, 0.02, 0.22, AMBER_LIGHT, 3);
  p.box([0.04, 0.16, 0.02], [-0.09, 0.14, 0.152], '#ffe08a');
  p.box([0.16, 0.11, 0.012], [0.02, 0.12, 0.156], CREAM);
  p.box([0.04, 0.04, 0.012], [0.02, 0.12, 0.164], AMBER);
  // cloth over the mouth, corners hanging, and the cord with its bow
  disc(p, 0.33, 0.255, 0.05, CREAM, 3);
  for (const [x, z] of [
    [0.16, 0.0],
    [-0.16, 0.0],
    [0.0, 0.16],
    [0.0, -0.16],
  ]) {
    p.box([0.06, 0.09, 0.06], [x, 0.235, z], CREAM_SHADE, [0, Math.PI / 4, 0]);
  }
  disc(p, 0.31, 0.235, 0.02, CORAL, 3);
  p.box([0.05, 0.05, 0.03], [-0.04, 0.245, 0.17], CORAL)
    .box([0.05, 0.05, 0.03], [0.05, 0.245, 0.17], CORAL)
    .box([0.03, 0.03, 0.035], [0.005, 0.245, 0.172], CORAL_DARK)
    .box([0.025, 0.07, 0.02], [-0.02, 0.2, 0.175], CORAL, [0, 0, 0.2])
    .box([0.025, 0.07, 0.02], [0.03, 0.2, 0.175], CORAL, [0, 0, -0.2]);
};

// a cream-white egg sitting in a small straw nest
const egg: DishBuilder = (p) => {
  const straw = '#d9a441';
  disc(p, 0.46, 0, 0.06, '#c98d2e', 3);
  disc(p, 0.4, 0.05, 0.04, straw, 3);
  disc(p, 0.27, 0.09, 0.01, '#a8731f', 2);
  for (let k = 0; k < 9; k++) {
    const t = (k / 9) * Math.PI * 2;
    p.box([0.15, 0.025, 0.035], [Math.cos(t) * 0.2, 0.085 + (k % 2) * 0.02, Math.sin(t) * 0.2], k % 3 ? '#e8bf5c' : '#c98d2e', [
      0,
      -t + (k % 2 ? 0.5 : -0.4),
      0,
    ]);
  }
  const shell = '#fff6e2';
  disc(p, 0.18, 0.09, 0.05, shell, 3);
  disc(p, 0.24, 0.14, 0.08, shell, 3);
  disc(p, 0.21, 0.22, 0.06, shell, 3);
  disc(p, 0.14, 0.28, 0.05, shell, 2);
  disc(p, 0.07, 0.33, 0.03, shell, 2);
  p.box([0.04, 0.09, 0.02], [-0.07, 0.22, 0.095], '#ffffff');
  p.box([0.03, 0.03, 0.025], [0.06, 0.17, 0.105], '#ecd9b6');
};

// four half-moon dumplings with crimped edges, a dark cherry on each, on a teal plate
const varenyky: DishBuilder = (p) => {
  plate(p, 0.52, TEAL, TEAL_LIGHT);
  const y = 0.037;
  const spots: [number, number, number][] = [
    [-0.115, -0.115, Math.PI / 4 + 0.25],
    [0.115, -0.1, -Math.PI / 4 + 0.2],
    [-0.115, 0.115, (3 * Math.PI) / 4 - 0.2],
    [0.115, 0.105, (-3 * Math.PI) / 4 - 0.15],
  ];
  for (const [cx, cz, a] of spots) {
    const at = (x: number, z: number): [number, number] => {
      const [dx, dz] = turn(x, z, a);
      return [cx + dx, cz + dz];
    };
    const r: V3 = [0, a, 0];
    const [bx, bz] = at(0, 0.0);
    p.box([0.2, 0.06, 0.1], [bx, y + 0.03, bz], DOUGH, r);
    const [ux, uz] = at(0, -0.075);
    p.box([0.15, 0.06, 0.05], [ux, y + 0.03, uz], DOUGH, r);
    for (const x of [-0.055, 0.055]) {
      const [kx, kz] = at(x, -0.1);
      p.box([0.04, 0.045, 0.03], [kx, y + 0.0375, kz], '#f0d9a0', r);
    }
    const [cxx, czz] = at(0.0, -0.02);
    p.box([0.055, 0.045, 0.055], [cxx, y + 0.08, czz], CHERRY_DARK, [0, a + 0.4, 0]);
  }
};

// a stack of three golden-brown potato pancakes on a cream plate, with a dab of sour cream
const deruny: DishBuilder = (p) => {
  plate(p, 0.54, CREAM, CREAM_SHADE);
  const stack: [number, number, number, number, number, string][] = [
    [0.38, 0.0, 0.0, 0.2, 0.037, '#b9741c'],
    [0.35, 0.025, -0.015, -0.3, 0.09, '#c98428'],
    [0.32, -0.015, 0.012, 0.5, 0.143, '#d4902f'],
  ];
  for (const [d, x, z, r, y0, c] of stack) {
    disc(p, d, y0, 0.055, c, 2, x, z, r);
    disc(p, d - 0.05, y0 + 0.045, 0.014, '#e3a63f', 2, x, z, r);
    p.box([0.04, 0.016, 0.04], [x + 0.06, y0 + 0.056, z - 0.04], '#a86414')
      .box([0.035, 0.016, 0.035], [x - 0.07, y0 + 0.056, z + 0.05], '#a86414');
  }
  disc(p, 0.14, 0.2, 0.03, SOUR, 2, 0.0, 0.0);
  disc(p, 0.08, 0.23, 0.03, SOUR, 2, 0.01, 0.0);
  p.box([0.03, 0.025, 0.03], [0.03, 0.262, 0.0], SOUR);
  p.box([0.05, 0.012, 0.02], [-0.03, 0.262, 0.02], DILL, [0, 0.5, 0]).box([0.04, 0.012, 0.02], [-0.04, 0.262, 0.0], DILL, [0, -0.5, 0]);
};

// a deep cream bowl of beetroot-red soup with a white dab of sour cream and a little dill
const borscht: DishBuilder = (p) => {
  bowl(p, 0.48, 0.21, CREAM, TEAL);
  disc(p, 0.4, 0.2, 0.012, '#b3122f', 3);
  disc(p, 0.3, 0.208, 0.006, '#c8203c', 3, 0.02, 0.02);
  // beetroot pieces just under the surface
  p.box([0.05, 0.01, 0.05], [-0.12, 0.214, 0.06], '#7d0f26', [0, 0.4, 0])
    .box([0.05, 0.01, 0.045], [0.12, 0.214, -0.06], '#7d0f26', [0, -0.3, 0]);
  disc(p, 0.13, 0.208, 0.025, SOUR, 2, 0.0, 0.0);
  disc(p, 0.07, 0.233, 0.02, SOUR, 2, 0.01, 0.0);
  p.box([0.07, 0.014, 0.025], [-0.1, 0.22, -0.04], DILL, [0, 0.6, 0])
    .box([0.06, 0.014, 0.022], [0.07, 0.22, 0.09], DILL, [0, -0.5, 0])
    .box([0.05, 0.014, 0.02], [0.11, 0.22, 0.02], GREEN_LIGHT, [0, 1.1, 0]);
};

// a teal bowl of golden mushroom soup with brown mushroom pieces and orange carrot bits
const yushka: DishBuilder = (p) => {
  bowl(p, 0.48, 0.2, TEAL, TEAL_LIGHT);
  disc(p, 0.4, 0.19, 0.012, '#e8b84a', 3);
  disc(p, 0.3, 0.198, 0.006, '#f2cb64', 3, -0.02, 0.02);
  const cap = '#8a5a2b';
  for (const [x, z, r] of [
    [-0.1, -0.06, 0.3],
    [0.09, -0.1, -0.4],
    [0.1, 0.08, 0.8],
    [-0.08, 0.1, 0.1],
  ] as const) {
    p.box([0.09, 0.02, 0.07], [x, 0.21, z], cap, [0, r, 0]);
    p.box([0.04, 0.02, 0.03], [x + 0.005, 0.226, z], '#c49a62', [0, r, 0]);
  }
  for (const [x, z] of [
    [0.0, -0.1],
    [-0.14, 0.02],
    [0.0, 0.05],
    [0.15, -0.01],
    [0.03, 0.14],
  ]) {
    p.box([0.04, 0.016, 0.04], [x, 0.208, z], ORANGE, [0, x * 9, 0]);
  }
  p.box([0.06, 0.012, 0.02], [-0.02, 0.21, -0.02], DILL, [0, 0.7, 0]).box([0.05, 0.012, 0.02], [0.05, 0.21, 0.0], DILL, [0, -0.6, 0]);
};

// three golden little pies on a teal plate and one apple slice
const apple_pies: DishBuilder = (p) => {
  plate(p, 0.54, TEAL, TEAL_LIGHT);
  const y = 0.037;
  for (const [x, z, r] of [
    [-0.09, -0.09, 0.3],
    [0.1, -0.06, -0.2],
    [0.0, 0.1, 0.6],
  ]) {
    disc(p, 0.19, y, 0.065, GOLDEN, 2, x, z, r);
    disc(p, 0.15, y + 0.055, 0.02, GOLDEN_LIGHT, 2, x, z, r);
    p.box([0.15, 0.012, 0.022], [x, y + 0.077, z], '#b8741c', [0, r + 0.5, 0]);
    p.box([0.15, 0.012, 0.022], [x, y + 0.077, z], '#b8741c', [0, r - 1.07, 0]);
  }
  // the apple slice: red skin, pale flesh
  p.box([0.12, 0.02, 0.045], [-0.17, y + 0.012, 0.115], APPLE_RED, [0, -0.6, 0]);
  p.box([0.11, 0.032, 0.04], [-0.17, y + 0.026, 0.115], APPLE_FLESH, [0, -0.6, 0]);
  p.box([0.04, 0.012, 0.014], [-0.17, y + 0.045, 0.115], '#7b4a1c', [0, -0.6, 0]);
};

// a tall glass jug of pink-red drink with cherries and apple slices showing, on a teal coaster
const compote: DishBuilder = (p) => {
  disc(p, 0.4, 0, 0.022, TEAL, 3);
  disc(p, 0.3, 0.022, 0.015, '#9fd6e3', 3);
  disc(p, 0.3, 0.037, 0.303, '#e0405c', 3);
  disc(p, 0.32, 0.31, 0.03, '#cfeef5', 3);
  disc(p, 0.27, 0.34, 0.008, '#f06a82', 3);
  // fruit floating on top and printed on the jug
  for (const [x, z] of [
    [-0.06, 0.04],
    [0.07, -0.04],
  ]) {
    p.box([0.07, 0.05, 0.07], [x, 0.368, z], CHERRY_DARK, [0, 0.4, 0]);
    p.box([0.02, 0.03, 0.02], [x - 0.015, 0.388, z + 0.015], CHERRY_SHINE);
  }
  p.box([0.1, 0.02, 0.05], [0.0, 0.356, -0.02], APPLE_FLESH, [0, 0.8, 0]);
  p.box([0.1, 0.01, 0.05], [0.0, 0.348, -0.02], APPLE_RED, [0, 0.8, 0]);
  p.box([0.075, 0.075, 0.016], [-0.06, 0.2, 0.19], APPLE_FLESH, [0, 0, 0.5]);
  p.box([0.075, 0.016, 0.016], [-0.037, 0.173, 0.195], APPLE_RED, [0, 0, 0.5]);
  p.box([0.06, 0.06, 0.04], [0.07, 0.13, 0.185], CHERRY_DARK, [0, 0, 0.2]);
  p.box([0.06, 0.06, 0.04], [-0.05, 0.09, 0.185], CHERRY_DARK, [0, 0, 0.2]);
  p.box([0.07, 0.07, 0.016], [0.06, 0.25, 0.19], APPLE_FLESH, [0, 0, -0.4]);
  // the handle and a little lip
  p.box([0.05, 0.035, 0.05], [0.185, 0.395, 0], '#9fd6e3')
    .box([0.04, 0.3, 0.05], [0.225, 0.26, 0], '#9fd6e3')
    .box([0.05, 0.035, 0.05], [0.185, 0.115, 0], '#9fd6e3')
    .box([0.1, 0.03, 0.05], [0.0, 0.44, 0.16], '#cfeef5');
};

// a stack of thin pancakes on a cream plate with honey running down from the top
const honey_pancakes: DishBuilder = (p) => {
  plate(p, 0.54, CREAM, CREAM_SHADE);
  disc(p, 0.3, 0.037, 0.012, AMBER, 3, 0.05, 0.1);
  for (let k = 0; k < 5; k++) {
    const c = k % 2 ? '#f0cf8c' : '#e6b868';
    disc(p, 0.36 - (k % 2) * 0.012, 0.037 + k * 0.032, 0.034, c, 2, ((k * 7) % 3) * 0.008 - 0.008, 0, k * 0.5);
  }
  const top = 0.037 + 5 * 0.032;
  disc(p, 0.25, top, 0.02, AMBER, 3, 0.0, 0.01);
  disc(p, 0.12, top + 0.02, 0.012, AMBER_LIGHT, 2, -0.03, 0.0);
  // drips down the side
  p.box([0.05, 0.12, 0.035], [0.13, top - 0.055, 0.06], AMBER)
    .box([0.04, 0.17, 0.035], [-0.06, top - 0.08, 0.14], AMBER)
    .box([0.045, 0.09, 0.035], [-0.14, top - 0.04, 0.0], AMBER)
    .box([0.04, 0.1, 0.035], [0.05, top - 0.05, 0.145], AMBER_LIGHT);
  p.box([0.07, 0.04, 0.07], [0.0, top + 0.03, -0.03], '#fff3a0', [0, 0.3, 0]);
};

// a fried egg on a small dark pan, the round yolk ringed with little carrot rays like a sun
const sunny_egg: DishBuilder = (p) => {
  disc(p, 0.4, 0, 0.04, '#4a4a52', 3);
  disc(p, 0.35, 0.04, 0.012, '#5d5d66', 3);
  p.box([0.2, 0.035, 0.06], [0.29, 0.03, 0], WOOD).box([0.06, 0.04, 0.07], [0.4, 0.03, 0], WOOD_LIGHT);
  const y = 0.052;
  p.box([0.28, 0.02, 0.25], [0, y + 0.01, 0], SOUR, [0, 0.3, 0])
    .box([0.25, 0.02, 0.28], [0.005, y + 0.01, 0], SOUR, [0, -0.35, 0])
    .box([0.2, 0.02, 0.2], [0, y + 0.012, 0], '#ffffff', [0, 0.8, 0]);
  disc(p, 0.13, y + 0.02, 0.035, '#ffb81c', 3);
  p.box([0.035, 0.012, 0.035], [-0.02, y + 0.058, 0.02], '#ffe27a');
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    const long = k % 2 === 0;
    const r = long ? 0.12 : 0.105;
    p.box([0.035, 0.02, long ? 0.06 : 0.045], [Math.cos(t) * r, y + 0.03, Math.sin(t) * r], ORANGE, [0, Math.PI / 2 - t, 0]);
  }
};

// three orange patties on a teal tray with a green sprig
const carrot_cutlets: DishBuilder = (p) => {
  p.box([0.54, 0.025, 0.42], [0, 0.0125, 0], TEAL).box([0.46, 0.012, 0.34], [0, 0.031, 0], TEAL_LIGHT);
  const y = 0.037;
  for (const [x, z, r] of [
    [-0.14, -0.06, 0.3],
    [0.1, -0.08, -0.2],
    [-0.01, 0.07, 0.6],
  ]) {
    disc(p, 0.2, y, 0.05, ORANGE_DARK, 2, x, z, r);
    disc(p, 0.16, y + 0.04, 0.016, ORANGE, 2, x, z, r);
    p.box([0.035, 0.012, 0.03], [x + 0.03, y + 0.058, z - 0.02], '#f8b24a', [0, r, 0]);
    p.box([0.03, 0.012, 0.03], [x - 0.035, y + 0.058, z + 0.03], '#a8560a', [0, r, 0]);
  }
  p.beam([0.12, y + 0.015, 0.14], [0.0, y + 0.055, 0.07], 0.016, GREEN)
    .box([0.07, 0.012, 0.035], [0.1, y + 0.025, 0.17], GREEN_LIGHT, [0, 0.8, 0])
    .box([0.07, 0.012, 0.035], [0.17, y + 0.025, 0.1], GREEN, [0, -0.2, 0])
    .box([0.06, 0.012, 0.03], [0.04, y + 0.065, 0.1], GREEN_LIGHT, [0, 0.4, 0.2]);
};

// a coral bowl of creamy porridge with apple slices round the middle and a drop of honey
const apple_porridge: DishBuilder = (p) => {
  bowl(p, 0.5, 0.17, CORAL, CORAL_DARK);
  disc(p, 0.42, 0.16, 0.02, '#f6e2b8', 3);
  disc(p, 0.32, 0.18, 0.02, '#f6e2b8', 3);
  disc(p, 0.2, 0.2, 0.014, '#fbeccb', 3);
  for (let k = 0; k < 5; k++) {
    const t = (k / 5) * Math.PI * 2 + 0.3;
    const x = Math.cos(t) * 0.12;
    const z = Math.sin(t) * 0.12;
    const r = Math.PI / 2 - t;
    p.box([0.05, 0.03, 0.09], [x, 0.205, z], APPLE_FLESH, [0, r, 0]);
    const ox = Math.cos(t) * 0.155;
    const oz = Math.sin(t) * 0.155;
    p.box([0.05, 0.018, 0.02], [ox, 0.2, oz], APPLE_RED, [0, r, 0]);
  }
  disc(p, 0.075, 0.21, 0.02, AMBER, 2);
  p.box([0.03, 0.02, 0.03], [0.0, 0.225, 0.0], AMBER_LIGHT).box([0.025, 0.04, 0.025], [0.0, 0.195, 0.04], AMBER);
};

// a slice of buttered bread with a ladybird made of a red-orange carrot round with dark dots
const ladybird_toast: DishBuilder = (p) => {
  const crust = '#b57428';
  p.box([0.42, 0.055, 0.34], [0, 0.0275, 0.04], crust)
    .box([0.46, 0.055, 0.12], [0, 0.0275, -0.15], crust)
    .box([0.36, 0.012, 0.28], [0, 0.061, 0.04], '#f4d58c')
    .box([0.4, 0.012, 0.08], [0, 0.061, -0.15], '#f4d58c')
    .box([0.3, 0.012, 0.24], [0, 0.067, 0.05], '#ffe880')
    .box([0.32, 0.012, 0.06], [0, 0.067, -0.15], '#ffe880');
  // the ladybird: head to the front, a split down the wings, dots, tiny legs
  const y = 0.073;
  disc(p, 0.22, y, 0.045, '#f0541c', 3, 0.0, -0.02);
  disc(p, 0.18, y + 0.04, 0.012, '#f56a2e', 3, 0.0, -0.02);
  p.box([0.014, 0.014, 0.19], [0, y + 0.05, -0.03], DARK);
  p.box([0.1, 0.045, 0.06], [0, y + 0.022, 0.1], DARK, [0, 0, 0]);
  for (const [x, z] of [
    [-0.055, -0.07],
    [0.055, -0.07],
    [-0.065, 0.0],
    [0.065, 0.0],
    [-0.035, -0.11],
    [0.035, -0.11],
  ]) {
    p.box([0.034, 0.012, 0.034], [x, y + 0.056, z], DARK);
  }
  for (const sx of [-1, 1]) {
    for (const z of [-0.06, 0.0, 0.05]) p.box([0.04, 0.012, 0.014], [sx * 0.125, y + 0.01, z], DARK);
    p.box([0.014, 0.012, 0.05], [sx * 0.03, y + 0.045, 0.15], DARK);
  }
};

// two golden butterfly-shaped cookies with a honey pattern on a cream plate
const butterfly_cookies: DishBuilder = (p) => {
  plate(p, 0.54, CREAM, TEAL_LIGHT);
  const y = 0.037;
  const gold = '#e5a83c';
  const gold2 = '#d9962c';
  for (const [cx, cz, a] of [
    [-0.09, -0.07, 0.25],
    [0.1, 0.1, -0.35],
  ]) {
    const at = (x: number, z: number): V3 => {
      const [dx, dz] = turn(x, z, a);
      return [cx + dx, y + 0.02, cz + dz];
    };
    const r = (extra: number): V3 => [0, a + extra, 0];
    for (const sx of [-1, 1]) {
      p.box([0.11, 0.04, 0.1], at(sx * 0.075, -0.045), gold, r(sx * 0.35));
      p.box([0.09, 0.04, 0.08], at(sx * 0.065, 0.055), gold2, r(-sx * 0.35));
      p.box([0.05, 0.014, 0.02], at(sx * 0.08, -0.05), '#a8561a', r(sx * 0.35));
      p.box([0.03, 0.014, 0.03], at(sx * 0.068, 0.055), '#a8561a', r(0));
      const [qx, , qz] = at(sx * 0.09, -0.07);
      p.box([0.025, 0.016, 0.025], [qx, y + 0.042, qz], '#f4c25a');
    }
    p.box([0.03, 0.05, 0.15], at(0, 0.0), '#c98428', r(0));
    p.box([0.04, 0.05, 0.04], at(0, 0.09), '#c98428', r(0));
  }
};

// a big toy cooking pot: coral enamel, cream rim, two dark side handles, open and full of warm soup
export const buildCookPot: DishBuilder = (p) => {
  disc(p, 0.5, 0, 0.04, CORAL_DARK, 3);
  disc(p, 0.6, 0.04, 0.36, CORAL, 3);
  disc(p, 0.612, 0.17, 0.03, CREAM, 3);
  disc(p, 0.64, 0.38, 0.06, CREAM, 3);
  disc(p, 0.54, 0.44, 0.004, '#8a2c1c', 3);
  disc(p, 0.5, 0.442, 0.008, '#f2a63a', 3);
  disc(p, 0.36, 0.45, 0.004, '#f8c05a', 3, -0.03, 0.03);
  for (const [x, z, c] of [
    [-0.12, 0.08, ORANGE_DARK],
    [0.1, -0.1, ORANGE_DARK],
    [0.14, 0.1, GREEN],
    [-0.1, -0.12, GREEN],
    [0.0, 0.02, '#fff0cf'],
  ] as const) {
    p.box([0.05, 0.012, 0.05], [x, 0.452, z], c, [0, x * 8, 0]);
  }
  const handle = '#3b3b44';
  for (const s of [-1, 1]) {
    p.box([0.1, 0.035, 0.06], [s * 0.345, 0.34, 0], handle)
      .box([0.1, 0.035, 0.06], [s * 0.345, 0.25, 0], handle)
      .box([0.035, 0.125, 0.06], [s * 0.385, 0.295, 0], handle);
  }
};

// a long wooden spoon, handle straight up, the bowl at the bottom
export const buildSpoon: DishBuilder = (p) => {
  const z = -0.02;
  p.box([0.13, 0.16, 0.02], [0, 0.08, z - 0.01], WOOD)
    .box([0.03, 0.16, 0.05], [-0.055, 0.08, z + 0.01], WOOD_LIGHT)
    .box([0.03, 0.16, 0.05], [0.055, 0.08, z + 0.01], WOOD_LIGHT)
    .box([0.14, 0.03, 0.05], [0, 0.015, z + 0.01], WOOD_LIGHT)
    .box([0.12, 0.03, 0.05], [0, 0.155, z + 0.01], WOOD_LIGHT)
    .box([0.08, 0.1, 0.012], [0, 0.08, z + 0.002], '#f2a63a')
    .box([0.05, 0.05, 0.014], [0.01, 0.1, z + 0.004], '#f8c05a');
  p.box([0.05, 0.16, 0.04], [0, 0.23, z], WOOD)
    .box([0.04, 0.2, 0.04], [0, 0.4, z], WOOD)
    .box([0.045, 0.08, 0.045], [0, 0.52, z], WOOD)
    .box([0.075, 0.07, 0.045], [0, 0.575, z], WOOD_LIGHT);
};

export const DISH_BUILDERS = {
  cherry,
  potato,
  carrot,
  honey,
  egg,
  varenyky,
  deruny,
  borscht,
  yushka,
  apple_pies,
  compote,
  honey_pancakes,
  sunny_egg,
  carrot_cutlets,
  apple_porridge,
  ladybird_toast,
  butterfly_cookies,
} satisfies Record<string, DishBuilder>;
