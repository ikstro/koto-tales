/**
 * Pixel skin: the classic blocky look. 16×16 procedural textures per face,
 * per-vertex ambient occlusion, fixed per-direction face shading, a soft sky
 * light plus a shadow-free sun that follows the camera focus.
 *
 * The chunk material is a MeshLambertMaterial patched in `onBeforeCompile`:
 * the vertex shader turns `face` (blockId*8 + dir) into an atlas tile via a
 * small lookup texture, the fragment shader samples that tile at fract(uv).
 */
import * as THREE from 'three';
import { injectCutaway } from './cutaway';
import type { QualityTier, Skin } from '../../contracts';
import { BLOCKS, B } from '../../world/blocks';
import { getPixelAtlas, TILE } from './pixelAtlas';

const LOOKUP_W = 8; // dirs (6 used)
const LOOKUP_H = 256; // block ids

/** RGBA8 per (dir, blockId): R/G = tile cell corner in texels, B = glow. */
function buildLookup(): THREE.DataTexture {
  const atlas = getPixelAtlas();
  const data = new Uint8Array(LOOKUP_W * LOOKUP_H * 4);
  for (const key of Object.keys(BLOCKS)) {
    const id = Number(key);
    if (id === B.AIR || id >= LOOKUP_H) continue;
    const def = BLOCKS[id];
    for (let dir = 0; dir < 6; dir++) {
      const look = dir === 2 ? def.top : dir === 3 ? def.bottom : def.side;
      const t = atlas.tileOf(look);
      const i = (id * LOOKUP_W + dir) * 4;
      data[i] = atlas.cellX(t);
      data[i + 1] = atlas.cellY(t);
      data[i + 2] = def.glow ? 255 : 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, LOOKUP_W, LOOKUP_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const VERT_PARS = /* glsl */ `
attribute float ao;
attribute float face;
uniform sampler2D uLookup;
flat varying vec2 vTile;
flat varying float vGlow;
flat varying float vShade;
varying float vAo;
varying vec2 vBlockUv;
`;

const VERT_MAIN = /* glsl */ `
{
  int fc = int(face + 0.5);
  int bid = fc >> 3;
  int dir = fc & 7;
  vec4 L = texelFetch(uLookup, ivec2(dir, bid), 0);
  vTile = floor(L.rg * 255.0 + 0.5);
  vGlow = L.b;
  // face shading: top 1.0, ±X 0.8, ±Z 0.7, bottom 0.5
  vShade = dir == 2 ? 1.0 : (dir == 3 ? 0.5 : (dir <= 1 ? 0.8 : 0.7));
  vAo = ao;
  vBlockUv = uv;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uAtlas;
flat varying vec2 vTile;
flat varying float vGlow;
flat varying float vShade;
varying float vAo;
varying vec2 vBlockUv;
`;

const FRAG_MAP = /* glsl */ `
  vec2 fuv = fract(vBlockUv);
  ivec2 tp = ivec2(vTile) + 1 + min(ivec2(fuv * ${TILE.toFixed(1)}), ivec2(${TILE - 1}));
  vec4 texel = texelFetch(uAtlas, tp, 0);
  diffuseColor *= texel;
  vec3 pixelBase = diffuseColor.rgb;
  // AO 0..1 → 0.55..1 perceived, times face shade, converted to linear
  float pixelLight = vShade * mix(0.55, 1.0, vAo);
  diffuseColor.rgb *= pow(pixelLight, 2.2);
`;

const FRAG_GLOW = /* glsl */ `
  if (vGlow > 0.5) outgoingLight = pixelBase * pow(mix(0.8, 1.0, vAo) * (0.8 + 0.2 * vShade), 2.2);
`;

function makeChunkMaterial(transparent: boolean, atlas: THREE.Texture, lookup: THREE.Texture): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent, depthWrite: !transparent });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = { value: atlas };
    shader.uniforms.uLookup = { value: lookup };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <opaque_fragment>', FRAG_GLOW + '#include <opaque_fragment>');

    injectCutaway(shader);
  };
  m.customProgramCacheKey = () => 'pixel-chunk';
  return m;
}

// ─── sky ──────────────────────────────────────────────────────────────────────

interface SkyKey {
  sky: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
}

const key = (sky: string, hemiSky: string, hemiGround: string, hemi: number, sun: string, sunI: number): SkyKey => ({
  sky: new THREE.Color(sky),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  hemi,
  sun: new THREE.Color(sun),
  sunI,
});

const DAY = key('#87c5f0', '#ffffff', '#d8dccc', 2.3, '#fff4e0', 1.0);
const DUSK = key('#e9a27a', '#ffd9c0', '#8a7a8a', 1.6, '#ffb070', 0.7);
const NIGHT = key('#0b1d3a', '#b4c0e6', '#58617f', 1.9, '#c4d0ff', 0.5);

const SUN_OFFSET = new THREE.Vector3(18, 40, 26);

export function createPixelSkin(): Skin {
  const atlas = getPixelAtlas();
  const lookup = buildLookup();
  const opaque = makeChunkMaterial(false, atlas.texture, lookup);
  const transparent = makeChunkMaterial(true, atlas.texture, lookup);
  const parts = new Map<string, THREE.MeshLambertMaterial>();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8dccc, DAY.hemi);
  const sun = new THREE.DirectionalLight(0xffffff, DAY.sunI);
  sun.castShadow = false;
  const fog = new THREE.Fog(DAY.sky.getHex(), 48, 86);
  const background = DAY.sky.clone();
  let scene: THREE.Scene | null = null;

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const mix = (a: SkyKey, b: SkyKey, t: number) => {
    background.copy(a.sky).lerp(b.sky, t);
    hemi.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
    sun.color.copy(tmpA.copy(a.sun)).lerp(tmpB.copy(b.sun), t);
    sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
  };

  return {
    id: 'pixel',

    chunkMaterial(pass) {
      return pass === 'opaque' ? opaque : transparent;
    },

    partMaterial(color, opts) {
      const c = new THREE.Color(color);
      const k = `${c.getHexString()}|${opts?.emissive ? 1 : 0}|${opts?.transparent ? 1 : 0}|${opts?.map?.uuid ?? ''}|${opts?.vertexColors ? 1 : 0}`;
      let m = parts.get(k);
      if (!m) {
        m = new THREE.MeshLambertMaterial({ color: c, vertexColors: !!opts?.vertexColors });
        if (opts?.emissive) m.emissive.copy(c).multiplyScalar(0.85);
        if (opts?.map) m.map = opts.map;
        if (opts?.transparent) {
          m.transparent = true;
          m.opacity = 0.7;
          m.depthWrite = false;
        }
        parts.set(k, m);
      }
      return m;
    },

    setupScene(s) {
      scene = s;
      s.add(hemi, sun, sun.target);
      s.fog = fog;
      s.background = background;
    },

    updateScene(daylight, focus) {
      const k = Math.min(1, Math.max(0, daylight));
      if (k >= 0.5) mix(DUSK, DAY, (k - 0.5) * 2);
      else mix(NIGHT, DUSK, k * 2);
      fog.color.copy(background);
      sun.position.copy(focus).add(SUN_OFFSET);
      sun.target.position.copy(focus);
      sun.target.updateMatrixWorld();
    },

    render(renderer, s, camera) {
      renderer.render(s, camera);
    },

    setTier(_tier: QualityTier) {
      // the pixel look is already the light one
    },

    dispose() {
      if (scene) {
        scene.remove(hemi, sun, sun.target);
        if (scene.fog === fog) scene.fog = null;
        if (scene.background === background) scene.background = null;
      }
      opaque.dispose();
      transparent.dispose();
      lookup.dispose();
      for (const m of parts.values()) m.dispose();
      parts.clear();
    },
  };
}
