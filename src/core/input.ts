import type { HeroId } from '../contracts';

/** A tap: let go within this long, moved less than this far (px). */
const TAP_MS = 350;
const TAP_MOVE = 14;

/**
 * What the player wants this frame, from touch or keyboard. Movement is
 * screen-relative: x right, y down (towards the camera).
 */
export class Input {
  moveX = 0;
  moveY = 0;
  fireHeld = false;
  private presses = new Set<string>();
  private keys = new Set<string>();
  private joy = { id: -1, x0: 0, y0: 0, x: 0, y: 0 };
  private joyBase: HTMLElement | null = null;
  private joyKnob: HTMLElement | null = null;
  pendingHero: HeroId | null = null;
  /** This frame's short taps on the world itself (not on a HUD piece), in screen pixels; `takeTap` hands one to what it hit. */
  taps: { x: number; y: number }[] = [];
  private tapsIn: { x: number; y: number }[] = [];
  private tapStart = new Map<number, { x: number; y: number; t: number }>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const map: Record<string, string> = {
        Space: 'fire',
        KeyE: 'bolt',
        KeyQ: 'jump',
        ShiftLeft: 'bolt',
        KeyF: 'kit:place',
        KeyX: 'kit:cancel',
        KeyB: 'album',
        Tab: 'album',
        Escape: 'close',
      };
      if (map[e.code]) {
        this.presses.add(map[e.code]);
        e.preventDefault();
      }
      if (e.code === 'Space') this.fireHeld = true;
      if (e.code === 'Digit1') this.pendingHero = 'lyosha';
      if (e.code === 'Digit2') this.pendingHero = 'solomiia';
      if (e.code === 'Digit3') this.pendingHero = 'pupsia';
      if (e.code === 'Digit4') this.pendingHero = 'david';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.fireHeld = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fireHeld = false;
    });
  }

  /** The left side of the screen is a floating joystick: it appears under the finger. */
  attachJoystick(zone: HTMLElement, base: HTMLElement, knob: HTMLElement): void {
    this.joyBase = base;
    this.joyKnob = knob;
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== -1) return;
      this.joy.id = e.pointerId;
      this.joy.x0 = this.joy.x = e.clientX;
      this.joy.y0 = this.joy.y = e.clientY;
      zone.setPointerCapture(e.pointerId);
      this.drawJoy(true);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.x = e.clientX;
      this.joy.y = e.clientY;
      this.drawJoy(true);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = -1;
      this.drawJoy(false);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // a quick touch that never moved the stick is a tap on whatever lies under it
    this.watchTaps(zone);
  }

  /** A short, still touch on `el` (the game's canvas, the joystick's half) is a tap on the world. */
  watchTaps(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => this.tapStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() }));
    const end = (e: PointerEvent) => {
      const s = this.tapStart.get(e.pointerId);
      this.tapStart.delete(e.pointerId);
      if (s && e.type === 'pointerup' && performance.now() - s.t < TAP_MS && Math.hypot(e.clientX - s.x, e.clientY - s.y) < TAP_MOVE) this.tapsIn.push({ x: s.x, y: s.y });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Takes this frame's tap within `radius` px of the screen point (x, y), if there is one. */
  takeTap(x: number, y: number, radius: number): boolean {
    const i = this.taps.findIndex((t) => Math.hypot(t.x - x, t.y - y) < radius);
    if (i < 0) return false;
    this.taps.splice(i, 1);
    return true;
  }

  private drawJoy(active: boolean): void {
    const base = this.joyBase;
    const knob = this.joyKnob;
    if (!base || !knob) return;
    base.classList.toggle('active', active);
    if (!active) {
      base.style.removeProperty('left');
      base.style.removeProperty('top');
      knob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const { dx, dy } = this.joyVector();
    base.style.left = `${this.joy.x0}px`;
    base.style.top = `${this.joy.y0}px`;
    knob.style.transform = `translate(calc(-50% + ${dx * 56}px), calc(-50% + ${dy * 56}px))`;
  }

  private joyVector(): { dx: number; dy: number } {
    const R = 56;
    let dx = (this.joy.x - this.joy.x0) / R;
    let dy = (this.joy.y - this.joy.y0) / R;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    return { dx, dy };
  }

  press(action: string): void {
    this.presses.add(action);
  }

  /** True once per press. */
  take(action: string): boolean {
    if (!this.presses.has(action)) return false;
    this.presses.delete(action);
    return true;
  }

  clearPresses(): void {
    this.presses.clear();
    this.taps = [];
    this.tapsIn = [];
  }

  update(): void {
    this.taps = this.tapsIn;
    this.tapsIn = [];
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y += 1;
    if (this.joy.id !== -1) {
      const v = this.joyVector();
      // A small dead zone so a resting thumb does not drift.
      if (Math.hypot(v.dx, v.dy) > 0.18) {
        x = v.dx;
        y = v.dy;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
  }
}
