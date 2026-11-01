import type { ModelRef, Speaker } from '../contracts';
import type { BuildingId } from './buildings';
import type { LineId } from './lines';

/**
 * Companions (CONTENT.md «Companion»): friends who walk with the party and help with one trick.
 * Not playable (more playable heroes are a later task). Given by a reward (`Reward.companion`),
 * a tale (`TaleCard.companion`) or a castle (`CastleCard.companion`); kept in `save.companions`;
 * run by systems/companions.ts. Model: a part file `src/assets/parts/<id>.ts` (`build` + `face`).
 */
export type Trick =
  /** Shoots the nearest monster this close (the robot helper's way). */
  | { kind: 'shoot'; reach: number }
  /** Every `every` seconds a hurt hero close by gets a heart back. */
  | { kind: 'heal'; every: number }
  /** At night no monster appears this close to it. */
  | { kind: 'light'; reach: number };

export interface CompanionCard {
  id: string;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** What it does, one sentence for the parents (the «Зміст гри» page). */
  about: string;
  model: ModelRef;
  speaker: Speaker;
  trick: Trick;
  /**
   * While one of these buildings stands in the world the friend stays at it and does its trick
   * there (the yard dog at its будка): lying by it through the day, up and watching at night.
   * Without one it walks with the party.
   */
  guards?: BuildingId;
  /** `hi`: said when it joins; `yay`: now and then when it does its trick. */
  lines: { hi: LineId; yay: LineId };
}

export const COMPANIONS: Record<string, CompanionCard> = {
  sirko: {
    id: 'sirko',
    name: 'Сірко',
    about: 'Вірний пес із будки біля дому: ходить разом із героями й проганяє монстрів.',
    model: { kind: 'parts', id: 'sirko' },
    speaker: 'sirko',
    trick: { kind: 'shoot', reach: 9 },
    guards: 'doghouse',
    lines: { hi: 'companion_sirko_hi', yay: 'companion_sirko_yay' },
  },
};

export type CompanionId = string;
