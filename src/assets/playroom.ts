/**
 * The playroom's toys in the heroes' house (DESIGN.md «Home»; spots in content/house.ts
 * `HOME.playroom`, run by systems/playroom.ts): the slide tower with its chute, the ball pit, the
 * chess corner, the easel and the toy rug. Toy pieces like the kit's buildings: origin at the floor
 * centre, front towards +Z, static parts merged by the Kit, everything alive moved from `update`.
 * No lights: glow materials only. Everything is built once, up front, so no shader is built mid-play.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import { CHESS, EASEL, startBoard, type Board } from '../content/playroom';
import { CHARCOAL, CORAL, CORAL_DARK, CREAM, INK, MINT, MUSTARD, TAU, TEAL, markShadows } from './buildingParts';
import { Kit, type V3 } from './parts/kit';
import { Build, HP } from './villages';

const BLUE = '#2f7fd6';
const BLUE_D = '#2462ad';
const GREEN = '#3fa142';
const PINK = '#ee6a82';
const YELLOW = '#ffd23a';
const WOOD = '#cf9d5e';
const WOOD_D = '#b07f44';
const PAPER = '#fff8ec';
const TEAL_D = '#236e6a';

const m4 = new THREE.Matrix4();
const v = new THREE.Vector3();
const s3 = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** A seat: an empty object at the sitting surface, facing its local +Z after `ry`. */
function seatAt(parent: THREE.Object3D, at: V3, ry: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(at[0], at[1], at[2]);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

// ─── the slide tower ────────────────────────────────────────────────────────

/** The platform's height above the floor; the tower's half width (posts); the rail's height over the platform. */
export const SLIDE_PLATFORM = 1.3;
const HALF = 0.85;
const RAIL = 0.5;
/** The ladder's foot: this far out from the tower's middle on its ladder side. */
export const SLIDE_FOOT = HALF + 0.5;
/** The chute: inner half width, depth, wall. */
const TR = 0.28;
const TD = 0.2;
const WALL = 0.05;
const RINGS = 40;

export interface SlideTower {
  root: THREE.Group;
  /** Local spots (tower frame: floor centre, +Z towards the pit): the ladder's foot, its top, the chute's top. */
  foot: THREE.Vector3;
  ladderTop: THREE.Vector3;
  chuteTop: THREE.Vector3;
  /** The chute's bottom (where a rider's hips go) `u` of the way down, in the tower's frame; returns the heading there. */
  bottom(u: number, out: THREE.Vector3): number;
}

/**
 * A toy slide tower, 2×2: four teal posts, a mustard platform at SLIDE_PLATFORM with mint rails
 * (open at the ladder and at the chute), a cream den wall with a round window under it, a little
 * coral flag; a ladder on the `side` (+1 = +X) face; a mustard chute with cream lips and a coral
 * outside, from the platform's front edge down to `reach` blocks in front (+Z), on one teal post.
 */
export function createSlideTower(skin: Skin, reach: number, side: 1 | -1): SlideTower {
  const root = new THREE.Group();
  root.name = 'slide-tower';
  const P = SLIDE_PLATFORM;
  const b = new Build(skin, `playroom-slide-${reach.toFixed(2)}-${side}`);
  root.add(b.root);
  const top = P + RAIL;
  for (const x of [-HALF, HALF])
    for (const z of [-HALF, HALF]) {
      b.box([0.13, top + 0.06, 0.13], [x, (top + 0.06) / 2, z], TEAL);
      b.box([0.22, 0.08, 0.22], [x, 0.04, z], CORAL);
      b.box([0.17, 0.08, 0.17], [x, top + 0.1, z], MUSTARD);
    }
  // the platform
  b.box([HALF * 2 + 0.1, 0.1, HALF * 2 + 0.1], [0, P - 0.05, 0], MUSTARD);
  b.box([HALF * 2 + 0.14, 0.05, HALF * 2 + 0.14], [0, P - 0.12, 0], '#c98f1c');
  // rails: the back whole, the sides and the front open in the middle (the ladder, the chute)
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    for (const [y, t] of [
      [top, 0.08],
      [P + RAIL * 0.5, 0.06],
    ] as const)
      b.beam([x0, y, z0], [x1, y, z1], t, MINT);
  };
  rail(-HALF, -HALF, HALF, -HALF);
  const gap = 0.34;
  for (const sx of [-1, 1]) {
    // the front, both sides of the chute
    rail(sx * HALF, HALF, sx * gap, HALF);
    if (sx === side) {
      rail(sx * HALF, -HALF, sx * HALF, -gap);
      rail(sx * HALF, gap, sx * HALF, HALF);
    } else rail(sx * HALF, -HALF, sx * HALF, HALF);
  }
  // the den under the platform: a cream wall with a round window on the far side, a teal one at the back
  const far = -side * HALF;
  b.box([0.05, P - 0.2, HALF * 2 - 0.14], [far, (P - 0.2) / 2 + 0.04, 0], CREAM);
  b.disc(0.24, 0.03, [far - side * 0.02, P * 0.5, 0.05], [-side, 0, 0], TEAL_D);
  b.box([HALF * 2 - 0.14, P - 0.2, 0.05], [0, (P - 0.2) / 2 + 0.04, -HALF], TEAL_D);
  for (const [x, y, c] of [
    [-0.4, 0.45, CORAL],
    [0.1, 0.75, YELLOW],
    [0.45, 0.35, GREEN],
    [-0.15, 0.95, PINK],
  ] as const)
    b.ball(0.07, [x, y, -HALF + 0.05], c, { s: [1, 1, 0.5], seg: 10 });
  // a little flag on a back post
  b.box([0.04, 0.55, 0.04], [far, top + 0.38, -HALF], CREAM);
  b.box([0.3, 0.18, 0.03], [far + side * 0.17, top + 0.55, -HALF], CORAL);
  // the ladder on the `side` face
  const lx = side * (HALF + 0.12);
  for (const z of [-0.26, 0.26]) b.box([0.07, P + 0.5, 0.07], [lx, (P + 0.5) / 2, z], MUSTARD);
  for (let y = 0.24; y < P; y += 0.26) b.box([0.06, 0.05, 0.52], [lx, y, 0], CORAL);

  // the chute: a curve along its lips, from the platform's front edge down into the pit
  const z0 = HALF - 0.05;
  const z1 = Math.max(z0 + 1.2, reach);
  const len = z1 - z0;
  const lip = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, P + TD, z0),
    new THREE.Vector3(0, P + TD - 0.12, z0 + len * 0.38),
    new THREE.Vector3(0, 0.62 + TD + 0.06, z1 - len * 0.42),
    new THREE.Vector3(0, 0.42 + TD, z1),
  );
  const bottom = (u: number, out: THREE.Vector3): number => {
    lip.getPointAt(Math.min(1, Math.max(0, u)), out);
    out.y -= TD;
    const t = lip.getTangentAt(Math.min(1, Math.max(0, u)));
    return Math.atan2(t.x, t.z);
  };
  // one post under the chute's middle
  bottom(0.45, v);
  b.box([0.12, v.y - WALL - 0.04, 0.12], [0, (v.y - WALL - 0.04) / 2, v.z], TEAL);
  b.box([0.22, 0.08, 0.22], [0, 0.04, v.z], CORAL);
  b.finish();
  const chute = new THREE.Mesh(trough(lip), b.kit.vertexColourMaterial(false));
  chute.name = 'chute';
  chute.castShadow = true;
  root.add(chute);
  markShadows(root);

  return {
    root,
    foot: new THREE.Vector3(side * SLIDE_FOOT, 0, 0),
    ladderTop: new THREE.Vector3(side * (HALF + 0.18), P, 0),
    chuteTop: new THREE.Vector3(0, P, z0 - 0.15),
    bottom,
  };
}

/** Sweeps the chute's cross-section along its lip line: the inside, both lips and the outside. */
function trough(curve: THREE.Curve<THREE.Vector3>): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const U = new THREE.Vector3();
  const c = new THREE.Color();
  const arc = (r: number, d: number, from: number, to: number, n: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      out.push([Math.cos(a) * r, Math.sin(a) * d]);
    }
    return out;
  };
  const R = TR + WALL;
  const strip = (profile: [number, number][], paint: (f: number) => THREE.Color): void => {
    const base = pos.length / 3;
    const m = profile.length;
    for (let i = 0; i <= RINGS; i++) {
      const u = i / RINGS;
      curve.getPointAt(u, P);
      curve.getTangentAt(u, T);
      N.crossVectors(UP, T).normalize();
      U.crossVectors(T, N).normalize();
      profile.forEach(([a, bb], j) => {
        pos.push(P.x + N.x * a + U.x * bb, P.y + N.y * a + U.y * bb, P.z + N.z * a + U.z * bb);
        const k = paint(j / (m - 1));
        col.push(k.r, k.g, k.b);
      });
      if (i === RINGS) break;
      for (let j = 0; j < m - 1; j++) {
        const a = base + i * m + j;
        idx.push(a, a + m, a + m + 1, a, a + m + 1, a + 1);
      }
    }
  };
  const inside = new THREE.Color(MUSTARD);
  const middle = new THREE.Color(YELLOW);
  strip(arc(TR, TD, Math.PI, TAU, 10), (f) => c.copy(inside).lerp(middle, Math.max(0, 1 - Math.abs(f - 0.5) * 3)));
  strip(
    [
      [TR, 0],
      [TR + WALL / 2, 0.03],
      [R, 0],
    ],
    () => c.set(CREAM),
  );
  strip(arc(R, TD + WALL, 0, -Math.PI, 10), () => c.set(CORAL));
  strip(
    [
      [-R, 0],
      [-TR - WALL / 2, 0.03],
      [-TR, 0],
    ],
    () => c.set(CREAM),
  );
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ─── the ball pit ───────────────────────────────────────────────────────────

/** The pit's outer half size, its rim's thickness and height, the balls' radius. */
export const PIT_HALF = 1.2;
const PIT_RIM = 0.22;
const PIT_H = 0.38;
const BALL_R = 0.105;
const BALL_COLOURS = [CORAL, YELLOW, BLUE, GREEN, PINK, PAPER];
/** A splash hops the balls for this long (s). */
const SPLASH_FOR = 0.95;

export interface BallPit {
  root: THREE.Group;
  /** Balls hop round (x, z) in the pit's frame; `strength` 1 = a rider landing, less for a wade. */
  splash(x: number, z: number, strength: number): void;
  update(dt: number): void;
}

/** A padded 2.4×2.4 pit: coral and blue cushions with cream piping round a blue floor, full of coloured balls (one instanced draw). */
export function createBallPit(skin: Skin): BallPit {
  const root = new THREE.Group();
  root.name = 'ball-pit';
  const p = new Kit('playroom-pit', skin).part('pit', root);
  const H = PIT_HALF;
  const inner = H - PIT_RIM;
  // three cushions a side, alternating colours, little gaps between
  const seg = (2 * H) / 3;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 3; i++) {
      const along = -H + seg * (i + 0.5);
      const c = (i + side) % 2 ? CORAL : BLUE;
      const len = seg - 0.04;
      const [sx, sz, x, z] = side < 2 ? [len, PIT_RIM, along, side ? H - PIT_RIM / 2 : -H + PIT_RIM / 2] : [PIT_RIM, len, side === 2 ? -H + PIT_RIM / 2 : H - PIT_RIM / 2, along];
      p.box([sx, PIT_H - 0.04, sz], [x, (PIT_H - 0.04) / 2, z], c);
      p.box([sx - 0.04, 0.05, sz - 0.04], [x, PIT_H - 0.02, z], c === CORAL ? '#f07a60' : '#4c95e4');
      p.box([sx + 0.01, 0.03, sz + 0.01], [x, PIT_H - 0.08, z], CREAM);
    }
  }
  p.box([inner * 2, 0.04, inner * 2], [0, 0.02, 0], BLUE_D);
  p.done();
  markShadows(root);

  // the balls: two layers on a jittered grid, the colours mixed
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const base: number[] = [];
  const room = inner - BALL_R - 0.02;
  for (const layer of [0, 1]) {
    const step = 0.2;
    const off = layer ? step / 2 : 0;
    for (let x = -room + off; x <= room; x += step)
      for (let z = -room + off; z <= room; z += step)
        base.push(x + (rnd() - 0.5) * 0.06, BALL_R + 0.04 + layer * 0.13 + rnd() * 0.04, z + (rnd() - 0.5) * 0.06, 0.55 + rnd() * 0.35);
  }
  const n = base.length / 4;
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 10, 7), skin.partMaterial('#ffffff'), n);
  balls.name = 'balls';
  const colour = new THREE.Color();
  for (let i = 0; i < n; i++) {
    balls.setMatrixAt(i, m4.makeTranslation(base[i * 4], base[i * 4 + 1], base[i * 4 + 2]));
    balls.setColorAt(i, colour.set(BALL_COLOURS[Math.floor(rnd() * BALL_COLOURS.length)]));
  }
  balls.instanceMatrix.needsUpdate = true;
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  balls.castShadow = true;
  balls.receiveShadow = true;
  root.add(balls);

  const splashes: { x: number; z: number; k: number; t: number }[] = [];
  let still = true;
  return {
    root,
    splash(x, z, strength) {
      if (splashes.length >= 6) splashes.shift();
      splashes.push({ x, z, k: strength, t: 0 });
      still = false;
    },
    update(dt) {
      if (still) return;
      for (const s of splashes) s.t += dt;
      while (splashes.length && splashes[0].t > SPLASH_FOR) splashes.shift();
      for (let i = 0; i < n; i++) {
        let bx = base[i * 4];
        let by = base[i * 4 + 1];
        let bz = base[i * 4 + 2];
        const speed = base[i * 4 + 3];
        let up = 0;
        let ox = 0;
        let oz = 0;
        for (const s of splashes) {
          const dx = bx - s.x;
          const dz = bz - s.z;
          const d = Math.hypot(dx, dz);
          const reach = 0.55 + 0.6 * s.k;
          if (d >= reach) continue;
          const a = s.t / (SPLASH_FOR * speed);
          if (a >= 1) continue;
          const k = (1 - d / reach) * s.k;
          const arc = Math.sin(Math.PI * a);
          up += k * 0.6 * arc;
          ox += (dx / (d || 1)) * k * 0.14 * arc;
          oz += (dz / (d || 1)) * k * 0.14 * arc;
        }
        bx += ox;
        by += up;
        bz += oz;
        balls.setMatrixAt(i, m4.makeTranslation(bx, by, bz));
      }
      balls.instanceMatrix.needsUpdate = true;
      if (!splashes.length) still = true;
    },
  };
}

// ─── the chess corner ───────────────────────────────────────────────────────

const TABLE_H = 0.5;
/** The board's playing surface: its height and one square's size. */
const BOARD_Y = TABLE_H + 0.075;
const SQUARE = 0.165;
/** The poufs stand this far left and right of the table's centre. */
export const POUF_X = 0.9;
const POUF_H = 0.34;
const SET_COLOURS = [CORAL, BLUE] as const;

export interface ChessCorner {
  root: THREE.Group;
  /** The two poufs (side 0 at -X with the coral pieces, side 1 at +X with the blue ones), facing the table. */
  seats: [THREE.Object3D, THREE.Object3D];
  /** The squares as they are now (pieces still hopping count where they land). */
  readonly board: Board;
  /** Every piece back on its start square. */
  reset(): void;
  /** One piece hops from square to square. */
  hop(from: number, to: number): void;
  /** The draw: every piece hops for joy, a wave from one side to the other. */
  cheer(): void;
  /** Returns how many pieces landed this frame (one click each). */
  update(dt: number): number;
}

/** Chunky toy pieces: a pawn (a ball on a post) and a big one (a taller post, a collar, a crown with a knob). */
function pieceGeos(): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const pawn = mergeGeometries([
    new THREE.CylinderGeometry(0.058, 0.064, 0.035, 12).translate(0, 0.0175, 0),
    new THREE.CylinderGeometry(0.03, 0.046, 0.07, 12).translate(0, 0.07, 0),
    new THREE.SphereGeometry(0.046, 12, 8).translate(0, 0.13, 0),
  ].map((g) => g.toNonIndexed()))!;
  const big = mergeGeometries([
    new THREE.CylinderGeometry(0.064, 0.07, 0.035, 12).translate(0, 0.0175, 0),
    new THREE.CylinderGeometry(0.036, 0.052, 0.13, 12).translate(0, 0.1, 0),
    new THREE.CylinderGeometry(0.056, 0.044, 0.03, 12).translate(0, 0.175, 0),
    new THREE.CylinderGeometry(0.05, 0.04, 0.06, 6).translate(0, 0.22, 0),
    new THREE.SphereGeometry(0.024, 8, 6).translate(0, 0.265, 0),
  ].map((g) => g.toNonIndexed()))!;
  pawn.computeVertexNormals();
  big.computeVertexNormals();
  return [pawn, big];
}

/** A small wooden table with a 6×6 toy board (cream and teal squares, a teal frame), a coral pouf left, a blue one right; 24 pieces in two instanced draws. */
export function createChessCorner(skin: Skin): ChessCorner {
  const root = new THREE.Group();
  root.name = 'chess';
  const p = new Kit('playroom-chess', skin).part('chess', root);
  const W = 1.16;
  for (const x of [-0.46, 0.46]) for (const z of [-0.46, 0.46]) p.box([0.09, TABLE_H, 0.09], [x, TABLE_H / 2, z], WOOD_D);
  p.box([W, 0.06, W], [0, TABLE_H - 0.03, 0], WOOD);
  p.box([W + 0.04, 0.03, W + 0.04], [0, TABLE_H - 0.07, 0], WOOD_D);
  const N = CHESS.size;
  const B = N * SQUARE;
  p.box([B + 0.08, 0.05, B + 0.08], [0, TABLE_H + 0.025, 0], TEAL_D);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) p.box([SQUARE, 0.025, SQUARE], [(c - (N - 1) / 2) * SQUARE, BOARD_Y - 0.0125, (r - (N - 1) / 2) * SQUARE], (r + c) % 2 ? TEAL : CREAM);
  // the poufs: round cushions, a button on top
  const poufs: [number, string, string][] = [
    [-POUF_X, CORAL, '#f07a60'],
    [POUF_X, BLUE, '#4c95e4'],
  ];
  const b = new Build(skin, 'playroom-poufs');
  for (const [x, c, top] of poufs) {
    b.cyl(0.27, POUF_H - 0.06, [x, (POUF_H - 0.06) / 2, 0], c, { seg: 16 });
    b.cyl(0.25, 0.08, [x, POUF_H - 0.04, 0], top, { r1: 0.2, seg: 16 });
    b.cyl(0.05, 0.03, [x, POUF_H + 0.005, 0], CREAM, { seg: 10 });
    b.cyl(0.275, 0.03, [x, 0.12, 0], CREAM, { seg: 16 });
  }
  p.done();
  b.finish();
  root.add(b.root);
  markShadows(root);
  const seats: [THREE.Object3D, THREE.Object3D] = [seatAt(root, [-POUF_X, POUF_H + 0.02, 0], HP), seatAt(root, [POUF_X, POUF_H + 0.02, 0], -HP)];

  // the pieces: side 0 (coral) starts on columns 0–1, side 1 (blue) on the last two; the outer column big
  const [pawnGeo, bigGeo] = pieceGeos();
  const mat = skin.partMaterial('#ffffff');
  const pawns = new THREE.InstancedMesh(pawnGeo, mat, N * 2);
  const bigs = new THREE.InstancedMesh(bigGeo, mat, N * 2);
  pawns.name = 'pawns';
  bigs.name = 'bigs';
  for (const m of [pawns, bigs]) {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  interface Piece {
    mesh: THREE.InstancedMesh;
    i: number;
    side: 0 | 1;
    home: number;
    sq: number;
    from: number;
    t: number;
    cheer: number;
  }
  const pieces: Piece[] = [];
  const colour = new THREE.Color();
  const start = startBoard(N);
  let np = 0;
  let nb = 0;
  start.forEach((side, sq) => {
    if (side === null) return;
    const c = sq % N;
    const big = c === 0 || c === N - 1;
    const mesh = big ? bigs : pawns;
    const i = big ? nb++ : np++;
    mesh.setColorAt(i, colour.set(SET_COLOURS[side]));
    pieces.push({ mesh, i, side, home: sq, sq, from: sq, t: 1, cheer: -1 });
  });
  for (const m of [pawns, bigs]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  const board: Board = startBoard(N);
  const at = (sq: number, out: THREE.Vector3) => out.set(((sq % N) - (N - 1) / 2) * SQUARE, BOARD_Y, (Math.floor(sq / N) - (N - 1) / 2) * SQUARE);
  const a = new THREE.Vector3();
  const bb = new THREE.Vector3();
  const face = [new THREE.Quaternion().setFromAxisAngle(UP, HP), new THREE.Quaternion().setFromAxisAngle(UP, -HP)];
  const place = () => {
    for (const pc of pieces) {
      at(pc.from, a);
      at(pc.sq, bb);
      const f = Math.min(1, pc.t);
      a.lerp(bb, f * f * (3 - 2 * f));
      let lift = pc.t < 1 ? Math.sin(Math.PI * pc.t) * 0.16 : 0;
      let sq = 1;
      if (pc.cheer >= 0 && pc.cheer < 1) {
        lift += Math.sin(Math.PI * pc.cheer) * 0.12;
        sq = 1 + 0.12 * Math.sin(Math.PI * pc.cheer * 2);
      }
      a.y += lift;
      pc.mesh.setMatrixAt(pc.i, m4.compose(a, face[pc.side], s3.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))));
    }
    pawns.instanceMatrix.needsUpdate = true;
    bigs.instanceMatrix.needsUpdate = true;
  };
  place();
  let moving = false;
  return {
    root,
    seats,
    board,
    reset() {
      board.splice(0, board.length, ...startBoard(N));
      for (const pc of pieces) {
        pc.sq = pc.from = pc.home;
        pc.t = 1;
        pc.cheer = -1;
      }
      place();
    },
    hop(from, to) {
      const pc = pieces.find((x) => x.sq === from);
      if (!pc || board[to] !== null) return;
      board[to] = board[from];
      board[from] = null;
      pc.from = from;
      pc.sq = to;
      pc.t = 0;
      moving = true;
    },
    cheer() {
      for (const pc of pieces) pc.cheer = -((pc.sq % N) / N) * 0.6 - (pc.side ? 0.1 : 0);
      moving = true;
    },
    update(dt) {
      if (!moving) return 0;
      let landed = 0;
      let busy = false;
      for (const pc of pieces) {
        if (pc.t < 1) {
          pc.t += dt / CHESS.hop;
          if (pc.t >= 1) landed++;
          else busy = true;
        }
        if (pc.cheer !== -1 && pc.cheer < 1) {
          pc.cheer = Math.min(1, pc.cheer + dt / 0.45);
          busy = true;
        }
      }
      place();
      moving = busy;
      return landed;
    },
  };
}

// ─── the easel ──────────────────────────────────────────────────────────────

const TILE = 128;
const COLS = 3;
const ROWS = Math.ceil(EASEL.drawings / COLS);

/** The child's drawings, made once up front: a sun, a house, the cat, a monster, a rainbow, the four friends. */
function drawingsTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = TILE * COLS;
  c.height = TILE * ROWS;
  const g = c.getContext('2d')!;
  const crayon = (w = 6) => {
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
  };
  const line = (pts: [number, number][], colour: string, w = 6) => {
    crayon(w);
    g.strokeStyle = colour;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const disc = (x: number, y: number, r: number, fill: string, stroke?: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    if (stroke) {
      crayon(4);
      g.strokeStyle = stroke;
      g.stroke();
    }
  };
  const smile = (x: number, y: number, r: number, colour = INK) => {
    crayon(4);
    g.strokeStyle = colour;
    g.beginPath();
    g.arc(x, y, r, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  };
  const grass = () => line([[6, 116], [30, 112], [60, 117], [92, 111], [122, 116]], GREEN, 8);
  const tiles: (() => void)[] = [
    // the sun with a face
    () => {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        line([[64 + Math.cos(a) * 34, 56 + Math.sin(a) * 34], [64 + Math.cos(a) * 50, 56 + Math.sin(a) * 50]], '#f39a1e', 6);
      }
      disc(64, 56, 27, YELLOW, '#f39a1e');
      disc(55, 51, 4, INK);
      disc(73, 51, 4, INK);
      smile(64, 58, 12);
      grass();
    },
    // a house with a chimney and smoke
    () => {
      g.fillStyle = MUSTARD;
      g.fillRect(30, 60, 66, 50);
      g.fillStyle = CORAL;
      g.beginPath();
      g.moveTo(22, 62);
      g.lineTo(63, 24);
      g.lineTo(104, 62);
      g.closePath();
      g.fill();
      g.fillStyle = CORAL_DARK;
      g.fillRect(80, 28, 10, 22);
      line([[85, 22], [80, 14], [90, 8], [84, 2]], '#9aa3ad', 4);
      g.fillStyle = TEAL;
      g.fillRect(56, 82, 16, 28);
      g.fillStyle = '#7fd0f0';
      g.fillRect(36, 70, 14, 14);
      g.fillRect(78, 70, 14, 14);
      grass();
    },
    // Пупся: a round grey-brown cat with stripes, whiskers and a curly tail
    () => {
      const fur = '#9a8770';
      g.fillStyle = fur;
      g.beginPath();
      g.ellipse(64, 86, 30, 24, 0, 0, TAU);
      g.fill();
      line([[92, 92], [112, 80], [108, 60]], fur, 9);
      disc(64, 50, 24, fur);
      g.beginPath();
      g.moveTo(44, 40);
      g.lineTo(46, 18);
      g.lineTo(60, 32);
      g.moveTo(84, 40);
      g.lineTo(82, 18);
      g.lineTo(68, 32);
      g.fill();
      line([[52, 72], [52, 84]], '#3b3029', 4);
      line([[64, 70], [64, 84]], '#3b3029', 4);
      line([[76, 72], [76, 84]], '#3b3029', 4);
      disc(56, 46, 4, '#3fa142');
      disc(72, 46, 4, '#3fa142');
      disc(64, 56, 3, PINK);
      line([[40, 54], [56, 56]], INK, 2);
      line([[40, 62], [56, 59]], INK, 2);
      line([[88, 54], [72, 56]], INK, 2);
      line([[88, 62], [72, 59]], INK, 2);
    },
    // a silly green monster in a purple shirt, arms up
    () => {
      g.fillStyle = '#8a6bbd';
      g.fillRect(42, 62, 44, 40);
      line([[42, 66], [22, 44]], '#93c45a', 8);
      line([[86, 66], [106, 44]], '#93c45a', 8);
      line([[52, 102], [50, 120]], '#6d5a44', 9);
      line([[76, 102], [78, 120]], '#6d5a44', 9);
      g.fillStyle = '#93c45a';
      g.fillRect(44, 22, 40, 40);
      disc(55, 38, 6, PAPER);
      disc(73, 38, 6, PAPER);
      disc(56, 39, 3, INK);
      disc(72, 39, 3, INK);
      line([[54, 52], [60, 49], [66, 53], [72, 49], [76, 52]], INK, 3);
      line([[48, 22], [52, 14], [58, 22], [64, 12], [70, 22], [76, 14], [80, 22]], '#4c7d36', 4);
    },
    // a rainbow over two clouds
    () => {
      [CORAL, '#f39a1e', YELLOW, GREEN, BLUE, '#8a6bbd'].forEach((col, i) => {
        crayon(7);
        g.strokeStyle = col;
        g.beginPath();
        g.arc(64, 96, 50 - i * 7, Math.PI, TAU);
        g.stroke();
      });
      for (const x of [20, 108]) {
        disc(x - 8, 98, 12, '#ffffff', '#c8d6e0');
        disc(x + 8, 98, 12, '#ffffff', '#c8d6e0');
        disc(x, 90, 13, '#ffffff');
      }
      grass();
    },
    // the four friends holding hands under a heart
    () => {
      const kids: [number, string, string, number][] = [
        [22, '#22306e', '#f6c9a2', 1],
        [50, '#f47fb4', '#f8d3b4', 1],
        [76, '#9a8770', '#9a8770', 0.7],
        [104, '#f2f09a', '#f6c9a2', 1],
      ];
      line(kids.map(([x, , , s]) => [x, 86 - (1 - s) * 10] as [number, number]), INK, 3);
      for (const [x, shirt, skin, s] of kids) {
        const top = 52 + (1 - s) * 30;
        line([[x, top + 30 * s], [x - 7, 116]], INK, 4);
        line([[x, top + 30 * s], [x + 7, 116]], INK, 4);
        g.fillStyle = shirt;
        g.fillRect(x - 9 * s, top + 12 * s, 18 * s, 22 * s);
        disc(x, top, 11 * s, skin);
        disc(x - 4 * s, top - 2, 2, INK);
        disc(x + 4 * s, top - 2, 2, INK);
      }
      g.fillStyle = CORAL;
      g.beginPath();
      g.moveTo(64, 36);
      g.bezierCurveTo(40, 18, 46, 2, 64, 14);
      g.bezierCurveTo(82, 2, 88, 18, 64, 36);
      g.fill();
    },
  ];
  tiles.forEach((draw, i) => {
    g.save();
    g.translate((i % COLS) * TILE, Math.floor(i / COLS) * TILE);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, TILE, TILE);
    g.beginPath();
    g.rect(0, 0, TILE, TILE);
    g.clip();
    draw();
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.repeat.set(1 / COLS, 1 / ROWS);
  return tex;
}

export interface Easel {
  root: THREE.Group;
  /** The middle of the sheet (taps). */
  sheet: THREE.Object3D;
  /** Which drawing is up (0..EASEL.drawings-1). */
  readonly drawing: number;
  /** The next drawing appears with a hop. */
  next(): void;
  update(dt: number): void;
}

/** A toy easel facing +Z: three wooden legs, a mustard tray of crayons, a cream board tipped back with a paper sheet clipped on. */
export function createEasel(skin: Skin): Easel {
  const root = new THREE.Group();
  root.name = 'easel';
  const b = new Build(skin, 'playroom-easel');
  root.add(b.root);
  for (const sx of [-1, 1]) b.beam([sx * 0.34, 0, 0.16], [sx * 0.22, 1.32, -0.04], 0.07, WOOD_D);
  b.beam([0, 0, -0.42], [0, 1.24, -0.1], 0.06, WOOD_D);
  b.box([0.66, 0.05, 0.14], [0, 0.52, 0.1], MUSTARD);
  b.box([0.66, 0.06, 0.03], [0, 0.56, 0.17], MUSTARD);
  ([[-0.22, CORAL], [-0.12, BLUE], [-0.02, GREEN], [0.08, YELLOW], [0.18, PINK]] as const).forEach(([x, c], i) => b.box([0.07, 0.03, 0.03], [x, 0.565, 0.08 + (i % 2) * 0.03], c, [0, 0.3 * (i - 2), 0]));
  b.finish();

  // the board and the sheet: tipped back, so the steep camera sees the drawing nearly face on
  const board = new THREE.Group();
  board.position.set(0, 0.6, 0.06);
  board.rotation.x = -0.32;
  root.add(board);
  const bk = new Kit('playroom-easel-board', skin).part('board', board);
  const BW = 0.78;
  const BH = 0.66;
  bk.box([BW, BH, 0.04], [0, BH / 2, 0], CREAM);
  bk.box([BW + 0.06, 0.05, 0.06], [0, 0.02, 0.01], WOOD);
  bk.box([0.16, 0.06, 0.06], [0, BH - 0.02, 0.03], CORAL);
  bk.done();
  const tex = drawingsTexture();
  const sheetMat = skin.partMaterial('#ffffff', { map: tex });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.14, BH - 0.14), sheetMat);
  sheet.name = 'sheet';
  sheet.position.set(0, BH / 2 - 0.01, 0.025);
  sheet.receiveShadow = true;
  board.add(sheet);
  markShadows(root);

  let drawing = 0;
  let hop = 0;
  const show = (i: number) => {
    tex.offset.set((i % COLS) / COLS, 1 - (Math.floor(i / COLS) + 1) / ROWS);
  };
  show(0);
  return {
    root,
    sheet,
    get drawing() {
      return drawing;
    },
    next() {
      drawing = (drawing + 1) % EASEL.drawings;
      show(drawing);
      hop = 1;
    },
    update(dt) {
      if (hop <= 0) return;
      hop = Math.max(0, hop - dt * 2.6);
      const k = Math.sin(hop * Math.PI) * hop;
      board.position.y = 0.6 + 0.07 * k;
      board.scale.set(1 + 0.05 * k, 1 - 0.04 * k, 1);
      root.scale.set(1 + 0.03 * k, 1 - 0.05 * k, 1 + 0.03 * k);
    },
  };
}

// ─── the toy rug ────────────────────────────────────────────────────────────

const RUG_W = 3;
const RUG_D = 2;
const TOY_BALL_R = 0.17;

export interface ToyRug {
  root: THREE.Group;
  /** The ball (its centre). */
  ball: THREE.Object3D;
  /** The ball rolls a little, away from (dx, dz) and never off the rug. */
  roll(dx: number, dz: number): void;
  update(dt: number): void;
}

/** A soft 3×2 rug (teal border, cream middle, a grey road loop with cream dashes) with toys: a stack of toy bricks, a blue toy car, a two-colour ball. */
export function createToyRug(skin: Skin): ToyRug {
  const root = new THREE.Group();
  root.name = 'toy-rug';
  const p = new Kit('playroom-rug', skin).part('rug', root);
  p.box([RUG_W, 0.03, RUG_D], [0, 0.015, 0], TEAL);
  p.box([RUG_W - 0.2, 0.035, RUG_D - 0.2], [0, 0.0175, 0], CREAM);
  // the road loop
  const RX = 0.95;
  const RZ = 0.55;
  const RW = 0.2;
  p.box([RX * 2 + RW, 0.04, RW], [0, 0.02, -RZ], '#8f949a');
  p.box([RX * 2 + RW, 0.04, RW], [0, 0.02, RZ], '#8f949a');
  p.box([RW, 0.04, RZ * 2], [-RX, 0.02, 0], '#8f949a');
  p.box([RW, 0.04, RZ * 2], [RX, 0.02, 0], '#8f949a');
  for (let x = -0.7; x <= 0.71; x += 0.35) for (const z of [-RZ, RZ]) p.box([0.14, 0.045, 0.03], [x, 0.02, z], CREAM);
  for (const x of [-RX, RX]) p.box([0.03, 0.045, 0.14], [x, 0.02, 0], CREAM);
  // little coloured dots on the cream
  ([[-0.45, -0.1, CORAL], [0.2, 0.15, YELLOW], [0.55, -0.15, PINK], [-0.1, 0.2, GREEN]] as const).forEach(([x, z, c]) => p.box([0.12, 0.04, 0.12], [x, 0.02, z], c));
  // the toy bricks: a stack of three with studs, one more lying beside
  const brick = (x: number, y: number, z: number, c: string, w = 0.32, ry = 0) => {
    p.box([w, 0.16, 0.18], [x, y + 0.08, z], c, [0, ry, 0]);
    for (const sx of w > 0.2 ? [-w / 4, w / 4] : [0]) {
      const cx = x + Math.cos(ry) * sx;
      const cz = z - Math.sin(ry) * sx;
      p.box([0.08, 0.04, 0.08], [cx, y + 0.18, cz], c);
    }
  };
  brick(1.15, 0.035, -0.75, CORAL, 0.32, 0.2);
  brick(1.15, 0.195, -0.75, BLUE, 0.32, -0.15);
  brick(1.15, 0.355, -0.75, YELLOW, 0.16, 0.1);
  brick(0.75, 0.035, -0.82, GREEN, 0.32, 1.1);
  // the toy car on the road
  const cx = -0.35;
  const cz = RZ;
  p.box([0.42, 0.12, 0.22], [cx, 0.13, cz], BLUE);
  p.box([0.22, 0.1, 0.2], [cx - 0.03, 0.24, cz], '#cfeff2');
  p.box([0.24, 0.03, 0.21], [cx - 0.03, 0.3, cz], BLUE);
  p.box([0.04, 0.05, 0.2], [cx + 0.21, 0.13, cz], YELLOW);
  for (const x of [cx - 0.13, cx + 0.13]) for (const z of [cz - 0.12, cz + 0.12]) p.box([0.1, 0.1, 0.04], [x, 0.09, z], CHARCOAL);
  p.done();
  markShadows(root);

  // the ball on its own, so it can roll
  const ball = new THREE.Group();
  ball.name = 'toy-ball';
  const bb = new Build(skin, 'playroom-ball');
  bb.ball(TOY_BALL_R, [0, 0, 0], CORAL, { top: true });
  bb.ball(TOY_BALL_R, [0, 0, 0], PAPER, { top: true, rot: [Math.PI, 0, 0] });
  bb.cyl(TOY_BALL_R + 0.004, 0.05, [0, 0, 0], BLUE, { seg: 18 });
  bb.finish();
  ball.add(bb.root);
  ball.position.set(0.35, TOY_BALL_R + 0.035, -0.25);
  root.add(ball);
  markShadows(ball);

  let from = new THREE.Vector3();
  let to = new THREE.Vector3();
  let t = 1;
  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const lim = (x: number, half: number) => Math.max(-half + TOY_BALL_R + 0.1, Math.min(half - TOY_BALL_R - 0.1, x));
  return {
    root,
    ball,
    roll(dx, dz) {
      const d = Math.hypot(dx, dz) || 1;
      const dist = 0.55 + Math.random() * 0.3;
      from = ball.position.clone();
      to = new THREE.Vector3(lim(from.x + (dx / d) * dist, RUG_W / 2), from.y, lim(from.z + (dz / d) * dist, RUG_D / 2));
      // against the rug's edge: it bounces back the other way
      if (to.distanceTo(from) < 0.2) to.set(lim(from.x - (dx / d) * dist, RUG_W / 2), from.y, lim(from.z - (dz / d) * dist, RUG_D / 2));
      t = 0;
    },
    update(dt) {
      if (t >= 1) return;
      t = Math.min(1, t + dt / 0.9);
      const f = 1 - (1 - t) * (1 - t);
      v.copy(from).lerp(to, f);
      const step = v.distanceTo(ball.position);
      axis.set(to.z - from.z, 0, -(to.x - from.x)).normalize();
      if (step > 0 && axis.lengthSq() > 0) ball.quaternion.premultiply(spin.setFromAxisAngle(axis, step / TOY_BALL_R));
      ball.position.copy(v);
      // a little bounce as it goes, dying away
      ball.position.y = TOY_BALL_R + 0.035 + Math.abs(Math.sin(f * Math.PI * 2)) * 0.03 * (1 - f);
    },
  };
}
