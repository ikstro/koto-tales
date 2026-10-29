import type { BuildingCard, BuildingId } from './buildings';
import type { LineId } from './lines';

/**
 * Upgrades (DESIGN.md «Kit»): late in the endless goal a reward can raise a building
 * the child has instead of giving another one. A level is shown as gold studs on the
 * building's cell in the kit plate (no numbers); every standing building of that kind
 * gets better at once.
 */

export const MAX_LEVEL = 3;

interface Upgrade {
  /** The card raised by `level` steps. */
  raise: (card: BuildingCard, level: number) => BuildingCard;
  line: LineId;
  /** Said instead when it reaches the last level. */
  lastLine?: LineId;
}

export const UPGRADES: Partial<Record<BuildingId, Upgrade>> = {
  generator: { raise: (c, n) => ({ ...c, power: { ...c.power, give: (c.power?.give ?? 0) + 2 * n } }), line: 'up_generator' },
  radar: { raise: (c, n) => ({ ...c, scan: { radius: (c.scan?.radius ?? 0) + 16 * n } }), line: 'up_radar' },
  wifi: { raise: (c, n) => ({ ...c, signal: { zone: (c.signal?.zone ?? 0) + 4 * n } }), line: 'up_wifi' },
  tesla: { raise: (c, n) => ({ ...c, zap: { reach: c.zap?.reach ?? 0, every: (c.zap?.every ?? 0) - 0.25 * n } }), line: 'up_tesla' },
  bigspeaker: {
    raise: (c, n) => ({ ...c, music: { hear: (c.music?.hear ?? 0) + 5 * n, dance: (c.music?.dance ?? 0) + 2 * n } }),
    line: 'up_bigspeaker',
    lastLine: 'up_bigspeaker_gold',
  },
  station: { raise: (c, n) => ({ ...c, power: { ...c.power, give: (c.power?.give ?? 0) + 5 * n } }), line: 'up_station' },
};

/** The order upgrades come in (each turn the next one that can still go up). */
export const UPGRADE_ORDER: BuildingId[] = ['generator', 'tesla', 'radar', 'bigspeaker', 'wifi', 'station'];

/** A building's card at an upgrade level (level 0, or a building without upgrades: the card itself). */
export function upgraded(card: BuildingCard, level: number): BuildingCard {
  const u = UPGRADES[card.id];
  const n = Math.min(MAX_LEVEL, Math.max(0, level));
  return u && n > 0 ? u.raise(card, n) : card;
}
