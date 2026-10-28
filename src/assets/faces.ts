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

export type FaceId = 'lyosha' | 'solomiia' | 'pupsia' | 'zombie' | 'skeleton' | 'spider';

export const ATLAS_W = 16;
export const ATLAS_H = 8;
/** Share of the atlas width taken by the face (u range of the front side). */
export const FACE_U = 8 / ATLAS_W;

/** UV of the centre of swatch `i` (0..7). */
export function swatchUV(i: number): [number, number] {
  return [(8 + i + 0.5) / ATLAS_W, 0.5];
}

interface FaceDef {
  /** Swatch colours; swatch 0 is the head's base colour (skin / fur / bone). */
  swatches: string[];
  /** Palette of the face rows. '.' is always swatch 0. */
  pal: Record<string, string>;
  open: string[];
  /** Rows replaced when the eyes are shut. */
  closed: Record<number, string>;
}

const DEFS: Record<FaceId, FaceDef> = {
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
  zombie: {
    // green skin, hair, leaf, stem, stitch
    swatches: ['#93c45a', '#3f5230', '#5fd36a', '#7a5a34', '#4a6b2f'],
    pal: { d: '#7aa948', W: '#ffffff', K: '#26301c', T: '#fffbe6', M: '#5b2f3c' },
    open: [
      '........',
      '.d......',
      '........',
      '.WW...W.',
      '.WK..WK.',
      '......d.',
      '..MTMM..',
      '...MM...',
    ],
    closed: { 3: '........', 4: '.KK..KK.' },
  },
  skeleton: {
    // bone, bone shade, socket dark, bow tie red, bow tie dark
    swatches: ['#f1ece0', '#d6ccb6', '#3a3048', '#ff6b4a', '#c94a32'],
    pal: { s: '#d6ccb6', K: '#3a3048', W: '#ffffff', B: '#7fd0ff' },
    open: [
      '........',
      '........',
      '.KK..KK.',
      '.KB..KB.',
      '...KK...',
      '........',
      '.K....K.',
      '..KsKK..',
    ],
    closed: { 2: '........', 3: '.KK..KK.' },
  },
  spider: {
    // body, legs, belly, fang
    swatches: ['#5c6bc0', '#3f4a9a', '#9fa8da', '#ffffff'],
    pal: { K: '#16163a', W: '#ffffff', R: '#ff8a80', F: '#ffffff', P: '#ff9ec7' },
    open: [
      'K......K',
      '........',
      '.KW..KW.',
      '.KK..KK.',
      '.KK..KK.',
      'P......P',
      '..F..F..',
      '..F..F..',
    ],
    closed: { 2: '........', 3: '........', 4: '.KK..KK.' },
  },
};

export interface FaceAtlas {
  id: FaceId;
  open: THREE.Texture;
  closed: THREE.Texture;
}

const cache = new Map<FaceId, FaceAtlas>();

function paint(def: FaceDef, rows: string[]): THREE.CanvasTexture {
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

/** Cached for the whole session: the textures are shared by every instance. */
export function faceAtlas(id: FaceId): FaceAtlas {
  let a = cache.get(id);
  if (a) return a;
  const def = DEFS[id];
  const closedRows = def.open.map((r, i) => def.closed[i] ?? r);
  a = { id, open: paint(def, def.open), closed: paint(def, closedRows) };
  cache.set(id, a);
  return a;
}

/** Swatch colours of a face (for code that wants the same palette). */
export function faceSwatches(id: FaceId): readonly string[] {
  return DEFS[id].swatches;
}
