import type { Skin, SkinId } from '../../contracts';
import { createDioramaSkin } from './diorama';
import { createHybridSkin } from './hybrid';
import { createPixelSkin } from './pixel';
import { createToySkin } from './toy';

const KEY = 'koto-tales-skin';

/** Every look the URL / storage can ask for. 'diorama' reports itself as 'toy' (SkinId is frozen). */
export type AnySkin = SkinId | 'diorama';
export const SKIN_NAMES: readonly AnySkin[] = ['pixel', 'toy', 'hybrid', 'diorama'];

/** Skins that exist in this build. */
const FACTORIES: Partial<Record<AnySkin, () => Skin>> = {
  pixel: createPixelSkin,
  toy: createToySkin,
  hybrid: createHybridSkin,
  diorama: createDioramaSkin,
};

export function createSkin(wanted: AnySkin | null): Skin {
  let id = wanted;
  if (!id) {
    try {
      id = localStorage.getItem(KEY) as AnySkin | null;
    } catch {
      id = null;
    }
  }
  // The owner chose the golden-hour diorama look (2026-10-28); pixel, toy and hybrid stay reachable by URL.
  const make = (id && FACTORIES[id]) || FACTORIES.diorama!;
  return make();
}
