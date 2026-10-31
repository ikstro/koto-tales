import type { Pic, Row, Section, SectionId } from '../content/contents';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { Piece, ninePlate } from './hud';
import { SPRITES, type SpriteName } from './hudSprites';
import type { Portraits } from './portraits';

/**
 * «Зміст гри» (DESIGN.md «Contents»), from the pause menu: everything the game has, for the
 * parents — a studded plate with a row of section tiles on top and a list that scrolls with a
 * finger. Each row: the thing's picture, its name, one line of what it does and where it stands
 * (had / under way / how to get it). Things still ahead are faded but fully readable; a tap on
 * any card says its voiced line. The only long text in the game; the child needs none of it.
 */

const PAD = 30;
const PIC = 84;
const BASE = import.meta.env.BASE_URL;

/** A baked HUD sprite (its file is already cropped to what is drawn), fitted into a `box` px square. */
function spriteBox(name: string, box: number): HTMLElement {
  const holder = document.createElement('div');
  holder.className = 'ct-sp';
  const r = SPRITES[name as SpriteName];
  if (!r) return holder;
  const s = Math.min(box / r.cw, box / r.ch);
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.src = `${BASE}hud/${name}.png`;
  img.style.cssText = `width:${(r.cw * s).toFixed(1)}px;height:${(r.ch * s).toFixed(1)}px`;
  holder.appendChild(img);
  return holder;
}

export class Contents {
  readonly root = document.createElement('div');
  private onClose: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private portraits: Portraits,
  ) {
    this.root.className = 'contents hidden';
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) {
        e.preventDefault();
        this.close();
      }
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(sections: Section[], onClose: () => void): void {
    if (this.isOpen) return;
    this.onClose = onClose;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // sized for reading: the text stays big enough on a phone, the plate fills the screen
    const s = W < 700 ? 0.78 : W < 1100 ? 0.92 : 1.05;
    const pw = Math.min(1000, (W - 24) / s - 16);
    const ph = (H - 24) / s - 20;

    const panel = document.createElement('div');
    panel.className = 'ct-panel';
    panel.style.transform = `translate(${Math.round((W - (pw + 16) * s) / 2)}px, ${Math.round((H - (ph + 20) * s) / 2)}px) scale(${s})`;
    const plate = ninePlate(panel, pw, ph);
    (plate.previousElementSibling as HTMLElement).style.cssText += ';left:14px;top:18px';

    // the header: the title and a tile per section (a tap scrolls there)
    const head = document.createElement('div');
    head.className = 'ct-head';
    head.style.cssText = `left:${PAD}px;top:22px;width:${pw - 2 * PAD - 92}px`;
    const title = document.createElement('div');
    title.className = 'ct-title';
    title.textContent = 'Зміст гри';
    head.appendChild(title);
    panel.appendChild(head);
    // the section tiles share one row beside the title when they can (short screens keep the list tall)
    const fit = Math.floor((pw - 2 * PAD - 92 - 230) / sections.length) - 8;
    // too narrow for one row (a phone upright): they wrap, so they can stay big enough for a finger
    const size = fit < 44 ? 56 : Math.min(60, fit);
    if (W < 700) panel.classList.add('narrow');
    head.style.setProperty('--tab', `${size}px`);

    const list = document.createElement('div');
    list.className = 'ct-list';
    const secEls = new Map<SectionId, HTMLElement>();
    for (const sec of sections) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'ct-tab';
      tab.title = sec.title;
      tab.appendChild(spriteBox(sec.icon, Math.round(size * 0.77)));
      tab.addEventListener('click', () => this.scrollTo(list, secEls.get(sec.id)));
      head.appendChild(tab);

      const h = document.createElement('div');
      h.className = 'ct-sec';
      h.append(spriteBox(sec.icon, 40), document.createTextNode(sec.title));
      list.appendChild(h);
      secEls.set(sec.id, h);
      for (const row of sec.rows) list.appendChild(this.row(row, (id) => this.scrollTo(list, secEls.get(id))));
    }
    panel.appendChild(list);

    const close = new Piece(panel, 'close', pw - 24, 34, 'tile6-sh');
    close.target(104).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close.el.classList.add('down');
      this.close();
    });

    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    // the list starts under the header, whatever its rows of tiles came to
    const top = 22 + head.offsetHeight + 14;
    list.style.cssText = `left:${PAD}px;top:${top}px;width:${pw - 2 * PAD}px;height:${ph - top - 34}px`;
    sfx.play('sticker');
    close.drop(120, 40);
    panel.animate([{ opacity: 0, transform: `${panel.style.transform} translateY(24px)` }, { opacity: 1, transform: panel.style.transform }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }

  private scrollTo(list: HTMLElement, el: HTMLElement | undefined): void {
    if (!el) return;
    sfx.play('click');
    list.scrollTo({ top: el.offsetTop - 6, behavior: 'smooth' });
  }

  private pic(p: Pic): HTMLElement {
    if ('sprite' in p) return spriteBox(p.sprite, PIC - 8);
    const src = p.portrait === 'item' ? this.portraits.items[p.id as keyof Portraits['items']] : p.portrait === 'monster' ? this.portraits.monsters[p.id as keyof Portraits['monsters']] : this.portraits.artifacts[p.id];
    const img = document.createElement('img');
    img.className = 'ct-portrait';
    img.alt = '';
    img.draggable = false;
    if (src) img.src = src;
    return img;
  }

  private row(r: Row, jump: (id: SectionId) => void): HTMLElement {
    const el = document.createElement('div');
    el.className = `ct-row ${r.state}${r.gold ? ' gold' : ''}${r.jump ? ' jump' : ''}`;

    const pic = document.createElement('div');
    pic.className = 'ct-pic';
    pic.appendChild(this.pic(r.pic));

    const text = document.createElement('div');
    text.className = 'ct-text';
    const t = document.createElement('div');
    t.className = 'ct-name';
    t.textContent = r.title;
    if (r.level) {
      const studs = document.createElement('span');
      studs.className = 'ct-studs';
      studs.textContent = '●'.repeat(r.level);
      t.appendChild(studs);
    }
    const about = document.createElement('div');
    about.className = 'ct-about';
    about.textContent = r.about;
    const status = document.createElement('div');
    status.className = 'ct-status';
    status.textContent = `${r.state === 'have' ? '✓ ' : ''}${r.status}`;
    text.append(t, about, status);
    el.append(pic, text);

    // a tap anywhere on the card says its line (the speaker on the right shows it can);
    // a row of «Що чекає далі» also has an arrow to its own section
    const side = document.createElement('div');
    side.className = 'ct-side';
    if (r.line) side.appendChild(spriteBox('sound-on', 40));
    if (r.jump) {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'ct-go';
      go.appendChild(spriteBox('map-arrow', 30));
      go.addEventListener('click', (e) => {
        e.stopPropagation();
        jump(r.jump!);
      });
      side.appendChild(go);
    }
    el.appendChild(side);
    if (r.line) {
      el.classList.add('says');
      el.addEventListener('click', () => {
        sfx.play('click');
        voice.say(r.line!, { priority: 9, interrupt: true });
        pic.animate([{ transform: 'none' }, { transform: 'translateY(-10px) scale(1.08)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        el.animate([{ transform: 'translateY(3px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      });
    }
    return el;
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
