/**
 * Pure rules of the castles' prizes, kept apart from the systems so tests can load them.
 */

/** What the golem's choice needs to know about a monster. */
export interface SlamCandidate {
  alive: boolean;
  state: string;
  pos: { x: number; z: number };
}

/**
 * The monster a golem at (x, z) slams: the nearest one within `reach` that is neither dancing
 * (music means peace) nor waiting at a red light or caught in a beam (it is already stopped).
 */
export function slamTarget<M extends SlamCandidate>(monsters: readonly M[], x: number, z: number, reach: number): M | null {
  let best: M | null = null;
  let bd = reach;
  for (const m of monsters) {
    if (!m.alive || m.state === 'dance' || m.state === 'wait') continue;
    const d = Math.hypot(m.pos.x - x, m.pos.z - z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}
