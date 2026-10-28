import type * as THREE from 'three';
import type { QualityTier, Skin } from '../contracts';

const KEY = 'koto-tales-tier';
const SLOW_FRAME_MS = 22; // below ~45 fps

/**
 * Two levels of quality. The game starts full and, if the first ten seconds
 * of play are slow, steps down once and remembers that for this tablet.
 */
export class Quality {
  tier: QualityTier;
  private frames = 0;
  private time = 0;
  private decided: boolean;

  constructor(
    private renderer: THREE.WebGLRenderer,
    forced: QualityTier | null,
  ) {
    let stored: QualityTier | null = null;
    try {
      const v = localStorage.getItem(KEY);
      stored = v === '0' || v === '1' ? (Number(v) as QualityTier) : null;
    } catch {
      // no storage: measure every time
    }
    this.tier = forced ?? stored ?? 1;
    this.decided = forced !== null || stored !== null;
    this.applyPixelRatio();
  }

  get renderDistance(): number {
    return this.tier === 1 ? 5 : 4;
  }

  private applyPixelRatio(): void {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(this.tier === 1 ? Math.min(dpr, 1.5) : 1);
  }

  /** Feed every frame while playing. */
  sample(dt: number, skin: Skin): void {
    if (this.decided) return;
    this.frames++;
    this.time += dt;
    if (this.time < 10) return;
    this.decided = true;
    const avgMs = (this.time / this.frames) * 1000;
    if (avgMs > SLOW_FRAME_MS && this.tier === 1) {
      this.tier = 0;
      this.applyPixelRatio();
      skin.setTier(0);
    }
    try {
      localStorage.setItem(KEY, String(this.tier));
    } catch {
      // nothing to remember with
    }
  }
}
