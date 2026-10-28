import { describe, expect, it } from 'vitest';
import { FrameCap } from './frameCap';

/**
 * Runs the cap over `secs` of display refreshes at `hz`; returns drawn intervals.
 * `jitter` moves each timestamp around its vsync (it does not drift).
 */
function run(cap: FrameCap, hz: number, secs: number, jitter = 0, seed = 1): number[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const out: number[] = [];
  cap.tick(1000); // first refresh starts the clock
  const n = Math.round(secs * hz);
  for (let i = 1; i <= n; i++) {
    const ms = cap.tick(1000 + (i * 1000) / hz + rand() * jitter);
    if (ms !== null) out.push(ms);
  }
  return out;
}

describe('frame cap', () => {
  it('draws every refresh at 60 fps on a 60 Hz screen', () => {
    const f = run(new FrameCap(60), 60, 2);
    expect(f.length).toBe(120);
    for (const ms of f) expect(ms).toBeCloseTo(16.67, 1);
  });

  it('draws every second refresh at 30 fps on a 60 Hz screen, evenly', () => {
    const f = run(new FrameCap(30), 60, 2);
    expect(f.length).toBe(60);
    for (const ms of f) expect(ms).toBeCloseTo(33.33, 1);
  });

  it('holds 60 on a 120 Hz screen and averages 60 on a 90 Hz one', () => {
    const a = run(new FrameCap(60), 120, 2);
    expect(a.length).toBe(120);
    const b = run(new FrameCap(60), 90, 2);
    expect(Math.abs(b.length - 120)).toBeLessThanOrEqual(1);
    // never more than one refresh skipped in a row
    for (const ms of b) expect(ms).toBeLessThan(23);
  });

  it('keeps 30 fps steady under display jitter', () => {
    const f = run(new FrameCap(30), 60, 4, 1, 7);
    expect(Math.abs(f.length - 120)).toBeLessThanOrEqual(2);
    for (const ms of f) {
      expect(ms).toBeGreaterThan(28);
      expect(ms).toBeLessThan(40);
    }
  });

  it('after a missed refresh, goes straight back to an even 30', () => {
    const cap = new FrameCap(30);
    const ticks = [0, 16.7, 33.3, 50, 66.7, 100, 116.7, 133.3, 150, 166.7, 183.3, 200];
    const drawn = ticks.map((t) => cap.tick(t)).map((v, i) => (v === null ? null : ticks[i]));
    // 0, 33.3, 66.7 drawn; 100 is late but drawn; then every second refresh again
    expect(drawn.filter((v) => v !== null)).toEqual([0, 33.3, 66.7, 100, 133.3, 166.7, 200]);
  });

  it('never hands over a jump after a long gap', () => {
    const cap = new FrameCap(30);
    cap.tick(0);
    cap.tick(16.7);
    const after = cap.tick(5000); // the tab was hidden
    expect(after).toBeCloseTo(33.33, 1);
    expect(cap.tick(5016.7)).toBeNull();
    expect(cap.tick(5033.4)).toBeCloseTo(33.4, 0);
  });

  it('switches rate without a burst', () => {
    const cap = new FrameCap(60);
    const a = run(cap, 60, 1);
    expect(a.length).toBe(60);
    cap.setFps(30);
    let t = 1000 + 60 * (1000 / 60);
    let drawn = 0;
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60;
      const ms = cap.tick(t);
      if (ms !== null) {
        drawn++;
        expect(ms).toBeLessThan(40);
      }
    }
    expect(drawn).toBe(30);
  });
});
