import { describe, expect, it } from 'vitest';
import { LINES } from './lines';
import { CHESS, CHESS_LINES, EASEL_LINES, SLIDE, SLIDE_AFTER_WALK, pickMove, slidePhase, startBoard, walkTime } from './playroom';

/** A seeded 0..1 generator, so a test plays the same game every time. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('the slide', () => {
  it('goes walk → climb → cross → slide → sink → hop → done, never stuck', () => {
    const walk = walkTime(2);
    const seen: string[] = [];
    for (let t = 0; t <= walk + SLIDE_AFTER_WALK + 0.1; t += 0.05) {
      const { phase, f } = slidePhase(t, walk);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      if (seen[seen.length - 1] !== phase) seen.push(phase);
    }
    expect(seen).toEqual(['walk', 'climb', 'cross', 'slide', 'sink', 'hop', 'done']);
  });

  it('is a short ride (the hero is never held for long)', () => {
    expect(SLIDE.walkMax + SLIDE_AFTER_WALK).toBeLessThan(6);
    expect(walkTime(0)).toBe(SLIDE.walkMin);
    expect(walkTime(100)).toBe(SLIDE.walkMax);
  });
});

describe('the pretend chess game', () => {
  it('starts with two columns a side and the middle empty', () => {
    const b = startBoard();
    expect(b.filter((x) => x === 0)).toHaveLength(CHESS.size * 2);
    expect(b.filter((x) => x === 1)).toHaveLength(CHESS.size * 2);
    expect(b.filter((x) => x === null)).toHaveLength(CHESS.size * (CHESS.size - 4));
  });

  it('only ever hops a piece of its side to an empty square next to it, through a whole game', () => {
    const b = startBoard();
    const r = rng(42);
    const n = CHESS.size;
    let side: 0 | 1 = 0;
    for (let i = 0; i < 200; i++) {
      const m = pickMove(b, side, r);
      expect(m).not.toBeNull();
      if (!m) break;
      expect(b[m.from]).toBe(side);
      expect(b[m.to]).toBeNull();
      expect(Math.abs((m.from % n) - (m.to % n))).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.floor(m.from / n) - Math.floor(m.to / n))).toBeLessThanOrEqual(1);
      b[m.to] = side;
      b[m.from] = null;
      side = side ? 0 : 1;
    }
    expect(b.filter((x) => x !== null)).toHaveLength(CHESS.size * 4);
  });

  it('mostly steps forward', () => {
    const r = rng(7);
    let fwd = 0;
    for (let i = 0; i < 100; i++) {
      const m = pickMove(startBoard(), 0, r)!;
      if (m.to % CHESS.size > m.from % CHESS.size) fwd++;
    }
    expect(fwd).toBeGreaterThan(60);
  });

  it('has a draw at the end and comments inside the game', () => {
    for (const c of CHESS.comments) expect(c).toBeLessThan(CHESS.game);
  });
});

describe('the playroom lines', () => {
  it('are all Пупся’s and exist', () => {
    for (const id of [...CHESS_LINES, ...EASEL_LINES, 'slide_first', 'chess_home_draw', 'chess_rumour'] as const) {
      expect(LINES[id], id).toBeTruthy();
      expect(LINES[id].speaker).toBe('pupsia');
    }
  });
});
