import { CHUNK_SIZE, SEA_LEVEL, type IWorld } from '../contracts';
import { B, blockDef } from '../world/blocks';

/**
 * Map tiles: one small canvas per explored chunk, drawn from the world data the
 * first time it is needed and kept in memory only. Each block column is a 3×3
 * px brick seen from above: a lit upper-left edge, a shaded lower-right edge and
 * a tiny round highlight in the middle (the stud), so the map reads as a studded
 * brick plate. Colours are the «Діорама» ones (render/skins/diorama.ts).
 */

export const TILE_PX = 3;
export const TILE_SIZE = CHUNK_SIZE * TILE_PX;
const CS = CHUNK_SIZE;

type RGB = [number, number, number];
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const list = (a: string[]) => a.map(rgb);

// «Діорама» palette (kept in step with render/skins/diorama.ts by hand).
const GRASS = list(['#4f5d29', '#5d682c', '#6c7230', '#7c7b33', '#8d8537', '#a5943f']);
const LEAF = list(['#2c461c', '#3a5623', '#4b6629', '#63752a', '#78852d', '#8d9132', '#a58c25', '#bf9f2b', '#d6b636']);
const STONE = list(['#c4924e', '#d6aa62', '#b78044', '#e0ba74']);
const SAND = list(['#e3bb72', '#eac67f', '#d6ad66']);
const SNOW = list(['#f7f0e2', '#f2e8d6', '#fbf5ea']);
const WATER = list(['#5fb9c2', '#47a9bd', '#2f8fa6', '#23778f']);
const EARTH = rgb('#a46d3c');
const LOG = rgb('#c99256');

function hash(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The grass mosaic: patches of six tones, as the skin lays them. */
function grassIdx(x: number, z: number): number {
  const p5 = hash(Math.floor(x / 6), 7, Math.floor(z / 6));
  const p3 = hash(Math.floor((x + 1) / 3), 11, Math.floor((z + 2) / 3));
  const r = hash(x, 3, z) & 7;
  let t = 1 + (p5 % 3) + (p3 % 2);
  if (r === 0) t -= 1;
  else if (r === 1) t += 1;
  return Math.min(5, Math.max(0, t));
}

const builtCache = new Map<number, RGB>();

/** Colour of a column seen from above, and its top height. */
function columnColour(world: IWorld, x: number, z: number, g: number, water: boolean): RGB {
  if (water) {
    const depth = SEA_LEVEL - g;
    return WATER[Math.max(0, Math.min(3, depth <= 0 ? 0 : depth <= 1 ? 1 : depth <= 3 ? 2 : 3))];
  }
  const id = g > 0 ? world.getBlock(x, g - 1, z) : B.STONE;
  switch (id) {
    case B.GRASS:
      return GRASS[grassIdx(x, z)];
    case B.LEAVES: {
      const fam = hash(Math.floor(x / 5), 5, Math.floor(z / 5)) % 8;
      const f = fam < 3 ? 0 : fam < 6 ? 1 : 2;
      return LEAF[f * 3 + (hash(x, 9, z) % 3)];
    }
    case B.SAND:
      return SAND[hash(x, 4, z) % 3];
    case B.STONE:
    case B.COBBLE:
      return STONE[hash(x, g, z) % 4];
    case B.SNOW:
      return SNOW[hash(x, 8, z) % 3];
    case B.DIRT:
      return EARTH;
    case B.LOG:
      return LOG;
    default: {
      let c = builtCache.get(id);
      if (!c) builtCache.set(id, (c = rgb(blockDef(id).top.color)));
      return c;
    }
  }
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Draws one chunk into a fresh 48×48 canvas. ~256 columns; the world generates the data if needed. */
export function drawTile(world: IWorld, cx: number, cz: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TILE_SIZE;
  const g2 = cv.getContext('2d')!;
  const img = g2.createImageData(TILE_SIZE, TILE_SIZE);
  const d = img.data;
  const x0 = cx * CS;
  const z0 = cz * CS;
  // heights with a one-block border to the west / north (relief shading, sun from the upper left)
  const hs = new Int16Array((CS + 1) * (CS + 1));
  for (let j = 0; j <= CS; j++) for (let i = 0; i <= CS; i++) hs[j * (CS + 1) + i] = world.groundHeight(x0 + i - 1, z0 + j - 1);
  for (let lz = 0; lz < CS; lz++) {
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const h = hs[(lz + 1) * (CS + 1) + lx + 1];
      const hw = hs[(lz + 1) * (CS + 1) + lx];
      const hn = hs[lz * (CS + 1) + lx + 1];
      const water = world.getBlock(x, h, z) === B.WATER;
      const [r, g, b] = columnColour(world, x, z, h, water);
      // relief: higher than the west / north neighbours = lit, lower = in shade
      const rel = water ? 0 : Math.max(-3, Math.min(3, h - hw + (h - hn)));
      const k = 1 + rel * 0.07 + (water ? 0 : (h - SEA_LEVEL) * 0.004);
      for (let py = 0; py < TILE_PX; py++) {
        for (let px = 0; px < TILE_PX; px++) {
          // bevel: upper-left lit, lower-right shaded, the middle a little stud highlight
          const edge = px + py;
          let m = k * (edge === 0 ? 1.16 : edge === 4 ? 0.8 : edge === 3 ? 0.9 : 1);
          if (px === 1 && py === 1) m = k * (water ? 1.06 : 1.12);
          const o = ((lz * TILE_PX + py) * TILE_SIZE + lx * TILE_PX + px) * 4;
          d[o] = clamp(r * m);
          d[o + 1] = clamp(g * m);
          d[o + 2] = clamp(b * m);
          d[o + 3] = 255;
        }
      }
    }
  }
  g2.putImageData(img, 0, 0);
  return cv;
}

/** Lazily built tiles, invalidated when a block changes. Memory only. */
export class TileCache {
  private tiles = new Map<string, HTMLCanvasElement>();
  /** Bumped when a tile is built or dropped, so views know to redraw. */
  version = 0;

  constructor(private world: IWorld) {}

  peek(cx: number, cz: number): HTMLCanvasElement | undefined {
    return this.tiles.get(`${cx},${cz}`);
  }

  /** The tile, building it if `build` allows (callers keep a time budget). */
  get(cx: number, cz: number, build: boolean): HTMLCanvasElement | undefined {
    const k = `${cx},${cz}`;
    let t = this.tiles.get(k);
    if (!t && build) {
      t = drawTile(this.world, cx, cz);
      this.tiles.set(k, t);
      this.version++;
    }
    return t;
  }

  /** A block changed at (x, z): its tile, and the east / south neighbours whose relief reads it. */
  invalidate(x: number, z: number): void {
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    const drop = (a: number, b: number) => {
      if (this.tiles.delete(`${a},${b}`)) this.version++;
    };
    drop(cx, cz);
    if (x - cx * CS === CS - 1) drop(cx + 1, cz);
    if (z - cz * CS === CS - 1) drop(cx, cz + 1);
  }
}
