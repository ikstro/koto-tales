/**
 * The chess kingdom (DESIGN.md «Chess kingdom»): a square far from home paved as a big board,
 * the White King's tower behind it, living chess pieces for folk. The king gives seven lessons
 * that teach how the pieces move, with nothing to read: the piece shows its move, then the cells
 * it may go to glow and the hero leads it, then the glow goes out and the child guesses. Pure rules here (tested); where it stands is
 * world/chess.ts, the models assets/chess.ts, systems/chess.ts runs it.
 *
 * Cells are (c, r): c 0‥7 left to right as seen from the gate, r 0‥7 from the gate side (row 0,
 * where the party walks in) to the tower (row 7). White plays up the board (r grows).
 */
import type { BuildingId } from './buildings';
import type { LineId } from './lines';

export type PieceKind = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceSide = 'white' | 'black';

export interface Cell {
  c: number;
  r: number;
}

/** Cells along a side of the kingdom's board. */
export const BOARD = 8;
/** Cells along a side of «Великі шахи», the kit building. */
export const SMALL_BOARD = 4;

export const sameCell = (a: Cell, b: Cell) => a.c === b.c && a.r === b.r;
export const onBoard = (c: number, r: number, n = BOARD) => c >= 0 && r >= 0 && c < n && r < n;
/** Dark (teal) cells: c + r even, as on a real board (a1 is dark). */
export const darkCell = (cell: Cell) => (cell.c + cell.r) % 2 === 0;

// ---- the kingdom's square (local cells; the gate, local +Z, faces home) ----

/** Half the square's width: the flat floor runs from −HALF to +HALF around the centre cell. */
export const CHESS_HALF = 13;
/** The soft slope from the floor back to the land around. */
export const CHESS_EDGE = 8;
/** Local x of column 0's left block: the board is 16 blocks across, lx −8‥7. */
export const BOARD_LEFT = -8;
/** Local z of row 0's front block (the gate side): the board runs lz 10 down to −5. */
export const BOARD_FRONT = 10;
/** Blocks per cell along a side. */
export const CELL = 2;

/** Square-local position of a cell's middle (the same frame as systems/tasks.ts sitePos). */
export function cellLocal(cell: Cell): [number, number] {
  return [BOARD_LEFT + CELL * cell.c + 0.5, BOARD_FRONT - CELL * cell.r - 0.5];
}

/** The cell under a square-local point, or null off the board. */
export function localCell(lx: number, lz: number): Cell | null {
  const c = Math.floor((lx - BOARD_LEFT + 0.5) / CELL);
  const r = Math.floor((BOARD_FRONT + 0.5 - lz) / CELL);
  return onBoard(c, r) ? { c, r } : null;
}

// ---- moves ----

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const STRAIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface BoardState {
  /** Cells along a side (BOARD unless said). */
  n?: number;
  /** A piece stands there: nothing passes through it. */
  blocked?: (c: number, r: number) => boolean;
  /** The piece standing there is the other side's: it can be taken (a pawn only diagonally). */
  foe?: (c: number, r: number) => boolean;
}

/** Where a white piece on `from` may go. A pawn steps one up (two from row 1), takes one up diagonally. */
export function movesOf(kind: PieceKind, from: Cell, b: BoardState = {}): Cell[] {
  const n = b.n ?? BOARD;
  const blocked = b.blocked ?? (() => false);
  const foe = b.foe ?? (() => false);
  const out: Cell[] = [];
  const land = (c: number, r: number) => onBoard(c, r, n) && (!blocked(c, r) || foe(c, r));
  const step = (dirs: number[][]) => {
    for (const [dc, dr] of dirs) if (land(from.c + dc, from.r + dr)) out.push({ c: from.c + dc, r: from.r + dr });
  };
  const slide = (dirs: number[][]) => {
    for (const [dc, dr] of dirs) {
      for (let c = from.c + dc, r = from.r + dr; onBoard(c, r, n); c += dc, r += dr) {
        if (blocked(c, r)) {
          if (foe(c, r)) out.push({ c, r });
          break;
        }
        out.push({ c, r });
      }
    }
  };
  switch (kind) {
    case 'knight':
      step(KNIGHT);
      break;
    case 'king':
      step([...STRAIGHT, ...DIAGONAL]);
      break;
    case 'rook':
      slide(STRAIGHT);
      break;
    case 'bishop':
      slide(DIAGONAL);
      break;
    case 'queen':
      slide([...STRAIGHT, ...DIAGONAL]);
      break;
    case 'pawn': {
      const { c, r } = from;
      if (onBoard(c, r + 1, n) && !blocked(c, r + 1)) {
        out.push({ c, r: r + 1 });
        if (r === 1 && onBoard(c, r + 2, n) && !blocked(c, r + 2)) out.push({ c, r: r + 2 });
      }
      for (const dc of [-1, 1]) if (onBoard(c + dc, r + 1, n) && blocked(c + dc, r + 1) && foe(c + dc, r + 1)) out.push({ c: c + dc, r: r + 1 });
      break;
    }
  }
  return out;
}

/** Whether the move from → to takes a piece (lands on a foe). */
export const takes = (to: Cell, b: BoardState = {}) => !!b.blocked?.(to.c, to.r) && !!b.foe?.(to.c, to.r);

/** The fewest moves from → to: the cells after `from`, ending on `to`; [] when already there; null when out of reach. */
export function shortestPath(kind: PieceKind, from: Cell, to: Cell, b: BoardState = {}): Cell[] | null {
  if (sameCell(from, to)) return [];
  const n = b.n ?? BOARD;
  const key = (p: Cell) => p.r * n + p.c;
  const prev = new Map<number, Cell>([[key(from), from]]);
  const queue: Cell[] = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const q of movesOf(kind, p, b)) {
      if (prev.has(key(q))) continue;
      prev.set(key(q), p);
      if (sameCell(q, to)) {
        const path: Cell[] = [q];
        for (let s = p; !sameCell(s, from); s = prev.get(key(s))!) path.unshift(s);
        return path;
      }
      // after a take the piece goes on from there (the taken one has stepped off the board)
      queue.push(q);
    }
  }
  return null;
}

// ---- the king's seven lessons ----

/** One piece a lesson, easiest first (the owner's call, 2026-11-07); «take» last: the queen takes black pawns. */
export type Lesson = 'rook' | 'bishop' | 'queen' | 'king' | 'knight' | 'pawn' | 'take';
export const LESSONS: readonly Lesson[] = ['rook', 'bishop', 'queen', 'king', 'knight', 'pawn', 'take'];

/** The three parts of every lesson: the scaffold fades so the child learns the rule, not the lights. */
export type LessonPart = 'show' | 'together' | 'alone';

export interface LessonCard {
  id: Lesson;
  piece: PieceKind;
  start: Cell;
  /** «Дивись»: while the king explains, the piece shows these cells one by one (it hops there and back; a pawn only lights them, it never goes back). */
  show: readonly Cell[];
  /** «Разом»: goals one at a time (a star over the cell), every cell the piece may go to glowing; entering a glowing cell moves it. */
  together: readonly Cell[];
  /** «Сам»: goals one at a time with no glow; the child stops on a cell: the piece goes there if it can, else it shakes its head and its cells flash. */
  alone: readonly Cell[];
  /** Black pawns standing on the board from the part named (they can be taken; a taken one laughs and hops off). */
  foes?: { cells: readonly Cell[]; from: 'together' | 'alone' };
}

export const LESSON_CARDS: Record<Lesson, LessonCard> = {
  rook: {
    id: 'rook',
    piece: 'rook',
    start: { c: 0, r: 0 },
    show: [{ c: 0, r: 3 }, { c: 3, r: 0 }],
    together: [{ c: 0, r: 5 }, { c: 5, r: 5 }, { c: 5, r: 1 }],
    alone: [{ c: 2, r: 1 }, { c: 2, r: 6 }],
  },
  bishop: {
    id: 'bishop',
    piece: 'bishop',
    start: { c: 2, r: 0 },
    show: [{ c: 4, r: 2 }, { c: 0, r: 2 }],
    together: [{ c: 5, r: 3 }, { c: 2, r: 6 }, { c: 0, r: 4 }],
    alone: [{ c: 3, r: 7 }, { c: 7, r: 3 }],
  },
  queen: {
    id: 'queen',
    piece: 'queen',
    start: { c: 3, r: 0 },
    show: [{ c: 3, r: 3 }, { c: 6, r: 3 }],
    together: [{ c: 3, r: 5 }, { c: 6, r: 2 }, { c: 1, r: 2 }],
    alone: [{ c: 5, r: 6 }, { c: 5, r: 0 }],
  },
  king: {
    id: 'king',
    piece: 'king',
    start: { c: 4, r: 0 },
    show: [{ c: 4, r: 1 }, { c: 5, r: 1 }],
    together: [{ c: 4, r: 1 }, { c: 5, r: 2 }, { c: 5, r: 3 }],
    alone: [{ c: 4, r: 4 }, { c: 4, r: 5 }],
  },
  knight: {
    id: 'knight',
    piece: 'knight',
    start: { c: 1, r: 0 },
    show: [{ c: 2, r: 2 }, { c: 0, r: 2 }],
    together: [{ c: 2, r: 2 }, { c: 4, r: 3 }, { c: 5, r: 5 }],
    // the second takes two jumps: the first time the child plans ahead
    alone: [{ c: 3, r: 4 }, { c: 4, r: 7 }],
  },
  pawn: {
    id: 'pawn',
    piece: 'pawn',
    start: { c: 3, r: 1 },
    show: [{ c: 3, r: 2 }, { c: 3, r: 3 }],
    together: [{ c: 3, r: 3 }, { c: 3, r: 4 }],
    // the way ahead is shut: the black pawn beside is taken on a slant; on the far row the pawn becomes a queen
    alone: [{ c: 4, r: 5 }, { c: 4, r: 6 }, { c: 4, r: 7 }],
    foes: { cells: [{ c: 3, r: 5 }, { c: 4, r: 5 }], from: 'alone' },
  },
  take: {
    id: 'take',
    piece: 'queen',
    start: { c: 3, r: 0 },
    show: [],
    together: [{ c: 3, r: 4 }, { c: 6, r: 7 }],
    alone: [{ c: 6, r: 2 }, { c: 1, r: 2 }],
    foes: { cells: [{ c: 3, r: 4 }, { c: 6, r: 7 }, { c: 6, r: 2 }, { c: 1, r: 2 }], from: 'together' },
  },
};

/** The most moves one goal may take (the knight's last «Сам» goal takes two; every other goal one). */
export const goalMoves = (l: Lesson, part: LessonPart, i: number) => (l === 'knight' && part === 'alone' && i === LESSON_CARDS.knight.alone.length - 1 ? 2 : 1);

/** A piece that may hop back from where it showed a cell (a pawn never goes back). */
export const goesBack = (kind: PieceKind) => kind !== 'pawn';

/** Goals in a lesson (what `ChessSave.got` counts up to). */
export const lessonGoals = (l: Lesson) => LESSON_CARDS[l].together.length + LESSON_CARDS[l].alone.length;

/** Where a lesson stands after `got` goals: the part, the goal now, where the piece is, the black pawns still on the board. */
export function lessonAt(l: Lesson, got: number): { part: LessonPart; goal: Cell | null; at: Cell; foes: Cell[] } {
  const card = LESSON_CARDS[l];
  const goals = [...card.together, ...card.alone];
  const part: LessonPart = got < card.together.length ? 'together' : 'alone';
  const at = got > 0 ? goals[Math.min(got, goals.length) - 1] : card.start;
  const shown = card.foes && (card.foes.from === 'together' || part === 'alone') ? card.foes.cells : [];
  const taken = goals.slice(0, got);
  const foes = shown.filter((f) => !taken.some((g) => sameCell(f, g)));
  return { part, goal: got < goals.length ? goals[got] : null, at, foes };
}

/** The board as a lesson piece sees it: the black pawns block and can be taken. */
export const foeBoard = (foes: readonly Cell[], n = BOARD): BoardState => {
  const on = (c: number, r: number) => foes.some((f) => f.c === c && f.r === r);
  return { n, blocked: on, foe: on };
};

/** Numbers of the place (DESIGN.md «Chess kingdom»). */
export const CHESS = {
  /** Coins per lesson, and for the king's daily puzzle once the kingdom is a friend. */
  coins: 10,
  dailyCoins: 6,
  /** «Сам»: stopping on a cell this long chooses it. */
  choose: 0.5,
  /** «Сам»: standing still this long brings the glow back softly. */
  glowBack: 8,
  /** Standing still this long: the next cell of the shortest way breathes brighter. */
  hintAfter: 20,
  /** «Ні-ні» said at most this many times a lesson (the head shake and the flash every time). */
  noLines: 2,
  /** No monster appears within this of the centre (always: it is a kingdom of toys); hearts come back fast. */
  safe: 34,
  /** Пупся's first sight. */
  seen: 48,
  /** The king says hello within this. */
  hello: 7,
  /** «Великі шахи»: puzzles a day, and a coin for each. */
  bigADay: 5,
  bigCoins: 1,
} as const;

// ---- puzzles that come back ----

/** A small seeded random (mulberry32): the same day or seed always gives the same puzzle. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Puzzle {
  start: Cell;
  goal: Cell;
}

/** The pieces a puzzle may use, in turn (a pawn only goes forward: no puzzle). */
export const PUZZLE_PIECES: readonly PieceKind[] = ['rook', 'bishop', 'queen', 'king', 'knight'];

export interface PiecePuzzle extends Puzzle {
  piece: PieceKind;
}

/** A puzzle for `piece` on an n-board whose shortest way is `min`‥`max` moves. */
function piecePuzzle(seed: number, piece: PieceKind, n: number, min: number, max: number): PiecePuzzle {
  const rand = rng(seed);
  for (let k = 0; k < 400; k++) {
    const start = { c: Math.floor(rand() * n), r: Math.floor(rand() * n) };
    const goal = { c: Math.floor(rand() * n), r: Math.floor(rand() * n) };
    const way = shortestPath(piece, start, goal, { n });
    if (way && way.length >= min && way.length <= max) return { piece, start, goal };
  }
  return { piece: 'knight', start: { c: 0, r: 0 }, goal: { c: 1, r: 2 } };
}

/** How many moves a puzzle asks: the knight 2‥3 on the small board, 3‥4 on the big one; the others 2. */
const range = (piece: PieceKind, n: number): [number, number] => (piece === 'knight' ? (n > SMALL_BOARD ? [3, 4] : [2, 3]) : [2, 2]);
const turn = (k: number) => PUZZLE_PIECES[((k % PUZZLE_PIECES.length) + PUZZLE_PIECES.length) % PUZZLE_PIECES.length];

/** The king's daily puzzle on the kingdom's board, once it is a friend: a piece a day, in turn. */
export function dailyPuzzle(day: number): PiecePuzzle {
  const piece = turn(day);
  return piecePuzzle(day * 7919 + 17, piece, BOARD, ...range(piece, BOARD));
}

/** «Великі шахи»: the n-th puzzle of a day on the 4×4 board, a coin on the goal; each puzzle the next piece. */
export function bigPuzzle(day: number, n: number): PiecePuzzle {
  const piece = turn(day + n);
  return piecePuzzle(day * 131 + n * 31 + 5, piece, SMALL_BOARD, ...range(piece, SMALL_BOARD));
}

// ---- the save ----

export interface ChessSave {
  /** The king has said hello. */
  met: boolean;
  done: Lesson[];
  cur: Lesson | null;
  /** Goals of the current lesson reached (`lessonAt` says where it stands); «Дивись» is shown again on a return. */
  got: number;
  /** The chest on the tower is opened: «Великі шахи» and the sticker are the child's, the kingdom is a friend. */
  opened: boolean;
  /** The day the king's daily puzzle was last solved (−1 never). */
  daily: number;
  /** «Великі шахи»: puzzles solved on `day`. */
  big: { day: number; n: number };
}

export const freshChess = (): ChessSave => ({ met: false, done: [], cur: null, got: 0, opened: false, daily: -1, big: { day: -1, n: 0 } });

/** The next lesson, or null when all seven are done. */
export const nextLesson = (s: ChessSave): Lesson | null => LESSONS.find((l) => !s.done.includes(l)) ?? null;

/** How awake the kingdom is: 0 asleep … 1 all seven lessons done (lights, flags, the pieces cheering). */
export const chessAlive = (s: ChessSave) => s.done.length / LESSONS.length;

/** The pieces learned so far (their album stickers, «Фігури»): a lesson done teaches its piece. */
export const learnedPieces = (s: ChessSave): PieceKind[] => LESSONS.filter((l) => l !== 'take' && s.done.includes(l)).map((l) => LESSON_CARDS[l].piece);

/** «Великі шахи» puzzles still to play today. */
export const bigLeft = (s: ChessSave, day: number) => (s.big.day === day ? Math.max(0, CHESS.bigADay - s.big.n) : CHESS.bigADay);

// ---- what the board play decides (systems/boardPlay.ts, systems/chess.ts) ----

/** The kingdom's prize, in the chest on the tower (content/buildings.ts `bigchess`). */
export const CHESS_PRIZE = 'bigchess' satisfies BuildingId;

/** A toy kingdom where nothing bites (the owner's call): monsters turn away this far from its centre, the square and its soft edge. */
export const CHESS_FENCE = CHESS_HALF + CHESS_EDGE;
/** (dx, dz) from the kingdom's centre is inside its fence (`margin` further out). */
export const inChessFence = (dx: number, dz: number, margin = 0) => Math.hypot(dx, dz) < CHESS_FENCE + margin;

/** The lesson's picture: on the king's bubble, in «Зміст гри». */
export const lessonPicture = (l: Lesson) => (l === 'take' ? 'item-chess-take' : `piece-${LESSON_CARDS[l].piece}`);

/** The king's ask that names the piece and shows how it moves. */
export const lessonAsk = (l: Lesson) => `chess_ask_${l}` as LineId;

/** A piece's move told again (its album sticker). */
export const pieceLine = (k: PieceKind) => `chess_piece_${k}` as LineId;

/** The pieces of the album's row «Фігури», in the lessons' order. */
export const FIGURES: readonly PieceKind[] = LESSONS.filter((l) => l !== 'take').map((l) => LESSON_CARDS[l].piece);

/** The board a lesson's piece moves on: every black pawn blocks it; only the one on the goal can be taken (one star at a time, in turn). */
export function playBoard(foes: readonly Cell[], goal: Cell | null, n = BOARD): BoardState {
  const on = (c: number, r: number) => foes.some((f) => f.c === c && f.r === r);
  return { n, blocked: on, foe: (c, r) => !!goal && goal.c === c && goal.r === r && on(c, r) };
}

/** Where the hero is on the board this frame, for a choice. */
export interface Stop {
  /** The cell under the hero the child plays (null: off the board). */
  cell: Cell | null;
  /** Where the piece stands. */
  at: Cell;
  /** Seconds standing still on this cell. */
  dwell: number;
  /** Came onto this cell this frame. */
  entered: boolean;
  /** This stop has already counted (it counts again after a step). */
  spent: boolean;
}

/**
 * Whether the hero's cell counts as a choice now (never the piece's own cell): in «Разом» stepping onto
 * it (or standing on it a moment, when the glow came up under the hero); in «Сам» stopping on it CHESS.choose.
 * Whether the piece may go there is the caller's (a wrong one in «Сам» gets the head shake).
 */
export function picked(part: 'together' | 'alone', s: Stop): boolean {
  if (!s.cell || sameCell(s.cell, s.at) || s.spent) return false;
  if (part === 'together' && s.entered) return true;
  return s.dwell >= CHESS.choose;
}

/** Help that has come back while the hero stood still; it stays until the piece moves. */
export interface Help {
  /** Every cell the piece may go to glows (always in «Разом»; in «Сам» after CHESS.glowBack). */
  glow: boolean;
  /** The next cell of the shortest way breathes brighter (after CHESS.hintAfter, any part). */
  hint: boolean;
}

export const noHelp = (): Help => ({ glow: false, hint: false });

/** The help now, from `idle` seconds standing still since the piece last moved and what has already come back. */
export function help(part: 'together' | 'alone', idle: number, was: Help): Help {
  return { glow: part === 'together' || was.glow || idle >= CHESS.glowBack, hint: was.hint || idle >= CHESS.hintAfter };
}

/** The king's praise, taking turns. */
export const PRAISE = ['chess_good_1', 'chess_good_2', 'chess_good_3'] as const satisfies readonly LineId[];

/**
 * After a goal that is not the last of its lesson: the king praises one reached in the fewest moves
 * (`most`, goalMoves) — but never two goals in a row, so «sometimes»; his words take turns (`k` praises so far).
 */
export function praiseFor(moves: number, most: number, k: number, praisedLast: boolean): (typeof PRAISE)[number] | null {
  if (praisedLast || moves > most) return null;
  return PRAISE[k % PRAISE.length];
}

/** The king's thanks for a lesson, taking turns (`done` lessons done, this one counted). */
export const THANKS = ['chess_thanks', 'chess_thanks_2', 'chess_thanks_3'] as const satisfies readonly LineId[];
export const thanksFor = (done: number) => THANKS[(Math.max(1, done) - 1) % THANKS.length];

/** «Ні-ні, так вона не ходить» is said at most CHESS.noLines times a lesson (the head shake and the flash every time). */
export const sayNo = (said: number) => said < CHESS.noLines;

/** A pawn on the far row becomes a queen. */
export const promotes = (kind: PieceKind, to: Cell, n = BOARD) => kind === 'pawn' && to.r === n - 1;

/**
 * «Дивись» on a return mid-lesson: what to show from where the piece stands now. Each of the lesson's
 * shown moves (from its start) is made from here when the piece may, else the move nearest to it in
 * direction; a black pawn's cell is not shown (except to a pawn, which only lights its cells).
 */
export function showFrom(l: Lesson, at: Cell, foes: readonly Cell[]): Cell[] {
  const card = LESSON_CARDS[l];
  const all = movesOf(card.piece, at, foeBoard(foes));
  const moves = card.piece === 'pawn' ? all : all.filter((m) => !foes.some((f) => sameCell(f, m)));
  const out: Cell[] = [];
  for (const s of card.show) {
    const dc = s.c - card.start.c;
    const dr = s.r - card.start.r;
    const want = { c: at.c + dc, r: at.r + dr };
    let best = moves.find((m) => sameCell(m, want)) ?? null;
    if (!best) {
      let score = -Infinity;
      const len = Math.hypot(dc, dr) || 1;
      for (const m of moves) {
        const mc = m.c - at.c;
        const mr = m.r - at.r;
        const ml = Math.hypot(mc, mr) || 1;
        // the same way first, then the same length
        const k = (mc * dc + mr * dr) / (ml * len) - Math.abs(ml - len) * 0.05;
        if (k > score) {
          score = k;
          best = m;
        }
      }
    }
    if (best && !out.some((o) => sameCell(o, best!))) out.push(best);
  }
  return out;
}

/** The lessons as «Зміст гри» names them, and what each teaches (for the parents). */
export const LESSON_TEXT: Record<Lesson, { name: string; about: string }> = {
  rook: { name: 'Тура', about: 'Тура ходить тільки прямо: уперед, назад, уліво, вправо — на скільки завгодно клітинок.' },
  bishop: { name: 'Слон', about: 'Слон ходить тільки навскоси і завжди лишається на клітинках свого кольору.' },
  queen: { name: 'Королева', about: 'Королева — найсильніша фігура: ходить і прямо, і навскоси.' },
  king: { name: 'Король', about: 'Король ходить лише на одну клітинку в будь-який бік; цей урок Білий Король ходить сам.' },
  knight: { name: 'Кінь', about: 'Кінь стрибає буквою Г — дві клітинки прямо й одну вбік — і перестрибує через усіх.' },
  pawn: { name: 'Пішак', about: 'Пішак іде тільки вперед (з першого кроку можна на дві), забирає навскоси, а на останньому ряду стає королевою.' },
  take: { name: 'Бери!', about: 'Фігура забирає чужу, коли стає на її клітинку: королева забирає чотирьох чорних пішаків.' },
};
