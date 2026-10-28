/**
 * Chunk mesher → style-neutral `ChunkGeometry` (see contracts.ts).
 *
 * Hidden-face culling, per-vertex ambient occlusion, greedy merging of faces
 * that look identical (same block, same direction, uniform AO, same water
 * level). Faces with an AO gradient are emitted one by one, so merging never
 * changes how AO looks. `uv` is in block units from the quad's corner, so
 * `fract(uv)` is the position inside one block face.
 *
 * Input is a padded copy of the chunk: 18 × 50 × 18 (x fastest, then z, then y),
 * with one block of neighbour data on every side (y = -1 stone, y = 48 air).
 */
import { CHUNK_SIZE, WORLD_HEIGHT, type ChunkGeometry, type FaceBuffers } from '../contracts';
import { BLOCKS, B } from './blocks';

export const PAD_X = CHUNK_SIZE + 2;
export const PAD_Z = CHUNK_SIZE + 2;
export const PAD_Y = WORLD_HEIGHT + 2;
export const PAD_SIZE = PAD_X * PAD_Z * PAD_Y;
const SX = 1;
const SZ = PAD_X;
const SY = PAD_X * PAD_Z;
const CS = CHUNK_SIZE;
const H = WORLD_HEIGHT;

export const KIND_AIR = 0;
export const KIND_OPAQUE = 1;
export const KIND_WATER = 2;
export const KIND_GLASS = 3;

/** Per block id: render kind. */
export const KIND = new Uint8Array(256);
/** Per block id: 1 if entities collide with it. */
const SOLID = new Uint8Array(256);
for (const key of Object.keys(BLOCKS)) {
  const id = Number(key);
  const def = BLOCKS[id];
  if (id === B.AIR) KIND[id] = KIND_AIR;
  else if (def.transparent) KIND[id] = def.solid ? KIND_GLASS : KIND_WATER;
  else KIND[id] = KIND_OPAQUE;
  SOLID[id] = def.solid ? 1 : 0;
}

// ─── face tables ────────────────────────────────────────────────────────────
// dirs follow contracts DIR: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z
const NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const CORNERS_RAW = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
/** World axis (0 x, 1 y, 2 z) that u / v run along, per dir. */
const U_AXIS = [2, 2, 0, 0, 0, 0];
const V_AXIS = [1, 1, 2, 2, 1, 1];
const FACE_DELTA = new Int32Array(6);
/** [dir*12 + corner*3 + axis] corner offsets, winding CCW from outside. */
const CORNER = new Uint8Array(6 * 12);
/** [dir*12 + corner*3 + k] padded-index deltas for AO: side1, side2, diagonal. */
const AO_DELTA = new Int32Array(6 * 12);
/** [dir*8 + corner*2] uv in {0,1} for a unit face (texture upright). */
const CORNER_UV = new Uint8Array(6 * 8);

for (let f = 0; f < 6; f++) {
  const n = NORMALS[f];
  FACE_DELTA[f] = n[0] * SX + n[1] * SY + n[2] * SZ;
  let cs = CORNERS_RAW[f];
  // fix winding: (c1 - c0) × (c2 - c0) must point along the normal
  const a = cs[1].map((v, k) => v - cs[0][k]);
  const b = cs[2].map((v, k) => v - cs[0][k]);
  const cr = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) cs = [cs[0], cs[3], cs[2], cs[1]];
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  const t1 = axis === 0 ? 1 : 0;
  const t2 = axis === 2 ? 1 : 2;
  const delta = (v: number[]) => v[0] * SX + v[1] * SY + v[2] * SZ;
  for (let c = 0; c < 4; c++) {
    const p = cs[c];
    CORNER[f * 12 + c * 3] = p[0];
    CORNER[f * 12 + c * 3 + 1] = p[1];
    CORNER[f * 12 + c * 3 + 2] = p[2];
    const e1 = [0, 0, 0];
    const e2 = [0, 0, 0];
    e1[t1] = p[t1] ? 1 : -1;
    e2[t2] = p[t2] ? 1 : -1;
    const base = FACE_DELTA[f];
    AO_DELTA[f * 12 + c * 3] = base + delta(e1);
    AO_DELTA[f * 12 + c * 3 + 1] = base + delta(e2);
    AO_DELTA[f * 12 + c * 3 + 2] = base + delta(e1) + delta(e2);
    let u: number;
    let v: number;
    if (axis === 0) {
      u = n[0] > 0 ? 1 - p[2] : p[2];
      v = p[1];
    } else if (axis === 2) {
      u = n[2] > 0 ? p[0] : 1 - p[0];
      v = p[1];
    } else {
      u = p[0];
      v = 1 - p[2];
    }
    CORNER_UV[f * 8 + c * 2] = u;
    CORNER_UV[f * 8 + c * 2 + 1] = v;
  }
}

const AO_VALUE = [0, 1 / 3, 2 / 3, 1];
/** Top of a water block with no water above it. */
const WATER_TOP = 0.9;

// ─── growable output buffer ─────────────────────────────────────────────────

class PassBuffer {
  pos = new Float32Array(0);
  nrm = new Float32Array(0);
  uv = new Float32Array(0);
  ao = new Float32Array(0);
  face = new Float32Array(0);
  idx = new Uint32Array(0);
  quads = 0;
  private cap = 0;

  constructor(cap: number) {
    this.grow(cap);
  }

  private grow(cap: number): void {
    const g = <T extends Float32Array | Uint32Array>(old: T, n: number, make: (n: number) => T): T => {
      const a = make(cap * n);
      a.set(old);
      return a;
    };
    this.pos = g(this.pos, 12, (n) => new Float32Array(n));
    this.nrm = g(this.nrm, 12, (n) => new Float32Array(n));
    this.uv = g(this.uv, 8, (n) => new Float32Array(n));
    this.ao = g(this.ao, 4, (n) => new Float32Array(n));
    this.face = g(this.face, 4, (n) => new Float32Array(n));
    this.idx = g(this.idx, 6, (n) => new Uint32Array(n));
    this.cap = cap;
  }

  reset(): void {
    this.quads = 0;
  }

  /** Reserve one quad; returns its index. */
  next(): number {
    if (this.quads >= this.cap) this.grow(this.cap * 2);
    return this.quads++;
  }

  extract(): FaceBuffers {
    const n = this.quads;
    const v = n * 4;
    return {
      position: this.pos.slice(0, v * 3),
      normal: this.nrm.slice(0, v * 3),
      uv: this.uv.slice(0, v * 2),
      ao: this.ao.slice(0, v),
      face: this.face.slice(0, v),
      index: this.idx.slice(0, n * 6),
    };
  }
}

const opaqueBuf = new PassBuffer(4096);
const transBuf = new PassBuffer(1024);
let tops = new Int32Array(4 * 512);
let topCount = 0;

/** Y range of the last meshed chunk (for bounding boxes). */
export const meshBounds = { minY: 0, maxY: 0 };

/**
 * Mergeable faces per dir, indexed [y][z][x] in chunk space.
 * Value = key + 1 (0 = nothing to merge here). key = id<<4 | ao<<1 | lowered.
 */
const MASK = new Uint32Array(6 * CS * CS * H);
const MI = (f: number, x: number, y: number, z: number) => ((f * H + y) * CS + z) * CS + x;
const aoTmp = new Uint8Array(4);

function emitQuad(
  buf: PassBuffer,
  f: number,
  id: number,
  x: number,
  y: number,
  z: number,
  du: number,
  dv: number,
  ao4: Uint8Array,
  lowered: boolean,
  x0: number,
  z0: number,
): void {
  const q = buf.next();
  const v = q * 4;
  const n = NORMALS[f];
  const fb = f * 12;
  const ua = U_AXIS[f];
  const va = V_AXIS[f];
  const code = id * 8 + f;
  const ext = [1, 1, 1];
  ext[ua] = du;
  ext[va] = dv;
  for (let c = 0; c < 4; c++) {
    const vi = v + c;
    const p3 = vi * 3;
    const cx = CORNER[fb + c * 3] * ext[0];
    const cyRaw = CORNER[fb + c * 3 + 1];
    const cz = CORNER[fb + c * 3 + 2] * ext[2];
    // y extent: side faces may span several blocks; water tops sit lower
    const cy = cyRaw * ext[1];
    const top = cyRaw === 1;
    const py = y + (top && lowered ? cy - (1 - WATER_TOP) : cy);
    buf.pos[p3] = x0 + x + cx;
    buf.pos[p3 + 1] = py;
    buf.pos[p3 + 2] = z0 + z + cz;
    buf.nrm[p3] = n[0];
    buf.nrm[p3 + 1] = n[1];
    buf.nrm[p3 + 2] = n[2];
    const uu = CORNER_UV[f * 8 + c * 2] * du;
    let vv = CORNER_UV[f * 8 + c * 2 + 1] * dv;
    if (lowered && va === 1 && top) vv -= 1 - WATER_TOP;
    buf.uv[vi * 2] = uu;
    buf.uv[vi * 2 + 1] = vv;
    buf.ao[vi] = AO_VALUE[ao4[c]];
    buf.face[vi] = code;
  }
  const k = q * 6;
  // flip the diagonal so AO interpolates without a visible crease
  if (ao4[0] + ao4[2] < ao4[1] + ao4[3]) {
    buf.idx[k] = v + 1;
    buf.idx[k + 1] = v + 2;
    buf.idx[k + 2] = v + 3;
    buf.idx[k + 3] = v + 1;
    buf.idx[k + 4] = v + 3;
    buf.idx[k + 5] = v;
  } else {
    buf.idx[k] = v;
    buf.idx[k + 1] = v + 1;
    buf.idx[k + 2] = v + 2;
    buf.idx[k + 3] = v;
    buf.idx[k + 4] = v + 2;
    buf.idx[k + 5] = v + 3;
  }
}

/**
 * Builds the geometry for one padded chunk. Output positions are world-space
 * (chunk min corner at x0, z0).
 */
export function meshChunk(pad: Uint8Array, cx: number, cz: number): ChunkGeometry {
  opaqueBuf.reset();
  transBuf.reset();
  topCount = 0;
  MASK.fill(0);
  const x0 = cx * CS;
  const z0 = cz * CS;
  let minY = H;
  let maxY = 0;

  // pass 1: visible faces; non-uniform AO goes straight out, the rest to MASK
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < CS; z++) {
      let i = (y + 1) * SY + (z + 1) * SZ + 1;
      for (let x = 0; x < CS; x++, i++) {
        const id = pad[i];
        if (id === 0) continue;
        const kind = KIND[id];
        if (kind === KIND_AIR) continue;
        const above = pad[i + SY];
        if (SOLID[id] && above === B.AIR) {
          if (topCount * 4 >= tops.length) {
            const t = new Int32Array(tops.length * 2);
            t.set(tops);
            tops = t;
          }
          const t4 = topCount++ * 4;
          tops[t4] = x0 + x;
          tops[t4 + 1] = y;
          tops[t4 + 2] = z0 + z;
          tops[t4 + 3] = id;
        }
        const lowered = kind === KIND_WATER && KIND[above] !== KIND_WATER;
        let any = false;

        for (let f = 0; f < 6; f++) {
          const nk = KIND[pad[i + FACE_DELTA[f]]];
          if (kind === KIND_OPAQUE) {
            if (nk === KIND_OPAQUE) continue;
          } else if (kind === KIND_WATER) {
            if (!(nk === KIND_AIR || (f === 2 && nk === KIND_GLASS))) continue;
          } else if (nk !== KIND_AIR && nk !== KIND_WATER) continue;
          any = true;

          // ambient occlusion per corner (0 = darkest, 3 = open)
          const fb = f * 12;
          for (let c = 0; c < 4; c++) {
            const s1 = KIND[pad[i + AO_DELTA[fb + c * 3]]] === KIND_OPAQUE ? 1 : 0;
            const s2 = KIND[pad[i + AO_DELTA[fb + c * 3 + 1]]] === KIND_OPAQUE ? 1 : 0;
            const cc = KIND[pad[i + AO_DELTA[fb + c * 3 + 2]]] === KIND_OPAQUE ? 1 : 0;
            aoTmp[c] = s1 && s2 ? 0 : 3 - s1 - s2 - cc;
          }
          if (aoTmp[0] === aoTmp[1] && aoTmp[1] === aoTmp[2] && aoTmp[2] === aoTmp[3]) {
            MASK[MI(f, x, y, z)] = ((id << 4) | (aoTmp[0] << 1) | (lowered ? 1 : 0)) + 1;
          } else {
            emitQuad(kind === KIND_OPAQUE ? opaqueBuf : transBuf, f, id, x, y, z, 1, 1, aoTmp, lowered, x0, z0);
          }
        }
        if (any) {
          if (y < minY) minY = y;
          if (y + 1 > maxY) maxY = y + 1;
        }
      }
    }
  }

  // pass 2: greedy merge in each face plane
  for (let f = 0; f < 6; f++) {
    const ua = U_AXIS[f];
    const va = V_AXIS[f];
    const na = 3 - ua - va;
    const size = [CS, H, CS];
    const nU = size[ua];
    const nV = size[va];
    const nN = size[na];
    const p = [0, 0, 0];
    for (let s = 0; s < nN; s++) {
      p[na] = s;
      for (let b = 0; b < nV; b++) {
        for (let a = 0; a < nU; ) {
          p[ua] = a;
          p[va] = b;
          const key = MASK[MI(f, p[0], p[1], p[2])];
          if (key === 0) {
            a++;
            continue;
          }
          // width along u
          let w = 1;
          while (a + w < nU) {
            p[ua] = a + w;
            if (MASK[MI(f, p[0], p[1], p[2])] !== key) break;
            w++;
          }
          // height along v
          let h = 1;
          // a lowered water top only spans one block vertically on side faces
          const canGrowV = !((key - 1) & 1 && va === 1);
          outer: while (canGrowV && b + h < nV) {
            p[va] = b + h;
            for (let k = 0; k < w; k++) {
              p[ua] = a + k;
              if (MASK[MI(f, p[0], p[1], p[2])] !== key) break outer;
            }
            h++;
          }
          for (let j = 0; j < h; j++) {
            p[va] = b + j;
            for (let k = 0; k < w; k++) {
              p[ua] = a + k;
              MASK[MI(f, p[0], p[1], p[2])] = 0;
            }
          }
          const k0 = key - 1;
          const id = k0 >>> 4;
          const ao = (k0 >>> 1) & 7;
          aoTmp[0] = aoTmp[1] = aoTmp[2] = aoTmp[3] = ao;
          p[ua] = a;
          p[va] = b;
          emitQuad(KIND[id] === KIND_OPAQUE ? opaqueBuf : transBuf, f, id, p[0], p[1], p[2], w, h, aoTmp, (k0 & 1) === 1, x0, z0);
          a += w;
        }
      }
    }
  }

  meshBounds.minY = minY > maxY ? 0 : minY;
  meshBounds.maxY = maxY;
  return {
    cx,
    cz,
    opaque: opaqueBuf.extract(),
    transparent: transBuf.extract(),
    tops: tops.slice(0, topCount * 4),
  };
}
