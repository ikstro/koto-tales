import type { HeroId, ModelRef } from '../contracts';
import type { LineId } from './lines';

/**
 * What a hero shoots with the big button. Every weapon flies far and hits the same
 * (HERO_STATS: damage, speed, range, cooldown) — only the look and the flight differ,
 * so no hero is weaker. The lightning is not a weapon: only the child casts it, by its button.
 * - `arrow` Льоша's bow; `star` Соломія's wand (spinning pink stars);
 * - `paw` Пупся's cat magic (a glowing purr-ball with a paw print, a sparkle trail);
 * - `axe` Давид's throwing axes, spinning end over end (his sword stays in his hand).
 */
export type WeaponKind = 'arrow' | 'star' | 'paw' | 'axe';

export interface HeroCard {
  id: HeroId;
  model: ModelRef;
  /** Shown under the portrait and spoken by the narrator. */
  name: string;
  /** Run speed, blocks per second. */
  speed: number;
  /** Accent colour for UI frames. */
  color: string;
  weapon: WeaponKind;
  lines: { go: LineId; hi: LineId; bolt: LineId; yay: LineId };
}

export const HEROES: Record<HeroId, HeroCard> = {
  lyosha: {
    id: 'lyosha',
    model: { kind: 'parts', id: 'lyosha' },
    name: 'Льоша',
    speed: 5,
    color: '#1e40af',
    weapon: 'arrow',
    lines: { go: 'go_lyosha', hi: 'lyosha_hi', bolt: 'lyosha_bolt', yay: 'lyosha_yay' },
  },
  solomiia: {
    id: 'solomiia',
    model: { kind: 'parts', id: 'solomiia' },
    name: 'Соломія',
    speed: 5,
    color: '#ec4899',
    weapon: 'star',
    lines: { go: 'go_solomiia', hi: 'solomiia_hi', bolt: 'solomiia_bolt', yay: 'solomiia_yay' },
  },
  pupsia: {
    id: 'pupsia',
    model: { kind: 'parts', id: 'pupsia' },
    name: 'Пупся',
    speed: 5.6,
    color: '#8d6e63',
    weapon: 'paw',
    lines: { go: 'go_pupsia', hi: 'pupsia_hi', bolt: 'pupsia_bolt', yay: 'pupsia_yay' },
  },
  david: {
    id: 'david',
    model: { kind: 'parts', id: 'david' },
    name: 'Давид',
    speed: 5,
    color: '#3fa142',
    weapon: 'axe',
    lines: { go: 'go_david', hi: 'david_hi', bolt: 'david_bolt', yay: 'david_yay' },
  },
};

export const HERO_ORDER: HeroId[] = ['lyosha', 'solomiia', 'pupsia', 'david'];

export const HERO_STATS = {
  maxHearts: 5,
  arrowCooldown: 0.45,
  arrowDamage: 1,
  arrowSpeed: 18,
  arrowRange: 14,
  boltCooldown: 3.5,
  boltDamage: 3,
  boltChainDamage: 2,
  boltChains: 2,
  boltRange: 12,
  /** Seconds without being hit before hearts start coming back. */
  regenDelay: 5,
  regenEvery: 8,
  regenEveryAtHome: 1.5,
};
