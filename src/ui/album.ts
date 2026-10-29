import { ITEMS, ITEM_ORDER } from '../content/items';
import { MONSTERS, MONSTER_ORDER } from '../content/monsters';
import type { SaveData } from '../systems/save';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { Piece, TOP, ninePlate } from './hud';
import type { Portraits } from './portraits';

const CELL = 120;
const PAD = 44;
const HEAD = 104;

/**
 * The album of finds: a studded plate with one sticker tile per kind of thing.
 * Found stickers are bright printed tiles that speak their name when tapped (with
 * «×N» when there are several); missing ones are dark tiles with a silhouette that
 * make the empty spots tempting. Numbers only, no words.
 */
export class Album {
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

  open(save: SaveData): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--hud-k')) || 0.85;
    const found = new Set(save.found);
    const entries: { img: string; got: boolean; line: string; count: number }[] = [];
    for (const id of ITEM_ORDER) {
      const count = id === 'coin' ? save.coins : (save.inv[id] ?? 0);
      entries.push({ img: this.portraits.items[id], got: found.has(id), line: ITEMS[id].line, count });
    }
    for (const kind of MONSTER_ORDER) {
      entries.push({ img: this.portraits.monsters[kind], got: found.has(`m:${kind}`), line: MONSTERS[kind].spotLine, count: save.defeated?.[kind] ?? 0 });
    }
    // places: a lighthouse the child lit (×N lit)
    entries.push({ img: `${import.meta.env.BASE_URL}hud/map-lighthouse-lit.png`, got: found.has('lighthouse'), line: 'lighthouse_lit', count: save.lit.length });

    const cols = W >= H ? 6 : 4;
    const rows = Math.ceil(entries.length / cols);
    const pw = PAD * 2 + cols * CELL;
    const ph = HEAD + rows * CELL + 36;
    const s = Math.min(k * 1.1, (W - 20) / (pw + 16), (H - 20) / (ph + 20));

    const panel = document.createElement('div');
    panel.className = 'alb-panel';
    panel.style.transform = `translate(${Math.round((W - pw * s) / 2)}px, ${Math.round((H - ph * s) / 2)}px) scale(${s.toFixed(4)})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    // Header: the book piece, «found / total», and the close tile.
    new Piece(panel, 'album', 82, 78);
    const n = entries.filter((e) => e.got).length;
    const score = document.createElement('div');
    score.className = 'alb-score';
    score.textContent = `${n}/${entries.length}`;
    panel.appendChild(score);
    const close = new Piece(panel, 'close', pw - 70, 74, 'tile6-sh');
    close.target(104).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close.el.classList.add('down');
      this.close();
    });

    const pieces: Piece[] = [close];
    entries.forEach((en, i) => {
      const x = PAD + CELL * ((i % cols) + 0.5);
      const y = HEAD + CELL * Math.floor(i / cols) + CELL * 0.56;
      const p = new Piece(panel, en.got ? 'sticker-on' : 'sticker-off', x, y, en.got ? 'sticker-sh' : null);
      p.el.classList.add(en.got ? 'got' : 'missing');
      if (en.got) p.lf.style.transform = `rotate(${((i * 37) % 9) - 4}deg)`;
      const img = document.createElement('img');
      img.className = 'stk-img';
      img.src = en.img;
      img.alt = '';
      img.draggable = false;
      img.style.top = `${-TOP - 46}px`;
      p.pr.appendChild(img);
      if (en.got && en.count > 1) {
        const c = document.createElement('span');
        c.className = 'stk-count';
        c.textContent = `×${en.count}`;
        p.pr.appendChild(c);
      }
      p.target(CELL - 6, CELL - 6, 8).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (en.got) {
          voice.say(en.line, { interrupt: true, priority: 5 });
          p.bump('translateY(-10px) scale(1.08)');
        } else sfx.play('click');
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
}
