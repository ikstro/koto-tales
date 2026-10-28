/**
 * Procedural pixel atlas for the pixel skin: one 16×16 tile per distinct
 * (surface, colour) pair, drawn with a seeded random so it is identical every run.
 * Each tile sits in an 18×18 cell with its edge pixels extruded by one texel,
 * so sampling at tile edges never picks up a neighbour tile.
 */
import * as THREE from 'three';
import { BLOCKS, B, type FaceLook, type Surface } from '../../world/blocks';
import { hashString, mulberry32 } from '../../world/rng';

export const TILE = 16;
export const CELL = TILE + 2;
const COLS = 8;

export interface PixelAtlas {
  texture: THREE.DataTexture;
  /** Raw RGBA pixels (row 0 = bottom of the texture). */
  pixels: Uint8Array;
  width: number;
  height: number;
  /** Tile index of a face look (every look of BLOCKS is in the atlas). */
  tileOf(look: FaceLook): number;
  /** Texel x/y of a tile's cell corner (the tile itself starts one texel in). */
  cellX(tile: number): number;
  cellY(tile: number): number;
}

const parseHex = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

type Put = (x: number, y: number, r: number, g: number, b: number, a?: number) => void;

function drawTile(look: FaceLook, put: Put): void {
  const rnd = mulberry32(hashString(look.color + '|' + look.surface));
  const [br, bg, bb] = parseHex(look.color);
  const px = (x: number, y: number, k: number, a = 255, c: [number, number, number] = [br, bg, bb]) =>
    put(x, y, c[0] * k, c[1] * k, c[2] * k, a);
  const s: Surface = look.surface;

  const noise = (amp: number, darkP: number, dark: number, lightP: number, light: number) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        let k = 1 + (rnd() - 0.5) * amp;
        const r = rnd();
        if (r < darkP) k *= dark;
        else if (r > 1 - lightP) k *= light;
        px(x, y, k);
      }
  };

  switch (s) {
    case 'earth':
      noise(0.16, 0.1, 0.8, 0.05, 1.1);
      break;
    case 'grass':
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          let k = 1 + (rnd() - 0.5) * 0.12;
          const r = rnd();
          if (r < 0.1) k *= 0.84;
          else if (r > 0.93) k *= 1.14;
          px(x, y, k);
        }
      break;
    case 'sand':
      noise(0.08, 0.06, 0.9, 0.06, 1.06);
      break;
    case 'snow':
      noise(0.04, 0.05, 0.94, 0, 1);
      break;
    case 'stone': {
      noise(0.1, 0.0, 1, 0.04, 1.1);
      // a few darker cracks
      for (let i = 0; i < 4; i++) {
        let x = Math.floor(rnd() * TILE);
        let y = Math.floor(rnd() * TILE);
        const len = 2 + Math.floor(rnd() * 3);
        for (let j = 0; j < len; j++) {
          px(x, y, 0.78 + rnd() * 0.06);
          if (rnd() < 0.5) x = (x + 1) % TILE;
          else y = (y + 1) % TILE;
        }
      }
      break;
    }
    case 'grass-side': {
      const green = parseHex(BLOCKS[B.GRASS].top.color);
      for (let x = 0; x < TILE; x++) {
        const depth = 2 + Math.floor(rnd() * 3);
        for (let y = 0; y < TILE; y++) {
          const k = 1 + (rnd() - 0.5) * 0.14;
          if (y < depth) px(x, y, k, 255, green);
          else if (y === depth) px(x, y, k * 0.82, 255, green);
          else px(x, y, rnd() < 0.08 ? k * 0.82 : k);
        }
      }
      break;
    }
    case 'bark':
      for (let x = 0; x < TILE; x++) {
        const colK = 1 + (rnd() - 0.5) * 0.18;
        const groove = x % 4 === 1;
        for (let y = 0; y < TILE; y++) {
          let k = colK * (1 + (rnd() - 0.5) * 0.08);
          if (groove) k *= 0.72;
          px(x, y, k);
        }
      }
      break;
    case 'wood-rings': {
      const bark = parseHex(BLOCKS[B.LOG].side.color);
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) * 0.6 + Math.hypot(x - 7.5, y - 7.5) * 0.4;
          if (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1) {
            px(x, y, 1 + (rnd() - 0.5) * 0.12, 255, bark);
            continue;
          }
          const ring = Math.floor(d * 0.9) % 2 === 0 ? 1.0 : 0.84;
          px(x, y, ring * (1 + (rnd() - 0.5) * 0.06));
        }
      break;
    }
    case 'leaves':
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const r = rnd();
          let k = 0.92 + rnd() * 0.12;
          if (r < 0.14) k = 0.62;
          else if (r < 0.34) k = 1.16;
          px(x, y, k);
        }
      break;
    case 'planks':
      for (let y = 0; y < TILE; y++) {
        const board = Math.floor(y / 4);
        const boardK = 1 + ((((board * 2654435761) >>> 0) % 100) / 100 - 0.5) * 0.12;
        const seam = (board * 7 + 3) % TILE;
        for (let x = 0; x < TILE; x++) {
          let k = boardK * (1 + (rnd() - 0.5) * 0.07);
          if (y % 4 === 3) k *= 0.7;
          else if (x === seam) k *= 0.75;
          px(x, y, k);
        }
      }
      break;
    case 'brick': {
      const mortar: [number, number, number] = [205, 196, 182];
      for (let y = 0; y < TILE; y++) {
        const row = Math.floor(y / 4);
        for (let x = 0; x < TILE; x++) {
          const bx = (x + (row % 2) * 4) % 8;
          if (y % 4 === 3 || bx === 7) {
            px(x, y, 1 + (rnd() - 0.5) * 0.06, 255, mortar);
          } else {
            const brickId = row * 4 + Math.floor((x + (row % 2) * 4) / 8);
            const bk = 1 + ((((brickId * 2246822519) >>> 0) % 100) / 100 - 0.5) * 0.16;
            px(x, y, bk * (1 + (rnd() - 0.5) * 0.08));
          }
        }
      }
      break;
    }
    case 'cobble': {
      const pts: number[] = [];
      for (let i = 0; i < 9; i++) pts.push(rnd() * TILE, rnd() * TILE, 0.82 + rnd() * 0.3);
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          let d1 = 1e9;
          let d2 = 1e9;
          let k1 = 1;
          for (let i = 0; i < pts.length; i += 3) {
            for (let oy = -TILE; oy <= TILE; oy += TILE)
              for (let ox = -TILE; ox <= TILE; ox += TILE) {
                const d = Math.hypot(x + 0.5 - pts[i] - ox, y + 0.5 - pts[i + 1] - oy);
                if (d < d1) {
                  d2 = d1;
                  d1 = d;
                  k1 = pts[i + 2];
                } else if (d < d2) d2 = d;
              }
          }
          let k = k1 * (1 + (rnd() - 0.5) * 0.08);
          if (d2 - d1 < 1.1) k = 0.55;
          px(x, y, k);
        }
      break;
    }
    case 'roof':
      for (let y = 0; y < TILE; y++) {
        const row = Math.floor(y / 4);
        const shift = (row % 2) * 4;
        for (let x = 0; x < TILE; x++) {
          let k = 1 + (rnd() - 0.5) * 0.08;
          if (y % 4 === 3) k *= 0.68;
          else if ((x + shift) % 8 === 0) k *= 0.75;
          else if (y % 4 === 0) k *= 1.1;
          px(x, y, k);
        }
      }
      break;
    case 'plastic':
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          let k = 1 + (rnd() - 0.5) * 0.05 + ((x + y) % 2 ? 0.012 : -0.012);
          if (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1) k *= 0.88;
          px(x, y, k);
        }
      break;
    case 'glass':
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
          if (edge) px(x, y, 0.85, 255);
          else if ((x + y === 9 || x + y === 10) && x > 2 && x < 9) put(x, y, 255, 255, 255, 190);
          else if (x + y === 13 && x > 5 && x < 11) put(x, y, 255, 255, 255, 150);
          else px(x, y, 1, 60);
        }
      break;
    case 'water':
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const wave = (y + Math.round(1.5 * Math.sin((x / TILE) * Math.PI * 2 + y * 0.9))) % 6;
          let k = 1 + (rnd() - 0.5) * 0.05;
          if (wave === 0) k *= 1.18;
          else if (wave === 1) k *= 1.07;
          px(x, y, k, 191); // ~0.75 opacity
        }
      break;
    case 'lantern': {
      const frame: [number, number, number] = [78, 52, 46];
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const edge = x < 2 || y < 2 || x > TILE - 3 || y > TILE - 3;
          const bar = x === 7 || x === 8 || y === 7 || y === 8;
          if (edge) px(x, y, 1 + (rnd() - 0.5) * 0.1, 255, frame);
          else if (bar) px(x, y, 0.8, 255, [200, 150, 60]);
          else {
            const d = Math.hypot(x - 7.5, y - 7.5) / 7;
            const w = Math.max(0, 1 - d) * 0.75;
            put(x, y, br + (255 - br) * w, bg + (255 - bg) * w, bb + (255 - bb) * w, 255);
          }
        }
      break;
    }
    case 'gold':
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          let k = 1 + (rnd() - 0.5) * 0.06;
          if (x === 0 || y === 0) k *= 1.25;
          else if (x === TILE - 1 || y === TILE - 1) k *= 0.72;
          else if ((x + y) % 7 === 0 && rnd() < 0.6) k *= 1.3;
          px(x, y, k);
        }
      break;
  }
}

let shared: PixelAtlas | null = null;

/** Builds the atlas once (all looks in BLOCKS) and shares it. */
export function getPixelAtlas(): PixelAtlas {
  if (shared) return shared;

  const looks: FaceLook[] = [];
  const index = new Map<string, number>();
  const keyOf = (look: FaceLook) => look.color.toLowerCase() + '|' + look.surface;
  for (const key of Object.keys(BLOCKS)) {
    const id = Number(key);
    if (id === B.AIR) continue;
    const def = BLOCKS[id];
    for (const look of [def.top, def.side, def.bottom]) {
      const k = keyOf(look);
      if (!index.has(k)) {
        index.set(k, looks.length);
        looks.push(look);
      }
    }
  }

  const rows = Math.ceil(looks.length / COLS);
  const width = COLS * CELL;
  let height = 1;
  while (height < rows * CELL) height <<= 1;
  const pixels = new Uint8Array(width * height * 4);

  looks.forEach((look, t) => {
    const ox = (t % COLS) * CELL + 1;
    const oy = Math.floor(t / COLS) * CELL + 1; // texture rows, bottom-up
    // tile pixel (x, y) with y = 0 at the visual top → texture row oy + 15 - y
    const put: Put = (x, y, r, g, b, a = 255) => {
      const i = ((oy + TILE - 1 - y) * width + ox + x) * 4;
      pixels[i] = Math.max(0, Math.min(255, Math.round(r)));
      pixels[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      pixels[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      pixels[i + 3] = a;
    };
    drawTile(look, put);
    // extrude edges into the 1-texel border
    const copy = (sx: number, sy: number, dx: number, dy: number) => {
      const si = (sy * width + sx) * 4;
      const di = (dy * width + dx) * 4;
      for (let k = 0; k < 4; k++) pixels[di + k] = pixels[si + k];
    };
    for (let i = 0; i < TILE; i++) {
      copy(ox + i, oy, ox + i, oy - 1);
      copy(ox + i, oy + TILE - 1, ox + i, oy + TILE);
      copy(ox, oy + i, ox - 1, oy + i);
      copy(ox + TILE - 1, oy + i, ox + TILE, oy + i);
    }
    copy(ox, oy, ox - 1, oy - 1);
    copy(ox + TILE - 1, oy, ox + TILE, oy - 1);
    copy(ox, oy + TILE - 1, ox - 1, oy + TILE);
    copy(ox + TILE - 1, oy + TILE - 1, ox + TILE, oy + TILE);
  });

  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  shared = {
    texture,
    pixels,
    width,
    height,
    tileOf: (look) => index.get(keyOf(look)) ?? 0,
    cellX: (t) => (t % COLS) * CELL,
    cellY: (t) => Math.floor(t / COLS) * CELL,
  };
  return shared;
}
