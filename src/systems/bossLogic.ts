/**
 * The rules of the boss fight, without any 3D: what breaks the armour, when
 * the mouth opens, when it stomps, when it comes back, where it lives. The
 * scene side (systems/boss.ts) moves the model and asks this brain what to do.
 *
 * The fight, as a child plays it:
 *   1. armour  — it is stone: arrows and bolts bounce off («дзинь»), no damage;
 *   2. light   — each lantern placed in its wasteland cracks the armour; 3 break it;
 *   3. mouth   — then it opens its cave mouth now and then; shots into the open mouth hurt;
 *   4. stomp   — a hero close by sees a ring of cracks, then the ground jumps (1 heart).
 * It never wins: out of hearts the hero naps at home, the boss keeps its wounds.
 */
import { hash2, mulberry32 } from '../world/rng';

export const BOSS = {
  /** The wasteland around the lair, in blocks. */
  zoneRadius: 22,
  /** The lair is this far from the house. */
  siteMin: 140,
  siteMax: 180,
  baseHp: 30,
  /** Each return: +30% health, +10% size. */
  hpPerLevel: 0.3,
  sizePerLevel: 0.1,
  lanterns: 3,
  /** Seconds between mouth openings / how long it stays open (divided by the difficulty's tempo). */
  mouthEvery: 5,
  mouthOpen: 1.6,
  /** A stomp every [min, max] s while a hero is within `stompRange`; it warns `stompWarn` s ahead. */
  stompEvery: [7, 9] as [number, number],
  stompRange: 8,
  stompRadius: 5,
  stompWarn: 1,
  /** It bites the ground in front of it this often, at most `bitesPerLevel` × level times per visit. */
  biteEvery: 2.6,
  bitesPerLevel: 30,
  /** In-game days until it comes back after a defeat. */
  returnDays: 3,
  /** It turns towards a hero this close; the HUD bar shows this close. */
  sight: 12,
  /** Music reaching it: it dances this long (no stomp, no bite, mouth shut), then music can't move it for `danceRest`. */
  danceFor: 6,
  danceRest: 30,
  barRange: 30,
  roamSpeed: 0.85,
  coins: 30,
};

export const bossMaxHp = (level: number, hpMul: number): number => Math.max(1, Math.round(BOSS.baseHp * hpMul * (1 + BOSS.hpPerLevel * (level - 1))));
export const bossScale = (level: number): number => 1 + BOSS.sizePerLevel * (level - 1);
export const shouldReturn = (day: number, defeatedDay: number | null): boolean => defeatedDay !== null && day - defeatedDay >= BOSS.returnDays;

/**
 * Where the lair is for this world and this level: the same every time.
 * Candidates lie 140–180 blocks from home in a direction picked by the seed;
 * `good` says whether a spot is dry open land (the first one that is wins).
 */
export function pickSite(seed: number, level: number, home: { x: number; z: number }, good: (x: number, z: number) => boolean): [number, number] {
  const rand = mulberry32(hash2(seed, 0xb055, level));
  let first: [number, number] | null = null;
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const d = BOSS.siteMin + 6 + rand() * (BOSS.siteMax - BOSS.siteMin - 12);
    const x = Math.round(home.x + Math.sin(a) * d);
    const z = Math.round(home.z + Math.cos(a) * d);
    first ??= [x, z];
    if (good(x, z)) return [x, z];
  }
  return first!;
}

export type BossEvent = 'mouth-open' | 'mouth-close' | 'stomp-warn' | 'stomp' | 'dance' | 'dance-end';
export type HitResult = 'bounce' | 'hurt' | 'defeated';

export interface BrainInit {
  maxHp: number;
  hp?: number | null;
  lanterns?: string[];
  /** Difficulty tempo (1 = normal). */
  tempo: number;
  rand?: () => number;
}

export class BossBrain {
  readonly maxHp: number;
  hp: number;
  lanterns: string[];
  tempo: number;
  mouthOpen = false;
  /** Seconds left of the stomp warning (0 = no stomp coming). */
  stompWarn = 0;
  /** Seconds left of a dance to the music (0 = not dancing), and of the rest after one. */
  dance = 0;
  danceRest = 0;
  private mouthT: number;
  private stompT: number;
  private rand: () => number;

  constructor(o: BrainInit) {
    this.maxHp = o.maxHp;
    this.hp = Math.min(o.maxHp, Math.max(0, o.hp ?? o.maxHp));
    this.lanterns = [...(o.lanterns ?? [])].slice(0, BOSS.lanterns);
    this.tempo = o.tempo;
    this.rand = o.rand ?? Math.random;
    this.mouthT = this.mouthEvery * 0.6;
    this.stompT = this.nextStomp();
  }

  get armored(): boolean {
    return this.lanterns.length < BOSS.lanterns;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get mouthEvery(): number {
    return BOSS.mouthEvery / this.tempo;
  }

  get mouthOpenTime(): number {
    return BOSS.mouthOpen / this.tempo;
  }

  private nextStomp(): number {
    const [lo, hi] = BOSS.stompEvery;
    return (lo + this.rand() * (hi - lo)) / this.tempo;
  }

  /** A lantern placed in the zone (keyed by its block, so one spot counts once). */
  addLantern(key: string): 'crack' | 'broken' | null {
    if (!this.armored || !this.alive || this.lanterns.includes(key)) return null;
    this.lanterns.push(key);
    if (this.armored) return 'crack';
    // the armour just broke: the first opening comes soon
    this.mouthT = Math.min(this.mouthT, 1.2);
    return 'broken';
  }

  /** A shot landed on the mouth or on the stone. Only the open mouth of an unarmoured boss is hurt. */
  hit(where: 'mouth' | 'body', damage: number): HitResult {
    if (!this.alive || this.armored || where !== 'mouth' || !this.mouthOpen) return 'bounce';
    this.hp = Math.max(0, this.hp - damage);
    return this.hp <= 0 ? 'defeated' : 'hurt';
  }

  /**
   * Advances the timers; `heroDist` is the nearest hero's distance in blocks (scaled to size by the caller),
   * `music` whether a playing speaker's dance circle reaches it.
   */
  step(dt: number, heroDist: number, stompRange = BOSS.stompRange, music = false): BossEvent[] {
    const ev: BossEvent[] = [];
    if (!this.alive) return ev;

    // music: a short dance (a breather, never a win), then it shakes it off and won't dance for a while
    if (this.dance > 0) {
      this.dance -= dt;
      if (this.dance <= 0) {
        this.dance = 0;
        this.danceRest = BOSS.danceRest;
        ev.push('dance-end');
      }
      return ev;
    }
    this.danceRest = Math.max(0, this.danceRest - dt);
    if (music && this.danceRest <= 0 && !this.mouthOpen && this.stompWarn <= 0) {
      this.dance = BOSS.danceFor;
      ev.push('dance');
      return ev;
    }

    if (!this.armored) {
      this.mouthT -= dt;
      if (this.mouthT <= 0) {
        this.mouthOpen = !this.mouthOpen;
        this.mouthT = this.mouthOpen ? this.mouthOpenTime : this.mouthEvery;
        ev.push(this.mouthOpen ? 'mouth-open' : 'mouth-close');
      }
    } else if (this.mouthOpen) {
      this.mouthOpen = false;
      ev.push('mouth-close');
    }

    if (this.stompWarn > 0) {
      this.stompWarn -= dt;
      if (this.stompWarn <= 0) {
        this.stompWarn = 0;
        this.stompT = this.nextStomp();
        ev.push('stomp');
      }
    } else if (heroDist < stompRange) {
      // the stomp clock only runs while someone is close
      this.stompT -= dt;
      if (this.stompT <= 0) {
        this.stompWarn = BOSS.stompWarn;
        ev.push('stomp-warn');
      }
    }
    return ev;
  }

  /** Test switch / screenshots: open the mouth now (unarmoured only). */
  forceMouth(): void {
    if (this.armored || this.mouthOpen) return;
    this.mouthT = 0;
  }

  forceStomp(): void {
    if (this.stompWarn <= 0) this.stompT = 0;
  }
}

/** Ground height of a column (feet level), as the world reports it. */
export type GroundAt = (x: number, z: number) => number;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Whether a hero standing on column (x, z) is shut in a hole: walking with one-block hops
 * (down any height) never leads `reach` columns away. `open` columns (water) count as a way out.
 */
export function trapped(ground: GroundAt, x: number, z: number, reach = 5, open?: (x: number, z: number) => boolean): boolean {
  const seen = new Set<string>([`${x},${z}`]);
  const todo: [number, number][] = [[x, z]];
  while (todo.length) {
    const [cx, cz] = todo.pop()!;
    if (Math.max(Math.abs(cx - x), Math.abs(cz - z)) >= reach || open?.(cx, cz)) return false;
    const g = ground(cx, cz);
    for (const [dx, dz] of SIDES) {
      const nx = cx + dx;
      const nz = cz + dz;
      const k = `${nx},${nz}`;
      if (seen.has(k) || ground(nx, nz) > g + 1) continue;
      seen.add(k);
      todo.push([nx, nz]);
    }
  }
  return true;
}

/**
 * Where a bite at (x, z) lands so the ground never shuts anyone in: the spot itself, or else its
 * highest neighbour (the crater grows wider, not deeper); null when neither can go.
 */
export function biteSpot(ground: GroundAt, x: number, z: number, open?: (x: number, z: number) => boolean): [number, number] | null {
  const tries: [number, number][] = [[x, z], ...SIDES.map(([dx, dz]) => [x + dx, z + dz] as [number, number]).sort((a, b) => ground(b[0], b[1]) - ground(a[0], a[1]))];
  for (const [bx, bz] of tries) {
    const lowered: GroundAt = (cx, cz) => ground(cx, cz) - (cx === bx && cz === bz ? 1 : 0);
    if (!trapped(lowered, bx, bz, 5, open)) return [bx, bz];
  }
  return null;
}
