/**
 * Effects (CONTENT.md «Effect»): one shape for what an item does when used (timed) and what an
 * artifact keeps on while the party has it (always). Each kind calls a code path the game already
 * has (systems/effects.ts): the picnic's full hearts, the ice cream's fast running, the music's
 * dancing, the searchlight's freeze, the lamps' calm, the portal home.
 *
 * A new kind = one entry in EFFECTS + one branch in systems/effects.ts (engine work).
 */

export type EffectKind = 'heal' | 'fast' | 'peace' | 'freeze' | 'light' | 'home';

export interface Effect {
  kind: EffectKind;
  /** Seconds it lasts when used (an item); ignored by `always`. */
  for?: number;
  /** Blocks around the party it reaches (peace, freeze, light). */
  reach?: number;
}

export interface EffectKindCard {
  /** Default seconds when used (0: at once). */
  for: number;
  /** Default reach in blocks (0: the party itself). */
  reach: number;
  /** Allowed as an artifact's `always`. */
  always: boolean;
  /** The sparkle ring's colour when it starts. */
  color: number;
}

export const EFFECTS: Record<EffectKind, EffectKindCard> = {
  // every heart full at once; always: hearts come back fast everywhere
  heal: { for: 0, reach: 0, always: true, color: 0xee6a82 },
  // running ×1.5 (the ice cream's); always: all the time
  fast: { for: 20, reach: 0, always: true, color: 0xffd23a },
  // monsters near the party dance and do not bite (music's peace)
  peace: { for: 10, reach: 9, always: true, color: 0xa66bff },
  // monsters near the party stand still and wait (the searchlight's freeze)
  freeze: { for: 3, reach: 10, always: true, color: 0x8fe3ff },
  // no monster appears near the party (the lamps' calm); always: at night
  light: { for: 60, reach: 8, always: true, color: 0xffe3a3 },
  // the party is carried home (the portal's way)
  home: { for: 0, reach: 0, always: false, color: 0x2f918b },
};

/** An effect with its defaults filled in. */
export function resolve(e: Effect): Required<Effect> {
  const d = EFFECTS[e.kind];
  return { kind: e.kind, for: e.for ?? d.for, reach: e.reach ?? d.reach };
}

/** Timed effects under way (an item used): each runs down; the strongest of a kind wins. */
export class EffectTimers {
  list: { kind: EffectKind; left: number; reach: number }[] = [];

  start(e: Effect): void {
    const r = resolve(e);
    if (r.for > 0) this.list.push({ kind: r.kind, left: r.for, reach: r.reach });
  }

  tick(dt: number): void {
    for (const t of this.list) t.left -= dt;
    this.list = this.list.filter((t) => t.left > 0);
  }

  /** The widest reach of a kind under way, or null when none is. */
  reach(kind: EffectKind): number | null {
    let best: number | null = null;
    for (const t of this.list) if (t.kind === kind && (best === null || t.reach > best)) best = t.reach;
    return best;
  }

  /** Seconds left of a kind (the longest), 0 when none. */
  left(kind: EffectKind): number {
    return this.list.reduce((m, t) => (t.kind === kind ? Math.max(m, t.left) : m), 0);
  }

  clear(): void {
    this.list = [];
  }
}
