/**
 * Toy skin: the world as glossy plastic construction bricks. Saturated colours,
 * a bevel and a seam on every block face, studs on top of the bricks near the
 * camera, warm key light with soft shadows and a tilt-shift "miniature" pass.
 * The machinery is shared with the other brick skins (brickSkin.ts); this file
 * holds the toy palette, the toy light keys and the studs.
 *
 * `createBrickSkin({ pixelNatural: true })` is the hybrid: natural surfaces keep
 * the pixel atlas, built ones are bricks. hybrid.ts only picks the options.
 */
import * as THREE from 'three';
import { injectCutaway } from './cutaway';
import type { ChunkGeometry, QualityTier, Skin, SkinId } from '../../contracts';
import { BLOCKS, B, NATURAL_SURFACES, type FaceLook } from '../../world/blocks';
import { getPixelAtlas } from './pixelAtlas';
import {
  brickJitter,
  buildLookupTexture,
  createStyledBrickSkin,
  F_BAND,
  F_GLASS,
  F_GLOW,
  F_GOLD,
  F_PIXEL,
  F_STUDLESS,
  F_WATER,
  LOOKUP_H,
  lookOf,
  skyKey,
  TOY_GRADE,
} from './brickSkin';

// --- colours ---------------------------------------------------------------------

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

export function roughnessOf(look: FaceLook, pixel: boolean): number {
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

/** Flags every brick skin derives from a face look. */
export function brickFlags(id: number, look: FaceLook, pixel: boolean): number {
  const def = BLOCKS[id];
  let flags = 0;
  if (def.glow) flags |= F_GLOW;
  if (look.surface === 'water') flags |= F_WATER;
  if (look.surface === 'glass') flags |= F_GLASS;
  if (pixel) flags |= F_PIXEL;
  if (look.surface === 'grass-side' && !pixel) flags |= F_BAND;
  if (look.surface === 'gold') flags |= F_GOLD;
  if (pixel || def.glow || look.surface === 'water' || look.surface === 'glass') flags |= F_STUDLESS;
  return flags;
}

function buildLookup(pixelNatural: boolean): THREE.DataTexture {
  const atlas = getPixelAtlas();
  return buildLookupTexture((id, dir) => {
    if (id === B.AIR) return null;
    const look = lookOf(id, dir);
    const pixel = pixelNatural && NATURAL_SURFACES.has(look.surface);
    const t = atlas.tileOf(look);
    return {
      tileX: atlas.cellX(t),
      tileY: atlas.cellY(t),
      flags: brickFlags(id, look, pixel),
      roughness: roughnessOf(look, pixel),
      color: toyColor(look.color),
      kind: 0,
    };
  });
}

// --- studs ----------------------------------------------------------------------

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

function makeStuds(pixelNatural: boolean) {
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
      (pixelNatural && NATURAL_SURFACES.has(look.surface))
        ? 1
        : 0;
  }
  const studGeo = [studGeometry(10, true), studGeometry(6, false)];
  const studMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0 });
  studMat.onBeforeCompile = (shader) => injectCutaway(shader);
  studMat.customProgramCacheKey = () => 'toy-stud-cut';
  const tmp = new THREE.Color();

  return {
    decorate(g: ChunkGeometry, dist: number, tier: QualityTier): THREE.Object3D | null {
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
        brickJitter(tmp, studColor[id], x, y, z);
        col[k * 3] = tmp.r;
        col[k * 3 + 1] = tmp.g;
        col[k * 3 + 2] = tmp.b;
        k++;
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.matrixAutoUpdate = false;
      mesh.name = `studs:${g.cx},${g.cz}`;
      return mesh;
    },
    dispose() {
      studMat.dispose();
      for (const geo of studGeo) geo.dispose();
    },
  };
}

// --- light -----------------------------------------------------------------------

const DAY = skyKey('#87c5f0', '#dcefff', '#b9a77f', 0.75, '#fff0d4', 3.2, 0.32, 0.8);
const DUSK = skyKey('#e9a27a', '#ffd6bd', '#7c6a7c', 0.7, '#ffa45c', 2.4, 0.25, 0.7);
const NIGHT = skyKey('#0b1d3a', '#a7b8ee', '#46507a', 1.0, '#b8c8ff', 0.7, 0.12, 0.45);

export interface BrickSkinOptions {
  id: SkinId;
  /** Natural surfaces keep the pixel atlas (the hybrid). */
  pixelNatural: boolean;
}

export function createBrickSkin(opts: BrickSkinOptions): Skin {
  const studs = makeStuds(opts.pixelNatural);
  return createStyledBrickSkin({
    id: opts.id,
    cacheKey: `${opts.id}-chunk`,
    lookup: buildLookup(opts.pixelNatural),
    atlas: getPixelAtlas().texture,
    keys: { day: DAY, dusk: DUSK, night: NIGHT },
    // key light from the upper left, a bit in front, so shadows fall right and away
    sunDir: new THREE.Vector3(-20, 40, 14).normalize(),
    sunDist: 60,
    shadowHalf: 16,
    shadowMap: 1024,
    shadowRadius: 3,
    fog: { near: 48, far: 86 },
    post: { blur: 0.0075, band: [0.1, 0.5], grade: TOY_GRADE },
    chunksCast: true,
    decorate: studs.decorate,
    disposeDecor: studs.dispose,
  });
}

export function createToySkin(): Skin {
  return createBrickSkin({ id: 'toy', pixelNatural: false });
}
