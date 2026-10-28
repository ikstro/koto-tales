/**
 * How often Пупся talks (DESIGN.md «Voice»). The owner wants her chatty: she
 * is the strategist who keeps the child company, so these rules only stop her
 * from talking over herself. Pure logic, tested on its own; narration.ts and
 * boss.ts feed it what is happening.
 */

/** Her thoughts («мудрості»): every ~2–3 minutes, whenever no other line is playing. */
export const WISDOM_PACE = {
  minS: 100,
  maxS: 170,
};

export interface Calm {
  /** Seconds since the last voice line ended (0 while one is playing). */
  quietS: number;
  /** Distance to the nearest monster (Infinity when none). Informational. */
  monsterDist: number;
  inBossZone: boolean;
}

export const nextWisdomIn = (r: number): number => WISDOM_PACE.minS + r * (WISDOM_PACE.maxS - WISDOM_PACE.minS);

/** A thought never cuts into another line; that is the only condition. */
export const calmForWisdom = (c: Calm): boolean => c.quietS > 0;

/** Counts down to the next thought; when due during another line, it waits for that line to end. */
export class WisdomClock {
  left: number;

  constructor(private rand: () => number = Math.random) {
    this.left = nextWisdomIn(rand());
  }

  /** True when a thought may be said now. */
  step(dt: number, calm: Calm): boolean {
    this.left -= dt;
    if (this.left > 0 || !calmForWisdom(calm)) return false;
    this.left = nextWisdomIn(this.rand());
    return true;
  }
}

/** Seconds between repeats of the stone hint while arrows keep bouncing off the armour. */
export const STONE_REPEAT_S = 25;
/** Seconds between repeats of the mouth hint while shots miss the closed mouth. */
export const MOUTH_REPEAT_S = 35;

/**
 * Пупся's hints in the boss fight, as they were first designed:
 *   stone — whenever an arrow bounces off the armour, at most every 25 s;
 *   mouth — after the armour breaks, and whenever a shot hits the closed mouth, at most every 35 s;
 *   stomp — once per session.
 * The lantern lines (one per lantern) are the fight's own events, not hints.
 */
export class BossHints {
  private t = 0;
  private lastStone = -Infinity;
  private lastMouth = -Infinity;
  private stompSaid = false;

  /** A new boss (first spawn or its return): hints may come at once. */
  newFight(): void {
    this.lastStone = -Infinity;
    this.lastMouth = -Infinity;
  }

  stone(): boolean {
    if (this.t - this.lastStone < STONE_REPEAT_S) return false;
    this.lastStone = this.t;
    return true;
  }

  mouth(): boolean {
    if (this.t - this.lastMouth < MOUTH_REPEAT_S) return false;
    this.lastMouth = this.t;
    return true;
  }

  stomp(): boolean {
    if (this.stompSaid) return false;
    this.stompSaid = true;
    return true;
  }

  /** Advances the fight's clock. Repeats come from hits, so it never asks for a line by itself. */
  tick(dt: number, _inZone: boolean, _armored: boolean): boolean {
    this.t += dt;
    return false;
  }

  lantern(): void {}

  /** The boss card just explained it: the matching hint waits its normal pause before repeating. */
  told(armored: boolean): void {
    if (armored) this.lastStone = this.t;
    else this.lastMouth = this.t;
  }
}
