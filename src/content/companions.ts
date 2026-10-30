import type { ModelRef, Speaker } from '../contracts';
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
  model: ModelRef;
  speaker: Speaker;
  trick: Trick;
  /** `hi`: said when it joins; `yay`: now and then when it does its trick. */
  lines: { hi: LineId; yay: LineId };
}

export const COMPANIONS: Record<string, CompanionCard> = {
  zz_pal: {
    id: 'zz_pal',
    name: 'Бляшанчик',
    model: { kind: 'parts', id: 'zz_pal' },
    speaker: 'robot',
    trick: { kind: 'shoot', reach: 9 },
    lines: { hi: 'companion_zz_pal_hi', yay: 'companion_zz_pal_yay' },
  },
};

export type CompanionId = string;
