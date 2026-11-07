/**
 * The chess kingdom's models (DESIGN.md «Chess kingdom»): the big board, the White King's tower with
 * its stairs, balcony and little gate, lamps, banners and flags round the square — and the board
 * shared with «Великі шахи» (assets/bigchess.ts). Toy plastic in the skin's colours: cream with
 * mustard trims, teal roofs, a gold crown on top. No real lights: glow = emissive plus additive
 * halos, pools and cell glows.
 *
 * Local frame (like the castles): origin = the square's centre cell middle on top of the floor;
 * cell (lx, ly, lz) spans x lx−0.5..lx+0.5, y ly..ly+1, z lz−0.5..lz+0.5; front (the gate) = +Z.
 * The board covers lx −8‥7, lz −5‥10 (content/chess.ts cellLocal); the tower's terrace lx −8‥8,
 * lz −13‥−7 (its top, ly 8, is the balcony: heroes stand at y 9) with the keep on its back; the
 * stairs climb its right side (lx 9‥10, from lz −4 back to −12) behind a little gate at lz −3.
 * The cells and the look come from the same lists, so what a hero bumps into is what the child sees.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Skin } from '../contracts';
import { BOARD, CELL, cellLocal, darkCell, localCell, type Cell } from '../content/chess';
import { CREAM, MUSTARD, TEAL, CORAL, WOOD, WOOD_DARK, WARM, TAU, C_WARM, setGlow, glowMaterial, fadeDisc } from './buildingParts';
import { buildItem } from './items';
import { Build, place, tint, mergeCached, fx, finishShadows, HP, TEAL_D } from './villages';
import type { V3 } from './parts/kit';

// ─── the board (shared with «Великі шахи») ──────────────────────────────────

export type GlowKind = 'move' | 'take' | 'hint';

export interface BoardModel {
  /** Cells along a side. */
  n: number;
  /** Lights cells, each breathing in its kind's colour (move gold, take coral, hint brighter gold, faster); [] clears. */
  glow(cells: readonly { cell: Cell; kind: GlowKind }[]): void;
  /** Gold stars turning over cells (the rook's and bishop's), and a crown (kingdom) or coin (small board) over the goal; [] / null clear. */
  marks(stars: readonly Cell[], goal: Cell | null): void;
  /** Position of a cell's middle in the owning model root's local frame, y = the board's top. */
  cellPos(cell: Cell, out?: THREE.Vector3): THREE.Vector3;
  /** The cell under a root-local point, or null off the board. */
  cellAt(x: number, z: number): Cell | null;
  /** Breathing of glows, turning of marks. The owning model's own update already calls it. */
  update(dt: number): void;
}

export interface BoardSpec {
  n: number;
  /** Blocks along a cell's side. */
  size: number;
  /** A cell's middle, root-local x, z. */
  at(cell: Cell): [number, number];
  /** The cell under a root-local point. */
  under(x: number, z: number): Cell | null;
  goal: 'crown' | 'coin';
  /** A thin rim round the board: its colour and width. */
  rim?: { colour: string; width: number };
}

/** Plates' thickness: they lie on the floor, their top is the board's top. */
export const PLATE_H = 0.05;
const MAX_STARS = 8;
const LIGHT = new THREE.Color(CREAM);
const DARK = new THREE.Color(TEAL);
const KIND: Record<GlowKind, { c: THREE.Color; speed: number; lo: number; hi: number; tint: number }> = {
  move: { c: new THREE.Color('#ffd23a'), speed: 3.2, lo: 0.4, hi: 0.85, tint: 0.42 },
  take: { c: new THREE.Color('#e8463a'), speed: 3.2, lo: 0.45, hi: 0.9, tint: 0.55 },
  hint: { c: new THREE.Color('#ffe680'), speed: 7.5, lo: 0.75, hi: 1.5, tint: 0.62 },
};

let glowTex: THREE.Texture | null = null;
/** A soft rounded square with a bright rim (white: the instance colour tints it). */
function cellGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const fill = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.66);
  fill.addColorStop(0, 'rgba(255,255,255,0.5)');
  fill.addColorStop(1, 'rgba(255,255,255,0.18)');
  g.fillStyle = fill;
  rr(5, 5, s - 10, s - 10, 9);
  g.fill();
  g.shadowColor = 'rgba(255,255,255,1)';
  g.shadowBlur = 6;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 5;
  rr(8, 8, s - 16, s - 16, 8);
  g.stroke();
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** A five-point star, standing up (in the XY plane), r across its points. */
function starGeo(r: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = HP + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.46 : r;
    if (i) s.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    else s.moveTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: r * 0.22, bevelEnabled: true, bevelThickness: r * 0.08, bevelSize: r * 0.07, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -r * 0.11);
  g.computeBoundingSphere();
  return g;
}

type AddPart = (g: THREE.BufferGeometry, at: V3, hex: string, o?: { rot?: V3; s?: V3 }) => void;

/**
 * A gold crown (band, points with balls, a ball over the middle) standing on `at`, r = band radius.
 * `jewels` false leaves the jewels out (the tower's crown lights its own).
 */
function crownParts(add: AddPart, at: V3, r: number, o: { points?: number; gold?: string; jewel?: string; jewels?: boolean } = {}): void {
  const gold = o.gold ?? GOLD;
  const jewel = o.jewel ?? CORAL;
  const n = o.points ?? 5;
  const h = r * 0.42;
  const [ax, ay, az] = at;
  const A = (x: number, y: number, z: number): V3 => [ax + x, ay + y, az + z];
  add(new THREE.CylinderGeometry(r, r * 0.94, h, 24), A(0, h / 2, 0), gold);
  add(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.22, 24), A(0, h * 0.11, 0), gold);
  add(new THREE.SphereGeometry(r * 0.88, 18, 10), A(0, h * 0.7, 0), jewel, { s: [1, 0.6, 1] });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.sin(a) * r * 0.94;
    const z = Math.cos(a) * r * 0.94;
    add(new THREE.BoxGeometry(r * 0.36, r * 0.62, r * 0.16), A(x, h + r * 0.24, z), gold, { rot: [0, a, 0] });
    add(new THREE.BoxGeometry(r * 0.32, r * 0.32, r * 0.16), A(x, h + r * 0.5, z), gold, { rot: [0, a, Math.PI / 4] });
    add(new THREE.SphereGeometry(r * 0.12, 10, 8), A(x, h + r * 0.8, z), gold);
    if (o.jewels !== false) add(new THREE.BoxGeometry(r * 0.18, r * 0.18, r * 0.1), A(Math.sin(a) * r, h * 0.5, Math.cos(a) * r), i % 2 ? TEAL : jewel, { rot: [0, a, Math.PI / 4] });
  }
  add(new THREE.CylinderGeometry(r * 0.12, r * 0.16, r * 0.5, 10), A(0, h + r * 0.35, 0), gold);
  add(new THREE.SphereGeometry(r * 0.24, 14, 10), A(0, h + r * 0.78, 0), gold);
}

/** A gold crown as one vertex-coloured geometry, standing on y = 0 (cached by key). */
export function crownGeo(key: string, r: number, o: { points?: number; gold?: string; jewel?: string; jewels?: boolean } = {}): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  crownParts((g, at, hex, oo) => geos.push(tint(place(g, at, oo), hex)), [0, 0, 0], r, o);
  return mergeCached(`crown/${key}/${r}`, geos);
}

/** The board: 0.05 thick toy plates (one instanced draw), breathing cell glows (one), stars (one), the goal's crown or coin. */
export function createBoard(skin: Skin, spec: BoardSpec): { root: THREE.Group; board: BoardModel } {
  const root = new THREE.Group();
  root.name = 'board';
  const N = spec.n * spec.n;
  const gap = spec.size >= 2 ? 0.07 : 0.045;
  const idx = (c: Cell) => c.r * spec.n + c.c;
  const cellOf = (i: number): Cell => ({ c: i % spec.n, r: Math.floor(i / spec.n) });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qs = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s3 = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  // the plates: cream and teal (dark when c + r is even), a soft bevel
  const plates = new THREE.InstancedMesh(
    new RoundedBoxGeometry(spec.size - gap, PLATE_H, spec.size - gap, 2, Math.min(0.03, PLATE_H / 2 - 0.001)),
    skin.partMaterial('#ffffff'),
    N,
  );
  plates.name = 'plates';
  plates.receiveShadow = true;
  const base: THREE.Color[] = [];
  for (let i = 0; i < N; i++) {
    const c = cellOf(i);
    const [x, z] = spec.at(c);
    plates.setMatrixAt(i, m4.compose(p.set(x, PLATE_H / 2, z), q, s3));
    base.push((darkCell(c) ? DARK : LIGHT).clone());
    plates.setColorAt(i, base[i]);
  }
  plates.computeBoundingSphere();
  root.add(plates);

  if (spec.rim) {
    // a thin rim just outside the plates
    const [x0, z0] = spec.at({ c: 0, r: 0 });
    const [x1, z1] = spec.at({ c: spec.n - 1, r: spec.n - 1 });
    const h = spec.size / 2;
    const minX = Math.min(x0, x1) - h;
    const maxX = Math.max(x0, x1) + h;
    const minZ = Math.min(z0, z1) - h;
    const maxZ = Math.max(z0, z1) + h;
    const w = spec.rim.width;
    const y = PLATE_H * 0.7;
    const geos = [
      place(new THREE.BoxGeometry(maxX - minX + 2 * w, y * 2, w), [(minX + maxX) / 2, y, minZ - w / 2]),
      place(new THREE.BoxGeometry(maxX - minX + 2 * w, y * 2, w), [(minX + maxX) / 2, y, maxZ + w / 2]),
      place(new THREE.BoxGeometry(w, y * 2, maxZ - minZ), [minX - w / 2, y, (minZ + maxZ) / 2]),
      place(new THREE.BoxGeometry(w, y * 2, maxZ - minZ), [maxX + w / 2, y, (minZ + maxZ) / 2]),
    ];
    const rim = new THREE.Mesh(mergeGeometries(geos)!, skin.partMaterial(spec.rim.colour));
    geos.forEach((g) => g.dispose());
    rim.name = 'rim';
    rim.receiveShadow = true;
    root.add(rim);
  }

  // the glows: additive breathing squares just above the plates, only the lit ones drawn
  const glowMat = new THREE.MeshBasicMaterial({
    map: cellGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  glowMat.userData.own = true;
  const glows = fx(new THREE.InstancedMesh(new THREE.PlaneGeometry(spec.size - gap * 0.5, spec.size - gap * 0.5).rotateX(-HP), glowMat, N));
  glows.name = 'cell-glows';
  glows.frustumCulled = false;
  glows.renderOrder = 2;
  for (let i = 0; i < N; i++) glows.setColorAt(i, col.setRGB(0, 0, 0));
  glows.count = 0;
  root.add(glows);
  let lit: { i: number; kind: GlowKind; ph: number }[] = [];

  // the marks: gold stars turning over cells, the goal's crown or coin
  const star = fx(new THREE.InstancedMesh(starGeo(spec.size * 0.24), skin.partMaterial(WARM, { emissive: true }), MAX_STARS));
  star.name = 'stars';
  star.castShadow = false;
  star.frustumCulled = false;
  star.count = 0;
  root.add(star);
  let stars: Cell[] = [];
  const goalMark = new THREE.Group();
  goalMark.name = 'goal';
  if (spec.goal === 'crown') {
    const crown = new THREE.Mesh(crownGeo('board-goal', spec.size * 0.2, { points: 5 }), skin.partMaterial('#ffffff', { vertexColors: true }));
    crown.castShadow = true;
    goalMark.add(crown);
  } else {
    const coin = buildItem('coin', skin);
    coin.scale.setScalar(spec.size * 1.25);
    coin.position.y = -0.22 * spec.size * 1.25;
    goalMark.add(coin);
  }
  goalMark.visible = false;
  root.add(goalMark);
  let goal: Cell | null = null;
  const hover = spec.size * 0.55;

  let t = 0;
  const board: BoardModel = {
    n: spec.n,
    glow(cells) {
      for (const g of lit) plates.setColorAt(g.i, base[g.i]);
      lit = cells.filter((g) => g.cell.c >= 0 && g.cell.r >= 0 && g.cell.c < spec.n && g.cell.r < spec.n).map((g, k) => ({ i: idx(g.cell), kind: g.kind, ph: k * 0.7 }));
      glows.count = lit.length;
      if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
      board.update(0);
    },
    marks(list, g) {
      stars = list.slice(0, MAX_STARS).map((c) => ({ c: c.c, r: c.r }));
      star.count = stars.length;
      goal = g ? { c: g.c, r: g.r } : null;
      goalMark.visible = !!goal;
      board.update(0);
    },
    cellPos(cell, out = new THREE.Vector3()) {
      const [x, z] = spec.at(cell);
      return out.set(x, PLATE_H, z);
    },
    cellAt: (x, z) => spec.under(x, z),
    update(dt) {
      t += dt;
      lit.forEach((g, k) => {
        const K = KIND[g.kind];
        const b = 0.5 + 0.5 * Math.sin(t * K.speed + g.ph);
        const [x, z] = spec.at(cellOf(g.i));
        const grow = g.kind === 'hint' ? 1 + 0.05 * b : 1;
        glows.setMatrixAt(k, m4.compose(p.set(x, PLATE_H + 0.012, z), q, s3.set(grow, 1, grow)));
        glows.setColorAt(k, col.copy(K.c).multiplyScalar(K.lo + (K.hi - K.lo) * b));
        plates.setColorAt(g.i, col.copy(base[g.i]).lerp(K.c, K.tint * (0.7 + 0.3 * b)));
      });
      s3.set(1, 1, 1);
      if (lit.length) {
        glows.instanceMatrix.needsUpdate = true;
        if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
        if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
      }
      stars.forEach((c, k) => {
        const [x, z] = spec.at(c);
        qs.setFromAxisAngle(UP, t * 1.6 + k * 0.9);
        star.setMatrixAt(k, m4.compose(p.set(x, PLATE_H + hover + 0.08 * spec.size * Math.sin(t * 2.2 + k), z), qs, s3));
      });
      if (stars.length) star.instanceMatrix.needsUpdate = true;
      if (goal) {
        const [x, z] = spec.at(goal);
        goalMark.position.set(x, PLATE_H + hover * 0.8 + 0.06 * spec.size * Math.sin(t * 2), z);
        goalMark.rotation.y = t * 1.2;
      }
    },
  };
  return { root, board };
}

const UP = new THREE.Vector3(0, 1, 0);

// ─── the kingdom ────────────────────────────────────────────────────────────

export interface ChessTick {
  night: number;
  /** 0 asleep … 1 all three tasks done */
  alive: number;
  /** stairs' gate 0 shut … 1 open */
  open: number;
  beat: number;
}

export interface ChessKingdomModel {
  /** Origin = the square's centre cell middle at feet level (floor top + 1); local +Z = the gate side. */
  root: THREE.Group;
  /** 8×8, cells of 2×2 blocks at content/chess.ts cellLocal; updated by the kingdom's own update. */
  board: BoardModel;
  update(dt: number, k: ChessTick): void;
  /** Solid cells [lx, ly, lz], ly 0 = the first cell above the floor: terrace, keep, stairs' steps, rails, lamps, posts. */
  solid: [number, number, number][];
  /** Solid only while the stairs are shut (the little gate at their foot). */
  gate: [number, number, number][];
  /** On the balcony, in front of the keep's door: y = the balcony floor's top. */
  chest: { x: number; y: number; z: number; yaw: number };
  /** A free spot on the balcony. */
  top: THREE.Vector3;
  /** Where the White King stands: in front of row 0, beside the path, facing the gate. */
  king: { x: number; z: number; yaw: number };
  /** By the path near the gate, free of the board. */
  portal: { x: number; z: number; yaw: number };
  /** Free spots off the board where the folk wander. */
  strolls: [number, number][];
  dispose(): void;
}

/** The balcony floor's cell row (heroes stand on y = BALCONY + 1). */
export const CHESS_BALCONY = 8;
const BALCONY = CHESS_BALCONY;

const CREAM_D = '#efcf8c';
const CREAM_L = '#fff0c8';
const GOLD = '#ffd23a';
const MUSTARD_D = '#c99420';

type C3 = [number, number, number];
const k3 = (x: number, y: number, z: number) => `${x},${y},${z}`;
const k2 = (x: number, z: number) => `${x},${z}`;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Grid {
  private m = new Map<string, C3>();
  add(x: number, y: number, z: number): void {
    this.m.set(k3(x, y, z), [x, y, z]);
  }
  col(x: number, z: number, y0: number, y1: number): void {
    for (let y = y0; y <= y1; y++) this.add(x, y, z);
  }
  has(x: number, y: number, z: number): boolean {
    return this.m.has(k3(x, y, z));
  }
  list(): C3[] {
    return [...this.m.values()];
  }
}

/** A railing cell: (x, z), the direction (dx, dz) towards the walkway it guards, y = that walkway's floor top. */
interface Rail {
  x: number;
  z: number;
  dx: number;
  dz: number;
  y: number;
}

/** Cream parapet panels with mustard caps and a merlon every other cell, on the walkway side of each rail cell. */
function parapets(b: Build, rails: Rail[]): void {
  for (const r of rails) {
    const px = r.x + r.dx * 0.28;
    const pz = r.z + r.dz * 0.28;
    const alongX = r.dx === 0;
    const sz = (len: number, t: number, th: number): V3 => (alongX ? [len, t, th] : [th, t, len]);
    b.box(sz(1.0, 0.95, 0.42), [px, r.y + 0.475, pz], CREAM);
    b.box(sz(1.04, 0.09, 0.48), [px, r.y + 0.95, pz], MUSTARD);
    if ((r.x + r.z) % 2 === 0) {
      b.box(sz(0.6, 0.42, 0.44), [px, r.y + 1.2, pz], CREAM);
      b.box(sz(0.64, 0.06, 0.48), [px, r.y + 1.42, pz], MUSTARD);
    }
  }
}

/** Floor tiles over cells (checkered teal / cream: the kingdom's own floor), runs along x merged. */
function checkerTiles(b: Build, cells: [number, number][], y0: number, y1: number): void {
  const paint = (x: number, z: number) => ((x + z) % 2 === 0 ? TEAL : CREAM_L);
  const rows = new Map<number, [number, string][]>();
  for (const [x, z] of cells) {
    let r = rows.get(z);
    if (!r) rows.set(z, (r = []));
    r.push([x, paint(x, z)]);
  }
  for (const [z, list] of rows) {
    list.sort((a, c) => a[0] - c[0]);
    for (const [x, hex] of list) b.box([1, y1 - y0, 1], [x, (y0 + y1) / 2, z], hex);
  }
}

/** Pennants on poles: one instanced draw; limp and low while asleep, up and waving when alive. */
class Pennants {
  readonly mesh: THREE.InstancedMesh;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private yAxis = new THREE.Vector3(0, 1, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(
    b: Build,
    private poles: { x: number; z: number; y0: number; y1: number; yaw: number }[],
  ) {
    for (const p of poles) {
      b.box([0.1, p.y1 - p.y0, 0.1], [p.x, (p.y0 + p.y1) / 2, p.z], CREAM_D);
      b.ball(0.13, [p.x, p.y1 + 0.08, p.z], GOLD, { seg: 8 });
    }
    const parts = [
      tint(place(new THREE.BoxGeometry(0.46, 0.66, 0.05), [0.26, -0.35, 0]), TEAL),
      tint(place(new THREE.BoxGeometry(0.38, 0.48, 0.05), [0.66, -0.35, 0]), TEAL),
      tint(place(new THREE.BoxGeometry(0.3, 0.28, 0.05), [0.99, -0.35, 0]), TEAL),
      tint(place(new THREE.BoxGeometry(0.46, 0.09, 0.07), [0.26, -0.06, 0]), MUSTARD),
      tint(place(new THREE.BoxGeometry(0.17, 0.17, 0.07), [0.42, -0.36, 0], { rot: [0, 0, Math.PI / 4] }), CREAM),
    ];
    this.mesh = new THREE.InstancedMesh(mergeCached('chess/pennant', parts), b.kit.vertexColourMaterial(false), poles.length);
    this.mesh.name = 'pennants';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    b.root.add(this.mesh);
    this.update(0, 0, 0);
  }

  update(dt: number, alive: number, beat: number): void {
    this.t += dt * (1 + 0.6 * beat);
    this.poles.forEach((p, i) => {
      this.p.set(p.x, p.y0 + 0.75 + (p.y1 - 0.06 - p.y0 - 0.75) * alive, p.z);
      const wave = (Math.sin(this.t * 3.1 + i * 1.7) * 0.35 + Math.sin(this.t * 7 + i) * 0.06) * alive;
      this.q.setFromAxisAngle(this.yAxis, p.yaw + wave);
      this.q2.setFromAxisAngle(this.zAxis, -(1 - alive) * 1.3);
      this.q.multiply(this.q2);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Hanging banners (teal, a cream knight's crown on them): rolled up while asleep, unrolled when alive. */
class Banners {
  readonly mesh: THREE.InstancedMesh;
  private t = Math.random() * 4;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(
    b: Build,
    private at: { x: number; y: number; z: number; yaw: number }[],
  ) {
    const g = (geo: THREE.BufferGeometry, pos: V3, hex: string, rot?: V3) => tint(place(geo, pos, { rot }), hex);
    const parts = [
      g(new THREE.BoxGeometry(1.1, 0.09, 0.09), [0, 0, 0.03], GOLD),
      g(new THREE.BoxGeometry(0.9, 1.6, 0.05), [0, -0.85, 0], TEAL),
      g(new THREE.BoxGeometry(0.46, 0.46, 0.05), [-0.22, -1.65, 0], TEAL, [0, 0, Math.PI / 4]),
      g(new THREE.BoxGeometry(0.46, 0.46, 0.05), [0.22, -1.65, 0], TEAL, [0, 0, Math.PI / 4]),
      g(new THREE.BoxGeometry(0.92, 0.07, 0.06), [0, -0.12, 0.01], MUSTARD),
      // the crown on it: a band and three points
      g(new THREE.BoxGeometry(0.5, 0.16, 0.06), [0, -0.98, 0.03], CREAM),
      g(new THREE.BoxGeometry(0.15, 0.15, 0.06), [-0.19, -0.82, 0.03], CREAM, [0, 0, Math.PI / 4]),
      g(new THREE.BoxGeometry(0.15, 0.15, 0.06), [0, -0.78, 0.03], CREAM, [0, 0, Math.PI / 4]),
      g(new THREE.BoxGeometry(0.15, 0.15, 0.06), [0.19, -0.82, 0.03], CREAM, [0, 0, Math.PI / 4]),
      g(new THREE.BoxGeometry(0.08, 0.08, 0.07), [0, -0.98, 0.05], CORAL, [0, 0, Math.PI / 4]),
    ];
    this.mesh = new THREE.InstancedMesh(mergeCached('chess/banner', parts), b.kit.vertexColourMaterial(false), at.length);
    this.mesh.name = 'banners';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    b.root.add(this.mesh);
    this.update(0, 0, 0);
  }

  update(dt: number, alive: number, beat: number): void {
    this.t += dt * (1 + 0.5 * beat);
    this.at.forEach((a, i) => {
      this.p.set(a.x, a.y, a.z);
      this.e.set(Math.sin(this.t * 1.7 + i * 1.3) * 0.06 * alive, a.yaw, Math.sin(this.t * 1.1 + i) * 0.03 * alive);
      this.q.setFromEuler(this.e);
      this.s.set(1, 0.12 + 0.88 * alive, 1);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Lamps round the square. */
const LAMPS: [number, number][] = [[-11, 11], [11, 11], [-11, 3], [11, 3], [-11, -5], [-11, -11]];
/** The entry's two banner poles (the banners hang inwards over the path's sides). */
const ENTRY: [number, number][] = [[-4, 12], [4, 12]];

export function createChessKingdom(skin: Skin): ChessKingdomModel {
  const b = new Build(skin, 'chess-kingdom');
  const solid = new Grid();
  const gate = new Grid();

  // ── cells ──
  const inTerrace = (x: number, z: number) => x >= -8 && x <= 8 && z >= -13 && z <= -7;
  const inKeep = (x: number, z: number) => x >= -5 && x <= 5 && z >= -13 && z <= -11;
  for (let x = -8; x <= 8; x++) for (let z = -13; z <= -7; z++) solid.col(x, z, 0, BALCONY);
  for (let x = -5; x <= 5; x++) for (let z = -13; z <= -11; z++) solid.col(x, z, BALCONY + 1, BALCONY + 4);
  // the stairs: two wide, one block a step, from lz −4 (k 0) back to −12 (k 8) along the terrace's right side
  const treads: { x: number; z: number; k: number }[] = [];
  for (let k = 0; k <= BALCONY; k++)
    for (const x of [9, 10]) {
      treads.push({ x, z: -4 - k, k });
      solid.col(x, -4 - k, 0, k);
    }
  const isTread = new Set(treads.map((t) => k2(t.x, t.z)));
  const GATE_Z = -3;
  // rails beside the treads: walls from the ground, two above each tread (not on the terrace, not at the gate)
  const stairRails: Rail[] = [];
  for (const t of treads) {
    for (const [dx, dz] of DIRS) {
      const x = t.x + dx;
      const z = t.z + dz;
      if (isTread.has(k2(x, z)) || inTerrace(x, z) || (z === GATE_Z && (x === 9 || x === 10))) continue;
      solid.col(x, z, 0, t.k + 2);
      stairRails.push({ x, z, dx: -dx, dz: -dz, y: t.k + 1 });
    }
  }
  // the little gate at the foot, between two posts
  for (const x of [9, 10]) gate.col(x, GATE_Z, 0, 3);
  for (const x of [8, 11]) solid.col(x, GATE_Z, 0, 2);
  // the balcony: the terrace's top round the keep; rails round its open edges (not towards the stairs)
  const floor: [number, number][] = [];
  for (let x = -8; x <= 8; x++) for (let z = -13; z <= -7; z++) if (!inKeep(x, z)) floor.push([x, z]);
  const floorSet = new Set(floor.map(([x, z]) => k2(x, z)));
  const balconyRails: Rail[] = [];
  for (const [x, z] of floor) {
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (floorSet.has(k2(nx, nz)) || isTread.has(k2(nx, nz))) continue;
      if (solid.has(nx, BALCONY + 1, nz) && solid.has(nx, BALCONY + 2, nz)) continue;
      balconyRails.push({ x, z, dx: -dx, dz: -dz, y: BALCONY + 1 });
    }
  }
  for (const r of balconyRails) solid.col(r.x, r.z, BALCONY + 1, BALCONY + 2);
  // lamps and the entry's banner poles
  for (const [x, z] of LAMPS) solid.col(x, z, 0, 2);
  for (const [x, z] of ENTRY) solid.col(x, z, 0, 2);

  // ── look ──
  // the terrace: a cream fortress base, a plinth, courses, a mustard cornice, a band of chess squares
  b.box([17, 9, 7], [0, 4.5, -10], CREAM);
  b.box([17.14, 0.5, 7.14], [0, 0.25, -10], CREAM_D);
  b.box([17.18, 0.1, 7.18], [0, 0.55, -10], MUSTARD);
  for (let y = 2; y < 7.5; y += 1.5) {
    b.box([17.02, 0.07, 0.05], [0, y, -6.49], CREAM_D);
    b.box([0.05, 0.07, 7.02], [-8.49, y, -10], CREAM_D);
  }
  for (let i = 0; i < 34; i++) {
    const x = -8.25 + i * 0.5;
    b.box([0.5, 0.5, 0.06], [x, 8.15, -6.47], i % 2 ? TEAL : CREAM_L);
    b.box([0.5, 0.5, 0.06], [x, 7.65, -6.47], i % 2 ? CREAM_L : TEAL);
  }
  for (let i = 0; i < 14; i++) {
    const z = -6.75 - i * 0.5;
    b.box([0.06, 0.5, 0.5], [-8.47, 8.15, z], i % 2 ? TEAL : CREAM_L);
    b.box([0.06, 0.5, 0.5], [-8.47, 7.65, z], i % 2 ? CREAM_L : TEAL);
  }
  b.box([17.3, 0.36, 7.3], [0, 8.8, -10], MUSTARD);
  checkerTiles(b, floor, BALCONY + 0.98, BALCONY + 1.03);
  // the front: a big round crown emblem, an arched door, windows
  b.disc(1.3, 0.12, [0, 5.4, -6.5], [0, 0, 1], MUSTARD);
  b.disc(1.08, 0.06, [0, 5.4, -6.4], [0, 0, 1], TEAL);
  b.box([1.2, 0.36, 0.08], [0, 5.05, -6.32], CREAM);
  for (const [x, y] of [[-0.42, 5.42], [0, 5.55], [0.42, 5.42]] as const) {
    b.box([0.32, 0.32, 0.08], [x, y, -6.32], CREAM, [0, 0, Math.PI / 4]);
    b.ball(0.09, [x, y + 0.28, -6.3], CREAM, { seg: 8 });
  }
  b.box([0.14, 0.14, 0.06], [0, 5.05, -6.26], CORAL, [0, 0, Math.PI / 4]);
  b.box([2.3, 2.7, 0.14], [0, 1.35, -6.45], MUSTARD);
  b.cyl(1.15, 0.12, [0, 2.7, -6.46], MUSTARD, { q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), HP), seg: 18 });
  b.box([1.8, 2.5, 0.1], [0, 1.25, -6.36], WOOD);
  b.cyl(0.9, 0.1, [0, 2.5, -6.36], WOOD, { q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), HP), seg: 18 });
  for (const x of [-0.45, 0, 0.45]) b.box([0.05, 2.9, 0.03], [x, 1.45, -6.3], WOOD_DARK);
  for (const sx of [-1, 1]) b.ball(0.08, [sx * 0.22, 1.3, -6.28], GOLD, { seg: 8 });
  const winFront: [number, number][] = [[-4.2, 3.2], [4.2, 3.2], [-6.9, 3.2], [6.9, 3.2], [-5.6, 6.0], [5.6, 6.0]];
  for (const [x, y] of winFront) {
    b.box([0.95, 1.35, 0.1], [x, y, -6.47], MUSTARD);
    b.ball(0.47, [x, y + 0.62, -6.47], MUSTARD, { s: [1, 0.6, 0.2], seg: 12 });
    b.glowBox('win', '#ffd98a', [0.62, 1.05, 0.08], [x, y - 0.03, -6.42]);
    b.box([0.07, 1.05, 0.04], [x, y - 0.03, -6.37], MUSTARD_D);
    b.box([1.05, 0.12, 0.2], [x, y - 0.72, -6.42], CREAM_D);
  }
  for (const z of [-8.6, -11.4]) {
    b.box([0.1, 1.35, 0.95], [-8.47, 4.5, z], MUSTARD);
    b.glowBox('win', '#ffd98a', [0.08, 1.05, 0.62], [-8.42, 4.47, z]);
  }
  parapets(b, balconyRails);

  // the keep on the terrace's back: cream, a plinth and a cornice, a door behind the chest, windows
  b.box([11, 4, 3], [0, 11, -12], CREAM);
  b.box([11.14, 0.3, 3.14], [0, 9.15, -12], CREAM_D);
  b.box([11.3, 0.36, 3.3], [0, 12.85, -12], MUSTARD);
  b.box([1.7, 2.3, 0.12], [0, 10.15, -10.47], MUSTARD);
  b.box([1.3, 2.0, 0.1], [0, 10.0, -10.4], WOOD);
  b.cyl(0.65, 0.1, [0, 11.0, -10.4], WOOD, { q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), HP), seg: 14 });
  for (const x of [-0.32, 0.32]) b.box([0.05, 2.4, 0.03], [x, 10.2, -10.34], WOOD_DARK);
  for (const x of [-2.6, 2.6]) {
    b.box([0.9, 1.25, 0.1], [x, 11.1, -10.47], MUSTARD);
    b.glowBox('win', '#ffd98a', [0.6, 0.95, 0.08], [x, 11.08, -10.42]);
  }
  for (const x of [-2.9, 2.9]) {
    b.box([0.6, 0.5, 0.4], [x, 13.28, -10.75], CREAM);
    b.box([0.64, 0.06, 0.44], [x, 13.56, -10.75], MUSTARD);
  }
  // the corner turrets with teal cones
  const tips: V3[] = [];
  for (const sx of [-1, 1]) {
    const cx = sx * 4.6;
    const cz = -11.6;
    b.cyl(0.95, 5.6, [cx, 9 + 2.8, cz], CREAM, { seg: 18 });
    for (const y of [11.2, 12.85]) b.cyl(1.0, 0.18, [cx, y, cz], MUSTARD, { seg: 18 });
    b.cyl(1.12, 0.3, [cx, 14.6, cz], MUSTARD, { seg: 18 });
    b.cyl(1.3, 2.5, [cx, 14.75 + 1.25, cz], TEAL, { r1: 0.06, seg: 18 });
    b.cyl(1.34, 0.16, [cx, 14.83, cz], TEAL_D, { seg: 18 });
    b.ball(0.16, [cx, 17.1, cz], GOLD, { seg: 10 });
    b.box([0.45, 0.8, 0.1], [cx, 13.7, cz + 0.93], MUSTARD);
    b.glowBox('win', '#ffd98a', [0.3, 0.6, 0.08], [cx, 13.68, cz + 0.98]);
    tips.push([cx, 17.2, cz]);
  }
  // the middle tower over the keep, its teal roof and the big crown
  b.box([4.4, 2.5, 2.4], [0, 14.25, -11.9], CREAM);
  b.box([4.56, 0.3, 2.56], [0, 13.15, -11.9], CREAM_D);
  b.box([4.7, 0.32, 2.7], [0, 15.5, -11.9], MUSTARD);
  for (const [w, d, y] of [[4.9, 2.9, 15.82], [4.0, 2.3, 16.18], [3.0, 1.7, 16.54]] as const) b.box([w, 0.36, d], [0, y, -11.9], TEAL);
  b.box([3.1, 0.06, 1.8], [0, 16.74, -11.9], TEAL_D);
  for (const x of [-1.2, 1.2]) {
    b.box([0.6, 0.95, 0.1], [x, 14.3, -10.67], MUSTARD);
    b.glowBox('win', '#ffd98a', [0.4, 0.72, 0.08], [x, 14.28, -10.62]);
  }
  const intoB: AddPart = (g, at, hex, o) => b.geo(g, at, hex, o);
  crownParts(intoB, [0, 16.76, -11.9], 1.25, { points: 6, jewels: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.glowBox(i % 2 ? 'jewelT' : 'jewel', i % 2 ? '#5fd6c9' : '#ff6a4a', [0.26, 0.26, 0.12], [Math.sin(a) * 1.27, 16.76 + 0.27, -11.9 + Math.cos(a) * 1.27], [0, a, Math.PI / 4]);
  }

  // the stairs: cream steps with mustard noses, parapets on the open sides
  for (const t of treads) {
    if (t.x !== 9) continue;
    b.box([2, t.k + 1, 1], [9.5, (t.k + 1) / 2, t.z], CREAM);
    b.box([2.02, 0.1, 1.02], [9.5, t.k + 0.96, t.z], t.k % 2 ? CREAM_L : '#f7da98');
    b.box([2.04, 0.08, 0.1], [9.5, t.k + 0.95, t.z + 0.47], MUSTARD);
  }
  for (const r of stairRails) b.box([1, r.y, 1], [r.x, r.y / 2, r.z], CREAM);
  parapets(b, stairRails);
  // the gate: two posts with gold balls, two little mustard leaves (they swing out towards the square)
  for (const x of [8, 11]) {
    b.box([0.7, 2.6, 0.7], [x, 1.3, GATE_Z], CREAM);
    b.box([0.8, 0.16, 0.8], [x, 2.66, GATE_Z], MUSTARD);
    b.ball(0.24, [x, 2.95, GATE_Z], GOLD, { seg: 10 });
  }
  const leafOf = (name: string, hinge: number, dir: number) => {
    const g = new THREE.Group();
    g.position.set(hinge, 0, GATE_Z + 0.1);
    b.root.add(g);
    const p = b.part(name, g);
    const w = 1.15;
    for (const y of [0.25, 1.0, 1.75]) p.box([w, 0.12, 0.12], [dir * w / 2, y, 0], MUSTARD);
    for (let i = 0; i < 4; i++) p.box([0.08, 1.7, 0.08], [dir * (0.12 + i * 0.3), 1.0, 0], i === 0 ? MUSTARD_D : GOLD);
    p.box([0.24, 0.24, 0.1], [dir * (w - 0.18), 1.95, 0], GOLD, [0, 0, Math.PI / 4]);
    return g;
  };
  const leaves = [leafOf('gateL', 8.36, 1), leafOf('gateR', 10.64, -1)];

  // lamps: a cream post with mustard rings, a warm glass ball in a gold cage, a little crown on top
  for (const [x, z] of LAMPS) {
    b.box([0.6, 0.22, 0.6], [x, 0.11, z], MUSTARD);
    b.cyl(0.11, 2.1, [x, 1.27, z], CREAM, { r1: 0.09, seg: 10 });
    for (const y of [0.55, 2.2]) b.cyl(0.16, 0.12, [x, y, z], MUSTARD, { seg: 10 });
    b.glowBall('lamp', '#ffe2a0', 0.26, [x, 2.62, z]);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.box([0.05, 0.5, 0.05], [x + dx * 0.25, 2.62, z + dz * 0.25], GOLD);
    b.cyl(0.3, 0.08, [x, 2.34, z], GOLD, { seg: 12 });
    crownParts(intoB, [x, 2.86, z], 0.24, { points: 5, jewels: false });
  }
  // the entry's banner poles: a pole, an arm over the path's side, the banner hanging from it
  for (const [x, z] of ENTRY) {
    const s = Math.sign(x);
    b.box([0.6, 0.22, 0.6], [x, 0.11, z], MUSTARD);
    b.box([0.22, 3.9, 0.22], [x, 2.05, z], CREAM);
    b.box([1.3, 0.14, 0.14], [x - s * 0.62, 3.85, z], MUSTARD);
    b.ball(0.22, [x, 4.15, z], GOLD, { seg: 10 });
  }

  // pennants on the turrets and the terrace's front corners; the banners
  const flags = new Pennants(b, [
    ...tips.map(([x, y, z], i) => ({ x, z, y0: y, y1: y + 1.6, yaw: i ? -2.2 : -0.9 })),
    { x: -8.1, z: -6.9, y0: 9.0, y1: 11.8, yaw: -0.6 },
    { x: 8.1, z: -6.9, y0: 9.0, y1: 11.8, yaw: -2.5 },
  ]);
  const banners = new Banners(b, [
    { x: -2.45, y: 8.42, z: -6.38, yaw: 0 },
    { x: 2.45, y: 8.42, z: -6.38, yaw: 0 },
    ...ENTRY.map(([x, z]) => ({ x: x - Math.sign(x) * 0.75, y: 3.78, z, yaw: 0 })),
  ]);

  const m = b.finish();

  // halos round the lamps, warm pools under them (each one merged draw)
  const haloMat = glowMaterial(0xffc866);
  const halos = fx(new THREE.Mesh(mergeCached('chess-kingdom/halos', LAMPS.map(([x, z]) => place(new THREE.SphereGeometry(0.75, 12, 8), [x, 2.62, z]))), haloMat));
  halos.name = 'halos';
  const poolMat = glowMaterial(0xffc866, true);
  poolMat.polygonOffset = true;
  poolMat.polygonOffsetFactor = -2;
  const pools = fx(new THREE.Mesh(mergeCached('chess-kingdom/pools', LAMPS.map(([x, z]) => place(fadeDisc(2.6), [x, 0.07, z]))), poolMat));
  pools.name = 'pools';
  b.root.add(halos, pools);

  // the board
  const { root: boardRoot, board } = createBoard(skin, {
    n: BOARD,
    size: CELL,
    at: (c) => cellLocal(c),
    under: (x, z) => localCell(x, z),
    goal: 'crown',
    rim: { colour: MUSTARD, width: 0.3 },
  });
  b.root.add(boardRoot);
  finishShadows(b.root);

  const DARK_GLASS = new THREE.Color('#4b4656');
  const WIN = new THREE.Color('#ffd98a');
  const JEWEL = new THREE.Color('#ff6a4a');
  const JEWEL_T = new THREE.Color('#5fd6c9');
  const LAMP_OFF = new THREE.Color('#bfae8a');
  const tmp = new THREE.Color();
  let t = 0;

  const root = b.root;
  return {
    root,
    board,
    solid: solid.list(),
    gate: gate.list(),
    chest: { x: 0, y: BALCONY + 1, z: -10, yaw: 0 },
    top: new THREE.Vector3(-3, BALCONY + 1, -9),
    king: { x: 2, z: 11.3, yaw: 0 },
    portal: { x: -7, z: 12, yaw: 0 },
    strolls: [
      [-10.5, 8], [-10.5, 5.5], [-10.5, 0.5], [-10.5, -2.5], [-10.5, -8],
      [10.5, 8], [10.5, 5.5], [10.5, 0.5], [12, -6],
      [6, 12], [-4, -6], [4, -6],
    ],
    update(dt, k) {
      t += dt;
      const alive = Math.max(0, Math.min(1, k.alive));
      const night = Math.max(0, Math.min(1, k.night));
      // windows: dark glass while asleep, warm once awake, brighter at night
      tmp.copy(DARK_GLASS).lerp(WIN, alive);
      setGlow(m.win, tmp, alive * (0.3 + 0.9 * night));
      // lamps: a little at night even asleep, bright once awake
      const lampK = (0.15 + 0.85 * alive) * (0.2 + 1.0 * night) * (1 + 0.12 * k.beat);
      tmp.copy(LAMP_OFF).lerp(C_WARM, Math.min(1, 0.3 + 0.7 * alive));
      setGlow(m.lamp, tmp, lampK);
      haloMat.opacity = (0.15 + 0.85 * alive) * (0.03 + 0.3 * night);
      halos.visible = haloMat.opacity > 0.01;
      poolMat.opacity = (0.15 + 0.85 * alive) * 0.7 * night;
      pools.visible = poolMat.opacity > 0.02;
      // the crown's jewels light up as the kingdom wakes
      const sparkle = 0.85 + 0.15 * Math.sin(t * 3);
      setGlow(m.jewel, JEWEL, (0.15 + 0.85 * alive) * sparkle);
      setGlow(m.jewelT, JEWEL_T, (0.15 + 0.85 * alive) * sparkle);
      flags.update(dt, alive, k.beat);
      banners.update(dt, alive, k.beat);
      const open = Math.max(0, Math.min(1, k.open));
      leaves[0].rotation.y = -open * HP * 0.95;
      leaves[1].rotation.y = open * HP * 0.95;
      board.update(dt);
    },
    dispose() {
      const mats = new Set<THREE.Material>();
      root.traverse((x) => {
        const mm = (x as THREE.Mesh).material;
        if (!mm) return;
        for (const one of Array.isArray(mm) ? mm : [mm]) if (one.userData.own) mats.add(one);
      });
      mats.forEach((mt) => mt.dispose());
    },
  };
}
