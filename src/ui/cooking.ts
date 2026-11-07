import type { ItemId } from '../contracts';
import { canCook, COOK, type RecipeCard } from '../content/recipes';
import { sfx } from '../voice/sfx';
import { Piece, TOP, ninePlate } from './hud';
import type { SpriteName } from './hudSprites';
import type { Portraits } from './portraits';

const CELL = 170;
const PAD = 54;
const HEAD = 96;
/** Bigger than the album: cards a child looks at for a hint. */
const BOOK_SIZE = 1.4;
/** Small products under each dish: two, or three a little smaller. */
const SMALL = [0.5, 0.5, 0.42];
const SMALL_AT = [
  [-28, 28],
  [-36, 0, 36],
];

/**
 * The book of recipes (DESIGN.md «Kitchen»), a hint opened from the pantry: a studded plate, a card
 * per dish (all sixteen, the hostess at home's first), the dish's picture and its products under it.
 * Enough of them: bright, and a tap puts them into the pot; otherwise pale, and a tap says what is
 * missing. No words.
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
    const size = (cols: number) => {
      const pw = PAD * 2 + cols * CELL;
      const ph = HEAD + Math.ceil(list.length / cols) * CELL + 30;
      return { pw, ph, s: Math.min(k * BOOK_SIZE, (W - 20) / (pw + 16), (H - 20) / (ph + 20)) };
    };
    // as many columns as keep the cards biggest on this screen
    let cols = W >= H ? 4 : 2;
    for (let c = cols + 1; c <= (W >= H ? 8 : 4); c++) if (size(c).s > size(cols).s + 1e-3) cols = c;
    const { pw, ph, s } = size(cols);

    const panel = document.createElement('div');
    panel.className = 'alb-panel';
    panel.style.transform = `translate(${Math.round((W - pw * s) / 2)}px, ${Math.round((H - ph * s) / 2)}px) scale(${s.toFixed(4)})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    new Piece(panel, 'album', 82, 86);
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
      const at = SMALL_AT[r.needs.length - 2] ?? SMALL_AT[1];
      r.needs.forEach((item, n) => {
        const have = (left[item] ?? 0) > 0;
        if (have) left[item]!--;
        const small = document.createElement('img');
        small.className = `stk-img recipe-need${have ? ' have' : ''}`;
        small.src = this.portraits.items[item];
        small.alt = '';
        small.draggable = false;
        small.style.cssText = `top:${-TOP - 4}px;left:${-46 + at[n]}px;transform:scale(${SMALL[r.needs.length - 1]})`;
        p.pr.appendChild(small);
      });
      p.target(CELL - 8, CELL - 8, 8).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        p.bump(ready ? 'translateY(-10px) scale(1.08)' : 'translateX(-6px) rotate(-8deg)');
        onPick(r);
      });
      pieces.push(p);
    });

    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    pieces.forEach((p, i) => p.drop(i * 22, 40));
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

/** A product the party carries, as the pantry shows it. */
export interface Product {
  id: ItemId;
  img: string;
  /** How many the party carries. */
  have: number;
}

/** Design px of the pantry plate. */
const P_CELL = 128;
const P_PAD = 56;
const P_HEAD = 104;
const SLOT_GAP = 112;
const RING_GAP = 136;
const SPOON_GAP = 150;
const MID_H = 210;
const PANTRY_SIZE = 1.4;
/** Studs lit on the pot's ring for 0, 1, 2, 3 products in. */
const RING_LIT = [0, 3, 5, 8];
const FLY_MS = 380;
const WIGGLE = 'translateX(-6px) rotate(-8deg)';

/**
 * The pantry (DESIGN.md «Kitchen»): what the pot piece opens. A studded plate: the book tile (the
 * book of recipes, a hint) and the coral ✕ on top; in the middle three slots, the pot on an 8-stud
 * ring and the spoon; under them the products the party carries, each its sticker tile with how
 * many on a number tile. A tap on a product flies it into the next free slot (a poof and a plop); a
 * tap on a filled slot takes it back out. With one in, the spoon breathes; a tap on it starts the
 * cooking. No words. The mix is kept here; the system speaks.
 */
export class PantryPlate {
  private root = document.createElement('div');
  private panel: HTMLDivElement | null = null;
  private products: Product[] = [];
  private tiles = new Map<ItemId, { p: Piece; num: HTMLSpanElement; x: number; y: number }>();
  private slots: { p: Piece; img: HTMLImageElement; x: number; y: number }[] = [];
  private lit: HTMLImageElement[] = [];
  private spoon: Piece | null = null;
  private breath: Animation | null = null;
  private pot: Piece | null = null;
  private items = {} as Record<ItemId, string>;
  mix: ItemId[] = [];
  onClose: (() => void) | null = null;
  /** A product went in by a tap: the hostess names it. */
  onDrop: ((id: ItemId) => void) | null = null;
  onStir: ((mix: ItemId[]) => void) | null = null;
  onBook: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root.className = 'album hidden';
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(products: Product[], mix: readonly ItemId[], items: Record<ItemId, string>): void {
    this.products = products;
    this.items = items;
    this.mix = [];
    this.tiles.clear();
    this.slots = [];
    this.lit = [];
    this.breath?.cancel();
    this.breath = null;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--hud-k')) || 0.85;
    const wide = W >= H;
    const cols = wide ? 7 : 4;
    const rows = Math.max(1, Math.ceil(products.length / cols));
    const midW = wide ? SLOT_GAP * 2 + RING_GAP + SPOON_GAP + P_CELL : SLOT_GAP * 2 + P_CELL;
    const midH = wide ? MID_H : MID_H + P_CELL;
    const pw = P_PAD * 2 + Math.max(cols * P_CELL, midW);
    const ph = P_HEAD + midH + (products.length ? rows * P_CELL : 0) + 30;
    const s = Math.min(k * PANTRY_SIZE, (W - 20) / (pw + 16), (H - 20) / (ph + 20));

    const panel = document.createElement('div');
    panel.className = 'alb-panel';
    panel.style.transform = `translate(${Math.round((W - pw * s) / 2)}px, ${Math.round((H - ph * s) / 2)}px) scale(${s.toFixed(4)})`;
    this.panel = panel;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    const book = new Piece(panel, 'album', 82, 86);
    book.target(110, 120, 40).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      book.bump('translateY(-10px) scale(1.08)');
      sfx.play('click');
      this.onBook?.();
    });
    const close = new Piece(panel, 'close', pw - 70, 74, 'tile6-sh');
    close.target(104).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close.el.classList.add('down');
      this.close();
    });
    const pieces: Piece[] = [book, close];

    // the middle: three slots, the pot on its ring, the spoon (portrait: the slots above the pot)
    const cx = pw / 2;
    const slotY = P_HEAD + 120;
    const ringY = wide ? P_HEAD + 150 : P_HEAD + 120 + P_CELL + 40;
    const x0 = wide ? cx - (SLOT_GAP * 2 + RING_GAP + SPOON_GAP) / 2 : cx - SLOT_GAP;
    const ringX = wide ? x0 + SLOT_GAP * 2 + RING_GAP : cx - SPOON_GAP / 2 + 10;
    const spoonX = ringX + SPOON_GAP;
    for (let i = 0; i < COOK.most; i++) {
      const x = x0 + SLOT_GAP * i;
      const p = new Piece(panel, 'sticker-off', x, slotY, null);
      const img = document.createElement('img');
      img.className = 'stk-img';
      img.alt = '';
      img.draggable = false;
      img.style.cssText = `top:${-TOP - 46}px;visibility:hidden`;
      p.pr.appendChild(img);
      p.target(P_CELL - 14, P_CELL - 14, 8).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.takeOut(i);
      });
      this.slots.push({ p, img, x, y: slotY });
      pieces.push(p);
    }
    const ring = new Piece(panel, 'ring', ringX, ringY);
    for (let i = 0; i < 8; i++) this.lit.push(ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.pot = new Piece(panel, 'ask-pot', ringX, ringY - TOP, 'tile6-sh');
    pieces.push(ring, this.pot);
    const spoon = new Piece(panel, 'cook-spoon', spoonX, ringY - TOP, 'tile6-sh');
    spoon.el.style.visibility = 'hidden';
    spoon.target(P_CELL, P_CELL, 10).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.mix.length < COOK.least) return;
      spoon.bump('translateY(-14px) scale(1.14)');
      sfx.play('switch', { pitch: 1.2 });
      this.onStir?.([...this.mix]);
    });
    this.spoon = spoon;

    // the products the party carries, rows centred under the pot
    const topY = P_HEAD + midH + P_CELL * 0.5;
    products.forEach((pr, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, products.length - row * cols);
      const x = cx + ((i % cols) - (inRow - 1) / 2) * P_CELL;
      const y = topY + row * P_CELL;
      const p = new Piece(panel, 'sticker-on', x, y, 'sticker-sh');
      p.el.classList.add('got');
      const img = document.createElement('img');
      img.className = 'stk-img';
      img.src = pr.img;
      img.alt = '';
      img.draggable = false;
      img.style.top = `${-TOP - 46}px`;
      p.pr.appendChild(img);
      // how many, on a small number tile at the lower right
      const holder = document.createElement('div');
      holder.className = 'kc';
      holder.style.cssText = 'left:40px;top:6px';
      p.pr.appendChild(holder);
      const tile = new Piece(holder, 'numtile', 0, 0, null);
      const win = document.createElement('div');
      win.className = 'numwin';
      win.style.cssText = 'left:-36px;top:-31px';
      const num = document.createElement('span');
      win.appendChild(num);
      tile.pr.appendChild(win);
      p.target(P_CELL - 8, P_CELL - 8, 8).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.tap(pr.id);
      });
      this.tiles.set(pr.id, { p, num, x, y });
      pieces.push(p);
    });

    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    pieces.forEach((p, i) => p.drop(i * 26, 40));
    for (const id of mix) this.put(id, false);
    this.sync(false);
    sfx.play('sticker');
  }

  /** A tap on a product: into the next free slot, or a wiggle when none is left or the pot is full. */
  private tap(id: ItemId): void {
    if (!this.put(id, true)) {
      this.tiles.get(id)?.p.bump(WIGGLE);
      sfx.play('click');
      return;
    }
    this.onDrop?.(id);
  }

  /** Puts one into the next free slot; `fly`: from its tile, with a poof and a plop. */
  put(id: ItemId, fly = true): boolean {
    const left = (this.products.find((p) => p.id === id)?.have ?? 0) - this.mix.filter((m) => m === id).length;
    if (left <= 0 || this.mix.length >= COOK.most) return false;
    const i = this.mix.length;
    this.mix.push(id);
    const slot = this.slots[i];
    slot.img.src = this.items[id];
    const tile = this.tiles.get(id);
    if (fly && tile && this.panel) {
      tile.p.bump('translateY(-10px) scale(1.08)');
      sfx.play('poof', { pitch: 1.5 });
      const f = document.createElement('img');
      f.className = 'stk-img';
      f.src = this.items[id];
      f.alt = '';
      f.draggable = false;
      f.style.cssText = `left:${tile.x - 46}px;top:${tile.y - TOP - 46}px;z-index:3`;
      this.panel.appendChild(f);
      slot.img.style.visibility = 'hidden';
      const dx = slot.x - tile.x;
      const dy = slot.y - tile.y;
      f.animate(
        [
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(1.15)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(1)` },
        ],
        { duration: FLY_MS, easing: 'ease-in-out' },
      ).onfinish = () => {
        f.remove();
        if (this.mix[i] !== id) return;
        slot.img.style.visibility = '';
        slot.p.bump('translateY(-8px) scale(1.12)');
        this.poof(slot.x, slot.y - TOP - 10);
        sfx.play('plop');
      };
    } else slot.img.style.visibility = '';
    this.sync(fly);
    return true;
  }

  /** A tap on a filled slot: it goes back to its tile; the slots after it move up. An empty one wiggles. */
  private takeOut(i: number): void {
    if (i >= this.mix.length) {
      this.slots[i]?.p.bump(WIGGLE);
      sfx.play('click');
      return;
    }
    const [id] = this.mix.splice(i, 1);
    this.slots.forEach((s, n) => {
      const m = this.mix[n];
      s.img.style.visibility = m ? '' : 'hidden';
      if (m) s.img.src = this.items[m];
    });
    this.slots[i].p.bump('translateY(-8px) scale(1.1)');
    this.tiles.get(id)?.p.bump('translateY(-12px) scale(1.1)');
    sfx.play('click');
    sfx.play('poof', { pitch: 0.9, volume: 0.6 });
    this.sync(true);
  }

  /** The numbers, the ring, the spoon. */
  private sync(anim: boolean): void {
    for (const pr of this.products) {
      const t = this.tiles.get(pr.id);
      if (!t) continue;
      const left = pr.have - this.mix.filter((m) => m === pr.id).length;
      t.num.textContent = String(left);
      t.num.parentElement!.dataset.d = String(Math.min(String(left).length, 4));
      t.p.bd.style.filter = left > 0 ? '' : 'saturate(0.2) opacity(0.55)';
    }
    const n = this.mix.length;
    this.lit.forEach((l, i) => (l.style.visibility = i < RING_LIT[n] ? '' : 'hidden'));
    const spoon = this.spoon;
    if (!spoon) return;
    const on = n >= COOK.least;
    spoon.el.style.visibility = on ? '' : 'hidden';
    if (on && !this.breath) {
      spoon.drop(0, 40);
      this.breath = spoon.bd.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], {
        duration: 1200,
        iterations: Infinity,
        easing: 'ease-in-out',
        delay: 400,
      });
    } else if (!on && this.breath) {
      this.breath.cancel();
      this.breath = null;
    }
    if (anim && this.pot) this.pot.bump('translateY(-6px) scale(1.06)');
  }

  /** A soft cream burst where a product lands. */
  private poof(x: number, y: number): void {
    if (!this.panel) return;
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x - 50}px;top:${y - 50}px;width:100px;height:100px;border-radius:50%;pointer-events:none;z-index:4;background:radial-gradient(circle, rgba(255,243,214,0.95), rgba(255,227,163,0.55) 45%, rgba(255,227,163,0) 70%)`;
    this.panel.appendChild(d);
    d.animate(
      [
        { transform: 'scale(0.3)', opacity: 1 },
        { transform: 'scale(1.5)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).onfinish = () => d.remove();
  }

  close(): void {
    if (!this.isOpen) return;
    this.hide();
    sfx.play('click');
    this.onClose?.();
  }

  /** Closed for the book or the spoon: no click, no onClose. */
  hide(): void {
    this.breath?.cancel();
    this.breath = null;
    this.root.classList.add('hidden');
  }
}

/**
 * The one piece while cooking, low in the middle: the spoon on a stud ring that lights as it comes
 * along. While it boils the ring fills by itself and nothing is tapped.
 */
export class CookBar {
  private root = document.createElement('div');
  private ring: Piece;
  private lit: HTMLImageElement[] = [];
  private tile: Piece;
  private busy = false;
  onTap: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root.className = 'cookbar hidden';
    this.ring = new Piece(this.root, 'ring', 0, 0);
    for (let i = 0; i < 8; i++) this.lit.push(this.ring.layer(`ring-lit-${i}` as SpriteName, 'sp lit'));
    this.tile = new Piece(this.root, 'cook-spoon', 0, -TOP, 'tile6-sh');
    this.ring.target(190, 180, TOP).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.busy) return;
      this.tile.bump('translateY(-14px) scale(1.14)');
      this.onTap?.();
    });
    parent.appendChild(this.root);
  }

  /** `lit`: studs lit; `tap`: it wants a tap (it breathes). */
  show(lit: number, tap: boolean): void {
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
