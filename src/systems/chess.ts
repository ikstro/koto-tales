import * as THREE from 'three';
import type { CharacterModel } from '../contracts';
import { createPortal, type PortalModel } from '../assets/buildings';
import { createChessKingdom, PLATE_H, type ChessKingdomModel, type ChessTick } from '../assets/chess';
import { HOP, hopLift, hopSquash, waveArm } from '../assets/parts/chessman';
import { createChest, type Chest } from '../assets/props';
import {
  CHESS, CHESS_HALF, CHESS_PRIZE, LESSON_CARDS, LESSONS, PRAISE, bigLeft, bigPuzzle, chessAlive, dailyPuzzle, goalMoves, lessonAsk, lessonAt,
  lessonGoals, lessonPicture, nextLesson, praiseFor, promotes, sayNo, showFrom, thanksFor,
  type Cell, type ChessSave, type Lesson, type LessonPart, type PieceKind, type PiecePuzzle,
} from '../content/chess';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { outOfView } from '../render/outOfView';
import { cutawayModel } from '../render/skins/cutaway';
import { setMapMarker } from '../ui/map';
import { music } from '../voice/music';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import type { ChessSite } from '../world/chess';
import { villageYaw } from '../world/villages';
import { BoardPlay, type OnBoard, type PlayEvent, type PlayPart, type PlayPiece } from './boardPlay';
import { chunkOf, exploredOf, squareAround } from './explore';
import { addToKit, reserveCells, standingWhere, type Standing } from './kit';
import { hasAbility } from './progress';
import { giveCoins, musicNear, offerBubble, sitePos } from './tasks';
import { homeGate, inGate, travelTo } from './travel';

/**
 * The chess kingdom (DESIGN.md «Chess kingdom»): a square the world flattened (world/chess.ts) with
 * the big board, the White King's tower and living chess pieces for folk, built a piece a frame when
 * the party comes near and parked when it goes far, like a castle. The king says hello, then gives
 * seven lessons, one piece each (content/chess.ts LESSON_CARDS), every one in three parts —
 * «Дивись», «Разом», «Сам» — that boardPlay.ts runs on the board. Each lesson wakes the kingdom a
 * step; the seventh opens the stairs' gate, and the chest on the balcony holds «Великі шахи». Then
 * the king has a puzzle a day. «Великі шахи» standing in the world get their puzzles here too.
 *
 * The kingdom's characters (the king, the folk, the lesson's pieces) are children of the kingdom's
 * root and live in its local frame (+Z the gate side, y 0 the floor): the board's cells are there.
 */

const SHOW = 170;
const HIDE = 190;
/** Half the square's diagonal, the tower, and room for its shadow on a low sun. */
const VIEW_RADIUS = 46;
const SCAN = 1.2;
const BUBBLE_AT = 34;
const TALK_AGAIN = 40;
/** Away this far from the centre, a lesson under way stops; on the way back «Дивись» comes again. */
const LEAVE = 30;
/** The chest opens to a hero this close (and about as high). */
const CHEST_AT = 2.2;
const WAKE_RATE = 0.5;
/** The rumour's arrow on the map goes once the party gets this close. */
const NEAR = 24;
/** Music this close to the centre: the pieces dance. */
const DISCO_AT = 15;
/** The portal by the path (kingdom-local; assets/chess.ts `portal`), known before the kingdom is built. */
const PORTAL_SPOT: [number, number] = [-7, 12];
/** Seconds of cheering after a lesson before the piece goes. */
const OUTRO = 2.6;
/** How fast the pieces hop along (blocks a second). */
const HOP_SPEED = 1.7;
/** The folk: living pieces strolling round the board. */
const FOLK: [side: 'white' | 'black', kind: PieceKind][] = [
  ['white', 'pawn'], ['black', 'pawn'], ['white', 'knight'], ['black', 'rook'],
  ['white', 'bishop'], ['black', 'knight'], ['black', 'pawn'], ['white', 'rook'],
];
type LessonKind = 'rook' | 'bishop' | 'queen' | 'knight' | 'pawn';
const LESSON_KINDS: LessonKind[] = ['rook', 'bishop', 'queen', 'knight', 'pawn'];

interface Walker {
  model: CharacterModel;
  /** Kingdom-local feet. */
  pos: THREE.Vector3;
  yaw: number;
  /** Where it hops to, and the hop's phase. */
  to: THREE.Vector3 | null;
  hop: number;
  dancing: boolean;
}

interface Folk extends Walker {
  spot: number;
  wait: number;
  waved: boolean;
  waveT: number;
}

interface King extends Walker {
  home: THREE.Vector3;
  homeYaw: number;
  /** On the board as the lesson's piece: boardPlay moves and animates him. */
  onBoard: boolean;
  arrived: (() => void) | null;
  piece: PlayPiece;
}

interface Built {
  site: ChessSite;
  centre: THREE.Vector3;
  yaw: number;
  model: ChessKingdomModel;
  cells: [number, number, number][];
  gateCells: [number, number, number][];
  gateShut: boolean;
  king: King;
  folk: Folk[];
  /** Spots each folk may hop on to (no board, no wall in the way). */
  ways: number[][];
  pieces: Record<LessonKind, PlayPiece>;
  blacks: PlayPiece[];
  portal: { model: PortalModel; pos: THREE.Vector3; yaw: number; armed: boolean; outFor: number };
  chest: Chest;
  chestAt: THREE.Vector3;
  top: THREE.Vector3;
  play: BoardPlay;
  tick: ChessTick;
}

/** A lesson or the daily puzzle under way. */
interface Run {
  what: 'lesson' | 'daily';
  lesson: Lesson | null;
  puzzle: PiecePuzzle | null;
  piece: PlayPiece;
  phase: 'enter' | 'show' | 'play' | 'outro';
  part: LessonPart;
  t: number;
  noSaid: number;
  praisedLast: boolean;
}

let built: Built | null = null;
let shown = false;
let building: Generator<void, Built> | null = null;
let scanT = 0;
let clock = 0;
let run: Run | null = null;
let quietUntil = 0;
let repeatAt = 0;
let praises = 0;
/** Пупся's «одна клітинка сяє яскравіше», once a visit. */
let hintSaid = false;
/** The king's words wait their turn: one line after another. */
const lines: string[] = [];
let lineAt = 0;
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

const siteOf = (ctx: Ctx): ChessSite | null => ctx.world.chess?.() ?? null;
const saveOf = (ctx: Ctx): ChessSave => ctx.save.chess;
const said = (ctx: Ctx, k: string) => ctx.save.said.includes(k);
const allDone = (c: ChessSave) => c.done.length >= LESSONS.length;
const stillNow = (ctx: Ctx) => Math.hypot(ctx.input.moveX, ctx.input.moveY) < 0.2;

/** Kingdom-local (lx, ly, lz) → the world cell. */
function cellOf(v: ChessSite, lx: number, ly: number, lz: number): [number, number, number] {
  const at = sitePos(v, lx, lz, tmp);
  return [Math.floor(at.x), v.y + 1 + ly, Math.floor(at.z)];
}

/** Kingdom-local point → world. */
function toWorld(b: { centre: THREE.Vector3; yaw: number }, p: { x: number; y: number; z: number }, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(p.x, p.y, p.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, b.yaw).add(b.centre);
}

/** Whether (x, z) is in the kingdom: no monster appears, hearts come back fast (always: it is a kingdom of toys). */
export function inChess(ctx: Ctx, x: number, z: number): boolean {
  const k = siteOf(ctx);
  return !!k && Math.hypot(k.x + 0.5 - x, k.z + 0.5 - z) < CHESS.safe;
}

/** In front of the kingdom's portal (a jump, the saucer). */
function gateOf(k: ChessSite): { pos: THREE.Vector3; yaw: number } {
  return { pos: sitePos(k, ...PORTAL_SPOT), yaw: 0 };
}

/** A flight to (x, z) on the kingdom's square lands in front of its portal, never on the board or in the tower. */
export function chessLanding(ctx: Ctx, x: number, z: number): { pos: THREE.Vector3; yaw: number } | null {
  const k = siteOf(ctx);
  return k && Math.max(Math.abs(k.x + 0.5 - x), Math.abs(k.z + 0.5 - z)) <= CHESS_HALF + 1 ? gateOf(k) : null;
}

// ─── the king's words ─────────────────────────────────────────────────────────

/** Said at once (what was waiting is dropped). */
function sayNow(id: string): void {
  lines.length = 0;
  voice.say(id, { priority: 8, interrupt: true });
  lineAt = clock + 0.9;
}

/** Said when the line before has ended. */
function sayLater(id: string): void {
  lines.push(id);
}

function pumpLines(): void {
  if (!lines.length || clock < lineAt || voice.isSpeaking()) return;
  voice.say(lines.shift()!, { priority: 7 });
  lineAt = clock + 0.9;
}

/** Quiet: nobody speaking, nothing waiting. */
const quiet = () => !lines.length && clock >= lineAt && !voice.isSpeaking();

// ─── building, showing and parking ───────────────────────────────────────────

/** Spots a folk may hop between: near, the board not crossed, no wall in the way. */
function waysOf(model: ChessKingdomModel): number[][] {
  const low = new Set(model.solid.filter(([, y]) => y <= 1).map(([x, , z]) => `${x},${z}`));
  const clear = (a: [number, number], b: [number, number]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25);
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n;
      const z = a[1] + ((b[1] - a[1]) * i) / n;
      if (x > -9 && x < 8 && z > -6 && z < 11) return false;
      for (const [dx, dz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) if (low.has(`${Math.round(x + dx)},${Math.round(z + dz)}`)) return false;
    }
    return true;
  };
  const s = model.strolls;
  return s.map((a, i) => s.flatMap((b, j) => (j !== i && Math.hypot(b[0] - a[0], b[1] - a[1]) <= 9.5 && clear(a, b) ? [j] : [])));
}

function* build(ctx: Ctx, site: ChessSite): Generator<void, Built> {
  const yaw = villageYaw(site);
  const centre = sitePos(site, 0, 0);
  const model = createChessKingdom(ctx.skin);
  model.root.position.copy(centre);
  model.root.rotation.y = yaw;
  model.root.userData.casts = true;
  cutawayModel(model.root);
  model.root.updateMatrixWorld(true);
  const cells = model.solid.map(([x, y, z]) => cellOf(site, x, y, z));
  const gateCells = model.gate.map(([x, y, z]) => cellOf(site, x, y, z));
  const ways = waysOf(model);
  yield;

  // everyone lives in the kingdom's frame
  const add = (id: string): CharacterModel => {
    const m = ctx.models.character({ kind: 'parts', id });
    model.root.add(m.root);
    return m;
  };
  const km = add('chess_king');
  const home = new THREE.Vector3(model.king.x, 0, model.king.z);
  const king: King = {
    model: km, pos: home.clone(), yaw: model.king.yaw, to: null, hop: 0, dancing: false,
    home, homeYaw: model.king.yaw, onBoard: false, arrived: null, piece: { kind: 'king', model: km, drive: true },
  };
  yield;
  const folk: Folk[] = [];
  for (const [i, [side, kind]] of FOLK.entries()) {
    const spot = i % model.strolls.length;
    const [x, z] = model.strolls[spot];
    folk.push({ model: add(`chess_${side}_${kind}`), pos: new THREE.Vector3(x, 0, z), yaw: 0, to: null, hop: 0, dancing: false, spot, wait: 1 + Math.random() * 4, waved: false, waveT: 0 });
    yield;
  }
  const pieces = {} as Record<LessonKind, PlayPiece>;
  for (const kind of LESSON_KINDS) {
    const m = add(`chess_white_${kind}`);
    m.root.visible = false;
    pieces[kind] = { kind, model: m, drive: true };
    yield;
  }
  const blacks: PlayPiece[] = [];
  for (let i = 0; i < 4; i++) {
    const m = add('chess_black_pawn');
    m.root.visible = false;
    blacks.push({ kind: 'pawn', model: m, drive: true });
  }
  yield;

  const b0 = { centre, yaw };
  const pm = createPortal(ctx.skin);
  // the portal faces the camera, like a toy set out on the table
  const ppos = toWorld(b0, { x: model.portal.x, y: 0, z: model.portal.z });
  pm.root.position.copy(ppos);
  pm.root.userData.casts = true;
  yield;

  const chest = createChest(ctx.skin);
  const chestAt = toWorld(b0, model.chest);
  chest.root.position.copy(chestAt);
  chest.root.rotation.y = yaw + model.chest.yaw;
  return {
    site, centre, yaw, model, cells, gateCells, gateShut: false, king, folk, ways, pieces, blacks,
    portal: { model: pm, pos: ppos, yaw: 0, armed: false, outFor: 0 },
    chest, chestAt, top: toWorld(b0, model.top),
    play: new BoardPlay(ctx, model.board, model.root),
    tick: { night: 0, alive: 0, open: 0, beat: 0 },
  };
}

/** Coming near: into the scene as it was, the gate as the save says, everyone at their places. */
function show(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx);
  ctx.scene.add(b.model.root, b.portal.model.root, b.chest.root);
  for (const [x, y, z] of b.cells) ctx.world.setBarrier?.(x, y, z, true);
  b.gateShut = !allDone(c);
  if (b.gateShut) for (const [x, y, z] of b.gateCells) ctx.world.setBarrier?.(x, y, z, true);
  b.tick.alive = chessAlive(c);
  b.tick.open = allDone(c) ? 1 : 0;
  b.chest.setOpen(c.opened);
  homeKing(b);
  for (const p of [...Object.values(b.pieces), ...b.blacks]) p.model.root.visible = false;
  b.portal.armed = false;
  b.portal.outFor = 0;
  shown = true;
  quietUntil = 0;
  repeatAt = 0;
  hintSaid = false;
}

function park(ctx: Ctx, b: Built): void {
  if (run) finish(ctx, b, true);
  shown = false;
  ctx.scene.remove(b.model.root, b.portal.model.root, b.chest.root);
  for (const [x, y, z] of b.cells) ctx.world.setBarrier?.(x, y, z, false);
  if (b.gateShut) for (const [x, y, z] of b.gateCells) ctx.world.setBarrier?.(x, y, z, false);
  b.gateShut = false;
}

function homeKing(b: Built): void {
  const k = b.king;
  k.onBoard = false;
  k.to = null;
  k.arrived = null;
  k.pos.copy(k.home);
  k.yaw = k.homeYaw;
  k.model.root.scale.set(1, 1, 1);
  if (b.play.piece === k.piece) b.play.piece = null;
}

// ─── lessons and the daily puzzle ────────────────────────────────────────────

const pieceFor = (b: Built, kind: PieceKind): PlayPiece => (kind === 'king' ? b.king.piece : b.pieces[kind as LessonKind]);

/** A piece's spot in the world, a little above it. */
const above = (b: Built, p: THREE.Vector3, up = 1) => b.model.root.localToWorld(tmp2.copy(p).setY(p.y + up));

/** The piece comes onto its cell: the king walks there himself; any other piece pops up there. */
function enter(ctx: Ctx, b: Built, piece: PlayPiece, at: Cell, then: () => void): void {
  if (piece === b.king.piece) {
    const k = b.king;
    k.to = b.model.board.cellPos(at, new THREE.Vector3()).setY(0);
    k.arrived = () => {
      k.onBoard = true;
      b.play.place(piece, at);
      then();
    };
    return;
  }
  b.play.place(piece, at);
  piece.model.root.rotation.y = 0;
  ctx.effects.poof(above(b, piece.model.root.position, 0.7), 0xffe3a3, 12);
  sfx.play('poof', { volume: 0.6 });
  then();
}

function startLesson(ctx: Ctx, b: Built, l: Lesson): void {
  const c = saveOf(ctx);
  if (c.cur !== l) {
    c.cur = l;
    c.got = 0;
  }
  const card = LESSON_CARDS[l];
  const now = lessonAt(l, c.got);
  const piece = pieceFor(b, card.piece);
  const r: Run = { what: 'lesson', lesson: l, puzzle: null, piece, phase: 'enter', part: now.part, t: 0, noSaid: 0, praisedLast: false };
  run = r;
  b.king.model.play('happy');
  sayNow(lessonAsk(l));
  b.play.setFoes(now.foes.map((cell, i) => ({ cell, piece: b.blacks[i] })));
  for (const f of now.foes) ctx.effects.poof(above(b, b.model.board.cellPos(f, tmp), 0.6).clone(), 0x4a2c14, 8);
  // a new lesson shows from its start; a return shows from where the piece stands
  const cells = c.got === 0 ? card.show : showFrom(l, now.at, now.foes);
  enter(ctx, b, piece, now.at, () => {
    if (run !== r) return;
    r.phase = 'show';
    b.play.show(cells, () => !quiet());
  });
}

/** After «Дивись»: «Разом» or «Сам», from where the lesson stands. */
function beginPart(ctx: Ctx, b: Built): void {
  const r = run!;
  const l = r.lesson!;
  const c = saveOf(ctx);
  const now = lessonAt(l, c.got);
  r.phase = 'play';
  r.part = now.part;
  if (now.part === 'alone') aloneStarts(ctx, b, l, c.got);
  b.play.aim(now.part as PlayPart, now.goal!, 'star');
}

/** «Сам» begins: the cells hide; the pawn's black pawns come onto the board. */
function aloneStarts(ctx: Ctx, b: Built, l: Lesson, got: number): void {
  sayLater('chess_alone');
  const card = LESSON_CARDS[l];
  if (card.foes?.from === 'alone' && got === card.together.length) {
    const now = lessonAt(l, got);
    b.play.setFoes(now.foes.map((cell, i) => ({ cell, piece: b.blacks[i] })));
    for (const f of now.foes) ctx.effects.poof(above(b, b.model.board.cellPos(f, tmp), 0.6).clone(), 0x4a2c14, 12);
    sfx.play('poof', { pitch: 1.2 });
    sayLater('chess_pawn_take');
  }
}

function lessonGoal(ctx: Ctx, b: Built, moves: number): void {
  const r = run!;
  const l = r.lesson!;
  const c = saveOf(ctx);
  const i = c.got;
  const before = lessonAt(l, i);
  c.got++;
  if (c.got >= lessonGoals(l)) {
    lessonDone(ctx, b);
    return;
  }
  const now = lessonAt(l, c.got);
  if (now.part !== r.part) {
    r.part = now.part;
    r.praisedLast = false;
    aloneStarts(ctx, b, l, c.got);
  } else {
    const card = LESSON_CARDS[l];
    const k = before.part === 'together' ? i : i - card.together.length;
    const p = praiseFor(moves, goalMoves(l, before.part, k), praises, r.praisedLast);
    r.praisedLast = !!p;
    if (p) {
      praises++;
      sayLater(p);
    }
  }
  b.play.aim(now.part as PlayPart, now.goal!, 'star');
}

function cheer(ctx: Ctx, b: Built, piece: PlayPiece): void {
  piece.model.play('cheer');
  if (piece !== b.king.piece) b.king.model.play('cheer');
  for (const f of b.folk) f.model.play('cheer');
  ctx.player.model.play('cheer');
}

/** A lesson done: thanks, coins, the kingdom wakes a step, the piece's sticker is in the album. */
function lessonDone(ctx: Ctx, b: Built): void {
  const r = run!;
  const l = r.lesson!;
  const c = saveOf(ctx);
  if (!c.done.includes(l)) c.done.push(l);
  c.cur = null;
  c.got = 0;
  giveCoins(ctx, CHESS.coins, b.model.root.localToWorld(tmp.copy(b.king.model.root.position)));
  sfx.play('sticker');
  sayLater(thanksFor(c.done.length));
  if (allDone(c)) {
    sayLater('chess_open');
    repeatAt = clock + TALK_AGAIN;
  }
  cheer(ctx, b, r.piece);
  r.phase = 'outro';
  r.t = 0;
  quietUntil = clock + 6;
}

/** The king's puzzle of the day (once the kingdom is a friend): a piece to the crown, in «Сам». */
function startDaily(ctx: Ctx, b: Built): void {
  const p = dailyPuzzle(ctx.save.day);
  const piece = pieceFor(b, p.piece);
  const r: Run = { what: 'daily', lesson: null, puzzle: p, piece, phase: 'enter', part: 'alone', t: 0, noSaid: 0, praisedLast: false };
  run = r;
  b.king.model.play('happy');
  sayNow('chess_daily');
  b.play.setFoes([]);
  enter(ctx, b, piece, p.start, () => {
    if (run !== r) return;
    r.phase = 'play';
    b.play.aim('alone', p.goal, 'goal');
  });
}

function dailyDone(ctx: Ctx, b: Built, at: Cell): void {
  const r = run!;
  saveOf(ctx).daily = ctx.save.day;
  giveCoins(ctx, CHESS.dailyCoins, above(b, b.model.board.cellPos(at, tmp), 0).clone());
  sayLater(PRAISE[praises++ % PRAISE.length]);
  cheer(ctx, b, r.piece);
  r.phase = 'outro';
  r.t = 0;
  quietUntil = clock + 6;
}

/** The lesson or puzzle ends (or is left): the piece goes, the king walks back to his place. */
function finish(ctx: Ctx, b: Built, instant = false): void {
  const r = run;
  run = null;
  b.play.stop();
  b.play.setFoes([]);
  const k = b.king;
  if (r?.piece === k.piece || k.onBoard || k.to) {
    if (instant) homeKing(b);
    else {
      if (b.play.piece === k.piece) b.play.piece = null;
      k.onBoard = false;
      k.pos.copy(k.model.root.position).setY(0);
      k.to = k.home.clone();
      k.arrived = () => (k.yaw = k.yaw);
    }
  }
  for (const p of Object.values(b.pieces)) {
    const root = p.model.root;
    if (root.visible && !instant) ctx.effects.poof(above(b, root.position, 0.7).clone(), 0xffe3a3, 12);
    root.visible = false;
  }
  if (b.play.piece !== k.piece) b.play.piece = null;
}

function onPlay(ctx: Ctx, b: Built, e: PlayEvent): void {
  const r = run;
  if (!r) return;
  switch (e.kind) {
    case 'shown':
      if (r.phase === 'show') beginPart(ctx, b);
      break;
    case 'hint':
      if (!hintSaid) {
        hintSaid = true;
        voice.say('chess_hint', { priority: 7 });
      }
      break;
    case 'wrong':
      if (sayNo(r.noSaid)) {
        r.noSaid++;
        sayNow('chess_no');
      }
      break;
    case 'moved':
      if (promotes(r.piece.kind, e.to)) {
        // the pawn on the far row becomes a queen
        const q = b.pieces.queen;
        b.play.swap(q);
        r.piece = q;
        const at = above(b, q.model.root.position, 0.9).clone();
        ctx.effects.sparkle(at, 0xffd23a);
        ctx.effects.poof(at, 0xffd23a, 20);
        sfx.play('sticker', { pitch: 1.2 });
        q.model.play('happy');
        sayNow('chess_queen');
      }
      break;
    case 'goal':
      if (r.what === 'lesson') lessonGoal(ctx, b, e.moves);
      else dailyDone(ctx, b, e.cell);
      break;
  }
}

/** Near the king: hello, the next lesson (or the one left half-done), the way up, the daily puzzle. */
function talk(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx);
  if (!c.met) {
    c.met = true;
    b.king.model.play('happy');
    sayNow('chess_hello');
    quietUntil = clock + 3;
    marks(ctx);
    return;
  }
  const l = c.cur ?? nextLesson(c);
  if (l) {
    startLesson(ctx, b, l);
    return;
  }
  if (!c.opened) {
    if (clock < repeatAt) return;
    repeatAt = clock + TALK_AGAIN;
    b.king.model.play('happy');
    sayNow('chess_open');
    return;
  }
  if (c.daily !== ctx.save.day) startDaily(ctx, b);
}

function updatePlay(ctx: Ctx, b: Built, dt: number, local: THREE.Vector3): void {
  const c = saveOf(ctx);
  const k = b.king;
  // gone far mid-lesson: it waits, and starts again with «Дивись» on the way back
  if (run && Math.hypot(local.x, local.z) > LEAVE) {
    finish(ctx, b, true);
    hintSaid = false;
  }
  const onLevel = Math.abs(local.y - PLATE_H) < 1.5;
  const hero: OnBoard = { local: onLevel ? local : null, still: stillNow(ctx) };
  for (const e of b.play.update(dt, hero)) onPlay(ctx, b, e);
  if (run?.phase === 'outro') {
    run.t += dt;
    if (run.t > OUTRO) finish(ctx, b);
  }

  const kp = k.model.root.position;
  const dKing = Math.hypot(local.x - kp.x, local.z - kp.z);
  if (!run && !k.to && dKing < CHESS.hello && clock >= quietUntil && quiet()) talk(ctx, b);

  // the bubble: the lesson's picture and how far it has come
  const l = c.met ? (c.cur ?? nextLesson(c)) : null;
  let picture: string | null = null;
  let lit = 0;
  if (l) {
    picture = lessonPicture(l);
    lit = c.cur === l ? Math.min(8, Math.floor((c.got / lessonGoals(l)) * 8 + 1e-6)) : 0;
  } else if (c.opened && (c.daily !== ctx.save.day || run?.what === 'daily')) picture = `piece-${dailyPuzzle(ctx.save.day).piece}`;
  // not while the king walks or is the lesson's piece himself: the hero stays in sight
  if (picture && dKing < BUBBLE_AT && !k.onBoard && !k.to) {
    const at = b.model.root.localToWorld(tmp.copy(kp).setY(kp.y + k.model.height + 0.9));
    offerBubble({ at: at.clone(), picture, lit, d: dKing });
  }

  // up on the balcony: Пупся says to open the chest
  const p = ctx.player.pos;
  if (allDone(c) && !c.opened && b.top.distanceTo(p) < 2.6 && !said(ctx, 'ctop:chess')) {
    ctx.save.said.push('ctop:chess');
    voice.say('castle_chest', { priority: 8 });
  }
  if (chessChestNear(ctx) && ctx.input.take('prompt:chest')) openChest(ctx, b);
}

/** The chest on the tower: «Великі шахи» into the box, the kingdom's sticker into the album. */
function openChest(ctx: Ctx, b: Built): void {
  const c = saveOf(ctx);
  if (c.opened) return;
  c.opened = true;
  b.chest.setOpen(true);
  addToKit(ctx, CHESS_PRIZE, 1);
  if (!ctx.save.found.includes('c:chess')) ctx.save.found.push('c:chess');
  sfx.play('sticker');
  ctx.effects.ring(b.chestAt, 0xffd23a, 2.4);
  ctx.effects.poof(b.chestAt.clone().setY(b.chestAt.y + 1), 0xffd23a, 30);
  ctx.effects.coinBurst(b.chestAt.clone().setY(b.chestAt.y + 0.8), 10);
  for (const [i, col] of [0xffd23a, 0xe8463a, 0x8ff0e0].entries()) setTimeout(() => ctx.effects.firework(b.chestAt.clone().setY(b.chestAt.y + 1.5), col, 4 + i), i * 350);
  ctx.player.model.play('cheer');
  sayNow('chess_prize');
  marks(ctx);
}

/** The party stands by the chest, the stairs open and the prize still in it. */
export function chessChestNear(ctx: Ctx): boolean {
  const b = built;
  if (!b || !shown || !ctx.player) return false;
  const c = saveOf(ctx);
  if (!allDone(c) || c.opened) return false;
  const p = ctx.player.pos;
  return Math.hypot(p.x - b.chestAt.x, p.z - b.chestAt.z) < CHEST_AT && Math.abs(p.y - b.chestAt.y) < 1.6;
}

// ─── the king and the folk ───────────────────────────────────────────────────

/** Hops a walker towards its `to`; true when there. */
function hopAlong(w: Walker, dt: number): boolean {
  const to = w.to!;
  const dx = to.x - w.pos.x;
  const dz = to.z - w.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.06) {
    w.pos.x = to.x;
    w.pos.z = to.z;
    w.hop = 0;
    return true;
  }
  const s = Math.min(d, HOP_SPEED * dt);
  w.pos.x += (dx / d) * s;
  w.pos.z += (dz / d) * s;
  turnTo(w, Math.atan2(dx, dz), dt, 10);
  w.hop = (w.hop + dt / HOP.time) % 1;
  return false;
}

function turnTo(w: { yaw: number }, want: number, dt: number, k: number): void {
  let d = want - w.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  w.yaw += d * Math.min(1, dt * k);
}

/** Puts a walker's model where it is, hopping when it goes. */
function pose(w: Walker, dt: number): void {
  const root = w.model.root;
  const moving = !!w.to;
  root.position.set(w.pos.x, moving ? hopLift(w.hop, HOP.height * 0.9) : 0, w.pos.z);
  root.scale.set(1, moving ? hopSquash(w.hop) : 1, 1);
  root.rotation.y = w.yaw;
  w.model.update(dt, 0);
}

function updateKing(ctx: Ctx, b: Built, dt: number, local: THREE.Vector3 | null, disco: boolean): void {
  const k = b.king;
  if (k.onBoard) return;
  if (k.to) {
    if (hopAlong(k, dt)) {
      k.to = null;
      const then = k.arrived;
      k.arrived = null;
      then?.();
      if (k.onBoard) return;
    }
  } else if (local && Math.hypot(local.x - k.pos.x, local.z - k.pos.z) < 12) turnTo(k, Math.atan2(local.x - k.pos.x, local.z - k.pos.z), dt, 4);
  else turnTo(k, k.homeYaw, dt, 2);
  const dance = disco && !k.to && !run;
  if (dance !== k.dancing) {
    k.dancing = dance;
    k.model.play(dance ? 'dance' : 'idle');
  }
  pose(k, dt);
}

function updateFolk(b: Built, dt: number, local: THREE.Vector3 | null, music: boolean): void {
  const taken = new Set(b.folk.map((f) => f.spot));
  for (const f of b.folk) {
    if (f.to && !music) {
      if (hopAlong(f, dt)) {
        f.to = null;
        f.wait = 2 + Math.random() * 5;
      }
    } else if (!f.to) {
      f.wait -= dt;
      const ways = b.ways[f.spot].filter((j) => !taken.has(j));
      if (f.wait <= 0 && !music && ways.length) {
        const j = ways[Math.floor(Math.random() * ways.length)];
        taken.delete(f.spot);
        taken.add(j);
        f.spot = j;
        const [x, z] = b.model.strolls[j];
        f.to = new THREE.Vector3(x, 0, z);
      } else if (local && Math.hypot(local.x - f.pos.x, local.z - f.pos.z) < 7) turnTo(f, Math.atan2(local.x - f.pos.x, local.z - f.pos.z), dt, 3);
    }
    if (music !== f.dancing) {
      f.dancing = music;
      f.model.play(music ? 'dance' : 'idle');
    }
    // a wave at the party coming near (once a visit to it)
    const d = local ? Math.hypot(local.x - f.pos.x, local.z - f.pos.z) : Infinity;
    if (d < 4.5 && !f.waved && !f.to) {
      f.waved = true;
      f.waveT = 2.2;
    } else if (d > 9) f.waved = false;
    const moving = !!f.to && !music;
    const keep = f.to;
    if (!moving) f.to = null;
    pose(f, dt);
    f.to = keep;
    if (f.waveT > 0) {
      f.waveT -= dt;
      waveArm(f.model.root, clock, Math.min(1, f.waveT * 2, (2.2 - f.waveT) * 3));
    }
  }
}

// ─── the map and the portal ──────────────────────────────────────────────────

/** The kingdom on the map once seen, met or rumoured; the rumour's arrow until the party gets there; a tap on it once met jumps there. */
function marks(ctx: Ctx): void {
  const k = siteOf(ctx);
  if (!k) return;
  const c = saveOf(ctx);
  const rumour = said(ctx, 'chess_rumour') && !said(ctx, 'chess_reached');
  const ex = exploredOf(ctx.save);
  if (rumour) ex.add(squareAround(chunkOf(k.x), chunkOf(k.z), 1));
  if (!c.met && !rumour && !ex.has(chunkOf(k.x), chunkOf(k.z))) {
    setMapMarker('k:chess', null);
    return;
  }
  setMapMarker('k:chess', { pos: { x: k.x + 0.5, z: k.z + 0.5 }, icon: 'cmap-chess', pointer: rumour, onTap: () => jump(ctx) });
}

function jump(ctx: Ctx): void {
  const k = siteOf(ctx);
  if (!k || !saveOf(ctx).met) return;
  if (!hasAbility(ctx, 'portal')) {
    voice.say('portal_soon', { priority: 7, interrupt: true });
    return;
  }
  const g = gateOf(k);
  void travelTo(ctx, g.pos, g.yaw);
}

function updatePortal(ctx: Ctx, b: Built, dt: number): void {
  const g = b.portal;
  const home = saveOf(ctx).met ? homeGate() : null;
  g.model.setOpen(home ? 1 : 0);
  g.model.update(dt);
  if (!home || !ctx.playing || ctx.sleeping) return;
  const inside = inGate(g, ctx.player.pos);
  if (!inside) {
    g.outFor += dt;
    if (g.outFor > 0.3) g.armed = true;
  } else g.outFor = 0;
  if (inside && g.armed) {
    g.armed = false;
    void travelTo(ctx, home.pos, home.yaw);
  }
}

// ─── «Великі шахи» in the world ──────────────────────────────────────────────

interface Big {
  s: Standing;
  play: BoardPlay;
  /** The puzzle shown: «day:n», or 'rest' once the day's five are done. */
  key: string;
  /** The next puzzle comes a moment after the last one is solved. */
  nextAt: number;
}

const bigs = new Map<Standing, Big>();
let bigHint = false;

function bigPieces(s: Standing): Partial<Record<PieceKind, THREE.Object3D>> {
  return s.model?.pieces ?? {};
}

/** A board shows the day's puzzle: its piece on the start, the coin on the goal. */
function setBig(ctx: Ctx, g: Big, key: string, p: PiecePuzzle | null): void {
  const was = g.key;
  g.key = key;
  g.play.stop();
  if (!p) return;
  const pieces = bigPieces(g.s);
  for (const [kind, obj] of Object.entries(pieces)) if (obj) obj.visible = kind === p.piece;
  const obj = pieces[p.piece];
  const character = obj?.userData.character as CharacterModel | undefined;
  if (!obj || !character) return;
  g.play.place({ kind: p.piece, model: character, drive: false }, p.start);
  g.play.aim('alone', p.goal, 'goal');
  if (was) {
    ctx.effects.poof(g.s.model!.root.localToWorld(obj.position.clone().setY(0.6)), 0xffe3a3, 10);
    sfx.play('poof', { volume: 0.5 });
  }
}

function updateBig(ctx: Ctx, dt: number): void {
  const list = standingWhere((c) => !!c.board);
  for (const s of [...bigs.keys()]) if (!list.includes(s)) bigs.delete(s);
  if (!list.length || !ctx.player) return;
  const c = saveOf(ctx);
  const day = ctx.save.day;
  if (c.big.day !== day) c.big = { day, n: 0 };
  const left = bigLeft(c, day);
  const key = left > 0 ? `${day}:${c.big.n}` : 'rest';
  const still = stillNow(ctx);
  let onAny = false;
  for (const s of list) {
    const m = s.model;
    if (!m?.board) continue;
    let g = bigs.get(s);
    if (!g) bigs.set(s, (g = { s, play: new BoardPlay(ctx, m.board, m.root), key: '', nextAt: 0 }));
    if (g.key !== key && clock >= g.nextAt) setBig(ctx, g, key, left > 0 ? bigPuzzle(day, c.big.n) : null);
    m.root.updateMatrixWorld();
    const local = ctx.playing && !ctx.sleeping ? m.root.worldToLocal(tmp.copy(ctx.player.pos)) : null;
    const on = local && Math.abs(local.y) < 1.2 && Math.hypot(local.x, local.z) < 6 ? local : null;
    if (on) onAny = true;
    for (const e of g.play.update(dt, { local: on, still })) {
      if (e.kind === 'hint' && !bigHint) {
        bigHint = true;
        voice.say('chess_hint', { priority: 7 });
      }
      if (e.kind !== 'goal') continue;
      if (c.big.day !== day) c.big = { day, n: 0 };
      c.big.n++;
      giveCoins(ctx, CHESS.bigCoins, m.root.localToWorld(m.board.cellPos(e.cell, new THREE.Vector3())));
      g.play.piece?.model.play('cheer');
      for (const o of bigs.values()) o.nextAt = clock + 1.4;
      if (bigLeft(c, day) === 0) setTimeout(() => voice.say('chess_big_done', { priority: 7 }), 900);
    }
  }
  if (!onAny) bigHint = false;
}

// ─── the loop ────────────────────────────────────────────────────────────────

export function initChess(ctx: Ctx): void {
  // the square keeps its ground from the kit (a building standing there goes back to the box)
  const k = siteOf(ctx);
  if (k) {
    const cells: [number, number][] = [];
    for (let lx = -CHESS_HALF; lx <= CHESS_HALF; lx++) for (let lz = -CHESS_HALF; lz <= CHESS_HALF; lz++) {
      const at = sitePos(k, lx, lz, tmp);
      cells.push([Math.floor(at.x), Math.floor(at.z)]);
    }
    reserveCells(cells);
  }
  events.on('hero:teleport', () => {
    if (built && run) finish(ctx, built, true);
  });
  // For automated checks.
  (window as unknown as { __kotoChess: object }).__kotoChess = {
    site: () => (k ? { ...k, centre: sitePos(k, 0, 0).toArray() } : null),
    get state() {
      const c = saveOf(ctx);
      const b = built;
      return {
        ...c,
        done: [...c.done],
        shown,
        built: !!b,
        run: run && { what: run.what, lesson: run.lesson, phase: run.phase, part: run.part, piece: run.piece.kind },
        play: b && { part: b.play.part, at: b.play.at, goal: b.play.goal, busy: b.play.busy, foes: b.play.foeCells, legal: b.play.legal() },
        king: b?.king.model.root.position.toArray().map((v) => +v.toFixed(2)) ?? null,
        gateShut: b?.gateShut ?? null,
        coins: ctx.save.coins,
        kit: ctx.save.kit[CHESS_PRIZE] ?? 0,
        sticker: ctx.save.found.includes('c:chess'),
        said: ctx.save.said.filter((s) => s.startsWith('chess') || s === 'ctop:chess'),
        bigSave: { ...c.big },
        big: [...bigs.values()].map((g) => ({ key: g.key, part: g.play.part, at: g.play.at, goal: g.play.goal, piece: g.play.piece?.kind ?? null, busy: g.play.busy, legal: g.play.legal() })),
        lines: [...lines],
      };
    },
    /** Puts the party by the king ('king'), up on the balcony ('top'), by the chest ('chest') or at kingdom-local (lx, lz) (no fade). */
    go: (where: 'king' | 'top' | 'chest' | [number, number] = 'king') => {
      if (!k) return;
      const b = built;
      let at: THREE.Vector3 | null = null;
      if (Array.isArray(where)) at = sitePos(k, where[0], where[1]);
      else if (where === 'king') at = sitePos(k, 5, 11);
      else if (b && where === 'top') at = b.top.clone();
      else if (b && where === 'chest')
        at = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dz]) => new THREE.Vector3(b.chestAt.x + dx * 1.2, b.top.y, b.chestAt.z + dz * 1.2))
          .filter((q) => !ctx.world.isSolid(Math.floor(q.x), Math.floor(q.y + 0.1), Math.floor(q.z)))
          .sort((q, r) => q.distanceTo(b.top) - r.distanceTo(b.top))[0] ?? b.top.clone();
      if (!at) return;
      for (const h of ctx.heroes.values()) {
        h.body.pos.set(at.x + (h === ctx.player ? 0 : 0.8), at.y + 0.2, at.z + (h === ctx.player ? 0 : 0.8));
        h.body.vel.set(0, 0, 0);
      }
      scanT = 0;
    },
    /** Puts the player (only) on a cell's middle: the kingdom's board, or with `big` the first «Великі шахи». */
    stand: (c: number, r: number, big = false) => {
      let at: THREE.Vector3 | null = null;
      if (big) {
        const g = [...bigs.values()][0];
        const m = g?.s.model;
        if (m?.board) at = m.root.localToWorld(m.board.cellPos({ c, r }, new THREE.Vector3()));
      } else if (built) at = built.model.root.localToWorld(built.model.board.cellPos({ c, r }, new THREE.Vector3()));
      if (!at) return;
      ctx.player.body.pos.set(at.x, at.y + 0.1, at.z);
      ctx.player.body.vel.set(0, 0, 0);
    },
    /** Where the kingdom's board and the first «Великі шахи» are on screen, for screenshots: the world point of a cell. */
    cell: (c: number, r: number, big = false) => {
      const g = [...bigs.values()][0];
      const m = big ? g?.s.model : built?.model;
      return m?.board ? m.root.localToWorld(m.board.cellPos({ c, r }, new THREE.Vector3())).toArray() : null;
    },
    /** Marks the first `n` lessons done (all: the gate opens), for checking a later lesson, the chest and the daily puzzle. */
    learn: (n = LESSONS.length) => {
      const c = saveOf(ctx);
      if (built && run) finish(ctx, built, true);
      c.met = true;
      c.done = LESSONS.slice(0, n);
      c.cur = null;
      c.got = 0;
    },
    chest: () => ctx.input.press('prompt:chest'),
    chestNear: () => chessChestNear(ctx),
    jump: () => jump(ctx),
    get clock() {
      return clock;
    },
  };
}

function scan(ctx: Ctx): void {
  const k = siteOf(ctx);
  if (!k) return;
  const p = ctx.playing ? ctx.player.pos : (ctx.house?.centre ?? ctx.camera.position);
  const d = Math.hypot(k.x + 0.5 - p.x, k.z + 0.5 - p.z);
  if (!shown && d < SHOW) {
    if (built) show(ctx, built);
    else if (!building) building = build(ctx, k);
  } else if (shown && built && d > HIDE) park(ctx, built);
  if (ctx.playing && d < CHESS.seen && !said(ctx, 'chess_seen')) {
    ctx.save.said.push('chess_seen');
    voice.say('chess_seen', { priority: 7 });
  }
  if (ctx.playing && d < NEAR && !said(ctx, 'chess_reached')) ctx.save.said.push('chess_reached');
  marks(ctx);
}

export function updateChess(ctx: Ctx, dt: number): void {
  clock += dt;
  scanT -= dt;
  if (scanT <= 0) {
    scanT = SCAN;
    scan(ctx);
  }
  if (building) {
    const step = building.next();
    if (step.done) {
      built = step.value;
      building = null;
      scanT = 0;
    }
  }
  if (ctx.playing) updateBig(ctx, dt);
  const b = built;
  if (!b || !shown) return;
  // Wholly out of the frame (from home it always is): left out of the drawing, its folk still,
  // until the party comes close enough to see it; nothing a child could see changes.
  const hidden = !run && outOfView(ctx.camera, b.centre, VIEW_RADIUS);
  if (hidden === b.model.root.visible) {
    for (const r of [b.model.root, b.portal.model.root, b.chest.root]) r.visible = !hidden;
  }
  if (hidden) return;
  const c = saveOf(ctx);
  const k = b.tick;
  const ease = (from: number, to: number) => from + Math.sign(to - from) * Math.min(Math.abs(to - from), dt * WAKE_RATE);
  const disco = musicNear(b.centre, DISCO_AT);
  k.night = 1 - ctx.clock.daylight;
  k.alive = ease(k.alive, chessAlive(c));
  k.open = ease(k.open, allDone(c) ? 1 : 0);
  k.beat = disco ? 1 - musicBeat() : 0;
  b.model.update(dt, k);
  // the stairs' gate lets the party through once it starts opening
  if (b.gateShut && allDone(c)) {
    b.gateShut = false;
    for (const [x, y, z] of b.gateCells) ctx.world.setBarrier?.(x, y, z, false);
  }
  pumpLines();
  const local = ctx.player ? b.model.root.worldToLocal(tmp.copy(ctx.player.pos)).clone() : null;
  updateKing(ctx, b, dt, local, disco);
  updateFolk(b, dt, local, disco);
  if (!ctx.player || !local) return;
  updatePortal(ctx, b, dt);
  if (ctx.playing && !ctx.sleeping) updatePlay(ctx, b, dt, local);
}

/** The beat's pulse, 1 on the beat falling to 0. */
const musicBeat = () => {
  const t = music.beat();
  return t - Math.floor(t);
};
