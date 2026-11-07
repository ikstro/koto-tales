import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CHESS_HALF,
  KNIGHT_ROUNDS,
  LINE_STARS,
  PAWN_RUN,
  SMALL_BOARD,
  TASK_STEPS,
  bigLeft,
  bigPuzzle,
  cellLocal,
  chessAlive,
  dailyPuzzle,
  darkCell,
  freshChess,
  localCell,
  movesOf,
  nextChessTask,
  sameCell,
  shortestPath,
  takes,
  type BoardState,
  type Cell,
} from './chess';

const has = (cells: Cell[], c: number, r: number) => cells.some((p) => p.c === c && p.r === r);
const pawnBoard: BoardState = {
  blocked: (c, r) => PAWN_RUN.foes.some((f) => f.c === c && f.r === r),
  foe: (c, r) => PAWN_RUN.foes.some((f) => f.c === c && f.r === r),
};

describe('chess moves', () => {
  it('a knight jumps in an L, never off the board', () => {
    expect(movesOf('knight', { c: 1, r: 0 })).toHaveLength(3);
    expect(movesOf('knight', { c: 4, r: 4 })).toHaveLength(8);
    expect(has(movesOf('knight', { c: 1, r: 0 }), 2, 2)).toBe(true);
  });

  it('a rook slides straight and a bishop diagonally, stopped by a piece', () => {
    expect(movesOf('rook', { c: 0, r: 0 })).toHaveLength(14);
    const wall: BoardState = { blocked: (c, r) => c === 0 && r === 3 };
    expect(has(movesOf('rook', { c: 0, r: 0 }, wall), 0, 2)).toBe(true);
    expect(has(movesOf('rook', { c: 0, r: 0 }, wall), 0, 3)).toBe(false);
    expect(has(movesOf('rook', { c: 0, r: 0 }, wall), 0, 5)).toBe(false);
    const bishop = movesOf('bishop', { c: 2, r: 0 });
    expect(bishop.every(darkCell)).toBe(true);
    expect(has(bishop, 7, 5)).toBe(true);
  });

  it('a pawn steps up, two from its row, and takes only diagonally', () => {
    expect(movesOf('pawn', { c: 3, r: 1 })).toEqual([{ c: 3, r: 2 }, { c: 3, r: 3 }]);
    expect(movesOf('pawn', { c: 3, r: 2 })).toEqual([{ c: 3, r: 3 }]);
    // at the black pawns: forward is shut, the one beside is taken
    const at = movesOf('pawn', { c: 3, r: 4 }, pawnBoard);
    expect(at).toEqual([{ c: 4, r: 5 }]);
    expect(takes({ c: 4, r: 5 }, pawnBoard)).toBe(true);
  });

  it('the shortest way ends on the goal and every step is a move', () => {
    const way = shortestPath('knight', { c: 0, r: 0 }, { c: 7, r: 7 })!;
    expect(way).toHaveLength(6);
    let at: Cell = { c: 0, r: 0 };
    for (const p of way) {
      expect(has(movesOf('knight', at), p.c, p.r)).toBe(true);
      at = p;
    }
    expect(shortestPath('knight', at, at)).toEqual([]);
  });

  it('the pawn reaches the far row through its one take', () => {
    const way = shortestPath('pawn', PAWN_RUN.start, { c: 4, r: BOARD - 1 }, pawnBoard)!;
    expect(way).not.toBeNull();
    expect(way.some((p) => sameCell(p, PAWN_RUN.foes[1]))).toBe(true);
    // straight up the file is shut
    expect(shortestPath('pawn', PAWN_RUN.start, { c: 3, r: BOARD - 1 }, pawnBoard)).toBeNull();
  });
});

describe('the king’s tasks', () => {
  it('knight rounds take 1, 2 and 3 jumps and follow on', () => {
    KNIGHT_ROUNDS.forEach((p, i) => {
      expect(shortestPath('knight', p.start, p.goal)).toHaveLength(i + 1);
      if (i) expect(p.start).toEqual(KNIGHT_ROUNDS[i - 1].goal);
    });
  });

  it('every star can be reached by its piece', () => {
    for (const l of LINE_STARS) {
      for (const s of l.stars) expect(shortestPath(l.kind, l.start, s)).not.toBeNull();
      if (l.kind === 'bishop') expect(l.stars.every(darkCell) && darkCell(l.start)).toBe(true);
    }
    expect(TASK_STEPS.lines).toBe(6);
  });

  it('tasks go in order and wake the kingdom', () => {
    const s = freshChess();
    expect(nextChessTask(s)).toBe('knight');
    s.done.push('knight');
    expect(nextChessTask(s)).toBe('lines');
    expect(chessAlive(s)).toBeCloseTo(1 / 3);
    s.done.push('lines', 'pawn');
    expect(nextChessTask(s)).toBeNull();
    expect(chessAlive(s)).toBe(1);
  });
});

describe('puzzles that come back', () => {
  it('the daily puzzle is the same for a day and 3–4 jumps', () => {
    for (let d = 0; d < 60; d++) {
      const p = dailyPuzzle(d);
      expect(dailyPuzzle(d)).toEqual(p);
      const n = shortestPath('knight', p.start, p.goal)!.length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('«Великі шахи» gives 2–3 jumps on its small board, five a day', () => {
    for (let d = 0; d < 20; d++)
      for (let k = 0; k < 5; k++) {
        const p = bigPuzzle(d, k);
        const n = shortestPath('knight', p.start, p.goal, { n: SMALL_BOARD })!.length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
    const s = freshChess();
    expect(bigLeft(s, 4)).toBe(5);
    s.big = { day: 4, n: 3 };
    expect(bigLeft(s, 4)).toBe(2);
    expect(bigLeft(s, 5)).toBe(5);
  });
});

describe('the board on the square', () => {
  it('cells map to the square and back, inside the floor', () => {
    for (let c = 0; c < BOARD; c++)
      for (let r = 0; r < BOARD; r++) {
        const [lx, lz] = cellLocal({ c, r });
        expect(localCell(lx, lz)).toEqual({ c, r });
        expect(localCell(lx + 0.9, lz - 0.9)).toEqual({ c, r });
        expect(Math.abs(lx) + 1).toBeLessThanOrEqual(CHESS_HALF);
        expect(Math.abs(lz) + 1).toBeLessThanOrEqual(CHESS_HALF);
      }
    // row 0 is on the gate's side (+Z), row 7 by the tower
    expect(cellLocal({ c: 0, r: 0 })[1]).toBeGreaterThan(cellLocal({ c: 0, r: 7 })[1]);
    expect(localCell(20, 0)).toBeNull();
  });
});
