import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, MOODS, RAIN, RAINBOW, SNOW, SUN, WEATHERS, easeMood, freshMood, morningWeather, particlesAt, weatherAfter, weatherOf } from './weather';

/** A long run of mornings, each from the one before. */
function days(seed: number, n: number, cold = false): number[] {
  const out: number[] = [];
  let w = SUN;
  for (let d = 1; d <= n; d++) out.push((w = morningWeather(seed, d, w, cold)));
  return out;
}

const share = (list: number[], w: number) => list.filter((x) => x === w).length / list.length;

describe('the morning', () => {
  it('is mostly sun, sometimes rain, rarely a rainbow, never snow outside the cold', () => {
    for (const seed of [1, 77, 123456]) {
      const list = days(seed, 3000);
      expect(share(list, SUN)).toBeGreaterThan(0.65);
      expect(share(list, RAIN)).toBeGreaterThan(0.1);
      expect(share(list, RAIN)).toBeLessThan(0.3);
      expect(share(list, RAINBOW)).toBeGreaterThan(0.02);
      expect(share(list, RAINBOW)).toBeLessThan(0.12);
      expect(share(list, SNOW)).toBe(0);
    }
  });

  it('brings a rainbow only after rain', () => {
    const list = days(9, 3000);
    list.forEach((w, i) => {
      if (w === RAINBOW) expect(list[i - 1]).toBe(RAIN);
    });
  });

  it('in the cold snows or shines, and never rains', () => {
    const list = days(5, 2000, true);
    expect(share(list, SNOW)).toBeGreaterThan(0.2);
    expect(share(list, SUN) + share(list, SNOW)).toBe(1);
  });

  it('is the same for the same world and day', () => {
    expect(days(42, 200)).toEqual(days(42, 200));
    expect(days(42, 200)).not.toEqual(days(43, 200));
  });
});

describe('the pad', () => {
  it('goes round all four', () => {
    expect([0, 1, 2, 3].map(weatherAfter)).toEqual([1, 2, 3, 0]);
    expect(WEATHERS).toHaveLength(4);
  });

  it('takes any number as a weather', () => {
    expect([4, -1, 2.7, NaN].map(weatherOf)).toEqual([0, 3, 2, 0]);
  });
});

describe('the mood', () => {
  it('has one per weather, and the sun leaves the skin alone', () => {
    expect(MOODS).toHaveLength(WEATHERS.length);
    expect(MOODS[SUN]).toEqual(freshMood());
  });

  it('dims the sun in rain and brightens the sky in snow', () => {
    expect(MOODS[RAIN].sun).toBeLessThan(1);
    expect(MOODS[SNOW].sky).toBeGreaterThan(1);
  });

  it('gets most of the way in about three seconds, without jumping', () => {
    const m = freshMood();
    easeMood(m, MOODS[RAIN], 1 / 60);
    expect(m.rain).toBeLessThan(0.05);
    for (let t = 1 / 60; t < 3; t += 1 / 60) easeMood(m, MOODS[RAIN], 1 / 60);
    expect(m.rain).toBeGreaterThan(0.9);
    expect(m.sun).toBeCloseTo(MOODS[RAIN].sun, 1);
  });
});

describe('the particles', () => {
  it('thin out down the quality levels and fit the buffer', () => {
    const list = [2, 1, 0, -1].map(particlesAt);
    expect(list[0]).toBe(MAX_PARTICLES);
    for (let i = 1; i < list.length; i++) expect(list[i]).toBeLessThan(list[i - 1]);
  });
});
