import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CHESS,
  CHESS_EDGE,
  CHESS_FENCE,
  CHESS_HALF,
  CHESS_PRIZE,
  FIGURES,
  LESSON_TEXT,
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
  help,
  inChessFence,
  learnedPieces,
  lessonAsk,
  lessonPicture,
  noHelp,
  pieceLine,
  picked,
  playBoard,
  praiseFor,
  promotes,
  sayNo,
  showFrom,
  thanksFor,
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

describe('the kingdom keeps monsters out', () => {
  it('the square and its soft edge are inside the fence, beyond it is not', () => {
    expect(CHESS_FENCE).toBe(CHESS_HALF + CHESS_EDGE);
    expect(inChessFence(0, 0)).toBe(true);
    expect(inChessFence(CHESS_HALF, CHESS_HALF)).toBe(true);
    expect(inChessFence(CHESS_FENCE - 0.5, 0)).toBe(true);
    expect(inChessFence(CHESS_FENCE + 0.5, 0)).toBe(false);
    expect(inChessFence(CHESS_FENCE + 0.5, 0, 2)).toBe(true);
  });
});

describe('playing the board', () => {
  const at: Cell = { c: 2, r: 2 };
  const stop = (o: Partial<Parameters<typeof picked>[1]>) => ({ cell: { c: 3, r: 3 }, at, dwell: 0, entered: false, spent: false, ...o });

  it('«Разом» goes on stepping onto a cell, «Сам» only after a stop; never the piece’s own cell, a stop counts once', () => {
    expect(picked('together', stop({ entered: true }))).toBe(true);
    expect(picked('alone', stop({ entered: true }))).toBe(false);
    expect(picked('alone', stop({ dwell: CHESS.choose - 0.01 }))).toBe(false);
    expect(picked('alone', stop({ dwell: CHESS.choose }))).toBe(true);
    expect(picked('together', stop({ dwell: CHESS.choose }))).toBe(true);
    expect(picked('alone', stop({ dwell: 5, spent: true }))).toBe(false);
    expect(picked('alone', stop({ dwell: 5, cell: at }))).toBe(false);
    expect(picked('together', stop({ entered: true, cell: null }))).toBe(false);
  });

  it('help comes back while the hero stands still and stays until the piece moves', () => {
    expect(help('together', 0, noHelp())).toEqual({ glow: true, hint: false });
    expect(help('alone', CHESS.glowBack - 0.1, noHelp())).toEqual({ glow: false, hint: false });
    expect(help('alone', CHESS.glowBack, noHelp())).toEqual({ glow: true, hint: false });
    expect(help('alone', 0, { glow: true, hint: false }).glow).toBe(true);
    expect(help('together', CHESS.hintAfter, noHelp()).hint).toBe(true);
    expect(CHESS.hintAfter).toBeGreaterThan(CHESS.glowBack);
  });

  it('the king praises now and then, never two goals in a row, his words taking turns', () => {
    expect(praiseFor(1, 1, 0, false)).toBe('chess_good_1');
    expect(praiseFor(1, 1, 1, true)).toBeNull();
    expect(praiseFor(3, 1, 1, false)).toBeNull();
    expect(praiseFor(1, 1, 4, false)).toBe('chess_good_2');
    expect(thanksFor(1)).toBe('chess_thanks');
    expect(thanksFor(2)).toBe('chess_thanks_2');
    expect(thanksFor(4)).toBe('chess_thanks');
    expect(sayNo(0) && sayNo(CHESS.noLines - 1) && !sayNo(CHESS.noLines)).toBe(true);
  });

  it('only the black pawn under the star can be taken; the rest stand in the way', () => {
    for (const l of LESSONS) {
      const goals = lessonGoals(l);
      for (let got = 0; got < goals; got++) {
        const now = lessonAt(l, got);
        const way = shortestPath(LESSON_CARDS[l].piece, now.at, now.goal!, playBoard(now.foes, now.goal));
        expect(way, `${l} ${got}`).not.toBeNull();
      }
    }
    const take = lessonAt('take', 0);
    const b = playBoard(take.foes, take.goal);
    const moves = movesOf('queen', take.at, b);
    expect(has(moves, 3, 4)).toBe(true);
    expect(has(moves, 1, 2)).toBe(false);
    expect(takes({ c: 3, r: 4 }, b)).toBe(true);
  });

  it('a pawn on the far row becomes a queen', () => {
    expect(promotes('pawn', { c: 4, r: 7 })).toBe(true);
    expect(promotes('pawn', { c: 4, r: 6 })).toBe(false);
    expect(promotes('queen', { c: 4, r: 7 })).toBe(false);
    expect(promotes('pawn', { c: 1, r: 3 }, SMALL_BOARD)).toBe(true);
  });

  it('«Дивись» on a return shows moves the piece can make from where it stands', () => {
    for (const l of LESSONS) {
      const card = LESSON_CARDS[l];
      expect(showFrom(l, card.start, card.foes?.from === 'together' ? card.foes.cells : [])).toEqual(card.show);
      for (let got = 1; got < lessonGoals(l); got++) {
        const now = lessonAt(l, got);
        const cells = showFrom(l, now.at, now.foes);
        expect(cells.length, `${l} ${got}`).toBeLessThanOrEqual(card.show.length);
        for (const c of cells) expect(has(movesOf(card.piece, now.at, foeBoard(now.foes)), c.c, c.r), `${l} ${got}`).toBe(true);
        if (card.piece !== 'pawn') for (const c of cells) expect(now.foes.some((f) => sameCell(f, c))).toBe(false);
      }
    }
  });

  it('pictures, lines and the album row', () => {
    expect(lessonPicture('take')).toBe('item-chess-take');
    expect(lessonPicture('knight')).toBe('piece-knight');
    expect(lessonAsk('rook')).toBe('chess_ask_rook');
    expect(pieceLine('pawn')).toBe('chess_piece_pawn');
    expect(FIGURES).toEqual(['rook', 'bishop', 'queen', 'king', 'knight', 'pawn']);
    expect(Object.keys(LESSON_TEXT)).toEqual([...LESSONS]);
    expect(CHESS_PRIZE).toBe('bigchess');
  });
});
