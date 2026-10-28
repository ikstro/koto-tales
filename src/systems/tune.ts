import { DIFFICULTY, type DifficultyTune } from '../content/difficulty';
import type { Ctx } from '../core/ctx';

/** The difficulty numbers in force right now (pause menu → save). */
export const tuneOf = (ctx: Ctx): DifficultyTune => DIFFICULTY[ctx.save.difficulty] ?? DIFFICULTY.normal;
