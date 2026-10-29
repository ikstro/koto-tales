/**
 * The castles (stage C2 «Замки»): one big landmark per race, toy plastic in the race's colours,
 * 18–24 blocks tall. Each has a gate, a climb of one-block steps (two wide, rails two cells tall)
 * up to a balcony whose floor is ly 8 (heroes stand at y 9) with the chest on it. Besieged
 * (alive 0) a castle is dark with its flags down; liberated (alive 1) its lights burn, its flags
 * fly and its race's details move.
 *
 * Local frame: origin = the site's centre cell middle, on top of the floor; cell (lx, ly, lz)
 * spans x lx−0.5..lx+0.5, y ly..ly+1, z lz−0.5..lz+0.5. Front (the gate) = +Z. The structure
 * keeps to lx −11..11, lz −14..4; lz ≥ 5 is the plaza. Built like the village pieces
 * (villages.ts): Kit boxes merged, round parts in one more mesh, glows on own materials
 * (`userData.own`), no real lights — glow = emissive plus additive halos and pools.
 *
 * The cells and the look come from the same lists (treads, rails, floors), so what a hero
 * bumps into is what the child sees.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { Race } from '../world/villages';
import type { V3 } from './parts/kit';
import {
  CORAL, CORAL_DARK, CREAM, MUSTARD, TEAL, CHARCOAL, STEEL, STEEL_DARK, WOOD, WOOD_DARK, WARM, TAU,
  C_WARM, C_CORAL, C_OFF, setGlow, glowMaterial,
} from './buildingParts';
import {
  Build, oct, place, tint, mergeCached, fx, finishShadows, domePt, pool, halo, gearGeo, HP,
  LEAF, LEAF2, LEAF_D, BARK, BARK_D, WOODL, WOODL_D, PINK, STONE, STONE_D, STONE_L, BRICK, BRICK_D, IRON, TEAL_D,
  ALIEN_CREAM, LILAC, LILAC_D, MINT_L, MINT_D, RACE_POOL, createVillageItem, type VillagePiece,
} from './villages';

// ─── API ────────────────────────────────────────────────────────────────────

export interface CastleTick {
  /** 0 day … 1 deep night. */
  night: number;
  /** 0 besieged (dark, flags down) … 1 liberated (lights, flags up and waving, race details moving). */
  alive: number;
  /** The gate: 0 shut … 1 open. */
  open: number;
  /** Power reaches the castle / is short. */
  on: boolean;
  low: boolean;
  /** Music beats, may be 0. */
  beat: number;
}

export interface CastleModel {
  root: THREE.Group;
  update(dt: number, k: CastleTick): void;
  /** Solid cells [lx, ly, lz]: ly 0 = the first cell above the floor. Walls, trunk, stairs' steps, balcony floor, railings. */
  solid: [number, number, number][];
  /** Cells solid only while the gate is shut. */
  gate: [number, number, number][];
  /** The chest on the balcony: local position (y = top of the balcony floor) and yaw. */
  chest: { x: number; y: number; z: number; yaw: number };
  /** A free spot on the balcony: reaching within ~2 of it counts as «at the top». */
  top: THREE.Vector3;
  /** Where power wires hang from (local). */
  socket: THREE.Vector3;
  dispose(): void;
}

export function createCastle(skin: Skin, race: Race): CastleModel {
  switch (race) {
    case 'elves':
      return elfCastle(skin);
    case 'gnomes':
      return gnomeCastle(skin);
    case 'robots':
      return robotCastle(skin);
    default:
      return alienCastle(skin);
  }
}

/** The thing the castle's task asks for: the elves' glowing «firefly seed»; the others use their village item. */
export function createCastleItem(skin: Skin, race: Race): VillagePiece {
  return race === 'elves' ? fireflySeed(skin) : createVillageItem(skin, race);
}

/** The balcony floor cell row (heroes stand on y = BALCONY + 1). */
export const BALCONY = 8;

// ─── cells ──────────────────────────────────────────────────────────────────

type Cell = [number, number, number];
const k3 = (x: number, y: number, z: number): string => `${x},${y},${z}`;
const k2 = (x: number, z: number): string => `${x},${z}`;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Grid {
  private m = new Map<string, Cell>();
  add(x: number, y: number, z: number): void {
    this.m.set(k3(x, y, z), [x, y, z]);
  }
  col(x: number, z: number, y0: number, y1: number): void {
    for (let y = y0; y <= y1; y++) this.add(x, y, z);
  }
  has(x: number, y: number, z: number): boolean {
    return this.m.has(k3(x, y, z));
  }
  list(): Cell[] {
    return [...this.m.values()];
  }
}

interface Tread {
  x: number;
  z: number;
  k: number;
}

/** A railing cell: (x, z), the direction (dx, dz) towards the walkway it guards, y = that walkway's floor top. */
interface Rail {
  x: number;
  z: number;
  dx: number;
  dz: number;
  y: number;
}

/**
 * Railings beside the treads: every neighbour of a tread that is not `skip` gets two solid cells
 * above the tread (or, `fromGround`, a whole column up to there — a stair wall).
 */
function treadRails(solid: Grid, treads: Tread[], skip: (x: number, z: number) => boolean, fromGround: boolean): Rail[] {
  const out: Rail[] = [];
  for (const t of treads) {
    for (const [dx, dz] of DIRS) {
      const x = t.x + dx;
      const z = t.z + dz;
      if (skip(x, z)) continue;
      solid.col(x, z, fromGround ? 0 : t.k + 1, t.k + 2);
      out.push({ x, z, dx: -dx, dz: -dz, y: t.k + 1 });
    }
  }
  return out;
}

/** Railings round the edge of a floor at row `ly`: edge cells whose outside neighbour is open become rails (ly+1, ly+2). */
function edgeRails(solid: Grid, floor: [number, number][], ly: number, open: (x: number, z: number) => boolean): Rail[] {
  const set = new Set(floor.map(([x, z]) => k2(x, z)));
  const out: Rail[] = [];
  for (const [x, z] of floor) {
    if (solid.has(x, ly + 1, z) && solid.has(x, ly + 2, z)) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (set.has(k2(nx, nz)) || open(nx, nz)) continue;
      if (solid.has(nx, ly + 1, nz) && solid.has(nx, ly + 2, nz)) continue;
      out.push({ x, z, dx: -dx, dz: -dz, y: ly + 1 });
    }
  }
  for (const r of out) solid.col(r.x, r.z, ly + 1, ly + 2);
  return out;
}

/** Cells whose middle lies within r of (cx, cz). */
function discCells(cx: number, cz: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) out.push([x, z]);
  return out;
}

// ─── look helpers ───────────────────────────────────────────────────────────

/** Floor tiles over cells, runs along x merged; paint by cell. */
function tiles(b: Build, cells: [number, number][], y0: number, y1: number, paint: (x: number, z: number) => string): void {
  const rows = new Map<number, [number, string][]>();
  for (const [x, z] of cells) {
    let r = rows.get(z);
    if (!r) rows.set(z, (r = []));
    r.push([x, paint(x, z)]);
  }
  for (const [z, list] of rows) {
    list.sort((a, c) => a[0] - c[0]);
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && list[j + 1][0] === list[j][0] + 1 && list[j + 1][1] === list[i][1]) j++;
      const x0 = list[i][0];
      const x1 = list[j][0];
      b.box([x1 - x0 + 1, y1 - y0, 1], [(x0 + x1) / 2, (y0 + y1) / 2, z], list[i][1]);
      i = j + 1;
    }
  }
}

interface RailLook {
  post: string;
  rail: string;
  cap?: string;
  /** Visual height of the railing over the walkway (the cells are two tall). */
  h?: number;
  /** Posts reach this far below the walkway (floating rails get a bracket). */
  drop?: number;
  /** Solid stone parapet instead of posts and rails; merlons every other cell. */
  parapet?: boolean;
}

/** One railing panel per rail record, on the side of its cell that faces the walkway. */
function railPanels(b: Build, rails: Rail[], L: RailLook, skip?: (r: Rail) => boolean): void {
  const h = L.h ?? 1.2;
  const drop = L.drop ?? 0;
  for (const r of rails) {
    if (skip?.(r)) continue;
    const px = r.x + r.dx * (L.parapet ? 0.28 : 0.38);
    const pz = r.z + r.dz * (L.parapet ? 0.28 : 0.38);
    const alongX = r.dx === 0;
    const sz = (len: number, t: number, th: number): V3 => (alongX ? [len, t, th] : [th, t, len]);
    if (L.parapet) {
      b.box(sz(1.0, 0.95, 0.42), [px, r.y + 0.475, pz], L.post);
      b.box(sz(1.04, 0.08, 0.48), [px, r.y + 0.95, pz], L.rail);
      if ((r.x + r.z) % 2 === 0) b.box(sz(0.62, 0.5, 0.44), [px, r.y + 1.24, pz], L.post);
      continue;
    }
    b.box([0.16, h + drop, 0.16], [px, r.y + (h - drop) / 2, pz], L.post);
    b.box(sz(1.04, 0.13, 0.13), [px, r.y + h - 0.065, pz], L.rail);
    b.box(sz(1.04, 0.08, 0.08), [px, r.y + h * 0.5, pz], L.rail);
    if (L.cap) b.box(sz(1.0, 0.07, 0.2), [px, r.y + h + 0.03, pz], L.cap);
  }
}

/** A see-through dark glass for windows of a besieged castle. */
const DARK_GLASS = new THREE.Color('#4b4656');
const tmpC = new THREE.Color();

/** Windows and lamps: dark while besieged, warm when liberated, brighter at night. */
function lightUp(mat: THREE.MeshStandardMaterial | undefined, c: THREE.Color, alive: number, night: number, extra = 0): void {
  if (!mat) return;
  tmpC.copy(DARK_GLASS).lerp(c, alive);
  setGlow(mat, tmpC, alive * (0.3 + 0.9 * night + extra));
}

interface FlagPole {
  x: number;
  z: number;
  /** Pole foot and top. */
  y0: number;
  y1: number;
  yaw: number;
}

const flagGeos = new Map<string, THREE.BufferGeometry>();
/** A pennant hanging from its pole edge at the origin, flying towards +x. */
function flagGeo(main: string, trim: string): THREE.BufferGeometry {
  const key = `${main}/${trim}`;
  let g = flagGeos.get(key);
  if (g) return g;
  const parts = [
    tint(place(new THREE.BoxGeometry(0.42, 0.62, 0.05), [0.24, -0.33, 0]), main),
    tint(place(new THREE.BoxGeometry(0.36, 0.46, 0.05), [0.62, -0.33, 0]), main),
    tint(place(new THREE.BoxGeometry(0.3, 0.28, 0.05), [0.95, -0.33, 0]), main),
    tint(place(new THREE.BoxGeometry(0.44, 0.09, 0.07), [0.24, -0.06, 0]), trim),
    tint(place(new THREE.BoxGeometry(0.16, 0.16, 0.07), [0.36, -0.36, 0], { rot: [0, 0, Math.PI / 4] }), trim),
  ];
  g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  flagGeos.set(key, g);
  return g;
}

/** Flags on poles: one instanced draw; down and limp while besieged, up and waving when liberated. */
class Flags {
  readonly mesh: THREE.InstancedMesh;
  private t = Math.random() * 5;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private yAxis = new THREE.Vector3(0, 1, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(
    b: Build,
    private poles: FlagPole[],
    main: string,
    trim: string,
    poleHex = '#d9d3c8',
  ) {
    for (const p of poles) {
      b.box([0.1, p.y1 - p.y0, 0.1], [p.x, (p.y0 + p.y1) / 2, p.z], poleHex);
      b.ball(0.13, [p.x, p.y1 + 0.08, p.z], MUSTARD, { seg: 8 });
    }
    this.mesh = new THREE.InstancedMesh(flagGeo(main, trim), b.kit.vertexColourMaterial(false), poles.length);
    this.mesh.name = 'flags';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    b.root.add(this.mesh);
    this.update(0, 0, 0);
  }

  update(dt: number, alive: number, beat: number): void {
    this.t += dt * (1 + 0.6 * beat);
    this.poles.forEach((p, i) => {
      const up = alive;
      this.p.set(p.x, p.y0 + 0.75 + (p.y1 - 0.06 - p.y0 - 0.75) * up, p.z);
      const wave = Math.sin(this.t * 3.1 + i * 1.7) * 0.35 * up + Math.sin(this.t * 7 + i) * 0.06 * up;
      this.q.setFromAxisAngle(this.yAxis, p.yaw + wave);
      this.q2.setFromAxisAngle(this.zAxis, -(1 - up) * 1.3);
      this.q.multiply(this.q2);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Soft additive balls of light, merged into one draw. */
function halos(b: Build, key: string, at: V3[], r: number, hex: number): THREE.MeshBasicMaterial {
  const mat = glowMaterial(hex);
  const geos = at.map((p) => place(new THREE.SphereGeometry(r, 10, 6), p));
  const mesh = fx(new THREE.Mesh(mergeCached(`${key}/halo`, geos), mat));
  mesh.name = 'halos';
  b.root.add(mesh);
  return mat;
}

/** The power bulb by the socket: warm = works, blinking coral = short, grey = no power. */
function bulbUpdate(mat: THREE.MeshStandardMaterial | undefined): (t: number, on: boolean, low: boolean) => void {
  let last = '';
  return (t, on, low) => {
    if (!mat) return;
    const st = low ? (Math.floor(t * 6) % 2 === 0 ? 'low' : 'dim') : on ? 'on' : 'off';
    if (st === last) return;
    last = st;
    if (st === 'on') setGlow(mat, C_WARM, 1);
    else if (st === 'low') setGlow(mat, C_CORAL, 1);
    else setGlow(mat, C_OFF, 0);
  };
}

function bulbAt(b: Build, at: V3, n: V3): void {
  const back: V3 = [at[0] - n[0] * 0.05, at[1], at[2] - n[2] * 0.05];
  b.disc(0.2, 0.08, back, n, CHARCOAL);
  b.lens('bulb', WARM, 0.12, 0.1, [back[0] + n[0] * 0.06, back[1], back[2] + n[2] * 0.06], n);
}

function finishCastle(
  b: Build,
  solid: Grid,
  gate: Grid,
  o: { chest: CastleModel['chest']; top: V3; socket: V3; update: CastleModel['update']; own?: THREE.BufferGeometry[] },
): CastleModel {
  finishShadows(b.root);
  const root = b.root;
  return {
    root,
    update: o.update,
    solid: solid.list(),
    gate: gate.list(),
    chest: o.chest,
    top: new THREE.Vector3(...o.top),
    socket: new THREE.Vector3(...o.socket),
    dispose() {
      const mats = new Set<THREE.Material>();
      root.traverse((x) => {
        const m = (x as THREE.Mesh).material;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) if (mm.userData.own) mats.add(mm);
      });
      mats.forEach((m) => m.dispose());
      o.own?.forEach((g) => g.dispose());
    },
  };
}

/** A small swinging leaf of a gate: a group at the hinge; the Kit part's boxes are relative to it. */
function leaf(b: Build, name: string, at: V3): { g: THREE.Group; p: ReturnType<Build['part']> } {
  const g = new THREE.Group();
  g.position.set(...at);
  b.root.add(g);
  return { g, p: b.part(name, g) };
}

// ─── the elves: a castle on a huge tree ─────────────────────────────────────

const C_ELF = new THREE.Color('#ffd98a');

/** A tiny round elf house standing on (x, y, z), its door towards (sin yaw, cos yaw). Returns its roof tip. */
function tinyElfHouse(b: Build, x: number, y: number, z: number, yaw: number, s = 1.8): V3 {
  oct(b, s + 0.2, 0.25, y, BARK_D, x, z);
  oct(b, s, 1.35, y + 0.25, WOODL, x, z);
  oct(b, s + 0.08, 0.08, y + 0.95, WOODL_D, x, z);
  const fx2 = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const r = s / 2;
  b.box([0.6, 0.95, 0.1], [x + fx2 * (r + 0.02), y + 0.72, z + fz * (r + 0.02)], BARK_D, [0, yaw, 0]);
  b.box([0.08, 0.08, 0.08], [x + fx2 * (r + 0.08) + fz * 0.18, y + 0.7, z + fz * (r + 0.08) - fx2 * 0.18], MUSTARD);
  for (const side of [-1, 1]) {
    const a = yaw + side * 1.1;
    b.lens('win', '#ffd98a', 0.2, 0.08, [x + Math.sin(a) * (r - 0.02), y + 1.0, z + Math.cos(a) * (r - 0.02)], [Math.sin(a), 0, Math.cos(a)]);
  }
  const ry = y + 1.6;
  oct(b, s + 0.5, 0.36, ry, LEAF, x, z);
  oct(b, s - 0.1, 0.36, ry + 0.32, LEAF2, x, z);
  oct(b, s - 0.75, 0.36, ry + 0.64, LEAF, x, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    b.box([0.14, 0.14, 0.14], [x + Math.cos(a) * (r + 0.22), ry + 0.3, z + Math.sin(a) * (r + 0.22)], i % 2 ? PINK : CREAM);
  }
  return [x, ry + 1.0, z];
}

function elfCastle(skin: Skin): CastleModel {
  const b = new Build(skin, 'castle-elves');
  const solid = new Grid();
  const gate = new Grid();
  const CZ = -6;
  const dd = (x: number, z: number): number => Math.max(Math.abs(x), Math.abs(z - CZ));
  const trunk = (x: number, z: number): boolean => dd(x, z) <= 2;

  // ── cells ──
  for (let x = -2; x <= 2; x++) for (let z = CZ - 2; z <= CZ + 2; z++) solid.col(x, z, 0, 12);
  // the root wall round the foot, three tall, with the arch door at the front
  const wall: [number, number][] = [];
  for (let x = -5; x <= 5; x++)
    for (let z = CZ - 5; z <= CZ + 5; z++) {
      if (dd(x, z) !== 5) continue;
      if (z === CZ + 5 && Math.abs(x) <= 1) {
        gate.col(x, z, 0, 2);
        solid.add(x, 3, z);
        continue;
      }
      solid.col(x, z, 0, 2);
      wall.push([x, z]);
    }
  for (const x of [-2, 2]) solid.add(x, 3, CZ + 5);
  // low root tips outside the wall (one block: a hero may hop on, never over the wall)
  const tips: [number, number, number, number][] = [
    [-6, CZ - 6, -1, -1], [6, CZ - 6, 1, -1], [-6, CZ + 6, -1, 1], [6, CZ + 6, 1, 1], [-6, CZ, -1, 0], [6, CZ - 1, 1, 0], [1, CZ - 6, 0, -1],
  ];
  for (const [x, z] of tips) solid.add(x, 0, z);

  const entry = (x: number, z: number): boolean => Math.abs(x) <= 1 && (z === CZ + 3 || z === CZ + 4);
  const treads: Tread[] = [];
  const tread = (k: number, xs: number[], zs: number[]): void => {
    for (const x of xs)
      for (const z of zs) {
        treads.push({ x, z, k });
        solid.add(x, k, z);
      }
  };
  // the spiral: from the arch door to the right, along the trunk's right side, round to the back
  tread(0, [2], [CZ + 3, CZ + 4]);
  tread(1, [3, 4], [CZ + 3, CZ + 4]);
  for (let k = 2; k <= 6; k++) tread(k, [3, 4], [CZ + 4 - k]);
  tread(7, [3, 4], [CZ - 3, CZ - 4]);
  const isTread = new Set(treads.map((t) => k2(t.x, t.z)));

  // the balcony: the first ring platform, on the trunk's back and left (the spiral side stays open to the sky)
  const onDeck = (x: number, z: number): boolean => {
    const d = dd(x, z);
    return d >= 3 && d <= 7 && (x <= -3 || (z <= CZ - 3 && x <= 2));
  };
  const deck: [number, number][] = [];
  for (let x = -7; x <= 7; x++) for (let z = CZ - 7; z <= CZ + 7; z++) if (onDeck(x, z)) deck.push([x, z]);
  for (const [x, z] of deck) solid.add(x, BALCONY, z);
  const stairRails = treadRails(solid, treads, (x, z) => trunk(x, z) || isTread.has(k2(x, z)) || entry(x, z) || onDeck(x, z), false);
  // a tiny house on the balcony's back-left corner
  for (const x of [-6, -5]) for (const z of [CZ - 6, CZ - 5]) solid.col(x, z, 9, 11);
  const deckRails = edgeRails(solid, deck, BALCONY, (x, z) => trunk(x, z) || (isTread.has(k2(x, z)) && z <= CZ - 3));

  // ── look ──
  // the trunk: a thick bark octagon, ridges on the diagonals, bands
  oct(b, 5.3, 16.5, 0, BARK, 0, CZ);
  oct(b, 4.3, 3.6, 16.5, BARK, 0, CZ);
  for (const y of [4.2, 11.6, 16.3]) oct(b, 5.42, 0.18, y, BARK_D, 0, CZ);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.box([0.45, 16, 0.2], [Math.sin(a) * 2.62, 8.2, CZ + Math.cos(a) * 2.62], BARK_D, [0, a, 0]);
  }
  // the trunk's round door onto the balcony (left side), with a warm round window above
  b.disc(0.95, 0.1, [-2.64, 10.1, CZ], [-1, 0, 0], BARK_D);
  b.box([0.12, 1.8, 1.3], [-2.72, 9.95, CZ], WOODL);
  for (const z of [-0.32, 0, 0.32]) b.box([0.04, 1.6, 0.04], [-2.8, 9.9, CZ + z], WOODL_D);
  b.box([0.08, 0.1, 0.1], [-2.82, 9.85, CZ + 0.42], MUSTARD);
  b.disc(0.42, 0.1, [-2.64, 12.0, CZ], [-1, 0, 0], BARK_D);
  b.lens('win', '#ffd98a', 0.3, 0.1, [-2.7, 12.0, CZ], [-1, 0, 0]);
  // round windows up the trunk front
  for (const [x, y] of [[-1.0, 6.0], [1.1, 13.6], [-0.6, 15.0]] as const) {
    b.disc(0.38, 0.1, [x, y, CZ + 2.62], [0, 0, 1], BARK_D);
    b.lens('win', '#ffd98a', 0.27, 0.1, [x, y, CZ + 2.68], [0, 0, 1]);
  }

  // the root wall: bark, rounded humps, moss on top; root tips outside
  tiles(b, wall, 0, 3.0, () => BARK_D);
  tiles(b, wall, 3.0, 3.22, (x, z) => ((x + z) % 3 === 0 ? LEAF : LEAF_D));
  wall.forEach(([x, z], i) => {
    if (i % 2 === 0) b.ball(0.72, [x, 3.0, z], BARK, { s: [1, 0.6, 1], seg: 10 });
  });
  for (const [x, z, ox, oz] of tips) {
    b.beam([x - ox * 0.75, 1.9, z - oz * 0.75], [x + ox * 0.45, 0.3, z + oz * 0.45], 0.8, BARK);
    b.ball(0.55, [x + ox * 0.2, 0.35, z + oz * 0.2], BARK_D, { s: [1, 0.6, 1], seg: 10 });
  }
  // the arch door
  for (const sx of [-1, 1]) {
    b.box([1.0, 4.3, 1.0], [sx * 2, 2.15, CZ + 5], BARK);
    b.ball(0.6, [sx * 2, 4.3, CZ + 5], LEAF, { s: [1, 0.7, 1], seg: 10 });
  }
  b.box([3.0, 1.25, 1.0], [0, 3.62, CZ + 5], BARK);
  b.geo(new THREE.TorusGeometry(1.72, 0.22, 6, 18, Math.PI), [0, 1.35, CZ + 5.6], BARK_D);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    b.box([0.18, 0.18, 0.18], [Math.cos(a) * 1.72, 1.35 + Math.sin(a) * 1.72, CZ + 5.82], i % 2 ? PINK : CREAM);
  }
  b.ball(0.85, [0, 4.35, CZ + 5], LEAF2, { s: [1.6, 0.6, 1], seg: 12 });
  // the two door leaves (they swing inwards)
  const doors = [-1, 1].map((sx) => {
    const { g, p } = leaf(b, sx < 0 ? 'doorL' : 'doorR', [sx * 1.5, 0, CZ + 4.62]);
    const w = -sx;
    p.box([1.46, 2.92, 0.14], [w * 0.74, 1.46, 0], WOODL);
    for (const x of [0.37, 1.1]) p.box([0.05, 2.8, 0.17], [w * x, 1.42, 0], WOODL_D);
    for (const y of [0.55, 2.35]) p.box([1.46, 0.12, 0.18], [w * 0.74, y, 0], BARK_D);
    p.box([0.12, 0.12, 0.22], [w * 1.3, 1.4, 0], MUSTARD);
    p.box([0.5, 0.5, 0.16], [w * 0.74, 1.6, 0.02], LEAF);
    return { g, sx };
  });

  // the spiral's treads: planks on brackets from the trunk; tread 0 is a block
  for (const t of treads) {
    const c = t.k % 2 ? WOODL : '#e0b070';
    if (t.k === 0) {
      b.box([1, 1, 1], [t.x, 0.5, t.z], WOODL_D);
      b.box([1.02, 0.12, 1.02], [t.x, 0.96, t.z], c);
    } else {
      b.box([1.0, 0.4, 1.0], [t.x, t.k + 0.8, t.z], c);
      b.box([1.02, 0.08, 1.02], [t.x, t.k + 0.58, t.z], WOODL_D);
    }
  }
  for (let k = 1; k <= 7; k++) {
    const here = treads.filter((t) => t.k === k);
    const cx = here.reduce((s, t) => s + t.x, 0) / here.length;
    const cz = here.reduce((s, t) => s + t.z, 0) / here.length;
    if (k === 1) b.box([0.4, 1.3, 0.4], [cx + 0.6, 0.65, cz + 0.6], BARK_D);
    else if (k === 7) b.beam([2.2, 6.4, CZ - 2.4], [cx + 0.4, 7.5, cz - 0.3], 0.26, BARK_D);
    else b.beam([2.6, k - 0.4, cz], [cx + 0.5, k + 0.5, cz], 0.26, BARK_D);
  }
  railPanels(b, stairRails, { post: BARK, rail: WOODL_D, cap: LEAF, drop: 0.7 }, (r) => r.y < 3);

  // the balcony deck: planks on brackets
  tiles(b, deck, BALCONY + 0.5, BALCONY + 1, (_x, z) => (z % 2 ? WOODL : '#d6a568'));
  tiles(b, deck, BALCONY + 0.38, BALCONY + 0.5, () => WOODL_D);
  for (const z of [CZ - 2, CZ + 2, CZ + 6]) b.beam([-2.6, 5.2, z], [-6.6, 8.4, z], 0.3, BARK_D);
  for (const x of [-1.5, 1.5]) b.beam([x, 5.2, CZ - 2.6], [x, 8.4, CZ - 6.6], 0.3, BARK_D);
  railPanels(b, deckRails, { post: BARK, rail: LEAF_D, cap: LEAF });
  for (const r of deckRails) if ((r.x + r.z) % 3 === 0) b.box([0.2, 0.2, 0.2], [r.x + r.dx * 0.38, r.y + 1.32, r.z + r.dz * 0.38], PINK);
  const roofTips: V3[] = [tinyElfHouse(b, -5.5, BALCONY + 1, CZ - 5.5, Math.PI / 4, 1.9)];

  // two more ring platforms higher up (to look at): left and back, then a small one at the back
  const ringDeck = (ly: number, inside: (x: number, z: number) => boolean): [number, number][] => {
    const cells: [number, number][] = [];
    for (let x = -6; x <= 6; x++) for (let z = CZ - 6; z <= CZ + 6; z++) if (inside(x, z)) cells.push([x, z]);
    tiles(b, cells, ly + 0.55, ly + 1, (_x, z) => (z % 2 ? WOODL : '#d6a568'));
    const set = new Set(cells.map(([x, z]) => k2(x, z)));
    const edge: Rail[] = [];
    for (const [x, z] of cells)
      for (const [dx, dz] of DIRS) if (!set.has(k2(x + dx, z + dz)) && !trunk(x + dx, z + dz)) edge.push({ x, z, dx: -dx, dz: -dz, y: ly + 1 });
    railPanels(b, edge, { post: BARK, rail: LEAF_D, h: 0.9 });
    return cells;
  };
  const deck2 = ringDeck(12, (x, z) => {
    const d = dd(x, z);
    return d >= 3 && d <= 5 && x <= 1 && (x <= -3 || z <= CZ - 3);
  });
  ringDeck(15, (x, z) => {
    const d = dd(x, z);
    return d >= 3 && d <= 4 && z <= CZ - 3 && x >= -1;
  });
  void deck2;
  for (const [a, y] of [[-0.6, 9.4], [-1.6, 9.4], [-2.6, 9.4], [2.3, 12.4], [3.0, 12.4]] as const) {
    b.beam([Math.sin(a) * 2.6, y, CZ + Math.cos(a) * 2.6], [Math.sin(a) * 5.4, y + 3.0, CZ + Math.cos(a) * 5.4], 0.24, BARK_D);
  }
  roofTips.push(tinyElfHouse(b, -4.5, 13, CZ + 2, -Math.PI / 2 + 0.3, 1.7));
  roofTips.push(tinyElfHouse(b, -0.5, 13, CZ - 4.5, Math.PI, 1.6));
  roofTips.push(tinyElfHouse(b, 2.5, 16, CZ - 3.5, Math.PI * 0.75, 1.5));

  // the crown: round leaf clusters with blossoms
  const crown: [number, number, number, number, string][] = [[0, 20.2, 0, 5.2, LEAF]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    crown.push([Math.sin(a) * 5.0, 19.4 + (i % 2) * 0.6, Math.cos(a) * 5.0, 3.2, i % 2 ? LEAF2 : LEAF_D]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 1.2;
    crown.push([Math.sin(a) * 2.4, 22.4, Math.cos(a) * 2.4, 2.4, LEAF2]);
  }
  crown.push([0, 23.2, 0, 1.6, LEAF]);
  for (const [x, y, z, r, c] of crown) b.ball(r, [x, y, CZ + z], c, { s: [1, 0.74, 1], seg: 16 });
  crown.forEach(([x, y, z, r], i) => {
    for (let j = 0; j < 4; j++) {
      const az = j * 1.7 + i;
      const pt = domePt(r, r * 0.74, r, y, az, 0.35 + (j % 2) * 0.3);
      b.box([0.26, 0.26, 0.26], [x + pt.p[0], pt.p[1], CZ + z + pt.p[2]], (i + j) % 3 ? PINK : CREAM);
    }
  });

  // lantern-fruits: under the crown and the second platform's edge
  const lanterns: V3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4 + 0.3;
    const r = 4.4 + (i % 3) * 1.1;
    const top = 17.6 - (i % 3) * 0.3;
    const len = 0.7 + (i % 4) * 0.3;
    lanterns.push([Math.sin(a) * r, top - len, CZ + Math.cos(a) * r]);
    b.box([0.04, len, 0.04], [Math.sin(a) * r, top - len / 2, CZ + Math.cos(a) * r], CREAM);
  }
  for (const [x, z] of [[-5.4, CZ + 3], [-5.4, CZ - 1], [-3.6, CZ - 5.4], [-0.2, CZ - 5.4]] as const) {
    lanterns.push([x, 11.8, z]);
    b.box([0.04, 0.6, 0.04], [x, 12.25, z], CREAM);
  }
  for (const p of lanterns) {
    b.glowBall('lant', '#ffd98a', 0.24, p, { s: [1, 1.2, 1] });
    b.box([0.24, 0.1, 0.24], [p[0], p[1] + 0.3, p[2]], LEAF_D);
  }
  // the gate's lantern and the power bulb
  b.box([0.05, 0.5, 0.05], [0, 2.85, CZ + 5.75], CREAM);
  b.glowBox('lant', '#ffd98a', [0.3, 0.36, 0.3], [0, 2.45, CZ + 5.75]);
  lanterns.push([0, 2.45, CZ + 5.75]);
  const socket: V3 = [-4, 1.6, CZ + 5.5];
  bulbAt(b, [-4, 1.6, CZ + 5.52], [0, 0, 1]);

  const flags = new Flags(b, roofTips.map(([x, y, z], i) => ({ x, z, y0: y - 0.35, y1: y + 1.4, yaw: i * 1.3 - 1.5 })), MUSTARD, LEAF2, BARK);
  const m = b.finish();
  const haloMat = halos(b, 'castle-elves', lanterns, 0.7, 0xffc866);
  const gatePool = pool(RACE_POOL.elves, 2.6, [0, 0.05, CZ + 6.6]);
  b.root.add(gatePool.mesh);
  // fireflies round the crown when liberated
  const FLIES = 16;
  const flyMat = glowMaterial(0xfff2a0);
  const flyGeo = new THREE.SphereGeometry(0.09, 6, 4);
  const flies = fx(new THREE.InstancedMesh(flyGeo, flyMat, FLIES));
  flies.frustumCulled = false;
  flies.visible = false;
  b.root.add(flies);
  const mq = new THREE.Matrix4();
  const ps = new THREE.Vector3();
  const idQ = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const bulb = bulbUpdate(m.bulb);
  let t = 0;
  return finishCastle(b, solid, gate, {
    chest: { x: -5, y: BALCONY + 1, z: CZ, yaw: 0 },
    top: [-5, BALCONY + 1, CZ + 2],
    socket,
    own: [flyGeo],
    update(dt, k) {
      t += dt;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
      lightUp(m.win, C_ELF, k.alive, k.night);
      lightUp(m.lant, C_ELF, k.alive, k.night, 0.15 * pulse + 0.2 * k.beat);
      haloMat.opacity = k.alive * (0.03 + 0.3 * k.night + 0.03 * pulse);
      gatePool.mat.opacity = k.alive * 0.55 * k.night;
      gatePool.mesh.visible = gatePool.mat.opacity > 0.02;
      flags.update(dt, k.alive, k.beat);
      for (const d of doors) d.g.rotation.y = -d.sx * k.open * HP * 0.95;
      bulb(t, k.on, k.low);
      const fa = k.alive * (0.3 + 0.7 * k.night);
      flies.visible = fa > 0.03;
      if (flies.visible) {
        flyMat.opacity = fa * (0.7 + 0.3 * Math.sin(t * 9));
        for (let i = 0; i < FLIES; i++) {
          const a = t * (0.25 + (i % 4) * 0.06) + i * 2.1;
          const r = 5.5 + Math.sin(t * 0.7 + i) * 1.6;
          ps.set(Math.sin(a) * r, 11 + (i % 5) * 1.4 + Math.sin(t * 1.3 + i * 0.7) * 0.6, CZ + Math.cos(a) * r);
          flies.setMatrixAt(i, mq.compose(ps, idQ, one));
        }
        flies.instanceMatrix.needsUpdate = true;
      }
    },
  });
}

// ─── the gnomes: a stone fortress ───────────────────────────────────────────

const C_GNOME = new THREE.Color('#ffc064');

function gnomeCastle(skin: Skin): CastleModel {
  const b = new Build(skin, 'castle-gnomes');
  const solid = new Grid();
  const gate = new Grid();

  // ── cells ──
  // the front wall (six tall) with the gatehouse (eight tall) over the gate tunnel
  for (let x = -9; x <= 9; x++)
    for (const z of [2, 3]) {
      const top = Math.abs(x) <= 2 ? 7 : 5;
      for (let y = 0; y <= top; y++) if (!(Math.abs(x) <= 1 && y <= 2)) solid.add(x, y, z);
    }
  for (let x = -1; x <= 1; x++) gate.col(x, 3, 0, 2);
  // two round towers flanking the gate
  const towerF = [-3.5, 3.5].map((cx) => discCells(cx, 2.5, 1.8));
  for (const cells of towerF) for (const [x, z] of cells) solid.col(x, z, 0, 11);
  // the side walls
  for (const x of [-9, -8, 8, 9]) for (let z = -9; z <= 1; z++) solid.col(x, z, 0, 5);
  // the back: the wall walk's mass (its top is the balcony), the keep tower, the forge chimney
  for (let x = -9; x <= 9; x++) for (let z = -14; z <= -10; z++) solid.col(x, z, 0, BALCONY);
  const keep = discCells(-9.5, -12, 2.0);
  for (const [x, z] of keep) solid.col(x, z, 0, 13);
  const chimney: [number, number][] = [];
  for (let x = 8; x <= 10; x++) for (let z = -13; z <= -11; z++) chimney.push([x, z]);
  for (const [x, z] of chimney) solid.col(x, z, 0, 13);
  // the anvil in the yard
  solid.add(5, 0, -7);

  // the stair along the left wall, from the gate's side of the yard up to the wall walk
  const treads: Tread[] = [];
  for (let k = 0; k <= BALCONY; k++)
    for (const x of [-7, -6]) {
      treads.push({ x, z: -1 - k, k });
      solid.col(x, -1 - k, 0, k);
    }
  const isTread = new Set(treads.map((t) => k2(t.x, t.z)));
  const walk: [number, number][] = [];
  for (let x = -9; x <= 9; x++) for (let z = -14; z <= -10; z++) if (!keep.some(([a, c]) => a === x && c === z) && !chimney.some(([a, c]) => a === x && c === z)) walk.push([x, z]);
  const walkSet = new Set(walk.map(([x, z]) => k2(x, z)));
  const stairRails = treadRails(solid, treads, (x, z) => isTread.has(k2(x, z)) || walkSet.has(k2(x, z)) || (z === 0 && x >= -7 && x <= -6), true);
  const walkRails = edgeRails(solid, walk, BALCONY, (x, z) => isTread.has(k2(x, z)));

  // ── look ──
  const stoneCourses = (x0: number, x1: number, z: number, y1: number, face: number): void => {
    for (let y = 1.5; y < y1 - 0.3; y += 1.5) b.box([x1 - x0 + 1.02, 0.08, 0.06], [(x0 + x1) / 2, y, z + face * 0.52], STONE_D);
  };
  // front wall and gatehouse
  for (const sx of [-1, 1]) {
    b.box([7, 6, 2], [sx * 6, 3, 2.5], STONE);
    stoneCourses(sx > 0 ? 3 : -9, sx > 0 ? 9 : -3, 3, 6, 1);
    for (let x = 3; x <= 9; x += 2) b.box([0.8, 0.7, 0.55], [sx * x, 6.35, 3.2], STONE);
    for (let x = 3; x <= 9; x += 2) b.box([0.8, 0.7, 0.55], [sx * x, 6.35, 1.8], STONE);
    b.box([1, 8, 2], [sx * 2, 4, 2.5], STONE);
  }
  b.box([3, 5, 2], [0, 5.5, 2.5], STONE);
  stoneCourses(-2, 2, 3, 8, 1);
  for (let x = -2; x <= 2; x += 2) {
    b.box([0.8, 0.7, 0.55], [x, 8.35, 3.2], STONE);
    b.box([0.8, 0.7, 0.55], [x, 8.35, 1.8], STONE);
  }
  for (const [x, y, w] of [[-6.5, 1.0, 0.6], [5.5, 2.2, 0.5], [7.6, 4.1, 0.45], [-4.4, 4.5, 0.5], [1.2, 6.5, 0.4]] as const) b.box([w, 0.3, 0.08], [x, y, 3.53], STONE_L);
  // the gate arch, the emblem above, a window
  b.geo(new THREE.TorusGeometry(1.75, 0.26, 6, 18, Math.PI), [0, 1.45, 3.62], STONE_L);
  for (const sx of [-1, 1]) b.box([0.5, 1.45, 0.3], [sx * 1.75, 0.72, 3.62], STONE_L);
  b.disc(0.8, 0.12, [0, 5.3, 3.5], [0, 0, 1], MUSTARD);
  b.box([0.2, 0.95, 0.1], [0, 5.1, 3.66], WOOD_DARK);
  b.box([0.7, 0.34, 0.12], [0, 5.6, 3.68], IRON);
  b.disc(0.42, 0.08, [0, 7.0, 3.5], [0, 0, 1], WOOD);
  b.lens('win', '#ffc064', 0.3, 0.1, [0, 7.0, 3.56], [0, 0, 1]);
  // the gate leaves: planks with iron bands (they swing inwards)
  const doors = [-1, 1].map((sx) => {
    const { g, p } = leaf(b, sx < 0 ? 'gateL' : 'gateR', [sx * 1.5, 0, 3.3]);
    const w = -sx;
    p.box([1.48, 2.94, 0.2], [w * 0.74, 1.47, 0], WOOD);
    for (const x of [0.37, 0.74, 1.11]) p.box([0.04, 2.9, 0.22], [w * x, 1.45, 0], WOOD_DARK);
    for (const y of [0.45, 1.5, 2.55]) p.box([1.5, 0.16, 0.24], [w * 0.74, y, 0], IRON);
    for (const y of [0.45, 1.5, 2.55]) for (const x of [0.25, 1.25]) p.box([0.1, 0.1, 0.27], [w * x, y, 0], '#6c6662');
    p.box([0.14, 0.3, 0.28], [w * 1.3, 1.25, 0], IRON);
    return { g, sx };
  });

  // round towers with coral cones
  const tips: V3[] = [];
  const roundTower = (cx: number, cz: number, r: number, h: number, coneH: number, wins: number[], face: V3): void => {
    b.cyl(r, h, [cx, h / 2, cz], STONE, { seg: 18 });
    for (let y = 2; y < h - 0.5; y += 2.5) b.cyl(r + 0.05, 0.12, [cx, y, cz], STONE_D, { seg: 18 });
    b.cyl(r + 0.3, 0.5, [cx, h + 0.25, cz], STONE_D, { seg: 18 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      b.box([0.6, 0.6, 0.5], [cx + Math.sin(a) * (r + 0.05), h + 0.8, cz + Math.cos(a) * (r + 0.05)], STONE, [0, a, 0]);
    }
    b.cyl(r + 0.55, coneH, [cx, h + 0.5 + coneH / 2, cz], CORAL, { r1: 0.08, seg: 18 });
    b.cyl(r + 0.6, 0.18, [cx, h + 0.55, cz], CORAL_DARK, { seg: 18 });
    for (const y of wins) {
      const n = new THREE.Vector3(...face).normalize();
      b.box([0.5, 0.95, 0.12], [cx + n.x * (r - 0.02), y, cz + n.z * (r - 0.02)], STONE_D, [0, Math.atan2(n.x, n.z), 0]);
      b.glowBox('win', '#ffc064', [0.28, 0.75, 0.1], [cx + n.x * (r + 0.03), y, cz + n.z * (r + 0.03)], [0, Math.atan2(n.x, n.z), 0]);
    }
    tips.push([cx, h + 0.5 + coneH, cz]);
  };
  roundTower(-3.5, 2.5, 1.9, 12, 4.2, [5.5, 9.0], [0, 0, 1]);
  roundTower(3.5, 2.5, 1.9, 12, 4.2, [5.5, 9.0], [0, 0, 1]);
  roundTower(-9.5, -12, 2.1, 14, 6.0, [6.0, 10.0, 12.5], [0.6, 0, 1]);

  // side walls (the left one climbs with the stair)
  for (const sx of [-1, 1]) {
    b.box([2, 6, 11], [sx * 8.5, 3, -4], STONE);
    for (let z = -8; z <= 0; z += 2) b.box([0.55, 0.7, 0.8], [sx * 9.25, 6.35, z], STONE);
    for (let y = 1.5; y < 5.8; y += 1.5) b.box([0.06, 0.08, 11.02], [sx * 9.52, y, -4], STONE_D);
  }
  for (const t of treads) if (t.x === -7 && t.k + 3 > 6) b.box([1, t.k + 3 - 6, 1], [-8, 6 + (t.k + 3 - 6) / 2, t.z], STONE);
  for (const t of treads) if (t.x === -7 && t.k + 3 > 6) b.box([1.06, 0.12, 1.06], [-8, t.k + 3.06, t.z], STONE_D);
  // the back: the wall walk's mass, its floor and parapets
  b.box([19, 9, 5], [0, 4.5, -12], STONE);
  for (let y = 1.5; y < 8.8; y += 1.5) b.box([19.02, 0.08, 0.06], [0, y, -9.48], STONE_D);
  for (const [x, y, w] of [[-3.5, 2.2, 0.6], [2.6, 5.1, 0.5], [-0.8, 7.2, 0.45], [7.8, 6.4, 0.5]] as const) b.box([w, 0.3, 0.08], [x, y, -9.46], STONE_L);
  tiles(b, walk, BALCONY + 0.98, BALCONY + 1.04, (x, z) => ((x + z) % 2 ? STONE_L : '#bdb6a8'));
  railPanels(b, walkRails, { post: STONE, rail: STONE_D, parapet: true });
  // round windows over the yard
  for (const x of [-3, 3]) {
    b.disc(0.5, 0.1, [x, 5.0, -9.5], [0, 0, 1], WOOD);
    b.lens('win', '#ffc064', 0.36, 0.1, [x, 5.0, -9.44], [0, 0, 1]);
  }
  // the forge in the back wall and the anvil
  b.box([2.8, 2.4, 0.2], [6, 1.2, -9.42], CHARCOAL);
  b.box([3.2, 0.3, 0.3], [6, 2.5, -9.38], STONE_L);
  b.glowBox('fire', '#ff9a3a', [2.2, 1.7, 0.1], [6, 0.95, -9.3]);
  b.cyl(0.42, 0.45, [5, 0.22, -7], WOOD, { seg: 10 });
  b.box([0.34, 0.3, 0.3], [5, 0.6, -7], IRON);
  b.box([0.95, 0.24, 0.42], [5, 0.86, -7], IRON);
  b.box([0.45, 0.18, 0.3], [5.6, 0.84, -7], IRON);
  // the chimney: bricks to 20
  b.box([3, 14, 3], [9, 7, -12], BRICK);
  for (let y = 1.5; y < 13.8; y += 1.5) b.box([3.04, 0.1, 3.04], [9, y, -12], y % 3 ? BRICK_D : CREAM);
  b.box([2.2, 6, 2.2], [9, 17, -12], BRICK_D);
  b.box([2.5, 0.35, 2.5], [9, 20.1, -12], STONE_D);
  b.box([1.6, 0.06, 1.6], [9, 20.3, -12], CHARCOAL);
  // the stair: stone steps, a stone balustrade on the yard side
  for (let k = 0; k <= BALCONY; k++) {
    const z = -1 - k;
    b.box([2, k + 1, 1], [-6.5, (k + 1) / 2, z], STONE);
    b.box([2.02, 0.12, 1.02], [-6.5, k + 0.95, z], k % 2 ? STONE_L : '#d8d2c4');
    b.box([2.04, 0.1, 0.1], [-6.5, k + 0.96, z + 0.47], STONE_D);
  }
  const inner = stairRails.filter((r) => r.x === -5);
  for (const r of inner) b.box([1, r.y, 1], [-5, r.y / 2, r.z], STONE);
  railPanels(b, inner, { post: STONE, rail: STONE_D, parapet: true });

  const flags = new Flags(
    b,
    [...tips.map(([x, y, z], i) => ({ x, z, y0: y - 0.1, y1: y + 1.6, yaw: 0.4 * i - 1.2 })), { x: 0, z: 2.0, y0: 8.0, y1: 10.6, yaw: -1.2 }],
    CORAL,
    MUSTARD,
    IRON,
  );
  const socket: V3 = [9.6, 2.2, -2];
  bulbAt(b, [9.52, 2.2, -2], [1, 0, 0]);
  const m = b.finish();
  const haloMat = halos(b, 'castle-gnomes', [[6, 1.0, -8.9], [0, 7.0, 4.0]], 0.9, 0xff9a3a);
  const forgePool = pool(0xff9a3a, 2.4, [6, 0.05, -8.0]);
  const gatePool = pool(RACE_POOL.gnomes, 2.6, [0, 0.05, 4.6]);
  b.root.add(forgePool.mesh, gatePool.mesh);
  // smoke puffs from the chimney
  const puffGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const SMOKE = 8;
  const puffs = fx(new THREE.InstancedMesh(puffGeo, skin.partMaterial('#d9d3c8') as THREE.Material, SMOKE));
  puffs.frustumCulled = false;
  puffs.visible = false;
  b.root.add(puffs);
  const mq = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const ps = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const FIRE = new THREE.Color('#ff9a3a');
  const bulb = bulbUpdate(m.bulb);
  let t = 0;
  return finishCastle(b, solid, gate, {
    chest: { x: 0, y: BALCONY + 1, z: -12, yaw: 0 },
    top: [-4, BALCONY + 1, -12],
    socket,
    own: [puffGeo],
    update(dt, k) {
      t += dt;
      lightUp(m.win, C_GNOME, k.alive, k.night);
      const flick = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.3);
      lightUp(m.fire, FIRE, k.alive, k.night, 0.6 * flick - 0.3 + 0.2 * k.beat);
      haloMat.opacity = k.alive * (0.02 + 0.3 * k.night) * flick;
      forgePool.mat.opacity = k.alive * (0.3 + 0.4 * k.night) * flick;
      forgePool.mesh.visible = forgePool.mat.opacity > 0.02;
      gatePool.mat.opacity = k.alive * 0.5 * k.night;
      gatePool.mesh.visible = gatePool.mat.opacity > 0.02;
      flags.update(dt, k.alive, k.beat);
      for (const d of doors) d.g.rotation.y = -d.sx * k.open * HP * 0.92;
      bulb(t, k.on, k.low);
      puffs.visible = k.alive > 0.05;
      if (puffs.visible) {
        for (let i = 0; i < SMOKE; i++) {
          const life = (t * 0.2 + i / SMOKE) % 1;
          const s = k.alive * Math.sin(life * Math.PI) * (0.7 + life * 1.5);
          ps.set(9 + Math.sin(t * 0.8 + i * 2) * 0.3 + life * 1.2, 20.6 + life * 4.0, -12 + Math.cos(i) * 0.2);
          sc.set(s, s, s);
          q.setFromEuler(e.set(life * 2, i, life));
          puffs.setMatrixAt(i, mq.compose(ps, q, sc));
        }
        puffs.instanceMatrix.needsUpdate = true;
      }
    },
  });
}

// ─── the robots: a tower on a base ──────────────────────────────────────────

const C_ROBOT = new THREE.Color('#ffe08a');

const dishCache = new Map<string, THREE.BufferGeometry>();
/** A dish facing +Y (rim up), with its feed, as one vertex-coloured geometry. */
function dishGeo(R: number, D: number, shell: string, rim: string): THREE.BufferGeometry {
  const key = `${R}/${D}/${shell}/${rim}`;
  let g = dishCache.get(key);
  if (g) return g;
  const prof: THREE.Vector2[] = [];
  const N = 6;
  for (let i = 0; i <= N; i++) prof.push(new THREE.Vector2((i / N) * R, D * (i / N) ** 2));
  for (let i = N; i >= 0; i--) prof.push(new THREE.Vector2((i / N) * (R - 0.02), D * (i / N) ** 2 + 0.08));
  const parts = [
    tint(new THREE.LatheGeometry(prof, 22), shell),
    tint(new THREE.TorusGeometry(R, 0.06, 6, 22).rotateX(HP).translate(0, D + 0.04, 0), rim),
    tint(new THREE.CylinderGeometry(0.06, 0.06, R * 0.85, 6).translate(0, R * 0.42, 0), rim),
    tint(new THREE.SphereGeometry(0.13, 8, 6).translate(0, R * 0.85, 0), CORAL),
    tint(new THREE.CylinderGeometry(0.18, 0.26, 0.3, 10).translate(0, -0.1, 0), STEEL_DARK),
  ];
  g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  dishCache.set(key, g);
  return g;
}

function robotCastle(skin: Skin): CastleModel {
  const b = new Build(skin, 'castle-robots');
  const solid = new Grid();
  const gate = new Grid();

  // ── cells ──
  // the base block (its top is the terrace = the balcony) and the tower on its back half
  for (let x = -6; x <= 6; x++) for (let z = -12; z <= -6; z++) solid.col(x, z, 0, BALCONY);
  for (let x = -2; x <= 2; x++) for (let z = -12; z <= -8; z++) solid.col(x, z, BALCONY + 1, 14);
  // the terrace's wing over the upper flight's end
  for (const x of [-7, -6]) for (const z of [-5, -4]) solid.col(x, z, 0, BALCONY);
  // the porch with the door (the gate): walls, roof, lintel; inside x −9..−8, z −4..−1
  for (let z = -5; z <= 0; z++) solid.col(-10, z, 0, 3);
  for (const x of [-9, -8]) {
    solid.col(x, -5, 0, 3);
    for (let z = -4; z <= 0; z++) solid.add(x, 3, z);
    gate.col(x, 0, 0, 2);
  }
  // the zig-zag: flight 1 (front lane, rising east), a landing, flight 2 (back lane, rising west)
  const treads: Tread[] = [];
  const tr = (k: number, x: number, zs: number[]): void => {
    for (const z of zs) {
      treads.push({ x, z, k });
      solid.col(x, z, 0, k);
    }
  };
  for (let k = 0; k <= 4; k++) tr(k, -7 + k, [-2, -1]);
  for (const x of [-2, -1]) tr(5, x, [-5, -4, -3, -2, -1]);
  tr(6, -3, [-5, -4]);
  tr(7, -4, [-5, -4]);
  tr(8, -5, [-5, -4]);
  const isTread = new Set(treads.map((t) => k2(t.x, t.z)));
  const terrace: [number, number][] = [];
  for (let x = -6; x <= 6; x++) for (let z = -12; z <= -6; z++) terrace.push([x, z]);
  terrace.push([-7, -5], [-7, -4], [-6, -5], [-6, -4], [-5, -5], [-5, -4]);
  const onTerrace = new Set(terrace.map(([x, z]) => k2(x, z)));
  const porchIn = (x: number, z: number): boolean => (x === -9 || x === -8) && z >= -4 && z <= -1;
  const stairRails = treadRails(solid, treads, (x, z) => isTread.has(k2(x, z)) || onTerrace.has(k2(x, z)) || porchIn(x, z), true);
  // open only where the top flight arrives (treads 7 and 8)
  const deckRails = edgeRails(solid, terrace, BALCONY, (x, z) => (x === -4 || x === -5) && (z === -5 || z === -4));

  // ── look ──
  // the base block
  b.box([13, 9, 7], [0, 4.5, -9], STEEL);
  for (const sx of [-1, 1]) for (const z of [-5.75, -12.25]) b.box([0.5, 9.1, 0.5], [sx * 6.3, 4.55, z], STEEL_DARK);
  b.box([13.1, 0.8, 7.1], [0, 7.7, -9], TEAL);
  b.box([13.06, 0.06, 7.06], [0, 3.0, -9], STEEL_DARK);
  for (let i = -6; i <= 6; i++) {
    b.box([0.1, 0.1, 0.06], [i, 7.95, -5.43], STEEL_DARK);
    b.box([0.1, 0.1, 0.06], [i, 7.45, -5.43], STEEL_DARK);
  }
  for (const sx of [-1, 1])
    for (const z of [-7.5, -10.5])
      for (const y of [4.6, 6.4]) {
        b.disc(0.42, 0.1, [sx * 6.5, y, z], [sx, 0, 0], STEEL_DARK);
        b.lens('win', '#ffe08a', 0.3, 0.1, [sx * 6.55, y, z], [sx, 0, 0]);
      }
  for (const x of [1.6, 5.2]) {
    b.disc(0.45, 0.1, [x, 6.3, -5.5], [0, 0, 1], STEEL_DARK);
    b.lens('win', '#ffe08a', 0.32, 0.1, [x, 6.3, -5.45], [0, 0, 1]);
  }
  // a control panel with three lamps under the gear
  b.box([2.2, 1.2, 0.2], [3.4, 1.6, -5.42], STEEL_DARK);
  for (const x of [2.7, 3.4, 4.1]) b.glowBox('status', '#ffd23a', [0.3, 0.3, 0.1], [x, 1.7, -5.3]);
  // the terrace floor
  tiles(b, terrace, BALCONY + 0.98, BALCONY + 1.04, (x, z) => ((x + z) % 2 ? TEAL_D : '#2a7d78'));
  railPanels(b, deckRails, { post: STEEL_DARK, rail: MUSTARD, cap: STEEL });
  // the wing over flight 2's end
  b.box([2, 9, 2], [-6.5, 4.5, -4.5], STEEL_DARK);
  b.box([2.06, 0.6, 2.06], [-6.5, 7.7, -4.5], TEAL);
  // the tower
  b.box([5, 10, 5], [0, 14, -10], STEEL);
  for (const y of [11.2, 15.0, 18.6]) b.box([5.1, 0.5, 5.1], [0, y, -10], TEAL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.4, 10.1, 0.4], [sx * 2.45, 14, -10 + sz * 2.45], STEEL_DARK);
  for (const y of [13.0, 16.8])
    for (const x of [-1.2, 1.2]) {
      b.disc(0.5, 0.1, [x, y, -7.5], [0, 0, 1], STEEL_DARK);
      b.lens('win', '#ffe08a', 0.36, 0.1, [x, y, -7.45], [0, 0, 1]);
    }
  b.box([3.6, 2.4, 3.6], [0, 20.2, -10], TEAL_D);
  b.box([4.0, 0.3, 4.0], [0, 21.55, -10], STEEL_DARK);
  b.glowBox('status', '#ffd23a', [2.4, 0.3, 0.1], [0, 20.4, -8.17]);
  b.beam([0, 21.7, -10], [0, 24.3, -10], 0.16, STEEL);
  for (const y of [22.4, 23.3]) b.box([1.2, 0.08, 0.08], [0, y, -10], STEEL);
  b.glowBall('beacon', '#ffd23a', 0.36, [0, 24.65, -10]);
  for (const sx of [-1, 1]) {
    b.beam([sx * 1.5, 21.7, -11.5], [sx * 1.5, 23.0, -11.5], 0.07, STEEL);
    b.box([0.18, 0.18, 0.18], [sx * 1.5, 23.08, -11.5], CORAL);
  }
  // dishes on arms, turning when the castle is free
  const dishes = [-1, 1].map((sx) => {
    b.box([1.0, 0.3, 0.3], [sx * 2.95, 16.6, -10], STEEL_DARK);
    const g = new THREE.Group();
    g.position.set(sx * 3.5, 16.6, -10);
    const tilt = new THREE.Group();
    tilt.rotation.z = -sx * 1.1;
    g.add(tilt);
    const mesh = new THREE.Mesh(dishGeo(1.15, 0.45, '#e8ebee', TEAL), b.kit.vertexColourMaterial(false));
    mesh.castShadow = true;
    tilt.add(mesh);
    b.root.add(g);
    return { g, sx };
  });
  // the big gear on the front, turning
  const gear = new THREE.Mesh(gearGeo(1.25, 10, 0.2), b.kit.vertexColourMaterial(false));
  gear.position.set(3.4, 4.4, -5.38);
  gear.castShadow = true;
  b.root.add(gear);
  // the porch: walls, roof, the door frame with stripes, a sign lamp, an antenna
  b.box([1, 4, 6], [-10, 2, -2.5], STEEL);
  b.box([2, 4, 1], [-8.5, 2, -5], STEEL);
  b.box([3, 1, 6], [-9, 3.5, -2.5], STEEL_DARK);
  b.box([3.1, 0.3, 6.1], [-9, 3.75, -2.5], TEAL);
  b.box([2, 1, 0.3], [-8.5, 3.5, 0.35], STEEL_DARK);
  for (let i = 0; i < 6; i++) b.box([0.34, 0.2, 0.08], [-9.33 + i * 0.33, 3.2, 0.54], i % 2 ? CHARCOAL : MUSTARD);
  for (const x of [-9.6, -7.4]) for (let i = 0; i < 6; i++) b.box([0.2, 0.5, 0.08], [x, 0.25 + i * 0.5, 0.54], i % 2 ? CHARCOAL : MUSTARD);
  b.glowBox('status', '#ffd23a', [0.8, 0.22, 0.1], [-8.5, 3.6, 0.54]);
  b.beam([-10, 4, -4.2], [-10, 5.6, -4.2], 0.07, STEEL);
  b.box([0.18, 0.18, 0.18], [-10, 5.68, -4.2], CORAL);
  const doors = [-1, 1].map((sx) => {
    const { g, p } = leaf(b, sx < 0 ? 'doorL' : 'doorR', [sx < 0 ? -9 : -8, 0, 0.62]);
    p.box([0.98, 2.95, 0.12], [0, 1.475, 0], TEAL_D);
    p.box([0.5, 0.2, 0.14], [0, 2.1, 0], '#a9d8d8');
    p.box([0.08, 2.9, 0.14], [-sx * 0.45, 1.45, 0], MUSTARD);
    return { g, x0: sx < 0 ? -9 : -8, sx };
  });
  // the stair: steel steps with teal plates and mustard noses
  for (const t of treads) {
    b.box([1, t.k + 1, 1], [t.x, (t.k + 1) / 2, t.z], STEEL_DARK);
    b.box([1.0, 0.1, 1.0], [t.x, t.k + 1.0, t.z], TEAL);
  }
  for (let k = 0; k <= 4; k++) b.box([0.12, 0.08, 2.0], [-7 + k - 0.45, k + 1.02, -1.5], MUSTARD);
  for (const [k, x] of [[6, -3], [7, -4], [8, -5]] as const) b.box([0.12, 0.08, 2.0], [x + 0.45, k + 1.02, -4.5], MUSTARD);
  b.box([0.12, 0.08, 5.0], [-2.45, 6.02, -3], MUSTARD);
  // the stair's walls: up to the higher side's step, then a railing on top
  const wallTop = new Map<string, { x: number; z: number; y: number }>();
  for (const r of stairRails) {
    const w = wallTop.get(k2(r.x, r.z));
    if (!w || w.y < r.y) wallTop.set(k2(r.x, r.z), { x: r.x, z: r.z, y: r.y });
  }
  for (const w of wallTop.values()) {
    if (solid.has(w.x, BALCONY, w.z) && onTerrace.has(k2(w.x, w.z))) continue;
    b.box([1, w.y, 1], [w.x, w.y / 2, w.z], STEEL);
    b.box([1.02, 0.25, 1.02], [w.x, w.y - 0.4, w.z], TEAL);
  }
  railPanels(b, stairRails, { post: STEEL_DARK, rail: MUSTARD }, (r) => (wallTop.get(k2(r.x, r.z))?.y ?? 0) > r.y + 0.1 || onTerrace.has(k2(r.x, r.z)));

  const flags = new Flags(
    b,
    [
      { x: -2.2, z: -7.9, y0: 21.7, y1: 23.6, yaw: -1.4 },
      { x: 2.2, z: -7.9, y0: 21.7, y1: 23.6, yaw: -1.7 },
      { x: -9.6, z: -0.6, y0: 4.0, y1: 6.0, yaw: -1.3 },
      { x: 6.2, z: -5.9, y0: 9.0, y1: 11.4, yaw: -1.6 },
    ],
    MUSTARD,
    TEAL,
    STEEL,
  );
  const socket: V3 = [6.6, 2.2, -8];
  bulbAt(b, [6.52, 2.2, -8], [1, 0, 0]);
  const m = b.finish();
  const beaconHalo = halo(0xffd070, 0.8, [0, 24.65, -10]);
  const gatePool = pool(RACE_POOL.robots, 2.4, [-8.5, 0.05, 1.6]);
  b.root.add(beaconHalo.mesh, gatePool.mesh);
  const bulb = bulbUpdate(m.bulb);
  let t = 0;
  return finishCastle(b, solid, gate, {
    chest: { x: 4, y: BALCONY + 1, z: -9, yaw: 0 },
    top: [-4, BALCONY + 1, -8],
    socket,
    update(dt, k) {
      t += dt;
      const a = k.alive;
      lightUp(m.win, C_ROBOT, a, k.night);
      const blink = Math.floor(t * 2) % 3 === 0 ? 0.4 : 0;
      lightUp(m.status, C_WARM, a, k.night, blink + 0.3 * k.beat);
      const ph = (t % 2.2) / 2.2;
      const flash = ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI) : 0;
      lightUp(m.beacon, C_WARM, a, k.night, flash * 1.2 - 0.2);
      beaconHalo.mat.opacity = a * (0.04 + 0.32 * flash) * (0.5 + 0.6 * k.night);
      beaconHalo.mesh.visible = beaconHalo.mat.opacity > 0.01;
      gatePool.mat.opacity = a * 0.5 * k.night;
      gatePool.mesh.visible = gatePool.mat.opacity > 0.02;
      gear.rotation.z -= dt * 0.45 * a;
      for (const d of dishes) d.g.rotation.y = d.sx * (0.4 + Math.sin(t * 0.3 + d.sx) * 0.6) * a + (1 - a) * d.sx * 0.2;
      for (const d of doors) d.g.position.x = d.x0 + d.sx * k.open * 0.95;
      flags.update(dt, a, k.beat);
      bulb(t, k.on, k.low);
    },
  });
}

// ─── the aliens: a landed saucer ────────────────────────────────────────────

const C_ALIEN = new THREE.Color('#c8ffe6');
const C_MINT = new THREE.Color(MINT_L);

function alienCastle(skin: Skin): CastleModel {
  const b = new Build(skin, 'castle-aliens');
  const solid = new Grid();
  const gate = new Grid();
  const SX = 1;
  const SZ = -6;
  const dist = (x: number, z: number): number => Math.hypot(x - SX, z - SZ);
  const DOME = 4.6;
  const WALK = 7.3;
  const RIM = 8.4;

  // ── cells ──
  const deck: [number, number][] = [];
  for (let x = -9; x <= 11; x++)
    for (let z = -15; z <= 4; z++) {
      const d = dist(x, z);
      if (d <= DOME) solid.col(x, z, BALCONY, 13);
      else if (d <= RIM) deck.push([x, z]);
    }
  for (const [x, z] of deck) solid.add(x, BALCONY, z);
  // the opening in the rail where the gangway's bridge comes in
  const opening = new Set([k2(-7, -6), k2(-7, -5)]);
  const railCells = deck.filter(([x, z]) => dist(x, z) > WALK && !opening.has(k2(x, z)));
  for (const [x, z] of railCells) solid.col(x, z, BALCONY + 1, BALCONY + 2);
  // four legs
  const legs: [number, number][] = [[SX - 4, SZ + 4], [SX + 4, SZ + 4], [SX - 4, SZ - 4], [SX + 4, SZ - 4]];
  for (const [x, z] of legs) solid.col(x, z, 0, 6);
  // the gangway: steps from the plaza edge back to a landing, a bridge onto the deck
  const treads: Tread[] = [];
  for (let k = 0; k <= BALCONY; k++)
    for (const x of [-10, -9]) {
      treads.push({ x, z: 3 - k, k });
      solid.col(x, 3 - k, 0, k);
    }
  for (const x of [-10, -9]) {
    treads.push({ x, z: -6, k: BALCONY });
    solid.col(x, -6, 0, BALCONY);
  }
  const bridge: [number, number][] = [[-8, -6], [-8, -5]];
  for (const [x, z] of bridge) solid.add(x, BALCONY, z);
  const isTread = new Set(treads.map((t) => k2(t.x, t.z)));
  const onBridge = (x: number, z: number): boolean => x === -8 && (z === -6 || z === -5);
  const gateCell = (x: number, z: number): boolean => z === 4 && (x === -10 || x === -9);
  const stairRails = treadRails(solid, treads, (x, z) => isTread.has(k2(x, z)) || onBridge(x, z) || gateCell(x, z), true);
  solid.col(-8, -7, BALCONY + 1, BALCONY + 2);
  solid.col(-8, -4, BALCONY + 1, BALCONY + 2);
  // the gate: a flap at the gangway's foot, with posts on both sides
  for (const x of [-10, -9]) gate.col(x, 4, 0, 2);
  for (const x of [-11, -8]) solid.col(x, 4, 0, 2);

  // ── look ──
  // the hull: a lens, the deck on top at y 9
  const prof: [number, number][] = [[0, 4.3], [2.4, 4.3], [3.1, 4.9], [5.6, 6.3], [8.4, 7.4], [9.1, 7.9], [9.2, 8.4], [9.0, 8.85], [8.7, 9.0], [4.6, 9.0]];
  b.geo(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40), [SX, 0, SZ], ALIEN_CREAM);
  b.geo(new THREE.TorusGeometry(9.15, 0.32, 8, 48).rotateX(HP), [SX, 8.15, SZ], LILAC);
  b.geo(new THREE.TorusGeometry(6.0, 0.14, 6, 40).rotateX(HP), [SX, 6.55, SZ], LILAC_D);
  // deck rings and studs
  for (const [r0, r1, c] of [[5.0, 5.35, LILAC], [7.7, 8.0, LILAC], [6.3, 6.42, MINT_D]] as const) {
    b.geo(new THREE.RingGeometry(r0, r1, 40).rotateX(-HP), [SX, 9.02, SZ], c);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    b.cyl(0.16, 0.08, [SX + Math.cos(a) * 8.35, 9.04, SZ + Math.sin(a) * 8.35], LILAC_D, { seg: 8 });
  }
  // the dome: mint glass with lilac ribs, a cap, the mast
  b.glowGeo('dome', MINT_L, new THREE.SphereGeometry(4.75, 28, 10, 0, TAU, 0, HP), [SX, 9.0, SZ], { s: [1, 0.95, 1] });
  b.cyl(5.0, 0.4, [SX, 9.2, SZ], LILAC, { seg: 32 });
  for (let i = 0; i < 4; i++) {
    b.geo(new THREE.TorusGeometry(4.8, 0.12, 6, 20, Math.PI), [SX, 9.0, SZ], LILAC_D, { rot: [0, (i * Math.PI) / 4, 0], s: [1, 0.95, 1] });
  }
  b.cyl(1.3, 0.55, [SX, 13.65, SZ], LILAC_D, { seg: 18 });
  b.cyl(0.9, 0.4, [SX, 14.1, SZ], ALIEN_CREAM, { seg: 16 });
  b.beam([SX, 14.2, SZ], [SX, 19.6, SZ], 0.2, LILAC);
  for (const y of [16.0, 17.6]) b.cyl(0.32, 0.18, [SX, y, SZ], ALIEN_CREAM, { seg: 10 });
  b.glowBall('tip', MINT_L, 0.42, [SX, 19.95, SZ]);
  // the rim lamps (dark lilac when besieged; halos chase round when free)
  const RIMN = 28;
  const rimAt: V3[] = [];
  for (let i = 0; i < RIMN; i++) {
    const a = (i / RIMN) * TAU;
    const p: V3 = [SX + Math.cos(a) * 9.42, 8.15, SZ + Math.sin(a) * 9.42];
    rimAt.push(p);
    b.glowBall('rim', MINT_L, 0.17, p);
  }
  // the engine ring under the belly
  b.glowGeo('engine', MINT_L, new THREE.TorusGeometry(2.0, 0.22, 6, 28).rotateX(HP), [SX, 4.25, SZ]);
  b.glowGeo('engine', MINT_L, new THREE.CircleGeometry(1.5, 20).rotateX(HP), [SX, 4.27, SZ]);
  // the round rail on the deck, open where the bridge comes in
  const RR = 7.6;
  const posts: V3[] = [];
  const N = 26;
  const a0 = -Math.PI + 0.13;
  const a1 = Math.PI - 0.26;
  for (let i = 0; i < N; i++) {
    const a = a0 + ((a1 - a0) * i) / (N - 1);
    posts.push([SX + Math.cos(a) * RR, 9, SZ + Math.sin(a) * RR]);
  }
  posts.forEach((p, i) => {
    b.box([0.14, 1.25, 0.14], [p[0], 9.62, p[2]], LILAC_D);
    if (i < N - 1) {
      const q = posts[i + 1];
      b.beam([p[0], 10.2, p[2]], [q[0], 10.2, q[2]], 0.13, MINT_D);
      b.beam([p[0], 9.65, p[2]], [q[0], 9.65, q[2]], 0.08, LILAC);
    }
  });
  // legs with knees and foot pads
  for (const [x, z] of legs) {
    b.cyl(0.42, 6.4, [x, 3.3, z], LILAC_D, { seg: 12 });
    b.cyl(0.9, 0.3, [x, 0.15, z], LILAC, { seg: 14 });
    b.ball(0.58, [x, 3.0, z], ALIEN_CREAM, { seg: 12 });
    b.cyl(0.62, 0.3, [x, 6.2, z], ALIEN_CREAM, { seg: 12 });
  }
  // a scorched crater under it
  b.cyl(8.4, 0.05, [SX, 0.03, SZ], '#c9a46a', { seg: 40 });
  b.cyl(5.2, 0.05, [SX, 0.06, SZ], '#a98b5e', { seg: 32 });
  // the gangway: cream steps with lilac plates and mint noses, side walls with round lamps
  for (const t of treads) {
    b.box([1, t.k + 1, 1], [t.x, (t.k + 1) / 2, t.z], ALIEN_CREAM);
    b.box([1.0, 0.1, 1.0], [t.x, t.k + 1.0, t.z], t.k % 2 ? LILAC : '#c8b5e4');
  }
  for (let k = 0; k <= BALCONY; k++) b.box([2.0, 0.08, 0.12], [-9.5, k + 1.02, 3 - k + 0.45], MINT_D);
  b.box([1, 0.5, 2], [-8, BALCONY + 0.75, -5.5], ALIEN_CREAM);
  b.box([1.0, 0.1, 2.0], [-8, BALCONY + 1.0, -5.5], LILAC);
  b.beam([-8, BALCONY + 0.5, -5.5], [-6.6, 7.4, -5.5], 0.3, LILAC_D);
  const wallTop = new Map<string, { x: number; z: number; y: number }>();
  for (const r of stairRails) {
    const w = wallTop.get(k2(r.x, r.z));
    if (!w || w.y < r.y) wallTop.set(k2(r.x, r.z), { x: r.x, z: r.z, y: r.y });
  }
  for (const w of wallTop.values()) {
    b.box([1, w.y, 1], [w.x, w.y / 2, w.z], ALIEN_CREAM);
    b.box([1.02, 0.18, 1.02], [w.x, w.y * 0.5, w.z], LILAC);
    if ((w.z & 1) === 0 && w.y > 2) b.lens('win', '#c8ffe6', 0.16, 0.06, [w.x + (w.x < -9 ? -0.5 : 0.5), w.y * 0.5 + 0.55, w.z], [w.x < -9 ? -1 : 1, 0, 0]);
  }
  railPanels(b, stairRails, { post: LILAC_D, rail: MINT_D });
  railPanels(
    b,
    [
      { x: -8, z: -7, dx: 0, dz: 1, y: BALCONY + 1 },
      { x: -8, z: -4, dx: 0, dz: -1, y: BALCONY + 1 },
    ],
    { post: LILAC_D, rail: MINT_D },
  );
  // the gate frame: two pillars, a lintel with a lamp
  for (const x of [-11, -8]) b.box([0.9, 3.6, 0.9], [x, 1.8, 4], LILAC_D);
  b.box([4.0, 0.45, 0.9], [-9.5, 3.55, 4], LILAC);
  b.lens('win', '#c8ffe6', 0.22, 0.08, [-9.5, 3.55, 4.45], [0, 0, 1]);
  const flap = new THREE.Group();
  flap.position.set(-9.5, 0.05, 4.42);
  b.root.add(flap);
  const fp = b.part('flap', flap);
  fp.box([1.96, 2.9, 0.16], [0, 1.45, -0.08], ALIEN_CREAM);
  for (const y of [0.6, 1.4, 2.2]) fp.box([1.96, 0.1, 0.22], [0, y, -0.08], LILAC);
  fp.box([0.5, 0.14, 0.24], [0, 2.6, -0.04], MINT_D);

  const flags = new Flags(
    b,
    [
      { x: SX, z: SZ - 7.7, y0: 9, y1: 11.6, yaw: 0.2 },
      { x: SX - 5.6, z: SZ - 5.0, y0: 9, y1: 11.6, yaw: 0.9 },
      { x: SX + 5.6, z: SZ - 5.0, y0: 9, y1: 11.6, yaw: -0.6 },
    ],
    MINT_L,
    LILAC,
    LILAC_D,
  );
  // the spinning ring round the mast
  const spin = new THREE.Group();
  spin.position.set(SX, 15.4, SZ);
  b.root.add(spin);
  const spinMesh = new THREE.Mesh(
    mergeCached('castle-aliens/spin', [
      tint(new THREE.TorusGeometry(1.7, 0.1, 6, 28).rotateX(HP), LILAC),
      ...[0, 1, 2].map((i) => tint(place(new THREE.SphereGeometry(0.22, 10, 6), [Math.cos((i * TAU) / 3) * 1.7, 0, Math.sin((i * TAU) / 3) * 1.7]), MINT_D)),
    ], true),
    b.kit.vertexColourMaterial(false),
  );
  spinMesh.castShadow = true;
  spin.add(spinMesh);
  const socket: V3 = [SX + 4, 1.3, SZ + 4.95];
  bulbAt(b, [SX + 4, 1.3, SZ + 4.45], [0, 0, 1]);
  const m = b.finish();
  // chasing halos round the rim
  const rimMat = glowMaterial(0xffffff);
  const rimGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const rim = fx(new THREE.InstancedMesh(rimGeo, rimMat, RIMN));
  rim.frustumCulled = false;
  const mq = new THREE.Matrix4();
  rimAt.forEach((p, i) => {
    rim.setMatrixAt(i, mq.makeTranslation(...p));
    rim.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  b.root.add(rim);
  const domeHalo = halo(0xa8ffd8, 5.4, [SX, 10.5, SZ]);
  const tipHalo = halo(0xa8ffd8, 0.9, [SX, 19.95, SZ]);
  const underGlow = pool(0xa8ffd8, 4.0, [SX, 0.08, SZ]);
  const gatePool = pool(RACE_POOL.aliens, 2.4, [-9.5, 0.06, 5.6]);
  b.root.add(domeHalo.mesh, tipHalo.mesh, underGlow.mesh, gatePool.mesh);
  const rc = new THREE.Color();
  const bulb = bulbUpdate(m.bulb);
  let t = 0;
  return finishCastle(b, solid, gate, {
    chest: { x: SX, y: BALCONY + 1, z: SZ + 6, yaw: 0 },
    top: [SX - 3, BALCONY + 1, SZ + 5],
    socket,
    own: [rimGeo],
    update(dt, k) {
      t += dt;
      const a = k.alive;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
      lightUp(m.win, C_ALIEN, a, k.night);
      lightUp(m.dome, C_MINT, a, k.night, 0.15 * pulse + 0.2 * k.beat - 0.25);
      lightUp(m.engine, C_MINT, a, k.night, 0.3 * pulse);
      lightUp(m.tip, C_MINT, a, k.night, 0.4 * pulse);
      lightUp(m.rim, C_MINT, a, k.night, -0.2);
      domeHalo.mat.opacity = a * (0.04 + 0.12 * k.night) * (0.85 + 0.15 * pulse);
      domeHalo.mesh.visible = domeHalo.mat.opacity > 0.01;
      tipHalo.mat.opacity = a * (0.15 + 0.3 * k.night) * pulse;
      tipHalo.mesh.visible = tipHalo.mat.opacity > 0.01;
      underGlow.mat.opacity = a * (0.25 + 0.35 * k.night) * (0.8 + 0.2 * pulse);
      underGlow.mesh.visible = underGlow.mat.opacity > 0.02;
      gatePool.mat.opacity = a * 0.5 * k.night;
      gatePool.mesh.visible = gatePool.mat.opacity > 0.02;
      rim.visible = a > 0.02;
      if (rim.visible) {
        rimMat.opacity = 1;
        for (let i = 0; i < RIMN; i++) {
          const f = Math.max(0, Math.sin(t * 5 - (i * TAU * 3) / RIMN));
          const v = a * (0.12 + 0.5 * f * f) * (0.6 + 0.6 * k.night);
          rim.setColorAt(i, rc.setRGB(0.55 * v, 1.0 * v, 0.85 * v));
        }
        if (rim.instanceColor) rim.instanceColor.needsUpdate = true;
      }
      spin.rotation.y += dt * 1.2 * a;
      spin.rotation.z = 0.12 * Math.sin(t * 0.8) * a;
      flap.rotation.x = k.open * HP * 0.98;
      flags.update(dt, a, k.beat);
      bulb(t, k.on, k.low);
    },
  });
}

// ─── the elves' firefly seed ────────────────────────────────────────────────

/** A glowing seed with two leaf wings and sparks round it; bobs and turns, with a faint sparkle column. */
function fireflySeed(skin: Skin): VillagePiece {
  const root = new THREE.Group();
  root.name = 'elves-castle-item';
  const hex = '#ffe27a';
  const spin = new Build(skin, 'elves-seed-spin');
  spin.glowGeo('body', hex, new THREE.SphereGeometry(0.17, 14, 10), [0, -0.02, 0], { s: [1, 1.35, 1] });
  spin.glowGeo('body', hex, new THREE.ConeGeometry(0.1, 0.22, 10), [0, 0.27, 0]);
  spin.box([0.05, 0.12, 0.05], [0, 0.42, 0], BARK_D);
  for (const sx of [-1, 1]) {
    spin.box([0.34, 0.05, 0.18], [sx * 0.24, 0.1, -0.02], LEAF2, [0.2, 0, sx * 0.55]);
    spin.box([0.2, 0.06, 0.1], [sx * 0.36, 0.2, -0.02], LEAF, [0.2, 0, sx * 0.7]);
  }
  spin.cyl(0.18, 0.05, [0, -0.25, 0], '#c98a2a', { seg: 12 });
  const m = spin.finish();
  const spinG = spin.root;
  spinG.position.y = 0.8;
  root.add(spinG);
  // three sparks circling it
  const orbit = new THREE.Group();
  orbit.position.y = 0.8;
  root.add(orbit);
  const sparkMat = glowMaterial(0xfff2a0);
  const sparkGeo = mergeCached('elves-seed/sparks', [0, 1, 2].map((i) => place(new THREE.SphereGeometry(0.05, 6, 4), [Math.cos((i * TAU) / 3) * 0.42, (i - 1) * 0.12, Math.sin((i * TAU) / 3) * 0.42])));
  orbit.add(fx(new THREE.Mesh(sparkGeo, sparkMat)));
  // the sparkle column and a little pool
  const H = 6;
  const col = (rot: number): THREE.BufferGeometry => {
    const g = new THREE.PlaneGeometry(0.7, H, 2, 10);
    const pos = g.getAttribute('position');
    const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.4);
    const a = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const edge = 1 - Math.abs(pos.getX(i)) / 0.35;
      const up = 1 - (pos.getY(i) + H / 2) / H;
      const f = Math.max(0, edge) * Math.pow(up, 1.3);
      a[i * 3] = c.r * f;
      a[i * 3 + 1] = c.g * f;
      a[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.translate(0, H / 2, 0).rotateY(rot);
    return g;
  };
  const colGeo = mergeCached('elves-seed/column', [col(0), col(HP)]);
  const colMat = glowMaterial(0xffffff, true);
  const column = fx(new THREE.Mesh(colGeo, colMat));
  column.position.y = 0.1;
  root.add(column);
  const pl = pool(0xffe27a, 0.9, [0, 0.05, 0]);
  pl.mesh.visible = true;
  root.add(pl.mesh);
  const c = new THREE.Color(hex);
  let t = Math.random() * 6;
  finishShadows(root);
  return {
    root,
    update(dt, k) {
      t += dt;
      spinG.rotation.y = t * 1.5;
      spinG.position.y = 0.8 + Math.sin(t * 2.2) * 0.1;
      orbit.rotation.y = -t * 3.2;
      orbit.position.y = spinG.position.y;
      const tw = 0.5 + 0.5 * Math.sin(t * 3.1);
      setGlow(m.body, c, 0.45 + 0.35 * k.night + 0.25 * tw);
      sparkMat.opacity = 0.5 + 0.4 * Math.sin(t * 7);
      colMat.opacity = 0.2 + 0.3 * k.night + 0.06 * tw;
      pl.mat.opacity = 0.45 + 0.3 * k.night;
    },
  };
}
