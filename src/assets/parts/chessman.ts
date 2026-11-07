/**
 * Living toy chess pieces (DESIGN.md «Chess kingdom»): the folk of the chess kingdom and the knight of
 * «Великі шахи». The body is the piece's own shape — king (the tallest: a closed crown of arches over a
 * coral cap with a big round orb on top, no cross), queen (an open coronet of little points each with a
 * ball, a slim waist over a wide skirt-like base), rook (a little tower with a door and battlements),
 * bishop (a mitre-cap with a slit), knight (a horse head with a mane), pawn (a round head) — with a
 * friendly 8×8 face, little arms and a round base instead of legs. White: cream with mustard trims;
 * black: chocolate with cream trims. Heights ≈ pawn 1.0, rook 1.2, queen 1.3, knight 1.3, bishop 1.4,
 * king 1.7 blocks: the king and the queen are told apart at a glance, also at HUD size.
 *
 * The rig is a 'biped' so the shared animator (assets/animate.ts) drives it: `legL`/`legR` are empty
 * pivots (there are no legs) and the base belongs to the rig root, so the whole piece hops.
 *   - hop (how a piece moves, cell to cell): call `model.update(dt, 0)` (arms still; pass the speed
 *     instead to swing them) and lift the model's root yourself: for u going 0 → 1 over HOP.time
 *     seconds per hop, root.y = ground + hopLift(u) (a knight's jump: hopLift(u, 0.9)); optionally
 *     root.scale.y = hopSquash(u) for the take-off and the landing. A slide (rook, bishop) is the
 *     same with several small hops along the way.
 *   - wave: after `model.update(...)` call waveArm(model.root, t, k) every frame while waving
 *     (t = seconds, k 0…1 blends it in); the animator rewrites the arm each update, so just stop
 *     calling it to put the arm down.
 *   - cheer: model.play('cheer') (two hops, both arms up); 'happy' hops and spins; 'dance' bounces to
 *     the beat (held until another action).
 * Registered in assets/models.ts as `chess_king` (the White King, the kingdom's asker) and
 * `chess_<side>_<kind>` for every piece.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Rig, Skin } from '../../contracts';
import type { PieceKind, PieceSide } from '../../content/chess';
import { FACE_U, faceAtlas, swatchUV, type FaceSpec } from '../faces';
import { mergeCached, place, tint } from '../villages';
import { bipedFrame } from './frames';
import { Kit, type V3 } from './kit';

interface Look {
  body: string;
  /** The base's foot and the rook's brick lines. */
  shade: string;
  /** Collar, crown, hands, mane. */
  trim: string;
  /** The bishop's slit, the knight's nostrils. */
  dark: string;
  jewel: string;
}

const LOOKS: Record<PieceSide, Look> = {
  white: { body: '#ffe3a3', shade: '#ecc47c', trim: '#eab02b', dark: '#b07a22', jewel: '#e0583f' },
  black: { body: '#4a2c14', shade: '#331d0c', trim: '#ffe3a3', dark: '#ffe3a3', jewel: '#e0583f' },
};
/** The promoted pawn's little crown (item-chess-pawn). */
const GOLD = '#ffd23a';

interface Dims {
  /** Body height (above the base) and its radius at the bottom and the top. */
  body: number;
  r0: number;
  r1: number;
  head: V3;
  round: number;
  base: number;
  /** A slim waist over a skirt (the queen): the waist's height (0…1) and radius. */
  waist?: [number, number];
}

const BASE_H = 0.16;
const COLLAR = 0.05;
const DIMS: Record<PieceKind, Dims> = {
  king: { body: 0.7, r0: 0.28, r1: 0.17, head: [0.4, 0.36, 0.36], round: 0.08, base: 0.35 },
  queen: { body: 0.5, r0: 0.34, r1: 0.15, head: [0.38, 0.34, 0.34], round: 0.09, base: 0.39, waist: [0.68, 0.1] },
  bishop: { body: 0.5, r0: 0.25, r1: 0.15, head: [0.36, 0.33, 0.34], round: 0.1, base: 0.32 },
  rook: { body: 0.5, r0: 0.27, r1: 0.23, head: [0.46, 0.34, 0.42], round: 0.05, base: 0.34 },
  knight: { body: 0.48, r0: 0.26, r1: 0.17, head: [0.32, 0.34, 0.3], round: 0.07, base: 0.33 },
  pawn: { body: 0.34, r0: 0.25, r1: 0.12, head: [0.4, 0.38, 0.38], round: 0.15, base: 0.31 },
};

/** The body's radius at height t (0 bottom … 1 top): a soft concave chess-piece taper, or (with a
 *  waist) a skirt flaring out below a slim waist and a little bodice above it. */
const rAt = (d: Dims, t: number): number => {
  if (!d.waist) return d.r1 + (d.r0 - d.r1) * Math.pow(1 - t, 1.7);
  const [wt, wr] = d.waist;
  return t < wt ? wr + (d.r0 - wr) * Math.pow(1 - t / wt, 2.2) : wr + (d.r1 - wr) * Math.pow((t - wt) / (1 - wt), 1.4);
};

// ─── faces ──────────────────────────────────────────────────────────────────

const PAL_WHITE = { K: '#3b2414', W: '#ffffff', P: '#f4a090', M: '#b0524a', m: '#d9961c', b: '#c58d2c', L: '#e0583f' };
const PAL_BLACK = { K: '#140b05', W: '#fff4dc', P: '#b8604e', M: '#ffcf9a', m: '#ffe3a3', b: '#e6c68e', L: '#ff8a6a' };

/** The white pieces' faces; the black ones are the same rows on chocolate (`chessmanFace`). */
export const CHESSMAN_FACES: Record<PieceKind, FaceSpec> = {
  king: {
    swatches: [LOOKS.white.body],
    pal: PAL_WHITE,
    open: [
      '........',
      '.bb..bb.',
      '.WK..KW.',
      '.KK..KK.',
      'P..mm..P',
      '.mm..mm.',
      '..MMMM..',
      '........',
    ],
    closed: { 2: '........', 3: '.KK..KK.' },
  },
  queen: {
    swatches: [LOOKS.white.body],
    pal: PAL_WHITE,
    open: [
      '........',
      'KKK..KKK',
      '.WK..KW.',
      '.KK..KK.',
      'P......P',
      '..L..L..',
      '...LL...',
      '........',
    ],
    closed: { 1: '........', 2: '........', 3: 'KKK..KKK' },
  },
  bishop: {
    swatches: [LOOKS.white.body],
    pal: PAL_WHITE,
    open: [
      '........',
      '........',
      '.bb..bb.',
      '.WK..KW.',
      '.KK..KK.',
      'P......P',
      '..M..M..',
      '...MM...',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  rook: {
    swatches: [LOOKS.white.body],
    pal: PAL_WHITE,
    open: [
      '........',
      '........',
      '.KK..KK.',
      '.KW..KW.',
      'P......P',
      '.M....M.',
      '..MMMM..',
      '........',
    ],
    closed: { 2: '........', 3: '.KK..KK.' },
  },
  // the muzzle covers the lower half: everything is in the top four rows
  knight: {
    swatches: [LOOKS.white.body],
    pal: PAL_WHITE,
    open: [
      '........',
      '.WK..KW.',
      '.KK..KK.',
      'P......P',
      '........',
      '........',
      '........',
      '........',
    ],
    closed: { 1: '........', 2: '.KK..KK.' },
  },
  pawn: {
    swatches: [LOOKS.white.body],
    pal: PAL_WHITE,
    open: [
      '........',
      '........',
      '.WK..KW.',
      '.KK..KK.',
      'P......P',
      '..M..M..',
      '...MM...',
      '........',
    ],
    closed: { 2: '........', 3: '.KK..KK.' },
  },
};

/** A piece's face for its side. */
export function chessmanFace(kind: PieceKind, side: PieceSide): FaceSpec {
  const f = CHESSMAN_FACES[kind];
  return side === 'white' ? f : { ...f, swatches: [LOOKS.black.body], pal: PAL_BLACK };
}

// ─── geometry ───────────────────────────────────────────────────────────────

/** Tinted geometries of one part, merged into one vertex-coloured mesh. */
class Bits {
  readonly list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, at: V3, hex: string, rot?: V3, s?: V3 | number): this {
    this.list.push(tint(place(g, at, { rot, s }), hex));
    return this;
  }
  cyl(rTop: number, rBot: number, h: number, at: V3, hex: string, seg = 16): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), at, hex);
  }
  ball(r: number, at: V3, hex: string, s?: V3): this {
    return this.add(new THREE.SphereGeometry(r, r > 0.05 ? 12 : 8, r > 0.05 ? 8 : 6), at, hex, undefined, s);
  }
  box(size: V3, at: V3, hex: string, rot?: V3): this {
    return this.add(new THREE.BoxGeometry(...size), at, hex, rot);
  }
  rbox(size: V3, round: number, at: V3, hex: string): this {
    return this.add(new RoundedBoxGeometry(size[0], size[1], size[2], 2, round), at, hex);
  }
  mesh(key: string, kit: Kit, name: string): THREE.Mesh {
    const m = new THREE.Mesh(mergeCached(key, this.list), kit.vertexColourMaterial(false));
    m.name = name;
    m.castShadow = true;
    return m;
  }
}

const faceGeos = new Map<string, THREE.BufferGeometry>();
/** A rounded head box whose front (+Z) shows the 8×8 face and every other side swatch 0. */
function faceBox(key: string, size: V3, round: number, at: V3): THREE.BufferGeometry {
  let g = faceGeos.get(key);
  if (g) return g;
  g = new RoundedBoxGeometry(size[0], size[1], size[2], 3, round);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // RoundedBoxGeometry keeps BoxGeometry's side order (+X, −X, +Y, −Y, +Z, −Z), equal vertex runs
  const per = uv.count / 6;
  const [su, sv] = swatchUV(0);
  for (let i = 0; i < uv.count; i++) {
    if (Math.floor(i / per) === 4) uv.setX(i, uv.getX(i) * FACE_U);
    else uv.setXY(i, su, sv);
  }
  g.translate(...at);
  g.computeBoundingSphere();
  faceGeos.set(key, g);
  return g;
}

/** A crown on top of a head whose top is at y = top: band radius r, `points` points, a ball over the middle (king). */
function crown(b: Bits, top: number, r: number, points: number, colour: string, jewel: string, o: { tall: number; king?: boolean }): void {
  b.cyl(r, r, 0.1, [0, top, 0], colour, 16);
  // the soft cap inside the band
  b.ball(r * 0.86, [0, top + 0.02, 0], jewel, [1, 0.7, 1]);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const x = Math.sin(a) * r * 0.93;
    const z = Math.cos(a) * r * 0.93;
    b.box([0.065, o.tall, 0.045], [x, top + 0.06 + o.tall / 2, z], colour, [0, a, 0]);
    b.ball(0.03, [x, top + 0.07 + o.tall, z], colour);
  }
  b.box([0.06, 0.06, 0.03], [0, top + 0.005, r + 0.005], jewel, [0, 0, Math.PI / 4]);
  if (o.king) {
    b.cyl(0.032, 0.04, 0.12, [0, top + 0.13, 0], colour, 10);
    b.ball(0.07, [0, top + 0.25, 0], colour);
  }
}

/** The king's closed crown on a head whose top is at y = top: a band, two arches crossing over a
 *  coral cap, and a big round orb on a short stem (no cross). */
function closedCrown(b: Bits, top: number, r: number, colour: string, jewel: string): void {
  const archH = 0.22;
  b.cyl(r + 0.01, r, 0.1, [0, top, 0], colour, 16);
  b.ball(r * 0.9, [0, top + 0.03, 0], jewel, [1, (archH - 0.02) / (r * 0.9), 1]);
  for (const a of [0, Math.PI / 2]) {
    const arch = new THREE.TorusGeometry(r * 0.93, 0.032, 6, 14, Math.PI).scale(1, archH / (r * 0.93), 1).rotateY(a);
    b.add(arch, [0, top + 0.04, 0], colour);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.ball(0.03, [Math.sin(a) * r, top + 0.06, Math.cos(a) * r], colour);
  }
  b.box([0.07, 0.07, 0.03], [0, top + 0.005, r + 0.012], jewel, [0, 0, Math.PI / 4]);
  // the orb: a big ball with a band round its middle
  b.cyl(0.035, 0.045, 0.06, [0, top + archH + 0.06, 0], colour, 10);
  b.ball(0.1, [0, top + archH + 0.17, 0], colour);
  b.add(new THREE.TorusGeometry(0.1, 0.018, 6, 18), [0, top + archH + 0.17, 0], jewel, [Math.PI / 2, 0, 0]);
}

/** The queen's open coronet: a flaring band and little points leaning out, each ending in a ball. */
function coronet(b: Bits, top: number, r: number, colour: string, jewel: string): void {
  const n = 7;
  const tall = 0.14;
  const lean = 0.28;
  b.cyl(r + 0.03, r, 0.08, [0, top, 0], colour, 18);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // tipped out about its foot's tangent: lean towards +Z, then turned round to its place
    const rr = r + 0.012 + (Math.sin(lean) * tall) / 2;
    const point = new THREE.BoxGeometry(0.045, tall, 0.035).rotateX(lean).rotateY(a);
    b.add(point, [Math.sin(a) * rr, top + 0.03 + (Math.cos(lean) * tall) / 2, Math.cos(a) * rr], colour);
    const tip = r + 0.012 + Math.sin(lean) * tall;
    b.ball(0.036, [Math.sin(a) * tip, top + 0.04 + Math.cos(lean) * tall, Math.cos(a) * tip], colour);
  }
  b.box([0.06, 0.06, 0.03], [0, top, r + 0.03], jewel, [0, 0, Math.PI / 4]);
}

export interface ChessmanOptions {
  /** A little gold crown on the head (the pawn that reached the far row, for its picture). */
  crown?: boolean;
}

/** A living chess piece: body = the piece, a face, little arms, a round base; a 'biped' rig with empty legs. */
export function buildChessman(skin: Skin, kind: PieceKind, side: PieceSide, opts: ChessmanOptions = {}): Rig {
  const L = LOOKS[side];
  const d = DIMS[kind];
  const id = `chess_${side}_${kind}`;
  const kit = new Kit(id, skin, faceAtlas(id, chessmanFace(kind, side)));
  const shoulderT = (d.body - 0.11) / d.body;
  const armX = rAt(d, shoulderT) + 0.045;
  const { root, parts } = bipedFrame({ legH: BASE_H, hipX: 0.1, bodyH: d.body + COLLAR, armX, shoulderY: d.body - 0.11 });
  const key = (part: string) => `chessman/${id}${opts.crown ? '+crown' : ''}/${part}`;

  // the round base on the rig root: a dark foot, a trim ring, a step in the body colour
  const base = new THREE.Group();
  base.name = 'base';
  root.add(base);
  base.add(
    new Bits()
      .cyl(d.base, d.base + 0.012, 0.08, [0, 0.04, 0], L.shade, 18)
      .cyl(d.base + 0.022, d.base + 0.022, 0.04, [0, 0.1, 0], L.trim, 18)
      .cyl(d.base - 0.05, d.base - 0.02, 0.04, [0, 0.14, 0], L.body, 18)
      .mesh(key('base'), kit, 'base_vc'),
  );

  // the body: a turned (lathe) shape tapering up, a trim collar on top
  const body = new Bits();
  const prof: THREE.Vector2[] = [];
  const steps = d.waist ? 14 : 10;
  for (let i = 0; i <= steps; i++) prof.push(new THREE.Vector2(rAt(d, i / steps), (i / steps) * d.body));
  body.add(new THREE.LatheGeometry(prof, 18), [0, 0, 0], L.body);
  body.cyl(d.r1 + 0.065, d.r1 + 0.065, COLLAR, [0, d.body + COLLAR / 2, 0], L.trim, 16);
  const ring = (t: number, hex: string, h = 0.045, out = 0.012) => {
    const r = rAt(d, t) + out;
    body.cyl(r, r, h, [0, t * d.body, 0], hex, 18);
  };
  const front = (t: number, out = 0) => rAt(d, t) + out;
  switch (kind) {
    case 'king':
      ring(0.36, L.trim, 0.05);
      for (const t of [0.52, 0.66, 0.8]) body.ball(0.028, [0, t * d.body, front(t, -0.006)], L.trim);
      break;
    case 'queen':
      ring(0.05, L.trim, 0.05, 0.02);
      ring(d.waist![0], L.trim, 0.04, 0.012);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        body.ball(0.035, [Math.sin(a) * (d.r1 + 0.06), d.body + COLLAR, Math.cos(a) * (d.r1 + 0.06)], L.trim);
      }
      body.ball(0.032, [0, 0.62 * d.body, front(0.62, -0.006)], L.jewel);
      break;
    case 'bishop':
      ring(0.3, L.trim, 0.03);
      ring(0.37, L.trim, 0.03);
      body.ball(0.03, [0, 0.66 * d.body, front(0.66, -0.006)], L.jewel);
      break;
    case 'rook':
      for (const t of [0.28, 0.52, 0.76]) ring(t, L.shade, 0.022, 0.006);
      // a little arched door at the foot
      body.box([0.13, 0.17, 0.04], [0, 0.085, front(0.1, -0.005)], L.trim);
      body.add(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12, 1, false, -Math.PI / 2, Math.PI), [0, 0.17, front(0.2, -0.006)], L.trim, [-Math.PI / 2, 0, 0]);
      break;
    case 'knight':
      ring(0.42, L.trim, 0.04);
      break;
    case 'pawn':
      ring(0.3, L.trim, 0.03);
      break;
  }
  parts.body.add(body.mesh(key('body'), kit, 'body_vc'));

  // the head: the face box, and what makes the piece (crown, coronet, mitre, battlements, horse)
  const [hw, hh, hd] = d.head;
  const hb = new Bits();
  let faceAt: V3 = [0, hh / 2, 0];
  switch (kind) {
    case 'king':
      closedCrown(hb, hh, Math.min(hw, hd) / 2 - 0.005, L.trim, L.jewel);
      break;
    case 'queen':
      coronet(hb, hh, Math.min(hw, hd) / 2 - 0.005, L.trim, L.jewel);
      break;
    case 'bishop':
      hb.ball(1, [0, hh + 0.03, -0.005], L.body, [0.165, 0.27, 0.16]);
      hb.cyl(0.17, 0.17, 0.04, [0, hh + 0.0, 0], L.trim, 16);
      {
        // the slit: a thin groove lying on the cap, from the front up to the top right
        const g = new THREE.TorusGeometry(1, 0.1, 5, 14, 0.95).rotateZ(0.3).rotateY(-Math.PI / 2).rotateZ(-0.5);
        g.scale(0.168, 0.274, 0.163);
        hb.add(g, [0, hh + 0.03, -0.005], L.dark);
      }
      hb.ball(0.045, [0, hh + 0.31, -0.005], L.trim);
      break;
    case 'rook': {
      hb.box([hw + 0.03, 0.06, hd + 0.03], [0, hh - 0.02, 0], L.trim);
      hb.box([hw - 0.1, 0.02, hd - 0.1], [0, hh + 0.01, 0], L.shade);
      const mx = hw / 2 - 0.065;
      const mz = hd / 2 - 0.065;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) hb.box([0.13, 0.13, 0.13], [sx * mx, hh + 0.065, sz * mz], L.body);
      for (const sz of [-1, 1]) hb.box([0.11, 0.13, 0.1], [0, hh + 0.065, sz * (hd / 2 - 0.05)], L.body);
      for (const sx of [-1, 1]) hb.box([0.1, 0.13, 0.11], [sx * (hw / 2 - 0.05), hh + 0.065, 0], L.body);
      break;
    }
    case 'knight': {
      // a neck, the head (face box) a little back, a long muzzle forward, ears and a mane
      faceAt = [0, 0.31, -0.01];
      hb.cyl(0.11, 0.125, 0.16, [0, 0.07, -0.01], L.body, 16);
      hb.rbox([0.25, 0.2, 0.26], 0.07, [0, 0.24, 0.17], L.body);
      for (const sx of [-1, 1]) hb.box([0.045, 0.035, 0.02], [sx * 0.06, 0.27, 0.3], L.dark);
      hb.box([0.12, 0.022, 0.02], [0, 0.185, 0.297], L.dark);
      for (const sx of [-1, 1]) hb.box([0.07, 0.13, 0.05], [sx * 0.09, 0.53, -0.07], L.body, [0, 0, -sx * 0.22]);
      for (const sx of [-1, 1]) hb.box([0.035, 0.08, 0.02], [sx * 0.092, 0.53, -0.04], L.jewel, [0, 0, -sx * 0.22]);
      hb.box([0.11, 0.06, 0.07], [0, 0.49, 0.11], L.trim);
      for (const [y, z] of [[0.49, -0.13], [0.4, -0.17], [0.3, -0.18], [0.2, -0.17], [0.1, -0.15]] as const) hb.box([0.1, 0.11, 0.1], [0, y, z], L.trim);
      break;
    }
    case 'pawn':
      if (opts.crown) crown(hb, hh - 0.04, 0.13, 6, GOLD, L.jewel, { tall: 0.09 });
      else hb.ball(0.05, [0, hh - 0.005, 0], L.trim);
      break;
  }
  parts.head.add(hb.mesh(key('head'), kit, 'head_vc'));
  const face = new THREE.Mesh(faceBox(`chessman-face/${kind}`, d.head, d.round, faceAt), kit.material({ s: 0 }));
  face.name = 'eyes';
  face.castShadow = true;
  parts.head.add(face);
  const eyes = { mesh: face, open: face.material as THREE.Material, closed: kit.closedEyes() };

  // little arms: a short sleeve and a round hand in the trim colour, held a little out from the body
  for (const [arm, s] of [[parts.armL, 1], [parts.armR, -1]] as const) {
    arm.add(
      new Bits()
        .cyl(0.055, 0.05, 0.17, [0, -0.085, 0], L.body, 12)
        .ball(0.066, [0, -0.2, 0], L.trim)
        .mesh(key('arm'), kit, `${arm.name}_vc`),
    );
    arm.rotation.z = s * 0.34;
  }

  root.updateMatrixWorld(true);
  const height = Math.round(new THREE.Box3().setFromObject(root).max.y * 100) / 100;
  return { type: 'biped', root, parts, height, eyes };
}

// ─── how they move ──────────────────────────────────────────────────────────

/** A hop from cell to cell: its height (blocks) and how long it takes (s). */
export const HOP = { height: 0.32, time: 0.34 } as const;

/** Lift over a hop, u 0 → 1. */
export const hopLift = (u: number, height: number = HOP.height): number => (u <= 0 || u >= 1 ? 0 : 4 * height * u * (1 - u));

/** Y scale over a hop: a squash at take-off and landing, a little stretch in the air. */
export function hopSquash(u: number): number {
  if (u <= 0 || u >= 1) return 1;
  if (u < 0.1) return 0.86 + 1.4 * u;
  if (u > 0.9) return 0.86 + 1.4 * (1 - u);
  return 1 + 0.07 * Math.sin(Math.PI * u);
}

/** Raises the right arm and waves it (call after the model's update, every frame while waving). */
export function waveArm(root: THREE.Object3D, t: number, k = 1): void {
  if (k <= 0) return;
  const arm = root.getObjectByName('armR');
  if (!arm) return;
  arm.rotation.x += (-0.15 - arm.rotation.x) * k;
  arm.rotation.z += (-2.55 + Math.sin(t * 11) * 0.38 - arm.rotation.z) * k;
}
