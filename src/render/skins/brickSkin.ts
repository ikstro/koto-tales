/**
 * Shared core of the plastic-brick skins (toy, hybrid, diorama).
 *
 * A skin here is a "style": a colour lookup, a few GLSL hooks for the chunk
 * shader, a set of day / dusk / night light keys, a post grade and an optional
 * decorator for the chunks near the camera. `createStyledBrickSkin` turns a
 * style into a `Skin`: lights, shadows, fog, the tilt-shift post pass, tiers,
 * glossy part materials and the bookkeeping of decorations.
 *
 * The chunk material is a MeshStandardMaterial patched in `onBeforeCompile`:
 * the vertex shader turns `face` (blockId*8+dir) into colour / flags /
 * roughness / kind through a small lookup texture, the fragment shader draws
 * the bevel from fract(uv) by tilting the normal near the edges, so the real
 * lights make the lit rim bright and the opposite rim dark.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ChunkGeometry, QualityTier, Skin, SkinId } from '../../contracts';
import { BLOCKS, type FaceLook } from '../../world/blocks';
import { injectCutaway } from './cutaway';
import { TILE } from './pixelAtlas';

// --- lookup -------------------------------------------------------------------

/** Columns: 0..5 tile/flags/roughness per dir, 8..13 colour per dir, 16..21 kind per dir. */
export const LOOKUP_W = 24;
export const LOOKUP_H = 256;

export const F_GLOW = 1;
export const F_WATER = 2;
export const F_GLASS = 4;
export const F_PIXEL = 8;
export const F_BAND = 16;
export const F_GOLD = 32;
export const F_STUDLESS = 64;

export const lookOf = (id: number, dir: number): FaceLook => {
  const d = BLOCKS[id];
  return dir === 2 ? d.top : dir === 3 ? d.bottom : d.side;
};

/** Same integer hash as the shader's `toyHash`: per-brick variation that CPU and GPU agree on. */
export function brickHash(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** The per-brick brightness / hue jitter the shader applies (calm = 0 for water). */
export function brickJitter(out: THREE.Color, base: THREE.Color, x: number, y: number, z: number, calm = 1): THREE.Color {
  const h = brickHash(x, y, z);
  const j1 = (h & 255) / 255 - 0.5;
  const j2 = ((h >>> 8) & 255) / 255 - 0.5;
  const s = 1 + j1 * 0.09 * calm;
  out.r = base.r * s * (1 + j2 * 0.04 * calm);
  out.g = base.g * s;
  out.b = base.b * s * (1 - j2 * 0.04 * calm);
  return out;
}

export interface LookupEntry {
  tileX: number;
  tileY: number;
  flags: number;
  roughness: number;
  /** Linear colour. */
  color: THREE.Color;
  /** Free code for the style's shader hooks (0 = nothing special). */
  kind: number;
}

/** Builds the lookup texture from one entry per (block id, dir). */
export function buildLookupTexture(entry: (id: number, dir: number) => LookupEntry | null): THREE.DataTexture {
  const data = new Uint8Array(LOOKUP_W * LOOKUP_H * 4);
  const c = new THREE.Color();
  for (const key of Object.keys(BLOCKS)) {
    const id = Number(key);
    if (id >= LOOKUP_H) continue;
    for (let dir = 0; dir < 6; dir++) {
      const e = entry(id, dir);
      if (!e) continue;
      const i = (id * LOOKUP_W + dir) * 4;
      data[i] = e.tileX;
      data[i + 1] = e.tileY;
      data[i + 2] = e.flags;
      data[i + 3] = Math.round(e.roughness * 255);
      c.copy(e.color).convertLinearToSRGB();
      const j = (id * LOOKUP_W + 8 + dir) * 4;
      data[j] = Math.round(Math.min(1, c.r) * 255);
      data[j + 1] = Math.round(Math.min(1, c.g) * 255);
      data[j + 2] = Math.round(Math.min(1, c.b) * 255);
      data[j + 3] = 255;
      const k = (id * LOOKUP_W + 16 + dir) * 4;
      data[k] = e.kind;
    }
  }
  const tex = new THREE.DataTexture(data, LOOKUP_W, LOOKUP_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// --- chunk shader --------------------------------------------------------------

/** GLSL hooks a style can give the chunk shader. Defaults are the toy brick. */
export interface BrickShaderStyle {
  /** Extra fragment declarations (after the core ones: toyHash, varyings). */
  fragPars?: string;
  /**
   * Runs after the base colour (and grass band) is picked, before the jitter.
   * In scope: vec3 col, float calm, float toyAo, int toyFlags, int toyKind,
   * vec2 fuv, ivec3 toyCell, uint h.
   */
  color?: string;
  /** Sets vec2 toyTilt, vec2 bev, float seam from fuv, vec2 ed, vec2 fw, float near. */
  bevel?: string;
  /**
   * Runs after the bevel and seam, before the colour is applied. May change col
   * and replace the normal: toyOverride = 1.0, toyNW = world normal.
   */
  after?: string;
  /** Extra uniforms for the hooks (shared by reference, so the style can animate them). */
  uniforms?: Record<string, THREE.IUniform>;
  /** Strength of the bevel's normal tilt. */
  tilt?: number;
  /** How dark the seam between bricks is. */
  seam?: number;
}

const DEFAULT_BEVEL = /* glsl */ `
    vec2 bev = 1.0 - smoothstep(vec2(0.0), vec2(0.11), ed);
    toyTilt = sign(fuv - 0.5) * bev * near;
    float seam = 1.0 - smoothstep(0.0, max(0.022, fw.x + fw.y), min(ed.x, ed.y));
`;

const VERT_PARS = /* glsl */ `
attribute float ao;
attribute float face;
uniform sampler2D uLookup;
flat varying vec3 vToyCol;
flat varying vec3 vBandCol;
flat varying vec2 vTile;
flat varying float vFlags;
flat varying float vRough;
flat varying float vKind;
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
  vec4 K = texelFetch(uLookup, ivec2(16 + dir, bid), 0);
  vTile = floor(A.rg * 255.0 + 0.5);
  vFlags = floor(A.b * 255.0 + 0.5);
  vRough = A.a;
  vKind = floor(K.r * 255.0 + 0.5);
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
flat varying float vKind;
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

const fragMap = (s: BrickShaderStyle) => /* glsl */ `
  int toyFlags = int(vFlags + 0.5);
  int toyKind = int(vKind + 0.5);
  vec2 fuv = fract(vBlockUv);
  vec2 toyTilt = vec2(0.0);
  float toyOverride = 0.0;
  vec3 toyNW = vFn;
  float toyAo = mix(0.5, 1.0, vAo);
  if ((toyFlags & ${F_PIXEL}) != 0) {
    ivec2 tp = ivec2(vTile) + 1 + min(ivec2(fuv * ${TILE.toFixed(1)}), ivec2(${TILE - 1}));
    diffuseColor *= texelFetch(uAtlas, tp, 0);
  } else {
    vec3 col = vToyCol;
    if ((toyFlags & ${F_BAND}) != 0 && fuv.y > 0.78) col = vBandCol;
    // one brick = one slightly different moulding
    ivec3 toyCell = ivec3(floor(vCellPos));
    uint h = toyHash(toyCell);
    // water is one calm sheet: no jitter, a faint bevel
    float calm = (toyFlags & ${F_WATER}) != 0 ? 0.0 : 1.0;
    ${s.color ?? ''}
    float j1 = float(h & 255u) / 255.0 - 0.5;
    float j2 = float((h >> 8u) & 255u) / 255.0 - 0.5;
    col *= 1.0 + j1 * 0.09 * calm;
    col.r *= 1.0 + j2 * 0.04 * calm;
    col.b *= 1.0 - j2 * 0.04 * calm;
    // bevel + seam, faded out where a block is only a few pixels wide
    vec2 fw = fwidth(vBlockUv);
    float near = (1.0 - smoothstep(0.06, 0.25, max(fw.x, fw.y))) * mix(0.35, 1.0, calm);
    vec2 ed = min(fuv, 1.0 - fuv);
    ${s.bevel ?? DEFAULT_BEVEL}
    col *= 1.0 - seam * ${(s.seam ?? 0.45).toFixed(3)} * near;
    // grass band edge: a small step where the green plate sits on the earth
    if ((toyFlags & ${F_BAND}) != 0) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.04, abs(fuv.y - 0.78))) * near;
    ${s.after ?? ''}
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

const fragNormal = (tilt: number) => /* glsl */ `
  {
    vec3 nW = toyOverride > 0.5 ? toyNW : normalize(vFn + (vTu * toyTilt.x + vTv * toyTilt.y) * ${tilt.toFixed(3)});
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }
`;

const FRAG_EMISSIVE = /* glsl */ `
  if ((toyFlags & ${F_GLOW}) != 0) totalEmissiveRadiance = toyBase * mix(0.7, 1.0, vAo);
`;

const FRAG_AO = /* glsl */ `
  reflectedLight.indirectSpecular *= toyAo;
`;

export function makeBrickMaterial(
  transparent: boolean,
  atlas: THREE.Texture,
  lookup: THREE.Texture,
  cacheKey: string,
  style: BrickShaderStyle = {},
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
    if (style.uniforms) Object.assign(shader.uniforms, style.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + (style.fragPars ?? ''))
      .replace('#include <map_fragment>', fragMap(style))
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + fragNormal(style.tilt ?? 0.9))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FRAG_AO);
    injectCutaway(shader);
  };
  m.customProgramCacheKey = () => cacheKey;
  return m;
}

// --- post ------------------------------------------------------------------------

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

/** The toy grade: a little more colour, a little warmer, a soft vignette. */
export const TOY_GRADE = /* glsl */ `
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.1), 0.0);
  c *= vec3(1.03, 1.0, 0.955);
  c *= mix(1.0, 0.8, smoothstep(0.35, 1.0, length(q)));
`;

export interface PostStyle {
  /** Blur radius at the top / bottom edge, as a fraction of the screen height. */
  blur: number;
  /** |y - 0.5| where the blur starts and where it is full. */
  band: [number, number];
  /** GLSL on `vec3 c` (sRGB-ish 0..1, before the output transform); `vec2 q` = centred aspect-corrected position. */
  grade: string;
}

const postFrag = (p: PostStyle) => /* glsl */ `
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
  float k = smoothstep(${p.band[0].toFixed(3)}, ${p.band[1].toFixed(3)}, abs(vUv.y - 0.5));
  float r = k * k * uBlur;
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (r > 0.6) {
    vec3 acc = c;
    vec2 s = uTexel * r;
    for (int i = 0; i < ${TAPS}; i++) acc += texture2D(tDiffuse, vUv + TAPS[i] * s).rgb;
    c = acc / ${(TAPS + 1).toFixed(1)};
  }
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  ${p.grade}
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// --- sky -------------------------------------------------------------------------

export interface SkyKey {
  sky: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
  env: number;
  shadow: number;
  fog: THREE.Color;
}

export const skyKey = (
  sky: string,
  hemiSky: string,
  hemiGround: string,
  hemi: number,
  sun: string,
  sunI: number,
  env: number,
  shadow: number,
  fog: string = sky,
): SkyKey => ({
  sky: new THREE.Color(sky),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  hemi,
  sun: new THREE.Color(sun),
  sunI,
  env,
  shadow,
  fog: new THREE.Color(fog),
});

// --- the skin --------------------------------------------------------------------

export interface BrickSkinStyle {
  id: SkinId;
  /** Shader program cache key of the chunk materials. */
  cacheKey: string;
  lookup: THREE.DataTexture;
  atlas: THREE.Texture;
  shader?: BrickShaderStyle;
  keys: { day: SkyKey; dusk: SkyKey; night: SkyKey };
  /** Towards the sun. */
  sunDir: THREE.Vector3;
  sunDist: number;
  shadowHalf: number;
  shadowMap: number;
  shadowRadius: number;
  /** Ground colour of the hemisphere light before the first update. */
  fog: { near: number; far: number };
  post: PostStyle;
  /** Terrain and buildings cast shadows (trees, towers, steps). */
  chunksCast: boolean;
  /** Dressing for chunks near the camera. Called at every tier (a style may still learn from the chunk); return null to add nothing. */
  decorate?(g: ChunkGeometry, dist: number, tier: QualityTier): THREE.Object3D | null;
  /** Frees the decorator's shared geometry / materials. */
  disposeDecor?(): void;
  onTier?(tier: QualityTier): void;
  onUpdate?(daylight: number, focus: THREE.Vector3): void;
  /** Objects whose largest side is below this do not cast shadows (pickups). 0 = everything casts. */
  castMinSize?: number;
  /**
   * Per-frame culling of chunk meshes and decorations by their bounding box
   * (tighter than three's sphere test). Chunks just off screen towards the sun
   * stay, so their shadows still fall into view.
   */
  tightCull?: { shadowReach: number };
}

export function createStyledBrickSkin(style: BrickSkinStyle): Skin {
  const { day: DAY, dusk: DUSK, night: NIGHT } = style.keys;
  const opaque = makeBrickMaterial(false, style.atlas, style.lookup, style.cacheKey, style.shader);
  const transparent = makeBrickMaterial(true, style.atlas, style.lookup, style.cacheKey, style.shader);
  const parts = new Map<string, THREE.MeshStandardMaterial>();
  const looseParts = new Set<THREE.MeshStandardMaterial>();
  const decor = new Set<THREE.Object3D>();
  let tier: QualityTier = 1;

  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemi);
  const sun = new THREE.DirectionalLight(0xffffff, DAY.sunI);
  sun.shadow.mapSize.set(style.shadowMap, style.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -style.shadowHalf;
  sc.right = style.shadowHalf;
  sc.top = style.shadowHalf;
  sc.bottom = -style.shadowHalf;
  sc.near = style.sunDist - 40;
  sc.far = style.sunDist + 40;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = style.shadowRadius;
  const fog = new THREE.Fog(DAY.fog.getHex(), style.fog.near, style.fog.far);
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
    fragmentShader: postFrag(style.post),
    depthTest: false,
    depthWrite: false,
  });
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postQuad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(postQuad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bufSize = new THREE.Vector2();

  const mixKeys = (a: SkyKey, b: SkyKey, t: number) => {
    background.copy(a.sky).lerp(b.sky, t);
    fog.color.copy(a.fog).lerp(b.fog, t);
    hemi.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
    sun.color.copy(a.sun).lerp(b.sun, t);
    sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    sun.shadow.intensity = a.shadow + (b.shadow - a.shadow) * t;
    if (scene) scene.environmentIntensity = a.env + (b.env - a.env) * t;
  };

  const applyTier = () => {
    const full = tier === 1;
    sun.castShadow = full;
    if (renderer) renderer.shadowMap.enabled = full;
    for (const d of decor) d.visible = full;
  };

  /** Characters and props cast, chunks receive, decorations and see-through things neither. */
  const flagShadows = (deep: boolean) => {
    if (!scene) return;
    const visit = (o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.toyShadow) return;
      if (style.castMinSize && !o.userData.toyNoShadow && mesh.material !== opaque && mesh.material !== transparent) {
        let root = o;
        while (root.parent && root.parent !== scene) root = root.parent;
        if (root.userData.toySize === undefined) {
          const sz = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
          root.userData.toySize = Math.max(sz.x, sz.y, sz.z);
        }
        if (root.userData.toySize < style.castMinSize) {
          o.userData.toyShadow = true;
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          return;
        }
      }
      o.userData.toyShadow = true;
      if (o.userData.toyNoShadow) return;
      const mat = mesh.material;
      if (mat === opaque || mat === transparent) {
        mesh.receiveShadow = true;
        mesh.castShadow = style.chunksCast && mat === opaque;
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

  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const box = new THREE.Box3();
  const swept = new THREE.Box3();
  const reach = new THREE.Vector3();
  const hiddenList: THREE.Object3D[] = [];
  /** Hides chunk meshes / decorations whose box is out of view; returns them to show again after the frame. */
  const cull = (s: THREE.Scene, camera: THREE.Camera, shadowReach: number): THREE.Object3D[] => {
    hiddenList.length = 0;
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    // a caster up to this far towards the sun still throws its shadow into view
    reach.copy(style.sunDir).multiplyScalar(-shadowReach);
    for (const o of s.children) {
      if (!o.visible) continue;
      const mesh = o as THREE.Mesh;
      const isChunk = mesh.isMesh && (mesh.material === opaque || mesh.material === transparent);
      if (!isChunk && !decor.has(o)) continue;
      const geo = mesh.geometry;
      const b = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).boundingBox : geo?.boundingBox;
      if (!b) continue;
      box.copy(b).applyMatrix4(o.matrixWorld);
      if (frustum.intersectsBox(box)) continue;
      if (isChunk && mesh.material === opaque && tier === 1) {
        swept.copy(box);
        swept.min.add(reach);
        swept.max.add(reach);
        swept.union(box);
        if (frustum.intersectsBox(swept)) continue;
      }
      o.visible = false;
      hiddenList.push(o);
    }
    return hiddenList;
  };

  return {
    id: style.id,

    chunkMaterial(pass) {
      return pass === 'opaque' ? opaque : transparent;
    },

    decorate: style.decorate
      ? (g: ChunkGeometry, dist: number) => {
          const obj = style.decorate!(g, dist, tier);
          if (!obj) return null;
          // decorations receive (else they glow inside shadows) but never cast
          obj.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            o.userData.toyNoShadow = true;
          });
          decor.add(obj);
          obj.addEventListener('dispose', () => decor.delete(obj));
          return obj;
        }
      : undefined,

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
      // snap to whole blocks so the shadow map does not crawl while walking
      sun.target.position.set(Math.round(focus.x), Math.round(focus.y), Math.round(focus.z));
      sun.position.copy(sun.target.position).addScaledVector(style.sunDir, style.sunDist);
      sun.target.updateMatrixWorld();
      style.onUpdate?.(k, focus);
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
        const hidden = style.tightCull ? cull(s, camera, 0) : null;
        r.render(s, camera);
        if (hidden) for (const o of hidden) o.visible = true;
        return;
      }
      r.getDrawingBufferSize(bufSize);
      const w = Math.max(1, bufSize.x);
      const h = Math.max(1, bufSize.y);
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      postMat.uniforms.uTexel.value.set(1 / w, 1 / h);
      postMat.uniforms.uBlur.value = h * style.post.blur;
      postMat.uniforms.uAspect.value = w / h;
      // count both passes in renderer.info (the debug HUD and the game stats read it)
      const auto = r.info.autoReset;
      r.info.autoReset = false;
      r.info.reset();
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      const hidden = style.tightCull ? cull(s, camera, style.tightCull.shadowReach) : null;
      r.render(s, camera);
      if (hidden) for (const o of hidden) o.visible = true;
      r.setRenderTarget(prev);
      r.render(postScene, postCam);
      r.info.autoReset = auto;
    },

    setTier(t) {
      tier = t;
      applyTier();
      style.onTier?.(t);
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
      style.lookup.dispose();
      style.disposeDecor?.();
      for (const m of parts.values()) m.dispose();
      for (const m of looseParts) m.dispose();
      parts.clear();
      looseParts.clear();
      decor.clear();
    },
  };
}
