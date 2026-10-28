import type { HeroId, QualityTier } from '../contracts';
import { SKIN_NAMES, type AnySkin } from '../render/skins';

/**
 * URL switches for testing (and for screenshots by an agent):
 *   ?skin=pixel|toy|hybrid|diorama  ?tier=0|1  ?hero=lyosha  ?autostart=1
 *   ?x=..&z=..  (start position)  ?time=0..1  ?freeze=1  ?stats=1  ?fresh=1 (ignore the save)  ?demo=1
 *   ?wakeTap=lyosha|solomiia|pupsia  (test only: the start ritual taps that hero by itself
 *   ~1.2 s after it begins; no audio unlock or fullscreen, those need a real touch)
 *   ?wakeHold=<s>  (test only: the ritual stops at <s> seconds after the touch, for screenshots)
 *   ?title=0  (skip only the title «Льошині казки» with its ▶; the wake ritual still runs)
 *   ?titleTap=1  (test only: the title presses ▶ by itself ~2 s after it begins; no audio unlock or fullscreen)
 *   ?titleHold=<s>  (test only: the title freezes <s> s after it begins — the logo then assembles from
 *   scratch, so small values catch it mid-assembly — or, with ?titleTap=1, <s> s after the press)
 */
export interface Params {
  /** ?mute=1 silences everything (automated checks). */
  mute: boolean;
  /** ?difficulty=easy|normal|hard overrides the saved level (checks). */
  difficulty: 'easy' | 'normal' | 'hard' | null;
  skin: AnySkin | null;
  tier: QualityTier | null;
  hero: HeroId | null;
  autostart: boolean;
  x: number | null;
  z: number | null;
  time: number | null;
  freeze: boolean;
  stats: boolean;
  fresh: boolean;
  /** Puts a small rainbow tower and a wall by the house (to compare skins on built blocks). */
  demo: boolean;
  /** ?hud=0 hides the interface (clean frames of the world for design work). */
  hud: boolean;
  /** Test only: simulate the start-ritual tap on this hero. */
  wakeTap: HeroId | null;
  /** Test only: freeze the start ritual this many seconds after the touch. */
  wakeHold: number | null;
  /** ?title=0 skips the title screen (straight to the wake ritual). */
  title: boolean;
  /** Test only: the title presses ▶ by itself. */
  titleTap: boolean;
  /** Test only: freeze the title this many seconds after it begins (after the press with titleTap). */
  titleHold: number | null;
  /** Test only (?album=1 ?palette=1 ?pause=1): the HUD opens the album / brick tray / pause menu after the start. */
  album: boolean;
  palette: boolean;
  pause: boolean;
}

export function readParams(): Params {
  const q = new URLSearchParams(location.search);
  const num = (k: string) => (q.has(k) && q.get(k) !== '' && !Number.isNaN(Number(q.get(k))) ? Number(q.get(k)) : null);
  const one = <T extends string>(k: string, allowed: readonly T[]): T | null => {
    const v = q.get(k) as T | null;
    return v && allowed.includes(v) ? v : null;
  };
  const tier = num('tier');
  return {
    mute: q.get('mute') === '1',
    difficulty: one('difficulty', ['easy', 'normal', 'hard'] as const),
    skin: one('skin', SKIN_NAMES),
    tier: tier === 0 || tier === 1 ? tier : null,
    hero: one('hero', ['lyosha', 'solomiia', 'pupsia'] as const),
    autostart: q.get('autostart') === '1',
    x: num('x'),
    z: num('z'),
    time: num('time'),
    freeze: q.get('freeze') === '1',
    stats: q.get('stats') === '1',
    fresh: q.get('fresh') === '1',
    demo: q.get('demo') === '1',
    hud: q.get('hud') !== '0',
    wakeTap: one('wakeTap', ['lyosha', 'solomiia', 'pupsia'] as const),
    wakeHold: num('wakeHold'),
    title: q.get('title') !== '0',
    titleTap: q.get('titleTap') === '1',
    titleHold: num('titleHold'),
    album: q.get('album') === '1',
    palette: q.get('palette') === '1',
    pause: q.get('pause') === '1',
  };
}
