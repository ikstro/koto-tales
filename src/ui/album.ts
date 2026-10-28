import { ITEMS, ITEM_ORDER } from '../content/items';
import { MONSTERS, MONSTER_ORDER } from '../content/monsters';
import type { SaveData } from '../systems/save';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import type { Portraits } from './portraits';

/**
 * The album of finds: one sticker per kind of thing. Found stickers are bright
 * and speak their name when tapped; missing ones are dark silhouettes that
 * make the empty spots tempting.
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
    const book = document.createElement('div');
    book.className = 'album-book';

    const close = document.createElement('button');
    close.className = 'btn album-close';
    close.textContent = '✖';
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.close();
    });
    book.appendChild(close);

    const found = new Set(save.found);
    const total = ITEM_ORDER.length + MONSTER_ORDER.length;
    const h = document.createElement('h2');
    h.textContent = `📖 Альбом знахідок · ${found.size} / ${total}`;
    book.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'album-grid';
    let n = 0;
    const add = (img: string, got: boolean, line: string, count?: number) => {
      const s = document.createElement('button');
      s.className = 'sticker' + (got ? ' got' : '');
      s.style.setProperty('--tilt', `${((n++ * 37) % 9) - 4}deg`);
      const i = document.createElement('img');
      i.src = img;
      s.appendChild(i);
      if (got && count && count > 1) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = `×${count}`;
        s.appendChild(c);
      }
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (got) voice.say(line, { interrupt: true, priority: 5 });
        else sfx.play('click');
      });
      grid.appendChild(s);
    };
    for (const id of ITEM_ORDER) {
      const count = id === 'coin' ? save.coins : save.inv[id] ?? 0;
      add(this.portraits.items[id], found.has(id), ITEMS[id].line, count);
    }
    for (const kind of MONSTER_ORDER) add(this.portraits.monsters[kind], found.has(`m:${kind}`), MONSTERS[kind].spotLine);
    book.appendChild(grid);

    this.root.replaceChildren(book);
    this.root.classList.remove('hidden');
    sfx.play('sticker');
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    sfx.play('click');
    this.onClose?.();
  }
}
