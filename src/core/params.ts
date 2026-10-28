import type { HeroId, QualityTier } from '../contracts';
import { SKIN_NAMES, type AnySkin } from '../render/skins';

/**
 * URL switches for testing (and for screenshots by an agent):
 *   ?skin=pixel|toy|hybrid|diorama  ?tier=0|1  ?hero=lyosha  ?autostart=1
 *   ?x=..&z=..  (start position)  ?time=0..1  ?freeze=1  ?stats=1  ?fresh=1 (ignore the save)  ?demo=1
 */
export interface Params {
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
  };
}
