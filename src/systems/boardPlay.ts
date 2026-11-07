import * as THREE from 'three';
import type { BoardModel, GlowKind } from '../assets/chess';
import { HOP, hopLift, hopSquash } from '../assets/parts/chessman';
import type { CharacterModel } from '../contracts';
import {
  goesBack, help, movesOf, noHelp, picked, playBoard, sameCell, shortestPath, takes,
  type BoardState, type Cell, type Help, type PieceKind,
} from '../content/chess';
import type { Ctx } from '../core/ctx';
import { sfx } from '../voice/sfx';

/**
 * One living chess piece led over a board by the hero the child plays (DESIGN.md «Chess kingdom»):
 * the kingdom's lessons and the king's daily puzzle (systems/chess.ts), and «Великі шахи» from the kit.
 * Works on any BoardModel (assets/chess.ts) in the frame of the model that owns it: the pieces are
 * children of that frame and `board.cellPos` gives their spots. Helpers never count, only the hero.
 *   - «Дивись» (`show`): the piece hops to each cell and back, the cell lit (a pawn only lights them);
 *   - «Разом» (`aim('together')`): a star over the goal, every cell it may go to glows (a take coral);
 *     stepping onto a glowing cell moves the piece there with a click; other cells do nothing;
 *   - «Сам» (`aim('alone')`): no glow; stopping on a cell chooses it: the piece goes, or shakes its
 *     head with a soft «ні-ні» while its cells flash. Standing still brings the glow back softly, and
 *     later the next cell of the shortest way breathes brighter (any part), until the next move.
 * A black pawn taken giggles and hops off the board. It says nothing itself: what happens comes back
 * as PlayEvents, which the owner turns into words, coins and the save.
 */

export interface PlayPiece {
  kind: PieceKind;
  model: CharacterModel;
  /** False when another system already runs its animator (a kit building's own update). */
  drive: boolean;
}

export type PlayPart = 'together' | 'alone';

export type PlayEvent =
  | { kind: 'shown' }
  | { kind: 'moved'; to: Cell; took: boolean }
  | { kind: 'goal'; cell: Cell; moves: number }
  | { kind: 'wrong'; cell: Cell }
  | { kind: 'hint' };

/** The hero the child plays, as this board sees them this frame. */
export interface OnBoard {
  /** Feet in the board's frame; null when far away or not on the board's level. */
  local: THREE.Vector3 | null;
  /** No stick: standing still. */
  still: boolean;
}

type Steps = Generator<void, void, number>;

/** The cells flash this long after a wrong choice; the head shakes this long. */
const FLASH = 1.0;
const SHAKE = 0.75;
/** How fast a piece turns to the hero or to where it goes. */
const TURN = 7;

interface Foe {
  cell: Cell;
  piece: PlayPiece;
  gone: boolean;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** How fast the hero is slid off a standing piece (blocks a second): a gentle slide, never a jump. */
const PUSH = 2.5;
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
/** Ways to try when the way straight out is shut: the sides, then the corners. */
const AROUND: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

export class BoardPlay {
  piece: PlayPiece | null = null;
  at: Cell = { c: 0, r: 0 };
  part: 'idle' | 'show' | PlayPart = 'idle';
  goal: Cell | null = null;
  private mark: 'star' | 'goal' = 'star';
  private foes: Foe[] = [];
  private leaving: { piece: PlayPiece; g: Steps }[] = [];
  private run: { g: Steps; then: () => void } | null = null;
  private events: PlayEvent[] = [];
  private cell: Cell | null = null;
  private dwell = 0;
  private spent = false;
  private idle = 0;
  private help: Help = noHelp();
  private flash = 0;
  private shake = 0;
  private moves = 0;
  private glowKey = '';
  private faceYaw: number | null = null;
  /** The hero's spot last frame, and where they stood just before stepping into the cell they are on. */
  private last: THREE.Vector3 | null = null;
  private cameFrom: THREE.Vector3 | null = null;
  /** A cell's side in the frame (2 on the kingdom's board, 1 on «Великі шахи»). */
  readonly size: number;

  constructor(
    private ctx: Ctx,
    readonly board: BoardModel,
    readonly frame: THREE.Object3D,
  ) {
    this.size = board.cellPos({ c: 0, r: 0 }).distanceTo(board.cellPos({ c: 1, r: 0 }));
  }

  /** A move or the show is under way. */
  get busy(): boolean {
    return this.run !== null;
  }

  /** The cell under a frame-local point. */
  cellOf(local: THREE.Vector3 | null): Cell | null {
    return local ? this.board.cellAt(local.x, local.z) : null;
  }

  /** The black pawns still on the board. */
  get foeCells(): Cell[] {
    return this.foes.filter((f) => !f.gone).map((f) => f.cell);
  }

  private state(): BoardState {
    return playBoard(this.foeCells, this.goal, this.board.n);
  }

  /** Where the piece may go now. */
  legal(): Cell[] {
    return this.piece ? movesOf(this.piece.kind, this.at, this.state()) : [];
  }

  /** The piece that plays from now, standing on `at` (shown). */
  place(piece: PlayPiece, at: Cell): void {
    this.piece = piece;
    this.at = { ...at };
    const root = piece.model.root;
    this.board.cellPos(at, root.position);
    root.scale.set(1, 1, 1);
    root.visible = true;
  }

  /** Another piece takes this one's place (a pawn on the far row becomes a queen). */
  swap(piece: PlayPiece): void {
    const old = this.piece;
    if (old && old !== piece) old.model.root.visible = false;
    piece.model.root.rotation.y = old?.model.root.rotation.y ?? 0;
    this.place(piece, this.at);
  }

  /** The black pawns on the board (the ones there before leave it). */
  setFoes(list: readonly { cell: Cell; piece: PlayPiece }[]): void {
    for (const f of this.foes) if (!this.leaving.some((l) => l.piece === f.piece)) f.piece.model.root.visible = false;
    this.foes = list.map(({ cell, piece }) => {
      const root = piece.model.root;
      this.board.cellPos(cell, root.position);
      root.scale.set(1, 1, 1);
      root.visible = true;
      return { cell: { ...cell }, piece, gone: false };
    });
  }

  /** «Дивись»: the piece shows each cell (then once more while `more` says so); with no cells the black pawns light up instead. */
  show(cells: readonly Cell[], more: () => boolean): void {
    this.part = 'show';
    this.goal = null;
    this.board.marks([], null);
    this.setGlow([]);
    this.start(this.showSteps([...cells], more), () => {
      this.part = 'idle';
      this.setGlow([]);
      this.events.push({ kind: 'shown' });
    });
  }

  /** A goal in «Разом» or «Сам»: a star over it (`mark` 'goal': the board's own crown or coin). */
  aim(part: PlayPart, goal: Cell, mark: 'star' | 'goal' = 'star'): void {
    this.part = part;
    this.goal = { ...goal };
    this.mark = mark;
    this.moves = 0;
    this.idle = 0;
    this.help = noHelp();
    this.flash = 0;
    // a stop counts only once the hero has stepped
    this.spent = true;
    this.dwell = 0;
    this.board.marks(mark === 'star' ? [goal] : [], mark === 'goal' ? goal : null);
  }

  /** Nothing to play: no glow, no marks, a move cut short lands at once; the taken ones finish leaving. */
  stop(): void {
    const r = this.run;
    this.run = null;
    if (r && this.piece) {
      const root = this.piece.model.root;
      this.board.cellPos(this.at, root.position);
      root.scale.set(1, 1, 1);
    }
    this.faceYaw = null;
    this.part = 'idle';
    this.goal = null;
    this.help = noHelp();
    this.flash = 0;
    this.shake = 0;
    this.board.marks([], null);
    this.setGlow([]);
    for (const l of this.leaving) l.piece.model.root.visible = false;
    this.leaving = [];
  }

  /** One frame: the hero's choice, the piece's moves, the glows. Returns what happened. */
  update(dt: number, hero: OnBoard): PlayEvent[] {
    this.events = [];
    const cell = this.cellOf(hero.local);
    const entered = !(cell && this.cell ? sameCell(cell, this.cell) : cell === this.cell);
    if (entered || !hero.still) {
      this.dwell = 0;
      this.spent = false;
    } else this.dwell += dt;
    if (entered && this.last) this.cameFrom = this.last.clone();
    this.last = hero.local ? hero.local.clone() : null;
    this.cell = cell;
    this.flash = Math.max(0, this.flash - dt);
    this.shake = Math.max(0, this.shake - dt);

    this.step(dt);
    const part = this.part;
    if ((part === 'together' || part === 'alone') && !this.run && this.piece && this.goal) {
      this.idle = hero.still ? this.idle + dt : 0;
      const h = help(part, this.idle, this.help);
      if (h.hint && !this.help.hint) this.events.push({ kind: 'hint' });
      this.help = h;
      if (cell && picked(part, { cell, at: this.at, dwell: this.dwell, entered, spent: this.spent })) {
        if (this.legal().some((m) => sameCell(m, cell))) this.go(cell);
        else {
          this.spent = true;
          if (part === 'alone') this.wrong(cell);
        }
      }
    }
    this.glows();
    this.keepClear(dt, hero);
    this.animate(dt, hero);
    for (const l of [...this.leaving]) {
      if (!l.g.next(dt).done) continue;
      l.piece.model.root.visible = false;
      this.leaving.splice(this.leaving.indexOf(l), 1);
    }
    return this.events;
  }

  /**
   * The child always sees the piece: standing on its cell, the hero slides off it to the cell's edge
   * on the side they came from (still inside the same cell, so nothing is chosen by it), and helpers
   * keep a little further away. Not while the piece hops.
   */
  private keepClear(dt: number, hero: OnBoard): void {
    const p = this.piece;
    if (!p || this.run || !p.model.root.visible) return;
    const c = p.model.root.position;
    const s = this.size;
    const inner = s / 2 - 0.04;
    const cell = this.board.cellAt(c.x, c.z);
    const free = (x: number, z: number, y: number, mine: boolean) => {
      if (mine && !(cell && sameCell(this.board.cellAt(x, z) ?? { c: -1, r: -1 }, cell))) return false;
      const w = this.frame.localToWorld(tmp2.set(x, y, z));
      return !this.ctx.world.isSolid(Math.floor(w.x), Math.floor(w.y + 0.5), Math.floor(w.z));
    };
    for (const h of this.ctx.heroes.values()) {
      const mine = h === this.ctx.player;
      if (mine && !hero.local) continue;
      const l = this.frame.worldToLocal(tmp.copy(h.body.pos));
      if (Math.abs(l.y - c.y) > 1.5) continue;
      const near = mine ? 0.45 * s : 0.6 * s;
      let dx = l.x - c.x;
      let dz = l.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d >= near) continue;
      if (d < 0.05) {
        // right in the middle: back towards where they came from (a helper: any side)
        const f = mine ? this.cameFrom : null;
        dx = f ? f.x - c.x : 1;
        dz = f ? f.z - c.z : 0;
        if (Math.hypot(dx, dz) < 0.05) [dx, dz] = [1, 0];
      }
      const want = mine ? (s >= 2 ? 0.95 : 0.6) : 0.6 * s;
      const spot = (ux: number, uz: number): [number, number] => {
        const k = Math.hypot(ux, uz) || 1;
        let x = c.x + (ux / k) * want;
        let z = c.z + (uz / k) * want;
        // the hero stays in the piece's cell: pushed to its edge, never into the next one
        if (mine) [x, z] = [THREE.MathUtils.clamp(x, c.x - inner, c.x + inner), THREE.MathUtils.clamp(z, c.z - inner, c.z + inner)];
        return [x, z];
      };
      let to = spot(dx, dz);
      if (!free(to[0], to[1], l.y, mine)) {
        const side = AROUND.map(([ux, uz]) => spot(ux, uz)).find(([x, z]) => free(x, z, l.y, mine));
        if (!side) continue;
        to = side;
      }
      const mx = to[0] - l.x;
      const mz = to[1] - l.z;
      const m = Math.hypot(mx, mz);
      if (m < 1e-3) continue;
      const k = Math.min(m, PUSH * dt) / m;
      const w = this.frame.localToWorld(tmp2.set(l.x + mx * k, l.y, l.z + mz * k));
      h.body.pos.x = w.x;
      h.body.pos.z = w.z;
    }
  }

  // ─── moves ────────────────────────────────────────────────────────────────

  private start(g: Steps, then: () => void): void {
    this.run = { g, then };
    this.step(0);
  }

  private step(dt: number): void {
    const r = this.run;
    if (!r) return;
    if (r.g.next(dt).done && this.run === r) {
      this.run = null;
      r.then();
    }
  }

  private *wait(s: number): Steps {
    let t = 0;
    while (t < s) t += yield;
  }

  private *showSteps(cells: Cell[], more: () => boolean): Steps {
    const piece = this.piece;
    if (!piece) return;
    const home = { ...this.at };
    let pass = 0;
    do {
      if (!cells.length) {
        this.setGlow(this.foeCells.map((cell) => ({ cell, kind: 'take' as GlowKind })));
        yield* this.wait(1.6);
      }
      for (const c of cells) {
        this.setGlow([{ cell: c, kind: 'move' }]);
        yield* this.wait(0.3);
        if (goesBack(piece.kind)) {
          yield* this.moveTo(c);
          yield* this.wait(0.45);
          this.setGlow([]);
          yield* this.moveTo(home);
        } else yield* this.wait(0.8);
        this.setGlow([]);
        yield* this.wait(0.35);
      }
      pass++;
    } while (more() && pass < 6);
  }

  /** To `to`: a hop a cell (king, pawn), one big jump (knight), a quick slide with little hops (rook, bishop, queen). */
  private *moveTo(to: Cell): Steps {
    const piece = this.piece;
    if (!piece) return;
    const root = piece.model.root;
    const from = root.position.clone();
    const dest = this.board.cellPos(to, new THREE.Vector3());
    const cells = Math.max(1, Math.abs(to.c - this.at.c), Math.abs(to.r - this.at.r));
    const s = this.size;
    const big = Math.max(1, s * 0.75);
    let hops = cells;
    let dur = HOP.time * cells;
    let lift = HOP.height * big;
    let glide = false;
    if (piece.kind === 'knight') {
      hops = 1;
      dur = 0.6;
      lift = 0.9 * big;
    } else if (piece.kind === 'rook' || piece.kind === 'bishop' || piece.kind === 'queen') {
      dur = 0.14 + 0.07 * cells * s;
      lift = 0.12 * s;
      glide = true;
    }
    this.faceYaw = Math.atan2(dest.x - from.x, dest.z - from.z);
    let t = 0;
    while (t < dur) {
      t += yield;
      const u = Math.min(1, t / dur);
      root.position.lerpVectors(from, dest, glide ? u * u * (3 - 2 * u) : u);
      const hu = u >= 1 ? 1 : (u * hops) % 1;
      root.position.y = dest.y + hopLift(hu, lift);
      root.scale.y = hopSquash(hu);
    }
    root.position.copy(dest);
    root.scale.set(1, 1, 1);
    this.faceYaw = null;
    this.at = { ...to };
    sfx.play('click', { pitch: 0.7, volume: 0.8 });
  }

  private go(to: Cell): void {
    const took = takes(to, this.state());
    this.moves++;
    this.idle = 0;
    this.help = noHelp();
    this.flash = 0;
    this.start(this.moveTo(to), () => {
      if (took) this.take(to);
      this.events.push({ kind: 'moved', to: { ...to }, took });
      if (this.goal && sameCell(this.goal, to)) this.reach();
    });
  }

  private wrong(cell: Cell): void {
    this.shake = SHAKE;
    this.flash = FLASH;
    sfx.play('nope');
    this.events.push({ kind: 'wrong', cell: { ...cell } });
  }

  /** The goal reached: its star pops (the crown and the coin are the owner's to give). */
  private reach(): void {
    const g = this.goal!;
    const at = this.frame.localToWorld(this.board.cellPos(g, new THREE.Vector3()).setY(this.size * 0.75));
    this.ctx.effects.sparkle(at, 0xffd23a);
    this.ctx.effects.poof(at, 0xffd23a, 14);
    if (this.mark === 'star') sfx.play('sticker', { pitch: 1.5, volume: 0.7 });
    this.board.marks([], null);
    this.events.push({ kind: 'goal', cell: { ...g }, moves: this.moves });
    this.part = 'idle';
    this.goal = null;
    this.help = noHelp();
  }

  /** A black pawn is taken: it giggles, hops off the side of the board and is gone. */
  private take(cell: Cell): void {
    const f = this.foes.find((x) => !x.gone && sameCell(x.cell, cell));
    if (!f) return;
    f.gone = true;
    sfx.play('giggle');
    f.piece.model.play('happy');
    this.leaving.push({ piece: f.piece, g: this.hopOff(f) });
  }

  private *hopOff(f: Foe): Steps {
    const n = this.board.n;
    const root = f.piece.model.root;
    // it rises out of the way first, then off the nearer side in three hops
    yield* this.wait(0.15);
    const from = root.position.clone();
    const dest = this.board.cellPos({ c: f.cell.c < n / 2 ? -1.2 : n + 0.2, r: f.cell.r }, new THREE.Vector3());
    const lift = HOP.height * Math.max(1, this.size * 0.75) * 1.3;
    const dur = 1.0;
    let t = 0;
    while (t < dur) {
      t += yield;
      const u = Math.min(1, t / dur);
      root.position.lerpVectors(from, dest, u);
      const hu = u >= 1 ? 1 : (u * 3) % 1;
      root.position.y = dest.y + hopLift(hu, lift);
      root.scale.y = hopSquash(hu);
      root.rotation.y = Math.atan2(dest.x - from.x, dest.z - from.z);
    }
    root.scale.set(1, 1, 1);
    this.ctx.effects.poof(this.frame.localToWorld(dest.clone().setY(dest.y + 0.5)), 0x4a2c14, 10);
    sfx.play('poof', { volume: 0.5 });
  }

  // ─── the look ─────────────────────────────────────────────────────────────

  private setGlow(list: { cell: Cell; kind: GlowKind }[]): void {
    const key = list.map((g) => `${g.cell.c},${g.cell.r},${g.kind}`).join(';');
    if (key === this.glowKey) return;
    this.glowKey = key;
    this.board.glow(list);
  }

  private glows(): void {
    const part = this.part;
    if (part === 'show') return;
    const list: { cell: Cell; kind: GlowKind }[] = [];
    if ((part === 'together' || part === 'alone') && this.piece && !this.run) {
      const st = this.state();
      if (this.help.glow || this.flash > 0) for (const m of movesOf(this.piece.kind, this.at, st)) list.push({ cell: m, kind: takes(m, st) ? 'take' : 'move' });
      const next = this.help.hint && this.goal ? shortestPath(this.piece.kind, this.at, this.goal, st)?.[0] : undefined;
      if (next) {
        const i = list.findIndex((g) => sameCell(g.cell, next));
        if (i >= 0) list.splice(i, 1);
        list.push({ cell: next, kind: 'hint' });
      }
    }
    this.setGlow(list);
  }

  /** Every piece on the board looks at the hero (or where it goes), breathes and blinks; the one that said no shakes its head. */
  private animate(dt: number, hero: OnBoard): void {
    const live = [...(this.piece ? [this.piece] : []), ...this.foes.filter((f) => !f.gone).map((f) => f.piece), ...this.leaving.map((l) => l.piece)];
    for (const p of live) {
      const root = p.model.root;
      if (!root.visible) continue;
      const leaving = this.leaving.some((l) => l.piece === p);
      let yaw: number | null = null;
      if (p === this.piece && this.faceYaw !== null) yaw = this.faceYaw;
      else if (!leaving && hero.local) yaw = Math.atan2(hero.local.x - root.position.x, hero.local.z - root.position.z);
      if (yaw !== null) root.rotation.y += wrap(yaw - root.rotation.y) * Math.min(1, dt * TURN);
      if (p.drive) p.model.update(dt, 0);
      if (p === this.piece && this.shake > 0) {
        const head = root.getObjectByName('head');
        const k = this.shake / SHAKE;
        if (head) head.rotation.y += Math.sin((SHAKE - this.shake) * 24) * 0.6 * k;
      }
    }
  }
}
