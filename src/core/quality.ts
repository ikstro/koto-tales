import type * as THREE from 'three';
import type { IWorld, QualityTier, Skin } from '../contracts';
import { FrameCap } from './frameCap';

/**
 * Quality levels, best first:
 *   L2  tier 1 (shadows, dressing, studs, tilt-shift post), pixel ratio ≤ 1.5, render distance 5
 *   L1  tier 1 with pixel ratio 1 and a cheaper post pass (fewer blur taps, 2× MSAA)
 *   L0  tier 0 (no shadows, no post, no dressing / studs), pixel ratio 1, render distance 4
 *   L-1 L0 at 0.75 render scale, render distance 3
 */
export type Level = 2 | 1 | 0 | -1;

export interface LevelSpec {
  tier: QualityTier;
  /** Cap on the device pixel ratio (< 1 renders below CSS resolution and lets the browser upscale). */
  maxPixelRatio: number;
  post: 'full' | 'cheap';
  renderDistance: number;
}

export const LEVELS: Record<Level, LevelSpec> = {
  2: { tier: 1, maxPixelRatio: 1.5, post: 'full', renderDistance: 5 },
  1: { tier: 1, maxPixelRatio: 1, post: 'cheap', renderDistance: 5 },
  0: { tier: 0, maxPixelRatio: 1, post: 'cheap', renderDistance: 4 },
  [-1]: { tier: 0, maxPixelRatio: 0.75, post: 'cheap', renderDistance: 3 },
};

/** One step of the ladder: a level and a frame cap. */
export interface Rung {
  level: Level;
  fps: 30 | 60;
}

/**
 * The controller walks this ladder. Before the 0.75 render scale it first
 * tries L0 at a steady 30 fps (a device that cannot hold ~55 fps looks better
 * at an even 30 than at a judder between 30 and 60).
 */
export const LADDER: readonly Rung[] = [
  { level: 2, fps: 60 },
  { level: 1, fps: 60 },
  { level: 0, fps: 60 },
  { level: 0, fps: 30 },
  { level: -1, fps: 30 },
];

export const rungOf = (level: Level, fps?: 30 | 60): number => {
  const i = LADDER.findIndex((r) => r.level === level && (fps === undefined || r.fps === fps));
  return i < 0 ? LADDER.findIndex((r) => r.level === level) : i;
};

export interface ControllerOptions {
  /** Seconds of drawn frames averaged per decision. */
  windowS: number;
  /** At a 60 fps rung: step down when the window's average frame is slower than this (≈45 fps). */
  downMs: number;
  /** At a 60 fps rung: two windows in a row slower than this (cannot hold ~55 fps, a visible judder) also step down. */
  holdMs: number;
  /** At a 30 fps rung: step down when it cannot hold ~27 fps. */
  down30Ms: number;
  /** A window counts as good when its average is within this factor of the cap's frame time. */
  goodSlack: number;
  /** Seconds of good windows before trying one rung up (doubled after every failed try, up to 8×). */
  upAfterS: number;
  /** Seconds ignored after a change (render targets, shaders, chunks settle). */
  settleS: number;
  /** Seconds ignored at the start of play (the world is still streaming in). */
  warmupS: number;
}

export const DEFAULT_OPTIONS: ControllerOptions = {
  windowS: 3,
  downMs: 22,
  holdMs: 18.2,
  down30Ms: 37,
  goodSlack: 1.08,
  upAfterS: 20,
  settleS: 1,
  warmupS: 3,
};

export type QualityEvent = 'down' | 'up' | 'stable' | null;

/**
 * Pure decision logic (no DOM, no three): fed the time between drawn frames,
 * it steps down after one slow window (or two that judder below ~55 fps) and
 * up after a long run of good ones.
 * A step up that fails within its first two windows makes the next try wait
 * twice as long, so a device on the edge does not flip back and forth.
 */
export class QualityController {
  rung: number;
  private readonly o: ControllerOptions;
  private settle: number;
  private winSum = 0;
  private winN = 0;
  private winTime = 0;
  private goodTime = 0;
  /** Windows in a row slower than holdMs. */
  private slowRun = 0;
  /** Milliseconds since the last step up; Infinity when the rung was not reached by stepping up. */
  private sinceUp = Infinity;
  private stableSent = true;
  private readonly failures: number[] = LADDER.map(() => 0);

  constructor(start: number, opts: Partial<ControllerOptions> = {}) {
    this.o = { ...DEFAULT_OPTIONS, ...opts };
    this.rung = Math.max(0, Math.min(LADDER.length - 1, start));
    this.settle = this.o.warmupS * 1000;
  }

  get current(): Rung {
    return LADDER[this.rung];
  }

  /** Feed the milliseconds between two drawn frames (only while playing). */
  sample(ms: number): QualityEvent {
    if (!(ms > 0) || ms > 250) {
      // a stall or a hidden tab says nothing about the device
      this.resetWindow();
      return null;
    }
    if (this.settle > 0) {
      this.settle -= ms;
      return null;
    }
    this.winSum += ms;
    this.winN++;
    this.winTime += ms;
    if (this.winTime < this.o.windowS * 1000) return null;

    const avg = this.winSum / this.winN;
    const span = this.winTime;
    this.resetWindow();
    if (this.sinceUp !== Infinity) this.sinceUp += span;

    const { fps } = this.current;
    const next = LADDER[this.rung + 1];
    const frame = 1000 / fps;
    this.slowRun = fps === 60 && avg > this.o.holdMs ? this.slowRun + 1 : 0;
    const slow = fps === 30 ? avg > this.o.down30Ms : avg > this.o.downMs || this.slowRun >= 2;

    if (slow) {
      this.goodTime = 0;
      if (!next) return null;
      // a fresh step up that did not hold: wait longer before trying it again
      if (this.sinceUp <= (this.o.settleS + 2 * this.o.windowS) * 1000 + 1) this.failures[this.rung]++;
      return this.change(this.rung + 1, 'down');
    }
    if (avg <= frame * this.o.goodSlack) {
      this.goodTime += span;
      if (!this.stableSent && this.goodTime >= 2 * this.o.windowS * 1000) {
        this.stableSent = true;
        return 'stable';
      }
      if (this.rung > 0) {
        const wait = this.o.upAfterS * 1000 * 2 ** Math.min(3, this.failures[this.rung - 1]);
        if (this.goodTime >= wait) return this.change(this.rung - 1, 'up');
      }
      return null;
    }
    this.goodTime = 0;
    return null;
  }

  private change(rung: number, ev: 'up' | 'down'): QualityEvent {
    this.rung = rung;
    this.goodTime = 0;
    this.slowRun = 0;
    this.settle = this.o.settleS * 1000;
    this.sinceUp = ev === 'up' ? 0 : Infinity;
    // a step down is remembered at once; a step up only once it has held
    this.stableSent = ev === 'down';
    return ev;
  }

  private resetWindow(): void {
    this.winSum = 0;
    this.winN = 0;
    this.winTime = 0;
  }
}

const KEY = 'koto-tales-quality';
const OLD_KEY = 'koto-tales-tier';

function readStored(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v) {
      const [lv, f] = v.split('@').map(Number);
      if (lv in LEVELS && (f === 30 || f === 60)) return rungOf(lv as Level, f);
    }
    // the earlier one-shot decision: '0' meant this tablet was slow
    if (localStorage.getItem(OLD_KEY) === '0') return rungOf(0, 60);
  } catch {
    // no storage: measure every time
  }
  return null;
}

function store(r: Rung): void {
  try {
    localStorage.setItem(KEY, `${r.level}@${r.fps}`);
  } catch {
    // nothing to remember with
  }
}

/** Tablets and phones (touch and a dense screen) start one step lower; they step up if they cope. */
function defaultRung(): number {
  const touch = (navigator.maxTouchPoints ?? 0) > 0 || matchMedia?.('(pointer: coarse)').matches;
  return touch && (window.devicePixelRatio || 1) >= 1.5 ? rungOf(1) : rungOf(2);
}

/**
 * Adaptive quality for the running game: owns the frame cap, the pixel
 * ratio, the skin's tier / post pass and the world's render distance, and
 * moves them along the ladder as the frame times say. `?tier=` (and `?fps=`)
 * fix the level (and cap) and switch adaptation off.
 */
export class Quality {
  readonly cap: FrameCap;
  readonly adaptive: boolean;
  private readonly ctl: QualityController;
  private readonly forcedFps: 30 | 60 | null;
  private skin: Skin | null = null;
  private world: IWorld | null = null;
  private appliedTier: QualityTier | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    forced: Level | null,
    forcedFps: 30 | 60 | null = null,
  ) {
    this.adaptive = forced === null && forcedFps === null;
    this.forcedFps = forcedFps;
    const start = forced !== null ? rungOf(forced) : (readStored() ?? defaultRung());
    this.ctl = new QualityController(start);
    this.cap = new FrameCap(this.fps);
    this.applyPixelRatio();
  }

  get level(): Level {
    return this.ctl.current.level;
  }

  get spec(): LevelSpec {
    return LEVELS[this.level];
  }

  get tier(): QualityTier {
    return this.spec.tier;
  }

  get fps(): 30 | 60 {
    return this.forcedFps ?? this.ctl.current.fps;
  }

  get renderDistance(): number {
    return this.spec.renderDistance;
  }

  /** Hands over what the levels change; applies the current level to them. */
  attach(skin: Skin, world: IWorld | null): void {
    this.skin = skin;
    this.world = world;
    this.apply();
  }

  /** Feed the milliseconds between two drawn frames, while playing. */
  sample(ms: number): void {
    if (!this.adaptive) return;
    const ev = this.ctl.sample(ms);
    if (!ev) return;
    if (ev !== 'up') store(this.ctl.current);
    if (ev !== 'stable') this.apply();
  }

  private applyPixelRatio(): void {
    const dpr = window.devicePixelRatio || 1;
    const max = this.spec.maxPixelRatio;
    this.renderer.setPixelRatio(max < 1 ? max : Math.min(dpr, max));
  }

  private apply(): void {
    this.applyPixelRatio();
    this.cap.setFps(this.fps);
    if (this.skin) {
      const was = this.appliedTier;
      this.appliedTier = this.spec.tier;
      this.skin.setTier(this.spec.tier);
      this.skin.setPostQuality?.(this.spec.post);
      // chunks dressed while light have no dressing yet: dress them again
      if (was === 0 && this.spec.tier === 1) this.world?.setSkin(this.skin);
    }
    this.world?.setRenderDistance?.(this.spec.renderDistance);
  }
}
