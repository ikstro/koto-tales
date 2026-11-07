import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import { PRODUCTS } from './recipes';
import { advance, bedOf, CROPS, emptyBed, foldBack, freshGarden, GARDEN, plant, plantable, RIPE, SPROUT, GROWING, stageOf, tapAct, water } from './garden';

describe('the garden bed', () => {
  it('grows only products the kitchen uses, each a real item', () => {
    for (const c of CROPS) {
      expect(ITEMS[c]).toBeTruthy();
      expect(PRODUCTS).toContain(c);
    }
    expect(CROPS).toEqual(['potato', 'carrot', 'cherry', 'apple']);
  });

  it('starts with no beds', () => {
    expect(freshGarden()).toEqual({ beds: {}, ripeSaid: -1 });
  });

  it('plants the first carried crop in order potato, carrot, cherry, apple', () => {
    expect(plantable({})).toBeNull();
    expect(plantable({ potato: 0, apple: 2 })).toBe('apple');
    expect(plantable({ cherry: 1, carrot: 1 })).toBe('carrot');
    expect(plantable({ apple: 1, potato: 3 })).toBe('potato');
    expect(plantable({ egg: 4, honey: 1 })).toBeNull();
  });

  it('grows a stage a day; ripe on the second day', () => {
    let b = plant('carrot', 5);
    expect(stageOf(b)).toBe(SPROUT);
    b = advance(b, 5);
    expect(stageOf(b)).toBe(SPROUT);
    b = advance(b, 6);
    expect(stageOf(b)).toBe(GROWING);
    b = advance(b, 7);
    expect(stageOf(b)).toBe(RIPE);
    b = advance(b, 12);
    expect(stageOf(b)).toBe(RIPE);
  });

  it('a watered day counts one more: watered on planting day, ripe the next morning', () => {
    let b = water(plant('potato', 3));
    b = advance(b, 4);
    expect(stageOf(b)).toBe(RIPE);
    expect(b.wet).toBe(false);
  });

  it('watering twice on one day counts once', () => {
    let b = water(water(plant('potato', 3)));
    b = advance(b, 4);
    expect(b.grown).toBe(2);
  });

  it('rain waters it too', () => {
    let b = advance(plant('cherry', 1), 1, true);
    expect(b.wet).toBe(true);
    b = advance(b, 2);
    expect(stageOf(b)).toBe(RIPE);
    // rain on bare soil or on a ripe bed changes nothing
    expect(advance(emptyBed(1), 1, true).wet).toBe(false);
  });

  it('several days passed at once count each, the wet one once more', () => {
    const b = advance(water(plant('apple', 0)), 3);
    expect(b.grown).toBe(4);
    expect(b.day).toBe(3);
  });

  it('one tap does the next sensible thing', () => {
    expect(tapAct(emptyBed(0), {})).toBe('nothing');
    expect(tapAct(emptyBed(0), { apple: 1 })).toBe('plant');
    const growing = plant('potato', 0);
    expect(tapAct(growing, {})).toBe('water');
    expect(tapAct(water(growing), {})).toBe('grows');
    const ripe = advance(growing, 2);
    expect(tapAct(ripe, { potato: 5 })).toBe('harvest');
  });

  it('folded, what grows comes back', () => {
    expect(foldBack(emptyBed(0))).toBeNull();
    expect(foldBack(plant('carrot', 0))).toEqual({ item: 'carrot', n: GARDEN.seed });
    expect(foldBack(advance(plant('carrot', 0), 2))).toEqual({ item: 'carrot', n: GARDEN.harvest });
  });

  it('a harvest gives more than the seed took', () => {
    expect(GARDEN.harvest).toBe(3);
    expect(GARDEN.seed).toBe(1);
  });

  it('reads a saved bed safely', () => {
    expect(bedOf(undefined, 4)).toEqual(emptyBed(4));
    expect(bedOf({ crop: 'stone', grown: 9 }, 4)).toEqual(emptyBed(4));
    expect(bedOf({ crop: 'apple', grown: 1, day: 2, wet: true }, 4)).toEqual({ crop: 'apple', grown: 1, day: 2, wet: true });
  });
});
