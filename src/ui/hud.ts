import type { HeroId } from '../contracts';
import { HEROES, HERO_ORDER } from '../content/heroes';
import { BLOCKS, BUILD_PALETTE } from '../world/blocks';
import type { Input } from '../core/input';
import type { Portraits } from './portraits';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** A button that fires on touch-down (kids tap fast) and reports held state. */
function holdButton(btn: HTMLElement, onDown: () => void, onUp?: () => void): void {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    onDown();
  });
  const up = () => {
    btn.classList.remove('down');
    onUp?.();
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}

export class Hud {
  readonly root = el('div', 'hud hidden');
  private hearts = el('div', 'hearts');
  private coins = el('div', 'coins');
  private boltCd = el('div', 'cd');
  private swatch = el('div', 'swatch');
  private palette = el('div', 'palette hidden');
  private switches = new Map<HeroId, HTMLButtonElement>();
  private toastEl = el('div', 'toast');
  private toastTimer = 0;
  private flashEl = el('div', 'flash');
  private faderEl = el('div', 'fader', '💤');
  readonly chestPrompt = el('button', 'btn chest-prompt hidden', '📖');
  private lastHearts = -1;
  private lastCoins = -1;
  onPickBlock: ((id: number) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private input: Input,
    portraits: Portraits,
  ) {
    const r = this.root;

    const zone = el('div', 'joy-zone');
    const base = el('div', 'joy-base');
    base.appendChild(el('div', 'joy-knob'));
    r.append(zone, base);
    input.attachJoystick(zone, base, base.firstElementChild as HTMLElement);

    const tl = el('div', 'top-left');
    tl.append(this.hearts, this.coins);
    r.appendChild(tl);

    const tr = el('div', 'top-right');
    for (const id of HERO_ORDER) {
      const b = el('button', 'switch');
      b.style.setProperty('--accent', HEROES[id].color);
      const img = el('img');
      img.src = portraits.heroes[id];
      img.alt = HEROES[id].name;
      b.appendChild(img);
      holdButton(b, () => (input.pendingHero = id));
      this.switches.set(id, b);
      tr.appendChild(b);
    }
    const album = el('button', 'btn btn-album', '📖');
    holdButton(album, () => input.press('album'));
    tr.appendChild(album);
    r.appendChild(tr);

    const fire = el('button', 'btn btn-fire', '🏹');
    holdButton(
      fire,
      () => {
        input.fireHeld = true;
        input.press('fire');
      },
      () => (input.fireHeld = false),
    );
    const bolt = el('button', 'btn btn-bolt', '⚡');
    bolt.appendChild(this.boltCd);
    holdButton(bolt, () => input.press('bolt'));

    const place = el('button', 'btn btn-place');
    place.appendChild(this.swatch);
    holdButton(place, () => input.press('place'));
    // Long-press or a tap on the swatch corner is too fiddly for a 6-year-old:
    // the palette opens from its own small button above.
    const pick = el('button', 'btn', '🎨');
    Object.assign(pick.style, { right: '150px', bottom: '240px', width: '58px', height: '58px', fontSize: '30px' });
    holdButton(pick, () => this.palette.classList.toggle('hidden'));

    const brk = el('button', 'btn btn-break', '⛏️');
    holdButton(brk, () => input.press('break'));

    for (const id of BUILD_PALETTE) {
      const b = el('button');
      b.style.background = BLOCKS[id].side.color;
      b.dataset.id = String(id);
      holdButton(b, () => {
        this.setBuildBlock(id);
        this.onPickBlock?.(id);
        this.palette.classList.add('hidden');
      });
      this.palette.appendChild(b);
    }

    holdButton(this.chestPrompt, () => input.press('album'));

    r.append(fire, bolt, place, pick, brk, this.palette, this.chestPrompt, this.toastEl, this.flashEl, this.faderEl);
    parent.appendChild(r);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  setHearts(n: number, max: number): void {
    if (n === this.lastHearts) return;
    this.lastHearts = n;
    let html = '';
    for (let i = 0; i < max; i++) html += i < n ? '❤️' : '<span class="empty">❤️</span>';
    this.hearts.innerHTML = html;
  }

  setCoins(n: number): void {
    if (n === this.lastCoins) return;
    const grew = n > this.lastCoins && this.lastCoins >= 0;
    this.lastCoins = n;
    this.coins.innerHTML = `🪙<span>${n}</span>`;
    if (grew) {
      this.coins.classList.remove('bump');
      void this.coins.offsetWidth;
      this.coins.classList.add('bump');
    }
  }

  /** 1 = just used, 0 = ready. */
  setBoltCooldown(frac: number): void {
    this.boltCd.style.setProperty('--cd', `${Math.round(Math.max(0, frac) * 100)}%`);
  }

  setPlayer(id: HeroId): void {
    for (const [hid, b] of this.switches) b.classList.toggle('on', hid === id);
  }

  setBuildBlock(id: number): void {
    this.swatch.style.background = BLOCKS[id]?.side.color ?? '#fff';
    for (const b of this.palette.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === String(id));
  }

  toast(img: string, text: string): void {
    this.toastEl.innerHTML = '';
    const i = el('img');
    i.src = img;
    this.toastEl.append(i, document.createTextNode(text));
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  flash(strength = 0.7): void {
    const f = this.flashEl;
    f.style.transition = 'none';
    f.style.opacity = String(strength);
    void f.offsetWidth;
    f.style.transition = 'opacity 0.35s';
    f.style.opacity = '0';
  }

  fade(on: boolean): Promise<void> {
    this.faderEl.classList.toggle('on', on);
    return new Promise((res) => setTimeout(res, 950));
  }
}
