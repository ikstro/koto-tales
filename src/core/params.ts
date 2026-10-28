import type { HeroId } from '../contracts';
import type { Level } from './quality';
import { SKIN_NAMES, type AnySkin } from '../render/skins';

/**
 * URL switches for testing (and for screenshots by an agent):
 *   ?skin=pixel|toy|hybrid|diorama  ?hero=lyosha  ?autostart=1
 *   ?tier=2|1|0|-1  fixes the quality level and turns the adaptive controller off (src/core/quality.ts):
 *     2 = full: shadows, dressing, studs, tilt-shift post, pixel ratio ≤ 1.5, render distance 5, 60 fps
 *     1 = the same at pixel ratio 1 with a cheaper post pass (6 blur taps, 2× MSAA), 60 fps
 *     0 = light: no shadows / post / dressing / studs, pixel ratio 1, render distance 4, 60 fps
 *    -1 = 0 at 0.75 render scale, render distance 3, 30 fps
 *   ?fps=30|60  fixes the frame cap (also turns adaptation off)
 *   ?x=..&z=..  (start position)  ?time=0..1  ?freeze=1  ?stats=1  ?fresh=1 (ignore the save)  ?demo=1
 *   ?wakeTap=lyosha|solomiia|pupsia  (test only: the start ritual taps that hero by itself
 *   ~1.2 s after it begins; no audio unlock or fullscreen, those need a real touch)
 *   ?wakeHold=<s>  (test only: the ritual stops at <s> seconds after the touch, for screenshots)
 *   ?title=0  (skip only the title «Льошині казки» with its ▶; the wake ritual still runs)
 *   ?titleTap=1  (test only: the title presses ▶ by itself ~2 s after it begins; no audio unlock or fullscreen)
 *   ?titleHold=<s>  (test only: the title freezes <s> s after it begins — the logo then assembles from
 *   scratch, so small values catch it mid-assembly — or, with ?titleTap=1, <s> s after the press)
 *   ?map=1  (test only: the big map opens after the start)  ?seen=<r>  (test only: seed explored chunks)
 *   ?boss=near  ?bossHp=<n>  ?lanterns=<n>  (test only: start by the boss, set its health / cracked armour)
 *   ?guide=all|boss|move|…  (test only: the picture guide opens after the start — all cards over the pause menu, or one card)
 */
export interface Params {
  /** ?mute=1 silences everything (automated checks). */
  mute: boolean;
  /** ?difficulty=easy|normal|hard overrides the saved level (checks). */
  difficulty: 'easy' | 'normal' | 'hard' | null;
  skin: AnySkin | null;
  /** Forced quality level (see above); null = adaptive. */
  tier: Level | null;
  /** Forced frame cap; null = the level's. */
  fps: 30 | 60 | null;
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
  /** Test only (?album=1 ?kit=1 ?pause=1): the HUD opens the album / kit plate / pause menu after the start. */
  album: boolean;
  kit: boolean;
  pause: boolean;
  /** Test only (?map=1): the big map opens after the start. */
  map: boolean;
  /** Test only (?seen=<r>): chunks within r of the house, and a trail to the start spot, count as explored. */
  seen: number | null;
  /** Test only (?boss=near): the party starts in front of the boss («Пожирач земель»). */
  boss: 'near' | null;
  /** Test only (?bossHp=<n>): the boss starts with this much health. */
  bossHp: number | null;
  /** Test only (?lanterns=<n>): this many lanterns already cracked its armour (3 = broken). */
  lanterns: number | null;
  /** Test only (?guide=all|<card>): the picture guide opens after the start. */
  guide: 'all' | 'move' | 'bow' | 'bolt' | 'build' | 'heal' | 'map' | 'boss' | null;
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
    tier: tier === 2 || tier === 1 || tier === 0 || tier === -1 ? tier : null,
    fps: num('fps') === 30 ? 30 : num('fps') === 60 ? 60 : null,
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
    kit: q.get('kit') === '1',
    pause: q.get('pause') === '1',
    map: q.get('map') === '1',
    seen: num('seen'),
    boss: one('boss', ['near'] as const),
    bossHp: num('bossHp'),
    lanterns: num('lanterns'),
    guide: one('guide', ['all', 'move', 'bow', 'bolt', 'build', 'heal', 'map', 'boss'] as const),
  };
}
