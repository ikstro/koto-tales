import type { Skin, SkinId } from '../../contracts';
import { createHybridSkin } from './hybrid';
import { createPixelSkin } from './pixel';
import { createToySkin } from './toy';

const KEY = 'koto-tales-skin';

/** Skins that exist in this build. */
const FACTORIES: Partial<Record<SkinId, () => Skin>> = {
  pixel: createPixelSkin,
  toy: createToySkin,
  hybrid: createHybridSkin,
};

export function createSkin(wanted: SkinId | null): Skin {
  let id = wanted;
  if (!id) {
    try {
      id = localStorage.getItem(KEY) as SkinId | null;
    } catch {
      id = null;
    }
  }
  // The owner chose the hybrid look (2026-10-28): nature in pixels, everything built as glossy toy bricks.
  const make = (id && FACTORIES[id]) || FACTORIES.hybrid!;
  return make();
}
