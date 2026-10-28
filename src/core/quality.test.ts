import { describe, expect, it } from 'vitest';
import { LADDER, QualityController, rungOf } from './quality';

/** Feeds `secs` of frames of `ms` each; returns the events that happened. */
function feed(c: QualityController, ms: number, secs: number): string[] {
  const ev: string[] = [];
  const n = Math.round((secs * 1000) / ms);
  for (let i = 0; i < n; i++) {
    const e = c.sample(ms);
    if (e) ev.push(e);
  }
  return ev;
}

const at = (c: QualityController) => `${c.current.level}@${c.current.fps}`;

describe('quality controller', () => {
  it('ignores the warm-up, then steps down after one slow 3 s window', () => {
    const c = new QualityController(rungOf(2));
    expect(feed(c, 30, 2.9)).toEqual([]); // still warming up
    expect(at(c)).toBe('2@60');
    feed(c, 25, 0.2);
    expect(feed(c, 25, 3.1)).toEqual(['down']);
    expect(at(c)).toBe('1@60');
  });

  it('does not move between "slow" and "good" (hysteresis band)', () => {
    const c = new QualityController(rungOf(1));
    expect(feed(c, 18.1, 120)).toEqual([]);
    expect(at(c)).toBe('1@60');
  });

  it('steps down from a judder below ~55 fps after two windows, not one', () => {
    const c = new QualityController(rungOf(2));
    feed(c, 16.7, 3);
    expect(feed(c, 19, 3.1)).toEqual([]);
    expect(feed(c, 19, 3.1)).toEqual(['down']);
    expect(at(c)).toBe('1@60');
  });

  it('caps a device that cannot hold ~55 fps at L0 to an even 30', () => {
    const c = new QualityController(rungOf(0, 60));
    feed(c, 16.7, 3);
    expect(feed(c, 19, 6.2)).toEqual(['down']);
    expect(at(c)).toBe('0@30');
  });

  it('walks down the whole ladder on a very slow device and stops at the bottom', () => {
    const c = new QualityController(0);
    feed(c, 60, 60);
    expect(c.rung).toBe(LADDER.length - 1);
    expect(at(c)).toBe('-1@30');
  });

  it('holds a steady 30 at a 30 fps rung', () => {
    const c = new QualityController(rungOf(-1));
    expect(feed(c, 33.4, 15).filter((e) => e === 'down')).toEqual([]);
    expect(at(c)).toBe('-1@30');
  });

  it('steps up only after 20 s of good frames', () => {
    const c = new QualityController(rungOf(1));
    feed(c, 16.7, 3); // warm-up
    expect(feed(c, 16.7, 17)).toEqual([]);
    expect(feed(c, 16.7, 5)).toEqual(['up']);
    expect(at(c)).toBe('2@60');
  });

  it('one slow window resets the good run', () => {
    const c = new QualityController(rungOf(1));
    feed(c, 16.7, 3);
    feed(c, 16.7, 15);
    feed(c, 18.1, 3); // neither good nor slow
    expect(feed(c, 16.7, 15)).toEqual([]);
    expect(at(c)).toBe('1@60');
  });

  it('a step up that fails makes the next try wait twice as long', () => {
    const c = new QualityController(rungOf(1));
    feed(c, 16.7, 3);
    expect(feed(c, 16.7, 22)).toEqual(['up']);
    // L2 is too much for this device: slow at once
    expect(feed(c, 24, 4.2)).toEqual(['down']);
    expect(at(c)).toBe('1@60');
    // 20 s is no longer enough …
    expect(feed(c, 16.7, 22)).toEqual([]);
    // … 40 s is
    expect(feed(c, 16.7, 22)).toEqual(['up']);
  });

  it('remembers a step up only once it has held for two windows', () => {
    const c = new QualityController(rungOf(1));
    feed(c, 16.7, 3);
    expect(feed(c, 16.7, 22)).toEqual(['up']);
    expect(feed(c, 16.7, 8)).toEqual(['stable']);
  });

  it('ignores stalls (hidden tab, a long hitch)', () => {
    const c = new QualityController(rungOf(2));
    feed(c, 16.7, 3);
    for (let i = 0; i < 20; i++) expect(c.sample(400)).toBeNull();
    expect(at(c)).toBe('2@60');
  });
});
