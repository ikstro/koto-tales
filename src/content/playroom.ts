/**
 * The playroom's toys at home (DESIGN.md «Home», the big house's left part): the rules that are
 * pure numbers, so they can be tested. systems/playroom.ts runs them; assets/playroom.ts draws.
 *
 * - The slide: walking up to the tower's foot climbs, slides, splashes into the ball pit and hops
 *   out on its edge (`SLIDE` is the ride's timeline in seconds).
 * - The chess corner: a pretend game of `CHESS.game` seconds, the pieces hopping by themselves
 *   (`pickMove`), Пупся's word now and then, a cheerful draw at the end.
 * - The easel: a tap shows the next drawing; Пупся's word in turn, at most every `EASEL.gap` s.
 */
import type { LineId } from './lines';

/** The ride, from the moment it starts (the first part stretches with how far the rider is from the foot). */
export const SLIDE = {
  /** Walking to the ladder's foot: at least / at most this long, at this many blocks a second. */
  walkMin: 0.25,
  walkMax: 1.0,
  walkSpeed: 3.5,
  /** Up the ladder. */
  climb: 1.1,
  /** Across the platform to the top of the chute. */
  cross: 0.4,
  /** Down the chute (it starts slow and gets going). */
  slide: 1.15,
  /** Sitting in the balls after the splash. */
  sink: 0.55,
  /** The hop out onto the pit's edge. */
  hop: 0.4,
  /** A turn on the joystick away from the tower before this (s, from the climb's start) gets off at the foot. */
  leaveBefore: 0.8,
  /** Each helper that follows starts this long after the one before. */
  helperGap: 1.25,
  /** How likely a helper in the house follows the player down. */
  helperChance: 0.75,
} as const;

/** The whole ride after the walk to the foot. */
export const SLIDE_AFTER_WALK = SLIDE.climb + SLIDE.cross + SLIDE.slide + SLIDE.sink + SLIDE.hop;

export type SlidePhase = 'walk' | 'climb' | 'cross' | 'slide' | 'sink' | 'hop' | 'done';

/** Which part of the ride `t` seconds in is, and how far through it (0..1). */
export function slidePhase(t: number, walk: number): { phase: SlidePhase; f: number } {
  const parts: [SlidePhase, number][] = [
    ['walk', walk],
    ['climb', SLIDE.climb],
    ['cross', SLIDE.cross],
    ['slide', SLIDE.slide],
    ['sink', SLIDE.sink],
    ['hop', SLIDE.hop],
  ];
  let at = 0;
  for (const [phase, d] of parts) {
    if (t < at + d) return { phase, f: d > 0 ? Math.max(0, (t - at) / d) : 1 };
    at += d;
  }
  return { phase: 'done', f: 1 };
}

/** How long the walk to the foot takes from `d` blocks away. */
export const walkTime = (d: number): number => Math.min(SLIDE.walkMax, Math.max(SLIDE.walkMin, d / SLIDE.walkSpeed));

export const CHESS = {
  /** A 6×6 toy board; each side starts on its two edge columns. */
  size: 6,
  /** Seconds of the pretend game. */
  game: 20,
  /** A piece hops every this many seconds (a random pick between the two). */
  every: [0.9, 1.4] as const,
  /** One hop takes this long. */
  hop: 0.36,
  /** When Пупся says a word during a game (s). */
  comments: [6.5, 13.5] as const,
  /** Standing still at a pouf this long sits down. */
  sitAfter: 0.4,
  /** The rumour comes this long after the draw (the first game ever). */
  rumourAfter: 3.2,
} as const;

/** Пупся's words during a game, in turn. */
export const CHESS_LINES: readonly LineId[] = ['chess_home_1', 'chess_home_2', 'chess_home_3'];

/** A board: one cell per square, `null` empty, 0 / 1 a piece of that side; index = col + row × size. */
export type Board = (0 | 1 | null)[];

/** The start: side 0 on columns 0–1, side 1 on the last two. */
export function startBoard(n = CHESS.size): Board {
  const b: Board = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) b[c + r * n] = c < 2 ? 0 : c >= n - 2 ? 1 : null;
  return b;
}

/**
 * A pretend move for `side`: one of its pieces hops to an empty square next to it (8 ways round),
 * forward (towards the other side) when it can, else any way; null when no piece can move.
 * `rand` gives 0..1.
 */
export function pickMove(board: Board, side: 0 | 1, rand: () => number, n = CHESS.size): { from: number; to: number } | null {
  const fwd = side === 0 ? 1 : -1;
  const ahead: { from: number; to: number }[] = [];
  const any: { from: number; to: number }[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== side) continue;
    const c = i % n;
    const r = Math.floor(i / n);
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= n || rr < 0 || rr >= n) continue;
        const to = cc + rr * n;
        if (board[to] !== null) continue;
        (dc === fwd ? ahead : any).push({ from: i, to });
      }
  }
  // mostly forward; now and then a step to the side or back, so the game never jams at the far edge
  const list = ahead.length && rand() < 0.8 ? ahead : any.length ? any : ahead;
  if (!list.length) return null;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

export const EASEL = {
  /** How many drawings the sheet has (assets/playroom.ts paints them). */
  drawings: 6,
  /** Пупся says a word about a drawing at most this often (s). */
  gap: 30,
} as const;

/** Пупся's words at the easel, in turn. */
export const EASEL_LINES: readonly LineId[] = ['easel_1', 'easel_2', 'easel_3'];
