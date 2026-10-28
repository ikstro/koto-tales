import { B } from '../world/blocks';
import type { LineId } from './lines';

/**
 * Ready-made buildings in the kit box (DESIGN.md «Kit»). A building is a card:
 * its footprint, the cells bodies bump into, how many come with an unlock and
 * the line said the first time one goes up. Its model lives in
 * src/assets/buildings.ts; the ground under it is never changed.
 */

export type BuildingId = 'tent' | 'boombox' | 'lantern';

export interface BuildingCard {
  id: BuildingId;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** Footprint in blocks across (x) and deep (z) before turning; the front faces +z. */
  size: [number, number];
  /** Cells bodies bump into: (dx, dz) from the footprint's min corner, `h` blocks tall. */
  solid: { dx: number; dz: number; h: number }[];
  /** How many the kit holds at the start; null = never runs out. */
  count: number | null;
  /** HUD sprite of the piece in the kit plate. */
  sprite: string;
  /** Said the first time one is put up. */
  firstLine?: LineId;
  /** Spoken when one more comes out of the kit as a reward. */
  rewardLine?: LineId;
  /** The lantern is a block in the world (it cracks the boss's armour), not a model. */
  block?: number;
  /** Plays music around itself while it stands. */
  music?: boolean;
  /** Heroes may sleep in it at night. */
  sleep?: boolean;
}

export const BUILDINGS: Record<BuildingId, BuildingCard> = {
  tent: {
    id: 'tent',
    name: 'Намет',
    size: [3, 3],
    solid: [],
    count: 1,
    sprite: 'b-tent',
    firstLine: 'first_tent',
    rewardLine: 'reward_tent',
    sleep: true,
  },
  boombox: {
    id: 'boombox',
    name: 'Колонка',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 1,
    sprite: 'b-boombox',
    firstLine: 'first_boombox',
    rewardLine: 'reward_boombox',
    music: true,
  },
  lantern: {
    id: 'lantern',
    name: 'Ліхтар',
    size: [1, 1],
    solid: [],
    count: null,
    sprite: 'brick-24',
    block: B.LANTERN,
  },
};

/** Order of the kit plate. */
export const KIT_ORDER: BuildingId[] = ['tent', 'boombox', 'lantern'];

/** Music carries this far (blocks); monsters this close to a playing speaker dance instead of biting. */
export const MUSIC = { hear: 18, dance: 9 };
