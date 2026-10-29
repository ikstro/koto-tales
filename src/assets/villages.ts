/**
 * The village pieces (DESIGN.md «Villages»): four races, each with houses, a guest house, a heart (the
 * village's machine and far landmark), an entry arch, a lamp and a collectable. Toy bricks in the
 * skin's plastic, origin = floor centre of the footprint, front towards +Z. Static boxes are merged
 * by the Kit (round parts into one more vertex-coloured mesh); everything that blinks or fades has
 * its own material (`userData.own`). No real lights: glow = emissive plus additive halos and pools.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../contracts';
import type { Race } from '../world/villages';
import { Kit, type PartBuilder, type Paint, type V3 } from './parts/kit';
import {
  CORAL, CORAL_DARK, CREAM, INK, WOOD, WOOD_DARK, MUSTARD, TEAL, MINT, CHARCOAL, STEEL, STEEL_DARK, WARM, TAU,
  C_WARM, C_WARM_SOFT, C_CORAL, C_OFF, ownGlow, setGlow, fadeDisc, glowMaterial,
} from './buildingParts';

// ─── API ────────────────────────────────────────────────────────────────────

export interface VillageTick {
  /** 0 day … 1 deep night. */
  night: number;
  /** Its machine has power (hearts only). */
  on: boolean;
  /** Power is short: blink coral. */
  low: boolean;
  /** Music beats, may be 0. */
  beat: number;
}

export interface VillagePiece {
  root: THREE.Group;
  update(dt: number, k: VillageTick): void;
  /** Hearts: where power wires hang from (model space). */
  socket?: THREE.Vector3;
  /** Guest houses: three lying spots (model space), in order lyosha, solomiia, pupsia; heads towards −Z. */
  spots?: { x: number; y: number; z: number; yaw: number }[];
  /** Houses: the door's foot point (model space) — villagers walk in there to hide. */
  door?: THREE.Vector3;
}

// ─── palettes ───────────────────────────────────────────────────────────────

const LEAF = '#5aa83e';
const LEAF2 = '#79c24a';
const LEAF_D = '#3f8a3a';
const BARK = '#8a5a2b';
const BARK_D = '#6a4220';
const WOODL = '#cf9d5e';
const WOODL_D = '#b07f44';
const PINK = '#ee6a82';

const STONE = '#aaa59b';
const STONE_D = '#86827a';
const STONE_L = '#c8c2b5';
const BRICK = '#cc6c46';
const BRICK_D = '#a85237';
const IRON = '#4a4644';

const STEEL_D = STEEL_DARK;
const TEAL_D = '#236e6a';
const GLASS = '#bfe6e2';

const ALIEN_CREAM = '#f3ead4';
const LILAC = '#b9a2db';
const LILAC_D = '#8b75b9';
const MINT_L = '#9fe3cc';
const MINT_D = '#4fae9f';

const C_ELF = new THREE.Color('#ffd98a');
const C_GNOME = new THREE.Color('#ffc064');
const C_ROBOT = new THREE.Color('#ffe08a');
const C_ALIEN = new THREE.Color('#c8ffe6');

// ─── geometry helpers ───────────────────────────────────────────────────────

const UPV = new THREE.Vector3(0, 1, 0);
const HP = Math.PI / 2;

interface Opt {
  rot?: V3;
  s?: V3 | number;
  q?: THREE.Quaternion;
}

function place(g: THREE.BufferGeometry, at: V3, o: Opt = {}): THREE.BufferGeometry {
  const s: V3 = typeof o.s === 'number' ? [o.s, o.s, o.s] : (o.s ?? [1, 1, 1]);
  const q = o.q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(...s)));
  return g;
}

function tint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** The quaternion that turns a cylinder's axis (Y) to look along n. */
function along(nx: number, ny: number, nz: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(UPV, new THREE.Vector3(nx, ny, nz).normalize());
}

const merged = new Map<string, THREE.BufferGeometry>();
function mergeCached(key: string, geos: THREE.BufferGeometry[], faceted = false): THREE.BufferGeometry {
  let g = merged.get(key);
  if (!g) {
    const flat = geos.map((x) => {
      const n = x.index ? x.toNonIndexed() : x;
      if (faceted) n.computeVertexNormals();
      return n;
    });
    g = mergeGeometries(flat, false)!;
    g.computeBoundingSphere();
    merged.set(key, g);
  }
  geos.forEach((d) => d.dispose());
  return g;
}

/** Marks a mesh as an effect (additive glow, never lit by or casting shadows). */
function fx<T extends THREE.Object3D>(o: T): T {
  o.userData.fx = true;
  return o;
}

function finishShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const effect = !!o.userData.fx;
      o.receiveShadow = !effect;
      if (effect) o.castShadow = false;
    }
  });
}

/** A point on an ellipsoid dome (centre height cy) at azimuth az (0 = +Z) and elevation el, with its outward normal. */
function domePt(rx: number, ry: number, rz: number, cy: number, az: number, el: number): { p: V3; n: V3 } {
  const x = rx * Math.cos(el) * Math.sin(az);
  const z = rz * Math.cos(el) * Math.cos(az);
  const y = cy + ry * Math.sin(el);
  return { p: [x, y, z], n: [x / (rx * rx), (y - cy) / (ry * ry), z / (rz * rz)] };
}

interface GlowDef {
  hex: string;
  geos: THREE.BufferGeometry[];
}

/** One piece under construction: Kit boxes + tinted round parts (one mesh) + glow groups (one own-material mesh each). */
class Build {
  readonly root = new THREE.Group();
  readonly kit: Kit;
  readonly p: PartBuilder;
  private round: THREE.BufferGeometry[] = [];
  private glows = new Map<string, GlowDef>();
  private subs: PartBuilder[] = [];

  constructor(
    readonly skin: Skin,
    readonly id: string,
  ) {
    this.root.name = id;
    this.kit = new Kit(id, skin);
    this.p = this.kit.part('main', this.root);
  }

  box(size: V3, at: V3, paint: Paint, rot?: V3): this {
    this.p.box(size, at, paint, rot);
    return this;
  }

  beam(a: V3, b: V3, t: number, paint: Paint, tz = t): this {
    this.p.beam(a, b, t, paint, tz);
    return this;
  }

  /** An extra Kit part on another object (it animates on its own). */
  part(name: string, obj: THREE.Object3D): PartBuilder {
    const pb = this.kit.part(name, obj);
    this.subs.push(pb);
    return pb;
  }

  /** Any geometry, tinted. */
  geo(g: THREE.BufferGeometry, at: V3, hex: string, o?: Opt): this {
    this.round.push(tint(place(g, at, o), hex));
    return this;
  }

  /** A cylinder along Y (r1 = top radius if different). */
  cyl(r: number, h: number, at: V3, hex: string, o?: Opt & { r1?: number; seg?: number }): this {
    return this.geo(new THREE.CylinderGeometry(o?.r1 ?? r, r, h, o?.seg ?? 18), at, hex, o);
  }

  /** A disc plate with its back at `pos`, looking along n (a porthole ring, a spot, a door). */
  disc(r: number, t: number, pos: V3, n: V3, hex: string, squash = 1): this {
    const q = along(...n);
    const c: V3 = [pos[0] + (n[0] * t) / 2, pos[1] + (n[1] * t) / 2, pos[2] + (n[2] * t) / 2];
    return this.geo(new THREE.CylinderGeometry(r, r, t, 16), c, hex, { q, s: [1, 1, squash] });
  }

  /** A sphere (top: only the upper half, open below). */
  ball(r: number, at: V3, hex: string, o?: Opt & { top?: boolean; seg?: number }): this {
    const seg = Math.min(o?.seg ?? 16, 18);
    const g = o?.top ? new THREE.SphereGeometry(r, seg, 6, 0, TAU, 0, HP) : new THREE.SphereGeometry(r, seg, 8);
    return this.geo(g, at, hex, o);
  }

  glowGeo(name: string, hex: string, g: THREE.BufferGeometry, at: V3, o?: Opt): this {
    let d = this.glows.get(name);
    if (!d) this.glows.set(name, (d = { hex, geos: [] }));
    d.geos.push(place(g, at, o));
    return this;
  }

  glowBox(name: string, hex: string, size: V3, at: V3, rot?: V3): this {
    return this.glowGeo(name, hex, new THREE.BoxGeometry(...size), at, { rot });
  }

  glowBall(name: string, hex: string, r: number, at: V3, o?: Opt): this {
    return this.glowGeo(name, hex, new THREE.SphereGeometry(r, 14, 10), at, o);
  }

  /** A glowing lens with its back at `pos`, looking along n. */
  lens(name: string, hex: string, r: number, t: number, pos: V3, n: V3, squash = 1): this {
    const q = along(...n);
    const c: V3 = [pos[0] + (n[0] * t) / 2, pos[1] + (n[1] * t) / 2, pos[2] + (n[2] * t) / 2];
    return this.glowGeo(name, hex, new THREE.CylinderGeometry(r, r, t, 22), c, { q, s: [1, 1, squash] });
  }

  /** Builds the meshes; returns the own glow materials by name. */
  finish(): Record<string, THREE.MeshStandardMaterial> {
    this.p.done();
    for (const s of this.subs) s.done();
    if (this.round.length) {
      const m = new THREE.Mesh(mergeCached(`${this.id}/round`, this.round, true), this.kit.vertexColourMaterial(false));
      m.name = 'round';
      m.castShadow = true;
      this.root.add(m);
      this.round = [];
    }
    const mats: Record<string, THREE.MeshStandardMaterial> = {};
    for (const [name, d] of this.glows) {
      const mat = ownGlow(this.skin, d.hex);
      const m = new THREE.Mesh(mergeCached(`${this.id}/glow/${name}`, d.geos), mat);
      m.name = `glow_${name}`;
      this.root.add(fx(m));
      m.castShadow = false;
      mats[name] = mat;
    }
    this.glows.clear();
    return mats;
  }
}

/** A box-built octagon with an offset (four boxes, the toy way). */
function oct(b: Build, s: number, h: number, y0: number, paint: Paint, x = 0, z = 0): void {
  const t = s * 0.4142;
  const y = y0 + h / 2;
  b.box([s, h, t], [x, y, z], paint);
  b.box([t, h, s], [x, y, z], paint);
  b.box([s, h, t], [x, y, z], paint, [0, Math.PI / 4, 0]);
  b.box([s, h, t], [x, y, z], paint, [0, -Math.PI / 4, 0]);
}

/** A flat soft pool of additive light on the ground. */
function pool(hex: number, radius: number, at: V3): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const mat = glowMaterial(hex, true);
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  const mesh = fx(new THREE.Mesh(fadeDisc(radius), mat));
  mesh.position.set(...at);
  mesh.visible = false;
  return { mesh, mat };
}

/** A soft additive ball of light. */
function halo(hex: number, radius: number, at: V3): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const mat = glowMaterial(hex);
  const mesh = fx(new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), mat));
  mesh.position.set(...at);
  mesh.visible = false;
  return { mesh, mat };
}

/** Calls fn only when `night` moved by a twentieth. */
function nightWatch(fn: (night: number) => void): (night: number) => void {
  let last = -1;
  return (night) => {
    const q = Math.round(night * 20);
    if (q === last) return;
    last = q;
    fn(night);
  };
}

const lerpColour = (a: THREE.Color, b: THREE.Color, k: number, out: THREE.Color): THREE.Color => out.copy(a).lerp(b, k);

/** Windows and lanterns: lit a little by day, bright at night. */
function warmUp(mat: THREE.MeshStandardMaterial | undefined, c: THREE.Color, night: number, day?: THREE.Color): void {
  if (!mat) return;
  if (day) setGlow(mat, lerpColour(day, c, Math.min(1, night * 1.6), new THREE.Color()), 0.2 + 0.95 * night);
  else setGlow(mat, c, 0.25 + 0.95 * night);
}
const GLASS_DAY_ROBOT = new THREE.Color('#a9d8d8');
const GLASS_DAY_ALIEN = new THREE.Color('#b9ecd9');

const RACE_GLOW: Record<Race, THREE.Color> = { elves: C_ELF, gnomes: C_GNOME, robots: C_ROBOT, aliens: C_ALIEN };
const RACE_GLOW_HEX: Record<Race, string> = { elves: '#ffd98a', gnomes: '#ffc064', robots: '#ffe08a', aliens: '#c8ffe6' };
const RACE_POOL: Record<Race, number> = { elves: 0xffc866, gnomes: 0xffa850, robots: 0xffd070, aliens: 0xa8ffd8 };

function piece(b: Build, update: VillagePiece['update'], extra: Partial<VillagePiece> = {}): VillagePiece {
  finishShadows(b.root);
  return { root: b.root, update, ...extra };
}

const DOOR_FOOT = (): THREE.Vector3 => new THREE.Vector3(0, 0, 2.0);

// ─── houses ─────────────────────────────────────────────────────────────────

export function createVillageHouse(skin: Skin, race: Race, variant: 0 | 1): VillagePiece {
  switch (race) {
    case 'elves':
      return elfHouse(skin, variant);
    case 'gnomes':
      return gnomeHouse(skin, variant);
    case 'robots':
      return robotHouse(skin, variant);
    default:
      return alienHouse(skin, variant);
  }
}

/** Round cabin on a thick stump, layered leaf roof, warm round windows. */
function elfHouse(skin: Skin, v: 0 | 1): VillagePiece {
  const b = new Build(skin, `elf-house${v}`);
  const tall = v === 1;
  oct(b, 3.7, 0.7, 0, BARK_D);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 1.45, 0.55, sz * 1.45], [sx * 1.88, 0.05, sz * 1.88], 0.36, BARK_D);
  const ch = tall ? 1.7 : 1.9;
  oct(b, 3.3, ch, 0.7, WOODL);
  oct(b, 3.4, 0.1, 0.7 + ch * 0.48, WOODL_D);
  oct(b, 3.4, 0.1, 0.7 + ch - 0.1, WOODL_D);
  // the round-topped door
  b.box([1.2, 1.5, 0.08], [0, 0.75, 1.85], CREAM);
  b.box([0.95, 1.2, 0.14], [0, 0.6, 1.9], BARK_D);
  b.box([0.7, 0.2, 0.14], [0, 1.3, 1.9], BARK_D);
  b.box([0.4, 0.18, 0.14], [0, 1.48, 1.9], BARK_D);
  b.box([0.1, 0.1, 0.06], [0.28, 0.7, 1.99], MUSTARD);
  // plank lines on the door
  for (const x of [-0.24, 0, 0.24]) b.box([0.04, 1.1, 0.02], [x, 0.58, 1.98], BARK);

  const wy = 0.7 + ch * 0.58;
  const k = Math.SQRT1_2;
  const spots: [number, number][] = [[-k, k], [k, k], [-1, 0], [1, 0]];
  for (const [nx, nz] of spots) {
    const d = 1.65;
    b.disc(0.46, 0.1, [nx * d, wy, nz * d], [nx, 0, nz], BARK_D);
    b.lens('win', RACE_GLOW_HEX.elves, 0.32, 0.12, [nx * (d + 0.04), wy, nz * (d + 0.04)], [nx, 0, nz]);
    // window cross
    b.disc(0.05, 0.14, [nx * (d + 0.08), wy, nz * (d + 0.08)], [nx, 0, nz], BARK_D, 1);
  }
  // a hanging lantern at the door
  b.box([0.06, 0.45, 0.06], [-1.0, 1.98, 1.95], BARK);
  b.glowBox('win', RACE_GLOW_HEX.elves, [0.22, 0.28, 0.22], [-1.0, 1.55, 1.95]);

  const y0 = 0.7 + ch;
  const step = tall ? 0.4 : 0.4;
  octagonRoof(b, y0, 3.9, tall ? 2 : 4, step);
  let top = y0 + (tall ? 0.8 : 1.65);
  if (tall) {
    const uy = y0 + 0.75;
    oct(b, 2.1, 1.1, uy, WOODL);
    oct(b, 2.2, 0.1, uy + 0.5, WOODL_D);
    for (const [nx, nz] of [[0, 1], [-1, 0], [1, 0]] as const) {
      b.disc(0.36, 0.1, [nx * 1.05, uy + 0.6, nz * 1.05], [nx, 0, nz], BARK_D);
      b.lens('win', RACE_GLOW_HEX.elves, 0.25, 0.12, [nx * 1.09, uy + 0.6, nz * 1.09], [nx, 0, nz]);
    }
    const ry = uy + 1.1;
    oct(b, 2.9, 0.4, ry, LEAF);
    oct(b, 2.0, 0.4, ry + 0.38, LEAF2);
    oct(b, 1.1, 0.4, ry + 0.76, LEAF);
    top = ry + 1.2;
  }
  b.box([0.14, 0.4, 0.14], [0, top + 0.1, 0], BARK);
  b.ball(0.2, [0, top + 0.38, 0], PINK, { seg: 12 });
  // flowers on the lowest leaves
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    b.box([0.16, 0.16, 0.16], [Math.cos(a) * 1.82, y0 + 0.5, Math.sin(a) * 1.82], i % 2 ? PINK : CORAL);
  }
  const m = b.finish();
  const p = pool(RACE_POOL.elves, 1.9, [0, 0.05, 2.5]);
  b.root.add(p.mesh);
  const w = nightWatch((n) => {
    warmUp(m.win, C_ELF, n);
    p.mat.opacity = 0.55 * n;
    p.mesh.visible = n > 0.05;
  });
  return piece(b, (_dt, k2) => w(k2.night), { door: DOOR_FOOT() });
}

/** Layered octagon roof tiers from y0, base across-flats s, shrinking. */
function octagonRoof(b: Build, y0: number, s: number, tiers: number, step: number): void {
  const shrink = (s - 1.0) / Math.max(1, tiers - 1 || 1);
  for (let i = 0; i < tiers; i++) oct(b, tiers === 1 ? s : s - i * Math.min(shrink, 0.9), 0.45, y0 + i * step, i % 2 ? LEAF2 : LEAF);
}

/** Stone cottage, big coral mushroom cap with cream spots, round door, little chimney. */
function gnomeHouse(skin: Skin, v: 0 | 1): VillagePiece {
  const b = new Build(skin, `gnome-house${v}`);
  const tall = v === 1;
  const wh = tall ? 2.7 : 2.2;
  const wx = tall ? 3.1 : 3.5;
  const wz = tall ? 3.0 : 3.3;
  b.box([wx + 0.3, 0.3, wz + 0.3], [0, 0.15, 0], STONE_D);
  b.box([wx, wh, wz], [0, wh / 2, 0], STONE);
  for (const y of [0.75, 1.4, 2.05].filter((y) => y < wh - 0.1)) b.box([wx + 0.06, 0.08, wz + 0.06], [0, y, 0], STONE_D);
  // stones standing out of the walls
  const zf = wz / 2;
  for (const [x, y, w] of [[-1.2, 1.1, 0.55], [1.25, 0.55, 0.5], [0.9, 1.7, 0.45], [-1.35, 0.5, 0.4]] as const) {
    if (Math.abs(x) < wx / 2 - 0.2) b.box([w, 0.3, 0.06], [x, y, zf + 0.02], STONE_L);
  }
  b.box([0.06, 0.3, 0.5], [wx / 2 + 0.02, 1.0, -0.5], STONE_L);
  b.box([0.06, 0.3, 0.5], [-wx / 2 - 0.02, 1.4, 0.6], STONE_L);

  // the round wooden door
  b.disc(0.78, 0.1, [0, 0.62, zf], [0, 0, 1], STONE_L);
  b.geo(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 24), [0, 0.62, zf + 0.12], WOOD, { rot: [HP, 0, 0] });
  for (const x of [-0.3, 0, 0.3]) b.box([0.04, 1.1, 0.03], [x, 0.62, zf + 0.2], WOOD_DARK);
  b.box([0.7, 0.05, 0.03], [0, 0.62, zf + 0.2], IRON);
  b.geo(new THREE.TorusGeometry(0.08, 0.02, 6, 12), [0.32, 0.62, zf + 0.23], IRON);
  b.box([1.5, 0.14, 0.6], [0, 0.07, zf + 0.5], STONE_L);

  // windows
  const wy = tall ? 1.7 : 1.4;
  for (const sx of [-1, 1]) {
    b.disc(0.38, 0.08, [sx * (wx / 2 - 0.55), wy, zf], [0, 0, 1], WOOD);
    b.lens('win', RACE_GLOW_HEX.gnomes, 0.27, 0.1, [sx * (wx / 2 - 0.55), wy, zf + 0.06], [0, 0, 1]);
    b.box([0.55, 0.06, 0.04], [sx * (wx / 2 - 0.55), wy, zf + 0.15], WOOD);
    b.disc(0.36, 0.08, [sx * wx / 2, wy, -0.2], [sx, 0, 0], WOOD);
    b.lens('win', RACE_GLOW_HEX.gnomes, 0.25, 0.1, [sx * (wx / 2 + 0.06), wy, -0.2], [sx, 0, 0]);
  }
  if (tall) {
    b.cyl(0.42, 0.9, [-1.45, 0.45, zf + 0.5], WOOD, { seg: 12 });
    b.cyl(0.44, 0.07, [-1.45, 0.25, zf + 0.5], IRON, { seg: 12 });
    b.cyl(0.44, 0.07, [-1.45, 0.65, zf + 0.5], IRON, { seg: 12 });
  }

  // the mushroom cap
  const cy = wh - 0.05;
  const rx = tall ? 2.15 : 2.25;
  const rz = tall ? 2.1 : 2.15;
  const ry = tall ? 1.5 : 1.35;
  b.ball(1, [0, cy, 0], CORAL, { top: true, s: [rx, ry, rz], seg: 28 });
  b.geo(new THREE.CylinderGeometry(1, 1, 0.12, 18), [0, cy - 0.04, 0], '#f4d9a0', { s: [rx - 0.06, 1, rz - 0.06] });
  b.geo(new THREE.CylinderGeometry(1, 1, 0.1, 18), [0, cy + 0.02, 0], CORAL_DARK, { s: [rx + 0.0, 1, rz + 0.0] });
  const spotsAt: [number, number, number][] = tall
    ? [[0.2, 0.95, 0.42], [-0.9, 0.6, 0.3], [0.75, 0.7, 0.34], [2.3, 0.45, 0.28], [-2.2, 0.35, 0.3], [3.3, 0.4, 0.32], [-0.2, 0.15, 0.3]]
    : [[0.0, 1.1, 0.45], [-0.8, 0.7, 0.34], [0.9, 0.6, 0.4], [2.3, 0.45, 0.3], [-2.4, 0.4, 0.34], [3.5, 0.5, 0.3], [-1.6, 0.25, 0.3]];
  for (const [az, el, r] of spotsAt) {
    const pt = domePt(rx, ry, rz, cy, az, el);
    const nn = new THREE.Vector3(...pt.n).normalize();
    b.geo(new THREE.CylinderGeometry(r, r, 0.14, 14), [pt.p[0] - nn.x * 0.02, pt.p[1] - nn.y * 0.02, pt.p[2] - nn.z * 0.02], CREAM, { q: along(nn.x, nn.y, nn.z) });
  }
  if (tall) {
    // a small round attic window under the cap
    b.disc(0.3, 0.08, [0, wh - 0.55, zf], [0, 0, 1], WOOD);
    b.lens('win', RACE_GLOW_HEX.gnomes, 0.21, 0.1, [0, wh - 0.55, zf + 0.06], [0, 0, 1]);
  }
  // the chimney
  const cx = tall ? -0.9 : 1.0;
  const cz = tall ? -0.5 : -0.7;
  const chBase = cy + 0.5;
  const chTop = cy + ry * 0.92 + 0.85;
  b.box([0.6, chTop - chBase, 0.6], [cx, (chTop + chBase) / 2, cz], STONE);
  b.box([0.74, 0.14, 0.74], [cx, chTop, cz], STONE_D);
  b.box([0.5, 0.06, 0.5], [cx, chTop + 0.08, cz], IRON);
  for (const y of [chBase + 0.5, chBase + 1.0]) b.box([0.64, 0.06, 0.64], [cx, y, cz], STONE_D);

  const m = b.finish();
  const p = pool(RACE_POOL.gnomes, 1.9, [0, 0.05, 2.6]);
  b.root.add(p.mesh);
  const w = nightWatch((n) => {
    warmUp(m.win, C_GNOME, n);
    p.mat.opacity = 0.55 * n;
    p.mesh.visible = n > 0.05;
  });
  return piece(b, (_dt, k) => w(k.night), { door: DOOR_FOOT() });
}

/** A steel cube with portholes, rivets, a turning gear and little antennas. */
function robotHouse(skin: Skin, v: 0 | 1): VillagePiece {
  const b = new Build(skin, `robot-house${v}`);
  const two = v === 1;
  b.box([3.8, 0.25, 3.8], [0, 0.125, 0], STEEL_D);
  const bh = two ? 1.9 : 2.6;
  const by = 0.25 + bh / 2;
  b.box([3.4, bh, 3.4], [0, by, 0], STEEL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.24, bh, 0.24], [sx * 1.7, by, sz * 1.7], STEEL_D);
  // the teal band, panel seams and rivets
  const bandY = 0.25 + bh - 0.3;
  b.box([3.46, 0.5, 3.46], [0, bandY, 0], TEAL);
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.46;
    b.box([0.08, 0.08, 0.05], [x, bandY + 0.17, 1.72], STEEL_D);
    b.box([0.08, 0.08, 0.05], [x, bandY - 0.17, 1.72], STEEL_D);
    b.box([0.05, 0.08, 0.08], [1.72, bandY + 0.17, x], STEEL_D);
    b.box([0.05, 0.08, 0.08], [-1.72, bandY + 0.17, x], STEEL_D);
  }
  b.box([3.42, 0.05, 3.42], [0, 0.9, 0], STEEL_D);
  // the sliding door
  b.box([1.2, 1.7, 0.1], [0, 1.1, 1.72], STEEL_D);
  b.box([1.0, 1.55, 0.1], [0, 1.03, 1.77], TEAL_D);
  b.box([0.1, 1.55, 0.12], [0, 1.03, 1.8], STEEL_D);
  b.box([1.0, 0.1, 0.12], [0, 1.72, 1.8], MUSTARD);
  b.box([0.1, 0.34, 0.1], [0.38, 1.0, 1.85], MUSTARD);
  // portholes
  const portholes: [number, number, number, number][] = [[-1.2, 1.8, 1, 0], [1.2, 1.8, 1, 0]];
  for (const [x, y] of portholes) {
    b.disc(0.46, 0.12, [x, y, 1.7], [0, 0, 1], STEEL_D);
    b.lens('win', RACE_GLOW_HEX.robots, 0.33, 0.1, [x, y, 1.76], [0, 0, 1]);
    b.disc(0.07, 0.14, [x, y, 1.8], [0, 0, 1], STEEL_D);
  }
  for (const sx of [-1, 1]) {
    b.disc(0.4, 0.12, [sx * 1.7, 1.7, 0.3], [sx, 0, 0], STEEL_D);
    b.lens('win', RACE_GLOW_HEX.robots, 0.28, 0.1, [sx * 1.76, 1.7, 0.3], [sx, 0, 0]);
  }
  // roof, vent, antennas
  const roofY = 0.25 + bh;
  b.box([3.6, 0.2, 3.6], [0, roofY + 0.1, 0], TEAL_D);
  b.box([1.0, 0.25, 0.8], [-0.9, roofY + 0.32, -0.7], STEEL_D);
  for (const x of [-1.15, -0.9, -0.65]) b.box([0.06, 0.06, 0.82], [x, roofY + 0.46, -0.7], CHARCOAL);
  b.beam([1.0, roofY + 0.2, -0.9], [1.0, roofY + 1.5, -0.9], 0.07, STEEL);
  b.box([0.16, 0.16, 0.16], [1.0, roofY + 1.58, -0.9], CORAL);
  b.beam([1.35, roofY + 0.2, -0.4], [1.35, roofY + 0.9, -0.4], 0.06, STEEL);
  b.cyl(0.26, 0.05, [1.35, roofY + 1.02, -0.4], STEEL, { rot: [0.6, 0.4, 0], seg: 14 });
  let topY = roofY;
  if (two) {
    // a second, smaller cube offset to the back-left, with a big porthole and a water tank
    const uh = 1.6;
    const uy = roofY + 0.2 + uh / 2;
    b.box([2.3, uh, 2.3], [-0.5, uy, -0.5], STEEL);
    b.box([2.36, 0.4, 2.36], [-0.5, uy + uh / 2 - 0.25, -0.5], TEAL);
    b.box([2.5, 0.16, 2.5], [-0.5, uy + uh / 2 + 0.08, -0.5], TEAL_D);
    b.disc(0.55, 0.12, [-0.5, uy - 0.1, 0.65], [0, 0, 1], STEEL_D);
    b.lens('win', RACE_GLOW_HEX.robots, 0.42, 0.1, [-0.5, uy - 0.1, 0.71], [0, 0, 1]);
    b.cyl(0.4, 0.8, [-1.0, uy + uh / 2 + 0.56, -0.9], STEEL_D);
    b.cyl(0.43, 0.08, [-1.0, uy + uh / 2 + 0.72, -0.9], TEAL, {});
    b.beam([0.2, uy + uh / 2 + 0.16, -0.9], [0.2, uy + uh / 2 + 1.0, -0.9], 0.06, STEEL);
    b.box([0.14, 0.14, 0.14], [0.2, uy + uh / 2 + 1.06, -0.9], MUSTARD);
    topY = uy + uh / 2;
  }
  // the gear on the wall (it turns slowly)
  const gear = new THREE.Mesh(gearGeo(0.5, 8), b.kit.vertexColourMaterial(false));
  gear.position.set(two ? 1.18 : 1.0, two ? 0.9 : 0.85, 1.72);
  gear.castShadow = true;
  gear.name = 'gear';
  b.root.add(gear);

  const m = b.finish();
  const p = pool(RACE_POOL.robots, 1.9, [0, 0.05, 2.6]);
  b.root.add(p.mesh);
  const w = nightWatch((n) => {
    warmUp(m.win, C_ROBOT, n, GLASS_DAY_ROBOT);
    p.mat.opacity = 0.5 * n;
    p.mesh.visible = n > 0.05;
  });
  void topY;
  return piece(
    b,
    (dt, k) => {
      gear.rotation.z -= dt * 0.35;
      w(k.night);
    },
    { door: DOOR_FOOT() },
  );
}

const gearCache = new Map<string, THREE.BufferGeometry>();
/** A flat gear facing +Z: mustard teeth and rim, a dark hub, in the XY plane. */
function gearGeo(r: number, teeth: number, thick = 0.12): THREE.BufferGeometry {
  const key = `${r}/${teeth}/${thick}`;
  let g = gearCache.get(key);
  if (g) return g;
  const parts: THREE.BufferGeometry[] = [
    tint(new THREE.CylinderGeometry(r, r, thick, 24).rotateX(HP), MUSTARD),
    tint(new THREE.CylinderGeometry(r * 0.36, r * 0.36, thick + 0.04, 16).rotateX(HP), '#6b4a12'),
    tint(new THREE.CylinderGeometry(r * 0.14, r * 0.14, thick + 0.08, 12).rotateX(HP), CHARCOAL),
  ];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    parts.push(tint(place(new THREE.BoxGeometry(r * 0.34, r * 0.4, thick), [Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0, 0], { rot: [0, 0, a + HP] }), MUSTARD));
  }
  g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)))!;
  g.computeBoundingSphere();
  gearCache.set(key, g);
  return g;
}

/** A dome on a ring wall, ring bands, round portholes, a glowing finial. */
function alienHouse(skin: Skin, v: 0 | 1): VillagePiece {
  const b = new Build(skin, `alien-house${v}`);
  const body = v === 0 ? ALIEN_CREAM : LILAC;
  const band = v === 0 ? LILAC : ALIEN_CREAM;
  const R = 1.85;
  b.cyl(1.98, 0.35, [0, 0.175, 0], LILAC_D);
  b.cyl(R, 1.1, [0, 0.9, 0], body);
  const cy = 1.45;
  const ry = R * 1.25;
  b.ball(1, [0, cy, 0], body, { top: true, s: [R, ry, R], seg: 18 });
  // ring bands: a flat disc a hair wider than the dome at that height
  const ringAt = (h: number, thick: number, hex: string): void => {
    const rr = R * Math.sqrt(1 - (h / ry) ** 2) + 0.05;
    b.cyl(rr, thick, [0, cy + h, 0], hex, { seg: 18 });
  };
  b.cyl(R + 0.06, 0.16, [0, 0.4, 0], band, { seg: 18 });
  ringAt(0.0, 0.18, band);
  ringAt(0.95, 0.14, band);
  ringAt(1.7, 0.12, band);
  // finial
  const topY = cy + ry;
  b.cyl(0.1, 0.5, [0, topY + 0.15, 0], LILAC_D);
  b.glowBall('tip', MINT_L, 0.2, [0, topY + 0.5, 0]);
  b.geo(new THREE.TorusGeometry(0.3, 0.04, 6, 18), [0, topY + 0.3, 0], band, { rot: [HP, 0, 0] });
  // the oval door
  b.disc(0.62, 0.1, [0, 0.75, R - 0.1], [0, 0, 1], band, 1);
  b.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 22), [0, 0.7, R + 0.02], MINT_D, { rot: [HP, 0, 0], s: [1, 1, 1.25] });
  b.box([0.5, 0.4, 0.1], [0, 0.35, R + 0.02], MINT_D);
  b.disc(0.07, 0.1, [0.25, 0.7, R + 0.1], [0, 0, 1], band);
  // portholes on the wall and the dome
  const hole = (az: number, el: number, r: number, onWall: boolean): void => {
    let p: V3;
    let n: V3;
    if (onWall) {
      p = [Math.sin(az) * R, 0.95, Math.cos(az) * R];
      n = [Math.sin(az), 0, Math.cos(az)];
    } else {
      const d = domePt(R, ry, R, cy, az, el);
      p = d.p;
      n = d.n;
    }
    const nn = new THREE.Vector3(...n).normalize();
    const back: V3 = [p[0] - nn.x * 0.05, p[1] - nn.y * 0.05, p[2] - nn.z * 0.05];
    b.disc(r + 0.1, 0.12, back, [nn.x, nn.y, nn.z], LILAC_D);
    b.lens('win', RACE_GLOW_HEX.aliens, r, 0.1, [back[0] + nn.x * 0.1, back[1] + nn.y * 0.1, back[2] + nn.z * 0.1], [nn.x, nn.y, nn.z]);
  };
  hole(-0.95, 0, 0.3, true);
  hole(0.95, 0, 0.3, true);
  hole(1.57, 0, 0.28, true);
  hole(-1.57, 0, 0.28, true);
  hole(-0.35, 0.62, 0.3, false);
  hole(0.35, 0.62, 0.3, false);
  if (v === 1) {
    // a small mint annex dome at the back-right
    const ax = 1.15;
    const az = -1.0;
    b.cyl(0.8, 0.8, [ax, 0.4, az], MINT_L);
    b.ball(0.82, [ax, 0.8, az], MINT_L, { top: true, s: [1, 0.9, 1] });
    b.cyl(0.84, 0.1, [ax, 0.8, az], ALIEN_CREAM);
    b.disc(0.2, 0.1, [ax, 0.6, az + 0.78], [0, 0, 1], LILAC_D);
    b.lens('win', RACE_GLOW_HEX.aliens, 0.14, 0.1, [ax, 0.6, az + 0.83], [0, 0, 1]);
  }

  const m = b.finish();
  const p = pool(RACE_POOL.aliens, 1.9, [0, 0.05, 2.6]);
  b.root.add(p.mesh);
  const w = nightWatch((n) => {
    warmUp(m.win, C_ALIEN, n, GLASS_DAY_ALIEN);
    if (m.tip) setGlow(m.tip, new THREE.Color(MINT_L), 0.3 + 0.9 * n);
    p.mat.opacity = 0.5 * n;
    p.mesh.visible = n > 0.05;
  });
  return piece(b, (_dt, k) => w(k.night), { door: DOOR_FOOT() });
}

// ─── guest houses ───────────────────────────────────────────────────────────

const BED_X = [-1.35, 0, 1.35];

function beds(b: Build, frame: string, blanket: string[], pillow: string): { x: number; y: number; z: number; yaw: number }[] {
  const out: { x: number; y: number; z: number; yaw: number }[] = [];
  b.box([5.0, 0.06, 3.0], [0, 0.03, 0], frame === STEEL_D ? STEEL : WOODL_D);
  BED_X.forEach((x, i) => {
    b.box([1.0, 0.28, 1.9], [x, 0.2, 0.05], frame);
    b.box([0.9, 0.16, 1.8], [x, 0.42, 0.05], CREAM);
    b.box([0.92, 0.14, 1.1], [x, 0.54, 0.52], blanket[i % blanket.length]);
    b.box([0.94, 0.05, 1.12], [x, 0.62, 0.52], blanket[(i + 1) % blanket.length]);
    b.box([0.62, 0.14, 0.4], [x, 0.58, -0.6], pillow);
    b.box([1.0, 0.7, 0.1], [x, 0.55, -0.95], frame);
    out.push({ x, y: 0.58, z: 0.0, yaw: 0 });
  });
  return out;
}

export function createGuestHouse(skin: Skin, race: Race): VillagePiece {
  switch (race) {
    case 'elves':
      return elfGuest(skin);
    case 'gnomes':
      return gnomeGuest(skin);
    case 'robots':
      return robotGuest(skin);
    default:
      return alienGuest(skin);
  }
}

function elfGuest(skin: Skin): VillagePiece {
  const b = new Build(skin, 'elf-guest');
  const spots = beds(b, BARK, [LEAF2, PINK, '#7fb6e6'], CREAM);
  b.box([5.0, 2.6, 0.5], [0, 1.3, -1.25], WOODL);
  for (const y of [0.7, 1.4, 2.1]) b.box([5.04, 0.08, 0.54], [0, y, -1.25], WOODL_D);
  for (const x of [-1.5, 1.5]) b.box([0.5, 0.2, 0.2], [x, 2.4, -0.95], BARK);
  b.disc(0.62, 0.1, [0, 1.6, -1.0], [0, 0, 1], BARK_D);
  b.lens('win', RACE_GLOW_HEX.elves, 0.5, 0.12, [0, 1.6, -0.96], [0, 0, 1]);
  b.box([0.08, 1.1, 0.04], [0, 1.6, -0.82], BARK_D);
  b.box([1.1, 0.08, 0.04], [0, 1.6, -0.82], BARK_D);
  for (const sx of [-1, 1]) {
    b.box([0.45, 2.6, 0.45], [sx * 2.0, 1.3, 1.2], BARK);
    b.box([0.65, 0.3, 0.65], [sx * 2.0, 0.15, 1.2], BARK_D);
    b.box([0.45, 2.6, 0.45], [sx * 2.2, 1.3, -1.2], BARK);
  }
  // hanging lanterns over each bed
  for (const x of BED_X) {
    b.box([0.04, 0.5, 0.04], [x, 2.35, 0.2], CREAM);
    b.glowBox('win', RACE_GLOW_HEX.elves, [0.2, 0.26, 0.2], [x, 2.0, 0.2]);
  }
  // roof: layered leaves
  b.box([5.4, 0.4, 3.4], [0, 2.8, 0], LEAF);
  b.box([4.7, 0.4, 2.9], [0, 3.15, 0], LEAF2);
  b.box([3.7, 0.4, 2.2], [0, 3.5, 0], LEAF);
  b.box([2.4, 0.4, 1.5], [0, 3.85, 0], LEAF2);
  for (let i = 0; i < 8; i++) b.box([0.16, 0.16, 0.16], [-2.4 + i * 0.68, 2.98, 1.74], i % 2 ? PINK : CORAL);
  return finishGuest(b, spots, RACE_POOL.elves, C_ELF, 'elves');
}

function gnomeGuest(skin: Skin): VillagePiece {
  const b = new Build(skin, 'gnome-guest');
  const spots = beds(b, WOOD, [CORAL, CREAM, '#7fb6e6'], CREAM);
  b.box([5.0, 2.4, 0.5], [0, 1.2, -1.25], STONE);
  for (const y of [0.6, 1.2, 1.8]) b.box([5.04, 0.08, 0.54], [0, y, -1.25], STONE_D);
  for (const [x, y] of [[-1.6, 1.0], [1.7, 0.7], [0.5, 1.5]] as const) b.box([0.6, 0.3, 0.06], [x, y, -0.97], STONE_L);
  b.disc(0.55, 0.1, [0, 1.35, -1.0], [0, 0, 1], WOOD);
  b.lens('win', RACE_GLOW_HEX.gnomes, 0.42, 0.12, [0, 1.35, -0.96], [0, 0, 1]);
  b.box([0.9, 0.06, 0.04], [0, 1.35, -0.84], WOOD);
  for (const sx of [-1, 1]) {
    b.box([0.4, 2.4, 0.4], [sx * 2.0, 1.2, 1.2], WOOD);
    b.box([0.6, 0.35, 0.6], [sx * 2.0, 0.17, 1.2], STONE_D);
    b.box([0.4, 2.4, 0.4], [sx * 2.2, 1.2, -1.2], WOOD);
  }
  for (const x of BED_X) {
    b.box([0.04, 0.4, 0.04], [x, 2.2, 0.2], IRON);
    b.glowBox('win', RACE_GLOW_HEX.gnomes, [0.2, 0.24, 0.2], [x, 1.9, 0.2]);
  }
  // a wide mushroom cap over everything
  const cy = 2.4;
  const rx = 2.8;
  const rz = 1.85;
  const ry = 1.15;
  b.ball(1, [0, cy, 0], CORAL, { top: true, s: [rx, ry, rz], seg: 30 });
  b.geo(new THREE.CylinderGeometry(1, 1, 0.1, 18), [0, cy - 0.03, 0], '#f4d9a0', { s: [rx - 0.05, 1, rz - 0.05] });
  b.geo(new THREE.CylinderGeometry(1, 1, 0.1, 18), [0, cy + 0.03, 0], CORAL_DARK, { s: [rx, 1, rz] });
  for (const [az, el, r] of [[0.2, 1.0, 0.42], [-0.9, 0.7, 0.34], [1.2, 0.6, 0.38], [2.2, 0.6, 0.32], [-2.2, 0.55, 0.34], [1.6, 0.15, 0.3], [-1.5, 0.2, 0.3], [0.15, 0.25, 0.3], [3.3, 0.7, 0.3]] as const) {
    const pt = domePt(rx, ry, rz, cy, az, el);
    const nn = new THREE.Vector3(...pt.n).normalize();
    b.geo(new THREE.CylinderGeometry(r, r, 0.14, 14), [pt.p[0] - nn.x * 0.02, pt.p[1] - nn.y * 0.02, pt.p[2] - nn.z * 0.02], CREAM, { q: along(nn.x, nn.y, nn.z) });
  }
  return finishGuest(b, spots, RACE_POOL.gnomes, C_GNOME, 'gnomes');
}

function robotGuest(skin: Skin): VillagePiece {
  const b = new Build(skin, 'robot-guest');
  const spots = beds(b, STEEL_D, [TEAL, MUSTARD, CORAL], CREAM);
  b.box([5.0, 2.6, 0.5], [0, 1.3, -1.25], STEEL);
  b.box([5.04, 0.5, 0.54], [0, 2.3, -1.25], TEAL);
  b.box([5.04, 0.06, 0.54], [0, 0.9, -1.25], STEEL_D);
  for (const x of BED_X) {
    b.disc(0.44, 0.12, [x, 1.6, -1.0], [0, 0, 1], STEEL_D);
    b.lens('win', RACE_GLOW_HEX.robots, 0.32, 0.1, [x, 1.6, -0.96], [0, 0, 1]);
  }
  for (let i = -5; i <= 5; i++) b.box([0.08, 0.08, 0.05], [i * 0.45, 2.45, -0.98], STEEL_D);
  for (const sx of [-1, 1]) {
    b.box([0.38, 2.6, 0.38], [sx * 2.0, 1.3, 1.2], STEEL_D);
    b.box([0.5, 0.4, 0.5], [sx * 2.0, 0.2, 1.2], STEEL);
    b.box([0.46, 0.12, 0.46], [sx * 2.0, 2.0, 1.2], MUSTARD);
    b.box([0.38, 2.6, 0.38], [sx * 2.2, 1.3, -1.2], STEEL_D);
    for (const y of [0.7, 1.4, 2.2]) b.box([0.08, 0.08, 0.06], [sx * 2.0 - 0.1, y, 1.42], STEEL);
  }
  for (const x of BED_X) {
    b.box([0.04, 0.4, 0.04], [x, 2.35, 0.2], STEEL);
    b.glowBox('win', RACE_GLOW_HEX.robots, [0.28, 0.1, 0.28], [x, 2.1, 0.2]);
  }
  b.box([5.4, 0.28, 3.4], [0, 2.74, 0], TEAL_D);
  b.box([5.4, 0.1, 3.4], [0, 2.92, 0], STEEL);
  b.box([4.6, 0.18, 2.6], [0, 3.05, 0], TEAL);
  b.box([5.4, 0.06, 0.2], [0, 2.9, 1.62], MUSTARD);
  b.beam([2.0, 3.1, -1.0], [2.0, 4.1, -1.0], 0.07, STEEL);
  b.box([0.16, 0.16, 0.16], [2.0, 4.18, -1.0], CORAL);
  b.box([1.0, 0.25, 0.8], [-1.2, 3.25, -0.5], STEEL_D);
  const gear = new THREE.Mesh(gearGeo(0.38, 8), b.kit.vertexColourMaterial(false));
  gear.position.set(-2.0, 1.7, -0.98);
  gear.name = 'gear';
  b.root.add(gear);
  const piece2 = finishGuest(b, spots, RACE_POOL.robots, C_ROBOT, 'robots');
  const base = piece2.update;
  piece2.update = (dt, k) => {
    gear.rotation.z -= dt * 0.35;
    base(dt, k);
  };
  return piece2;
}

function alienGuest(skin: Skin): VillagePiece {
  const b = new Build(skin, 'alien-guest');
  const spots = beds(b, LILAC_D, [MINT_L, LILAC, '#ffd9a0'], ALIEN_CREAM);
  b.box([5.0, 2.5, 0.5], [0, 1.25, -1.25], ALIEN_CREAM);
  b.box([5.04, 0.16, 0.54], [0, 0.45, -1.25], LILAC);
  b.box([5.04, 0.16, 0.54], [0, 2.1, -1.25], LILAC);
  for (const x of BED_X) {
    b.disc(0.46, 0.12, [x, 1.4, -1.0], [0, 0, 1], LILAC_D);
    b.lens('win', RACE_GLOW_HEX.aliens, 0.34, 0.1, [x, 1.4, -0.96], [0, 0, 1]);
  }
  for (const sx of [-1, 1]) {
    b.cyl(0.3, 2.5, [sx * 2.0, 1.25, 1.2], ALIEN_CREAM);
    b.cyl(0.38, 0.14, [sx * 2.0, 0.07, 1.2], LILAC_D);
    for (const y of [0.7, 1.7]) b.cyl(0.37, 0.14, [sx * 2.0, y, 1.2], LILAC);
    b.cyl(0.3, 2.5, [sx * 2.2, 1.25, -1.2], ALIEN_CREAM);
  }
  for (const x of BED_X) {
    b.box([0.04, 0.4, 0.04], [x, 2.15, 0.2], LILAC_D);
    b.glowBall('win', RACE_GLOW_HEX.aliens, 0.14, [x, 1.9, 0.2]);
  }
  // a low canopy dome with ring bands
  const cy = 2.45;
  const rx = 2.85;
  const rz = 1.85;
  const ry = 1.15;
  b.ball(1, [0, cy, 0], ALIEN_CREAM, { top: true, s: [rx, ry, rz], seg: 18 });
  for (const h of [0.0, 0.5]) {
    const f = Math.sqrt(1 - (h / ry) ** 2);
    b.geo(new THREE.CylinderGeometry(1, 1, h === 0 ? 0.2 : 0.12, 18), [0, cy + h, 0], LILAC, { s: [rx * f + 0.04, 1, rz * f + 0.04] });
  }
  b.glowBall('tip', MINT_L, 0.2, [0, cy + ry + 0.28, 0]);
  b.cyl(0.08, 0.3, [0, cy + ry + 0.1, 0], LILAC_D);
  return finishGuest(b, spots, RACE_POOL.aliens, C_ALIEN, 'aliens');
}

function finishGuest(b: Build, spots: { x: number; y: number; z: number; yaw: number }[], poolHex: number, c: THREE.Color, race: Race): VillagePiece {
  const m = b.finish();
  const p = pool(poolHex, 3.3, [0, 0.07, 0.2]);
  b.root.add(p.mesh);
  const w = nightWatch((n) => {
    warmUp(m.win, c, n, race === 'robots' ? GLASS_DAY_ROBOT : race === 'aliens' ? GLASS_DAY_ALIEN : undefined);
    if (m.tip) setGlow(m.tip, new THREE.Color(MINT_L), 0.3 + 0.9 * n);
    p.mat.opacity = 0.45 * n;
    p.mesh.visible = n > 0.05;
  });
  return piece(b, (_dt, k) => w(k.night), { spots });
}

// ─── hearts ─────────────────────────────────────────────────────────────────

export function createHeart(skin: Skin, race: Race): VillagePiece {
  switch (race) {
    case 'elves':
      return elfHeart(skin);
    case 'gnomes':
      return gnomeHeart(skin);
    case 'robots':
      return robotHeart(skin);
    default:
      return alienHeart(skin);
  }
}

/** The lantern tree: a thick trunk, a wide layered crown, many warm lanterns. Always lit. */
function elfHeart(skin: Skin): VillagePiece {
  const b = new Build(skin, 'elf-heart');
  // roots and trunk
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 0.9, 1.2, sz * 0.9], [sx * 1.9, 0.05, sz * 1.9], 0.55, BARK_D);
  oct(b, 2.9, 3.0, 0, BARK);
  oct(b, 2.4, 3.0, 3.0, BARK);
  oct(b, 1.9, 3.2, 6.0, BARK);
  for (const [y, s] of [[1.1, 3.0], [2.6, 3.0], [4.3, 2.5], [5.6, 2.5], [7.2, 2.0]] as const) oct(b, s, 0.12, y, BARK_D);
  // a hollow in the trunk with a warm glow
  b.box([1.0, 1.5, 0.12], [0, 0.75, 1.45], BARK_D);
  b.box([0.7, 0.3, 0.12], [0, 1.6, 1.45], BARK_D);
  b.glowBox('lant', RACE_GLOW_HEX.elves, [0.7, 1.15, 0.1], [0, 0.65, 1.5]);
  // a bench ring of stones
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.2;
    b.box([0.4, 0.22, 0.4], [Math.cos(a) * 2.3, 0.11, Math.sin(a) * 2.3 + 0.2], i % 2 ? STONE_L : STONE);
  }
  // crown tiers
  const tiers: [number, number, string][] = [[6.9, 8.6, LEAF_D], [7.7, 7.3, LEAF], [8.5, 5.8, LEAF2], [9.3, 4.2, LEAF], [10.0, 2.6, LEAF2]];
  for (const [y, s, c] of tiers) oct(b, s, 0.95, y, c);
  b.box([0.2, 0.7, 0.2], [0, 11.3, 0], BARK);
  b.ball(0.3, [0, 11.8, 0], '#ffd23a', { seg: 12 });
  // pink blossoms on the crown
  const fruitHalos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = 2.4 + (i % 3) * 0.9;
    const at: V3 = [Math.cos(a) * r, 7.85 + (i % 2) * 0.1, Math.sin(a) * r];
    if (i % 2) b.glowBox('lant', RACE_GLOW_HEX.elves, [0.26, 0.26, 0.26], at);
    else b.box([0.22, 0.22, 0.22], at, i % 4 ? PINK : CREAM);
  }
  void fruitHalos;
  // lanterns: hung from the lowest crown, plus two on branches
  const hanging: { p: V3; len: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.399 + 0.5;
    const r = 2.6 + ((i * 7) % 5) * 0.38;
    hanging.push({ p: [Math.cos(a) * r, 0, Math.sin(a) * r], len: 0.6 + ((i * 5) % 4) * 0.28 });
  }
  const haloGeos: THREE.BufferGeometry[] = [];
  hanging.forEach((h, i) => {
    const top = 6.9;
    const y = top - h.len - 0.2;
    b.box([0.04, h.len, 0.04], [h.p[0], top - h.len / 2, h.p[2]], CREAM);
    b.glowBox('lant', RACE_GLOW_HEX.elves, [0.36, 0.44, 0.36], [h.p[0], y, h.p[2]]);
    b.box([0.38, 0.06, 0.38], [h.p[0], y + 0.22, h.p[2]], CHARCOAL);
    b.box([0.38, 0.06, 0.38], [h.p[0], y - 0.2, h.p[2]], CHARCOAL);
    haloGeos.push(place(new THREE.SphereGeometry(0.75, 8, 6), [h.p[0], y, h.p[2]]));
    void i;
  });
  for (const sx of [-1, 1]) {
    b.beam([sx * 0.6, 3.8, 0], [sx * 1.7, 3.5, 0.3], 0.2, BARK);
    b.box([0.04, 0.5, 0.04], [sx * 1.7, 3.2, 0.3], CREAM);
    b.glowBox('lant', RACE_GLOW_HEX.elves, [0.3, 0.38, 0.3], [sx * 1.7, 2.85, 0.3]);
    haloGeos.push(place(new THREE.SphereGeometry(0.6, 8, 6), [sx * 1.7, 2.85, 0.3]));
  }
  const m = b.finish();
  const haloMat = glowMaterial(0xffc866);
  const haloMesh = fx(new THREE.Mesh(mergeCached('elf-heart/halo', haloGeos), haloMat));
  haloMesh.frustumCulled = true;
  b.root.add(haloMesh);
  const pl = pool(0xffc866, 5.0, [0, 0.05, 0.2]);
  b.root.add(pl.mesh);
  let t = 0;
  return piece(
    b,
    (dt, k) => {
      t += dt;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
      setGlow(m.lant, C_ELF, 0.55 + 0.6 * k.night + 0.12 * pulse);
      haloMat.opacity = 0.05 + 0.26 * k.night + 0.03 * pulse;
      pl.mat.opacity = 0.6 * k.night;
      pl.mesh.visible = k.night > 0.05;
    },
    { socket: new THREE.Vector3(0, 1.0, 1.6) },
  );
}

/** The forge: stone furnace, anvil, bellows and a tall brick chimney. */
function gnomeHeart(skin: Skin): VillagePiece {
  const b = new Build(skin, 'gnome-heart');
  b.box([3.0, 0.2, 3.0], [0, 0.1, 0], STONE_D);
  // furnace
  const FX = -0.15;
  b.box([2.4, 2.0, 1.7], [FX, 1.2, -0.6], STONE);
  for (const y of [0.75, 1.5, 2.1]) b.box([2.46, 0.08, 1.76], [FX, y, -0.6], STONE_D);
  for (const [x, y] of [[-1.0, 0.45], [0.35, 1.2], [-0.7, 1.85], [0.8, 0.55]] as const) b.box([0.55, 0.3, 0.06], [x, y, 0.27], STONE_L);
  b.box([2.6, 0.18, 1.9], [FX, 2.29, -0.6], STONE_D);
  // the mouth: dark arch frame, glow behind
  b.box([1.4, 1.1, 0.12], [FX, 0.85, 0.27], CHARCOAL);
  b.box([1.0, 0.24, 0.12], [FX, 1.5, 0.27], CHARCOAL);
  b.box([1.7, 0.22, 0.16], [FX, 1.7, 0.28], STONE_L);
  b.box([0.22, 1.5, 0.16], [FX - 0.78, 0.95, 0.28], STONE_L);
  b.box([0.22, 1.5, 0.16], [FX + 0.78, 0.95, 0.28], STONE_L);
  b.glowBox('mouth', '#ff9a3a', [1.0, 0.75, 0.1], [FX, 0.75, 0.33]);
  b.glowBox('mouth', '#ff9a3a', [0.6, 0.24, 0.1], [FX, 1.3, 0.33]);
  b.box([1.2, 0.07, 0.34], [FX, 0.25, 0.48], IRON);
  // the brick chimney, tapering to ~8
  const segs = 8;
  const SH = 0.7;
  for (let i = 0; i < segs; i++) {
    const w = 1.15 - i * 0.05;
    b.box([w, SH, w], [FX, 2.38 + i * SH + SH / 2, -0.95], i % 2 ? BRICK_D : BRICK);
    if (i % 2 === 0) b.box([w + 0.06, 0.07, w + 0.06], [FX, 2.38 + i * SH + SH, -0.95], CREAM);
  }
  const topY = 2.38 + segs * SH;
  b.box([1.0, 0.2, 1.0], [FX, topY + 0.1, -0.95], STONE_D);
  b.box([0.6, 0.05, 0.6], [FX, topY + 0.21, -0.95], CHARCOAL);
  // the anvil on a stump
  b.cyl(0.5, 0.5, [1.0, 0.45, 0.95], WOOD, { seg: 10 });
  b.cyl(0.52, 0.05, [1.0, 0.72, 0.95], WOOD_DARK, { seg: 10 });
  b.box([0.34, 0.3, 0.3], [1.0, 0.9, 0.95], IRON);
  b.box([1.0, 0.24, 0.42], [1.0, 1.17, 0.95], IRON);
  b.box([0.5, 0.18, 0.3], [1.62, 1.14, 0.95], IRON);
  b.box([0.4, 0.06, 0.3], [0.75, 1.32, 0.95], '#6c6662');
  // tongs and a hammer leaning on the stump
  b.beam([1.35, 0.25, 1.35], [1.0, 1.0, 1.1], 0.06, WOOD_DARK);
  b.box([0.3, 0.2, 0.2], [1.38, 0.22, 1.38], IRON);

  // the bellows (pumps when the forge works)
  const bellows = new THREE.Group();
  bellows.position.set(-1.1, 0.35, 0.95);
  b.root.add(bellows);
  const bp = b.part('bellows', bellows);
  bp.box([0.9, 0.12, 0.7], [0, 0, 0], WOOD);
  bp.box([0.82, 0.14, 0.62], [0, 0.17, 0], '#7a2f22');
  bp.box([0.74, 0.14, 0.56], [0, 0.3, 0], CORAL_DARK);
  bp.box([0.66, 0.14, 0.5], [0, 0.43, 0], '#7a2f22');
  bp.box([0.9, 0.12, 0.7], [0, 0.57, 0], WOOD);
  bp.box([0.1, 0.3, 0.1], [0, 0.75, 0], WOOD_DARK);
  bp.box([0.5, 0.08, 0.08], [0, 0.9, 0], WOOD_DARK);
  b.box([0.14, 0.14, 0.64], [-0.78, 0.5, 0.62], IRON, [0.25, 0.6, 0]);
  b.box([0.5, 0.08, 0.3], [-1.1, 0.04 + 0.2, 0.95], WOOD_DARK);
  b.box([0.1, 0.4, 0.1], [-1.35, 0.3, 1.2], WOOD_DARK);
  b.box([0.1, 0.4, 0.1], [-0.85, 0.3, 1.2], WOOD_DARK);

  const m = b.finish();
  // smoke puffs
  const puffMat = skin.partMaterial('#d9d3c8') as THREE.Material;
  const SMOKE = 7;
  const puffs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), puffMat, SMOKE);
  puffs.frustumCulled = false;
  puffs.visible = false;
  fx(puffs);
  b.root.add(puffs);
  const glowPool = pool(0xff9a3a, 2.2, [-0.15, 0.06, 1.6]);
  b.root.add(glowPool.mesh);
  const mh = halo(0xff8a30, 1.1, [-0.15, 0.8, 0.6]);
  b.root.add(mh.mesh);
  const mq = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const ps = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const FIRE = new THREE.Color('#ff9a3a');
  const COLD = new THREE.Color('#3b2f2a');
  const tmp = new THREE.Color();
  let t = 0;
  let work = 0;
  return piece(
    b,
    (dt, k) => {
      t += dt;
      const lit = k.on && !k.low;
      work += ((lit ? 1 : 0) - work) * Math.min(1, dt * 3);
      // the mouth
      if (k.low) {
        setGlow(m.mouth, C_CORAL, Math.floor(t * 6) % 2 === 0 ? 1 : 0.1);
      } else if (k.on) {
        const f = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3);
        lerpColour(FIRE, new THREE.Color('#ffd070'), 0.5 + 0.5 * Math.sin(t * 5), tmp);
        setGlow(m.mouth, tmp, 0.9 * f + 0.3 * k.night);
      } else {
        setGlow(m.mouth, COLD, 0);
      }
      const glowing = lit || k.low;
      mh.mat.opacity = glowing ? (lit ? 0.25 + 0.1 * Math.sin(t * 9) : Math.floor(t * 6) % 2 === 0 ? 0.25 : 0) : 0;
      mh.mat.color.set(k.low ? 0xff6a4a : 0xff8a30);
      mh.mesh.visible = mh.mat.opacity > 0.01;
      glowPool.mat.opacity = lit ? (0.35 + 0.4 * k.night) * (0.9 + 0.1 * Math.sin(t * 9)) : 0;
      glowPool.mesh.visible = glowPool.mat.opacity > 0.01;
      // bellows
      const pump = 0.5 + 0.5 * Math.sin(t * 2.6);
      bellows.scale.y = 1 - work * 0.35 * pump;
      // smoke
      puffs.visible = work > 0.05;
      for (let i = 0; i < SMOKE; i++) {
        const life = (t * 0.22 + i / SMOKE) % 1;
        const s = work * Math.sin(life * Math.PI) * (0.6 + life * 1.3);
        ps.set(-0.15 + Math.sin(t * 0.8 + i * 2) * 0.25 + life * 0.9, topY + 0.4 + life * 3.2, -0.95 + Math.cos(i) * 0.15);
        sc.set(s, s, s);
        q.setFromEuler(e.set(life * 2, i, life));
        puffs.setMatrixAt(i, mq.compose(ps, q, sc));
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
    { socket: new THREE.Vector3(1.3, 1.5, -0.4) },
  );
}

/** The charging post: a pad with plugs and a screen, a tall lattice mast with a slow beacon. */
function robotHeart(skin: Skin): VillagePiece {
  const b = new Build(skin, 'robot-heart');
  b.box([3.0, 0.3, 3.0], [0, 0.15, 0], STEEL_D);
  b.box([2.7, 0.08, 2.7], [0, 0.32, 0], STEEL);
  for (let i = 0; i < 6; i++) {
    b.box([0.22, 0.04, 0.22], [-1.1 + i * 0.44, 0.38, 1.28], i % 2 ? CHARCOAL : MUSTARD);
    b.box([0.22, 0.04, 0.22], [-1.1 + i * 0.44, 0.38, -1.28], i % 2 ? MUSTARD : CHARCOAL);
  }
  // the charging circle
  b.cyl(0.95, 0.05, [0.3, 0.38, 0.3], TEAL_D, { seg: 28 });
  b.cyl(0.72, 0.06, [0.3, 0.39, 0.3], TEAL, { seg: 28 });
  b.cyl(0.2, 0.08, [0.3, 0.4, 0.3], MUSTARD, { seg: 16 });
  // the console with its slanted screen
  b.box([1.0, 1.0, 0.7], [-0.85, 0.85, 0.85], STEEL_D);
  b.box([1.06, 0.12, 0.76], [-0.85, 1.4, 0.85], TEAL);
  b.box([0.9, 0.5, 0.06], [-0.85, 0.7, 1.22], CHARCOAL);
  b.beam([-0.85, 0.35, 0.5], [-0.85, 0.5, 0.52], 0.04, STEEL);
  // plugs on cables: a socket on the console, cables to two plugs
  b.box([0.18, 0.18, 0.12], [-0.5, 0.38 + 0.15, 1.22], MUSTARD);
  const cable: V3[] = [[-0.5, 0.55, 1.25], [-0.15, 0.2, 1.4], [0.3, 0.2, 1.3], [0.55, 0.28, 0.9]];
  for (let i = 0; i < cable.length - 1; i++) b.beam(cable[i], cable[i + 1], 0.07, CHARCOAL);
  b.box([0.2, 0.2, 0.3], [0.55, 0.4, 0.78], MUSTARD);
  b.box([0.14, 0.14, 0.14], [0.55, 0.4, 0.62], CHARCOAL);
  b.beam([-0.4, 0.5, 1.2], [1.0, 0.25, 1.1], 0.07, CHARCOAL);
  b.box([0.2, 0.2, 0.3], [1.15, 0.4, 1.0], CORAL);
  // the lattice mast, tapering to ~10
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const MX = 0.45;
  const MZ = -0.95;
  const w0 = 0.7;
  const w1 = 0.22;
  const H = 9.5;
  const wAt = (y: number): number => w0 + (w1 - w0) * ((y - 0.3) / (H - 0.3));
  for (const [sx, sz] of legs) b.beam([MX + sx * w0, 0.3, MZ + sz * w0], [MX + sx * w1, H, MZ + sz * w1], 0.13, STEEL_D);
  const levels = [0.3, 2.2, 4.1, 6.0, 7.9, H];
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i];
    const w = wAt(y);
    b.box([2 * w, 0.09, 0.09], [MX, y, MZ + w], STEEL);
    b.box([2 * w, 0.09, 0.09], [MX, y, MZ - w], STEEL);
    b.box([0.09, 0.09, 2 * w], [MX + w, y, MZ], STEEL);
    b.box([0.09, 0.09, 2 * w], [MX - w, y, MZ], STEEL);
    if (i < levels.length - 1) {
      const y2 = levels[i + 1];
      const w2 = wAt(y2);
      b.beam([MX - w, y, MZ + w], [MX + w2, y2, MZ + w2], 0.06, STEEL, 0.06);
      b.beam([MX + w, y, MZ - w], [MX - w2, y2, MZ - w2], 0.06, STEEL, 0.06);
      b.beam([MX + w, y, MZ + w], [MX + w2, y2, MZ - w2], 0.06, STEEL, 0.06);
      b.beam([MX - w, y, MZ - w], [MX - w2, y2, MZ + w2], 0.06, STEEL, 0.06);
    }
  }
  b.box([1.0, 0.14, 1.0], [MX, H + 0.07, MZ], STEEL_D);
  b.box([0.7, 0.1, 0.7], [MX, H + 0.19, MZ], TEAL);
  b.cyl(0.18, 0.5, [MX, H + 0.5, MZ], STEEL_D, { seg: 10 });
  b.cyl(0.36, 0.08, [MX, H + 0.82, MZ], TEAL, { seg: 14 });
  // little lights down the mast
  for (const y of [3.0, 5.0, 7.0]) b.glowBox('status', '#ffd23a', [0.14, 0.14, 0.14], [MX, y, MZ + wAt(y) + 0.1]);
  b.glowBall('beacon', '#ffd23a', 0.32, [MX, H + 1.15, MZ]);
  // three status bulbs on the console
  for (const x of [-1.15, -0.85, -0.55]) b.glowBox('status', '#ffd23a', [0.14, 0.12, 0.12], [x, 1.5, 0.98]);
  const m = b.finish();
  // the screen with filling charge bars
  const screen = new THREE.Group();
  screen.position.set(-0.85, 0.7, 1.26);
  b.root.add(screen);
  const barMat = ownGlow(skin, '#ffd23a');
  const BARS = 5;
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.34, 0.03).translate(0, 0.17, 0), barMat, BARS);
  bars.frustumCulled = false;
  bars.position.set(-0.28, -0.2, 0.02);
  screen.add(fx(bars));
  const mq = new THREE.Matrix4();
  const ps = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const idQ = new THREE.Quaternion();
  const beaconHalo = halo(0xffd070, 0.6, [MX, H + 1.15, MZ]);
  b.root.add(beaconHalo.mesh);
  const padPool = pool(0xffd070, 2.2, [0, 0.1, 0.3]);
  b.root.add(padPool.mesh);
  const tmp = new THREE.Color();
  let t = 0;
  let last = '';
  return piece(
    b,
    (dt, k) => {
      t += dt;
      const lit = k.on && !k.low;
      // the beacon always blinks, slowly
      const ph = (t % 2.6) / 2.6;
      const flash = ph < 0.22 ? Math.sin((ph / 0.22) * Math.PI) : 0;
      const bc = k.low ? C_CORAL : C_WARM;
      setGlow(m.beacon, bc, 0.12 + 1.0 * flash);
      beaconHalo.mat.color.copy(bc);
      beaconHalo.mat.opacity = (0.03 + 0.3 * flash) * (0.5 + 0.6 * k.night);
      beaconHalo.mesh.visible = beaconHalo.mat.opacity > 0.01;
      // status bulbs
      const st = k.low ? (Math.floor(t * 6) % 2 === 0 ? 'low' : 'dim') : k.on ? 'on' : 'off';
      if (st !== last) {
        last = st;
        if (st === 'on') setGlow(m.status, C_WARM, 1);
        else if (st === 'low') setGlow(m.status, C_CORAL, 1);
        else if (st === 'dim') setGlow(m.status, C_OFF, 0);
        else setGlow(m.status, C_OFF, 0);
      }
      // the bars fill and start over
      bars.visible = lit;
      if (lit) {
        const fill = (t * 0.28) % 1.25;
        for (let i = 0; i < BARS; i++) {
          const v = Math.min(1, Math.max(0, fill * BARS - i));
          ps.set(i * 0.14, 0, 0);
          sc.set(1, 0.25 + 0.75 * v, 1);
          bars.setMatrixAt(i, mq.compose(ps, idQ, v > 0.02 ? sc : sc.set(0, 0, 0)));
        }
        bars.instanceMatrix.needsUpdate = true;
        tmp.copy(C_WARM);
        setGlow(barMat, tmp, 0.9);
      }
      padPool.mat.opacity = lit ? 0.3 + 0.25 * k.night : 0;
      padPool.mesh.visible = padPool.mat.opacity > 0.01;
    },
    { socket: new THREE.Vector3(1.0, 1.2, 1.0) },
  );
}

/** A dish antenna on a tripod; running, it sends a soft beam straight up with rings climbing it. */
function alienHeart(skin: Skin): VillagePiece {
  const b = new Build(skin, 'alien-heart');
  b.cyl(1.45, 0.3, [0, 0.15, 0], LILAC_D, { seg: 28 });
  b.cyl(1.1, 0.12, [0, 0.36, 0], ALIEN_CREAM, { seg: 28 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.cyl(0.12, 0.08, [Math.cos(a) * 1.28, 0.34, Math.sin(a) * 1.28], MINT_D, { seg: 10 });
  }
  // tripod
  const HUB = 2.6;
  for (let i = 0; i < 3; i++) {
    const a = HP + (i / 3) * TAU;
    b.beam([Math.cos(a) * 1.1, 0.4, Math.sin(a) * 1.1], [Math.cos(a) * 0.18, HUB, Math.sin(a) * 0.18], 0.2, LILAC);
    b.cyl(0.18, 0.1, [Math.cos(a) * 1.1, 0.42, Math.sin(a) * 1.1], LILAC_D, { seg: 8 });
  }
  b.cyl(0.42, 0.36, [0, HUB, 0], ALIEN_CREAM, { seg: 16 });
  b.cyl(0.3, 0.2, [0, HUB + 0.28, 0], LILAC_D, { seg: 16 });
  // a little console by the foot with a mint light
  b.box([0.7, 0.55, 0.5], [0.95, 0.55, 1.0], ALIEN_CREAM);
  b.box([0.74, 0.1, 0.54], [0.95, 0.85, 1.0], LILAC);
  b.glowBox('status', MINT_L, [0.4, 0.14, 0.04], [0.95, 0.62, 1.27]);
  const m = b.finish();

  // the dish: a shell tilted towards the sky, on a swivel
  const swivel = new THREE.Group();
  swivel.position.set(0, HUB + 0.4, 0);
  const dish = new THREE.Group();
  dish.rotation.x = 0.5;
  swivel.add(dish);
  b.root.add(swivel);
  const R = 1.55;
  const D = 0.62;
  const prof: THREE.Vector2[] = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * R;
    prof.push(new THREE.Vector2(x, D * (x / R) ** 2));
  }
  for (let i = N; i >= 0; i--) {
    const x = (i / N) * (R - 0.02);
    prof.push(new THREE.Vector2(x, D * (x / R) ** 2 + 0.1));
  }
  const dishGeo = tint(new THREE.LatheGeometry(prof, 28), ALIEN_CREAM);
  const rimGeo = tint(new THREE.TorusGeometry(R, 0.07, 6, 28).rotateX(HP).translate(0, D + 0.05, 0), LILAC);
  const innerGeo = tint(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 20).translate(0, 0.14, 0), MINT_D);
  const hubGeo = tint(new THREE.CylinderGeometry(0.2, 0.3, 0.34, 12).translate(0, -0.12, 0), LILAC_D);
  const dishMesh = new THREE.Mesh(mergeCached('alien-heart/dish', [dishGeo, rimGeo, innerGeo, hubGeo], true), b.kit.vertexColourMaterial(false));
  dishMesh.castShadow = true;
  dish.add(dishMesh);
  const dp = b.kit.part('feed', dish);
  const F = 1.15;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    dp.beam([Math.cos(a) * (R - 0.05), D + 0.05, Math.sin(a) * (R - 0.05)], [0, F, 0], 0.06, LILAC_D);
  }
  dp.box([0.2, 0.22, 0.2], [0, F + 0.06, 0], ALIEN_CREAM);
  dp.done();
  const tipMat = ownGlow(skin, MINT_L);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), tipMat);
  tip.position.set(0, F + 0.3, 0);
  dish.add(fx(tip));

  // the beam and the rings
  const BEAM_Y = HUB + 1.2;
  const beamGeo = (r0: number, r1: number): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(r1, r0, 40, 14, 12, true).translate(0, 20, 0);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const f = Math.pow(1 - pos.getY(i) / 40, 1.6);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  };
  const beamMat = glowMaterial(0x9fffe0, true);
  const beam = fx(new THREE.Mesh(beamGeo(0.8, 1.9), beamMat));
  beam.position.set(0, BEAM_Y, 0);
  const coreMat = glowMaterial(0xe8fff6, true);
  const core = fx(new THREE.Mesh(beamGeo(0.28, 0.55), coreMat));
  core.position.set(0, BEAM_Y, 0);
  beam.visible = core.visible = false;
  b.root.add(beam, core);
  const RINGS = 3;
  const ringMat = glowMaterial(0xffffff);
  ringMat.opacity = 0.7;
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.06, 6, 28).rotateX(HP), ringMat, RINGS);
  rings.frustumCulled = false;
  rings.visible = false;
  rings.setColorAt(0, new THREE.Color(1, 1, 1));
  fx(rings);
  b.root.add(rings);
  const baseGlow = pool(0xa8ffd8, 3.2, [0, 0.08, 0.3]);
  b.root.add(baseGlow.mesh);
  const mq = new THREE.Matrix4();
  const ps = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const idQ = new THREE.Quaternion();
  const rc = new THREE.Color();
  const MINT_C = new THREE.Color(MINT_L);
  const DARK = new THREE.Color('#5b5560');
  let t = 0;
  let fade = 0;
  return piece(
    b,
    (dt, k) => {
      t += dt;
      const lit = k.on && !k.low;
      fade += ((lit ? 1 : 0) - fade) * Math.min(1, dt * 2.5);
      dish.rotation.y = Math.sin(t * 0.25) * 0.5;
      // the tip: mint when running, blinking coral when short, dark when off
      if (k.low) setGlow(tipMat, C_CORAL, Math.floor(t * 6) % 2 === 0 ? 1 : 0.1);
      else if (k.on) setGlow(tipMat, MINT_C, 0.8 + 0.4 * Math.sin(t * 3));
      else setGlow(tipMat, DARK, 0);
      if (k.low) setGlow(m.status, C_CORAL, Math.floor(t * 6) % 2 === 0 ? 1 : 0.1);
      else if (k.on) setGlow(m.status, MINT_C, 1);
      else setGlow(m.status, DARK, 0);
      const vis = fade > 0.01;
      beam.visible = core.visible = rings.visible = vis;
      baseGlow.mesh.visible = vis;
      if (!vis) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      beamMat.opacity = fade * (0.09 + 0.04 * pulse + 0.2 * k.night);
      coreMat.opacity = fade * (0.12 + 0.05 * pulse + 0.2 * k.night);
      baseGlow.mat.opacity = fade * (0.4 + 0.3 * k.night);
      for (let i = 0; i < RINGS; i++) {
        const life = (t * 0.32 + i / RINGS) % 1;
        const r = 0.9 + life * 1.1;
        ps.set(0, BEAM_Y + 0.4 + life * 13, 0);
        sc.set(r, 1, r);
        rings.setMatrixAt(i, mq.compose(ps, idQ, sc));
        const f = Math.sin(Math.min(1, life * 1.0) * Math.PI) * (1 - life * 0.6);
        rings.setColorAt(i, rc.setRGB(0.6 * f, 1.0 * f, 0.85 * f));
      }
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    },
    { socket: new THREE.Vector3(0.9, 1.3, 1.0) },
  );
}

// ─── arches ─────────────────────────────────────────────────────────────────

export function createVillageArch(skin: Skin, race: Race): VillagePiece {
  switch (race) {
    case 'elves':
      return elfArch(skin);
    case 'gnomes':
      return gnomeArch(skin);
    case 'robots':
      return robotArch(skin);
    default:
      return alienArch(skin);
  }
}

function archGlowUpdate(b: Build, c: THREE.Color, poolHex: number): VillagePiece['update'] {
  const m = b.finish();
  const p = pool(poolHex, 2.6, [0, 0.05, 0.3]);
  b.root.add(p.mesh);
  const w = nightWatch((n) => {
    warmUp(m.win, c, n);
    if (m.tip) setGlow(m.tip, c, 0.3 + 0.9 * n);
    p.mat.opacity = 0.45 * n;
    p.mesh.visible = n > 0.05;
  });
  return (_dt, k) => w(k.night);
}

function elfArch(skin: Skin): VillagePiece {
  const b = new Build(skin, 'elf-arch');
  for (const sx of [-1, 1]) {
    const x = sx * 1.85;
    b.box([0.9, 0.3, 0.9], [x, 0.15, 0], BARK_D);
    b.box([0.6, 3.0, 0.6], [x, 1.8, 0], BARK);
    b.box([0.62, 0.1, 0.62], [x, 1.2, 0], BARK_D);
    b.box([0.62, 0.1, 0.62], [x, 2.5, 0], BARK_D);
    b.beam([x, 2.9, 0], [sx * 1.0, 3.7, 0], 0.4, BARK);
  }
  b.box([2.2, 0.45, 0.6], [0, 3.85, 0], BARK);
  // leaves over the top
  b.box([4.8, 0.45, 1.3], [0, 4.2, 0], LEAF);
  b.box([3.6, 0.4, 1.1], [0, 4.55, 0], LEAF2);
  b.box([2.2, 0.35, 0.9], [0, 4.85, 0], LEAF);
  for (const sx of [-1, 1]) {
    b.box([1.0, 0.4, 1.1], [sx * 1.95, 3.6, 0], LEAF2);
    b.box([0.9, 0.3, 1.0], [sx * 1.95, 3.25, 0], LEAF);
  }
  for (let i = 0; i < 7; i++) b.box([0.16, 0.16, 0.16], [-2.1 + i * 0.7, 4.45, 0.66], i % 2 ? PINK : CORAL);
  // a lantern hung in the middle, one on each pillar
  b.box([0.04, 0.4, 0.04], [0, 3.4, 0], CREAM);
  b.glowBox('win', RACE_GLOW_HEX.elves, [0.28, 0.34, 0.28], [0, 3.08, 0]);
  for (const sx of [-1, 1]) {
    b.box([0.06, 0.3, 0.06], [sx * 1.85, 2.35, 0.45], BARK_D);
    b.glowBox('win', RACE_GLOW_HEX.elves, [0.2, 0.26, 0.2], [sx * 1.85, 2.05, 0.45]);
  }
  return piece(b, archGlowUpdate(b, C_ELF, RACE_POOL.elves));
}

function gnomeArch(skin: Skin): VillagePiece {
  const b = new Build(skin, 'gnome-arch');
  for (const sx of [-1, 1]) {
    const x = sx * 1.85;
    b.box([0.9, 0.35, 0.9], [x, 0.17, 0], STONE_D);
    b.box([0.7, 3.0, 0.7], [x, 1.85, 0], STONE);
    for (const y of [0.9, 1.7, 2.5]) b.box([0.76, 0.08, 0.76], [x, y, 0], STONE_D);
    b.box([0.4, 0.3, 0.06], [x, 1.3, 0.37], STONE_L);
    b.box([0.4, 0.3, 0.06], [x, 2.2, -0.37], STONE_L);
    b.box([0.9, 0.25, 0.9], [x, 3.45, 0], STONE_D);
  }
  b.box([4.8, 0.4, 0.8], [0, 3.65, 0], WOOD);
  b.box([4.8, 0.08, 0.84], [0, 3.88, 0], WOOD_DARK);
  b.box([0.2, 0.7, 0.8], [-1.2, 3.35, 0], WOOD_DARK, [0, 0, 0.5]);
  b.box([0.2, 0.7, 0.8], [1.2, 3.35, 0], WOOD_DARK, [0, 0, -0.5]);
  // a mushroom cap perched on top
  b.ball(1, [0, 3.9, 0], CORAL, { top: true, s: [1.7, 1.0, 1.0], seg: 24 });
  b.geo(new THREE.CylinderGeometry(1, 1, 0.1, 18), [0, 3.89, 0], '#f4d9a0', { s: [1.65, 1, 0.95] });
  for (const [x, y, z, r] of [[0.0, 4.82, 0.1, 0.22], [-0.8, 4.55, 0.3, 0.2], [0.85, 4.5, 0.25, 0.2], [-1.35, 4.15, 0.45, 0.17], [1.4, 4.15, 0.4, 0.17]] as const) {
    b.geo(new THREE.CylinderGeometry(r, r, 0.12, 12), [x, y, z], CREAM, { rot: [0.5, 0, 0] });
  }
  // lanterns
  b.box([0.04, 0.4, 0.04], [0, 3.3, 0.2], IRON);
  b.glowBox('win', RACE_GLOW_HEX.gnomes, [0.26, 0.32, 0.26], [0, 3.0, 0.2]);
  for (const sx of [-1, 1]) {
    b.box([0.06, 0.3, 0.06], [sx * 1.85, 2.9, 0.5], IRON);
    b.glowBox('win', RACE_GLOW_HEX.gnomes, [0.2, 0.26, 0.2], [sx * 1.85, 2.6, 0.5]);
  }
  return piece(b, archGlowUpdate(b, C_GNOME, RACE_POOL.gnomes));
}

function robotArch(skin: Skin): VillagePiece {
  const b = new Build(skin, 'robot-arch');
  for (const sx of [-1, 1]) {
    const x = sx * 1.9;
    b.box([1.0, 0.3, 1.0], [x, 0.15, 0], STEEL_D);
    b.box([0.7, 3.2, 0.7], [x, 1.9, 0], STEEL);
    b.box([0.74, 3.2, 0.2], [x, 1.9, 0.33], STEEL_D);
    for (const y of [0.8, 1.6, 2.4, 3.2]) {
      b.box([0.1, 0.1, 0.06], [x - 0.22, y, 0.38], STEEL);
      b.box([0.1, 0.1, 0.06], [x + 0.22, y, 0.38], STEEL);
    }
    b.box([0.76, 0.5, 0.76], [x, 1.0, 0], TEAL);
    b.box([0.2, 0.5, 0.06], [x, 1.0, 0.4], MUSTARD);
  }
  b.box([5.0, 0.55, 0.8], [0, 3.5, 0], TEAL);
  b.box([5.0, 0.12, 0.84], [0, 3.82, 0], STEEL);
  b.box([5.0, 0.1, 0.84], [0, 3.2, 0], STEEL_D);
  for (let i = -5; i <= 5; i++) b.box([0.08, 0.08, 0.05], [i * 0.44, 3.5, 0.42], STEEL_D);
  // a gear emblem in the middle (turns slowly)
  const gear = new THREE.Mesh(gearGeo(0.5, 8), b.kit.vertexColourMaterial(false));
  gear.position.set(0, 4.32, 0);
  gear.castShadow = true;
  b.root.add(gear);
  b.box([0.5, 0.2, 0.5], [0, 3.98, 0], STEEL_D);
  // lamps under the beam
  for (const x of [-1.0, 1.0]) b.glowBox('win', RACE_GLOW_HEX.robots, [0.34, 0.12, 0.34], [x, 3.08, 0.2]);
  b.glowBall('tip', '#ffd23a', 0.14, [-2.6, 3.9, 0]);
  b.beam([-1.9, 3.8, 0], [-2.0, 4.6, 0], 0.06, STEEL);
  b.box([0.16, 0.16, 0.16], [-2.0, 4.66, 0], CORAL);
  const upd = archGlowUpdate(b, C_ROBOT, RACE_POOL.robots);
  return piece(b, (dt, k) => {
    gear.rotation.z -= dt * 0.35;
    upd(dt, k);
  });
}

function alienArch(skin: Skin): VillagePiece {
  const b = new Build(skin, 'alien-arch');
  const CY = 1.9;
  const RR = 2.0;
  for (const sx of [-1, 1]) {
    const x = sx * RR;
    b.cyl(0.55, 0.3, [x, 0.15, 0], LILAC_D, { seg: 16 });
    b.cyl(0.32, CY, [x, CY / 2 + 0.2, 0], ALIEN_CREAM, { seg: 16, });
    for (const y of [0.7, 1.4]) b.cyl(0.4, 0.14, [x, y, 0], LILAC, { seg: 16 });
    b.ball(0.42, [x, CY + 0.2, 0], LILAC, { seg: 14 });
  }
  // the ring over the path
  b.geo(new THREE.TorusGeometry(RR, 0.26, 8, 20, Math.PI), [0, CY + 0.2, 0], ALIEN_CREAM);
  b.geo(new THREE.TorusGeometry(RR, 0.29, 8, 20, Math.PI).scale(1, 1, 0.45), [0, CY + 0.2, 0], LILAC);
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    b.ball(0.15, [Math.cos(a) * (RR + 0.0), CY + 0.2 + Math.sin(a) * (RR + 0.0), 0.28], MINT_D, { seg: 10 });
  }
  b.glowBall('tip', MINT_L, 0.3, [0, CY + 0.2 + RR + 0.55, 0]);
  b.cyl(0.1, 0.3, [0, CY + 0.2 + RR + 0.2, 0], LILAC_D, { seg: 8 });
  for (const sx of [-1, 1]) b.glowBall('win', RACE_GLOW_HEX.aliens, 0.14, [sx * RR, CY + 0.2, 0.44]);
  return piece(b, archGlowUpdate(b, C_ALIEN, RACE_POOL.aliens));
}

// ─── lamps ──────────────────────────────────────────────────────────────────

export function createVillageLamp(skin: Skin, race: Race): VillagePiece {
  const b = new Build(skin, `${race}-lamp`);
  let headY = 1.9;
  switch (race) {
    case 'elves':
      b.box([0.45, 0.25, 0.45], [0, 0.12, 0], BARK_D);
      b.box([0.2, 1.5, 0.2], [0, 0.95, 0], BARK);
      b.box([0.22, 0.08, 0.22], [0, 1.3, 0], BARK_D);
      b.box([0.5, 0.06, 0.5], [0, 1.72, 0], CHARCOAL);
      b.glowBox('lamp', RACE_GLOW_HEX.elves, [0.3, 0.34, 0.3], [0, 1.92, 0]);
      b.box([0.5, 0.06, 0.5], [0, 2.12, 0], CHARCOAL);
      b.box([0.7, 0.14, 0.7], [0, 2.22, 0], LEAF);
      b.box([0.4, 0.14, 0.4], [0, 2.36, 0], LEAF2);
      b.box([0.2, 0.1, 0.2], [0, 2.46, 0], PINK);
      b.box([0.3, 0.1, 0.1], [0.2, 0.9, 0], BARK, [0, 0, 0.6]);
      break;
    case 'gnomes':
      b.box([0.6, 0.25, 0.6], [0, 0.12, 0], STONE_D);
      b.box([0.42, 1.15, 0.42], [0, 0.8, 0], STONE);
      b.box([0.46, 0.08, 0.46], [0, 0.95, 0], STONE_D);
      b.box([0.55, 0.12, 0.55], [0, 1.45, 0], STONE_D);
      b.glowBox('lamp', RACE_GLOW_HEX.gnomes, [0.3, 0.38, 0.3], [0, 1.7, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.05, 0.4, 0.05], [sx * 0.17, 1.7, sz * 0.17], IRON);
      b.ball(1, [0, 1.9, 0], CORAL, { top: true, s: [0.55, 0.4, 0.55], seg: 14 });
      b.geo(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), [0.1, 2.28, 0.12], CREAM);
      headY = 1.7;
      break;
    case 'robots':
      b.box([0.5, 0.15, 0.5], [0, 0.07, 0], STEEL_D);
      b.box([0.14, 1.7, 0.14], [0, 1.0, 0], STEEL);
      for (const y of [0.4, 1.0, 1.6]) b.box([0.22, 0.08, 0.22], [0, y, 0], TEAL);
      b.cyl(0.3, 0.08, [0, 1.9, 0], TEAL_D, { seg: 14 });
      b.cyl(0.18, 0.08, [0, 1.84, 0], STEEL_D, { seg: 14 });
      b.glowBall('lamp', RACE_GLOW_HEX.robots, 0.2, [0, 2.0, 0]);
      b.box([0.1, 0.1, 0.1], [0, 2.3, 0], CORAL);
      b.beam([0, 2.2, 0], [0, 2.45, 0], 0.04, STEEL);
      headY = 2.0;
      break;
    default:
      b.cyl(0.32, 0.12, [0, 0.06, 0], LILAC_D, { seg: 14 });
      b.cyl(0.07, 1.5, [0, 0.85, 0], LILAC, { seg: 8 });
      for (const y of [0.4, 0.9]) b.cyl(0.16, 0.07, [y === 0.4 ? 0 : 0, y, 0], ALIEN_CREAM, { seg: 12 });
      b.cyl(0.14, 0.12, [0, 1.65, 0], LILAC_D, { seg: 10 });
      b.glowBall('lamp', RACE_GLOW_HEX.aliens, 0.24, [0, 1.95, 0]);
      b.geo(new THREE.TorusGeometry(0.32, 0.035, 6, 20), [0, 1.95, 0], ALIEN_CREAM, { rot: [1.2, 0, 0.4] });
      headY = 1.95;
  }
  const m = b.finish();
  const c = RACE_GLOW[race];
  const h = halo(RACE_POOL[race], 0.6, [0, headY, 0]);
  const p = pool(RACE_POOL[race], 2.3, [0, 0.05, 0]);
  b.root.add(h.mesh, p.mesh);
  const w = nightWatch((n) => {
    setGlow(m.lamp, c, 0.25 + 1.0 * n);
    h.mat.opacity = 0.05 + 0.32 * n;
    h.mesh.visible = true;
    p.mat.opacity = 0.7 * n;
    p.mesh.visible = n > 0.05;
  });
  return piece(b, (_dt, k) => w(k.night));
}

// ─── items ──────────────────────────────────────────────────────────────────

const ITEM_COLOUR: Record<Race, string> = { elves: '#f2b52c', gnomes: '#6fe0c6', robots: '#eab02b', aliens: '#ffcf3a' };

/** A thing to collect: bobs and turns, with a faint tall sparkle column so a child sees it from afar. */
export function createVillageItem(skin: Skin, race: Race): VillagePiece {
  const root = new THREE.Group();
  root.name = `${race}-item`;
  const hex = ITEM_COLOUR[race];
  const spin = new Build(skin, `${race}-item-spin`);
  switch (race) {
    case 'elves':
      // golden acorn
      spin.glowGeo('body', hex, new THREE.SphereGeometry(0.2, 14, 10), [0, -0.06, 0], { s: [1, 1.25, 1] });
      spin.cyl(0.03, 0.1, [0, -0.33, 0], BARK, { seg: 6, r1: 0.0 });
      spin.ball(0.235, [0, 0.1, 0], '#a8641f', { top: true, s: [1, 0.75, 1], seg: 14 });
      spin.cyl(0.24, 0.04, [0, 0.09, 0], '#7a4617', { seg: 14 });
      spin.box([0.06, 0.14, 0.06], [0, 0.34, 0], BARK_D);
      break;
    case 'gnomes':
      // a mint crystal with two small teal shards
      spin.glowGeo('body', hex, new THREE.OctahedronGeometry(1, 0), [0, 0.02, 0], { s: [0.17, 0.4, 0.17], rot: [0, 0.4, 0] });
      spin.geo(new THREE.OctahedronGeometry(1, 0), [0.17, -0.14, 0.05], '#2fa59a', { s: [0.1, 0.22, 0.1], rot: [0.1, 0.2, -0.5] });
      spin.geo(new THREE.OctahedronGeometry(1, 0), [-0.16, -0.16, -0.04], '#2fa59a', { s: [0.09, 0.19, 0.09], rot: [-0.2, 0.9, 0.5] });
      break;
    case 'robots':
      // a mustard gear, standing
      spin.glowGeo('body', hex, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 18).rotateX(HP), [0, 0, 0]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        spin.glowGeo('body', hex, new THREE.BoxGeometry(0.1, 0.12, 0.1), [Math.cos(a) * 0.235, Math.sin(a) * 0.235, 0], { rot: [0, 0, a + HP] });
      }
      spin.cyl(0.07, 0.13, [0, 0, 0], CHARCOAL, { rot: [HP, 0, 0], seg: 12 });
      break;
    default:
      // a warm yellow shard of a star
      spin.glowGeo('body', hex, new THREE.IcosahedronGeometry(0.24, 0), [0, 0, 0], { s: [0.9, 1.4, 0.8], rot: [0.3, 0.5, 0.2] });
      spin.glowGeo('body', hex, new THREE.IcosahedronGeometry(0.12, 0), [0.17, -0.12, 0.08], { s: [0.8, 1.2, 0.8], rot: [-0.4, 0.2, 0.6] });
      spin.glowGeo('body', hex, new THREE.IcosahedronGeometry(0.09, 0), [-0.15, 0.17, -0.05], { s: [0.8, 1.1, 0.8], rot: [0.5, 0.9, -0.2] });
  }
  const m = spin.finish();
  const spinG = spin.root;
  spinG.position.y = 0.75;
  root.add(spinG);

  // the sparkle column: two crossing fades, plus a small pool
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
    g.computeBoundingSphere();
    return g;
  };
  const colGeo = mergeGeometries([col(0), col(HP)])!;
  const colMat = glowMaterial(0xffffff, true);
  const column = fx(new THREE.Mesh(colGeo, colMat));
  column.position.y = 0.1;
  root.add(column);
  const pl = pool(parseInt(hex.slice(1), 16), 0.9, [0, 0.05, 0]);
  root.add(pl.mesh);
  pl.mesh.visible = true;
  const c = new THREE.Color(hex);
  let t = Math.random() * 6;
  finishShadows(root);
  return {
    root,
    update(dt, k) {
      t += dt;
      spinG.rotation.y = t * 1.5;
      spinG.position.y = 0.75 + Math.sin(t * 2.2) * 0.1;
      const tw = 0.5 + 0.5 * Math.sin(t * 3.1);
      setGlow(m.body, c, 0.35 + 0.35 * k.night + 0.2 * tw);
      colMat.opacity = 0.2 + 0.3 * k.night + 0.06 * tw;
      pl.mat.opacity = 0.4 + 0.3 * k.night;
    },
  };
}
