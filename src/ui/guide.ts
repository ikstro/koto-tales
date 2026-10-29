import type { LineId } from '../content/lines';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { Piece, TOP, ninePlate } from './hud';
import { SPRITES, type SpriteName } from './hudSprites';

/**
 * The picture guide (DESIGN.md «Guide»): cards built from the HUD's own pieces and the game's
 * renders, each with a voiced line played on a tap. Opened by the «?» piece in the pause menu;
 * the boss card alone pops up the first time a save walks into the boss's wasteland.
 * Captions are short and only for parents — the pictures and the voice do the explaining.
 */

export type GuideCard = 'move' | 'bow' | 'jump' | 'bolt' | 'build' | 'heal' | 'map' | 'portal' | 'sleep' | 'power' | 'lighthouse' | 'disco' | 'defense' | 'village' | 'castle' | 'signal' | 'food' | 'station' | 'boss';

interface CardSpec {
  id: GuideCard;
  line: LineId;
  caption: string;
  /** Columns the card spans. */
  span: 1 | 2;
  /** Lays the picture's pieces out in free design px; the card fits them into its window. */
  art: (a: Art) => void;
}

const CELL_W = 204;
const CELL_H = 184;
const GAP = 16;
const PAD_X = 36;
const PAD_TOP = 40;
const PAD_BOTTOM = 44;
/** The picture window inside a card (the caption sits under it). */
const PIC_X = 14;
const PIC_TOP = 12;
const PIC_BOTTOM = 42;

/** Pieces placed (and scaled) in a card's picture; tracks the union of what is drawn. */
class Art {
  readonly el = document.createElement('div');
  readonly box = [Infinity, Infinity, -Infinity, -Infinity];
  readonly pieces: Piece[] = [];

  constructor() {
    this.el.className = 'gd-art';
  }

  put(name: SpriteName, x: number, y: number, s = 1, shadow?: SpriteName | null): Piece {
    const holder = document.createElement('div');
    holder.className = 'gd-h';
    holder.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    this.el.appendChild(holder);
    const sh = shadow === undefined ? (`${name}-sh` in SPRITES ? (`${name}-sh` as SpriteName) : null) : shadow;
    const p = new Piece(holder, name, 0, 0, sh);
    const [x0, y0, x1, y1] = p.bounds();
    this.box[0] = Math.min(this.box[0], x + x0 * s);
    this.box[1] = Math.min(this.box[1], y + y0 * s);
    this.box[2] = Math.max(this.box[2], x + x1 * s);
    this.box[3] = Math.max(this.box[3], y + y1 * s);
    this.pieces.push(p);
    return p;
  }

  /** Centres and scales the drawing into a w × h window at (left, top). */
  fit(left: number, top: number, w: number, h: number, max = 1.15): void {
    const [x0, y0, x1, y1] = this.box;
    const s = Math.min(max, w / (x1 - x0), h / (y1 - y0));
    const ox = left + (w - (x1 - x0) * s) / 2 - x0 * s;
    const oy = top + (h - (y1 - y0) * s) / 2 - y0 * s;
    this.el.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px) scale(${s.toFixed(4)})`;
  }
}

/** A coral wedge between the steps of the boss strip, pointing right. */
function step(a: Art, x: number, y: number): void {
  const p = a.put('map-arrow', x, y, 1.3, null);
  p.img.style.transform = 'rotate(90deg)';
}

const CARDS: CardSpec[] = [
  {
    id: 'move',
    line: 'guide_move',
    caption: 'Біжи',
    span: 1,
    art: (a) => {
      a.put('joy-plate', 0, 0);
      // the knob pushed towards the upper right, as a finger drags it
      a.put('joy-knob', 46, -TOP - 22);
    },
  },
  {
    id: 'bow',
    line: 'guide_bow',
    caption: 'Стріляй',
    span: 1,
    art: (a) => {
      a.put('bow', -60, 0, 1, 'big-sh');
      a.put('mark-monster', 80, -8, 1.5);
    },
  },
  {
    id: 'jump',
    line: 'guide_jump',
    caption: 'Стрибок',
    span: 1,
    art: (a) => {
      // the spring piece → the hero up in the air (no shadow under it: it is off the ground)
      a.put('jump', -100, 0, 1, 'tile6-sh');
      step(a, 0, -14);
      a.put('hero-lyosha', 100, -44, 1.05, null);
    },
  },
  {
    id: 'bolt',
    line: 'guide_bolt',
    caption: 'Блискавка',
    span: 1,
    art: (a) => {
      // the charge ring half lit: the lightning is getting ready again
      const ring = a.put('ring', 0, 0);
      for (let i = 0; i < 5; i++) ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit');
      const bolt = a.put('bolt-empty', 0, -TOP, 1, 'tile6-sh');
      bolt.layer('bolt').style.clipPath = 'inset(38% 0 0 0)';
    },
  },
  {
    id: 'build',
    line: 'guide_build',
    caption: 'Будівлі',
    span: 1,
    art: (a) => {
      // the kit box on its stud ring, and what comes out of it
      const ring = a.put('ring', -120, 0);
      for (let i = 0; i < 3; i++) ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit');
      a.put('kit', -120, -TOP);
      step(a, 2, -14);
      a.put('b-tent', 120, 0, 0.85);
    },
  },
  {
    id: 'heal',
    line: 'guide_heal',
    caption: 'Сили',
    span: 1,
    art: (a) => {
      a.put('apple', -100, 0, 1.1);
      a.put('heart', 0, -12, 1.3);
      a.put('map-house', 100, 0, 1.1);
    },
  },
  {
    id: 'map',
    line: 'guide_map',
    caption: 'Карта',
    span: 1,
    art: (a) => {
      a.put('map-plate', 0, 0);
      a.put('map-house', -34, -TOP - 2, 0.75);
      a.put('mark-lyosha', 4, -TOP + 4, 0.7);
      // the boss far away: its tile on the rim, the coral arrow pointing the way
      const arrow = a.put('map-arrow', 44, -TOP - 2, 1.1, null);
      arrow.img.style.transform = 'rotate(90deg)';
      a.put('boss', 88, -TOP - 2, 0.8);
    },
  },
  {
    id: 'portal',
    line: 'guide_portal',
    caption: 'Портал',
    span: 1,
    art: (a) => {
      a.put('map-house', -110, 0, 1.3);
      step(a, 0, -14);
      a.put('b-portal', 110, 0, 0.8);
    },
  },
  {
    id: 'sleep',
    line: 'guide_sleep',
    caption: 'Сон',
    span: 1,
    art: (a) => {
      a.put('moon', -100, -8, 1, 'tile6-sh');
      a.put('b-tent', 90, 0, 0.8);
    },
  },
  {
    id: 'power',
    line: 'guide_power',
    caption: 'Струм',
    span: 1,
    art: (a) => {
      // the windmill gives, a pole carries it on, the lamp lights
      a.put('b-windmill', -125, 4, 1.35);
      a.put('b-pole', 0, 4, 1.35);
      a.put('b-lamp', 120, 4, 1.35);
    },
  },
  {
    id: 'lighthouse',
    line: 'guide_lighthouse',
    caption: 'Маяк',
    span: 1,
    art: (a) => {
      a.put('b-windmill', -110, 4, 1.35);
      step(a, 0, -14);
      a.put('task-lighthouse', 110, -8, 1.1, 'tile6-sh');
    },
  },
  {
    id: 'disco',
    line: 'guide_disco',
    caption: 'Дискотека',
    span: 1,
    art: (a) => {
      a.put('b-bigspeaker', -130, 4, 1.2);
      a.put('b-dancefloor', 0, 4, 1.05);
      a.put('note', 120, -8, 0.95, 'tile6-sh');
    },
  },
  {
    id: 'defense',
    line: 'guide_defense',
    caption: 'Захист',
    span: 1,
    art: (a) => {
      a.put('b-tesla', -80, 4, 1.3);
      a.put('b-trafficlight', 80, 4, 1.3);
    },
  },
  {
    id: 'village',
    line: 'guide_village',
    caption: 'Село',
    span: 1,
    art: (a) => {
      // the elder asks, the party helps, the village gives its building
      a.put('folk-elves', -125, -8, 1.05, 'tile-sh');
      a.put('item-elves', 0, -8, 0.85, 'tile6-sh');
      a.put('b-garland', 120, 4, 1.1);
    },
  },
  {
    id: 'castle',
    line: 'guide_castle',
    caption: 'Замок',
    span: 2,
    art: (a) => {
      // 1. monsters round the castle → 2. the castle alive, the gate open → 3. the prize from the chest up top
      a.put('mark-monster', -300, 4, 1.5);
      a.put('mark-monster', -235, -10, 1.2);
      step(a, -150, -14);
      a.put('castle-elves', -20, 0, 1.25, 'tile-sh');
      step(a, 100, -14);
      a.put('b-treehouse', 220, 4, 1.1);
    },
  },
  {
    id: 'signal',
    line: 'guide_signal',
    caption: 'Сигнал',
    span: 2,
    art: (a) => {
      // the antenna → its remote (the night show) · a transmitter → its mark on the map
      a.put('b-wifi', -300, 4, 1.2);
      step(a, -215, -14);
      a.put('remote', -130, -8, 1, 'tile6-sh');
      a.put('b-transmitter', 60, 4, 1.15);
      step(a, 150, -14);
      a.put('map-transmitter', 230, -8, 1.3);
    },
  },
  {
    id: 'food',
    line: 'guide_food',
    caption: 'Їжа',
    span: 1,
    art: (a) => {
      // the picnic → its apple piece → full hearts
      a.put('b-picnic', -110, 4, 1.15);
      a.put('food', 10, -8, 1, 'tile6-sh');
      a.put('heart', 115, -12, 1.3);
    },
  },
  {
    id: 'station',
    line: 'guide_station',
    caption: 'Електростанція',
    span: 1,
    art: (a) => {
      // the station lights lamps far around it
      a.put('b-station', -95, 4, 1.25);
      step(a, 10, -14);
      a.put('b-lamp', 115, 4, 1.35);
    },
  },
  {
    id: 'boss',
    line: 'guide_boss',
    caption: 'Пожирач земель',
    span: 2,
    art: (a) => {
      // 1. three lanterns by it → 2. its stone armour cracks → 3. an arrow into the open, glowing mouth
      for (let i = 0; i < 3; i++) a.put('lamp-on', -330 + i * 62, 6 - (i % 2) * 10, 2.3);
      step(a, -150, -14);
      a.put('boss-cracked', -40, 0, 0.82);
      step(a, 74, -14);
      a.put('boss-open', 196, 0, 0.82, 'boss-cracked-sh');
    },
  },
];

interface CardView {
  spec: CardSpec;
  el: HTMLDivElement;
  art: Art;
}

export class Guide {
  readonly root = document.createElement('div');
  private onClose: (() => void) | null = null;
  private only: GuideCard | null = null;
  private openedAt = 0;

  constructor(
    parent: HTMLElement,
    /** Scale of the HUD's top pieces (k = u / 80), read at open. */
    private pieceScale: () => number,
  ) {
    this.root.className = 'guide hidden';
    this.root.addEventListener('pointerdown', (e) => {
      // a tap outside the plate closes; with the single boss card any tap continues
      if (e.target === this.root || (this.only && performance.now() - this.openedAt > 500)) {
        e.preventDefault();
        this.close();
      }
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** All cards (`only` null) or one card by itself with a ▶ to continue; `onClose` runs when it shuts. */
  open(only: GuideCard | null, onClose: () => void): void {
    if (this.isOpen) return;
    this.only = only;
    this.onClose = onClose;
    this.openedAt = performance.now();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const specs = only ? CARDS.filter((c) => c.id === only) : CARDS;
    const cols = only ? 2 : W >= H ? 4 : 2;

    // grid: cards fill rows left to right; a wide card takes two cells
    const cells: { spec: CardSpec; col: number; row: number }[] = [];
    let col = 0;
    let row = 0;
    for (const spec of specs) {
      if (col + spec.span > cols) {
        col = 0;
        row++;
      }
      cells.push({ spec, col, row });
      col += spec.span;
    }
    const rows = row + 1;
    const gridW = cols * CELL_W + (cols - 1) * GAP;
    const extra = only ? 150 : 0; // room for the ▶ next to the single card
    const pw = gridW + 2 * PAD_X + extra;
    const ph = rows * CELL_H + (rows - 1) * GAP + PAD_TOP + PAD_BOTTOM;

    const k = this.pieceScale();
    const s = Math.min(k * 1.15, (W - 24) / (pw + 16), (H - 24) / (ph + 20));
    const panel = document.createElement('div');
    panel.className = 'gd-panel';
    panel.style.transform = `translate(${Math.round((W - (pw + 16) * s) / 2)}px, ${Math.round((H - (ph + 20) * s) / 2)}px) scale(${s.toFixed(4)})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    const views: CardView[] = [];
    for (const c of cells) {
      const w = c.spec.span * CELL_W + (c.spec.span - 1) * GAP;
      const x = PAD_X + c.col * (CELL_W + GAP);
      const y = PAD_TOP + c.row * (CELL_H + GAP);
      views.push(this.card(panel, c.spec, x, y, w, CELL_H));
    }

    let drops: Piece[] = [];
    if (only) {
      const play = new Piece(panel, 'play', pw - PAD_X - 66, ph / 2 + 4, 'big-sh');
      play.target(124).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        play.el.classList.add('down');
        this.close();
      });
      drops = [play];
      voice.say(views[0].spec.line, { priority: 9, interrupt: true });
    } else {
      const close = new Piece(panel, 'close', pw - 24, 34, 'tile6-sh');
      close.target(104).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close.el.classList.add('down');
        this.close();
      });
      drops = [close];
    }

    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    sfx.play('sticker');
    views.forEach((v, i) => v.art.pieces.forEach((p, j) => p.drop(60 + i * 45 + j * 25, 30)));
    drops.forEach((p) => p.drop(160, 40));
  }

  private card(panel: HTMLElement, spec: CardSpec, x: number, y: number, w: number, h: number): CardView {
    const el = document.createElement('div');
    el.className = 'gd-card';
    el.style.transform = `translate(${x}px, ${y}px)`;
    panel.appendChild(el);
    const press = document.createElement('div');
    press.className = 'gd-press';
    el.appendChild(press);
    // the flat card is one baked tile stretched (no studs to keep round, and no nine-slice seams)
    const sh = document.createElement('div');
    sh.className = 'nine-sh';
    sh.style.cssText = `left:8px;top:10px;width:${w - 12}px;height:${h - 20}px`;
    const tile = document.createElement('img');
    tile.className = 'sp';
    tile.alt = '';
    tile.draggable = false;
    tile.src = `${import.meta.env.BASE_URL}hud/card9.png`;
    tile.style.cssText = `left:0;top:0;width:${w}px;height:${h - 6}px`;
    press.append(sh, tile);

    const art = new Art();
    spec.art(art);
    art.fit(PIC_X, PIC_TOP, w - 2 * PIC_X, h - PIC_TOP - PIC_BOTTOM);
    press.appendChild(art.el);

    const cap = document.createElement('div');
    cap.className = 'gd-cap';
    cap.textContent = spec.caption;
    cap.style.cssText = `width:${w}px;top:${h - PIC_BOTTOM + 4}px`;
    press.appendChild(cap);

    const hit = document.createElement('button');
    hit.type = 'button';
    hit.className = 'gd-hit';
    hit.style.cssText = `width:${w}px;height:${h}px`;
    el.appendChild(hit);
    hit.addEventListener('pointerdown', (e) => {
      if (this.only) return; // the single card: any tap continues (handled by the root)
      e.preventDefault();
      e.stopPropagation();
      this.play(spec, press, art);
    });
    return { spec, el, art };
  }

  /** A tap on a card: it sinks one stud, the picture hops, the line is spoken. */
  private play(spec: CardSpec, press: HTMLElement, art: Art): void {
    sfx.play('click');
    voice.say(spec.line, { priority: 9, interrupt: true });
    press.animate([{ transform: 'translateY(6px)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    art.pieces.forEach((p, i) => setTimeout(() => p.bump('translateY(-12px) scale(1.08)'), i * 60));
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
    sfx.play('click');
    const cb = this.onClose;
    this.onClose = null;
    this.only = null;
    cb?.();
  }
}
