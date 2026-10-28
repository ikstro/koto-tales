import type { HeroId } from '../contracts';
import { HEROES, HERO_ORDER } from '../content/heroes';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import type { Portraits } from './portraits';

/** Asks for fullscreen and landscape where the browser allows it (Android Chrome does). */
async function goFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    // Desktop browsers and iOS refuse; the game works the same in a window.
  }
}

/**
 * Two taps: a big play button (the gesture that unlocks sound), then
 * "Хто ти?" with the three heroes. Resolves with the chosen hero.
 */
export function showStart(parent: HTMLElement, portraits: Portraits): Promise<HeroId> {
  return new Promise((resolve) => {
    const screen1 = document.createElement('div');
    screen1.className = 'screen dim';
    screen1.innerHTML = '<h1 class="title">Кото-казки</h1>';
    const play = document.createElement('button');
    play.className = 'play-btn';
    play.textContent = '▶';
    screen1.appendChild(play);
    parent.appendChild(screen1);

    play.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      voice.unlock();
      sfx.unlock();
      sfx.play('click');
      void goFullscreen();
      screen1.remove();

      const screen2 = document.createElement('div');
      screen2.className = 'screen dim';
      screen2.innerHTML = '<h1 class="title" style="font-size:clamp(36px,6vw,72px)">Хто ти?</h1>';
      const row = document.createElement('div');
      row.className = 'hero-row';
      for (const id of HERO_ORDER) {
        const card = document.createElement('button');
        card.className = 'hero-card';
        card.style.setProperty('--accent', HEROES[id].color);
        const img = document.createElement('img');
        img.src = portraits.heroes[id];
        const name = document.createElement('span');
        name.textContent = HEROES[id].name;
        card.append(img, name);
        card.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          sfx.play('switch');
          voice.say(HEROES[id].lines.go, { interrupt: true, priority: 9 });
          screen2.remove();
          resolve(id);
        });
        row.appendChild(card);
      }
      screen2.appendChild(row);
      parent.appendChild(screen2);
      voice.say('who_are_you', { priority: 9 });
    });
  });
}
