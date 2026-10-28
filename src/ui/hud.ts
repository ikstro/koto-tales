import type { HeroId } from '../contracts';
import { HERO_ORDER } from '../content/heroes';
import { readParams } from '../core/params';
import { goFullscreen } from './fullscreen';
import type { Input } from '../core/input';
import { sfx } from '../voice/sfx';
import { BUILD_PALETTE } from '../world/blocks';
import { NINE, SPRITES, type SpriteName } from './hudSprites';
import type { Portraits } from './portraits';

/**
 * The HUD is made of toy pieces from the world (DESIGN.md): pre-rendered sprites
 * (tools/hud, `npm run hud`) placed by their foot, each over its own soft shadow.
 * Runtime cost: images + CSS transforms; the DOM is written only when a value changes.
 *
 * Coordinates inside a group are "design px" where one stud = 40 px and a 2×2 round
 * tile = 80 px = 1u. Groups are scaled by k = u / 80, with u = clamp(44, 8.5vmin, 76) px.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

const SPRITE_URL = `${import.meta.env.BASE_URL}hud/`;
const STUD = 40;
/** A plate's top sits this far above its foot on screen. */
export const TOP = 0.4 * Math.sin((34 * Math.PI) / 180) * STUD;
const SINK = 7;
/** ?freeze=1 is the still-frame switch for screenshots: pieces appear at rest, no drop-in. */
const STILL = readParams().freeze;

// ─── springs (damped, kinetics-like): one linear() easing per spring, built once ───

interface Curve {
  easing: string;
  duration: number;
}
const LINEAR_OK = typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)');

function springAt(stiff: number, damp: number, t: number): number {
  if (t <= 0) return 0;
  const w = Math.sqrt(stiff);
  const z = damp / (2 * w);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** 'to': 0 → 1 with overshoot. 'pulse': 0 → 1 → 0 (a bump), normalised to a peak of 1. */
function spring(stiff: number, damp: number, kind: 'to' | 'pulse' = 'to'): Curve {
  const lag = 0.07;
  const T = 6 / (damp / 2) + (kind === 'pulse' ? lag : 0);
  const N = 48;
  const f = (t: number) => (kind === 'to' ? springAt(stiff, damp, t) : springAt(stiff, damp, t) - springAt(stiff, damp, t - lag));
  const vals: number[] = [];
  for (let i = 0; i <= N; i++) vals.push(f((T * i) / N));
  if (kind === 'pulse') {
    const peak = Math.max(...vals);
    for (let i = 0; i < vals.length; i++) vals[i] /= peak;
    vals[N] = 0;
  } else vals[N] = 1;
  const easing = LINEAR_OK ? `linear(${vals.map((v) => +v.toFixed(4)).join(', ')})` : kind === 'to' ? 'cubic-bezier(.34,1.5,.6,1)' : 'ease-out';
  return { easing, duration: Math.round(T * 1000) };
}

const SP = {
  drop: spring(300, 17),
  press: spring(360, 13),
  bump: spring(420, 9, 'pulse'),
  roll: spring(300, 16),
  lift: spring(240, 14),
  ready: spring(380, 10),
};

/** The click on landing: a small squash that decays (scale about the piece's foot). */
const SQUASH: Keyframe[] = Array.from({ length: 13 }, (_, i) => {
  const x = (i / 12) * 0.32;
  const sq = Math.max(0, Math.exp(-14 * x) * Math.sin(40 * x)) * 1.2;
  return { transform: `scale(${(1 + sq * 0.06).toFixed(4)}, ${(1 - sq * 0.08).toFixed(4)})` };
});

// ─── pieces ───────────────────────────────────────────────────────────────────

const div = (cls: string, parent?: HTMLElement): HTMLDivElement => {
  const e = document.createElement('div');
  e.className = cls;
  parent?.appendChild(e);
  return e;
};

/** Visible rect of a sprite relative to its foot. */
function rectOf(name: SpriteName): [number, number, number, number] {
  const s = SPRITES[name];
  const x0 = -s.w / 2 + s.x;
  const y0 = -s.h / 2 - s.oy * STUD + s.y;
  return [x0, y0, x0 + s.cw, y0 + s.ch];
}

function setSprite(i: HTMLImageElement, name: SpriteName): void {
  if (i.dataset.n === name) return;
  i.dataset.n = name;
  const [x0, y0, x1, y1] = rectOf(name);
  i.src = `${SPRITE_URL}${name}.png`;
  i.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
}

function sprite(name: SpriteName, cls = 'sp'): HTMLImageElement {
  const i = document.createElement('img');
  i.className = cls;
  i.alt = '';
  i.draggable = false;
  i.decoding = 'async';
  setSprite(i, name);
  return i;
}

/**
 * One toy piece placed by its foot: shadow + body. Layers:
 * .pc (foot) › .sh shadow, .bd (drop-in) › .lf (lift, bump, pop) › .pr (press, squash) › images.
 */
export class Piece {
  readonly el = div('pc');
  readonly sh: HTMLImageElement | null;
  readonly bd = div('bd', this.el);
  readonly lf = div('lf', this.bd);
  readonly pr = div('pr', this.lf);
  readonly img: HTMLImageElement;
  hit: HTMLButtonElement | null = null;

  constructor(
    parent: HTMLElement,
    name: SpriteName,
    readonly x: number,
    readonly y: number,
    shadow: SpriteName | null = `${name}-sh` as SpriteName,
  ) {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.sh = shadow && shadow in SPRITES ? sprite(shadow, 'sp sh') : null;
    if (this.sh) this.el.insertBefore(this.sh, this.bd);
    this.img = sprite(name);
    this.pr.appendChild(this.img);
    parent.appendChild(this.el);
  }

  layer(name: SpriteName, cls = 'sp'): HTMLImageElement {
    const i = sprite(name, cls);
    this.pr.appendChild(i);
    return i;
  }

  /** A touch target (design px), centred `dy` above the foot. */
  target(w: number, h = w, dy = 10): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'hit';
    b.type = 'button';
    b.style.cssText = `left:${-w / 2}px;top:${-h / 2 - dy}px;width:${w}px;height:${h}px`;
    this.el.appendChild(b);
    this.hit = b;
    return b;
  }

  bounds(): [number, number, number, number] {
    const r = rectOf(this.img.dataset.n as SpriteName);
    if (this.sh) {
      const s = rectOf(this.sh.dataset.n as SpriteName);
      r[0] = Math.min(r[0], s[0]);
      r[1] = Math.min(r[1], s[1]);
      r[2] = Math.max(r[2], s[2]);
      r[3] = Math.max(r[3], s[3]);
    }
    return [r[0] + this.x, r[1] + this.y, r[2] + this.x, r[3] + this.y];
  }

  /** Falls onto its place with a spring; a small squash on contact = the click. */
  drop(delay: number, h = 60): void {
    if (STILL) return;
    const o = { duration: SP.drop.duration, easing: SP.drop.easing, delay, fill: 'backwards' as const };
    this.bd.animate([{ transform: `translateY(${-h}px) scale(1.12)` }, { transform: 'none' }], o);
    this.bd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, delay, fill: 'backwards' });
    this.sh?.animate(
      [
        { transform: `translate(${h * 0.75}px, ${h * 0.45}px) scale(1.15)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      o,
    );
    this.pr.animate(SQUASH, { duration: 320, delay: delay + 120 });
  }

  bump(peak = 'translateY(-16px) scale(1.12) rotate(-12deg)'): void {
    this.lf.animate([{ transform: 'none' }, { transform: peak }], { duration: SP.bump.duration, easing: SP.bump.easing });
  }
}

/** A set of pieces scaled together; its box is the union of what is drawn. */
class Group {
  readonly el: HTMLDivElement;
  readonly inner: HTMLDivElement;
  readonly pieces: Piece[] = [];
  minX = 0;
  minY = 0;
  w = 0;
  h = 0;
  x = 0;
  y = 0;
  s = 1;

  constructor(parent: HTMLElement, cls: string) {
    this.el = div(`grp ${cls}`, parent);
    this.inner = div('gin', this.el);
  }

  add(name: SpriteName, x: number, y: number, shadow?: SpriteName | null): Piece {
    const p = new Piece(this.inner, name, x, y, shadow);
    this.pieces.push(p);
    return p;
  }

  /** Measure the drawn box and shift the content so it starts at 0,0. */
  seal(): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of this.pieces) {
      const [a, b, c, d] = p.bounds();
      x0 = Math.min(x0, a);
      y0 = Math.min(y0, b);
      x1 = Math.max(x1, c);
      y1 = Math.max(y1, d);
    }
    this.minX = x0;
    this.minY = y0;
    this.w = x1 - x0;
    this.h = y1 - y0;
    this.inner.style.transform = `translate(${-x0}px, ${-y0}px)`;
  }

  place(x: number, y: number, s: number): void {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.s = s;
    this.el.style.transform = `translate(${this.x}px, ${this.y}px) scale(${s.toFixed(4)})`;
  }

  /** Screen position of a point given in this group's design px. */
  toScreen(fx: number, fy: number): [number, number] {
    return [this.x + (fx - this.minX) * this.s, this.y + (fy - this.minY) * this.s];
  }

  get right(): number {
    return this.x + this.w * this.s;
  }

  get bottom(): number {
    return this.y + this.h * this.s;
  }
}

/** Printed digits on a number tile: they roll when the value changes. */
class Counter {
  private win: HTMLDivElement;
  private cur: HTMLSpanElement;
  private old: HTMLSpanElement;
  private rollOld: Animation | null = null;
  value = -1;

  constructor(tile: Piece) {
    this.win = div('numwin', tile.pr);
    this.win.style.cssText = `left:-36px;top:${-31}px`;
    this.cur = document.createElement('span');
    this.old = document.createElement('span');
    this.old.style.transform = 'translateY(-52px)';
    this.win.append(this.old, this.cur);
  }

  set(n: number, roll: boolean): void {
    if (n === this.value) return;
    const prev = this.value;
    this.value = n;
    const digits = String(n).length;
    this.win.dataset.d = String(Math.min(digits, 4));
    this.cur.textContent = String(n);
    if (!roll || prev < 0) return;
    this.old.textContent = String(prev);
    this.rollOld?.cancel();
    const o = { duration: SP.roll.duration, easing: SP.roll.easing };
    this.rollOld = this.old.animate([{ transform: 'none' }, { transform: 'translateY(-52px)' }], { ...o, fill: 'forwards' });
    this.cur.animate([{ transform: 'translateY(52px)' }, { transform: 'none' }], o);
  }
}

/** A studded teal plate of any size: the baked 3×3 plate cut on its stud-cell lines. */
export function ninePlate(parent: HTMLElement, w: number, h: number): HTMLDivElement {
  const n = NINE.plate9;
  const k = 1 / 1.5; // the plate is baked at 1.5×
  const shadow = div('nine-sh', parent);
  const p = div('nine', parent);
  const bw = `${n.top * k}px ${n.right * k}px ${n.bottom * k}px ${n.left * k}px`;
  p.style.cssText = `width:${w}px;height:${h}px;border-width:${bw};border-image:url(${SPRITE_URL}plate9.png) ${n.top} ${n.right} ${n.bottom} ${n.left} fill / ${bw} round`;
  shadow.style.cssText = `width:${w - 12}px;height:${h - 14}px`;
  return p;
}

const LEVELS: Difficulty[] = ['easy', 'normal', 'hard'];

export class Hud {
  readonly root = div('hud hidden');
  /** The breathing book by the chest; systems/house.ts toggles `hidden` on it. */
  readonly chestPrompt: HTMLElement;
  onPickBlock: ((id: number) => void) | null = null;
  onPause: ((paused: boolean) => void) | null = null;
  onDifficulty: ((level: Difficulty) => void) | null = null;
  onSound: ((on: boolean) => void) | null = null;
  onExit: (() => void) | null = null;

  private gHearts: Group;
  private gCoins: Group;
  private gKills: Group;
  private gTop: Group;
  private gAct: Group;
  private gTray: Group;
  private gMenu: Group;

  private hearts: { tile: Piece; lost: boolean; anim: Animation | null }[] = [];
  private coinPiece: Piece;
  private coinCount: Counter;
  private zombiePiece: Piece;
  private killCount: Counter;
  private heroPiece: Piece;
  private fan: HTMLDivElement;
  private fanTiles = new Map<HeroId, Piece>();
  private fullPiece: Piece;
  private ring: Piece;
  private lit: HTMLImageElement[] = [];
  private bolt: Piece;
  private boltFull: HTMLImageElement;
  private boltGlow: HTMLDivElement;
  private brick: Piece;
  private trayBricks = new Map<number, Piece>();
  private soundPiece: Piece;
  private diffPieces = new Map<Difficulty, Piece>();
  private joyBase: HTMLDivElement;
  private joyIn: HTMLDivElement;
  private joyPieces: Piece[] = [];
  private zone: HTMLDivElement;
  private catcher: HTMLDivElement;
  private menu: HTMLDivElement;
  private flyLayer: HTMLDivElement;
  private flyPool: HTMLImageElement[] = [];
  private flashEl: HTMLDivElement;
  private faderEl: HTMLDivElement;

  private lastHearts = -1;
  private coinTarget = -1;
  private inFlight = 0;
  private lastLit = -1;
  private lastClip = -1;
  private boltLevel = -1;
  private player: HeroId | null = null;
  private difficulty: Difficulty = 'normal';
  private soundOn = true;
  private paused = false;
  private fanOpen = false;
  private trayOpen = false;
  private shown = false;
  private firstShow = true;
  private k = 1;
  private ts = 0.8;

  constructor(
    parent: HTMLElement,
    private input: Input,
    _portraits: Portraits,
  ) {
    setSpringVars();
    const r = this.root;

    // Joystick: the zone listens; the base is placed in screen px (Input moves it under the finger).
    this.zone = div('joy-zone', r);
    this.joyBase = div('joy-base', r);
    this.joyIn = div('joy-in', this.joyBase);
    const plate = new Piece(this.joyIn, 'joy-plate', 0, 0);
    const knobHolder = div('joy-knob');
    const knob = new Piece(knobHolder, 'joy-knob', 0, 0);
    plate.pr.appendChild(knobHolder);
    knobHolder.style.top = `${-TOP}px`;
    this.joyPieces.push(plate, knob);
    input.attachJoystick(this.zone, this.joyBase, knobHolder);

    // Top left: hearts on their plate; coins and Зомбік counters on their own plates.
    this.gHearts = new Group(r, 'g-hearts');
    this.gHearts.add('plate-hearts', 0, 0);
    this.gHearts.seal();

    this.gCoins = new Group(r, 'g-coins');
    this.gCoins.add('plate-coin', 0, 0);
    this.coinPiece = this.gCoins.add('coin', -40, -TOP);
    this.coinCount = new Counter(this.gCoins.add('numtile', 40, -TOP));
    this.gCoins.seal();

    this.gKills = new Group(r, 'g-kills');
    this.gKills.add('plate-coin', 0, 0);
    this.zombiePiece = this.gKills.add('zombie', -40, -TOP, 'tile-sh');
    this.killCount = new Counter(this.gKills.add('numtile', 40, -TOP));
    this.gKills.seal();

    // Top right: album book, then a plate with the hero, fullscreen and pause tiles.
    this.gTop = new Group(r, 'g-top');
    const album = this.gTop.add('album', -212, 4);
    this.gTop.add('plate-top', 0, 0);
    this.heroPiece = this.gTop.add('hero-lyosha', -93, -TOP, 'tile-sh');
    this.fullPiece = this.gTop.add('full-in', 0, -TOP, 'tile-sh');
    const pause = this.gTop.add('pause', 93, -TOP, 'tile-sh');
    this.gTop.seal();
    this.press(album, album.target(96, 110, 22), () => input.press('album'), { ui: true });
    this.press(this.heroPiece, this.heroPiece.target(94), () => this.toggleFan(), { ui: true });
    this.press(this.fullPiece, this.fullPiece.target(94), () => this.toggleFullscreen(), { ui: true });
    this.press(pause, pause.target(94), () => this.setPaused(true), { ui: true });
    if (!document.fullscreenEnabled) this.fullPiece.el.style.display = 'none';
    document.addEventListener('fullscreenchange', () => setSprite(this.fullPiece.img, document.fullscreenElement ? 'full-out' : 'full-in'));

    // The hero fan: three tiles under the plate, opened by the hero piece.
    this.fan = div('fan hidden', this.gTop.inner);
    HERO_ORDER.forEach((id, i) => {
      const p = new Piece(this.fan, `hero-${id}` as SpriteName, -93 + (i - 1) * 100, 118, 'tile-sh');
      p.layer('rim', 'sp rim');
      this.press(p, p.target(96), () => {
        input.pendingHero = id;
        this.toggleFan(false);
      });
      this.fanTiles.set(id, p);
    });

    // Bottom right: lightning (stud ring + tile), bow, building brick, pickaxe.
    this.gAct = new Group(r, 'g-act');
    this.ring = this.gAct.add('ring', -112, -238);
    for (let i = 0; i < 8; i++) this.lit.push(this.ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.bolt = this.gAct.add('bolt-empty', -112, -238 - TOP, 'tile6-sh');
    this.boltFull = this.bolt.layer('bolt');
    this.boltGlow = div('glow');
    this.bolt.lf.insertBefore(this.boltGlow, this.bolt.pr);
    const bow = this.gAct.add('bow', -80, -74, 'big-sh');
    const hints = (['red', 'yellow', 'green'] as const).map((c, i) =>
      this.gAct.add(`brick1-${c}` as SpriteName, -296 + i * 30, -204 - [0, 18, 20][i], 'brick1-sh'),
    );
    this.brick = this.gAct.add(`brick-${BUILD_PALETTE[4]}` as SpriteName, -252, -166, 'brick-sh');
    const pick = this.gAct.add('pick', -236, -60, 'tile6-sh');
    this.gAct.seal();
    this.press(
      bow,
      bow.target(124, 118, 14),
      () => {
        input.fireHeld = true;
        input.press('fire');
      },
      { up: () => (input.fireHeld = false) },
    );
    this.press(this.bolt, this.bolt.target(104), () => input.press('bolt'));
    this.press(this.brick, this.brick.target(100, 84, 26), () => input.press('place'));
    this.press(pick, pick.target(100), () => input.press('break'));
    const hintHit = hints[1].target(96, 64, 30);
    this.press(hints[1], hintHit, () => this.toggleTray(), { ui: true, also: [hints[0], hints[2]] });

    // Taps outside an open fan / tray close it.
    this.catcher = div('catcher hidden', r);
    this.catcher.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleFan(false);
      this.toggleTray(false);
    });

    // The palette tray: a studded plate with every building colour as a real 2×2 brick.
    this.gTray = new Group(r, 'g-tray hidden');
    const cols = 4;
    const rows = Math.ceil(BUILD_PALETTE.length / cols);
    const cell = 92;
    const tw = cols * cell + 64;
    const th = rows * cell + 56;
    const trayPlate = ninePlate(this.gTray.inner, tw, th);
    trayPlate.style.left = `${-tw / 2}px`;
    trayPlate.style.top = `${-th / 2}px`;
    (trayPlate.previousElementSibling as HTMLElement).style.cssText += `;left:${-tw / 2 + 14}px;top:${-th / 2 + 18}px`;
    BUILD_PALETTE.forEach((id, i) => {
      const cx = -tw / 2 + 32 + cell * ((i % cols) + 0.5);
      const cy = -th / 2 + 34 + cell * (Math.floor(i / cols) + 0.5) + 26;
      const holder = div('tb', this.gTray.inner);
      holder.style.cssText = `left:${cx}px;top:${cy}px`;
      const p = new Piece(holder, `brick-${id}` as SpriteName, 0, 0, 'brick-sh');
      this.press(p, p.target(cell, cell, 34), () => this.pickBlock(id), { ui: true });
      this.trayBricks.set(id, p);
    });
    this.gTray.pieces.push(...this.trayBricks.values());
    this.gTray.minX = -tw / 2;
    this.gTray.minY = -th / 2;
    this.gTray.w = tw + 16;
    this.gTray.h = th + 20;
    this.gTray.inner.style.transform = `translate(${tw / 2}px, ${th / 2}px)`;

    // The pause menu: picture pieces on a plate. ▶ continue, sound, home; difficulty below.
    this.menu = div('pmenu hidden', r);
    this.menu.addEventListener('pointerdown', (e) => {
      if (e.target === this.menu) this.setPaused(false);
    });
    this.gMenu = new Group(this.menu, 'g-menu');
    const mw = 470;
    const mh = 330;
    const mp = ninePlate(this.gMenu.inner, mw, mh);
    (mp.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';
    const play = new Piece(this.gMenu.inner, 'play', 112, 118, 'big-sh');
    this.soundPiece = new Piece(this.gMenu.inner, 'sound-on', 250, 112, 'tile6-sh');
    const home = new Piece(this.gMenu.inner, 'home', 368, 112, 'tile6-sh');
    this.press(play, play.target(124), () => this.setPaused(false), { ui: true, paused: true });
    this.press(this.soundPiece, this.soundPiece.target(104), () => this.toggleSound(), { ui: true, paused: true });
    this.press(home, home.target(104), () => this.exit(), { ui: true, paused: true });
    LEVELS.forEach((lvl, i) => {
      const p = new Piece(this.gMenu.inner, `diff-${i + 1}` as SpriteName, 120 + i * 116, 250, 'tile6-sh');
      p.layer('rim6', 'sp rim');
      this.press(p, p.target(108), () => this.pickDifficulty(lvl), { ui: true, paused: true });
      this.diffPieces.set(lvl, p);
    });
    this.gMenu.w = mw + 16;
    this.gMenu.h = mh + 20;

    // The chest prompt: the album book breathing by the chest.
    this.chestPrompt = div('chest-prompt hidden', r);
    const chestIn = div('chest-in', this.chestPrompt);
    new Piece(chestIn, 'album', 0, 0);
    this.chestPrompt.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.paused) input.press('album');
    });

    this.flyLayer = div('fly', r);
    parent.appendChild(r);

    // Flash and fade live outside the HUD: they work even when it is hidden.
    this.flashEl = div('hud-flash', parent);
    this.faderEl = div('fader', parent);

    this.setDifficulty('normal');
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  // ─── layout: sizes come from the screen, not from a fixed design canvas ───

  private layout(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const u = Math.min(76, Math.max(44, 0.085 * Math.min(W, H)));
    const k = u / 80;
    const g = Math.round(Math.max(8, u * 0.2));
    const gap = Math.round(u * 0.16);
    this.k = k;
    const root = document.documentElement.style;
    root.setProperty('--hud-u', `${u.toFixed(1)}px`);
    root.setProperty('--hud-k', k.toFixed(4));

    let ts = 0.8 * k;
    const { gHearts: GH, gCoins: GC, gKills: GK, gTop: GT, gAct: GA } = this;
    let topBottom: number;
    if (W >= H) {
      // Landscape: hearts with the two counters under them on the left, the tiles on the right.
      const room = W - 2 * g - gap;
      const need = Math.max(GH.w, GC.w + GK.w) + GT.w;
      ts = Math.min(ts, room / need);
      GH.place(g, g, ts);
      GC.place(g, GH.bottom + gap * 0.3, ts);
      GK.place(GC.right + gap, GC.y, ts);
      GT.place(W - g - GT.w * ts, g, ts);
      topBottom = Math.max(GC.bottom, GK.bottom, GT.bottom);
    } else {
      // Portrait phone: one top row; if the pieces would get too small, the counters wrap under the hearts.
      const one = (W - 2 * g - 3 * gap) / (GH.w + GC.w + GK.w + GT.w);
      if (one * 80 >= 38) {
        ts = Math.min(ts, one);
        GH.place(g, g, ts);
        GC.place(GH.right + gap, g, ts);
        GK.place(GC.right + gap, g, ts);
        GT.place(W - g - GT.w * ts, g, ts);
        topBottom = Math.max(GH.bottom, GC.bottom, GK.bottom, GT.bottom);
      } else {
        ts = Math.min(ts, (W - 2 * g - gap) / (GH.w + GT.w));
        GH.place(g, g, ts);
        GT.place(W - g - GT.w * ts, g, ts);
        const y2 = Math.max(GH.bottom, GT.bottom) + gap * 0.3;
        GC.place(g, y2, ts);
        GK.place(GC.right + gap, y2, ts);
        topBottom = Math.max(GC.bottom, GK.bottom);
      }
    }
    this.ts = ts;

    // Bottom: joystick plate left, action pieces right; shrink both if they would meet.
    const joyW = 212;
    const kb = Math.min(k, (W - 2 * g - gap) / (joyW + GA.w), (H - topBottom - g - gap) / GA.h);
    GA.place(W - g - GA.w * kb, H - g - GA.h * kb, kb);
    root.setProperty('--hud-joy-x', `${Math.round(g + 104 * kb)}px`);
    root.setProperty('--hud-joy-y', `${Math.round(H - g - 96 * kb)}px`);
    root.setProperty('--hud-kb', kb.toFixed(4));
    this.zone.style.top = `${Math.round(topBottom)}px`;

    if (this.trayOpen) this.placeTray();
    this.placeMenu();
  }

  private placeTray(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const g = 8;
    const T = this.gTray;
    const s = Math.min(this.gAct.s * 1.05, (W - 2 * g) / T.w, (H - 2 * g) / T.h);
    const [bx, by] = this.gAct.toScreen(-200, -260);
    const x = Math.min(W - g - T.w * s, Math.max(g, bx - T.w * s));
    const y = Math.min(H - g - T.h * s, Math.max(g, by - T.h * s));
    T.place(x, y, s);
  }

  private placeMenu(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const M = this.gMenu;
    const s = Math.min(this.k * 1.15, (W - 24) / M.w, (H - 24) / M.h);
    M.place((W - M.w * s) / 2, (H - M.h * s) / 2, s);
  }

  // ─── input ───

  /**
   * Touch-down fires at once (kids tap fast); the piece sinks one stud and springs back.
   * Gameplay presses are ignored while paused; `ui` presses click.
   */
  private press(
    p: Piece,
    hit: HTMLElement,
    onDown: () => void,
    o: { up?: () => void; ui?: boolean; paused?: boolean; also?: Piece[] } = {},
  ): void {
    const all = [p, ...(o.also ?? [])];
    let t0 = 0;
    let held = false;
    hit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.paused !== !!o.paused) return;
      try {
        hit.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events have no capture */
      }
      held = true;
      t0 = performance.now();
      for (const q of all) q.el.classList.add('down');
      if (o.ui) sfx.play('click');
      onDown();
    });
    const up = () => {
      if (!held) return;
      held = false;
      const wait = Math.max(0, 110 - (performance.now() - t0));
      setTimeout(() => {
        for (const q of all) q.el.classList.remove('down');
      }, wait);
      o.up?.();
    };
    hit.addEventListener('pointerup', up);
    hit.addEventListener('pointercancel', up);
  }

  private toggleFan(on = !this.fanOpen): void {
    if (on === this.fanOpen) return;
    this.fanOpen = on;
    if (on) this.toggleTray(false);
    this.fan.classList.toggle('hidden', !on);
    this.gTop.el.classList.toggle('raised', on);
    this.catcher.classList.toggle('hidden', !this.fanOpen && !this.trayOpen);
    if (on) {
      let i = 0;
      for (const p of this.fanTiles.values()) p.drop(i++ * 50, 40);
    }
  }

  private toggleTray(on = !this.trayOpen): void {
    if (on === this.trayOpen) return;
    this.trayOpen = on;
    if (on) this.toggleFan(false);
    this.gTray.el.classList.toggle('hidden', !on);
    this.catcher.classList.toggle('hidden', !this.fanOpen && !this.trayOpen);
    if (on) {
      this.placeTray();
      let i = 0;
      for (const p of this.trayBricks.values()) p.drop(i++ * 28, 40);
    }
  }

  private pickBlock(id: number): void {
    this.setBuildBlock(id);
    this.onPickBlock?.(id);
    this.toggleTray(false);
    this.brick.drop(0, 40);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void goFullscreen();
  }

  private setPaused(on: boolean): void {
    if (on === this.paused) return;
    this.paused = on;
    this.toggleFan(false);
    this.toggleTray(false);
    this.menu.classList.toggle('hidden', !on);
    if (on) {
      this.input.fireHeld = false;
      this.placeMenu();
      let i = 0;
      for (const p of this.menuPieces()) p.drop(i++ * 40, 40);
    }
    this.onPause?.(on);
  }

  private *menuPieces(): Iterable<Piece> {
    yield this.soundPiece;
    yield* this.diffPieces.values();
  }

  private toggleSound(): void {
    this.setSoundOn(!this.soundOn);
    this.onSound?.(this.soundOn);
  }

  private pickDifficulty(level: Difficulty): void {
    if (level === this.difficulty) return;
    this.setDifficulty(level);
    this.onDifficulty?.(level);
  }

  private exit(): void {
    this.paused = false;
    this.menu.classList.add('hidden');
    this.onExit?.();
  }

  // ─── public API ───

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (on && !this.shown) this.dropIn();
    this.shown = on;
    if (on && this.firstShow) {
      this.firstShow = false;
      // Test-only switches for screenshots.
      const q = readParams();
      if (q.album) setTimeout(() => this.input.press('album'), 300);
      if (q.palette) setTimeout(() => this.toggleTray(true), 300);
      if (q.pause) setTimeout(() => this.setPaused(true), 300);
    }
  }

  /** Pieces snap into the corners: top left, top right, bottom left, bottom right. */
  private dropIn(): void {
    const at = (g: Group, t0: number, step = 60) => g.pieces.forEach((p, i) => p.drop(t0 + i * step, i === 0 ? 60 : 50));
    at(this.gHearts, 120);
    this.hearts.forEach((h, i) => h.tile.drop(260 + i * 60, 50));
    at(this.gCoins, 220, 90);
    at(this.gKills, 300, 90);
    at(this.gTop, 320, 70);
    this.joyPieces.forEach((p, i) => p.drop(500 + i * 160, 60));
    at(this.gAct, 620, 50);
  }

  setHearts(n: number, max: number): void {
    if (n === this.lastHearts && this.hearts.length === max) return;
    const first = this.lastHearts < 0 || this.hearts.length !== max;
    if (this.hearts.length !== max) {
      for (const h of this.hearts) h.tile.el.parentElement?.remove();
      this.hearts = [];
      for (let i = 0; i < max; i++) {
        const x = (i - (max - 1) / 2) * 62;
        const slot = div('slot', this.gHearts.inner);
        new Piece(slot, 'heart-empty', x, -TOP, null);
        const tile = new Piece(slot, 'heart', x, -TOP);
        this.hearts.push({ tile, lost: false, anim: null });
        if (this.shown) tile.drop(260 + i * 60, 50);
      }
    }
    this.lastHearts = n;
    this.hearts.forEach((h, i) => {
      const lost = i >= n;
      if (lost === h.lost && !first) return;
      h.lost = lost;
      h.anim?.cancel();
      h.anim = null;
      if (lost) {
        if (first) h.tile.el.style.visibility = 'hidden';
        else {
          h.anim = h.tile.el.animate(
            [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-34px) scale(0.6) rotate(18deg)', opacity: 0 }],
            { duration: 320, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' },
          );
        }
      } else {
        h.tile.el.style.visibility = '';
        if (!first) h.tile.drop(0, 50);
      }
    });
  }

  setCoins(n: number): void {
    if (n === this.coinTarget) return;
    if (n < this.coinTarget) this.inFlight = 0;
    this.coinTarget = n;
    this.showCoins(false);
  }

  private showCoins(landed: boolean): void {
    const v = Math.max(0, this.coinTarget - this.inFlight);
    const grew = v > this.coinCount.value && this.coinCount.value >= 0;
    this.coinCount.set(v, grew);
    if (grew && landed) this.coinPiece.bump();
  }

  /** The signature moment: a coin flies from where it was picked into the counter, then it ticks. */
  flyCoin(sx: number, sy: number): void {
    if (!this.shown || this.root.classList.contains('hidden')) return;
    let img = this.flyPool.find((i) => !i.dataset.busy);
    if (!img) {
      if (this.flyPool.length >= 12) return;
      img = sprite('coin', 'sp flyc');
      const [x0, y0] = rectOf('coin');
      img.style.transformOrigin = `${-x0}px ${-y0}px`;
      this.flyPool.push(img);
      this.flyLayer.appendChild(img);
    }
    img.dataset.busy = '1';
    this.inFlight++;
    const [ex, ey] = this.gCoins.toScreen(this.coinPiece.x, this.coinPiece.y);
    const s0 = this.ts;
    const up = 70 * this.k;
    const arc = 150 * this.k;
    const frames: Keyframe[] = [];
    const T1 = 0.26;
    const T = 0.8;
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * T;
      let x: number;
      let y: number;
      let s: number;
      if (t < T1) {
        const q = t / T1;
        x = sx;
        y = sy - up * Math.sin(q * Math.PI * 0.9);
        s = s0 * (0.6 + 0.4 * springAt(300, 12, t));
      } else {
        const q = (t - T1) / (T - T1);
        const kq = q * q * 0.85 + (1 - (1 - q) ** 3) * 0.15;
        const y0 = sy - up * Math.sin(Math.PI * 0.9);
        x = sx + (ex - sx) * kq;
        y = y0 + (ey - y0) * kq - Math.sin(kq * Math.PI) * arc;
        s = s0 * (1 + 0.15 * Math.sin(q * Math.PI));
      }
      frames.push({ offset: i / N, transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(-t * 300).toFixed(0)}deg) scale(${s.toFixed(3)})` });
    }
    const a = img.animate(frames, { duration: T * 1000, easing: 'linear' });
    img.style.opacity = '1';
    const done = () => {
      img.style.opacity = '0';
      delete img.dataset.busy;
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.showCoins(true);
    };
    a.onfinish = done;
    a.oncancel = done;
  }

  setKills(n: number): void {
    if (n === this.killCount.value) return;
    const grew = n > this.killCount.value && this.killCount.value >= 0;
    this.killCount.set(n, grew);
    if (grew) this.zombiePiece.bump('translateY(-14px) scale(1.12) rotate(10deg)');
  }

  /** 1 = just used, 0 = ready. Studs light one by one; the tile pops when full. */
  setBoltCooldown(frac: number): void {
    const level = 1 - Math.min(1, Math.max(0, frac));
    const lit = Math.floor(level * 8 + 1e-6);
    if (lit !== this.lastLit) {
      this.lit.forEach((l, i) => {
        const on = i < lit;
        l.style.visibility = on ? '' : 'hidden';
        if (on && this.lastLit >= 0 && i >= this.lastLit && level < 1)
          l.animate([{ transform: 'translateY(-6px)' }, { transform: 'none' }], { duration: SP.press.duration, easing: SP.press.easing });
      });
      this.lastLit = lit;
    }
    const clip = Math.round(level * 24);
    if (clip !== this.lastClip) {
      this.lastClip = clip;
      this.boltFull.style.clipPath = clip >= 24 ? '' : `inset(${(((24 - clip) / 24) * 100).toFixed(1)}% 0 0 0)`;
    }
    if (level >= 1 && this.boltLevel >= 0 && this.boltLevel < 1) {
      const o = { duration: SP.ready.duration, easing: SP.ready.easing };
      this.bolt.lf.animate([{ transform: 'scale(1.14)' }, { transform: 'none' }], o);
      this.boltGlow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
      for (const l of this.lit) l.animate([{ transform: 'translateY(-6px)' }, { transform: 'none' }], o);
    }
    this.boltLevel = level;
  }

  setPlayer(id: HeroId): void {
    if (id === this.player) return;
    const first = this.player === null;
    this.player = id;
    setSprite(this.heroPiece.img, `hero-${id}` as SpriteName);
    for (const [hid, p] of this.fanTiles) p.el.classList.toggle('on', hid === id);
    if (!first) this.heroPiece.drop(0, 36);
  }

  setBuildBlock(id: number): void {
    const name = `brick-${id}` as SpriteName;
    if (name in SPRITES) setSprite(this.brick.img, name);
    for (const [bid, p] of this.trayBricks) p.el.classList.toggle('on', bid === id);
  }

  setDifficulty(level: Difficulty): void {
    this.difficulty = level;
    for (const [l, p] of this.diffPieces) p.el.classList.toggle('on', l === level);
  }

  setSoundOn(on: boolean): void {
    this.soundOn = on;
    setSprite(this.soundPiece.img, on ? 'sound-on' : 'sound-off');
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Kept for compatibility: finds are announced by voice only (owner's choice). */
  toast(_img: string, _text: string): void {}

  flash(strength = 0.7): void {
    this.flashEl.animate([{ opacity: strength }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  }

  fade(on: boolean): Promise<void> {
    this.faderEl.classList.toggle('on', on);
    return new Promise((res) => setTimeout(res, 950));
  }
}

/** Press / lift springs are CSS transitions; their easings go into custom properties once. */
let springVarsSet = false;
function setSpringVars(): void {
  if (springVarsSet) return;
  springVarsSet = true;
  const s = document.documentElement.style;
  s.setProperty('--sp-press', SP.press.easing);
  s.setProperty('--sp-press-d', `${SP.press.duration}ms`);
  s.setProperty('--sp-lift', SP.lift.easing);
  s.setProperty('--sp-lift-d', `${SP.lift.duration}ms`);
  s.setProperty('--hud-sink', `${SINK}px`);
}
