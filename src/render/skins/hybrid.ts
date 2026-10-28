/**
 * Hybrid skin: nature stays pixel (grass, earth, stone, sand, snow, wood,
 * leaves, water keep the pixel atlas, rough and matte), everything a child
 * builds is a glossy toy brick with bevel and studs. Characters and items are
 * glossy plastic; lighting and the miniature post pass are the toy skin's.
 */
import type { Skin } from '../../contracts';
import { createBrickSkin } from './toy';

export function createHybridSkin(): Skin {
  return createBrickSkin({ id: 'hybrid', pixelNatural: true });
}
