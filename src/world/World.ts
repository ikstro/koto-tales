/**
 * The voxel world: chunk data (generated on demand, plus the kid's edits),
 * streaming of chunk meshes around a focus point, block queries and edits.
 *
 * Meshing is budgeted per `update` call (≤2 new chunks or ~8 ms, plus a few
 * edited chunks), so walking never stalls a frame. All chunk meshes share the
 * two materials of the active skin.
 */
import * as THREE from 'three';
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  type Biome,
  type ChunkGeometry,
  type ChunkInfo,
  type FaceBuffers,
  type IWorld,
  type RayHit,
  type Skin,
  type StructureBlock,
  type WorldOptions,
} from '../contracts';
import { BLOCKS, B } from './blocks';
import { meshBounds, meshChunk, PAD_SIZE, PAD_X, PAD_Z } from './mesher';
import { hash2, mulberry32 } from './rng';
import { Terrain } from './terrain';

const CS = CHUNK_SIZE;
const H = WORLD_HEIGHT;
const CHUNK_VOL = CS * CS * H;
const SOLID = new Uint8Array(256);
for (const k of Object.keys(BLOCKS)) SOLID[Number(k)] = BLOCKS[Number(k)].solid ? 1 : 0;

/** Chunks meshed per update (new ones) and the time budget for them. */
const MESH_PER_UPDATE = 2;
const MESH_BUDGET_MS = 8;
/** Edited chunks remeshed per update, regardless of the time budget. */
const DIRTY_PER_UPDATE = 4;
/** Decorations rebuilt per update. */
const DECO_PER_UPDATE = 3;
/** Chunks within this Chebyshev distance of the focus get skin decorations. */
const DECO_DIST = 2;

const ckey = (cx: number, cz: number): number => (((cx & 0xffff) << 16) | (cz & 0xffff)) >>> 0;
const lidx = (lx: number, y: number, lz: number): number => (y << 8) | (lz << 4) | lx;

interface ChunkEntry {
  cx: number;
  cz: number;
  geometry: ChunkGeometry | null;
  opaque: THREE.Mesh | null;
  trans: THREE.Mesh | null;
  deco: THREE.Object3D | null;
  /** Distance the current decoration was built for; -1 = none. */
  decoDist: number;
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && typeof g.dispose === 'function') g.dispose();
  });
  obj.removeFromParent();
}

export class World implements IWorld {
  readonly seed: number;
  onChunkGenerated: ((info: ChunkInfo) => void) | null = null;
  onChunkUnloaded: ((cx: number, cz: number) => void) | null = null;

  /** Debug counters. */
  readonly stats = { meshed: 0, meshMs: 0, lastMeshMs: 0, loaded: 0, dataChunks: 0 };

  private scene: THREE.Scene;
  private skin: Skin;
  private renderDistance: number;
  private terrain: Terrain;
  private data = new Map<number, Uint8Array>();
  private pool: Uint8Array[] = [];
  private edits = new Map<string, number>();
  private chunkEdits = new Map<number, Map<number, number>>();
  private chunks = new Map<number, ChunkEntry>();
  private dirty = new Set<number>();
  private generatedOnce = new Set<number>();
  private pad = new Uint8Array(PAD_SIZE);
  private offsets: Int16Array;
  private focusCx = Number.NaN;
  private focusCz = Number.NaN;
  private allLoaded = false;
  private decoQueue = new Set<number>();
  private daylight = 1;
  private lastKey = -1;
  private lastData: Uint8Array | null = null;

  constructor(scene: THREE.Scene, opts: WorldOptions, skin: Skin) {
    this.scene = scene;
    this.seed = opts.seed | 0;
    this.skin = skin;
    this.terrain = new Terrain(this.seed);
    this.renderDistance = 0;
    this.offsets = new Int16Array(0);
    this.setRenderDistance(opts.renderDistance);
  }

  /** Changes the radius kept meshed; chunks beyond it unload on the next update. */
  setRenderDistance(chunks: number): void {
    const R = Math.max(1, Math.floor(chunks));
    if (R === this.renderDistance) return;
    this.renderDistance = R;
    // spiral of chunk offsets inside the render circle, nearest first
    const list: [number, number, number][] = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= (R + 0.5) * (R + 0.5)) list.push([dx, dz, d]);
      }
    list.sort((a, b) => a[2] - b[2]);
    this.offsets = new Int16Array(list.length * 2);
    list.forEach((o, i) => {
      this.offsets[i * 2] = o[0];
      this.offsets[i * 2 + 1] = o[1];
    });
    // the next update re-runs the focus change: unload far, load near
    this.focusCx = Number.NaN;
    this.focusCz = Number.NaN;
  }

  // ─── streaming ──────────────────────────────────────────────────────────

  update(focus: THREE.Vector3): void {
    const fcx = Math.floor(focus.x / CS);
    const fcz = Math.floor(focus.z / CS);
    if (fcx !== this.focusCx || fcz !== this.focusCz) {
      this.focusCx = fcx;
      this.focusCz = fcz;
      this.allLoaded = false;
      this.unloadFar();
      this.evictData();
      for (const [k, e] of this.chunks) if (e.decoDist !== this.decoTarget(e)) this.decoQueue.add(k);
    }

    // 1. chunks the kid changed
    let n = 0;
    for (const k of this.dirty) {
      this.dirty.delete(k);
      const e = this.chunks.get(k);
      if (e) this.buildMesh(e);
      if (++n >= DIRTY_PER_UPDATE) break;
    }

    // 2. new chunks, nearest first
    if (!this.allLoaded) {
      const t0 = performance.now();
      let made = 0;
      let missing = false;
      const off = this.offsets;
      for (let i = 0; i < off.length; i += 2) {
        const cx = fcx + off[i];
        const cz = fcz + off[i + 1];
        const k = ckey(cx, cz);
        if (this.chunks.has(k)) continue;
        if (made >= MESH_PER_UPDATE || performance.now() - t0 > MESH_BUDGET_MS) {
          missing = true;
          break;
        }
        const e: ChunkEntry = { cx, cz, geometry: null, opaque: null, trans: null, deco: null, decoDist: -1 };
        this.chunks.set(k, e);
        this.buildMesh(e);
        made++;
        if (!this.generatedOnce.has(k)) {
          this.generatedOnce.add(k);
          this.fireGenerated(cx, cz);
        }
        if (this.decoTarget(e) !== -1) this.decoQueue.add(k);
      }
      if (!missing) this.allLoaded = true;
      this.stats.loaded = this.chunks.size;
    }

    // 3. decorations near the focus
    if (this.decoQueue.size > 0 && this.skin.decorate) {
      let d = 0;
      for (const k of this.decoQueue) {
        this.decoQueue.delete(k);
        const e = this.chunks.get(k);
        if (e) this.redecorate(e);
        if (++d >= DECO_PER_UPDATE) break;
      }
    } else if (!this.skin.decorate) this.decoQueue.clear();
  }

  /** True when every chunk in range is meshed and nothing is waiting. */
  isIdle(): boolean {
    return this.allLoaded && this.dirty.size === 0 && (this.decoQueue.size === 0 || !this.skin.decorate);
  }

  setSkin(skin: Skin): void {
    this.skin = skin;
    for (const [k, e] of this.chunks) {
      if (e.opaque) e.opaque.material = skin.chunkMaterial('opaque');
      if (e.trans) e.trans.material = skin.chunkMaterial('transparent');
      if (e.deco) {
        disposeObject(e.deco);
        e.deco = null;
      }
      e.decoDist = -1;
      if (this.decoTarget(e) !== -1) this.decoQueue.add(k);
    }
  }

  setDaylight(k: number): void {
    // lighting belongs to the skin (updateScene); kept for queries
    this.daylight = Math.min(1, Math.max(0, k));
  }

  getDaylight(): number {
    return this.daylight;
  }

  dispose(): void {
    for (const e of this.chunks.values()) this.dropMeshes(e);
    this.chunks.clear();
    this.data.clear();
    this.pool.length = 0;
    this.decoQueue.clear();
    this.dirty.clear();
  }

  private decoTarget(e: ChunkEntry): number {
    const d = Math.max(Math.abs(e.cx - this.focusCx), Math.abs(e.cz - this.focusCz));
    return d <= DECO_DIST ? d : -1;
  }

  private redecorate(e: ChunkEntry): void {
    const want = this.decoTarget(e);
    if (e.deco) {
      disposeObject(e.deco);
      e.deco = null;
    }
    e.decoDist = want;
    if (want === -1 || !e.geometry || !this.skin.decorate) return;
    const obj = this.skin.decorate(e.geometry, want);
    if (obj) {
      e.deco = obj;
      this.scene.add(obj);
    }
  }

  private unloadFar(): void {
    const lim = this.renderDistance + 1.5;
    for (const [k, e] of this.chunks) {
      const dx = e.cx - this.focusCx;
      const dz = e.cz - this.focusCz;
      if (dx * dx + dz * dz > lim * lim) {
        this.dropMeshes(e);
        this.chunks.delete(k);
        this.dirty.delete(k);
        this.decoQueue.delete(k);
        this.onChunkUnloaded?.(e.cx, e.cz);
      }
    }
    this.stats.loaded = this.chunks.size;
  }

  /** Keeps chunk data near the focus; returns far buffers to the pool. */
  private evictData(): void {
    const R = this.renderDistance + 3;
    const cap = (2 * R + 1) * (2 * R + 1);
    if (this.data.size <= cap) return;
    for (const [k, buf] of this.data) {
      const cx = (k >>> 16) << 16 >> 16;
      const cz = (k & 0xffff) << 16 >> 16;
      if (Math.abs(cx - this.focusCx) > R || Math.abs(cz - this.focusCz) > R) {
        if (this.chunks.has(k)) continue;
        this.data.delete(k);
        if (this.pool.length < 32) this.pool.push(buf);
      }
    }
    this.lastKey = -1;
    this.lastData = null;
    this.stats.dataChunks = this.data.size;
  }

  private dropMeshes(e: ChunkEntry): void {
    for (const m of [e.opaque, e.trans]) {
      if (!m) continue;
      m.geometry.dispose();
      m.removeFromParent();
    }
    e.opaque = e.trans = null;
    if (e.deco) disposeObject(e.deco);
    e.deco = null;
    e.decoDist = -1;
    e.geometry = null;
  }

  private buildMesh(e: ChunkEntry): void {
    const t0 = performance.now();
    this.fillPad(e.cx, e.cz);
    const g = meshChunk(this.pad, e.cx, e.cz);
    const minY = meshBounds.minY;
    const maxY = meshBounds.maxY;
    const hadDeco = e.deco !== null;
    this.dropMeshes(e);
    e.geometry = g;
    e.opaque = this.makeMesh(g.opaque, 'opaque', e.cx, e.cz, minY, maxY);
    e.trans = this.makeMesh(g.transparent, 'transparent', e.cx, e.cz, minY, maxY);
    if (hadDeco || this.decoTarget(e) !== -1) this.decoQueue.add(ckey(e.cx, e.cz));
    const dt = performance.now() - t0;
    this.stats.meshed++;
    this.stats.meshMs += dt;
    this.stats.lastMeshMs = dt;
  }

  private makeMesh(
    b: FaceBuffers,
    pass: 'opaque' | 'transparent',
    cx: number,
    cz: number,
    minY: number,
    maxY: number,
  ): THREE.Mesh | null {
    if (b.index.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
    geo.setAttribute('ao', new THREE.BufferAttribute(b.ao, 1));
    geo.setAttribute('face', new THREE.BufferAttribute(b.face, 1));
    geo.setIndex(new THREE.BufferAttribute(b.index, 1));
    const x0 = cx * CS;
    const z0 = cz * CS;
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minY, z0), new THREE.Vector3(x0 + CS, maxY, z0 + CS));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, this.skin.chunkMaterial(pass));
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (pass === 'transparent') mesh.renderOrder = 1;
    mesh.name = `chunk:${cx},${cz}:${pass}`;
    this.scene.add(mesh);
    return mesh;
  }

  /** Copies the chunk plus a one-block border of its neighbours into `pad`. */
  private fillPad(cx: number, cz: number): void {
    const pad = this.pad;
    const SY = PAD_X * PAD_Z;
    // y = -1 → stone, y = H → air
    pad.fill(B.STONE, 0, SY);
    pad.fill(B.AIR, (H + 1) * SY, (H + 2) * SY);
    for (let pz = 0; pz < PAD_Z; pz++) {
      const wz = pz - 1;
      const ncz = wz < 0 ? -1 : wz >= CS ? 1 : 0;
      const lz = wz - ncz * CS;
      for (let px = 0; px < PAD_X; px++) {
        const wx = px - 1;
        const ncx = wx < 0 ? -1 : wx >= CS ? 1 : 0;
        const lx = wx - ncx * CS;
        const src = this.chunkData(cx + ncx, cz + ncz);
        const col = (lz << 4) | lx;
        let pi = SY + pz * PAD_X + px;
        for (let y = 0; y < H; y++, pi += SY) pad[pi] = src[(y << 8) | col];
      }
    }
  }

  private fireGenerated(cx: number, cz: number): void {
    const cb = this.onChunkGenerated;
    if (!cb) return;
    const info: ChunkInfo = {
      cx,
      cz,
      x0: cx * CS,
      z0: cz * CS,
      rand: mulberry32(hash2(this.seed, cx, cz)),
      biomeAt: (x, z) => this.biomeAt(x, z),
      dryGroundAt: (x, z) => this.dryGroundAt(x, z),
    };
    cb(info);
  }

  private dryGroundAt(x: number, z: number): number | null {
    x = Math.floor(x);
    z = Math.floor(z);
    const g = this.groundHeight(x, z);
    if (g <= 0) return null;
    const top = this.getBlock(x, g - 1, z);
    if (top === B.LEAVES || top === B.LOG) return null;
    if (this.isWater(x, g, z)) return null;
    return g;
  }

  // ─── data ───────────────────────────────────────────────────────────────

  private chunkData(cx: number, cz: number): Uint8Array {
    const k = ckey(cx, cz);
    if (k === this.lastKey && this.lastData) return this.lastData;
    let d = this.data.get(k);
    if (!d) {
      d = this.pool.pop() ?? new Uint8Array(CHUNK_VOL);
      this.terrain.generate(cx, cz, d);
      const ed = this.chunkEdits.get(k);
      if (ed) for (const [i, id] of ed) d[i] = id;
      this.data.set(k, d);
      this.stats.dataChunks = this.data.size;
    }
    this.lastKey = k;
    this.lastData = d;
    return d;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.STONE;
    if (y >= H) return B.AIR;
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    return this.chunkData(cx, cz)[lidx(x - cx * CS, y, z - cz * CS)];
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    if (this.writeBlock(x, y, z, id)) this.markAround(Math.floor(x), Math.floor(z));
  }

  /** Writes one block + edit record; returns true when something changed. */
  private writeBlock(x: number, y: number, z: number, id: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= H) return false;
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    const d = this.chunkData(cx, cz);
    const li = lidx(x - cx * CS, y, z - cz * CS);
    if (d[li] === id) return false;
    d[li] = id;
    this.edits.set(`${x},${y},${z}`, id);
    const k = ckey(cx, cz);
    let ed = this.chunkEdits.get(k);
    if (!ed) {
      ed = new Map();
      this.chunkEdits.set(k, ed);
    }
    ed.set(li, id);
    return true;
  }

  /** Marks the chunk of (x, z) and any neighbour whose border mesh/AO sees it. */
  private markAround(x: number, z: number): void {
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    const lx = x - cx * CS;
    const lz = z - cz * CS;
    const dxs = lx === 0 ? [0, -1] : lx === CS - 1 ? [0, 1] : [0];
    const dzs = lz === 0 ? [0, -1] : lz === CS - 1 ? [0, 1] : [0];
    for (const dx of dxs) for (const dz of dzs) this.markDirty(cx + dx, cz + dz);
  }

  private markDirty(cx: number, cz: number): void {
    const k = ckey(cx, cz);
    if (this.chunks.has(k)) this.dirty.add(k);
  }

  isSolid(x: number, y: number, z: number): boolean {
    return SOLID[this.getBlock(x, y, z)] === 1;
  }

  isWater(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === B.WATER;
  }

  groundHeight(x: number, z: number, fromY: number = H - 1): number {
    x = Math.floor(x);
    z = Math.floor(z);
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    const d = this.chunkData(cx, cz);
    const col = ((z - cz * CS) << 4) | (x - cx * CS);
    for (let y = Math.min(H - 1, Math.floor(fromY)); y >= 0; y--) {
      if (SOLID[d[(y << 8) | col]]) return y + 1;
    }
    return 0;
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len === 0) return null;
    const dx = dir.x / len;
    const dy = dir.y / len;
    const dz = dir.z / len;
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = sx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = sy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = sz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
    let ty = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
    let tz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    const hit = (id: number) => id !== B.AIR && id !== B.WATER;
    if (hit(this.getBlock(x, y, z))) return { x, y, z, nx, ny, nz, distance: 0 };
    while (t <= maxDist) {
      if (tx < ty && tx < tz) {
        x += sx;
        t = tx;
        tx += tdx;
        nx = -sx;
        ny = 0;
        nz = 0;
      } else if (ty < tz) {
        y += sy;
        t = ty;
        ty += tdy;
        nx = 0;
        ny = -sy;
        nz = 0;
      } else {
        z += sz;
        t = tz;
        tz += tdz;
        nx = 0;
        ny = 0;
        nz = -sz;
      }
      if (t > maxDist) break;
      if (y >= H && sy >= 0) break;
      if (y < 0 && sy <= 0) break;
      if (hit(this.getBlock(x, y, z))) return { x, y, z, nx, ny, nz, distance: t };
    }
    return null;
  }

  findSpawn(nearX: number, nearZ: number): THREE.Vector3 {
    const x0 = Math.floor(nearX);
    const z0 = Math.floor(nearZ);
    for (let r = 0; r <= 48; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = x0 + dx;
          const z = z0 + dz;
          if (this.goodSpawn(x, z)) return new THREE.Vector3(x + 0.5, this.groundHeight(x, z), z + 0.5);
        }
      }
    }
    return new THREE.Vector3(x0 + 0.5, this.groundHeight(x0, z0), z0 + 0.5);
  }

  private goodSpawn(x: number, z: number): boolean {
    const g = this.groundHeight(x, z);
    if (g <= 0 || this.getBlock(x, g - 1, z) !== B.GRASS) return false;
    if (this.getBlock(x, g, z) !== B.AIR || this.getBlock(x, g + 1, z) !== B.AIR) return false;
    for (const [ox, oz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = this.groundHeight(x + ox, z + oz);
      if (Math.abs(n - g) > 1 || this.isWater(x + ox, n, z + oz)) return false;
    }
    return true;
  }

  biomeAt(x: number, z: number): Biome {
    return this.terrain.biomeAt(x, z);
  }

  placeStructure(x: number, y: number, z: number, blocks: StructureBlock[]): void {
    const touched = new Set<string>();
    for (const b of blocks) {
      const wx = Math.floor(x) + b.dx;
      const wz = Math.floor(z) + b.dz;
      if (this.writeBlock(wx, Math.floor(y) + b.dy, wz, b.id)) touched.add(`${wx},${wz}`);
    }
    this.markColumns(touched);
  }

  flattenArea(x0: number, z0: number, x1: number, z1: number, y: number, clearHeight: number): void {
    const ax = Math.floor(Math.min(x0, x1));
    const bx = Math.floor(Math.max(x0, x1));
    const az = Math.floor(Math.min(z0, z1));
    const bz = Math.floor(Math.max(z0, z1));
    y = Math.max(1, Math.min(H - 1, Math.floor(y)));
    const touched = new Set<string>();
    for (let z = az; z <= bz; z++) {
      for (let x = ax; x <= bx; x++) {
        let changed = false;
        // fill below: everything not solid becomes earth, grass on top
        for (let yy = 1; yy < y; yy++) {
          const id = this.getBlock(x, yy, z);
          const ground = SOLID[id] === 1 && id !== B.LEAVES && id !== B.LOG;
          let want: number;
          if (yy === y - 1) want = ground && id !== B.DIRT ? id : B.GRASS;
          else want = ground ? (id === B.GRASS ? B.DIRT : id) : B.DIRT;
          if (want !== id) changed = this.writeBlock(x, yy, z, want) || changed;
        }
        // clear above; beyond clearHeight only solids (tree crowns) go, so groundHeight == y
        for (let yy = y; yy < H; yy++) {
          const id = this.getBlock(x, yy, z);
          if (id === B.AIR) continue;
          if (yy < y + clearHeight || SOLID[id]) changed = this.writeBlock(x, yy, z, B.AIR) || changed;
        }
        if (changed) touched.add(`${x},${z}`);
      }
    }
    this.markColumns(touched);
  }

  private markColumns(cols: Set<string>): void {
    for (const c of cols) {
      const [x, z] = c.split(',').map(Number);
      this.markAround(x, z);
    }
  }

  exportEdits(): Record<string, number> {
    return Object.fromEntries(this.edits);
  }

  /** Generated (unedited) chunk data, kept for one chunk at a time while reverting. */
  private natural: { k: number; d: Uint8Array } | null = null;

  /** Forgets the edit at this block and puts back what the generator made there. */
  revertBlock(x: number, y: number, z: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= H || !this.edits.delete(`${x},${y},${z}`)) return;
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    const k = ckey(cx, cz);
    if (this.natural?.k !== k) {
      const d = this.natural?.d ?? new Uint8Array(CHUNK_VOL);
      this.terrain.generate(cx, cz, d);
      this.natural = { k, d };
    }
    const li = lidx(x - cx * CS, y, z - cz * CS);
    const ed = this.chunkEdits.get(k);
    ed?.delete(li);
    if (ed && ed.size === 0) this.chunkEdits.delete(k);
    const data = this.data.get(k);
    if (data) data[li] = this.natural.d[li];
    this.markAround(x, z);
  }

  importEdits(edits: Record<string, number>): void {
    this.edits.clear();
    this.chunkEdits.clear();
    for (const [key, id] of Object.entries(edits)) {
      const parts = key.split(',');
      if (parts.length !== 3) continue;
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const z = Number(parts[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || y < 0 || y >= H) continue;
      if (typeof id !== 'number' || !BLOCKS[id]) continue;
      this.edits.set(`${x},${y},${z}`, id);
      const cx = Math.floor(x / CS);
      const cz = Math.floor(z / CS);
      const k = ckey(cx, cz);
      let ed = this.chunkEdits.get(k);
      if (!ed) {
        ed = new Map();
        this.chunkEdits.set(k, ed);
      }
      ed.set(lidx(x - cx * CS, y, z - cz * CS), id);
    }
    // regenerate data so old edits vanish and new ones apply; remesh what is shown
    for (const buf of this.data.values()) if (this.pool.length < 32) this.pool.push(buf);
    this.data.clear();
    this.lastKey = -1;
    this.lastData = null;
    for (const k of this.chunks.keys()) this.dirty.add(k);
  }
}
