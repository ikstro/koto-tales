import type { ItemId } from '../contracts';
import { canCook, type RecipeCard } from '../content/recipes';
import { sfx } from '../voice/sfx';
import { Piece, TOP, ninePlate } from './hud';
import type { SpriteName } from './hudSprites';
import type { Portraits } from './portraits';

const CELL = 170;
const PAD = 54;
const HEAD = 96;
/** Bigger than the album: six cards a child picks a dish from. */
const BOOK_SIZE = 1.4;
/** Two small products under each dish. */
const SMALL = 0.5;

/**
 * The book of recipes (DESIGN.md «Kitchen»): a studded plate, a card per dish of the hostess at
 * home, the dish's picture and its two products under it. Enough of them: bright; otherwise pale,
 * and a tap says what is missing. No words.
 */
export class CookBook {
  private root = document.createElement('div');
  onClose: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private portraits: Portraits,
  ) {
    this.root.className = 'album hidden';
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(list: readonly RecipeCard[], inv: Partial<Record<ItemId, number>>, onPick: (r: RecipeCard) => void): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--hud-k')) || 0.85;
    const cols = W >= H ? 3 : 2;
    const rows = Math.ceil(list.length / cols);
    const pw = PAD * 2 + cols * CELL;
    const ph = HEAD + rows * CELL + 30;
    const s = Math.min(k * BOOK_SIZE, (W - 20) / (pw + 16), (H - 20) / (ph + 20));

    const panel = document.createElement('div');
    panel.className = 'alb-panel';
    panel.style.transform = `translate(${Math.round((W - pw * s) / 2)}px, ${Math.round((H - ph * s) / 2)}px) scale(${s.toFixed(4)})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    new Piece(panel, 'ask-pot', 82, 78, 'tile6-sh');
    const close = new Piece(panel, 'close', pw - 70, 74, 'tile6-sh');
    close.target(104).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close.el.classList.add('down');
      this.close();
    });

    const pieces: Piece[] = [close];
    list.forEach((r, i) => {
      const x = PAD + CELL * ((i % cols) + 0.5);
      const y = HEAD + CELL * Math.floor(i / cols) + CELL * 0.46;
      const ready = canCook(r, inv);
      const p = new Piece(panel, ready ? 'sticker-on' : 'sticker-off', x, y, ready ? 'sticker-sh' : null);
      p.el.classList.add(ready ? 'got' : 'missing', 'recipe');
      const pic = document.createElement('img');
      pic.className = 'stk-img';
      pic.src = this.portraits.items[r.dish as ItemId];
      pic.alt = '';
      pic.draggable = false;
      pic.style.top = `${-TOP - 58}px`;
      p.pr.appendChild(pic);
      const left = { ...inv };
      r.needs.forEach((item, n) => {
        const have = (left[item] ?? 0) > 0;
        if (have) left[item]!--;
        const small = document.createElement('img');
        small.className = `stk-img recipe-need${have ? ' have' : ''}`;
        small.src = this.portraits.items[item];
        small.alt = '';
        small.draggable = false;
        small.style.cssText = `top:${-TOP - 4}px;left:${-46 + (n ? 28 : -28)}px;transform:scale(${SMALL})`;
        p.pr.appendChild(small);
      });
      p.target(CELL - 8, CELL - 8, 8).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        p.bump('translateY(-10px) scale(1.08)');
        onPick(r);
      });
      pieces.push(p);
    });

    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    pieces.forEach((p, i) => p.drop(i * 28, 40));
    sfx.play('sticker');
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    sfx.play('click');
    this.onClose?.();
  }

  /** Closed by a pick: no click on top of the choice. */
  hide(): void {
    this.root.classList.add('hidden');
  }
}

/**
 * The one piece while cooking, low in the middle: what to tap now on a stud ring that lights as it
 * comes along. A product, then the spoon; while it boils the ring fills by itself and nothing is
 * tapped.
 */
export class CookBar {
  private root = document.createElement('div');
  private ring: Piece;
  private lit: HTMLImageElement[] = [];
  private pic = document.createElement('img');
  private tile: Piece;
  private busy = false;
  onTap: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root.className = 'cookbar hidden';
    this.ring = new Piece(this.root, 'ring', 0, 0);
    for (let i = 0; i < 8; i++) this.lit.push(this.ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.tile = new Piece(this.root, 'cook-spoon', 0, -TOP, 'tile6-sh');
    this.pic.className = 'stk-img cook-pic hidden';
    this.pic.style.top = `${-TOP - 46}px`;
    this.pic.alt = '';
    this.pic.draggable = false;
    this.tile.pr.appendChild(this.pic);
    this.ring.target(190, 180, TOP).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.busy) return;
      this.tile.bump('translateY(-14px) scale(1.14)');
      this.onTap?.();
    });
    parent.appendChild(this.root);
  }

  /** `img`: a product's picture; none: the spoon. `tap`: it wants a tap (it breathes). */
  show(img: string | null, lit: number, tap: boolean): void {
    this.pic.classList.toggle('hidden', !img);
    if (img) this.pic.src = img;
    this.tile.img.style.visibility = img ? 'hidden' : '';
    this.lit.forEach((l, i) => (l.style.visibility = i < lit ? '' : 'hidden'));
    this.busy = tap;
    this.tile.el.classList.toggle('breathe', tap);
    if (this.root.classList.contains('hidden')) {
      this.root.classList.remove('hidden');
      this.ring.drop(0, 50);
      this.tile.drop(60, 50);
    }
  }

  hide(): void {
    this.busy = false;
    this.root.classList.add('hidden');
  }
}
