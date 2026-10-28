/**
 * Frame cap with an accumulator. The browser calls us every display frame
 * (60, 90, 120 Hz…); we draw only when the next frame of the target rate is
 * due, so a 30 fps cap on a 60 Hz screen draws every second refresh, evenly.
 *
 * `tick` returns the milliseconds since the last drawn frame when a frame is
 * due, or null to skip this refresh. After a long gap (a hidden tab, a stall)
 * the clock restarts instead of handing the game one huge step.
 */
export class FrameCap {
  private acc = 0;
  private lastTick = -1;
  private lastDraw = 0;

  /**
   * @param fps target rate
   * @param tolMs a refresh this close to the due time still draws (absorbs the display's jitter)
   * @param gapMs a gap longer than this restarts the clock
   */
  constructor(
    public fps = 60,
    private readonly tolMs = 4,
    private readonly gapMs = 250,
  ) {}

  get intervalMs(): number {
    return 1000 / this.fps;
  }

  setFps(fps: number): void {
    if (fps === this.fps) return;
    this.fps = fps;
    this.acc = 0;
  }

  tick(now: number): number | null {
    const interval = this.intervalMs;
    if (this.lastTick < 0 || now - this.lastTick > this.gapMs) {
      // first frame, or back from a pause: draw now, as if one frame had passed
      this.lastTick = now;
      this.lastDraw = now;
      this.acc = 0;
      return interval;
    }
    this.acc += now - this.lastTick;
    this.lastTick = now;
    if (this.acc < interval - this.tolMs) return null;
    // keep a small remainder (even pacing on 90 / 144 Hz screens); banking more
    // would let a late refresh pull the next frame in early
    this.acc = Math.min(this.acc - interval, this.tolMs);
    const elapsed = now - this.lastDraw;
    this.lastDraw = now;
    return elapsed;
  }
}
