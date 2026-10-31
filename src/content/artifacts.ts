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
export const ARTIFACTS: Record<string, ArtifactCard> = {};

export type ArtifactId = string;
export const ARTIFACT_ORDER = (): string[] => Object.keys(ARTIFACTS);
