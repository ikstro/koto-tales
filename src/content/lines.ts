import type { Line } from '../contracts';
import lines from './lines.json';

/** Every voice line id; a typo in a card is a type error, not a silent mute. */
export type LineId = keyof typeof lines;
export const LINES = lines as Record<LineId, Line>;
