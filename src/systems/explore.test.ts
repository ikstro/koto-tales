import { describe, expect, it } from 'vitest';
import { Explored, chunkKey, chunkOf, exploredOf, homeChunks, parseKey, squareAround } from './explore';

describe('explore', () => {
  it('maps blocks to 16×16 chunks, negatives included', () => {
    expect(chunkOf(0)).toBe(0);
    expect(chunkOf(15.9)).toBe(0);
    expect(chunkOf(16)).toBe(1);
    expect(chunkOf(-0.1)).toBe(-1);
    expect(chunkOf(-16)).toBe(-1);
    expect(chunkOf(-17)).toBe(-2);
    expect(parseKey(chunkKey(-3, 7))).toEqual([-3, 7]);
  });

  it('a visit explores the chunk and its neighbours, once', () => {
    const list: string[] = [];
    const e = new Explored(list);
    expect(e.visit(5, 5)).toBe(9);
    expect(list).toHaveLength(9);
    expect(e.has(-1, -1) && e.has(1, 1) && e.has(0, 0)).toBe(true);
    expect(e.has(2, 0)).toBe(false);
    // moving inside the same chunk changes nothing
    expect(e.visit(12, 3)).toBe(0);
    const v = e.version;
    // one chunk east: only the new column of three
    expect(e.visit(20, 5)).toBe(3);
    expect(e.has(2, -1) && e.has(2, 0) && e.has(2, 1)).toBe(true);
    expect(e.version).toBe(v + 1);
    expect(list).toHaveLength(12);
  });

  it('keeps the save list without duplicates and reports bounds', () => {
    const list = ['0,0', '1,0'];
    const e = new Explored(list);
    e.add(['1,0', '-2,3']);
    expect(list).toEqual(['0,0', '1,0', '-2,3']);
    expect(e.bounds()).toEqual([-2, 0, 1, 3]);
    expect(new Explored([]).bounds()).toBeNull();
  });

  it('the house area is known from the start', () => {
    expect(homeChunks(null)).toEqual(squareAround(0, 0, 2));
    const save = { explored: [] as string[], house: [-30, 10, 5] as [number, number, number] };
    const e = exploredOf(save);
    expect(save.explored).toHaveLength(25);
    expect(e.has(chunkOf(-26), chunkOf(9))).toBe(true);
    // the same save gives the same set
    expect(exploredOf(save)).toBe(e);
  });
});
