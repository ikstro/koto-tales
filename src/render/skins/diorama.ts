/**
 * Diorama skin: the world as a golden-hour toy-brick diorama.
 *
 *  - a warm palette of its own: grass is a per-brick mosaic of olive, moss and
 *    mustard; every tree crown picks one tone family (dark green, olive or
 *    golden); sandstone cliffs in layers; golden sand; teal water that turns
 *    light and foamy against the shore;
 *  - a low warm sun with long soft shadows, warm haze, a teal-shadow /
 *    warm-highlight grade and a stronger tilt-shift;
 *  - roundness: a wide rounded bevel on every brick; studs on the ground drawn
 *    by the brick shader itself (a tiny ray-cast cylinder per brick: real
 *    silhouette, side wall and shadow, no triangles); near the camera the
 *    crowns, bushes, flowers, tufts and shore foam are instanced ROUND pieces,
 *    all from one low-poly geometry, one InstancedMesh per chunk.
 *
 * CPU (pieces) and GPU (brick faces) pick tones with the same integer hashes.
 * Tree crowns: decorate() finds each crown's centre from the chunk's tops and
 * writes the tree's family into a small world-wrapped map the shader reads, so
 * a crown is one family even where it crosses the 5-block tree grid.
 */
import * as THREE from 'three';
import { SEA_LEVEL, type ChunkGeometry, type QualityTier, type Skin } from '../../contracts';
import { BLOCKS, B, type Surface } from '../../world/blocks';
import { brickHash, buildLookupTexture, createStyledBrickSkin, F_STUDLESS, lookOf, skyKey } from './brickSkin';
import { LEAF_PIECES, injectCutaway } from './cutaway';
import { getPixelAtlas } from './pixelAtlas';
import { brickFlags, roughnessOf, toyColor } from './toy';

// --- palette ---------------------------------------------------------------------

const K = { NONE: 0, GRASS: 1, GRASS_SIDE: 2, EARTH: 3, STONE: 4, SAND: 5, LEAVES: 6, WATER: 7, SNOW: 8, LANTERN: 9 } as const;

const hex = (list: string[]) => list.map((h) => new THREE.Color(h));

/** Dark → light. The ground is a mosaic of these, patch by patch, brick by brick. */
const GRASS = hex(['#4f5d29', '#5d682c', '#6c7230', '#7c7b33', '#8d8537', '#a5943f']);
/** Three tone families, three tones each: dark green, olive, golden. */
const LEAF = hex([
  '#2c461c', '#3a5623', '#4b6629', // dark green
  '#63752a', '#78852d', '#8d9132', // olive
  '#a58c25', '#bf9f2b', '#d6b636', // golden
]);
/** Sandstone layers. */
const STONE = hex(['#c4924e', '#d6aa62', '#b78044', '#e0ba74']);
const SAND = hex(['#e3bb72', '#eac67f', '#d6ad66']);
const SHALLOW = new THREE.Color('#47a9bd');
const FOAM = new THREE.Color('#f6f1e2');

/** Base colours of natural surfaces (built blocks keep their toy colours). */
const NATURAL: Partial<Record<Surface, string>> = {
  grass: '#6c7230',
  'grass-side': '#bb874a', // ochre earth under the green plate
  earth: '#a46d3c',
  sand: '#e3bb72',
  stone: '#c4924e',
  snow: '#f7f0e2',
  bark: '#6a4224',
  'wood-rings': '#c99256',
  leaves: '#63752a',
  water: '#1f68a0',
};
const EARTH_TOP = '#8e5c33';

const KIND_OF: Partial<Record<Surface, number>> = {
  grass: K.GRASS,
  'grass-side': K.GRASS_SIDE,
  earth: K.EARTH,
  stone: K.STONE,
  sand: K.SAND,
  leaves: K.LEAVES,
  water: K.WATER,
  snow: K.SNOW,
  lantern: K.LANTERN,
};

/** The lantern block: a dark moulded frame, warm glass, a bright core (render/lanterns.ts adds the cap and glow). */
const LANTERN_METAL = new THREE.Color('#3b302b');
const LANTERN_GLASS = new THREE.Color('#e88a1c');
const LANTERN_WARM = new THREE.Color('#ffc458');
const LANTERN_CORE = new THREE.Color('#fff3c4');

const fdiv = (a: number, b: number) => Math.floor(a / b);

// --- tree family map ---------------------------------------------------------------

/** World-wrapped 256×256 map: R = crown family + 1, G = which 256-tile it belongs to. */
const TREE_N = 256;
const treeTag = (x: number, z: number) => ((x >> 8) & 15) | (((z >> 8) & 15) << 4);
const familyOfHash = (h: number) => {
  const f = h % 8;
  return f < 3 ? 0 : f < 6 ? 1 : 2;
};

// Tone pickers. Each has a GLSL twin below; keep them in step.
function grassIdx(x: number, z: number): number {
  const p5 = brickHash(fdiv(x, 6), 7, fdiv(z, 6));
  const p3 = brickHash(fdiv(x + 1, 3), 11, fdiv(z + 2, 3));
  const r = brickHash(x, 3, z) & 7;
  let t = 1 + (p5 % 3) + (p3 % 2);
  if (r === 0) t -= 1;
  else if (r === 1) t += 1;
  return Math.min(5, Math.max(0, t));
}

const glslColor = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const glslArray = (name: string, list: THREE.Color[]) =>
  `const vec3 ${name}[${list.length}] = vec3[${list.length}](${list.map(glslColor).join(', ')});`;

/** Low warm sun from the left and a little behind: long shadows falling right, towards the camera. */
const SUN_DIR = new THREE.Vector3(-28, 20, -6).normalize();
const STUD_R = 0.27;
const STUD_H = 0.17;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uTreeMap;
uniform float uStuds;
uniform float uStudShade;
${glslArray('D_GRASS', GRASS)}
${glslArray('D_LEAF', LEAF)}
${glslArray('D_STONE', STONE)}
${glslArray('D_SAND', SAND)}
const vec3 D_SHALLOW = ${glslColor(SHALLOW)};
const vec3 D_FOAM = ${glslColor(FOAM)};
const vec3 D_L_METAL = ${glslColor(LANTERN_METAL)};
const vec3 D_L_GLASS = ${glslColor(LANTERN_GLASS)};
const vec3 D_L_WARM = ${glslColor(LANTERN_WARM)};
const vec3 D_L_CORE = ${glslColor(LANTERN_CORE)};
/** Lantern faces: a frame on the edges (posts, bands; the top is the cap's rim), warm glass, a hot core. */
vec3 dLantern(vec2 uv, vec3 n) {
  vec2 e = min(uv, 1.0 - uv);
  if (n.y < -0.5) return D_L_METAL;
  if (n.y > 0.5) {
    // from above: the cap's rim, a thin glowing gap, the cap itself (the roof piece sits on it)
    float m = min(e.x, e.y);
    float gap = smoothstep(0.1, 0.12, m) * (1.0 - smoothstep(0.19, 0.21, m));
    return mix(D_L_METAL, D_L_WARM * 1.15, gap);
  }
  float post = 1.0 - smoothstep(0.12, 0.145, e.x);
  float band = max(1.0 - smoothstep(0.11, 0.135, uv.y), smoothstep(0.8, 0.825, uv.y));
  float frame = max(post, band);
  vec2 q = (uv - vec2(0.5, 0.46)) * vec2(1.0, 0.8);
  float r = length(q);
  vec3 glass = mix(D_L_GLASS, D_L_WARM, 1.0 - smoothstep(0.08, 0.42, r));
  glass = mix(glass, D_L_CORE * 1.35, pow(1.0 - smoothstep(0.0, 0.2, r), 1.5));
  // a soft glint down the left of the pane
  glass += vec3(0.25, 0.2, 0.1) * (1.0 - smoothstep(0.0, 0.025, abs(uv.x - 0.23))) * step(0.22, uv.y) * step(uv.y, 0.7);
  return mix(glass * 0.8, D_L_METAL, frame);
}
const vec3 D_SUN = vec3(${SUN_DIR.x.toFixed(4)}, ${SUN_DIR.y.toFixed(4)}, ${SUN_DIR.z.toFixed(4)});
int dDiv(int a, int b) { return int(floor(float(a) / float(b))); }
int dGrass(ivec3 c) {
  uint p5 = toyHash(ivec3(dDiv(c.x, 6), 7, dDiv(c.z, 6)));
  uint p3 = toyHash(ivec3(dDiv(c.x + 1, 3), 11, dDiv(c.z + 2, 3)));
  uint r = toyHash(ivec3(c.x, 3, c.z)) & 7u;
  int t = 1 + int(p5 % 3u) + int(p3 % 2u);
  if (r == 0u) t -= 1; else if (r == 1u) t += 1;
  return clamp(t, 0, 5);
}
int dFamily(ivec3 c) {
  vec4 m = texelFetch(uTreeMap, ivec2(c.x & 255, c.z & 255), 0);
  int fam = int(m.r * 255.0 + 0.5);
  int tag = int(m.g * 255.0 + 0.5);
  if (fam > 0 && tag == (((c.x >> 8) & 15) | (((c.z >> 8) & 15) << 4))) return fam - 1;
  uint f = toyHash(ivec3(dDiv(c.x, 5), 5, dDiv(c.z, 5))) % 8u;
  return f < 3u ? 0 : (f < 6u ? 1 : 2);
}
int dLeaf(ivec3 c) {
  uint t = (toyHash(c) >> 4u) % 5u;
  int k = t < 2u ? 1 : (t < 4u ? (t == 2u ? 0 : 2) : 1);
  return dFamily(c) * 3 + k;
}
int dStone(ivec3 c) {
  uint layer = toyHash(ivec3(dDiv(c.x, 7), c.y, dDiv(c.z, 7))) % 4u;
  uint r = toyHash(c) & 7u;
  return int(r == 0u ? (layer + 1u) % 4u : layer);
}
int dSand(ivec3 c) {
  uint r = (toyHash(c) >> 5u) % 5u;
  return r < 3u ? 0 : (r == 3u ? 1 : 2);
}
`;

const COLOR_HOOK = /* glsl */ `
    if (toyKind == ${K.GRASS} || (toyKind == ${K.GRASS_SIDE} && fuv.y > 0.78)) col = D_GRASS[dGrass(toyCell)];
    else if (toyKind == ${K.LEAVES}) col = D_LEAF[dLeaf(toyCell)];
    else if (toyKind == ${K.STONE}) col = D_STONE[dStone(toyCell)];
    else if (toyKind == ${K.SAND}) col = D_SAND[dSand(toyCell)];
    else if (toyKind == ${K.LANTERN}) {
      col = dLantern(fuv, vFn);
      calm = 0.3;
    }
    else if (toyKind == ${K.WATER}) {
      // against the shore the water is light and foamy (AO = land right next to it)
      float shore = 1.0 - vAo;
      float n = float((h >> 3u) & 15u) / 15.0;
      col = mix(col, D_SHALLOW, smoothstep(0.0, 0.45, shore));
      col = mix(col, D_FOAM, smoothstep(0.55, 0.95, shore + n * 0.25) * 0.85);
      col *= 0.95 + 0.1 * n;
      // a few whitecaps out on the open water
      if ((h & 63u) == 0u) col = mix(col, D_FOAM, (1.0 - smoothstep(0.22, 0.3, length(fuv - 0.5))) * 0.7);
      toyAo = 1.0;
      calm = 0.15;
    }
    // the thin strip of a shore block just above the water line is surf
    if (toyKind != ${K.WATER} && abs(vFn.y) < 0.5 && toyCell.y == ${SEA_LEVEL}) {
      float wy = vCellPos.y - float(${SEA_LEVEL});
      col = mix(col, D_FOAM, smoothstep(0.62, 0.8, wy) * 0.9);
    }
    // warm, not grey, in the corners
    col *= mix(vec3(1.0), vec3(1.08, 0.98, 0.86), 1.0 - vAo);
`;

/** A wide rounded bevel: the normal follows a quarter circle towards each edge. */
const BEVEL = /* glsl */ `
    vec2 bev = clamp(1.0 - ed / 0.21, 0.0, 1.0);
    vec2 tq = bev / sqrt(max(1.0 - bev * bev, 0.1));
    toyTilt = sign(fuv - 0.5) * tq * near;
    float seam = 1.0 - smoothstep(0.0, max(0.028, fw.x + fw.y), min(ed.x, ed.y));
`;

/**
 * Studs without triangles: on a top face, the view ray is tested against the
 * brick's stud cylinder (cap with a rounded rim, then side wall). Where it
 * misses, the ground gets a contact shade and the stud's own sun shadow.
 */
const STUD_HOOK = /* glsl */ `
    if (uStuds > 0.5 && vFn.y > 0.5 && toyKind != ${K.LEAVES} && (toyFlags & ${F_STUDLESS}) == 0) {
      float sf = 1.0 - smoothstep(0.045, 0.11, max(fw.x, fw.y));
      if (sf > 0.0) {
        const float SR = ${STUD_R.toFixed(3)};
        const float SH = ${STUD_H.toFixed(3)};
        vec3 P = vCellPos + vFn * 0.5;
        vec2 C = floor(vCellPos.xz) + 0.5;
        vec3 D = normalize(P - cameraPosition);
        vec3 studN = vec3(0.0);
        float tc = (P.y + SH - cameraPosition.y) / D.y;
        vec2 dq = cameraPosition.xz + D.xz * tc - C;
        float rq = length(dq);
        if (rq < SR) {
          float e = smoothstep(0.7, 1.0, rq / SR);
          studN = normalize(vec3(0.0, 1.0, 0.0) + vec3(dq.x, 0.0, dq.y) / max(rq, 1e-4) * e * 1.4);
          col *= 1.03;
        } else {
          vec2 o = cameraPosition.xz - C;
          float a = dot(D.xz, D.xz);
          float b = dot(o, D.xz);
          float c = dot(o, o) - SR * SR;
          float disc = b * b - a * c;
          if (disc > 0.0) {
            float t = (-b - sqrt(disc)) / a;
            float sy = cameraPosition.y + D.y * t;
            if (sy > P.y && sy < P.y + SH) {
              vec2 s = (o + D.xz * t) / SR;
              studN = normalize(vec3(s.x, 0.12, s.y));
              // a little darker towards the foot, like a real moulded stud
              col *= mix(0.86, 1.0, (sy - P.y) / SH);
            }
          }
        }
        if (dot(studN, studN) > 0.0) {
          toyNW = normalize(mix(vFn, studN, sf));
          toyOverride = 1.0;
        } else {
          vec2 w = P.xz - C;
          float rp = length(w);
          col *= 1.0 - (1.0 - smoothstep(SR, SR + 0.08, rp)) * 0.16 * sf;
          // the stud's own sun shadow on its brick
          vec2 L = D_SUN.xz;
          float tmax = SH / D_SUN.y;
          float tt = clamp(-dot(w, L) / dot(L, L), 0.0, tmax);
          float dmin = length(w + L * tt);
          col *= 1.0 - (1.0 - smoothstep(SR - 0.03, SR + 0.03, dmin)) * uStudShade * sf;
        }
      }
    }
`;

function buildLookup(): THREE.DataTexture {
  return buildLookupTexture((id, dir) => {
    if (id === B.AIR) return null;
    const look = lookOf(id, dir);
    const natural = NATURAL[look.surface];
    let color = natural ? new THREE.Color(natural) : toyColor(look.color);
    // dirt seen from above (under trees, dug spots) is darker than the ochre sides
    if (look.surface === 'earth' && dir === 2) color = new THREE.Color(EARTH_TOP);
    let rough = roughnessOf(look, false);
    if (natural && look.surface !== 'water') rough = Math.max(rough, 0.46);
    return {
      tileX: 0,
      tileY: 0,
      flags: brickFlags(id, look, false),
      roughness: rough,
      color,
      kind: KIND_OF[look.surface] ?? K.NONE,
    };
  });
}

// --- round pieces ------------------------------------------------------------------

/**
 * One round piece: radius 1, height 1, standing on y = 0, a rounded shoulder
 * into a flat cap. Scaled per instance it is a round plate, a round brick, a
 * flower or a stalk. 8 sides, 38 triangles, smooth normals.
 */
function pieceGeometry(sides = 8): THREE.BufferGeometry {
  const rings: [number, number, number, number][] = [
    // radius, y, normal radial, normal up
    [1, -0.05, 1, 0],
    [1, 0.66, 1, 0.3],
    [0.8, 1, 0.45, 1],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const [r, y, nr, nu] of rings) {
    const l = Math.hypot(nr, nu);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      pos.push(s * r, y, c * r);
      nor.push((s * nr) / l, nu / l, (c * nr) / l);
    }
  }
  const cap = pos.length / 3;
  for (let j = 0; j < sides; j++) {
    const a = (j / sides) * Math.PI * 2;
    pos.push(Math.sin(a) * 0.8, 1, Math.cos(a) * 0.8);
    nor.push(0, 1, 0);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      idx.push(a, b, b + sides, a, b + sides, a + sides);
    }
  }
  for (let j = 1; j < sides - 1; j++) idx.push(cap, cap + j, cap + j + 1);
  // make every triangle face outwards (the vertex normals say where out is)
  const v = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const n = (k: number) => new THREE.Vector3(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const fn = v(b).sub(v(a)).cross(v(c).sub(v(a)));
    if (fn.dot(n(a).add(n(b)).add(n(c))) < 0) {
      idx[t + 1] = c;
      idx[t + 2] = b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Rotations that stand a piece on a face: up, +x, -x, +z, -z. */
const UP = new THREE.Vector3(0, 1, 0);
const FACE_Q = [
  new THREE.Quaternion(),
  new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0)),
  new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(-1, 0, 0)),
  new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0, 0, 1)),
  new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0, 0, -1)),
];
const SIDE_DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 2],
  [0, 1, 3],
  [0, -1, 4],
];

/** Small deterministic random stream from a seed. */
function stream(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const FLOWER = hex(['#f4c430', '#fbf3df', '#ef8fb0', '#f0a33a']);
const STEM = new THREE.Color('#4f6a26');
const TUFT = hex(['#6f7f2a', '#8a8f30', '#ab9a38', '#5e7428']);

function makeDresser() {
  const geo = pieceGeometry(8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0 });
  // crown pieces go with their leaf blocks when the crowns open around the hero
  mat.onBeforeCompile = (shader) => injectCutaway(shader, LEAF_PIECES);
  mat.customProgramCacheKey = () => 'diorama-piece-cut';

  const treeData = new Uint8Array(TREE_N * TREE_N * 2);
  const treeTex = new THREE.DataTexture(treeData, TREE_N, TREE_N, THREE.RGFormat, THREE.UnsignedByteType);
  treeTex.magFilter = THREE.NearestFilter;
  treeTex.minFilter = THREE.NearestFilter;
  treeTex.generateMipmaps = false;
  treeTex.needsUpdate = true;

  const leafFamily = (x: number, z: number): number => {
    const i = ((z & 255) * TREE_N + (x & 255)) * 2;
    if (treeData[i] > 0 && treeData[i + 1] === treeTag(x, z)) return treeData[i] - 1;
    return familyOfHash(brickHash(fdiv(x, 5), 5, fdiv(z, 5)));
  };

  // instance buffers, reused between chunks
  let cap = 4096;
  let mats = new Float32Array(cap * 16);
  let cols = new Float32Array(cap * 3);
  let cuts = new Float32Array(cap);
  let n = 0;
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const tmp = new THREE.Color();
  const push = (x: number, y: number, z: number, q: number, rx: number, h: number, c: THREE.Color, leaf = 0) => {
    if (n === cap) {
      cap *= 2;
      const nm = new Float32Array(cap * 16);
      nm.set(mats);
      mats = nm;
      const nc = new Float32Array(cap * 3);
      nc.set(cols);
      cols = nc;
      const nl = new Float32Array(cap);
      nl.set(cuts);
      cuts = nl;
    }
    m4.compose(p.set(x, y, z), FACE_Q[q], s.set(rx, h, rx));
    m4.toArray(mats, n * 16);
    cols[n * 3] = c.r;
    cols[n * 3 + 1] = c.g;
    cols[n * 3 + 2] = c.b;
    cuts[n] = leaf;
    n++;
  };

  const colTop = new Int16Array(256);
  const colId = new Uint8Array(256);

  const leafTone = (out: THREE.Color, fam: number, r: () => number) => {
    let f = fam;
    if (r() < 0.06) f = (fam + 1) % 3; // a few pieces of the neighbour family, like a real build
    const t = r();
    out.copy(LEAF[f * 3 + (t < 0.3 ? 0 : t < 0.75 ? 1 : 2)]);
    return out.multiplyScalar(0.94 + r() * 0.12);
  };

  function crownTop(x: number, y: number, z: number, light: boolean) {
    const r = stream(brickHash(x, y + 977, z));
    const fam = leafFamily(x, z);
    const cx = x + 0.5 + (r() - 0.5) * 0.24;
    const cz = z + 0.5 + (r() - 0.5) * 0.24;
    push(cx, y + 1, cz, 0, 0.3 + r() * 0.12, 0.22 + r() * 0.22, leafTone(tmp, fam, r), 1);
    if (light) return;
    const u = r();
    if (u < 0.6) {
      const a = r() * Math.PI * 2;
      push(x + 0.5 + Math.cos(a) * 0.27, y + 1, z + 0.5 + Math.sin(a) * 0.27, 0, 0.17 + r() * 0.08, 0.3 + r() * 0.3, leafTone(tmp, fam, r), 1);
    }
    if (u < 0.2) {
      const a = r() * Math.PI * 2;
      push(x + 0.5 + Math.cos(a) * 0.3, y + 1, z + 0.5 + Math.sin(a) * 0.3, 0, 0.14 + r() * 0.06, 0.18 + r() * 0.2, leafTone(tmp, fam, r), 1);
    }
  }

  function crownSide(x: number, y: number, z: number, d: [number, number, number], r: () => number, fam: number) {
    const [dx, dz, q] = d;
    const along = (r() - 0.5) * 0.36;
    const px = x + 0.5 + dx * 0.5 + (dz !== 0 ? along : 0);
    const pz = z + 0.5 + dz * 0.5 + (dx !== 0 ? along : 0);
    push(px, y + 0.5 + (r() - 0.5) * 0.3, pz, q, 0.28 + r() * 0.12, 0.14 + r() * 0.2, leafTone(tmp, fam, r), 1);
  }

  function bush(x: number, y: number, z: number, r: () => number) {
    const u = r();
    const fam = u < 0.5 ? 1 : u < 0.8 ? 0 : 2;
    const k = 3 + Math.floor(r() * 3);
    push(x + 0.5, y + 1, z + 0.5, 0, 0.3 + r() * 0.08, 0.45 + r() * 0.2, leafTone(tmp, fam, r));
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r();
      const d = 0.22 + r() * 0.12;
      push(x + 0.5 + Math.cos(a) * d, y + 1, z + 0.5 + Math.sin(a) * d, 0, 0.17 + r() * 0.08, 0.22 + r() * 0.25, leafTone(tmp, fam, r));
    }
  }

  function flowers(x: number, y: number, z: number, r: () => number) {
    const k = 1 + Math.floor(r() * 3);
    const c = FLOWER[Math.floor(r() * FLOWER.length)];
    for (let i = 0; i < k; i++) {
      const fx = x + 0.2 + r() * 0.6;
      const fz = z + 0.2 + r() * 0.6;
      const h = 0.18 + r() * 0.2;
      push(fx, y + 1, fz, 0, 0.045, h, STEM);
      push(fx, y + 1 + h, fz, 0, 0.12 + r() * 0.05, 0.07, c);
    }
  }

  function tuft(x: number, y: number, z: number, r: () => number) {
    const k = 3 + Math.floor(r() * 3);
    const cx = x + 0.3 + r() * 0.4;
    const cz = z + 0.3 + r() * 0.4;
    for (let i = 0; i < k; i++) {
      tmp.copy(TUFT[Math.floor(r() * TUFT.length)]);
      push(cx + (r() - 0.5) * 0.3, y + 1, cz + (r() - 0.5) * 0.3, 0, 0.045 + r() * 0.02, 0.3 + r() * 0.45, tmp);
    }
  }

  function foam(x: number, z: number, dx: number, dz: number, r: () => number) {
    const y = SEA_LEVEL + 0.9 - 0.03;
    const k = 1 + Math.floor(r() * 2.5);
    for (let i = 0; i < k; i++) {
      const along = (r() - 0.5) * 0.8;
      const out = 0.3 - r() * 0.35;
      const px = x + 0.5 + dx * out + (dz !== 0 ? along : 0);
      const pz = z + 0.5 + dz * out + (dx !== 0 ? along : 0);
      tmp.copy(FOAM).multiplyScalar(0.94 + r() * 0.06);
      push(px, y, pz, 0, 0.14 + r() * 0.16, 0.05 + r() * 0.03, tmp);
    }
  }

  /** Finds crown centres (the top "plus" of a tree) and writes each tree's family under its crown. */
  function learnTrees(x0: number, z0: number, tops: Int32Array) {
    let changed = false;
    const at = (lx: number, lz: number) => (lx < 0 || lx > 15 || lz < 0 || lz > 15 ? -2 : colTop[(lz << 4) | lx]);
    for (let i = 0; i < tops.length; i += 4) {
      if (tops[i + 3] !== B.LEAVES) continue;
      const x = tops[i];
      const y = tops[i + 1];
      const z = tops[i + 2];
      const lx = x - x0;
      const lz = z - z0;
      if (colTop[(lz << 4) | lx] !== y) continue;
      let arms = 0;
      let ok = true;
      for (const [dx, dz] of SIDE_DIRS) {
        const t = at(lx + dx, lz + dz);
        if (t === -2) continue;
        if (t === y && colId[((lz + dz) << 4) | (lx + dx)] === B.LEAVES) arms++;
        else ok = false;
      }
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const t = at(lx + dx, lz + dz);
        if (t !== -2 && t >= y) ok = false;
      }
      if (!ok || arms < 2) continue;
      const fam = familyOfHash(brickHash(x, 13, z)) + 1;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const wx = x + dx;
          const wz = z + dz;
          const k = ((wz & 255) * TREE_N + (wx & 255)) * 2;
          const tag = treeTag(wx, wz);
          if (treeData[k] !== fam || treeData[k + 1] !== tag) {
            treeData[k] = fam;
            treeData[k + 1] = tag;
            changed = true;
          }
        }
      }
    }
    if (changed) treeTex.needsUpdate = true;
  }

  return {
    treeTex,
    decorate(g: ChunkGeometry, dist: number, tier: QualityTier): THREE.Object3D | null {
      const tops = g.tops;
      const x0 = g.cx * 16;
      const z0 = g.cz * 16;
      colTop.fill(-1);
      for (let i = 0; i < tops.length; i += 4) {
        const c = ((tops[i + 2] - z0) << 4) | (tops[i] - x0);
        if (tops[i + 1] > colTop[c]) {
          colTop[c] = tops[i + 1];
          colId[c] = tops[i + 3];
        }
      }
      learnTrees(x0, z0, tops);
      if (tier !== 1) return null;

      const full = dist <= 1;
      n = 0;
      const topAt = (x: number, z: number) => {
        const lx = x - x0;
        const lz = z - z0;
        return lx < 0 || lx > 15 || lz < 0 || lz > 15 ? -1 : colTop[(lz << 4) | lx];
      };

      for (let i = 0; i < tops.length; i += 4) {
        const x = tops[i];
        const y = tops[i + 1];
        const z = tops[i + 2];
        const id = tops[i + 3];
        if (id === B.LEAVES) {
          crownTop(x, y, z, !full);
          if (!full) continue;
          const r = stream(brickHash(x, y + 331, z));
          const fam = leafFamily(x, z);
          let open = 0;
          for (const d of SIDE_DIRS) if (topAt(x + d[0], z + d[1]) < y) open++;
          for (const d of SIDE_DIRS) {
            const nt = topAt(x + d[0], z + d[1]);
            if (nt >= y) continue;
            crownSide(x, y, z, d, r, fam);
            // the layer below is crown too, except under a ragged corner
            if (nt < y - 1 && open < 2 && r() < 0.75) crownSide(x, y - 1, z, d, r, fam);
          }
          continue;
        }
        if (!full || id !== B.GRASS) continue;
        const h = brickHash(x, y + 101, z);
        const u = (h & 0xffff) / 65536;
        if (u >= 0.12) continue;
        const r = stream(h);
        if (u < 0.04) bush(x, y, z, r);
        else if (u < 0.075) flowers(x, y, z, r);
        else tuft(x, y, z, r);
      }

      // shoreline foam: water columns (no top at all) next to land at water level or above
      if (full) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            if (colTop[(lz << 4) | lx] !== -1) continue;
            const x = x0 + lx;
            const z = z0 + lz;
            for (const d of SIDE_DIRS) {
              const nlx = lx + d[0];
              const nlz = lz + d[1];
              if (nlx < 0 || nlx > 15 || nlz < 0 || nlz > 15) continue;
              if (colTop[(nlz << 4) | nlx] < SEA_LEVEL) continue;
              foam(x, z, d[0], d[1], stream(brickHash(x, 7, z) ^ Math.imul(d[2], 0x9e3779b1)));
            }
          }
        }
      }

      if (n === 0) return null;
      const mesh = new THREE.InstancedMesh(geo.clone(), mat, n);
      (mesh.instanceMatrix.array as Float32Array).set(mats.subarray(0, n * 16));
      mesh.instanceColor = new THREE.InstancedBufferAttribute(cols.slice(0, n * 3), 3);
      mesh.geometry.setAttribute('aCut', new THREE.InstancedBufferAttribute(cuts.slice(0, n), 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.matrixAutoUpdate = false;
      mesh.name = `diorama:${g.cx},${g.cz}`;
      return mesh;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      treeTex.dispose();
    },
  };
}

// --- light -----------------------------------------------------------------------

// sky (clear colour), hemi sky, hemi ground, hemi, sun, sun intensity, env, shadow, haze
const DAY = skyKey('#e9dcb8', '#e8ecdc', '#6e5a32', 0.55, '#ffd9a0', 5.4, 0.11, 0.9, '#ead7a8');
const DUSK = skyKey('#e9a46e', '#f0c4a8', '#5e4044', 0.55, '#ff8a3a', 4.2, 0.09, 0.85, '#e39d68');
const NIGHT = skyKey('#25244d', '#8088e6', '#3a3064', 0.75, '#9fb0ff', 1.1, 0.07, 0.5, '#2a2856');

/** Warm highlights, slightly teal shadows, a touch more colour, a soft vignette. */
const GRADE = /* glsl */ `
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.08), 0.0);
  float hi = smoothstep(0.03, 0.55, l);
  c *= mix(vec3(0.93, 1.0, 1.06), vec3(1.05, 1.0, 0.95), hi);
  c *= mix(1.0, 0.78, smoothstep(0.38, 1.05, length(q)));
`;

export function createDioramaSkin(): Skin {
  const dresser = makeDresser();
  const uniforms = {
    uTreeMap: { value: dresser.treeTex },
    uStuds: { value: 1 },
    uStudShade: { value: 0.3 },
  };
  return createStyledBrickSkin({
    id: 'toy',
    cacheKey: 'diorama-chunk',
    lookup: buildLookup(),
    atlas: getPixelAtlas().texture,
    shader: { fragPars: FRAG_PARS, color: COLOR_HOOK, bevel: BEVEL, after: STUD_HOOK, uniforms, tilt: 0.75, seam: 0.38, leaf: `int(vKind + 0.5) == ${K.LEAVES}` },
    keys: { day: DAY, dusk: DUSK, night: NIGHT },
    sunDir: SUN_DIR,
    sunDist: 60,
    shadowHalf: 18,
    shadowMap: 1024,
    shadowRadius: 4,
    fog: { near: 30, far: 95 },
    post: { blur: 0.0095, band: [0.08, 0.46], grade: GRADE },
    chunksCast: true,
    tightCull: { shadowReach: 10 },
    decorate: dresser.decorate,
    disposeDecor: dresser.dispose,
    onTier(t) {
      uniforms.uStuds.value = t === 1 ? 1 : 0;
    },
    onUpdate(daylight) {
      uniforms.uStudShade.value = 0.12 + 0.2 * daylight;
    },
  });
}
