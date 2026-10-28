/**
 * How often Пупся talks (DESIGN.md «Voice»). The owner's report: she spoke all the time. The rules
 * here are pure (no audio, no scene) so they are tested on their own; narration.ts and boss.ts
 * feed them what is happening.
 */

/** Her thoughts («мудрості»): every 5–6 minutes, only in a calm moment. */
export const WISDOM_PACE = {
  minS: 300,
  maxS: 360,
  /** Seconds of silence wanted before a thought (never right after another line). */
  quietS: 20,
  /** No thought while a monster is this close (blocks). */
  monsterRange: 12,
};

export interface Calm {
  /** Seconds since the last voice line ended (0 while one is playing). */
  quietS: number;
  /** Distance to the nearest monster (Infinity when none). */
  monsterDist: number;
  inBossZone: boolean;
}

export const nextWisdomIn = (r: number): number => WISDOM_PACE.minS + r * (WISDOM_PACE.maxS - WISDOM_PACE.minS);

export const calmForWisdom = (c: Calm): boolean =>
  c.quietS >= WISDOM_PACE.quietS && c.monsterDist > WISDOM_PACE.monsterRange && !c.inBossZone;

/**
 * Counts down to the next thought. When it is due but the moment is not calm, it waits (it does
 * not skip): the thought comes at the first calm moment, then the clock starts again.
 */
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

/** Seconds in the wasteland without a new lantern before the stone hint may come once more. */
export const STONE_REMINDER_S = 90;

/**
 * Пупся's hints in the boss fight:
 *   stone  — once per fight; once more only after 90 s in the zone with no lantern placed;
 *   mouth  — once, after the armour breaks;
 *   stomp  — once per session (a new fight does not reset it).
 * The lantern lines (one per lantern) are the fight's own events, not hints.
 */
export class BossHints {
  private stoneSaid = false;
  private reminderUsed = false;
  private mouthSaid = false;
  private stompSaid = false;
  /** Seconds in the zone since the stone line or the last lantern, while the armour holds. */
  private idle = 0;

  /** A new boss (first spawn or its return). */
  newFight(): void {
    this.stoneSaid = false;
    this.reminderUsed = false;
    this.mouthSaid = false;
    this.idle = 0;
  }

  /** The first stone line of the fight (zone entry or the first arrow that bounces). */
  stone(): boolean {
    if (this.stoneSaid) return false;
    this.stoneSaid = true;
    this.idle = 0;
    return true;
  }

  /** Time in the fight; true once, when the reminder is due. */
  tick(dt: number, inZone: boolean, armored: boolean): boolean {
    if (!inZone || !armored || !this.stoneSaid || this.reminderUsed) return false;
    this.idle += dt;
    if (this.idle < STONE_REMINDER_S) return false;
    this.reminderUsed = true;
    return true;
  }

  lantern(): void {
    this.idle = 0;
  }

  mouth(): boolean {
    if (this.mouthSaid) return false;
    this.mouthSaid = true;
    return true;
  }

  stomp(): boolean {
    if (this.stompSaid) return false;
    this.stompSaid = true;
    return true;
  }

  /** The boss card already explained it (the guide popped up): counts as that hint. */
  told(armored: boolean): void {
    if (armored) {
      this.stoneSaid = true;
      this.idle = 0;
    } else this.mouthSaid = true;
  }
}
