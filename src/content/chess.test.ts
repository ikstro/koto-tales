import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CHESS_HALF,
  LESSONS,
  LESSON_CARDS,
  PUZZLE_PIECES,
  SMALL_BOARD,
  bigLeft,
  bigPuzzle,
  cellLocal,
  chessAlive,
  dailyPuzzle,
  darkCell,
  foeBoard,
  freshChess,
  goalMoves,
  learnedPieces,
  lessonAt,
  lessonGoals,
  localCell,
  movesOf,
  nextLesson,
  sameCell,
  shortestPath,
  takes,
  type BoardState,
  type Cell,
} from './chess';

const has = (cells: Cell[], c: number, r: number) => cells.some((p) => p.c === c && p.r === r);
const pawnFoes = LESSON_CARDS.pawn.foes!.cells;
const pawnBoard: BoardState = foeBoard(pawnFoes);

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
    const start = LESSON_CARDS.pawn.start;
    const way = shortestPath('pawn', start, { c: 4, r: BOARD - 1 }, pawnBoard)!;
    expect(way).not.toBeNull();
    expect(way.some((p) => sameCell(p, pawnFoes[1]))).toBe(true);
    // straight up the file is shut
    expect(shortestPath('pawn', start, { c: 3, r: BOARD - 1 }, pawnBoard)).toBeNull();
  });
});

describe('the king’s lessons', () => {
  it('every goal is one move from the last (the knight’s last two), with the black pawns on the board', () => {
    for (const l of LESSONS) {
      const card = LESSON_CARDS[l];
      const goals = [...card.together, ...card.alone];
      for (let got = 0; got < goals.length; got++) {
        const now = lessonAt(l, got);
        expect(now.goal).toEqual(goals[got]);
        const way = shortestPath(card.piece, now.at, now.goal!, foeBoard(now.foes));
        expect(way, `${l} goal ${got}`).not.toBeNull();
        const i = now.part === 'together' ? got : got - card.together.length;
        expect(way!.length, `${l} goal ${got}`).toBeLessThanOrEqual(goalMoves(l, now.part, i));
        expect(way!.length).toBeGreaterThan(0);
      }
      expect(lessonAt(l, goals.length).goal).toBeNull();
      expect(lessonGoals(l)).toBe(goals.length);
    }
  });

  it('the knight’s last goal really needs two jumps', () => {
    const now = lessonAt('knight', lessonGoals('knight') - 1);
    expect(shortestPath('knight', now.at, now.goal!)).toHaveLength(2);
  });

  it('a shown cell is one move from the start', () => {
    for (const l of LESSONS) for (const c of LESSON_CARDS[l].show) expect(movesOf(LESSON_CARDS[l].piece, LESSON_CARDS[l].start).some((m) => sameCell(m, c))).toBe(true);
  });

  it('the bishop stays on dark cells; the pawn’s black pawns come only in «Сам»; every black pawn of «take» is taken', () => {
    const b = LESSON_CARDS.bishop;
    expect([b.start, ...b.together, ...b.alone].every(darkCell)).toBe(true);
    expect(lessonAt('pawn', 0).foes).toEqual([]);
    expect(lessonAt('pawn', LESSON_CARDS.pawn.together.length).foes).toHaveLength(2);
    expect(lessonAt('take', 0).foes).toHaveLength(4);
    expect(lessonAt('take', lessonGoals('take')).foes).toHaveLength(0);
    // the pawn's first «Сам» goal is a take
    const at = lessonAt('pawn', LESSON_CARDS.pawn.together.length);
    expect(takes(at.goal!, foeBoard(at.foes))).toBe(true);
    expect(at.goal!.r).toBe(5);
  });

  it('lessons go in order, wake the kingdom and teach their pieces', () => {
    const s = freshChess();
    expect(nextLesson(s)).toBe('rook');
    s.done.push('rook');
    expect(nextLesson(s)).toBe('bishop');
    expect(chessAlive(s)).toBeCloseTo(1 / 7);
    expect(learnedPieces(s)).toEqual(['rook']);
    s.done.push(...LESSONS.slice(1));
    expect(nextLesson(s)).toBeNull();
    expect(chessAlive(s)).toBe(1);
    expect(learnedPieces(s)).toEqual(['rook', 'bishop', 'queen', 'king', 'knight', 'pawn']);
  });
});

describe('puzzles that come back', () => {
  it('the daily puzzle is the same for a day, the pieces in turn', () => {
    const pieces = new Set<string>();
    for (let d = 0; d < 60; d++) {
      const p = dailyPuzzle(d);
      expect(dailyPuzzle(d)).toEqual(p);
      pieces.add(p.piece);
      const n = shortestPath(p.piece, p.start, p.goal)!.length;
      expect(n).toBeGreaterThanOrEqual(p.piece === 'knight' ? 3 : 2);
      expect(n).toBeLessThanOrEqual(p.piece === 'knight' ? 4 : 2);
    }
    expect(pieces.size).toBe(PUZZLE_PIECES.length);
  });

  it('«Великі шахи» gives two-move puzzles on its small board, five a day, a new piece each time', () => {
    for (let d = 0; d < 20; d++)
      for (let k = 0; k < 5; k++) {
        const p = bigPuzzle(d, k);
        expect(p.piece).not.toBe(bigPuzzle(d, k + 1).piece);
        const n = shortestPath(p.piece, p.start, p.goal, { n: SMALL_BOARD })!.length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(p.piece === 'knight' ? 3 : 2);
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
