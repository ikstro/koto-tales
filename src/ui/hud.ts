import type { HeroId } from '../contracts';
import { HERO_ORDER } from '../content/heroes';
import { readParams } from '../core/params';
import { goFullscreen } from './fullscreen';
import type { Input } from '../core/input';
import { sfx } from '../voice/sfx';
import { Guide, type GuideCard } from './guide';
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
export function ninePlate(parent: HTMLElement, w: number, h: number, name: keyof typeof NINE = 'plate9'): HTMLDivElement {
  const n = NINE[name];
  const k = 1 / 1.5; // the plate is baked at 1.5×
  const shadow = div('nine-sh', parent);
  const p = div('nine', parent);
  const bw = `${n.top * k}px ${n.right * k}px ${n.bottom * k}px ${n.left * k}px`;
  p.style.cssText = `width:${w}px;height:${h}px;border-width:${bw};border-image:url(${SPRITE_URL}${name}.png) ${n.top} ${n.right} ${n.bottom} ${n.left} fill / ${bw} round`;
  shadow.style.cssText = `width:${w - 12}px;height:${h - 14}px`;
  return p;
}

const LEVELS: Difficulty[] = ['easy', 'normal', 'hard'];
/** Stone studs on the boss bar = its health in tenths. */
const BOSS_STONES = 10;

/** What the boss bar shows: health 0..1, whether the stone armour holds, lanterns lit (0–3). */
export interface BossBar {
  hp: number;
  armored: boolean;
  lanterns: number;
}

/** A building in the kit plate: its piece and how many are left (null: never runs out). */
export interface KitItem {
  id: string;
  sprite: string;
  count: number | null;
}

/** A piece that breathes by the action pieces when something can be done here. */
export type PromptKind = 'moon' | 'fold' | 'chest';

export class Hud {
  readonly root = div('hud hidden');
  /** The breathing book by the chest; systems/house.ts toggles `hidden` on it. */
  readonly chestPrompt: HTMLElement;
  /** A building chosen in the kit plate. */
  onKitPick: ((id: string) => void) | null = null;
  /** The kit plate opened / the next reward's task piece was tapped. */
  onKitOpen: (() => void) | null = null;
  onKitTask: (() => void) | null = null;
  onPause: ((paused: boolean) => void) | null = null;
  /** The screen has gone dark (sleep, travel): a moment nobody sees a frame stall. */
  onDark: (() => void) | null = null;
  onDifficulty: ((level: Difficulty) => void) | null = null;
  onSound: ((on: boolean) => void) | null = null;
  onExit: (() => void) | null = null;
  /** «Почати знову»: `held` once the piece was held until its ring filled; false for a short tap (say how). */
  onRestart: ((held: boolean) => void) | null = null;
  /** A tap on the minimap plate (ui/map.ts opens the big map). */
  onMapTap: (() => void) | null = null;

  private gHearts: Group;
  private gMap: Group;
  private gCoins: Group;
  private gKills: Group;
  private gTop: Group;
  private gAct: Group;
  private gKit: Group;
  private gMenu: Group;
  private gBoss: Group;
  private bossFace: Piece;
  private bossStones: { p: Piece; anim: Animation | null }[] = [];
  private bossLamps: { off: Piece; on: Piece }[] = [];
  private bossShown = false;
  private bossLit = -1;
  private bossLampsLit = -1;
  private bossArmored: boolean | null = null;
  private suggestAnim: Animation | null = null;

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
  private kitRing: Piece;
  private kitLit: HTMLImageElement[] = [];
  private kitPiece: Piece;
  private kitGlow: HTMLDivElement;
  private cancelPiece: Piece;
  private promptPiece: Piece;
  private notePiece: Piece;
  private noteOn = false;
  private flyPiece: Piece;
  private flyOn = false;
  private flyShown = false;
  private remotePiece: Piece;
  private remoteOn = false;
  private remoteShown = false;
  private bubble: { el: HTMLDivElement; lit: HTMLImageElement[]; pic: Piece; shown: boolean } | null = null;
  private prompt: PromptKind | null = null;
  private kitItems: KitItem[] = [];
  private kitCells = new Map<string, { p: Piece; count: Counter | null }>();
  private kitNext: { sprite: string; task: string } | null = null;
  private kitSelected: string | null = null;
  private kitLitN = -1;
  private guide: Guide;
  private soundPiece: Piece;
  private helpPiece: Piece;
  private diffPieces = new Map<Difficulty, Piece>();
  private restartPiece: Piece;
  private restartLit: HTMLImageElement[] = [];
  private restartTimer = 0;
  private restartT0 = 0;
  private restartN = 0;
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
  private kitOpen = false;
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

    // The minimap: a round studded plate under the top row; ui/map.ts prints the map on it.
    this.gMap = new Group(r, 'g-map');
    const mapPlate = this.gMap.add('map-plate', 0, 0);
    this.gMap.seal();
    this.press(mapPlate, mapPlate.target(160, 130, TOP), () => this.onMapTap?.(), { ui: true });

    // The boss bar (top centre, only near «Пожирач земель»): its face, a row of stone studs that
    // chip off as it loses health, and in front three lantern slots while its armour holds.
    this.gBoss = new Group(r, 'g-boss hidden');
    this.gBoss.add('plate-boss', 0, 0);
    this.bossFace = this.gBoss.add('boss-face', -200, -TOP, 'tile-sh');
    const row = 0.5 * Math.cos((34 * Math.PI) / 180) * STUD;
    for (let i = 0; i < BOSS_STONES; i++) this.bossStones.push({ p: this.gBoss.add('boss-stone', -140 + i * STUD, -TOP - row), anim: null });
    for (let i = 0; i < 3; i++) {
      const x = -100 + i * 3 * STUD;
      this.bossLamps.push({ off: this.gBoss.add('lamp-off', x, -TOP + row, 'lamp-sh'), on: this.gBoss.add('lamp-on', x, -TOP + row, null) });
    }
    this.gBoss.seal();

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

    // Bottom right, around the thumb: the bow; lightning (stud ring + tile) above it; the kit box on
    // its own stud ring to the left (the studs = how far the kit's task has come). While a building
    // is being placed the box turns into ✓ with a small ✕ beside it. A prompt (moon, fold) breathes above.
    this.gAct = new Group(r, 'g-act');
    this.ring = this.gAct.add('ring', -112, -238);
    for (let i = 0; i < 8; i++) this.lit.push(this.ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.bolt = this.gAct.add('bolt-empty', -112, -238 - TOP, 'tile6-sh');
    this.boltFull = this.bolt.layer('bolt');
    this.boltGlow = div('glow');
    this.bolt.lf.insertBefore(this.boltGlow, this.bolt.pr);
    const bow = this.gAct.add('bow', -80, -74, 'big-sh');
    this.kitRing = this.gAct.add('ring', -268, -96);
    for (let i = 0; i < 8; i++) this.kitLit.push(this.kitRing.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.kitPiece = this.gAct.add('kit', -268, -96 - TOP);
    this.kitGlow = div('glow');
    this.kitPiece.lf.insertBefore(this.kitGlow, this.kitPiece.pr);
    this.cancelPiece = this.gAct.add('close', -372, -206, 'tile6-sh');
    this.cancelPiece.el.classList.add('small', 'hidden');
    this.promptPiece = this.gAct.add('moon', -318, -322, 'tile6-sh');
    this.promptPiece.el.classList.add('prompt', 'hidden');
    // the DJ's note sits where the ✕ does while placing (never both at once)
    this.notePiece = this.gAct.add('note', -372, -206, 'tile6-sh');
    this.notePiece.el.classList.add('prompt', 'hidden');
    // the saucer's «fly» piece shares that place too (the note wins when both are near)
    this.flyPiece = this.gAct.add('fly', -372, -206, 'tile6-sh');
    this.flyPiece.el.classList.add('prompt', 'hidden');
    // the Wi-Fi remote too (the note and the fly piece win)
    this.remotePiece = this.gAct.add('remote', -372, -206, 'tile6-sh');
    this.remotePiece.el.classList.add('prompt', 'hidden');
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
    this.press(this.kitPiece, this.kitPiece.target(116, 116, 18), () => this.kitTap());
    this.press(this.cancelPiece, this.cancelPiece.target(96), () => input.press('kit:cancel'), { ui: true });
    this.press(this.promptPiece, this.promptPiece.target(110), () => this.prompt && input.press(`prompt:${this.prompt}`), { ui: true });
    this.press(this.notePiece, this.notePiece.target(110), () => this.noteOn && input.press('prompt:note'), { ui: true });
    this.press(this.flyPiece, this.flyPiece.target(110), () => this.flyShown && input.press('prompt:fly'), { ui: true });
    this.press(this.remotePiece, this.remotePiece.target(110), () => this.remoteShown && input.press('prompt:remote'), { ui: true });

    // Taps outside an open fan / kit plate close it.
    this.catcher = div('catcher hidden', r);
    this.catcher.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleFan(false);
      this.toggleKit(false);
    });

    // The kit plate: a studded plate with the buildings in the box, filled by setKitItems.
    this.gKit = new Group(r, 'g-kit hidden');

    // The pause menu: picture pieces on a plate. ▶ continue, sound, «?» guide, the door, «start again»
    // (a sprout on its own stud ring, held while the ring fills); difficulty below.
    this.menu = div('pmenu hidden', r);
    this.menu.addEventListener('pointerdown', (e) => {
      if (e.target === this.menu) this.setPaused(false);
    });
    this.gMenu = new Group(this.menu, 'g-menu');
    const mw = 740;
    const mh = 330;
    const mp = ninePlate(this.gMenu.inner, mw, mh);
    (mp.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';
    const play = new Piece(this.gMenu.inner, 'play', 112, 118, 'big-sh');
    this.soundPiece = new Piece(this.gMenu.inner, 'sound-on', 250, 112, 'tile6-sh');
    this.helpPiece = new Piece(this.gMenu.inner, 'help', 368, 112, 'tile6-sh');
    // the door out (the house now means «home» through the portal)
    const exit = new Piece(this.gMenu.inner, 'exit', 486, 112, 'tile6-sh');
    this.press(play, play.target(124), () => this.setPaused(false), { ui: true, paused: true });
    this.press(this.soundPiece, this.soundPiece.target(104), () => this.toggleSound(), { ui: true, paused: true });
    this.press(this.helpPiece, this.helpPiece.target(104), () => this.openGuide(), { ui: true, paused: true });
    this.press(exit, exit.target(104), () => this.exit(), { ui: true, paused: true });
    const ring = new Piece(this.gMenu.inner, 'ring', 636, 112 + TOP);
    for (let i = 0; i < 8; i++) this.restartLit.push(ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.restartPiece = new Piece(this.gMenu.inner, 'restart', 636, 112, 'tile6-sh');
    this.press(this.restartPiece, this.restartPiece.target(120), () => this.holdRestart(true), { ui: true, paused: true, up: () => this.holdRestart(false) });
    this.setRestartStuds(0);
    LEVELS.forEach((lvl, i) => {
      const p = new Piece(this.gMenu.inner, `diff-${i + 1}` as SpriteName, mw / 2 - 116 + i * 116, 250, 'tile6-sh');
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
    // The picture guide lives outside the HUD layer (its own touches), above the pause menu.
    this.guide = new Guide(parent, () => this.k);

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
    // A tablet is held by both sides a little below the middle: the thumbs reach the side bands at
    // about two thirds of the height, not the corners, so the bow and the joystick's rest go there.
    // A phone is held by its bottom corners: there they stay at the bottom edge.
    const bottom = H - g - GA.h * kb;
    const lift = Math.min(W, H) >= TABLET ? Math.max(0, bottom - (H * THUMB_Y - (BOW_Y - GA.minY) * kb)) : 0;
    GA.place(W - g - GA.w * kb, Math.max(topBottom + gap, bottom - lift), kb);
    root.setProperty('--hud-joy-x', `${Math.round(g + 104 * kb)}px`);
    root.setProperty('--hud-joy-y', `${Math.round(H - g - 96 * kb - (H - GA.bottom - g))}px`);
    root.setProperty('--hud-kb', kb.toFixed(4));
    this.zone.style.top = `${Math.round(topBottom)}px`;

    // Minimap: under the top-right row (the plate ≈ 1.6u at the top pieces' scale); if the action
    // pieces leave no room there (short landscape), it moves left of the top row instead.
    const GM = this.gMap;
    const ms = Math.max(ts, 0.72 * k) * 1.12;
    let mx = W - g - GM.w * ms;
    let my = GT.bottom + gap * 0.3;
    if (my + GM.h * ms + gap > GA.y && W >= H) {
      mx = GT.x - gap - GM.w * ms;
      my = g;
    }
    GM.place(mx, my, ms);
    this.placeBoss(g, gap, ts, topBottom);

    if (this.kitOpen) this.placeKit();
    this.placeMenu();
  }

  /**
   * The boss bar sits top centre between the left and right pieces; when the gap is too
   * narrow for it (portrait phones), it gets its own row under them, left of the minimap.
   */
  private placeBoss(g: number, gap: number, ts: number, topBottom: number): void {
    const W = window.innerWidth;
    const { gBoss: BG, gHearts: GH, gCoins: GC, gKills: GK, gTop: GT, gMap: GM } = this;
    const left = Math.max(GH.right, GC.right, GK.right) + gap;
    const tall = BG.h * ts;
    const right = Math.min(GT.x, GM.y < g + tall ? GM.x : Infinity) - gap;
    const s = Math.min(ts * 1.05, (right - left) / BG.w);
    if (s >= ts * 0.7) {
      const x = Math.min(right - BG.w * s, Math.max(left, (W - BG.w * s) / 2));
      BG.place(x, g, s);
      return;
    }
    const y2 = topBottom + gap * 0.5;
    const right2 = GM.y < y2 + tall && GM.bottom > y2 ? GM.x - gap : W - g;
    const s2 = Math.min(ts, (right2 - g) / BG.w);
    BG.place(Math.max(g, (g + right2) / 2 - (BG.w * s2) / 2), y2, s2);
  }

  /** The kit plate opens above and to the left of the kit box, inside the screen. */
  private placeKit(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const g = 8;
    const T = this.gKit;
    const s = Math.min(this.gAct.s * 1.05, (W - 2 * g) / T.w, (H - 2 * g) / T.h);
    const [bx, by] = this.gAct.toScreen(-205, -170);
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
    if (on) this.toggleKit(false);
    this.fan.classList.toggle('hidden', !on);
    this.gTop.el.classList.toggle('raised', on);
    this.catcher.classList.toggle('hidden', !this.fanOpen && !this.kitOpen);
    if (on) {
      let i = 0;
      for (const p of this.fanTiles.values()) p.drop(i++ * 50, 40);
    }
  }

  /** The kit box: opens the plate, or (while a building is being placed) puts it up. */
  private kitTap(): void {
    if (this.kitSelected) {
      this.input.press('kit:place');
      return;
    }
    sfx.play('click');
    this.toggleKit();
  }

  private toggleKit(on = !this.kitOpen): void {
    if (on === this.kitOpen) return;
    this.kitOpen = on;
    if (on) this.toggleFan(false);
    this.gKit.el.classList.toggle('hidden', !on);
    this.catcher.classList.toggle('hidden', !this.fanOpen && !this.kitOpen);
    if (on) {
      this.placeKit();
      this.gKit.pieces.forEach((p, i) => p.drop(i * 34, 40));
      this.onKitOpen?.();
    }
  }

  /** (Re)builds the kit plate: one cell per building, then the next reward, dark, with its task. */
  private buildKit(): void {
    const K = this.gKit;
    K.inner.replaceChildren();
    K.pieces.length = 0;
    this.kitCells.clear();
    const n = this.kitItems.length + (this.kitNext ? 1 : 0);
    // up to two rows while it fits: wider before taller (short landscape screens)
    const cols = n <= 4 ? Math.max(1, n) : n <= 8 ? 4 : Math.min(6, Math.ceil(n / 2));
    const rows = Math.ceil(n / cols);
    const cell = 118;
    const tw = cols * cell + 60;
    const th = rows * cell + 60;
    const plate = ninePlate(K.inner, tw, th);
    plate.style.left = `${-tw / 2}px`;
    plate.style.top = `${-th / 2}px`;
    (plate.previousElementSibling as HTMLElement).style.cssText += `;left:${-tw / 2 + 14}px;top:${-th / 2 + 18}px`;
    const at = (i: number) => [-tw / 2 + 30 + cell * ((i % cols) + 0.5), -th / 2 + 30 + cell * (Math.floor(i / cols) + 0.5) + 30];
    this.kitItems.forEach((item, i) => {
      const [cx, cy] = at(i);
      const holder = div('tb kb', K.inner);
      holder.style.cssText = `left:${cx}px;top:${cy}px`;
      // the lantern is taller than a building's square frame
      const tall = item.sprite.startsWith('brick-');
      if (tall) holder.style.transform = 'scale(0.62)';
      const p = new Piece(holder, item.sprite as SpriteName, 0, 0);
      if (tall) p.pr.insertBefore(div('lamp-glow'), p.img);
      let count: Counter | null = null;
      if (item.count !== null) {
        const ch = div('kc', holder);
        ch.style.cssText = `left:44px;top:4px`;
        count = new Counter(new Piece(ch, 'numtile', 0, 0, null));
      }
      this.press(p, p.target(cell, cell, 34), () => this.pickKit(item.id), { ui: true });
      K.pieces.push(p);
      this.kitCells.set(item.id, { p, count });
    });
    if (this.kitNext) {
      const [cx, cy] = at(this.kitItems.length);
      const holder = div('tb kb', K.inner);
      holder.style.cssText = `left:${cx}px;top:${cy}px`;
      const p = new Piece(holder, this.kitNext.sprite as SpriteName, 0, 0);
      p.el.classList.add('locked');
      const tk = div('kt', holder);
      const task = new Piece(tk, this.kitNext.task as SpriteName, 0, 0);
      this.press(
        p,
        p.target(cell, cell, 34),
        () => {
          task.bump();
          this.onKitTask?.();
        },
        { ui: true, also: [task] },
      );
      K.pieces.push(p, task);
    }
    K.minX = -tw / 2;
    K.minY = -th / 2;
    K.w = tw + 16;
    K.h = th + 20;
    K.inner.style.transform = `translate(${tw / 2}px, ${th / 2}px)`;
    this.refreshKitCells();
    if (this.kitOpen) this.placeKit();
  }

  private refreshKitCells(): void {
    for (const item of this.kitItems) {
      const c = this.kitCells.get(item.id);
      if (!c) continue;
      c.count?.set(item.count ?? 0, false);
      c.p.el.classList.toggle('empty', item.count === 0);
      c.p.el.classList.toggle('on', item.id === this.kitSelected);
    }
  }

  private pickKit(id: string): void {
    const item = this.kitItems.find((i) => i.id === id);
    if (!item || item.count === 0) {
      this.kitCells.get(id)?.p.bump('translateX(-6px) rotate(-8deg)');
      return;
    }
    this.toggleKit(false);
    this.onKitPick?.(id);
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
    this.toggleKit(false);
    this.menu.classList.toggle('hidden', !on);
    this.holdRestart(false, true);
    if (on) {
      this.input.fireHeld = false;
      this.placeMenu();
      let i = 0;
      for (const p of this.menuPieces()) p.drop(i++ * 40, 40);
    }
    this.onPause?.(on);
  }

  /**
   * The picture guide: every card (from the pause menu, which stays open under it), or one card by
   * itself (the boss card the first time its wasteland is entered). The game stays paused while it
   * is open; if it was running, it goes on when the guide shuts.
   */
  openGuide(only: GuideCard | null = null): void {
    if (this.guide.isOpen) return;
    const selfPause = !this.paused;
    if (selfPause) {
      this.paused = true;
      this.toggleFan(false);
      this.toggleKit(false);
      this.input.fireHeld = false;
      this.onPause?.(true);
    }
    this.guide.open(only, () => {
      if (!selfPause || !this.paused) return;
      this.paused = false;
      this.onPause?.(false);
    });
  }

  get guideOpen(): boolean {
    return this.guide.isOpen;
  }

  private *menuPieces(): Iterable<Piece> {
    yield this.soundPiece;
    yield this.helpPiece;
    yield this.restartPiece;
    yield* this.diffPieces.values();
  }

  /**
   * «Почати знову» is held, never tapped: each quarter second one more stud of its ring lights;
   * all eight → onRestart(true). Let go sooner and the ring empties; a short tap wiggles the sprout
   * and asks to hold (onRestart(false)).
   */
  private holdRestart(down: boolean, quiet = false): void {
    clearInterval(this.restartTimer);
    if (down) {
      this.restartT0 = performance.now();
      this.restartTimer = window.setInterval(() => {
        this.setRestartStuds(this.restartN + 1);
        sfx.play('click', { pitch: 1 + this.restartN * 0.09 });
        if (this.restartN >= 8) {
          clearInterval(this.restartTimer);
          this.onRestart?.(true);
        }
      }, 250);
      return;
    }
    if (this.restartN >= 8) return;
    this.setRestartStuds(0);
    if (quiet || performance.now() - this.restartT0 > 400) return;
    this.restartPiece.el.animate(
      [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(0)' }],
      { duration: 420, easing: 'ease-out' },
    );
    this.onRestart?.(false);
  }

  private setRestartStuds(n: number): void {
    this.restartN = n;
    this.restartLit.forEach((l, i) => {
      l.style.visibility = i < n ? '' : 'hidden';
      if (i === n - 1) l.animate([{ transform: 'translateY(-6px)' }, { transform: 'none' }], { duration: SP.press.duration, easing: SP.press.easing });
    });
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
      if (q.kit) setTimeout(() => this.toggleKit(true), 300);
      if (q.pause) setTimeout(() => this.setPaused(true), 300);
      if (q.guide === 'all') setTimeout(() => (this.setPaused(true), this.openGuide()), 300);
      else if (q.guide) setTimeout(() => this.openGuide(q.guide as GuideCard), 300);
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
    at(this.gMap, 460);
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

  // ─── the kit ───

  setKitItems(items: KitItem[]): void {
    const same = items.length === this.kitItems.length && items.every((it, i) => it.id === this.kitItems[i].id);
    this.kitItems = items.map((i) => ({ ...i }));
    if (same && this.kitCells.size) this.refreshKitCells();
    else this.buildKit();
  }

  /** The next reward and its task's picture (the last cell of the kit plate). */
  setKitNext(next: { sprite: string; task: string } | null): void {
    if (next?.sprite === this.kitNext?.sprite && next?.task === this.kitNext?.task) return;
    this.kitNext = next ? { ...next } : null;
    this.buildKit();
  }

  /** How far the kit's task has come: 0..8 studs lit around the box. */
  setKitProgress(lit: number): void {
    if (lit === this.kitLitN) return;
    const grew = this.kitLitN >= 0 && lit > this.kitLitN;
    this.kitLit.forEach((l, i) => {
      const on = i < lit;
      l.style.visibility = on ? '' : 'hidden';
      if (on && grew && i >= this.kitLitN) l.animate([{ transform: 'translateY(-6px)' }, { transform: 'none' }], { duration: SP.press.duration, easing: SP.press.easing });
    });
    this.kitLitN = lit;
  }

  /** The box while a building is being placed (✓ with a small ✕), or the box itself (null). */
  setKitMode(selected: string | null): void {
    const was = this.kitSelected;
    this.kitSelected = selected;
    setSprite(this.kitPiece.img, selected ? 'ok' : 'kit');
    if (this.kitPiece.sh) setSprite(this.kitPiece.sh, selected ? 'tile6-sh' : 'kit-sh');
    this.cancelPiece.el.classList.toggle('hidden', !selected);
    if (!!was !== !!selected) {
      this.kitPiece.drop(0, 40);
      if (selected) this.cancelPiece.drop(80, 30);
    }
    if (!selected) this.kitPiece.el.classList.remove('dim');
    this.refreshKitCells();
  }

  /** ✓ dims while there is no free spot for the building. */
  setKitReady(ok: boolean): void {
    this.kitPiece.el.classList.toggle('dim', !!this.kitSelected && !ok);
  }

  /** ✓ keeps pulsing while the boss's wasteland suggests a lantern. */
  suggestKit(on: boolean): void {
    this.suggestAnim?.cancel();
    this.suggestAnim = null;
    if (!on) return;
    this.suggestAnim = this.kitPiece.lf.animate(
      [
        { transform: 'none' },
        { transform: 'translateY(-14px) scale(1.16)', offset: 0.3 },
        { transform: 'none', offset: 0.62 },
        { transform: 'none' },
      ],
      { duration: 1100, delay: 450, iterations: Infinity, easing: 'ease-in-out' },
    );
  }

  /** Something went into the box or came out of it. */
  kitBump(): void {
    this.kitPiece.bump('translateY(-18px) scale(1.18) rotate(-8deg)');
    this.kitGlow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
  }

  /** The breathing prompt above the action pieces (moon: sleep; fold: pack a building away; chest: open a castle's chest). */
  setPrompt(kind: PromptKind | null): void {
    if (kind === this.prompt) return;
    this.prompt = kind;
    this.promptPiece.el.classList.toggle('hidden', !kind);
    if (!kind) return;
    setSprite(this.promptPiece.img, kind);
    this.promptPiece.drop(0, 50);
  }

  /** The note piece breathing next to a working DJ console (a tap: the next song). */
  setNote(on: boolean): void {
    if (on === this.noteOn) return;
    this.noteOn = on;
    this.notePiece.el.classList.toggle('hidden', !on);
    if (on) this.notePiece.drop(0, 50);
    this.syncFly();
  }

  /** The «fly» piece breathing next to the flying saucer (a tap: the big map, to pick where to land). */
  setFly(on: boolean): void {
    if (on === this.flyOn) return;
    this.flyOn = on;
    this.syncFly();
  }

  /** The remote piece breathing inside a working Wi-Fi zone (a tap: the night show). */
  setRemote(on: boolean): void {
    if (on === this.remoteOn) return;
    this.remoteOn = on;
    this.syncFly();
  }

  /** One piece in the shared slot: the note, else the fly piece, else the remote. */
  private syncFly(): void {
    const fly = this.flyOn && !this.noteOn;
    if (fly !== this.flyShown) {
      this.flyShown = fly;
      this.flyPiece.el.classList.toggle('hidden', !fly);
      if (fly) this.flyPiece.drop(0, 50);
    }
    const remote = this.remoteOn && !this.noteOn && !this.flyOn;
    if (remote !== this.remoteShown) {
      this.remoteShown = remote;
      this.remotePiece.el.classList.toggle('hidden', !remote);
      if (remote) this.remotePiece.drop(0, 50);
    }
  }

  /**
   * The bubble over a village elder's head (screen px of the point above the head): the task's
   * picture on a stud ring that lights as it comes along. Pinned to the world, it never covers the hero.
   */
  setBubble(b: { x: number; y: number; picture: string; lit: number } | null): void {
    if (!b) {
      if (this.bubble?.shown) {
        this.bubble.el.style.display = 'none';
        this.bubble.shown = false;
      }
      return;
    }
    if (!this.bubble) {
      const el = div('vbubble', this.root);
      this.root.insertBefore(el, this.root.firstChild);
      const ring = new Piece(el, 'ring', 0, 0);
      const lit = [...Array(8)].map((_, i) => ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
      const pic = new Piece(el, 'zombie', 0, -TOP, 'tile6-sh');
      this.bubble = { el, lit, pic, shown: false };
      pic.drop(0, 40);
    }
    const u = this.bubble;
    if (!u.shown) {
      u.el.style.display = '';
      u.shown = true;
    }
    setSprite(u.pic.img, (b.picture in SPRITES ? b.picture : 'zombie') as SpriteName);
    u.lit.forEach((l, i) => (l.style.visibility = i < b.lit ? '' : 'hidden'));
    const k = this.gAct.s * 0.85;
    // kept whole on the screen when the elder stands near its edge
    const m = 72 * k;
    const x = Math.min(window.innerWidth - m, Math.max(m, b.x));
    const y = Math.min(window.innerHeight - m, Math.max(m + TOP * k, b.y));
    u.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(3)})`;
  }

  /** Stars over the dark fade (the night passing while the heroes sleep). */
  stars(on: boolean): void {
    this.faderEl.classList.toggle('stars', on);
  }

  /** The boss bar near «Пожирач земель»; null hides it. Stones chip off as its health drops. */
  setBoss(b: BossBar | null): void {
    const on = !!b;
    if (on !== this.bossShown) {
      this.bossShown = on;
      this.gBoss.el.classList.toggle('hidden', !on);
      if (on) {
        this.bossLit = -1;
        this.bossLampsLit = -1;
        this.bossArmored = null;
        this.gBoss.pieces.forEach((p, i) => p.drop(i * 30, 40));
      }
    }
    if (!b) return;
    const lit = b.hp <= 0 ? 0 : Math.max(1, Math.ceil(b.hp * BOSS_STONES - 1e-6));
    if (lit !== this.bossLit) {
      const first = this.bossLit < 0;
      this.bossStones.forEach((s, i) => {
        if (i < lit) {
          s.anim?.cancel();
          s.anim = null;
          s.p.el.style.visibility = '';
        } else if (first) s.p.el.style.visibility = 'hidden';
        else if (!s.anim) {
          // the stone chips off and tumbles away
          s.anim = s.p.el.animate(
            [
              { transform: 'none', opacity: 1 },
              { transform: 'translate(14px, -46px) rotate(80deg) scale(0.7)', opacity: 0 },
            ],
            { duration: 450, easing: 'cubic-bezier(.3,.6,.6,1)', fill: 'forwards' },
          );
        }
      });
      if (!first && lit < this.bossLit) this.bossFace.bump('translateY(-10px) scale(1.08) rotate(-8deg)');
      this.bossLit = lit;
    }
    if (b.armored !== this.bossArmored || b.lanterns !== this.bossLampsLit) {
      const prev = this.bossArmored === b.armored ? this.bossLampsLit : -1;
      this.bossLamps.forEach((l, i) => {
        l.off.el.style.display = b.armored ? '' : 'none';
        const lamp = b.armored && i < b.lanterns;
        l.on.el.style.display = lamp ? '' : 'none';
        if (lamp && prev >= 0 && i >= prev) {
          l.on.drop(0, 50);
          l.on.bump('translateY(-12px) scale(1.2)');
        }
      });
      if (this.bossArmored === true && !b.armored) this.bossFace.bump('translateY(-14px) scale(1.15) rotate(10deg)');
      this.bossArmored = b.armored;
      this.bossLampsLit = b.lanterns;
    }
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

  /** The minimap plate's layer (design px, the plate's foot at 0,0) and its scale on screen. */
  get mapLayer(): HTMLElement {
    return this.gMap.inner;
  }

  get mapScale(): number {
    return this.gMap.s;
  }

  /** Scale of the top pieces (k = u / 80 is the action pieces'). */
  get pieceScale(): number {
    return this.k;
  }

  /** Kept for compatibility: finds are announced by voice only (owner's choice). */
  toast(_img: string, _text: string): void {}

  flash(strength = 0.7): void {
    this.flashEl.animate([{ opacity: strength }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  }

  fade(on: boolean): Promise<void> {
    this.faderEl.classList.toggle('on', on);
    return new Promise((res) =>
      setTimeout(() => {
        if (on) this.onDark?.();
        res();
      }, 950),
    );
  }
}

/** Tablets (shorter side at least this, css px) lift the bow and the joystick to where the thumbs rest. */
const TABLET = 560;
/** Where the bow's centre goes on a tablet, as a share of the screen height from the top. */
const THUMB_Y = 0.66;
/** The bow's centre in the action group (design px). */
const BOW_Y = -74 - 46;

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
