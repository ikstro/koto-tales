import { CHUNK_SIZE } from '../contracts';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { chunkKey, chunkOf, exploredOf, squareAround, type Explored } from '../systems/explore';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { Piece, TOP, ninePlate, type Hud } from './hud';
import { SPRITES, type SpriteName } from './hudSprites';
import { TileCache } from './mapTiles';

/**
 * The map (DESIGN.md «Map»). A small round map printed on a studded plate in the
 * HUD — north up, the hero in the middle — and a big map on a plate that opens on
 * a tap and pauses the game. Only explored chunks are drawn; the rest of the
 * world sits under cream cloud puffs. Marks are small toy pieces: the hero's
 * face, the helpers, monsters, the house — and any mark another system sets with
 * `setMapMarker` (a boss, a quest place). A mark with `pointer` sits on the
 * plate's rim with a coral arrow when it is off the minimap, showing the way.
 *
 * Cost: 2D canvases only. The minimap is redrawn 5 times a second; tiles are
 * built once per chunk from world data (ui/mapTiles.ts) and kept in memory.
 */

// ─── marks set by other systems ──────────────────────────────────────────────

export interface MapMarker {
  /** Followed live (a Vector3 that moves with its owner is fine). */
  pos: { x: number; z: number };
  /** A HUD sprite name (tools/hud), e.g. 'map-house', 'boss'. */
  icon: string;
  /** Off the minimap it sits on the rim with an arrow pointing the way. */
  pointer: boolean;
  /** Big map (and minimap): a dashed danger ring of this radius in blocks, drawn over the clouds. */
  zoneRadius?: number;
}

const marks = new Map<string, MapMarker>();

/** Adds, moves or (with null) removes a mark on both maps. */
export function setMapMarker(id: string, m: MapMarker | null): void {
  if (m) marks.set(id, m);
  else marks.delete(id);
}

// ─── geometry ────────────────────────────────────────────────────────────────

const STUD = 40;
const CS = CHUNK_SIZE;
/** The plate is seen at the HUD's tilt: circles on it are ellipses this much shorter. */
const COS = Math.cos((34 * Math.PI) / 180);
/** Radius of the printed map on the minimap plate (design px) and how many blocks it shows. */
const MINI_R = 1.36 * STUD;
const MINI_BLOCKS = 24;
/** Where a pointer mark and its arrow sit on the rim (design px from the centre). */
const RIM_ICON = 1.02 * STUD;
const RIM_ARROW = 2.12 * STUD;
const HAZE = '#e6dcc2';
const BIG_PAD = 34;
const SPRITE_URL = `${import.meta.env.BASE_URL}hud/`;

const sprite = (name: string): SpriteName => (name in SPRITES ? name : 'boss') as SpriteName;
/** Hero marks share one contact shadow per size. */
const shadowOf = (name: string): SpriteName | null => {
  const s = name.startsWith('mark-') && name !== 'mark-monster' ? 'mark-sh' : name.startsWith('dot-') ? 'dot-sh' : `-sh`;
  return s in SPRITES ? (s as SpriteName) : null;
};
const img = (name: string) => {
  const i = new Image();
  i.src = `${SPRITE_URL}${name}.png`;
  return i;
};

function hash(a: number, b: number): number {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A piece that moves: a holder positioned by transform, the piece at its foot. */
class Mark {
  readonly el = document.createElement('div');
  piece: Piece;
  private last = '';
  private name: string;

  constructor(parent: HTMLElement, name: string, readonly scale = 1) {
    this.el.className = 'mk';
    this.name = sprite(name);
    this.piece = new Piece(this.el, this.name as SpriteName, 0, 0, shadowOf(this.name));
    parent.appendChild(this.el);
  }

  setIcon(name: string): void {
    const n = sprite(name);
    if (n === this.name) return;
    this.name = n;
    this.piece.el.remove();
    this.piece = new Piece(this.el, n as SpriteName, 0, 0, shadowOf(n));
  }

  at(x: number, y: number, extra = ''): void {
    const t = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${this.scale})${extra}`;
    if (t !== this.last) {
      this.last = t;
      this.el.style.transform = t;
      this.el.style.zIndex = String(Math.round(y + 500));
    }
    this.show(true);
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }
}

/** A pointer mark: its icon plus the coral arrow on the plate edge. */
interface PointerMarks {
  icon: Mark;
  arrow: Mark;
}

export class GameMap {
  onPause: ((paused: boolean) => void) | null = null;

  private ctx: Ctx | null = null;
  private explored: Explored | null = null;
  private tiles: TileCache | null = null;
  private cloud = img('cloud');
  private cloudSh = img('cloud-sh');

  // minimap
  private mini: HTMLCanvasElement;
  private miniLayer: HTMLDivElement;
  private miniTimer = 0;
  private miniPlayer: Mark | null = null;
  private miniHeroes = new Map<string, Mark>();
  private miniMonsters: Mark[] = [];
  private miniMarks = new Map<string, PointerMarks>();

  // big map
  private root = document.createElement('div');
  private big: HTMLCanvasElement | null = null;
  private bigLayer: HTMLDivElement | null = null;
  private bigMarks: Mark[] = [];
  private view = { cx: 0, cz: 0, ppb: 4, vw: 0, vh: 0, s: 1, pd: 1, bounds: [0, 0, 0, 0] as [number, number, number, number] };
  private raf = 0;

  constructor(
    parent: HTMLElement,
    private hud: Hud,
  ) {
    // The minimap is printed on the HUD's plate: an ellipse on the tilted top.
    const L = hud.mapLayer;
    this.mini = document.createElement('canvas');
    this.mini.className = 'mm-map';
    this.mini.style.cssText = `left:${-MINI_R}px;top:${-TOP - MINI_R * COS}px;width:${2 * MINI_R}px;height:${2 * MINI_R * COS}px`;
    L.appendChild(this.mini);
    this.miniLayer = document.createElement('div');
    this.miniLayer.className = 'mm-marks';
    L.appendChild(this.miniLayer);
    hud.onMapTap = () => this.open();

    this.root.className = 'bigmap hidden';
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** The game has begun: the house mark, block-change listeners and the test switches. */
  start(ctx: Ctx): void {
    this.ctx = ctx;
    this.explored = exploredOf(ctx.save);
    this.tiles = new TileCache(ctx.world);
    const tiles = this.tiles;
    events.on('block:placed', ({ x, z }) => tiles.invalidate(x, z));
    events.on('block:broken', ({ x, z }) => tiles.invalidate(x, z));
    events.on('ground:changed', ({ x, z }) => tiles.invalidate(x, z));
    if (ctx.house) setMapMarker('home', { pos: ctx.house.centre, icon: 'map-house', pointer: true });

    const p = ctx.params;
    if (p.seen !== null && ctx.house) {
      // Test only: a known area around the house and a trail to where the party starts.
      const hx = chunkOf(ctx.house.centre.x);
      const hz = chunkOf(ctx.house.centre.z);
      const r = p.seen;
      const keys: string[] = [];
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + 1) keys.push(chunkKey(hx + dx, hz + dz));
      const tx = chunkOf(ctx.player.pos.x);
      const tz = chunkOf(ctx.player.pos.z);
      const n = Math.max(Math.abs(tx - hx), Math.abs(tz - hz));
      for (let i = 0; i <= n; i++) keys.push(...squareAround(Math.round(hx + ((tx - hx) * i) / Math.max(1, n)), Math.round(hz + ((tz - hz) * i) / Math.max(1, n)), 1));
      this.explored.add(keys);
    }
    if (p.map) setTimeout(() => this.open(), 700);
    // For automated checks: marks can be set from the page (`__kotoMap.setMapMarker(...)`).
    (window as unknown as { __kotoMap: object }).__kotoMap = { setMapMarker, open: () => this.open() };
  }

  /** Every frame while playing: exploring is a cheap chunk check; the minimap redraws at 5 Hz. */
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.explored) return;
    this.explored.visit(ctx.player.pos.x, ctx.player.pos.z);
    this.miniTimer -= dt;
    if (this.miniTimer > 0) return;
    this.miniTimer = 0.2;
    if (this.hud.root.classList.contains('hidden')) return;
    this.drawMini();
  }

  // ─── clouds and zones (shared by both maps) ───

  /** Cream puffs over one unexplored chunk whose box is (x, y, w, h) on the canvas; squash = vertical foreshortening. */
  private puff(g: CanvasRenderingContext2D, cx: number, cz: number, x: number, y: number, w: number, h: number, shadow: boolean): void {
    const c = this.cloud;
    if (!c.complete || !c.naturalWidth) return;
    const meta = SPRITES.cloud;
    const r = hash(cx, cz);
    const n = w > 40 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const q = hash(r + i * 7, i);
      const size = w * (i === 0 ? 1.55 : 1.05) * (0.9 + (q % 20) / 100);
      const pw = size;
      const ph = (size * meta.ch) / meta.cw;
      const ox = x + w * (0.5 + (((q >> 5) % 40) - 20) / 100 + (i ? (q % 2 ? 0.3 : -0.3) : 0));
      const oy = y + h * (0.5 + (((q >> 11) % 40) - 20) / 100 + (i ? 0.25 : 0));
      if (shadow) {
        const s = this.cloudSh;
        if (s.complete && s.naturalWidth) g.drawImage(s, ox - pw * 0.5 + pw * 0.08, oy - ph * 0.5 + ph * 0.18, pw * 1.12, ph * 1.05);
      } else g.drawImage(c, ox - pw / 2, oy - ph / 2, pw, ph);
    }
  }

  private zone(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, width: number): void {
    g.save();
    g.lineWidth = width * 1.8;
    g.strokeStyle = 'rgba(255, 227, 163, 0.85)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([width * 3, width * 2.2]);
    g.lineWidth = width;
    g.strokeStyle = '#e0583f';
    g.stroke();
    g.restore();
  }

  // ─── minimap ───

  private drawMini(): void {
    const ctx = this.ctx!;
    const ex = this.explored!;
    const tiles = this.tiles!;
    const s = this.hud.mapScale;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pd = s * dpr;
    const W = Math.round(2 * MINI_R * pd);
    const H = Math.round(2 * MINI_R * COS * pd);
    const cv = this.mini;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(pd, 0, 0, pd, 0, 0);
    g.clearRect(0, 0, 2 * MINI_R, 2 * MINI_R * COS);
    g.save();
    g.beginPath();
    g.ellipse(MINI_R, MINI_R * COS, MINI_R, MINI_R * COS, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = HAZE;
    g.fillRect(0, 0, 2 * MINI_R, 2 * MINI_R * COS);

    const p = ctx.player.pos;
    const bpp = MINI_R / MINI_BLOCKS;
    const ox = MINI_R;
    const oy = MINI_R * COS;
    const cx0 = chunkOf(p.x - MINI_BLOCKS - 2);
    const cx1 = chunkOf(p.x + MINI_BLOCKS + 2);
    const cz0 = chunkOf(p.z - MINI_BLOCKS - 2);
    const cz1 = chunkOf(p.z + MINI_BLOCKS + 2);
    const deadline = performance.now() + 4;
    const fog: [number, number, number, number, number, number][] = [];
    g.imageSmoothingEnabled = true;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const x = ox + (cx * CS - p.x) * bpp;
        const y = oy + (cz * CS - p.z) * bpp * COS;
        const w = CS * bpp;
        const h = CS * bpp * COS;
        if (!ex.has(cx, cz)) {
          fog.push([cx, cz, x, y, w, h]);
          continue;
        }
        const t = tiles.get(cx, cz, performance.now() < deadline);
        if (t) g.drawImage(t, x, y, w + 0.3, h + 0.3);
      }
    }
    for (const f of fog) this.puff(g, f[0], f[1], f[2], f[3], f[4], f[5], true);
    for (const f of fog) this.puff(g, f[0], f[1], f[2], f[3], f[4], f[5], false);
    for (const m of marks.values()) {
      if (m.zoneRadius) this.zone(g, ox + (m.pos.x - p.x) * bpp, oy + (m.pos.z - p.z) * bpp * COS, m.zoneRadius * bpp, m.zoneRadius * bpp * COS, 2);
    }
    // the print sits a little below the plate's rim: a soft inner shadow from the upper left
    g.shadowColor = 'rgba(30, 20, 8, 0.55)';
    g.shadowBlur = 4 * pd;
    g.shadowOffsetX = 1.5 * pd;
    g.shadowOffsetY = 2 * pd;
    g.lineWidth = 8;
    g.strokeStyle = '#2a6466';
    g.beginPath();
    g.ellipse(MINI_R, MINI_R * COS, MINI_R + 4, MINI_R * COS + 4, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    this.placeMiniMarks(bpp);
  }

  private placeMiniMarks(bpp: number): void {
    const ctx = this.ctx!;
    const L = this.miniLayer;
    const p = ctx.player.pos;
    const cy = -TOP;
    /** Design px on the plate for a world point, and whether it is inside the printed map. */
    const onPlate = (wx: number, wz: number, margin: number): [number, number, boolean] => {
      const dx = (wx - p.x) * bpp;
      const dz = (wz - p.z) * bpp;
      return [dx, cy + dz * COS, Math.hypot(dx, dz) <= MINI_R - margin];
    };

    // helpers and monsters first, the hero on top
    for (const [id, hero] of ctx.heroes) {
      let m = this.miniHeroes.get(id);
      if (hero === ctx.player) {
        m?.show(false);
        continue;
      }
      if (!m) this.miniHeroes.set(id, (m = new Mark(L, `dot-${id}`, 0.55)));
      const [x, y, inside] = onPlate(hero.pos.x, hero.pos.z, 6);
      if (inside) m.at(x, y);
      else m.show(false);
    }
    let i = 0;
    for (const mon of ctx.monsters) {
      if (!mon.alive) continue;
      const [x, y, inside] = onPlate(mon.pos.x, mon.pos.z, 5);
      if (!inside) continue;
      if (i >= 12) break;
      const m = this.miniMonsters[i] ?? (this.miniMonsters[i] = new Mark(L, 'mark-monster', 0.46));
      m.at(x, y);
      i++;
    }
    for (; i < this.miniMonsters.length; i++) this.miniMonsters[i].show(false);

    // marks from the registry (the house, a boss…): on the map, or on the rim pointing the way
    for (const [id, pm] of this.miniMarks) {
      if (!marks.has(id)) {
        pm.icon.el.remove();
        pm.arrow.el.remove();
        this.miniMarks.delete(id);
      }
    }
    for (const [id, mk] of marks) {
      let pm = this.miniMarks.get(id);
      if (!pm) this.miniMarks.set(id, (pm = { icon: new Mark(L, mk.icon, 0.5), arrow: new Mark(L, 'map-arrow', 0.9) }));
      pm.icon.setIcon(mk.icon);
      const [x, y, inside] = onPlate(mk.pos.x, mk.pos.z, 4);
      if (inside) {
        pm.icon.at(x, y);
        pm.arrow.show(false);
      } else if (mk.pointer) {
        const a = Math.atan2(mk.pos.z - p.z, mk.pos.x - p.x);
        pm.icon.at(Math.cos(a) * RIM_ICON, cy + Math.sin(a) * RIM_ICON * COS);
        // the arrow lies flat on the plate edge: turned towards the target, then tilted with the plate
        const turn = (a * 180) / Math.PI + 90;
        pm.arrow.at(Math.cos(a) * RIM_ARROW, cy + Math.sin(a) * RIM_ARROW * COS, ` scale(1, ${COS.toFixed(3)}) rotate(${turn.toFixed(1)}deg)`);
        pm.arrow.el.style.zIndex = '1900';
      } else {
        pm.icon.show(false);
        pm.arrow.show(false);
      }
    }

    if (!this.miniPlayer) this.miniPlayer = new Mark(L, `mark-${ctx.player.id}`, 0.5);
    this.miniPlayer.setIcon(`mark-${ctx.player.id}`);
    this.miniPlayer.at(0, cy + 2);
    this.miniPlayer.el.style.zIndex = '2000';
  }

  // ─── big map ───

  open(): void {
    const ctx = this.ctx;
    if (!ctx || !this.explored || this.isOpen || this.hud.isPaused || !ctx.playing || ctx.sleeping) return;
    this.onPause?.(true);
    ctx.input.fireHeld = false;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const s = Math.min(1, Math.max(0.5, this.hud.pieceScale));
    const pw = Math.min(1500, (W - 24) / s - 16);
    const ph = Math.min(1100, (H - 24) / s - 20);
    const panel = document.createElement('div');
    panel.className = 'bm-panel';
    panel.style.transform = `translate(${Math.round((W - (pw + 16) * s) / 2)}px, ${Math.round((H - (ph + 20) * s) / 2)}px) scale(${s.toFixed(4)})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    const vw = pw - 2 * BIG_PAD;
    const vh = ph - 2 * BIG_PAD;
    const viewEl = document.createElement('div');
    viewEl.className = 'bm-view';
    viewEl.style.cssText = `left:${BIG_PAD}px;top:${BIG_PAD - 6}px;width:${vw}px;height:${vh}px`;
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pd = s * dpr;
    cv.width = Math.round(vw * pd);
    cv.height = Math.round(vh * pd);
    cv.style.cssText = `width:${vw}px;height:${vh}px`;
    viewEl.appendChild(cv);
    const layer = document.createElement('div');
    layer.className = 'bm-marks';
    viewEl.appendChild(layer);
    panel.appendChild(viewEl);

    const close = new Piece(panel, 'close', pw - 24, 34, 'tile6-sh');
    close.target(104).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close.el.classList.add('down');
      this.close();
    });

    // Fit everything explored (and the hero) into the plate; past a readable size, drag to look around.
    const p = ctx.player.pos;
    const b = this.explored.bounds() ?? [chunkOf(p.x), chunkOf(p.z), chunkOf(p.x), chunkOf(p.z)];
    const bx0 = Math.min(b[0] * CS, p.x - CS) - CS * 0.5;
    const bz0 = Math.min(b[1] * CS, p.z - CS) - CS * 0.5;
    const bx1 = Math.max((b[2] + 1) * CS, p.x + CS) + CS * 0.5;
    const bz1 = Math.max((b[3] + 1) * CS, p.z + CS) + CS * 0.5;
    const fit = Math.min(vw / (bx1 - bx0), vh / (bz1 - bz0));
    const ppb = Math.max(1.8, Math.min(5, fit));
    const fits = fit >= 1.8;
    this.view = { cx: fits ? (bx0 + bx1) / 2 : p.x, cz: fits ? (bz0 + bz1) / 2 : p.z, ppb, vw, vh, s, pd, bounds: [bx0, bz0, bx1, bz1] };
    this.clampView();

    this.big = cv;
    this.bigLayer = layer;
    this.bigMarks = [];
    this.dragOn(viewEl);
    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    this.drawBig();
    close.drop(120, 40);
    sfx.play('sticker');

    const said = ctx.save.said;
    if (!said.includes('map_open')) {
      said.push('map_open');
      voice.say('map_open' as string, { priority: 6, interrupt: true });
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.big = null;
    this.bigLayer = null;
    this.bigMarks = [];
    sfx.play('click');
    this.onPause?.(false);
    this.miniTimer = 0;
  }

  private clampView(): void {
    const v = this.view;
    const [x0, z0, x1, z1] = v.bounds;
    const hw = v.vw / 2 / v.ppb;
    const hh = v.vh / 2 / v.ppb;
    v.cx = x1 - x0 <= 2 * hw ? (x0 + x1) / 2 : Math.min(x1 - hw, Math.max(x0 + hw, v.cx));
    v.cz = z1 - z0 <= 2 * hh ? (z0 + z1) / 2 : Math.min(z1 - hh, Math.max(z0 + hh, v.cz));
  }

  private dragOn(el: HTMLElement): void {
    let id = -1;
    let sx = 0;
    let sy = 0;
    let moved = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      moved = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      sx = e.clientX;
      sy = e.clientY;
      const v = this.view;
      v.cx -= dx / v.s / v.ppb;
      v.cz -= dy / v.s / v.ppb;
      this.clampView();
      this.schedule();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) id = -1;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.drawBig());
  }

  /** Draws the big map; tiles not built yet are built a few per frame, then it draws again. */
  private drawBig(): void {
    this.raf = 0;
    const cv = this.big;
    const ctx = this.ctx;
    if (!cv || !ctx) return;
    const ex = this.explored!;
    const tiles = this.tiles!;
    const v = this.view;
    const g = cv.getContext('2d')!;
    g.setTransform(v.pd, 0, 0, v.pd, 0, 0);
    g.fillStyle = HAZE;
    g.fillRect(0, 0, v.vw, v.vh);
    const left = v.cx - v.vw / 2 / v.ppb;
    const top = v.cz - v.vh / 2 / v.ppb;
    const cx0 = chunkOf(left) - 1;
    const cz0 = chunkOf(top) - 1;
    const cx1 = chunkOf(left + v.vw / v.ppb) + 1;
    const cz1 = chunkOf(top + v.vh / v.ppb) + 1;
    const w = CS * v.ppb;
    const deadline = performance.now() + 10;
    let pending = 0;
    const fog: [number, number, number, number][] = [];
    g.imageSmoothingEnabled = v.ppb * v.pd < 3;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const x = (cx * CS - left) * v.ppb;
        const y = (cz * CS - top) * v.ppb;
        if (!ex.has(cx, cz)) {
          fog.push([cx, cz, x, y]);
          continue;
        }
        const t = tiles.get(cx, cz, performance.now() < deadline);
        if (t) g.drawImage(t, Math.floor(x * v.pd) / v.pd, Math.floor(y * v.pd) / v.pd, Math.ceil(w * v.pd + 1) / v.pd, Math.ceil(w * v.pd + 1) / v.pd);
        else pending++;
      }
    }
    g.imageSmoothingEnabled = true;
    for (const f of fog) this.puff(g, f[0], f[1], f[2], f[3], w, w, true);
    for (const f of fog) this.puff(g, f[0], f[1], f[2], f[3], w, w, false);
    for (const m of marks.values()) {
      if (m.zoneRadius) this.zone(g, (m.pos.x - left) * v.ppb, (m.pos.z - top) * v.ppb, m.zoneRadius * v.ppb, m.zoneRadius * v.ppb, 4);
    }
    this.placeBigMarks(left, top);
    if (pending) this.schedule();
  }

  private placeBigMarks(left: number, top: number): void {
    const ctx = this.ctx!;
    const L = this.bigLayer!;
    const v = this.view;
    let i = 0;
    const next = (name: string, scale = 1): Mark => {
      let m = this.bigMarks[i];
      if (!m) this.bigMarks.push((m = new Mark(L, name, scale)));
      m.setIcon(name);
      m.piece.el.classList.remove('on');
      i++;
      return m;
    };
    const inset = 26;
    const place = (wx: number, wz: number, name: string, pointer: boolean, lift = false) => {
      let x = (wx - left) * v.ppb;
      let y = (wz - top) * v.ppb;
      const inside = x >= inset && x <= v.vw - inset && y >= inset && y <= v.vh - inset;
      if (!inside && !pointer) return;
      const m = next(name);
      m.piece.el.classList.toggle('on', lift);
      if (inside) {
        m.at(x, y + 10);
        if (lift) m.el.style.zIndex = '2500';
        return;
      }
      // off the plate: on its edge, with the arrow pointing the way
      const cx = v.vw / 2;
      const cy = v.vh / 2;
      const dx = x - cx;
      const dy = y - cy;
      const k = Math.min((cx - inset * 1.6) / Math.abs(dx || 1e-6), (cy - inset * 1.6) / Math.abs(dy || 1e-6));
      x = cx + dx * k;
      y = cy + dy * k;
      m.at(x, y + 10);
      const a = Math.atan2(dy, dx);
      next('map-arrow').at(x + Math.cos(a) * 46, y + Math.sin(a) * 46, ` rotate(${((a * 180) / Math.PI + 90).toFixed(1)}deg)`);
    };
    for (const mon of ctx.monsters) if (mon.alive) place(mon.pos.x, mon.pos.z, 'mark-monster', false);
    for (const mk of marks.values()) place(mk.pos.x, mk.pos.z, mk.icon, mk.pointer);
    for (const hero of ctx.heroes.values()) if (hero !== ctx.player) place(hero.pos.x, hero.pos.z, `mark-${hero.id}`, false);
    place(ctx.player.pos.x, ctx.player.pos.z, `mark-${ctx.player.id}`, true, true);
    for (let j = i; j < this.bigMarks.length; j++) this.bigMarks[j].show(false);
  }
}
