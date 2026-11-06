/**
 * The little rules of Бабуся's machines (DESIGN.md «Her gifts»), pure so they can be tested:
 * what the piano's keys play, what the drums do in turn, what the surprise machine holds, and
 * how a rainbow bridge finds a place across the water. systems/gadgets.ts runs them.
 */

/** A piano key's note (midi): a plain scale, from the left end of the path. */
export const PIANO_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];

/** Which key a foot at `x` stands on, on a path whose left edge is `left` (-1: off it). */
export function keyAt(x: number, left: number): number {
  const i = Math.floor(x - left);
  return i >= 0 && i < PIANO_NOTES.length ? i : -1;
}

/** The drums in turn: big drum, snare, big drum, snare, and now and then the cymbal. */
const DRUM_ROUND = [0, 1, 0, 1, 0, 1, 2] as const;
export const drumAt = (n: number): 0 | 1 | 2 => DRUM_ROUND[n % DRUM_ROUND.length];

/** After a drum hit monsters this close dance this long (seconds). */
export const DRUM = { reach: 9, dance: 2.5 };

/** The karaoke's tune: five friendly notes, stepped through while the party sings. */
const SING = [69, 72, 74, 76, 79, 76, 74, 72];
export const singAt = (n: number): number => SING[n % SING.length];

/** The surprise machine: what one go costs and what it may give. */
export const SURPRISE_PRICE = 10;
export const SURPRISES = ['babusia_pie', 'babusia_cutlet', 'pocket_speaker', 'pocket_cloud', 'magic_can', 'super_torch', 'freeze_popper', 'rubber_fish'] as const;
export const pickSurprise = (r: number): (typeof SURPRISES)[number] => SURPRISES[Math.min(SURPRISES.length - 1, Math.floor(r * SURPRISES.length))];

/** The magic can: how many flowers come up per use, how far out, and how many stay in the world. */
export const BLOOM = { flowers: 12, reach: 4, keep: 72 };

/** Spots for one can's flowers round (x, z): a loose ring, never right under the hero. */
export function bloomSpots(x: number, z: number, rand: () => number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < BLOOM.flowers; i++) {
    const a = ((i + rand() * 0.7) / BLOOM.flowers) * Math.PI * 2;
    const d = 1.2 + rand() * (BLOOM.reach - 1.2);
    out.push([x + Math.sin(a) * d, z + Math.cos(a) * d]);
  }
  return out;
}

/** The ground a rainbow bridge looks at: height and whether a cell is water. */
export interface SpanGround {
  height(x: number, z: number): number;
  wet(x: number, z: number): boolean;
}

/** A place across the water: the footprint's min corner, the deck's height, quarter turns. */
export interface SpanSpot {
  x: number;
  z: number;
  y: number;
  rot: number;
}

/** Whether a `len`-long, 2-wide run starting at (x, z) along x (`rot` 0) or z (`rot` 1) crosses water from bank to bank. */
function fits(g: SpanGround, x: number, z: number, len: number, rot: number, fy: number): SpanSpot | null {
  const cell = (i: number, side: number): [number, number] => (rot ? [x + side, z + i] : [x + i, z + side]);
  let deck = -Infinity;
  for (const i of [0, len - 1]) {
    for (const side of [0, 1]) {
      const [cx, cz] = cell(i, side);
      if (g.wet(cx, cz)) return null;
      deck = Math.max(deck, g.height(cx, cz));
    }
  }
  if (Math.abs(deck - fy) > 2) return null;
  let wet = 0;
  for (let i = 1; i < len - 1; i++) {
    for (const side of [0, 1]) {
      const [cx, cz] = cell(i, side);
      if (g.height(cx, cz) > deck) return null;
      if (g.wet(cx, cz)) wet++;
    }
  }
  return wet >= 4 ? { x, z, y: deck, rot } : null;
}

/** The nearest place around (px, pz) where a bridge of `len` blocks crosses water; null: no water to cross here. */
export function findSpan(g: SpanGround, len: number, px: number, pz: number, py: number, around = 10): SpanSpot | null {
  const tries: [number, number, number, number][] = [];
  for (const rot of [0, 1]) {
    for (let oz = -around; oz <= around; oz++) {
      for (let ox = -around; ox <= around; ox++) {
        const [mx, mz] = rot ? [0.5, len / 2] : [len / 2, 0.5];
        const x = Math.floor(px) + ox;
        const z = Math.floor(pz) + oz;
        tries.push([x, z, rot, Math.hypot(x + mx - px, z + mz - pz)]);
      }
    }
  }
  tries.sort((a, b) => a[3] - b[3]);
  for (const [x, z, rot] of tries) {
    const s = fits(g, x, z, len, rot, Math.floor(py));
    if (s) return s;
  }
  return null;
}
