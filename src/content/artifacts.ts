import type { Effect } from './effects';
import type { LineId } from './lines';

/**
 * Artifacts (CONTENT.md «Artifact», the owner's call 2026-10-30): one rare thing per tale or castle,
 * found at its end (`TaleCard.artifact`, `CastleCard.artifact`). While the party has it, its
 * `always` effect is on (systems/effects.ts). The album shows it in the «скарби» row with a gold rim.
 * Model: a builder in ARTIFACT_BUILDERS (assets/artifacts.ts). Kept in `save.artifacts`.
 */
export interface ArtifactCard {
  id: string;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** What it does, one sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** Said when it is found and when its sticker is tapped (`artifact_<id>`). */
  line: LineId;
  /** On while the party has it (never `home`). */
  always: Effect;
  /** Льоша made it up. */
  lyosha?: true;
}

/** The cards, in the album's order. */
export const ARTIFACTS: Record<string, ArtifactCard> = {
  queen_wreath: { id: 'queen_wreath', name: 'Вінок королеви', about: 'Поки він у героїв, сердечка всюди повертаються швидко.', line: 'artifact_queen_wreath', always: { kind: 'heal' } },
  nordic_poles: { id: 'nordic_poles', name: 'Скандинавські палиці', about: 'Поки вони в героїв, усі бігають швидше.', line: 'artifact_nordic_poles', always: { kind: 'fast' } },
  golden_record: { id: 'golden_record', name: 'Золота платівка', about: 'Поки вона в героїв, монстри поруч танцюють.', line: 'artifact_golden_record', always: { kind: 'peace', reach: 5 } },
  eternal_torch: { id: 'eternal_torch', name: 'Вічний ліхтарик', about: 'Поки він у героїв, уночі поруч не з’являються монстри.', line: 'artifact_eternal_torch', always: { kind: 'light', reach: 9 } },
  babusia_watch: { id: 'babusia_watch', name: 'Бабусин годинник', about: 'Поки він у героїв, монстри зовсім близько стоять і чекають.', line: 'artifact_babusia_watch', always: { kind: 'freeze', reach: 4 } },
};

export type ArtifactId = string;
export const ARTIFACT_ORDER = (): string[] => Object.keys(ARTIFACTS);
