/**
 * node tools/icons/make-icons.mjs
 * Draws a pixel-art tabby cat face on a grass-green block and writes PNG icons
 * to public/icons/. Dependency-free (node:zlib), nearest-neighbour scaling.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'public/icons');

// 16x16 cat face.  K stripe/outline  B fur  D dark fur  E inner ear  G eye  X pupil  P nose  W white chin
const ART = [
  '................',
  '.KK..........KK.',
  '.KEK........KEK.',
  '.KBBBBKBBKBBBBK.',
  '.KBBBBBKKBBBBBK.',
  '.KBKBBBBBBBBKBK.',
  '.KBBGGBBBBGGBBK.',
  '.KBBGXBBBBXGBBK.',
  '.KKBBBBBBBBBBKK.',
  '.KBKBBBPPBBBKBK.',
  '.KBBBWWKKWWBBBK.',
  '.KBBBWWWWWWBBBK.',
  '..KBBBWWWWBBBK..',
  '...KKBBBBBBKK...',
  '.....KKKKKK.....',
  '................',
];

const PAL = {
  K: [34, 28, 30],
  B: [170, 140, 110],
  D: [130, 105, 82],
  E: [236, 150, 160],
  G: [88, 200, 90],
  X: [20, 20, 24],
  P: [244, 128, 148],
  W: [250, 246, 238],
};

const GRASS = [[92, 176, 66], [84, 166, 60], [100, 186, 72]];
const GRASS_EDGE = [58, 120, 44];
const GRASS_HI = [124, 206, 92];

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** @param {number} size @param {number} frac share of the canvas the 16x16 art occupies @param {boolean} bevel */
function render(size, frac, bevel) {
  const cell = Math.max(1, Math.floor((size * frac) / 16));
  const margin = Math.floor((size - cell * 16) / 2);
  const tex = Math.max(1, Math.floor(size / 32)); // grass texture pixel
  const edge = bevel ? Math.max(1, Math.round(size / 32)) : 0;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c;
      const ax = Math.floor((x - margin) / cell);
      const ay = Math.floor((y - margin) / cell);
      const ch = ax >= 0 && ax < 16 && ay >= 0 && ay < 16 ? ART[ay][ax] : '.';
      if (ch !== '.') {
        c = PAL[ch];
        // soften fur: tiny lighter top row of each fur block for a "voxel" feel
        if (ch === 'B' && (y - margin) % cell === 0) c = [184, 154, 124];
      } else if (x < edge || y < edge) {
        c = GRASS_HI;
      } else if (x >= size - edge || y >= size - edge) {
        c = GRASS_EDGE;
      } else {
        c = GRASS[Math.floor(hash(Math.floor(x / tex), Math.floor(y / tex)) * GRASS.length)];
      }
      const i = (y * size + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return px;
}

// ─── PNG encoder ────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  ['icon-64.png', 64, 0.94, true],
  ['icon-180.png', 180, 0.94, true],
  ['icon-192.png', 192, 0.94, true],
  ['icon-512.png', 512, 0.94, true],
  // maskable: full-bleed grass, cat well inside the 80% safe circle
  ['icon-maskable-512.png', 512, 0.62, false],
];
for (const [name, size, frac, bevel] of jobs) {
  fs.writeFileSync(path.join(outDir, name), png(size, render(size, frac, bevel)));
  console.log(`wrote public/icons/${name}`);
}
