/**
 * Toy skin: the world as glossy plastic construction bricks. Saturated colours,
 * a bevel and a seam on every block face, studs on top of the bricks near the
 * camera, warm key light with soft shadows and a tilt-shift "miniature" pass.
 *
 * The chunk material is a MeshStandardMaterial patched in `onBeforeCompile`
 * (same idea as the pixel skin): the vertex shader turns `face` (blockId*8+dir)
 * into colour / flags / roughness through a small lookup texture, the fragment
 * shader draws the bevel from fract(uv) by tilting the normal near the edges,
 * so the real lights make the lit rim bright and the opposite rim dark.
 *
 * `createBrickSkin({ pixelNatural: true })` is the hybrid: natural surfaces keep
 * the pixel atlas, built ones are bricks. hybrid.ts only picks the options.
 */
import * as THREE from 'three';
import { injectCutaway } from './cutaway';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ChunkGeometry, QualityTier, Skin, SkinId } from '../../contracts';
import { BLOCKS, B, NATURAL_SURFACES, type FaceLook } from '../../world/blocks';
import { getPixelAtlas, TILE } from './pixelAtlas';

// в”Ђв”Ђв”Ђ colours в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

/** Hand-picked toy versions of the natural colours; everything else is boosted. */
const TOY_OVERRIDE: Record<string, string> = {
  '#6cbf4a': '#4cad35', // grass top
  '#8b6a3e': '#a0703c', // earth
  '#8e8e8e': '#9da3aa', // stone
  '#e3d39a': '#f2d68a', // sand
  '#3d7fd9': '#2a8cf0', // water
  '#6b4a2b': '#7a4a26', // bark
  '#b08a55': '#d4a35c', // log rings
  '#3f9a3a': '#2fa046', // leaves
  '#f4f8fb': '#fbfdff', // snow
  '#7d7d7d': '#8f969e', // cobble
  '#cfeefc': '#d8f3ff', // glass
  '#c19a5b': '#deb46e', // planks
};

const tmpHsl = { h: 0, s: 0, l: 0 };

/** Saturated toy version of a block colour, as a THREE.Color (linear). */
export function toyColor(hex: string): THREE.Color {
  const o = TOY_OVERRIDE[hex.toLowerCase()];
  if (o) return new THREE.Color(o);
  const c = new THREE.Color(hex);
  c.getHSL(tmpHsl);
  if (tmpHsl.s > 0.08) c.setHSL(tmpHsl.h, Math.min(1, tmpHsl.s * 1.18 + 0.05), Math.min(0.9, Math.max(0.16, tmpHsl.l)));
  return c;
}

/** Same integer hash as the shader: per-brick colour jitter. */
function brickHash(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

// в”Ђв”Ђв”Ђ lookup в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const LOOKUP_W = 16; // 0..5: tile/flags/roughness per dir, 8..13: colour per dir
const LOOKUP_H = 256;

const F_GLOW = 1;
const F_WATER = 2;
const F_GLASS = 4;
const F_PIXEL = 8;
const F_BAND = 16;
const F_GOLD = 32;
const F_STUDLESS = 64;

const lookOf = (id: number, dir: number): FaceLook => {
  const d = BLOCKS[id];
  return dir === 2 ? d.top : dir === 3 ? d.bottom : d.side;
};

function roughnessOf(look: FaceLook, pixel: boolean): number {
  if (pixel) return look.surface === 'water' ? 0.15 : 0.85;
  switch (look.surface) {
    case 'water':
      return 0.07;
    case 'glass':
      return 0.08;
    case 'gold':
      return 0.22;
    case 'plastic':
      return 0.26;
    case 'snow':
    case 'sand':
    case 'earth':
    case 'grass-side':
    case 'stone':
    case 'cobble':
      return 0.42;
    default:
      return 0.34;
  }
}

function buildLookup(pixelNatural: boolean): THREE.DataTexture {
  const atlas = getPixelAtlas();
  const data = new Uint8Array(LOOKUP_W * LOOKUP_H * 4);
  for (const key of Object.keys(BLOCKS)) {
    const id = Number(key);
    if (id === B.AIR || id >= LOOKUP_H) continue;
    const def = BLOCKS[id];
    for (let dir = 0; dir < 6; dir++) {
      const look = lookOf(id, dir);
      const pixel = pixelNatural && NATURAL_SURFACES.has(look.surface);
      let flags = 0;
      if (def.glow) flags |= F_GLOW;
      if (look.surface === 'water') flags |= F_WATER;
      if (look.surface === 'glass') flags |= F_GLASS;
      if (pixel) flags |= F_PIXEL;
      if (look.surface === 'grass-side' && !pixel) flags |= F_BAND;
      if (look.surface === 'gold') flags |= F_GOLD;
      if (pixel || def.glow || look.surface === 'water' || look.surface === 'glass') flags |= F_STUDLESS;
      const t = atlas.tileOf(look);
      const i = (id * LOOKUP_W + dir) * 4;
      data[i] = atlas.cellX(t);
      data[i + 1] = atlas.cellY(t);
      data[i + 2] = flags;
      data[i + 3] = Math.round(roughnessOf(look, pixel) * 255);
      const c = toyColor(look.color).convertLinearToSRGB();
      const j = (id * LOOKUP_W + 8 + dir) * 4;
      data[j] = Math.round(c.r * 255);
      data[j + 1] = Math.round(c.g * 255);
      data[j + 2] = Math.round(c.b * 255);
      data[j + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, LOOKUP_W, LOOKUP_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// в”Ђв”Ђв”Ђ chunk shader в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const VERT_PARS = /* glsl */ `
attribute float ao;
attribute float face;
uniform sampler2D uLookup;
flat varying vec3 vToyCol;
flat varying vec3 vBandCol;
flat varying vec2 vTile;
flat varying float vFlags;
flat varying float vRough;
flat varying vec3 vFn;
flat varying vec3 vTu;
flat varying vec3 vTv;
varying float vAo;
varying vec2 vBlockUv;
varying vec3 vCellPos;
`;

const VERT_MAIN = /* glsl */ `
{
  int fc = int(face + 0.5);
  int bid = fc >> 3;
  int dir = fc & 7;
  vec4 A = texelFetch(uLookup, ivec2(dir, bid), 0);
  vec4 C = texelFetch(uLookup, ivec2(8 + dir, bid), 0);
  vec4 T = texelFetch(uLookup, ivec2(10, bid), 0);
  vTile = floor(A.rg * 255.0 + 0.5);
  vFlags = floor(A.b * 255.0 + 0.5);
  vRough = A.a;
  vToyCol = pow(C.rgb, vec3(2.2));
  vBandCol = pow(T.rgb, vec3(2.2));
  vFn = normal;
  // world directions of u and v on this face (see mesher CORNER_UV)
  vTu = dir == 0 ? vec3(0.0, 0.0, -1.0) : (dir == 1 ? vec3(0.0, 0.0, 1.0) : (dir == 5 ? vec3(-1.0, 0.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vTv = (dir == 2 || dir == 3) ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  vAo = ao;
  vBlockUv = uv;
  vCellPos = position - normal * 0.5;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uAtlas;
flat varying vec3 vToyCol;
flat varying vec3 vBandCol;
flat varying vec2 vTile;
flat varying float vFlags;
flat varying float vRough;
flat varying vec3 vFn;
flat varying vec3 vTu;
flat varying vec3 vTv;
varying float vAo;
varying vec2 vBlockUv;
varying vec3 vCellPos;

uint toyHash(ivec3 c) {
  uint h = (uint(c.x) * 73856093u) ^ (uint(c.y) * 19349663u) ^ (uint(c.z) * 83492791u);
  h ^= h >> 13u;
  h *= 1274126177u;
  h ^= h >> 16u;
  return h;
}
`;

const FRAG_MAP = /* glsl */ `
  int toyFlags = int(vFlags + 0.5);
  vec2 fuv = fract(vBlockUv);
  vec2 toyTilt = vec2(0.0);
  float toyAo = mix(0.5, 1.0, vAo);
  if ((toyFlags & ${F_PIXEL}) != 0) {
    ivec2 tp = ivec2(vTile) + 1 + min(ivec2(fuv * ${TILE.toFixed(1)}), ivec2(${TILE - 1}));
    diffuseColor *= texelFetch(uAtlas, tp, 0);
  } else {
    vec3 col = vToyCol;
    if ((toyFlags & ${F_BAND}) != 0 && fuv.y > 0.78) col = vBandCol;
    // one brick = one slightly different moulding
    uint h = toyHash(ivec3(floor(vCellPos)));
    float j1 = float(h & 255u) / 255.0 - 0.5;
    float j2 = float((h >> 8u) & 255u) / 255.0 - 0.5;
    // water is one calm sheet: no jitter, a faint bevel
    float calm = (toyFlags & ${F_WATER}) != 0 ? 0.0 : 1.0;
    col *= 1.0 + j1 * 0.09 * calm;
    col.r *= 1.0 + j2 * 0.04 * calm;
    col.b *= 1.0 - j2 * 0.04 * calm;
    // bevel + seam, faded out where a block is only a few pixels wide
    vec2 fw = fwidth(vBlockUv);
    float near = (1.0 - smoothstep(0.06, 0.25, max(fw.x, fw.y))) * mix(0.35, 1.0, calm);
    vec2 ed = min(fuv, 1.0 - fuv);
    vec2 bev = 1.0 - smoothstep(vec2(0.0), vec2(0.11), ed);
    toyTilt = sign(fuv - 0.5) * bev * near;
    float seam = 1.0 - smoothstep(0.0, max(0.022, fw.x + fw.y), min(ed.x, ed.y));
    col *= 1.0 - seam * 0.45 * near;
    // grass band edge: a small step where the green plate sits on the earth
    if ((toyFlags & ${F_BAND}) != 0) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.04, abs(fuv.y - 0.78))) * near;
    diffuseColor.rgb *= col;
    if ((toyFlags & ${F_WATER}) != 0) diffuseColor.a = 0.86;
    else if ((toyFlags & ${F_GLASS}) != 0) diffuseColor.a = 0.32 + 0.45 * max(bev.x, bev.y);
  }
  vec3 toyBase = diffuseColor.rgb;
  diffuseColor.rgb *= toyAo;
`;

const FRAG_ROUGH = /* glsl */ `
  roughnessFactor = vRough;
  metalnessFactor = (toyFlags & ${F_GOLD}) != 0 ? 0.55 : 0.0;
`;

const FRAG_NORMAL = /* glsl */ `
  {
    vec3 nW = normalize(vFn + (vTu * toyTilt.x + vTv * toyTilt.y) * 0.9);
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }
`;

const FRAG_EMISSIVE = /* glsl */ `
  if ((toyFlags & ${F_GLOW}) != 0) totalEmissiveRadiance = toyBase * mix(0.7, 1.0, vAo);
`;

const FRAG_AO = /* glsl */ `
  reflectedLight.indirectSpecular *= toyAo;
`;

function makeChunkMaterial(
  transparent: boolean,
  atlas: THREE.Texture,
  lookup: THREE.Texture,
  cacheKey: string,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0,
    transparent,
    depthWrite: !transparent,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = { value: atlas };
    shader.uniforms.uLookup = { value: lookup };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FRAG_AO);
    injectCutaway(shader);
  };
  m.customProgramCacheKey = () => cacheKey;
  return m;
}

// в”Ђв”Ђв”Ђ studs в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const STUD_R = 0.27;
const STUD_H = 0.17;

/** A low-poly stud standing on y = 0: straight side, a bevel ring, a flat cap. */
function studGeometry(sides: number, bevel: boolean): THREE.BufferGeometry {
  const pts = bevel
    ? [
        new THREE.Vector2(STUD_R, -0.01),
        new THREE.Vector2(STUD_R, STUD_H - 0.045),
        new THREE.Vector2(STUD_R - 0.04, STUD_H),
        new THREE.Vector2(0, STUD_H),
      ]
    : [new THREE.Vector2(STUD_R, -0.01), new THREE.Vector2(STUD_R, STUD_H), new THREE.Vector2(0, STUD_H)];
  const g = new THREE.LatheGeometry(pts, sides);
  // flat cap: the lathe smooths the cap normals towards the side
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    if (p.getY(i) > STUD_H - 0.001 && r < STUD_R - 0.05) n.setXYZ(i, 0, 1, 0);
  }
  g.deleteAttribute('uv');
  return g;
}

// в”Ђв”Ђв”Ђ post в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const TAPS = 12;
const tapConsts = (() => {
  const out: string[] = [];
  for (let i = 0; i < TAPS; i++) {
    const f = i + 0.5;
    const r = Math.sqrt(f / TAPS);
    const a = f * 2.39996323;
    out.push(`vec2(${(Math.cos(a) * r).toFixed(4)}, ${(Math.sin(a) * r).toFixed(4)})`);
  }
  return out.join(',\n    ');
})();

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uBlur;
uniform float uAspect;
varying vec2 vUv;
const vec2 TAPS[${TAPS}] = vec2[${TAPS}](
    ${tapConsts}
);
void main() {
  // tilt-shift: a sharp band through the middle, blur growing to top and bottom
  float k = smoothstep(0.1, 0.5, abs(vUv.y - 0.5));
  float r = k * k * uBlur;
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (r > 0.6) {
    vec3 acc = c;
    vec2 s = uTexel * r;
    for (int i = 0; i < ${TAPS}; i++) acc += texture2D(tDiffuse, vUv + TAPS[i] * s).rgb;
    c = acc / ${(TAPS + 1).toFixed(1)};
  }
  // grade: a little more colour, a little warmer
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.1), 0.0);
  c *= vec3(1.03, 1.0, 0.955);
  // soft vignette
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= mix(1.0, 0.8, smoothstep(0.35, 1.0, length(q)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// в”Ђв”Ђв”Ђ sky в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

interface SkyKey {
  sky: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
  env: number;
  shadow: number;
}

const key = (
  sky: string,
  hemiSky: string,
  hemiGround: string,
  hemi: number,
  sun: string,
  sunI: number,
  env: number,
  shadow: number,
): SkyKey => ({
  sky: new THREE.Color(sky),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  hemi,
  sun: new THREE.Color(sun),
  sunI,
  env,
  shadow,
});

const DAY = key('#87c5f0', '#dcefff', '#b9a77f', 0.75, '#fff0d4', 3.2, 0.32, 0.8);
const DUSK = key('#e9a27a', '#ffd6bd', '#7c6a7c', 0.7, '#ffa45c', 2.4, 0.25, 0.7);
const NIGHT = key('#0b1d3a', '#a7b8ee', '#46507a', 1.0, '#b8c8ff', 0.7, 0.12, 0.45);

/** Key light from the upper left, a bit in front, so shadows fall right and away. */
const SUN_DIR = new THREE.Vector3(-20, 40, 14).normalize();
const SUN_DIST = 60;
const SHADOW_HALF = 16;
const SHADOW_MAP = 1024;
/** Terrain and buildings cast too (trees, towers, steps): ~6вЂ“9 extra depth-only draws. */
const CHUNKS_CAST = true;

export interface BrickSkinOptions {
  id: SkinId;
  /** Natural surfaces keep the pixel atlas (the hybrid). */
  pixelNatural: boolean;
}

export function createBrickSkin(opts: BrickSkinOptions): Skin {
  const atlas = getPixelAtlas();
  const lookup = buildLookup(opts.pixelNatural);
  const opaque = makeChunkMaterial(false, atlas.texture, lookup, `${opts.id}-chunk`);
  const transparent = makeChunkMaterial(true, atlas.texture, lookup, `${opts.id}-chunk`);
  const parts = new Map<string, THREE.MeshStandardMaterial>();
  const looseParts = new Set<THREE.MeshStandardMaterial>();
  let tier: QualityTier = 1;

  // stud colour + skip flag per block id (top face)
  const studColor: THREE.Color[] = [];
  const studSkip = new Uint8Array(LOOKUP_H);
  for (const k of Object.keys(BLOCKS)) {
    const id = Number(k);
    const look = BLOCKS[id].top;
    studColor[id] = toyColor(look.color);
    studSkip[id] =
      id === B.AIR ||
      BLOCKS[id].glow ||
      look.surface === 'water' ||
      look.surface === 'glass' ||
      (opts.pixelNatural && NATURAL_SURFACES.has(look.surface))
        ? 1
        : 0;
  }
  const studGeo = [studGeometry(10, true), studGeometry(6, false)];
  const studMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0 });
  studMat.onBeforeCompile = (shader) => injectCutaway(shader);
  studMat.customProgramCacheKey = () => 'toy-stud-cut';
  const studs = new Set<THREE.InstancedMesh>();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xcdb894, DAY.hemi);
  const sun = new THREE.DirectionalLight(0xffffff, DAY.sunI);
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF;
  sc.right = SHADOW_HALF;
  sc.top = SHADOW_HALF;
  sc.bottom = -SHADOW_HALF;
  sc.near = SUN_DIST - 40;
  sc.far = SUN_DIST + 40;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  const fog = new THREE.Fog(DAY.sky.getHex(), 48, 86);
  const background = DAY.sky.clone();

  let scene: THREE.Scene | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let envTex: THREE.Texture | null = null;
  let prevShadowMap = false;
  let prevToneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  let shadowCheck = 0;

  // post
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
    depthBuffer: true,
  });
  target.texture.generateMipmaps = false;
  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uBlur: { value: 6 },
      uAspect: { value: 1 },
    },
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postQuad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(postQuad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bufSize = new THREE.Vector2();

  const tmpA = new THREE.Color();
  const mixKeys = (a: SkyKey, b: SkyKey, t: number) => {
    background.copy(a.sky).lerp(b.sky, t);
    hemi.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
    sun.color.copy(a.sun).lerp(tmpA.copy(b.sun), t);
    sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    sun.shadow.intensity = a.shadow + (b.shadow - a.shadow) * t;
    if (scene) scene.environmentIntensity = a.env + (b.env - a.env) * t;
  };

  const applyTier = () => {
    const full = tier === 1;
    sun.castShadow = full;
    if (renderer) renderer.shadowMap.enabled = full;
    for (const s of studs) s.visible = full;
  };

  /** Characters and props cast, chunks receive, studs and see-through things neither. */
  const flagShadows = (deep: boolean) => {
    if (!scene) return;
    const visit = (o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.toyShadow) return;
      o.userData.toyShadow = true;
      if (o.userData.toyNoShadow) return;
      const mat = mesh.material;
      if (mat === opaque || mat === transparent) {
        mesh.receiveShadow = true;
        mesh.castShadow = CHUNKS_CAST && mat === opaque;
        return;
      }
      const m = Array.isArray(mat) ? mat[0] : mat;
      if (!m || m.transparent || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    };
    if (deep) scene.traverse(visit);
    else for (const c of scene.children) visit(c);
  };

  return {
    id: opts.id,

    chunkMaterial(pass) {
      return pass === 'opaque' ? opaque : transparent;
    },

    decorate(g: ChunkGeometry, dist: number) {
      if (tier !== 1) return null;
      const tops = g.tops;
      const n4 = tops.length;
      let count = 0;
      for (let i = 0; i < n4; i += 4) if (!studSkip[tops[i + 3]]) count++;
      if (count === 0) return null;
      const geo = studGeo[dist <= 1 ? 0 : 1];
      const mesh = new THREE.InstancedMesh(geo.clone(), studMat, count);
      const mat = mesh.instanceMatrix.array as Float32Array;
      const col = new Float32Array(count * 3);
      let k = 0;
      for (let i = 0; i < n4; i += 4) {
        const id = tops[i + 3];
        if (studSkip[id]) continue;
        const x = tops[i];
        const y = tops[i + 1];
        const z = tops[i + 2];
        const m = k * 16;
        mat[m] = 1;
        mat[m + 5] = 1;
        mat[m + 10] = 1;
        mat[m + 15] = 1;
        mat[m + 12] = x + 0.5;
        mat[m + 13] = y + 1;
        mat[m + 14] = z + 0.5;
        const h = brickHash(x, y, z);
        const j1 = (h & 255) / 255 - 0.5;
        const j2 = ((h >>> 8) & 255) / 255 - 0.5;
        const c = studColor[id];
        const s = 1 + j1 * 0.09;
        col[k * 3] = c.r * s * (1 + j2 * 0.04);
        col[k * 3 + 1] = c.g * s;
        col[k * 3 + 2] = c.b * s * (1 - j2 * 0.04);
        k++;
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.matrixAutoUpdate = false;
      // studs receive (else they glow inside shadows) but never cast
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.toyNoShadow = true;
      mesh.name = `studs:${g.cx},${g.cz}`;
      studs.add(mesh);
      mesh.addEventListener('dispose', () => studs.delete(mesh));
      return mesh;
    },

    partMaterial(color, o) {
      const c = new THREE.Color(color);
      const make = () => {
        const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0 });
        if (o?.emissive) m.emissive.copy(c).multiplyScalar(0.85);
        if (o?.map) {
          const t = o.map;
          if (t.magFilter !== THREE.NearestFilter || t.minFilter !== THREE.NearestFilter) {
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.needsUpdate = true;
          }
          m.map = t;
        }
        return m;
      };
      if (o?.transparent) {
        const m = make();
        m.transparent = true;
        m.opacity = 0.6;
        m.depthWrite = false;
        m.roughness = 0.1;
        looseParts.add(m);
        return m;
      }
      const k = `${c.getHexString()}|${o?.emissive ? 1 : 0}|${o?.map?.uuid ?? ''}`;
      let m = parts.get(k);
      if (!m) {
        m = make();
        parts.set(k, m);
      }
      return m;
    },

    setupScene(s, r) {
      scene = s;
      renderer = r;
      prevShadowMap = r.shadowMap.enabled;
      prevToneMapping = r.toneMapping;
      r.toneMapping = THREE.NoToneMapping;
      r.shadowMap.type = THREE.PCFShadowMap;
      const pmrem = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      envTex = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
      s.environment = envTex;
      s.environmentIntensity = DAY.env;
      s.add(hemi, sun, sun.target);
      s.fog = fog;
      s.background = background;
      applyTier();
    },

    updateScene(daylight, focus) {
      const k = Math.min(1, Math.max(0, daylight));
      if (k >= 0.5) mixKeys(DUSK, DAY, (k - 0.5) * 2);
      else mixKeys(NIGHT, DUSK, k * 2);
      fog.color.copy(background);
      // snap to whole blocks so the shadow map does not crawl while walking
      sun.target.position.set(Math.round(focus.x), Math.round(focus.y), Math.round(focus.z));
      sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, SUN_DIST);
      sun.target.updateMatrixWorld();
      if (tier === 1) {
        flagShadows(false);
        const now = performance.now();
        if (now - shadowCheck > 1000) {
          shadowCheck = now;
          flagShadows(true);
        }
      }
    },

    render(r, s, camera) {
      if (tier === 0) {
        r.render(s, camera);
        return;
      }
      r.getDrawingBufferSize(bufSize);
      const w = Math.max(1, bufSize.x);
      const h = Math.max(1, bufSize.y);
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      postMat.uniforms.uTexel.value.set(1 / w, 1 / h);
      postMat.uniforms.uBlur.value = h * 0.0075;
      postMat.uniforms.uAspect.value = w / h;
      // count both passes in renderer.info (the debug HUD and the game stats read it)
      const auto = r.info.autoReset;
      r.info.autoReset = false;
      r.info.reset();
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      r.render(s, camera);
      r.setRenderTarget(prev);
      r.render(postScene, postCam);
      r.info.autoReset = auto;
    },

    setTier(t) {
      tier = t;
      applyTier();
    },

    dispose() {
      if (scene) {
        scene.remove(hemi, sun, sun.target);
        if (scene.fog === fog) scene.fog = null;
        if (scene.background === background) scene.background = null;
        if (scene.environment === envTex) scene.environment = null;
      }
      if (renderer) {
        renderer.shadowMap.enabled = prevShadowMap;
        renderer.toneMapping = prevToneMapping;
      }
      sun.shadow.dispose();
      envTex?.dispose();
      target.dispose();
      postMat.dispose();
      postQuad.geometry.dispose();
      opaque.dispose();
      transparent.dispose();
      lookup.dispose();
      studMat.dispose();
      for (const g of studGeo) g.dispose();
      for (const m of parts.values()) m.dispose();
      for (const m of looseParts) m.dispose();
      parts.clear();
      looseParts.clear();
      studs.clear();
    },
  };
}

export function createToySkin(): Skin {
  return createBrickSkin({ id: 'toy', pixelNatural: false });
}
