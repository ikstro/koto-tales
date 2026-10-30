/**
 * «Льошині казки» — the title, the first thing after load.
 *
 * While the game loads: a night sky and the logo built from bricks (CSS, so it
 * keeps dropping in even while the world is being built on the main thread).
 * Then the same logo in 3D: real toy bricks (the skin's plastic, studs on top)
 * floating in the sky above the house at night — warm windows, the campfire,
 * a slow camera drift. Under it a round mustard ▶ tile on a teal studded plate,
 * breathing. The touch on ▶ unlocks sound, asks for fullscreen, the narrator
 * says the title, the bricks pop and scatter, the camera dives in through the
 * window and the wake ritual (ui/wake.ts) takes over inside the house.
 *
 * Cheap on purpose: the logo is one InstancedMesh, the button five small
 * meshes; they are drawn over the finished frame with their own two lights
 * (one extra draw of a tiny scene, no extra full-screen pass).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DOOR, HOUSE, houseWindows } from '../content/house';
import type { Ctx } from '../core/ctx';
import type { Game, Intro } from '../core/game';
import { LAMP_NIGHT } from '../systems/house';
import { B } from '../world/blocks';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { goFullscreen } from './fullscreen';
import './title.css';

const BASE = import.meta.env.BASE_URL;

// ─── the logo grid ──────────────────────────────────────────────────────────

/** Letters alternate between the two colours of their word. */
const WORDS: { text: string; colors: [string, string] }[] = [
  { text: 'Льошині', colors: ['#eab02b', '#e0583f'] },
  { text: 'казки', colors: ['#3aa89f', '#ffe3a3'] },
];
/** Rows of bricks in the x-height (lowercase letters). */
const X_HEIGHT = 7;
const LINE_GAP = 2;
/** Raster pixels per brick. */
const PX = 12;
/** Nunito's x-height as a fraction of the em. */
const NUNITO_X = 0.484;

export interface Brick {
  /** Column and row (from the top) in the logo grid. */
  x: number;
  y: number;
  color: string;
  /** Nothing above it: its stud shows. */
  top: boolean;
  /** Letter number across the whole logo (each letter leans a little its own way). */
  letter: number;
  /** Where the brick's centre ends up after its letter's lean (grid units, y down), and the lean (rad, clockwise). */
  px: number;
  py: number;
  rot: number;
}

export interface LogoGrid {
  cols: number;
  rows: number;
  bricks: Brick[];
}

/** One word rasterised with the bold rounded font into whole bricks. */
function rasterWord(text: string, family: string, colors: [string, string]): { cols: number; rows: number; cells: Brick[] } {
  const fontPx = Math.round((X_HEIGHT * PX) / NUNITO_X);
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const font = `900 ${fontPx}px ${family}`;
  g.font = font;
  const width = g.measureText(text).width;
  const cols = Math.ceil(width / PX) + 4;
  // the baseline on a row boundary, so the x-height is exactly X_HEIGHT rows
  const baseRow = Math.ceil(fontPx / PX) + 1;
  const rows = baseRow + Math.ceil((fontPx * 0.3) / PX) + 1;
  c.width = cols * PX;
  c.height = rows * PX;
  g.font = font;
  g.fillStyle = '#000';
  g.textBaseline = 'alphabetic';
  const x0 = 2 * PX;
  g.fillText(text, x0, baseRow * PX);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  // where every letter starts, for its colour
  const edges = [...text].map((_, i) => x0 + g.measureText(text.slice(0, i)).width);
  const on: boolean[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      for (let py = 0; py < PX; py++) {
        const row = ((y * PX + py) * c.width + x * PX) * 4 + 3;
        for (let px = 0; px < PX; px++) sum += data[row + px * 4];
      }
      on.push(sum / (PX * PX * 255) > 0.5);
    }
  }
  // a round dot (і) comes out as a plus: small islands become square bricks
  const seen = new Set<number>();
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen.has(i)) continue;
    const island = [i];
    seen.add(i);
    for (let k = 0; k < island.length && island.length <= 8; k++) {
      const x = island[k] % cols;
      const y = Math.floor(island[k] / cols);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = ny * cols + nx;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && on[j] && !seen.has(j)) {
          seen.add(j);
          island.push(j);
        }
      }
    }
    if (island.length > 8) continue;
    const xs = island.map((j) => j % cols);
    const ys = island.map((j) => Math.floor(j / cols));
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) for (let x = Math.min(...xs); x <= Math.max(...xs); x++) on[y * cols + x] = true;
  }
  let minX = cols;
  let maxX = -1;
  let minY = rows;
  let maxY = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!on[y * cols + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const cells: Brick[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!on[y * cols + x]) continue;
      const cx = (x + 0.5) * PX;
      let letter = 0;
      while (letter + 1 < edges.length && edges[letter + 1] <= cx) letter++;
      cells.push({ x: x - minX, y: y - minY, color: colors[letter % 2], top: false, letter, px: 0, py: 0, rot: 0 });
    }
  }
  return { cols: maxX - minX + 1, rows: maxY - minY + 1, cells };
}

function buildGrid(family: string): LogoGrid {
  const words = WORDS.map((w) => rasterWord(w.text, family, w.colors));
  const cols = Math.max(...words.map((w) => w.cols));
  const bricks: Brick[] = [];
  let y0 = 0;
  let letters = 0;
  words.forEach((w, wi) => {
    const dx = Math.floor((cols - w.cols) / 2);
    for (const b of w.cells) bricks.push({ ...b, x: b.x + dx, y: b.y + y0, letter: b.letter + letters });
    y0 += w.rows + LINE_GAP;
    letters += [...WORDS[wi].text].length;
  });
  const rows = y0 - LINE_GAP;
  const filled = new Set(bricks.map((b) => b.y * cols + b.x));
  for (const b of bricks) b.top = !filled.has((b.y - 1) * cols + b.x);
  // every letter leans and lifts a little, like toy letters set up by hand
  const centre = new Map<number, [number, number, number]>();
  for (const b of bricks) {
    const c = centre.get(b.letter) ?? [0, 0, 0];
    centre.set(b.letter, [c[0] + b.x + 0.5, c[1] + b.y + 0.5, c[2] + 1]);
  }
  for (const b of bricks) {
    const [sx, sy, n] = centre.get(b.letter)!;
    const cx = sx / n;
    const cy = sy / n;
    const rot = (hash(b.letter * 13.7 + 1) - 0.5) * 0.05;
    const lift = (hash(b.letter * 5.3 + 2) - 0.5) * 0.6;
    const dx = b.x + 0.5 - cx;
    const dy = b.y + 0.5 - cy;
    b.px = cx + Math.cos(rot) * dx - Math.sin(rot) * dy;
    b.py = cy + Math.sin(rot) * dx + Math.cos(rot) * dy + lift;
    b.rot = rot;
  }
  return { cols, rows, bricks };
}

let gridPromise: Promise<LogoGrid> | null = null;

/** The logo as bricks: Nunito 900 (vendored), or a system bold face if it fails to load. */
export function logoGrid(): Promise<LogoGrid> {
  gridPromise ??= (async () => {
    let family = '"Arial Black", system-ui, sans-serif';
    try {
      const face = new FontFace('Koto Title', `url(${BASE}fonts/nunito-cyr.woff2) format('woff2')`, { weight: '900' });
      await Promise.race([face.load(), new Promise((_, reject) => setTimeout(() => reject(new Error('font timeout')), 2500))]);
      document.fonts.add(face);
      family = '"Koto Title"';
    } catch {
      // offline without the font cached: the logo still builds, in a system face
    }
    return buildGrid(family);
  })();
  return gridPromise;
}

// ─── layout (CSS px), shared by the CSS loading logo and the 3D title ──────────

interface Layout {
  W: number;
  H: number;
  /** One brick, px. */
  cell: number;
  left: number;
  top: number;
  logoW: number;
  logoH: number;
  /** Centre and diameter of the ▶ piece (its plate), px. */
  btnX: number;
  btnY: number;
  btnD: number;
  /** Where the house's front sits on the screen, 0 top … 1 bottom. */
  houseY: number;
}

function layoutFor(grid: LogoGrid, W: number, H: number): Layout {
  const portrait = W < H;
  const cell = portrait ? Math.min((0.9 * W) / grid.cols, (0.22 * H) / grid.rows) : Math.min((0.62 * W) / grid.cols, (0.3 * H) / grid.rows);
  const logoW = grid.cols * cell;
  const logoH = grid.rows * cell;
  const top = portrait ? 0.1 * H : 0.06 * H;
  const btnD = Math.round(Math.min(200, Math.max(132, portrait ? 0.36 * W : 0.19 * H)));
  const btnY = top + logoH + (portrait ? 0.05 : 0.04) * H + btnD / 2;
  const below = btnY + btnD / 2;
  return { W, H, cell, left: (W - logoW) / 2, top, logoW, logoH, btnX: W / 2, btnY, btnD, houseY: Math.min(0.84, (below + H) / 2 / H) };
}

// ─── timing ─────────────────────────────────────────────────────────────────

/** Bricks drop in row by row from the bottom over this long (then settle). */
const ASSEMBLE = 1.05;
/** Height a brick drops from, in bricks. */
const DROP = 6;
/** The drop-in spring of DESIGN.md (stiffness 300, damping 17). */
const SPRING_W = Math.sqrt(300);
const SPRING_Z = 17 / (2 * SPRING_W);
const springAt = (t: number) => {
  if (t <= 0) return 0;
  const wd = SPRING_W * Math.sqrt(1 - SPRING_Z * SPRING_Z);
  return 1 - Math.exp(-SPRING_Z * SPRING_W * t) * (Math.cos(wd * t) + ((SPRING_Z * SPRING_W) / wd) * Math.sin(wd * t));
};
/** First moment the spring reaches its rest: the brick touches down (the click). */
const LAND = (() => {
  let t = 0;
  while (springAt(t) < 1 && t < 1) t += 0.002;
  return t;
})();
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** When each brick starts to fall, seconds after the logo began. */
const brickStart = (b: Brick, grid: LogoGrid) => ((grid.rows - 1 - b.y) / Math.max(1, grid.rows - 1)) * ASSEMBLE + hash(b.x * 7.3 + b.y) * 0.05;

/** The drop-in spring as a CSS easing (`linear()`), where the browser has it. */
function springEasing(): string | null {
  if (!CSS.supports('animation-timing-function', 'linear(0, 1)')) return null;
  const n = 40;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) pts.push(springAt((i / n) * 0.8).toFixed(3));
  pts[n] = '1';
  return `linear(${pts.join(', ')})`;
}

// ─── the loading screen ─────────────────────────────────────────────────────

export interface Loader {
  /** performance.now() when the CSS bricks began to drop (null before the font is in). */
  readonly t0: number | null;
  /** Takes the loading screen away (with a short fade). */
  remove(fade?: boolean): void;
}

/** The night sky with the logo assembling, shown at once while the game loads. */
export function startLoader(ui: HTMLElement): Loader {
  const el = document.createElement('div');
  el.className = 'title-load';
  ui.appendChild(el);
  let t0: number | null = null;
  let gone = false;
  let onResize: (() => void) | null = null;
  void logoGrid().then((grid) => {
    if (gone) return;
    const logo = document.createElement('div');
    logo.className = 'title-logo';
    const easing = springEasing();
    if (easing) logo.style.setProperty('--spring', easing);
    const html: string[] = [];
    for (const b of grid.bricks) {
      const style = `--x:${(b.px - 0.5).toFixed(3)};--y:${(b.py - 0.5).toFixed(3)};--c:${b.color};--d:${brickStart(b, grid).toFixed(3)}s;rotate:${b.rot.toFixed(3)}rad`;
      html.push(`<i${b.top ? ' class="t"' : ''} style="${style}"></i>`);
    }
    logo.innerHTML = html.join('');
    const place = () => {
      const L = layoutFor(grid, window.innerWidth, window.innerHeight);
      Object.assign(logo.style, { left: `${L.left}px`, top: `${L.top}px`, width: `${L.logoW}px`, height: `${L.logoH}px` });
      logo.style.setProperty('--cell', `${L.cell}px`);
    };
    place();
    onResize = place;
    window.addEventListener('resize', place);
    el.appendChild(logo);
    t0 = performance.now();
  });
  return {
    get t0() {
      return t0;
    },
    remove(fade = false) {
      if (gone) return;
      gone = true;
      if (onResize) window.removeEventListener('resize', onResize);
      if (!fade) {
        el.remove();
        return;
      }
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    },
  };
}

// ─── pieces ─────────────────────────────────────────────────────────────────

/** A round tile with rounded edges, its face towards +z, back at z=0. */
function roundTile(radius: number, height: number, bevel: number, segments = 48): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, bevel + Math.sin(a) * bevel));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, height - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(0, height));
  return new THREE.LatheGeometry(pts, segments).rotateX(Math.PI / 2);
}

/** The ▶ print: a triangle with rounded corners, pointing +x, flat in XY. */
function playPrint(): THREE.BufferGeometry {
  const P: [number, number][] = [
    [-0.27, 0.42],
    [-0.27, -0.42],
    [0.47, 0],
  ];
  const r = 0.09;
  const s = new THREE.Shape();
  const towards = (a: [number, number], b: [number, number]): [number, number] => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + ((b[0] - a[0]) / d) * r * 1.6, a[1] + ((b[1] - a[1]) / d) * r * 1.6];
  };
  P.forEach((p, i) => {
    const a = towards(p, P[(i + 2) % 3]);
    const b = towards(p, P[(i + 1) % 3]);
    if (i === 0) s.moveTo(a[0], a[1]);
    else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p[0], p[1], b[0], b[1]);
  });
  s.closePath();
  return new THREE.ShapeGeometry(s, 6);
}

/** A soft round glow for the warm windows. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─── easing ─────────────────────────────────────────────────────────────────
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bump = (a: number, b: number, x: number) => (x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a)));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const inOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Cool moonlight on the yard (as in the wake ritual). */
const MOON = new THREE.Color(0x6a86ff);

// ─── timeline after the press, seconds ──────────────────────────────────────
/** The simulated press of ?titleTap comes this long after the title starts. */
const TEST_TAP_AFTER = 2.0;
const DIVE: [number, number] = [0.2, 1.95];
const FADE: [number, number] = [1.55, 1.95];
const HANDOFF = 2.0;

/** Depth of the logo and the button in front of their own camera. */
const DEPTH = 60;
const tmpV = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const OVERLAY_FOV = 24;
const PLATE_R = 1.36;

/**
 * Plays the title until ▶ is pressed and the camera is through the window.
 * Resolves then; the caller starts the wake ritual (the warm fade clears by itself).
 */
export async function showTitle(ctx: Ctx, game: Game, loader: Loader | null): Promise<void> {
  const grid = await logoGrid();
  return new Promise((resolve) => {
    const { scene, camera, skin, params } = ctx;
    const house = ctx.house!;
    const O = house.origin;
    const at = (dx: number, dy: number, dz: number) => new THREE.Vector3(O.x + dx, O.y + dy, O.z + dz);
    const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined;
    const sun = scene.children.find((o) => (o as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;
    const disposables: { dispose(): void }[] = [];
    voice.preload(['title']);

    // ─── the house at night, seen from the yard ───
    house.door.setOpen(0);
    const fx = new THREE.Group();
    fx.name = 'title-fx';
    const glowTex = glowTexture();
    const paneGeo = new THREE.PlaneGeometry(0.86, 0.86);
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    const paneMat = new THREE.MeshBasicMaterial({ color: '#ffc46b', fog: false });
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffae4a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    disposables.push(glowTex, paneGeo, haloGeo, paneMat, haloMat);
    /** Glass blocks of the house walls: centre of the outer face and its outward normal. */
    const WINDOWS: [THREE.Vector3, THREE.Vector3][] = houseWindows().map((w) => [at(w.dx, w.dy, w.dz), new THREE.Vector3(...w.n)]);
    /** The two front windows the dive can go through: the outer ones, left and right of the door. */
    const front = WINDOWS.filter(([, n]) => n.z > 0.5).sort((a, b) => a[0].x - b[0].x);
    const DIVE_WINDOWS = [front[0], front[front.length - 1]];
    const halos: THREE.Mesh[] = [];
    for (const [p, n] of WINDOWS) {
      // a warm pane just inside the glass, and a soft halo just outside it
      const pane = new THREE.Mesh(paneGeo, paneMat);
      pane.position.copy(p).addScaledVector(n, -0.97);
      pane.lookAt(tmpV.copy(pane.position).add(n));
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(p).addScaledVector(n, 0.06);
      halo.lookAt(tmpV.copy(halo.position).add(n));
      halo.renderOrder = 2;
      halos.push(halo);
      fx.add(pane, halo);
    }
    fx.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      o.userData.toyNoShadow = true;
      o.userData.toyShadow = true;
    });
    scene.add(fx);

    // ─── the overlay: logo and ▶ in their own little scene ───
    const oScene = new THREE.Scene();
    oScene.environment = scene.environment;
    oScene.environmentIntensity = 0.45;
    // the world's sun comes from the upper left; at night a cool sky fills the shade
    const key = new THREE.DirectionalLight('#fff0d6', 2.5);
    key.position.set(-0.6, 0.8, 0.75);
    oScene.add(key, new THREE.HemisphereLight('#c8c6ff', '#3a3064', 1.15));
    const oCam = new THREE.PerspectiveCamera(OVERLAY_FOV, 1, 1, 300);

    const plastic = (c: string) => {
      const m = (skin.partMaterial(c) as THREE.MeshStandardMaterial).clone();
      disposables.push(m);
      return m;
    };

    // the logo: one instanced mesh of bricks with studs, coloured per brick
    const brickGeo = mergeGeometries([
      new RoundedBoxGeometry(0.94, 0.94, 0.94, 1, 0.12),
      // RoundedBoxGeometry has no index; the stud follows suit to merge
      new THREE.CylinderGeometry(0.28, 0.28, 0.2, 16).translate(0, 0.47 + 0.07, 0).toNonIndexed(),
    ])!;
    disposables.push(brickGeo);
    const N = grid.bricks.length;
    const bricks = new THREE.InstancedMesh(brickGeo, plastic('#ffffff'), N);
    bricks.frustumCulled = false;
    const col = new THREE.Color();
    grid.bricks.forEach((b, i) => bricks.setColorAt(i, col.set(b.color).multiplyScalar(0.94 + 0.08 * hash(i * 3.1))));
    const logo = new THREE.Group();
    logo.add(bricks);
    oScene.add(logo);
    const home = grid.bricks.map((b) => new THREE.Vector3(b.px - grid.cols / 2, grid.rows / 2 - b.py, 0));
    const lean = grid.bricks.map((b) => new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -b.rot));
    const starts = grid.bricks.map((b) => brickStart(b, grid));
    /** Row landing times for the clicks, bottom row first. */
    const rowLand = new Map<number, number>();
    grid.bricks.forEach((b, i) => rowLand.set(b.y, Math.min(rowLand.get(b.y) ?? Infinity, starts[i] + LAND)));
    const clicked = new Set<number>();

    // the ▶ piece: a teal studded plate, the mustard tile, the print
    const button = new THREE.Group();
    const press = new THREE.Group(); // the tile and its print sink together
    const PLATE_T = 0.2;
    const TILE_T = 0.42;
    const plateGeo = roundTile(PLATE_R, PLATE_T, 0.07);
    const tileGeo = roundTile(1, TILE_T, 0.13);
    const printGeo = playPrint();
    const shadowGeo = new THREE.CircleGeometry(1.02, 40);
    const studGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12).rotateX(Math.PI / 2);
    disposables.push(plateGeo, tileGeo, printGeo, shadowGeo, studGeo);
    const plate = new THREE.Mesh(plateGeo, plastic('#2f918b'));
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#0b1a2a', transparent: true, opacity: 0.32, depthWrite: false });
    disposables.push(shadowMat);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(0.09, -0.12, PLATE_T + 0.004);
    const tile = new THREE.Mesh(tileGeo, plastic('#eab02b'));
    tile.position.z = PLATE_T;
    const print = new THREE.Mesh(printGeo, plastic('#4a2c14'));
    print.position.set(0.04, 0, PLATE_T + TILE_T + 0.006);
    press.add(tile, print);
    const STUDS = 8;
    const studs = new THREE.InstancedMesh(studGeo, plastic('#ffffff'), STUDS);
    studs.frustumCulled = false;
    const m4 = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const s4 = new THREE.Vector3();
    const p4 = new THREE.Vector3();
    for (let i = 0; i < STUDS; i++) {
      const a = Math.PI / 2 - (i / STUDS) * Math.PI * 2;
      studs.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 1.19, Math.sin(a) * 1.19, PLATE_T + 0.05));
    }
    const STUD_OFF = new THREE.Color('#e9c46a');
    const STUD_ON = new THREE.Color('#fff6cf');
    button.add(plate, shadow, press, studs);
    button.rotation.x = -0.42;
    oScene.add(button);

    // ─── DOM: the ▶ hit target, the rest of the screen, the warm fade ───
    const ui = document.getElementById('ui')!;
    const layer = document.createElement('div');
    layer.className = 'title-layer';
    const play = document.createElement('button');
    play.className = 'title-play';
    play.type = 'button';
    play.setAttribute('aria-label', 'Грати');
    const fade = document.createElement('div');
    fade.className = 'title-fade';
    ui.append(layer, play, fade);

    // ─── state ───
    let T = 0;
    let tapT = -1;
    let downT = -10;
    let nudgeT = -10;
    let frames = 0;
    let done = false;
    /** The logo's own clock continues the CSS bricks (unless a test freezes the title). */
    const A0 = loader?.t0 != null && params.titleHold === null ? (performance.now() - loader.t0) / 1000 : 0;
    let L: Layout | null = null;
    const look = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const l0 = new THREE.Vector3();
    let win = WINDOWS[1][0];
    const fly = grid.bricks.map((_, i) => ({
      v: new THREE.Vector3(),
      spin: new THREE.Vector3(hash(i * 1.7) - 0.5, hash(i * 2.9) - 0.5, hash(i * 4.3) - 0.5).normalize(),
      rate: 5 + 6 * hash(i * 5.1),
      delay: 0,
    }));

    const relayout = (W: number, H: number) => {
      L = layoutFor(grid, W, H);
      oCam.aspect = W / H;
      oCam.updateProjectionMatrix();
      const wpp = (2 * DEPTH * Math.tan(THREE.MathUtils.degToRad(OVERLAY_FOV / 2))) / H;
      logo.position.set((L.left + L.logoW / 2 - W / 2) * wpp, (H / 2 - (L.top + L.logoH / 2)) * wpp, -DEPTH);
      logo.scale.setScalar(L.cell * wpp);
      logo.userData.y = logo.position.y;
      button.position.set((L.btnX - W / 2) * wpp, (H / 2 - L.btnY) * wpp, -DEPTH);
      button.userData.s = ((L.btnD / 2) * wpp) / PLATE_R;
      const hit = Math.max(120, L.btnD * 1.08);
      Object.assign(play.style, { left: `${L.btnX - hit / 2}px`, top: `${L.btnY - hit / 2}px`, width: `${hit}px`, height: `${hit}px` });
    };

    // ─── the world camera: a slow night drift in front of the house ───
    const SX = HOUSE.sizeX;
    const SZ = HOUSE.sizeZ;
    const DX = DOOR.dx;
    const FOCUS = at(DX, 2, SZ + 0.5);
    /** Side-to-side sway of the drift, radians around the house. */
    const SWAY = 0.16;
    const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    /** About 14 blocks (the house and its yard) across a part of the screen. */
    const viewDist = () => THREE.MathUtils.clamp((SX + 5) / ((camera.aspect < 1 ? 0.95 : 0.5) * 2 * tanHalf() * camera.aspect), 14, 48);
    const camAt = (a: number, e: number, dist: number, out: THREE.Vector3) =>
      out.set(FOCUS.x + Math.sin(a) * Math.cos(e) * dist, FOCUS.y + Math.sin(e) * dist, FOCUS.z + Math.cos(a) * Math.cos(e) * dist);
    /** A block (a tree, a hill) between this point of the house and the camera. */
    const blocked = (from: THREE.Vector3, to: THREE.Vector3) => {
      const dir = tmp2.subVectors(to, from);
      const len = dir.length();
      dir.divideScalar(len);
      const f = house.footprint;
      for (let s = 0.9; s < len; s += 0.45) {
        const x = from.x + dir.x * s;
        const y = from.y + dir.y * s;
        const z = from.z + dir.z * s;
        // the house and its roof are not in the way of themselves
        if (x >= f.x0 - 1 && x < f.x1 + 1 && z >= f.z0 - 1 && z < f.z1 + 1 && y < O.y + 9) continue;
        const id = ctx.world.getBlock(x, y, z);
        if (id !== B.AIR && id !== B.WATER) return 1;
      }
      return 0;
    };
    /** Looks from the side where trees and hills hide the least of the house (worlds differ). */
    const pickView = () => {
      const dist = viewDist();
      const targets = [at(DX, 2, SZ + 0.3), at(2.5, 2.5, SZ + 0.3), at(SX - 2.5, 2.5, SZ + 0.3), at(DX, 6.5, SZ / 2), at(DX, 1.6, SZ + 2.5), at(1, 4, SZ + 0.5), at(SX - 1, 4, SZ + 0.5), at(-4, 2, SZ + 3), at(SX + 4, 2, SZ + 3), at(DX, 2, SZ + 6)];
      let best = { a: 0, e: 0.45, score: Infinity };
      for (const e of [0.34, 0.42, 0.5]) {
        for (let a = -0.9; a <= 0.901; a += 0.15) {
          let hidden = 0;
          for (const da of [-SWAY, 0, SWAY]) {
            camAt(a + da, e, dist, tmp);
            for (const t of targets) hidden += blocked(t, tmp);
          }
          // low enough that the sky opens above the house for the logo
          const score = hidden + Math.abs(a) * 0.5 + (e - 0.34) * 12;
          if (score < best.score) best = { a, e, score };
        }
      }
      return best;
    };
    let view = { a: 0, e: 0.45, aspect: 0 };

    const drift = (t: number) => {
      if (view.aspect !== camera.aspect) view = { ...pickView(), aspect: camera.aspect };
      const a = view.a + SWAY * Math.sin(t * 0.09 + 0.6);
      const e = view.e + 0.025 * Math.sin(t * 0.13);
      const dist = viewDist();
      camAt(a, e, dist, camera.position);
      camera.lookAt(FOCUS);
      // tilt up so the house sits at houseY on the screen and the sky opens above it
      camera.rotateX(Math.atan((2 * L!.houseY - 1) * tanHalf()));
      camera.getWorldDirection(look).multiplyScalar(dist).add(camera.position);
    };

    /** In through the window nearest to where the camera stands. */
    const dive = (tau: number) => {
      const u = inOutCubic(clamp01((tau - DIVE[0]) / (DIVE[1] - DIVE[0])));
      const P1 = tmp.copy(p0).sub(win).normalize().multiplyScalar(1.6).add(p0);
      P1.y += 1.0;
      const P2 = new THREE.Vector3(win.x, win.y + 1.1, win.z + 6);
      const P3 = new THREE.Vector3(win.x, win.y, win.z + 0.3);
      const k = 1 - u;
      camera.position
        .copy(p0)
        .multiplyScalar(k * k * k)
        .addScaledVector(P1, 3 * k * k * u)
        .addScaledVector(P2, 3 * k * u * u)
        .addScaledVector(P3, u * u * u);
      look.lerpVectors(l0, win, ramp(0, 0.45, u));
      look.z -= 3 * ramp(0.7, 1, u);
      camera.lookAt(look);
    };

    const go = (real: boolean) => {
      if (tapT >= 0) return;
      tapT = T;
      if (real) {
        voice.unlock();
        sfx.unlock();
        void goFullscreen();
      }
      voice.say('title', { interrupt: true, priority: 9 });
      sfx.play('poof', { volume: 0.8, pitch: 1.2 });
      sfx.ambient('night');
      layer.remove();
      play.remove();
      p0.copy(camera.position);
      l0.copy(look);
      // the front window on the camera's side
      win = Math.abs(p0.x - DIVE_WINDOWS[0][0].x) < Math.abs(p0.x - DIVE_WINDOWS[1][0].x) ? DIVE_WINDOWS[0][0] : DIVE_WINDOWS[1][0];
      // the bricks fly from the button outwards, nearest first
      const bx = (button.position.x - logo.position.x) / logo.scale.x;
      const by = (button.position.y - logo.userData.y) / logo.scale.x;
      fly.forEach((f, i) => {
        const h = home[i];
        const dx = h.x - bx;
        const dy = h.y - by;
        const d = Math.hypot(dx, dy);
        f.delay = Math.min(0.32, d * 0.012);
        f.v.set((dx / d) * (6 + 8 * hash(i * 6.7)) + (h.x / grid.cols) * 10, 8 + 10 * hash(i * 8.3), 10 + 22 * hash(i * 9.1));
      });
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      voice.unlock();
      sfx.unlock();
      downT = T;
      sfx.play('click');
    };
    play.addEventListener('pointerdown', onDown);
    play.addEventListener('click', () => go(true));
    layer.addEventListener('pointerdown', (e) => {
      // a touch beside the button: it hops to show where to press
      e.preventDefault();
      voice.unlock();
      sfx.unlock();
      nudgeT = T;
      sfx.play('click', { pitch: 0.8 });
    });

    const finish = () => {
      done = true;
      fx.removeFromParent();
      for (const d of disposables) d.dispose();
      bricks.dispose();
      studs.dispose();
      fade.style.opacity = '1';
      // game.intro stays (inert, still night) until the wake ritual sets its own
      resolve();
      // the wake ritual draws its first frames under the warm light, then it clears
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          fade.classList.add('out');
          fade.style.opacity = '0';
          setTimeout(() => fade.remove(), 800);
        }),
      );
    };

    // ─── per frame ───
    const update = (dt: number) => {
      if (done) return;
      const hold = params.titleHold;
      // with ?titleTap the hold counts from the press, otherwise from the start
      const holdFrom = tapT >= 0 ? tapT : params.titleTap ? Infinity : 0;
      if (hold !== null) dt = Math.max(0, Math.min(dt, holdFrom + hold - T));
      T += dt;
      if (params.titleTap && tapT < 0 && T >= TEST_TAP_AFTER) go(false);
      // the loading bricks give way once the world has drawn a few frames
      if (++frames === 4) loader?.remove(true);
      const tau = tapT >= 0 ? T - tapT : -1;

      // the screen may change any time (fullscreen, turning the tablet)
      if (!L || L.W !== window.innerWidth || L.H !== window.innerHeight) relayout(window.innerWidth, window.innerHeight);
      if (tapT < 0) drift(T);
      else dive(tau);
      camera.updateMatrixWorld();

      // the lamp breathes inside, the windows with it
      const flick = 1 + 0.05 * Math.sin(T * 9.1) + 0.03 * Math.sin(T * 23.7);
      house.lamp.intensity = LAMP_NIGHT * flick;
      const near = tapT >= 0 ? ramp(DIVE[0] + 0.6, DIVE[1], tau) : 0;
      halos.forEach((h, i) => h.scale.setScalar(2.6 + 0.15 * Math.sin(T * 2.1 + i)));
      haloMat.opacity = (0.55 + 0.08 * Math.sin(T * 9.1)) * (1 + near);
      fade.style.opacity = tapT >= 0 ? String(ramp(FADE[0], FADE[1], tau)) : '0';

      // logo
      const A = A0 + T;
      logo.position.y = (logo.userData.y ?? 0) + logo.scale.x * 0.25 * Math.sin(T * 0.9) * ramp(1.2, 2.2, A);
      logo.rotation.set(0.38, 0.05 * Math.sin(T * 0.37), 0.012 * Math.sin(T * 0.53));
      for (let i = 0; i < N; i++) {
        const h = home[i];
        const f = fly[i];
        if (tapT >= 0 && tau > f.delay) {
          // pop, then fly with a spin and fall away, shrinking
          const age = tau - f.delay;
          p4.set(h.x + f.v.x * age, h.y + f.v.y * age - 16 * age * age, h.z + f.v.z * age);
          q4.setFromAxisAngle(f.spin, f.rate * age).multiply(lean[i]);
          const sc = (1 + 0.35 * bump(0, 0.16, age)) * (1 - ramp(0.25, 0.95, age));
          bricks.setMatrixAt(i, m4.compose(p4, q4, s4.setScalar(Math.max(0.0001, sc))));
          continue;
        }
        const t = A - starts[i];
        if (t <= 0) {
          bricks.setMatrixAt(i, m4.compose(p4.copy(h), q4.identity(), s4.setScalar(0.0001)));
          continue;
        }
        const s = springAt(t);
        const squash = Math.max(0, s - 1);
        const sy = 1 - 1.3 * squash;
        const sx = 1 + 0.6 * squash;
        p4.set(h.x, h.y + DROP * Math.max(0, 1 - s) - (1 - sy) * 0.47, h.z);
        const appear = clamp01(t / 0.06);
        bricks.setMatrixAt(i, m4.compose(p4, lean[i], s4.set(sx * appear, sy * appear, sx * appear)));
      }
      bricks.instanceMatrix.needsUpdate = true;
      // a soft plastic click as each row lands (only once sound is allowed)
      if (navigator.userActivation?.hasBeenActive && tapT < 0) {
        for (const [row, landAt] of rowLand) {
          if (!clicked.has(row) && A >= landAt) {
            clicked.add(row);
            if (A - landAt < 0.1) sfx.play('place', { volume: 0.25, pitch: 1.5 + 0.02 * (grid.rows - row) });
          }
        }
      }

      // ▶: breathing, a running light around the plate, the press, then a pop
      const bs = (button.userData.s as number | undefined) ?? 1;
      const show = ramp(1.0, 1.5, A);
      const breathe = 1 + 0.035 * Math.sin(T * Math.PI * 2 * 0.55);
      const nudge = 0.12 * bump(nudgeT, nudgeT + 0.35, T);
      const pop = tapT >= 0 ? (1 + 0.18 * bump(0.08, 0.3, tau)) * (1 - ramp(0.2, 0.5, tau)) : 1;
      button.scale.setScalar(Math.max(0.0001, bs * show * (breathe + nudge) * pop));
      button.rotation.z = 0.06 * bump(nudgeT, nudgeT + 0.35, T) * Math.sin((T - nudgeT) * 30);
      // the press: sink one stud into the plate, back on a spring
      const sinceDown = T - downT;
      const sink = sinceDown < 0.1 ? sinceDown / 0.1 : Math.max(0, 1 - springAt((sinceDown - 0.1) * 1.2));
      press.position.z = -0.16 * (tapT >= 0 && tau < 0.1 ? 1 : sink);
      const lit = Math.floor(T / 0.16) % STUDS;
      for (let i = 0; i < STUDS; i++) {
        const k = ((i - lit + STUDS) % STUDS) / STUDS;
        studs.setColorAt(i, col.copy(STUD_OFF).lerp(STUD_ON, k < 0.01 ? 1 : Math.max(0, 1 - k * 4) * 0.5));
      }
      if (studs.instanceColor) studs.instanceColor.needsUpdate = true;

      if (tapT >= 0 && tau >= HANDOFF) finish();
    };

    const intro: Intro = {
      update,
      daylight: 0,
      light() {
        // the same deep night as the wake ritual: moonlit yard, warm lamp inside
        if (hemi) hemi.intensity *= 0.2;
        scene.environmentIntensity *= 0.35;
        if (sun) {
          sun.intensity *= 4;
          sun.color.lerp(MOON, 1);
        }
      },
      overlay(r) {
        if (done || !L) return;
        const auto = r.autoClear;
        r.autoClear = false;
        r.clearDepth();
        r.render(oScene, oCam);
        r.autoClear = auto;
      },
      get info() {
        return { title: true, t: +T.toFixed(2), tau: tapT >= 0 ? +(T - tapT).toFixed(2) : null, bricks: N };
      },
    };
    game.intro = intro;
  });
}
