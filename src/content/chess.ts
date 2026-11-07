/**
 * The chess kingdom (DESIGN.md «Chess kingdom»): a square far from home paved as a big board,
 * the White King's tower behind it, living chess pieces for folk. The king asks three tasks that
 * teach how the pieces move, with nothing to read: the cells a piece may go to glow, the hero
 * steps onto one and the piece hops there. Pure rules here (tested); where it stands is
 * world/chess.ts, the models assets/chess.ts, systems/chess.ts runs it.
 *
 * Cells are (c, r): c 0‥7 left to right as seen from the gate, r 0‥7 from the gate side (row 0,
 * where the party walks in) to the tower (row 7). White plays up the board (r grows).
 */

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

// ---- the king's three tasks ----

export type ChessTask = 'knight' | 'lines' | 'pawn';
/** In this order, one at a time. */
export const CHESS_TASKS: readonly ChessTask[] = ['knight', 'lines', 'pawn'];

export interface Puzzle {
  start: Cell;
  goal: Cell;
}

/** «Кінь»: the knight crosses the board to the king in three rounds of 1, 2 and 3 jumps; each starts where the last ended. */
export const KNIGHT_ROUNDS: readonly Puzzle[] = [
  { start: { c: 1, r: 0 }, goal: { c: 2, r: 2 } },
  { start: { c: 2, r: 2 }, goal: { c: 2, r: 4 } },
  { start: { c: 2, r: 4 }, goal: { c: 4, r: 7 } },
];

/** «Прямо і навскоси»: the rook gathers its three stars (straight lines), then the bishop its three (diagonals, dark cells only). */
export const LINE_STARS: readonly { kind: 'rook' | 'bishop'; start: Cell; stars: readonly Cell[] }[] = [
  { kind: 'rook', start: { c: 0, r: 0 }, stars: [{ c: 0, r: 5 }, { c: 6, r: 5 }, { c: 6, r: 2 }] },
  { kind: 'bishop', start: { c: 2, r: 0 }, stars: [{ c: 4, r: 2 }, { c: 1, r: 5 }, { c: 3, r: 7 }] },
];

/** «Пішак»: up the board to the far row; a black pawn blocks the way, the one beside it is taken diagonally. The pawn becomes a queen. */
export const PAWN_RUN = {
  start: { c: 3, r: 1 } as Cell,
  /** Black pawns: the first stands in the way, the second is taken (it laughs and steps off the board). */
  foes: [{ c: 3, r: 5 }, { c: 4, r: 5 }] as readonly Cell[],
};

/** Steps of a task (what `ChessSave.got` counts up to). */
export const TASK_STEPS: Record<ChessTask, number> = {
  knight: KNIGHT_ROUNDS.length,
  lines: LINE_STARS.reduce((n, l) => n + l.stars.length, 0),
  pawn: 1,
};

/** Numbers of the place (DESIGN.md «Chess kingdom»). */
export const CHESS = {
  /** Coins per task, and for the king's daily puzzle once the kingdom is a friend. */
  coins: 15,
  dailyCoins: 6,
  /** Standing still this long in a task: the next cell of the shortest way breathes brighter. */
  hintAfter: 20,
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

/** A knight puzzle on an n-board whose shortest way is `min`‥`max` jumps. */
function knightPuzzle(seed: number, n: number, min: number, max: number): Puzzle {
  const rand = rng(seed);
  for (let k = 0; k < 400; k++) {
    const start = { c: Math.floor(rand() * n), r: Math.floor(rand() * n) };
    const goal = { c: Math.floor(rand() * n), r: Math.floor(rand() * n) };
    const way = shortestPath('knight', start, goal, { n });
    if (way && way.length >= min && way.length <= max) return { start, goal };
  }
  return { start: { c: 0, r: 0 }, goal: { c: 1, r: 2 } };
}

/** The king's daily puzzle on the kingdom's board, once it is a friend: 3‥4 jumps. */
export const dailyPuzzle = (day: number): Puzzle => knightPuzzle(day * 7919 + 17, BOARD, 3, 4);

/** «Великі шахи»: the n-th puzzle of a day on the 4×4 board: 2‥3 jumps, a coin on the goal. */
export const bigPuzzle = (day: number, n: number): Puzzle => knightPuzzle(day * 131 + n * 31 + 5, SMALL_BOARD, 2, 3);

// ---- the save ----

export interface ChessSave {
  /** The king has said hello. */
  met: boolean;
  done: ChessTask[];
  cur: ChessTask | null;
  /** Steps of the current task done (rounds, stars); a piece in the middle of a step starts the step again. */
  got: number;
  /** The chest on the tower is opened: «Великі шахи» and the sticker are the child's, the kingdom is a friend. */
  opened: boolean;
  /** The day the king's daily puzzle was last solved (−1 never). */
  daily: number;
  /** «Великі шахи»: puzzles solved on `day`. */
  big: { day: number; n: number };
}

export const freshChess = (): ChessSave => ({ met: false, done: [], cur: null, got: 0, opened: false, daily: -1, big: { day: -1, n: 0 } });

/** The next task, or null when all three are done. */
export const nextChessTask = (s: ChessSave): ChessTask | null => CHESS_TASKS.find((t) => !s.done.includes(t)) ?? null;

/** How awake the kingdom is: 0 asleep … 1 all three done (lights, flags, the pieces cheering). */
export const chessAlive = (s: ChessSave) => s.done.length / CHESS_TASKS.length;

/** «Великі шахи» puzzles still to play today. */
export const bigLeft = (s: ChessSave, day: number) => (s.big.day === day ? Math.max(0, CHESS.bigADay - s.big.n) : CHESS.bigADay);
