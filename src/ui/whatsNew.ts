import type { NewThing } from '../content/whatsNew';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { Art } from './guide';
import { Piece, ninePlate } from './hud';
import type { SpriteName } from './hudSprites';

/**
 * «Що нового» (DESIGN.md «What's new»): the plate the gift piece opens after an update. One picture
 * card per new thing, built like the picture guide's (ui/guide.ts: the same card tile, the same
 * pieces, a short caption for the parents); a tap hops the picture and Пупся says what it is and
 * where to find it. Coral ✕ or a tap outside closes it; the game stays paused meanwhile.
 */

const CELL_W = 204;
const CELL_H = 184;
const GAP = 16;
const PAD_X = 36;
const PAD_TOP = 40;
const PAD_BOTTOM = 44;
const PIC_X = 14;
const PIC_TOP = 12;
const PIC_BOTTOM = 42;

/** A coral wedge between two pictures, pointing right. */
function step(a: Art, x: number, y: number): void {
  const p = a.put('map-arrow', x, y, 1.1, null);
  p.img.style.transform = 'rotate(90deg)';
}

/** Pictures with more than the thing itself; the rest show their `pic` alone. */
const ART: Record<string, (a: Art) => void> = {
  flight: (a) => {
    // the house up among the cream clouds
    a.put('new-bhouse', 0, -16, 1.6);
    a.put('cloud', -120, 40, 1.0);
    a.put('cloud', 120, 46, 1.0);
    a.put('cloud', 0, 62, 1.1);
  },
  sirko: (a) => {
    a.put('b-doghouse', -70, 4, 1.4);
    a.put('new-sirko', 75, -8, 0.9, 'tile6-sh');
    a.put('coin', 150, -54, 0.7);
  },
  postbox: (a) => {
    a.put('new-postbox', -40, 4, 1.35);
    a.put('tale-plane', 80, -30, 0.8, 'tile6-sh');
  },
  guests: (a) => {
    a.put('new-campfire', -40, 4, 1.4);
    a.put('folk-elves', 105, -24, 0.9, 'tile-sh');
  },
  pantry: (a) => {
    a.put('item-berry', -125, -10, 0.85, 'tile6-sh');
    a.put('item-honey', -45, -40, 0.85, 'tile6-sh');
    step(a, 30, -14);
    a.put('ask-pot', 115, -4, 1.1, 'tile6-sh');
  },
  news: (a) => {
    a.put('new-tv', -40, 4, 1.35);
    a.put('mark-monster', 95, -60, 1.3);
  },
  bighouse: (a) => {
    a.put('map-house', -70, 0, 1.8);
    a.put('new-slide', 95, 4, 1.1);
  },
  hometv: (a) => {
    a.put('map-house', -80, 0, 1.5);
    a.put('new-tv', 70, 4, 1.2);
  },
};

export class WhatsNewPlate {
  readonly root = document.createElement('div');
  private onClose: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    /** Scale of the HUD's top pieces (k = u / 80), read at open. */
    private pieceScale: () => number,
  ) {
    this.root.className = 'guide whatsnew hidden';
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target !== this.root) return;
      e.preventDefault();
      this.close();
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(things: NewThing[], onClose: () => void): void {
    if (this.isOpen || !things.length) return;
    this.onClose = onClose;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cols = Math.min(things.length, W >= H ? 4 : 2);
    const rows = Math.ceil(things.length / cols);
    const pw = cols * CELL_W + (cols - 1) * GAP + 2 * PAD_X;
    const ph = rows * CELL_H + (rows - 1) * GAP + PAD_TOP + PAD_BOTTOM;
    const s = Math.min(this.pieceScale() * 1.15, (W - 24) / (pw + 16), (H - 24) / (ph + 20));

    const panel = document.createElement('div');
    panel.className = 'gd-panel';
    panel.style.transform = `translate(${Math.round((W - (pw + 16) * s) / 2)}px, ${Math.round((H - (ph + 20) * s) / 2)}px) scale(${s.toFixed(4)})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    const arts: Art[] = [];
    things.forEach((t, i) => {
      // the last row is centred when it is not full
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? things.length - row * cols : cols;
      const shift = ((cols - inRow) * (CELL_W + GAP)) / 2;
      arts.push(this.card(panel, t, PAD_X + shift + (i % cols) * (CELL_W + GAP), PAD_TOP + row * (CELL_H + GAP)));
    });

    const close = new Piece(panel, 'close', pw - 24, 34, 'tile6-sh');
    close.target(104).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close.el.classList.add('down');
      this.close();
    });

    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    sfx.play('sticker');
    arts.forEach((a, i) => a.pieces.forEach((p, j) => p.drop(60 + i * 45 + j * 25, 30)));
    close.drop(160, 40);
  }

  private card(panel: HTMLElement, t: NewThing, x: number, y: number): Art {
    const w = CELL_W;
    const h = CELL_H;
    const el = document.createElement('div');
    el.className = 'gd-card';
    el.style.transform = `translate(${x}px, ${y}px)`;
    panel.appendChild(el);
    const press = document.createElement('div');
    press.className = 'gd-press';
    el.appendChild(press);
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
    const draw = ART[t.id];
    if (draw) draw(art);
    else art.put(t.pic as SpriteName, 0, 0);
    art.fit(PIC_X, PIC_TOP, w - 2 * PIC_X, h - PIC_TOP - PIC_BOTTOM);
    press.appendChild(art.el);

    const cap = document.createElement('div');
    cap.className = 'gd-cap';
    cap.textContent = t.caption;
    cap.style.cssText = `width:${w}px;top:${h - PIC_BOTTOM + 4}px`;
    press.appendChild(cap);

    const hit = document.createElement('button');
    hit.type = 'button';
    hit.className = 'gd-hit';
    hit.style.cssText = `width:${w}px;height:${h}px`;
    el.appendChild(hit);
    hit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfx.play('click');
      voice.say(t.line, { priority: 9, interrupt: true });
      press.animate([{ transform: 'translateY(6px)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      art.pieces.forEach((p, i) => setTimeout(() => p.bump('translateY(-12px) scale(1.08)'), i * 60));
    });
    return art;
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
    sfx.play('click');
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
