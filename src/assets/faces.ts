/**
 * 8×8 pixel faces, one small canvas atlas per character.
 *
 * Atlas layout (16×8 px): columns 0..7 hold the face, columns 8..15 hold flat
 * colour swatches. A head is one box: its front (+Z) side shows the face, the
 * other sides — and any hair, ears or muzzle boxes merged into the same mesh —
 * sample a swatch. So a whole head is one draw call, and blinking is just a
 * material swap between the open and closed atlas.
 */
import * as THREE from 'three';

export type FaceId =
  | 'lyosha'
  | 'solomiia'
  | 'pupsia'
  | 'elf'
  | 'elf_elder'
  | 'elf_queen'
  | 'gnome'
  | 'gnome_elder'
  | 'gnome_kid'
  | 'robot'
  | 'robot_elder'
  | 'robot_kid'
  | 'alien'
  | 'alien_lilac'
  | 'alien_mint'
  | 'alien_elder'
  | 'alien_kid';

export const ATLAS_W = 16;
export const ATLAS_H = 8;
/** Share of the atlas width taken by the face (u range of the front side). */
export const FACE_U = 8 / ATLAS_W;

/** UV of the centre of swatch `i` (0..7). */
export function swatchUV(i: number): [number, number] {
  return [(8 + i + 0.5) / ATLAS_W, 0.5];
}

/**
 * An 8×8 face: swatches, a palette and the open / closed rows. Monsters and companions keep
 * theirs in their own part file (`export const face: FaceSpec`) and pass it to `faceAtlas`.
 */
export interface FaceSpec {
  /** Swatch colours; swatch 0 is the head's base colour (skin / fur / bone). */
  swatches: string[];
  /** Palette of the face rows. '.' is always swatch 0. */
  pal: Record<string, string>;
  open: string[];
  /** Rows replaced when the eyes are shut. */
  closed: Record<number, string>;
}

/** Big dark almond eyes on a bare head; `rows` may override the face rows (kids, elders). */
function alienDef(skin: string, shade: string, extra: Partial<FaceSpec> = {}): FaceSpec {
  return {
    // skin, shade, antenna ball cream, ball coral
    swatches: [skin, shade, '#ffe3a3', '#e0583f'],
    pal: { K: '#1c1830', W: '#f4f0ff', M: '#5a3a5e', d: shade, P: '#e69aa0' },
    open: [
      '........',
      '........',
      '.KK..KK.',
      'KWK..KWK',
      'KKK..KKK',
      '.KK..KK.',
      '...MM...',
      '........',
    ],
    closed: { 2: '........', 3: '........', 4: 'KKK..KKK', 5: '........' },
    ...extra,
  };
}

const DEFS_FOLK: Record<string, FaceSpec> = {
  elf: {
    // skin, ear shade
    swatches: ['#f3d0a8', '#e0b58c'],
    pal: { K: '#2b2a22', G: '#3f7a34', W: '#fffaf0', h: '#a8793a', P: '#f1a88e', M: '#c0605a' },
    open: [
      '........',
      '........',
      '.hh..hh.',
      '.GW..WG.',
      '.GK..KG.',
      'P......P',
      '...MM...',
      '........',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  elf_elder: {
    swatches: ['#f0cba4', '#dcb088'],
    pal: { K: '#2b2a22', G: '#4a7a8a', W: '#fffaf0', h: '#e6e8ea', P: '#eaa088', M: '#b85a54', l: '#d9ae88' },
    open: [
      '........',
      '........',
      '.hh..hh.',
      '.GW..WG.',
      '.GK..KG.',
      'l......l',
      '...MM...',
      '........',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  elf_queen: {
    // skin, ear shade; lashes over green eyes, rosy cheeks
    swatches: ['#f6d5b0', '#e3b890'],
    pal: { K: '#2b2a22', G: '#3f8a5a', W: '#fffaf0', P: '#f4a0a0', M: '#d0607a' },
    open: [
      '........',
      '........',
      'KKK..KKK',
      '.GW..WG.',
      '.GK..KG.',
      'P......P',
      '...MM...',
      '........',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  gnome: {
    // skin, shade
    swatches: ['#eec0a0', '#d9a07e'],
    pal: { K: '#2b2420', W: '#fff8ee', b: '#8a6a4a', N: '#e07a62' },
    open: [
      '........',
      '........',
      '.bb..bb.',
      '.WK..KW.',
      '...NN...',
      '..NNNN..',
      '........',
      '........',
    ],
    closed: { 3: '.KK..KK.' },
  },
  gnome_elder: {
    swatches: ['#ebb99a', '#d49a78'],
    pal: { K: '#2b2420', W: '#fff8ee', b: '#f0eee8', N: '#dd7860' },
    open: [
      '........',
      '.bb..bb.',
      '.bb..bb.',
      '.WK..KW.',
      '...NN...',
      '..NNNN..',
      '........',
      '........',
    ],
    closed: { 3: '.KK..KK.' },
  },
  gnome_kid: {
    swatches: ['#f2c8a8', '#dca686'],
    pal: { K: '#2b2420', W: '#fff8ee', b: '#b08a60', N: '#e8907e', P: '#ee9a88', M: '#b0524a' },
    open: [
      '........',
      '........',
      '.bb..bb.',
      '.WK..KW.',
      '.KK..KK.',
      'P..NN..P',
      '..M..M..',
      '...MM...',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  robot: {
    // screen dark, rim light
    swatches: ['#26373a', '#9aa4ac'],
    pal: { E: '#ffe3a3', M: '#ffe3a3' },
    open: [
      '........',
      '........',
      '.EE..EE.',
      '.EE..EE.',
      '........',
      '........',
      '.M....M.',
      '..MMMM..',
    ],
    closed: { 2: '........' },
  },
  robot_elder: {
    swatches: ['#2e2a22', '#a8723a'],
    pal: { E: '#f0a23a', M: '#d98a30' },
    open: [
      '........',
      '........',
      '.EE..EE.',
      '.EE..EE.',
      '........',
      '.M.MM.M.',
      '..MMMM..',
      '........',
    ],
    closed: { 2: '........' },
  },
  robot_kid: {
    swatches: ['#26373a', '#9aa4ac'],
    pal: { E: '#ffe3a3', K: '#26373a', M: '#ffe3a3' },
    open: [
      '........',
      '........',
      '.EE..EE.',
      'EKE..EKE',
      '.EE..EE.',
      '........',
      '.M....M.',
      '..MMMM..',
    ],
    closed: { 2: '........', 3: 'EEE..EEE', 4: '........' },
  },
  alien: alienDef('#86c274', '#6aa85c'),
  alien_lilac: alienDef('#b79ad0', '#9a7cb8'),
  alien_mint: alienDef('#7fc4b0', '#5ea896'),
  alien_elder: alienDef('#a3b58a', '#869a70', {
    pal: { K: '#1c1830', W: '#f4f0ff', M: '#5a3a5e', d: '#869a70', P: '#e69aa0' },
    open: [
      '........',
      '.dd..dd.',
      '.KK..KK.',
      'KWK..KWK',
      'KKK..KKK',
      '.KK..KK.',
      '...MM...',
      '........',
    ],
  }),
  alien_kid: alienDef('#86c274', '#6aa85c', {
    open: [
      '........',
      '.KK..KK.',
      'KWK..KWK',
      'KKK..KKK',
      'KKK..KKK',
      '.KK..KK.',
      'P..MM..P',
      '........',
    ],
    closed: { 1: '........', 2: '........', 3: '........', 4: 'KKK..KKK', 5: '........' },
  }),
};

const DEFS: Record<FaceId, FaceSpec> = {
  lyosha: {
    // skin, hair, hair shade, ear, cheek
    swatches: ['#f6c9a2', '#f4d064', '#dcae3c', '#eab48c', '#f29b8c'],
    pal: { H: '#f4d064', K: '#22305e', B: '#2f5fc4', W: '#ffffff', P: '#f4a28f', M: '#b0524a' },
    open: [
      'HHHHHHHH',
      'HHHHHHHH',
      '........',
      '.BW..BW.',
      '.KB..KB.',
      'P.M..M.P',
      '...MM...',
      '........',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  solomiia: {
    // skin, hair, hair shade, clip pink, clip light
    swatches: ['#f8d3b4', '#7a3b20', '#5e2b16', '#ff5fa2', '#ffd1e6'],
    pal: { H: '#7a3b20', K: '#2a1c22', G: '#6b4226', W: '#ffffff', P: '#f6a0a6', M: '#d65a78' },
    open: [
      'HHHHHHHH',
      'HHHHHHHH',
      'HHHH....',
      'KGW..GWK',
      '.KG..KG.',
      'P.M..M.P',
      '...MM...',
      '........',
    ],
    closed: { 3: 'K......K', 4: '.KK..KK.' },
  },
  pupsia: {
    // tabby, stripe, white, pink nose / inner ear, whisker
    swatches: ['#9a8770', '#3b3029', '#f7f2ea', '#f49ab3', '#fffaf2'],
    pal: { S: '#3b3029', W: '#f7f2ea', G: '#5cc93a', g: '#c5f27a', K: '#1d1a17', N: '#f49ab3' },
    open: [
      '.S.SS.S.',
      '.S....S.',
      '........',
      '.gK..Kg.',
      '.GK..KG.',
      '..WWWW..',
      '.WWWWWW.',
      '.WWWWWW.',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  ...(DEFS_FOLK as Record<
    'elf' | 'elf_elder' | 'elf_queen' | 'gnome' | 'gnome_elder' | 'gnome_kid' | 'robot' | 'robot_elder' | 'robot_kid' | 'alien' | 'alien_lilac' | 'alien_mint' | 'alien_elder' | 'alien_kid',
    FaceSpec
  >),
};

export interface FaceAtlas {
  id: string;
  open: THREE.Texture;
  closed: THREE.Texture;
}

const cache = new Map<string, FaceAtlas>();

function paint(def: FaceSpec, rows: string[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const g = canvas.getContext('2d')!;
  g.fillStyle = def.swatches[0];
  g.fillRect(0, 0, ATLAS_W, ATLAS_H);
  for (let y = 0; y < 8; y++) {
    const row = rows[y];
    for (let x = 0; x < 8; x++) {
      const c = row[x];
      if (c === '.' || c === undefined) continue;
      const col = def.pal[c];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  def.swatches.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(8 + i, 0, 1, ATLAS_H);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Cached for the whole session: the textures are shared by every instance. A part file with its
 * own face passes it as `spec` (the id then only names the cache entry).
 */
export function faceAtlas(id: FaceId | string, spec?: FaceSpec): FaceAtlas {
  let a = cache.get(id);
  if (a) return a;
  const def = spec ?? DEFS[id as FaceId];
  if (!def) throw new Error(`no face "${id}": export \`face\` from its part file and pass it to faceAtlas`);
  const closedRows = def.open.map((r, i) => def.closed[i] ?? r);
  a = { id, open: paint(def, def.open), closed: paint(def, closedRows) };
  cache.set(id, a);
  return a;
}

/** Swatch colours of a face (for code that wants the same palette). */
export function faceSwatches(id: FaceId): readonly string[] {
  return DEFS[id].swatches;
}
