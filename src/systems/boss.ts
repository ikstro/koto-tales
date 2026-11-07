/**
 * The two giants in the world: «Пожирач земель», the stone Land Eater of a dry
 * wasteland it has eaten bare, and «Шелохмаське чудовисько», the monster of a
 * far lake. One of them is up at a time — a chance pick after every defeat —
 * and each keeps its own level. The fight is one shape: baits placed in its
 * lair crack the armour (lanterns by the Eater, fish lure the lake monster out
 * of its water), then shots into the open mouth hurt. The rules live in
 * systems/bossLogic.ts.
 *
 * Neither is in `ctx.monsters`: it is one entity, `ctx.boss`, and combat asks it
 * directly (`hitTest`, `strike`, `mouthPoint`).
 */
import * as THREE from 'three';
import { SEA_LEVEL, type CharacterModel } from '../contracts';
import { turnTowards, yawOf, type Hero } from '../actors/entities';
import { placeOnGround } from '../actors/physics';
import { Kit } from '../assets/parts/kit';
import type { LineId } from '../content/lines';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { setMapMarker } from '../ui/map';
import { music } from '../voice/music';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { B } from '../world/blocks';
import { hash2 } from '../world/rng';
import { BOSS, BOSS_KINDS, BossBrain, biteSpot, bossMaxHp, bossScale, lakeSpots, nextBossKind, pickLake, pickSite, shouldReturn, trapped, type BossKind, type GroundAt, type HitResult } from './bossLogic';
import { hurtHero } from './combat';
import { devour, landingSpot, pick, pickedByBoss, playingSpeakers, selectedBuilding, standingWhere } from './kit';
import { dropCoins } from './pickups';
import { freshBoss } from './save';
import { BossHints } from './pacing';
import { tuneOf } from './tune';
import type { BuildingId } from '../content/buildings';

// ─── what each giant says (their own voice, Пупся's hints, the guide card) ──

interface BossLines {
  spot: LineId;
  roar: LineId;
  return: LineId;
  weak: LineId;
  defeated: LineId;
  far: LineId;
  /** Why the arrows do nothing yet (the armour hint). */
  shy: LineId;
  /** One more bait taken (a lantern lit, a fish gone). */
  bait: LineId;
  mouth: LineId;
  stomp: LineId;
  dance: LineId;
  guide: LineId;
}

const LINES: Record<BossKind, BossLines> = {
  eater: {
    spot: 'boss_spot',
    roar: 'boss_roar',
    return: 'boss_return',
    weak: 'boss_weak',
    defeated: 'boss_defeated',
    far: 'pupsia_boss_far',
    shy: 'pupsia_boss_stone',
    bait: 'pupsia_boss_lantern',
    mouth: 'pupsia_boss_mouth',
    stomp: 'pupsia_boss_stomp',
    dance: 'boss_dance',
    guide: 'guide_boss',
  },
  nessie: {
    spot: 'nessie_spot',
    roar: 'nessie_roar',
    return: 'nessie_return',
    weak: 'nessie_weak',
    defeated: 'nessie_defeated',
    far: 'pupsia_nessie_far',
    shy: 'pupsia_nessie_shy',
    bait: 'pupsia_nessie_fish',
    mouth: 'pupsia_nessie_mouth',
    stomp: 'pupsia_nessie_slap',
    dance: 'nessie_dance',
    guide: 'guide_nessie',
  },
};

/** The scene's own colours: the defeat dust and the stomp's rings. */
const SCENE: Record<BossKind, { dust: number; ringA: number; ringB: number }> = {
  eater: { dust: 0x50565f, ringA: 0xb08a5a, ringB: 0xffa040 },
  nessie: { dust: 0x4a9683, ringA: 0x6fc9e0, ringB: 0xbfeef7 },
};

// ─── each model's own measures (model units, before the level scale) ────────

interface Measures {
  /** Centre of the mouth and the radius that counts as "in the mouth" (a model
   *  may instead name a `bossMouth` node at the spot, which follows its neck). */
  mouth: [number, number, number];
  mouthR: number;
  /** Around the mouth node: shots this close hit the head, not the mouth. */
  headR?: number;
  /** Stone body boxes: |x| < hx, y0 < y < y1, |z| < hz. */
  boxes: [number, number, number, number][];
  /** Heroes are kept out of a capsule along the body: z in ±pushZ, radius pushR. */
  pushZ: number;
  pushR: number;
  /** Where it bites: this far in front of its centre (only the Eater bites). */
  biteAt: number;
  /** The stomp's circle is centred between its front feet. */
  stompZ: number;
  /** A swimming giant rides this deep while it is shy, rising `sinkStep` per bait. */
  sink?: number;
  sinkStep?: number;
  /** Its neck is pitched down this much per missing bait. */
  pitchStep?: number;
}

const MEASURES: Record<BossKind, Measures> = {
  eater: {
    mouth: [0, 2.2, 4.7],
    mouthR: 1.85,
    boxes: [[3.6, 0.2, 6.3, 5.0]],
    pushZ: 3.3,
    pushR: 3.7,
    biteAt: 6.3,
    stompZ: 2.5,
  },
  nessie: {
    mouth: [0, 6.4, 7.5],
    mouthR: 1.4,
    headR: 2.3,
    // the hull; the neck and head are asked through the `bossMouth` node
    boxes: [[2.35, 0.3, 3.2, 4.6]],
    pushZ: 3.4,
    pushR: 3.0,
    biteAt: 0,
    stompZ: 2.0,
    sink: 2.1,
    sinkStep: 0.55,
    pitchStep: 0.16,
  },
};

/** Ground the wasteland's lair leaves alone. */
const EATABLE = new Set<number>([B.GRASS, B.DIRT, B.SAND, B.SNOW]);
const BITABLE = new Set<number>([B.GRASS, B.DIRT, B.SAND, B.SNOW, B.STONE, B.COBBLE]);
/** Blocks the wasteland leaves behind (and that grow back when it is beaten). */
const EATEN = new Set<number>([B.AIR, B.STONE, B.COBBLE]);
/** Remembered in save.said once the boss card has popped up by itself. */
const guideLineOf = (kind: BossKind): LineId => LINES[kind].guide;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// ─── the boss entity ────────────────────────────────────────────────────────

export class Boss {
  readonly brain: BossBrain;
  readonly kind: BossKind;
  readonly model: CharacterModel;
  /** Feet centre; the map mark follows this vector live. */
  readonly pos = new THREE.Vector3();
  readonly site: THREE.Vector3;
  readonly level: number;
  readonly scale: number;
  readonly zoneRadius = BOSS.zoneRadius;
  readonly measures: Measures;
  /** A swimming giant rides low in its lake. */
  readonly water: boolean;
  yaw = 0;
  speed = 0;
  /** Where it strolls to next, and when it picks another spot. */
  readonly target = new THREE.Vector3();
  wanderT = 0;
  biteT = BOSS.biteEvery;
  /** 0 shut … 1 open (eased), and a short half-open chomp while biting. */
  private jawK = 0;
  chomp = 0;
  /** Eyes flare when it is hurt, roars or opens its mouth. */
  flare = 0;
  /** Seconds of a hurt shudder left. */
  flinch = 0;
  private jaw: THREE.Object3D | null;
  private eyes: THREE.Object3D | null;
  private ember: THREE.Object3D | null;
  /** The lake monster's neck (its head pivot), pitched down while it is shy. */
  private neck: THREE.Object3D | null;
  private neckK = 0;
  private sinkK = 0;
  /** A node at the mouth spot if the model has one (it follows the neck); else the measures' point. */
  private mouthNode: THREE.Object3D | null;
  private cracks: THREE.Object3D[];
  private shownCracks = -1;
  readonly stompRing: THREE.Group;
  /** The bricks it crumbles into; in the scene from the start (one hidden piece) so its shader is ready. */
  readonly bricks: THREE.InstancedMesh;
  ringT = 0;
  /** The warning ring floats just over the highest ground under it, so no block hides it. */
  ringY = 0;
  /** Centre of the stomp circle (between the front feet), refreshed every frame. */
  readonly stompAt = new THREE.Vector3();

  constructor(ctx: Ctx, kind: BossKind, level: number, site: [number, number], brain: BossBrain) {
    this.brain = brain;
    this.kind = kind;
    this.level = level;
    this.scale = bossScale(level);
    this.water = BOSS_KINDS[kind].water;
    this.measures = MEASURES[kind];
    const gy = this.water ? SEA_LEVEL : ctx.world.groundHeight(site[0], site[1]);
    this.site = new THREE.Vector3(site[0] + 0.5, gy, site[1] + 0.5);
    this.pos.copy(this.site);
    this.target.copy(this.site);
    this.model = ctx.models.character({ kind: 'parts', id: BOSS_KINDS[kind].model });
    const root = this.model.root;
    root.scale.setScalar(this.scale);
    // one shadow caster: the body (the parts file switched every other mesh off)
    root.userData.casts = true;
    root.userData.boss = true;
    this.jaw = root.getObjectByName('jaw') ?? null;
    this.eyes = root.getObjectByName('bossEyes') ?? null;
    this.ember = root.getObjectByName('ember') ?? null;
    this.neck = root.getObjectByName('head') ?? null;
    this.mouthNode = root.getObjectByName('bossMouth') ?? null;
    this.cracks = [1, 2, 3].map((i) => root.getObjectByName(`crack${i}`)).filter((o): o is THREE.Object3D => !!o);
    this.model.update(0, 0);
    this.sync(0);
    ctx.scene.add(root);
    this.stompRing = stompRing(ctx, kind, this.level, BOSS.stompRadius * this.scale);
    ctx.scene.add(this.stompRing);
    this.bricks = crumbleBricks(ctx);
    ctx.scene.add(this.bricks);
  }

  get alive(): boolean {
    return this.brain.alive;
  }

  get lines(): BossLines {
    return LINES[this.kind];
  }

  /** World point → model units (unscaled, unrotated) around the feet centre. */
  toLocal(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const dx = (p.x - this.pos.x) / this.scale;
    const dz = (p.z - this.pos.z) / this.scale;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(dx * c - dz * s, (p.y - this.pos.y) / this.scale, dx * s + dz * c);
  }

  /** Model units → world point. */
  toWorld(lx: number, ly: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(this.pos.x + (lx * c + lz * s) * this.scale, this.pos.y + ly * this.scale, this.pos.z + (-lx * s + lz * c) * this.scale);
  }

  mouthPoint(out: THREE.Vector3): THREE.Vector3 {
    if (this.mouthNode) return this.mouthNode.getWorldPosition(out);
    const m = this.measures.mouth;
    return this.toWorld(m[0], m[1], m[2], out);
  }

  /** Horizontal distance from a point to the mouth (how far the auto-aim reaches for it). */
  aimDistance(from: THREE.Vector3): number {
    this.mouthPoint(tmp2);
    return Math.hypot(tmp2.x - from.x, tmp2.z - from.z);
  }

  /** What a shot at this point touches: the mouth, the stone, or nothing. */
  hitTest(p: THREE.Vector3): 'mouth' | 'body' | null {
    if (!this.alive) return null;
    const m = this.measures;
    if (this.mouthNode) {
      // a model whose mouth rides a moving neck: ask the node where it is now
      const l = this.mouthNode.worldToLocal(tmp.copy(p));
      const d = l.length();
      if (d < m.mouthR) return 'mouth';
      if (m.headR && d < m.headR) return 'body';
    } else {
      const l = this.toLocal(p, tmp);
      if (l.distanceTo(tmp2.set(m.mouth[0], m.mouth[1], m.mouth[2])) < m.mouthR) return 'mouth';
    }
    const l = this.toLocal(p, tmp);
    for (const [hx, y0, y1, hz] of m.boxes) if (Math.abs(l.x) < hx && l.y > y0 && l.y < y1 && Math.abs(l.z) < hz) return 'body';
    return null;
  }

  inZone(x: number, z: number, margin = 0): boolean {
    return Math.hypot(x - this.site.x, z - this.site.z) < this.zoneRadius + margin;
  }

  /** Helpers shoot at it only while its mouth is open and the armour is gone. */
  isTarget(from: THREE.Vector3, range: number): boolean {
    return this.alive && !this.brain.armored && this.brain.mouthOpen && this.aimDistance(from) < range;
  }

  /** An arrow or a bolt landed: sparks off stone, or a real hit in the open mouth. */
  strike(ctx: Ctx, where: 'mouth' | 'body', damage: number, at: THREE.Vector3): HitResult {
    const r = this.brain.hit(where, damage);
    if (r === 'bounce') {
      ctx.effects.sparkle(at, 0xfff1a8);
      ctx.effects.poof(at, 0x9aa0a8, 4);
      sfx.play('clink', { pitch: 0.92 + Math.random() * 0.16 });
      // a bounce reminds of the stone, a shot at the closed mouth reminds to wait for it (pacing.ts)
      armourHint(this);
    } else {
      this.flare = 1;
      // a flinch rather than the monsters' blink: a huge flickering beast would be too much
      this.flinch = 0.3;
      ctx.effects.sparkle(this.mouthPoint(tmp), 0xffb12e);
      ctx.effects.poof(tmp, 0xffa526, 8);
      sfx.play('hit', { pitch: 0.6 });
      if (r === 'defeated') defeat(ctx, this);
    }
    return r;
  }

  sync(dt: number): void {
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    // the lake monster rides low while it is shy; each fish lures it higher, and proud once the armour breaks
    const m = this.measures;
    const sinkWant = this.water && this.brain.armored ? Math.max(0.45, m.sink! - this.brain.baits.length * m.sinkStep!) : 0;
    this.sinkK += (sinkWant - this.sinkK) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 1.6));
    r.position.y -= this.sinkK * this.scale;
    if (this.flinch > 0) {
      this.flinch = Math.max(0, this.flinch - dt);
      const k = this.flinch * 0.5 * this.scale;
      r.position.x += Math.sin(this.flinch * 90) * k;
      r.position.y += Math.abs(Math.sin(this.flinch * 70)) * k * 0.5;
    }
    // dancing to the music: it rocks side to side and bobs on the beat, its jaw snapping along
    const dancing = this.brain.dance > 0;
    const beat = dancing ? Math.sin(music.beat() * Math.PI) : 0;
    if (dancing) {
      r.rotation.z = beat * 0.08;
      r.position.y += Math.abs(beat) * 0.3 * this.scale;
    } else r.rotation.z = 0;
    // a big beast takes long, slow steps
    this.model.update(dt, this.speed * 1.4);
    // its neck lifts as it stops being shy (after the animator, which sets the head's own sway)
    const neckWant = this.water && this.brain.armored ? (BOSS.baits - this.brain.baits.length) * m.pitchStep! : 0;
    this.neckK += (neckWant - this.neckK) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 1.6));
    if (this.neck && this.neckK > 0.001) this.neck.rotation.x += this.neckK;
    const open = this.brain.mouthOpen ? 1 : this.chomp > 0 ? 0.45 : dancing ? Math.abs(beat) * 0.3 : 0;
    this.jawK += (open - this.jawK) * (1 - Math.exp(-dt * (open > this.jawK ? 12 : 6)));
    if (dt === 0) this.jawK = open;
    if (this.jaw) this.jaw.rotation.x = this.jawK * 1.2;
    if (this.ember) this.ember.visible = this.jawK > 0.3;
    this.flare = Math.max(0, this.flare - dt * 1.6);
    if (this.eyes) this.eyes.scale.setScalar(1 + this.flare * 0.55 + (this.brain.mouthOpen ? 0.2 : 0));
    const n = this.alive ? this.brain.baits.length : 3;
    if (n !== this.shownCracks) {
      this.shownCracks = n;
      this.cracks.forEach((c, i) => (c.visible = i < n));
    }
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.model.root);
    this.model.dispose();
    this.stompRing.removeFromParent();
  }
}

/** The telegraph: a jagged ring of glowing cracks on the ground, plus a few running inwards. */
function stompRing(ctx: Ctx, kind: BossKind, level: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bossStompRing';
  g.visible = false;
  const kit = new Kit(`bossStomp${kind}${level}`, ctx.skin);
  const p = kit.part('ring', g);
  const glow = { c: kind === 'nessie' ? '#5fd3ff' : '#ff9a2e', glow: true };
  const n = 34;
  let prev: [number, number, number] | null = null;
  let first: [number, number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i === n ? 0 : radius * (0.93 + ((hash2(level, i, 7) & 255) / 255) * 0.14);
    const pt: [number, number, number] = i === n ? first! : [Math.sin(a) * r, 0.1, Math.cos(a) * r];
    first ??= pt;
    if (prev) p.beam(prev, pt, 0.28, glow);
    prev = pt;
  }
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.3;
    let r = radius;
    let q: [number, number, number] = [Math.sin(a) * r, 0.1, Math.cos(a) * r];
    for (let s = 0; s < 3; s++) {
      r -= radius * 0.17;
      const j = a + (((hash2(level, k, s) & 255) / 255) - 0.5) * 0.35;
      const nq: [number, number, number] = [Math.sin(j) * r, 0.1, Math.cos(j) * r];
      p.beam(q, nq, 0.2, glow);
      q = nq;
    }
  }
  p.done();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.toyNoShadow = true;
  });
  return g;
}

// ─── module state ───────────────────────────────────────────────────────────

let boss: Boss | null = null;
/** Ground still to be eaten (a returning boss eats its new lair over a few frames). */
let eatQueue: { cols: [number, number][]; i: number; site: [number, number] } | null = null;
/** Eaten blocks growing back after the defeat. */
let regrow: { list: [number, number, number][]; i: number; t: number; per: number } | null = null;
let crumble: Crumble | null = null;
/** One-per-session moments of voice and the build-button suggestion. */
const session = {
  inZone: false,
  spotSaid: false,
  farSaid: false,
  /** Пупся laughed at its dance this fight. */
  danceSaid: false,
  /** Пупся's hints and how often they repeat (systems/pacing.ts). */
  hints: new BossHints(),
  /** Game time when the boss card pops up (the first visit of this save), or null. */
  guideAt: null as number | null,
  suggesting: false,
  dismissed: false,
};

function hint(line: LineId): void {
  voice.say(line, { priority: 5 });
}

/** The armour or the mouth hint, whichever fits now, unless it was said a moment ago. */
function armourHint(b: Boss): void {
  if (!b.alive) return;
  if (b.brain.armored) {
    if (session.hints.stone()) hint(b.lines.shy);
  } else if (session.hints.mouth()) hint(b.lines.mouth);
}

// ─── the lair ───────────────────────────────────────────────────────────────

function siteWet(ctx: Ctx, [x, z]: [number, number]): boolean {
  const { world } = ctx;
  for (let dx = -6; dx <= 6; dx += 3) for (let dz = -6; dz <= 6; dz += 3) if (world.isWater(x + dx, world.groundHeight(x + dx, z + dz), z + dz)) return true;
  return false;
}

/** Villages and castles keep their land: no lair within this of one. */
const VILLAGE_KEEP = 64;
function nearVillage(ctx: Ctx, [x, z]: [number, number], her = true): boolean {
  const near = (s: { x: number; z: number }) => Math.hypot(s.x - x, s.z - z) < VILLAGE_KEEP;
  const b = ctx.save.babusia.at;
  return (ctx.world.villages?.() ?? []).some(near) || (ctx.world.castles?.() ?? []).some(near) || nearChess(ctx, [x, z]) || (her && !!b && near({ x: b[0], z: b[2] }));
}

/** The chess kingdom keeps its land even from a lair already eaten (an old save's): it moves. */
function nearChess(ctx: Ctx, [x, z]: [number, number]): boolean {
  const k = ctx.world.chess?.();
  return !!k && Math.hypot(k.x - x, k.z - z) < VILLAGE_KEEP;
}

function chooseSite(ctx: Ctx, level: number): [number, number] {
  const { world } = ctx;
  const home = ctx.house ? ctx.house.centre : new THREE.Vector3();
  const wet = (x: number, z: number) => world.isWater(x, world.groundHeight(x, z), z);
  const good = (x: number, z: number) => {
    const b = world.biomeAt(x, z);
    if (b === 'forest' || b === 'snow') return false;
    const g = world.groundHeight(x, z);
    if (g <= SEA_LEVEL + 1 || world.getBlock(x, g - 1, z) !== B.GRASS) return false;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (wet(Math.round(x + Math.sin(a) * 14), Math.round(z + Math.cos(a) * 14))) n++;
    }
    // lighthouses keep their shore and villages their land: the lair stays well away
    return n <= 1 && !(world.lighthousesNear?.(x, z, 48) ?? []).some((l) => Math.hypot(l.x + 1.5 - x, l.z + 1.5 - z) < 48) && !nearVillage(ctx, [x, z]);
  };
  const [x, z] = pickSite(world.seed, level, home, good);
  const spot = world.findSpawn(x, z);
  const d = Math.hypot(spot.x - home.x, spot.z - home.z);
  return d >= BOSS.siteMin && d <= BOSS.siteMax ? [Math.floor(spot.x), Math.floor(spot.z)] : [x, z];
}

// ─── the lake monster's lake ─────────────────────────────────────────────────

/** How much of a disc is water (0..1). */
function waterAround(ctx: Ctx, x: number, z: number, r: number): number {
  let n = 0;
  let all = 0;
  for (let dx = -r; dx <= r; dx += 2)
    for (let dz = -r; dz <= r; dz += 2) {
      if (dx * dx + dz * dz > r * r) continue;
      all++;
      if (ctx.world.isWater(x + dx, ctx.world.groundHeight(x + dx, z + dz), z + dz)) n++;
    }
  return all ? n / all : 0;
}

/** A dry, gentle shore near the water's edge (so the child can walk down to lay the fish). */
function gentleShore(ctx: Ctx, x: number, z: number): boolean {
  for (let dx = -18; dx <= 18; dx += 2)
    for (let dz = -18; dz <= 18; dz += 2) {
      if (dx * dx + dz * dz > 324) continue;
      const g = ctx.world.groundHeight(x + dx, z + dz);
      if (g > SEA_LEVEL && g <= SEA_LEVEL + 4 && !ctx.world.isWater(x + dx, g, z + dz)) return true;
    }
  return false;
}

/**
 * Goes round the rings from the house and stops at the first few good spots: a big lake with a
 * gentle shore. Failing that a big one, a smaller one, and last one by Бабуся's house.
 */
function findLake(ctx: Ctx, home: { x: number; z: number }, level: number, keep: (x: number, z: number, her?: boolean) => boolean): [number, number] | null {
  const { world } = ctx;
  const best: [number, number][] = [];
  const big: [number, number][] = [];
  const small: [number, number][] = [];
  const byHer: [number, number][] = [];
  for (const at of lakeSpots(home)) {
    const [x, z] = at;
    if (!world.isWater(x, world.groundHeight(x, z), z)) continue;
    const water = waterAround(ctx, x, z, 14);
    if (water < 0.4 || !keep(x, z, false)) continue;
    if (!keep(x, z)) byHer.push(at);
    else if (water < 0.65) small.push(at);
    else {
      big.push(at);
      if (gentleShore(ctx, x, z)) best.push(at);
      if (best.length >= BOSS.lakeChoice) break;
    }
  }
  return pickLake([best, big, small, byHer].find((l) => l.length) ?? [], level);
}

/**
 * A lake big enough for the monster, far from home: a candidate ring like the
 * Eater's, then the centre of its water (so she swims in the middle of it).
 * A shore the child can walk down to comes first; a steep-banked lake is the
 * fallback (the fish count from its rim all the same).
 */
function chooseLake(ctx: Ctx, level: number): [number, number] | null {
  const { world } = ctx;
  const home = ctx.house ? ctx.house.centre : new THREE.Vector3();
  const near = (x: number, z: number, her = true) => !nearVillage(ctx, [x, z], her) && !(world.lighthousesNear?.(x, z, 48) ?? []).some((l) => Math.hypot(l.x + 1.5 - x, l.z + 1.5 - z) < 48);
  const open = (x: number, z: number) => waterAround(ctx, x, z, 14) >= 0.65;
  const good = (x: number, z: number) => open(x, z) && gentleShore(ctx, x, z) && near(x, z);
  const any = (x: number, z: number) => open(x, z) && near(x, z);
  // pickSite falls back to its first candidate when nothing passes: a lake with
  // no gentle shore still beats no lake, so ask again, relaxed
  let [x, z] = pickSite(world.seed ^ 0x1a2e, level, home, good);
  if (!good(x, z)) [x, z] = pickSite(world.seed ^ 0x1a2e, level, home, any);
  // the forty tries missed: every lake in reach; with no water there is no place for her
  if (!any(x, z)) {
    const lake = findLake(ctx, home, level, near);
    if (!lake) return null;
    [x, z] = lake;
  }
  // the middle of the water it found: the average of the wet cells around it
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (let dx = -12; dx <= 12; dx += 2)
    for (let dz = -12; dz <= 12; dz += 2) {
      if (dx * dx + dz * dz > 144) continue;
      if (world.isWater(x + dx, world.groundHeight(x + dx, z + dz), z + dz)) {
        sx += x + dx;
        sz += z + dz;
        n++;
      }
    }
  return n ? [Math.round(sx / n), Math.round(sz / n)] : [x, z];
}

/** Every column of the zone, nearest the centre first (so a lair being eaten spreads outwards). */
function zoneColumns(site: [number, number]): [number, number][] {
  const R = BOSS.zoneRadius + 1;
  const cols: [number, number, number][] = [];
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) cols.push([site[0] + dx, site[1] + dz, dx * dx + dz * dz]);
  cols.sort((a, b) => a[2] - b[2]);
  return cols.map(([x, z]) => [x, z]);
}

/** Grass → bare grey cobble (the skin's grey stone), with a few pits one step deep; a ragged edge. */
function eatColumn(ctx: Ctx, site: [number, number], x: number, z: number): void {
  const { world } = ctx;
  const d = Math.hypot(x - site[0], z - site[1]);
  const h = hash2(world.seed ^ 0xea7, x, z);
  const edge = BOSS.zoneRadius - 1.5 + ((h & 255) / 255) * 2.5;
  if (d > edge) return;
  let g = world.groundHeight(x, z);
  // it eats the trees too: crowns and trunks go, down to the ground
  for (let id = world.getBlock(x, g - 1, z); g > 2 && (id === B.LEAVES || id === B.LOG || id === B.AIR); id = world.getBlock(x, g - 1, z)) {
    if (id !== B.AIR) world.setBlock(x, g - 1, z, B.AIR);
    g--;
  }
  if (g <= 2 || world.isWater(x, g, z)) return;
  if (!EATABLE.has(world.getBlock(x, g - 1, z))) return;
  const r = ((h >>> 8) & 1023) / 1023;
  if (d < edge - 3 && d > 5 && r < 0.07) {
    world.setBlock(x, g - 1, z, B.AIR);
    world.setBlock(x, g - 2, z, B.COBBLE);
  } else world.setBlock(x, g - 1, z, B.COBBLE);
}

/** The world's ground, remembered for one pass (the trap tests ask the same columns many times). */
function groundCache(ctx: Ctx): GroundAt {
  const known = new Map<string, number>();
  return (x, z) => {
    const k = `${x},${z}`;
    let g = known.get(k);
    if (g === undefined) known.set(k, (g = ctx.world.groundHeight(x, z)));
    return g;
  };
}
const waterAt = (ctx: Ctx, ground: GroundAt) => (x: number, z: number) => ctx.world.isWater(x, ground(x, z), z);

/**
 * Fills any hole a hero could not climb out of (old saves: pits two deep, bites that went down
 * and down), a block at a time with the wasteland's cobble, until every column has a way out.
 */
function fillTraps(ctx: Ctx, site: [number, number]): void {
  const cols = zoneColumns(site);
  const raised = new Map<string, number>();
  const base = groundCache(ctx);
  const ground: GroundAt = (x, z) => base(x, z) + (raised.get(`${x},${z}`) ?? 0);
  const open = waterAt(ctx, base);
  const touched: [number, number][] = [];
  for (let pass = 0; pass < 4; pass++) {
    const shut = cols.filter(([x, z]) => trapped(ground, x, z, 5, open));
    if (!shut.length) break;
    for (const [x, z] of shut) {
      ctx.world.setBlock(x, ground(x, z), z, B.COBBLE);
      raised.set(`${x},${z}`, (raised.get(`${x},${z}`) ?? 0) + 1);
      touched.push([x, z]);
    }
  }
  if (touched.length) groundChanged(touched);
}

/** The map redraws the chunks whose ground changed. */
function groundChanged(cols: Iterable<[number, number]>): void {
  const seen = new Set<string>();
  for (const [x, z] of cols) {
    const k = `${x >> 4},${z >> 4}`;
    if (seen.has(k)) continue;
    seen.add(k);
    events.emit('ground:changed', { x, z });
  }
}

function eatNow(ctx: Ctx, site: [number, number]): void {
  const cols = zoneColumns(site);
  for (const [x, z] of cols) eatColumn(ctx, site, x, z);
  groundChanged(cols);
  fillTraps(ctx, site);
}

/** Eaten (or bitten, or dug) blocks of a lair, nearest the centre first. */
function eatenBlocks(ctx: Ctx, site: [number, number]): [number, number, number][] {
  const R2 = (BOSS.zoneRadius + 2) ** 2;
  const out: [number, number, number, number][] = [];
  for (const [k, id] of Object.entries(ctx.world.exportEdits())) {
    if (!EATEN.has(id)) continue;
    const [x, y, z] = k.split(',').map(Number);
    const d2 = (x - site[0]) ** 2 + (z - site[1]) ** 2;
    if (d2 <= R2) out.push([x, y, z, d2]);
  }
  out.sort((a, b) => a[3] - b[3]);
  return out.map(([x, y, z]) => [x, y, z]);
}

function revert(ctx: Ctx, x: number, y: number, z: number): void {
  if (ctx.world.revertBlock) ctx.world.revertBlock(x, y, z);
  else if (ctx.world.getBlock(x, y + 1, z) === B.AIR) ctx.world.setBlock(x, y, z, B.GRASS);
}

/** Puts a lair's ground back at once (a save left mid-regrowth, or a site that moved). */
function regrowNow(ctx: Ctx, site: [number, number]): void {
  const list = eatenBlocks(ctx, site);
  for (const [x, y, z] of list) revert(ctx, x, y, z);
  groundChanged(list.map(([x, , z]) => [x, z]));
  ctx.save.boss.eatenAt = null;
}

// ─── setup ──────────────────────────────────────────────────────────────────

/** Places the boss from the save (or for the first time), eats its lair and wires the baits. */
export function initBoss(ctx: Ctx): void {
  const s = (ctx.save.boss ??= freshBoss());
  // ?boss=nessie (test only): the lake monster is up instead
  if (ctx.params.boss === 'nessie') s.kind = 'nessie';
  ctx.boss = null;
  events.on('block:placed', ({ x, y, z, id }) => {
    if (id === B.LANTERN) onLantern(ctx, x, y, z);
  });
  exposeForChecks(ctx);
  if (s.defeatedDay !== null) {
    if (s.eatenAt) regrowNow(ctx, s.eatenAt);
    return;
  }
  spawn(ctx, true);
}

function spawn(ctx: Ctx, atStart: boolean): void {
  const s = ctx.save.boss;
  // the lake monster lives in a lake: a new one, or one left on dry land, finds one; with none in reach the Eater comes
  if (BOSS_KINDS[s.kind].water && (!s.site || waterAround(ctx, s.site[0], s.site[1], 8) < 0.25 || nearChess(ctx, s.site))) {
    const lake = chooseLake(ctx, s.levels[s.kind]);
    s.baits = [];
    if (lake) s.site = lake;
    else {
      s.kind = 'eater';
      s.site = null;
      s.hp = null;
    }
  }
  const kind = s.kind;
  const level = s.levels[kind];
  const water = BOSS_KINDS[kind].water;
  // no lair yet, or the world moved under one not eaten yet (a river runs there now)
  const badLair = !water && (!s.site || (!s.eatenAt && (siteWet(ctx, s.site) || nearVillage(ctx, s.site))) || nearChess(ctx, s.site));
  if (badLair) s.site = chooseSite(ctx, level);
  const site = s.site!;
  const tune = tuneOf(ctx);
  const maxHp = bossMaxHp(level, tune.bossHp);
  const p = ctx.params;
  const baits = [...s.baits];
  if (atStart && p.lanterns !== null) for (let i = baits.length; i < Math.min(BOSS.baits, p.lanterns); i++) baits.push(`test:${i}`);
  const hp = atStart && p.bossHp !== null ? Math.min(maxHp, p.bossHp) : s.hp;
  const brain = new BossBrain({ maxHp, hp, baits, tempo: tune.bossTempo });
  s.baits = brain.baits;
  s.hp = brain.hp;

  // only the Eater eats its lair bare; the lake monster's lake is the world's own
  if (!water) {
    if (s.eatenAt && (s.eatenAt[0] !== site[0] || s.eatenAt[1] !== site[1])) regrowNow(ctx, s.eatenAt);
    if (!s.eatenAt) {
      s.bites = 0;
      if (atStart) eatNow(ctx, site);
      else eatQueue = { cols: zoneColumns(site), i: 0, site };
      s.eatenAt = [site[0], site[1]];
    } else if (atStart) fillTraps(ctx, site);
  }
  boss = new Boss(ctx, kind, level, site, brain);
  ctx.boss = boss;
  session.spotSaid = false;
  session.danceSaid = false;
  session.hints.newFight();
  setMapMarker('boss', { pos: boss.pos, icon: BOSS_KINDS[kind].icon, pointer: true, zoneRadius: boss.zoneRadius });
}

/** `?boss=near`: where the party starts — in front of the mouth (the lake monster: on the shore). */
export function bossStartSpot(ctx: Ctx): { x: number; z: number } | null {
  if (!boss) return null;
  const p = boss.toWorld(0, 0, 7.6, new THREE.Vector3());
  if (boss.water) {
    const dry = landingSpot(ctx.world, p.x, p.z, undefined, 14);
    if (dry) return { x: dry.x, z: dry.z };
  }
  return { x: p.x, z: p.z };
}

function onLantern(ctx: Ctx, x: number, y: number, z: number): void {
  const b = boss;
  if (!b || b.water || !b.alive || !b.inZone(x + 0.5, z + 0.5)) return;
  baitTaken(ctx, `${x},${y},${z}`, tmp.set(x + 0.5, y + 0.8, z + 0.5));
}

/**
 * A bait the giant noticed: a lantern lit in the wasteland, a fish laid on the
 * shore (the lake monster takes it at once). The brain cracks the armour.
 */
function baitTaken(ctx: Ctx, key: string, at: THREE.Vector3): void {
  const b = boss;
  if (!b) return;
  const r = b.brain.addBait(key);
  if (!r) return;
  ctx.save.boss.baits = b.brain.baits;
  session.hints.lantern();
  b.flare = 1;
  const water = b.water;
  if (water) {
    // the lake monster lunges: a splash where the fish lay, ripples across the water
    ctx.effects.poof(at, 0x8fd4e8, 12);
    ctx.effects.ring(at, 0x6fd8e8, 2.6);
    sfx.play('poof', { pitch: 0.7 });
    sfx.play('rumble', { volume: 0.5, pitch: 1.1 });
  } else {
    ctx.effects.sparkle(at, 0xffe27a);
    ctx.effects.ring(at, 0xffd54f, 2.4);
    sfx.play('rumble', { volume: 0.5, pitch: 1.3 });
  }
  ctx.effects.sparkle(b.toWorld(0, 4.5, 0, tmp2), water ? 0x7ff0d4 : 0xffa526);
  if (r === 'crack') voice.say(b.lines.bait, { priority: 6, interrupt: true });
  else {
    voice.say(b.lines.weak, { priority: 8, interrupt: true });
    if (session.hints.mouth()) setTimeout(() => voice.say(b.lines.mouth, { priority: 6 }), 3200);
    ctx.effects.poof(b.toWorld(0, 4, 0, tmp2), SCENE[b.kind].dust, 30);
  }
}

// ─── every frame ────────────────────────────────────────────────────────────

export function updateBoss(ctx: Ctx, dt: number): void {
  const s = ctx.save.boss;
  updateEating(ctx);
  updateCrumble(ctx, dt);
  updateRegrow(ctx, dt);

  if (!boss) {
    ctx.hud.setBoss(null);
    suggest(ctx, false, false);
    if (!crumble && !regrow && shouldReturn(ctx.save.day, s.defeatedDay)) {
      // either giant may come back, by chance; each one level up from its own last time
      s.kind = nextBossKind();
      s.levels[s.kind] += 1;
      s.site = null;
      s.hp = null;
      s.baits = [];
      s.defeatedDay = null;
      spawn(ctx, false);
      voice.say(BOSS_KINDS[s.kind].water ? 'nessie_return' : 'boss_return', { priority: 8, interrupt: true });
    }
    return;
  }

  const b = boss;
  const brain = b.brain;
  brain.tempo = tuneOf(ctx).bossTempo;
  const player = ctx.player;
  const active = ctx.playing && !ctx.sleeping;

  // nearest hero (for turning and stomping)
  let near: Hero | null = null;
  let nearD = Infinity;
  let stompD = Infinity;
  b.toWorld(0, 0, b.measures.stompZ, b.stompAt);
  if (active) {
    for (const h of ctx.heroes.values()) {
      const d = Math.hypot(h.pos.x - b.pos.x, h.pos.z - b.pos.z);
      if (d < nearD) {
        nearD = d;
        near = h;
      }
      stompD = Math.min(stompD, Math.hypot(h.pos.x - b.stompAt.x, h.pos.z - b.stompAt.z));
    }
  }
  const playerD = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
  const far = playerD > 110;
  b.model.root.visible = !far;

  // a fish laid on the lake's shore: the monster takes it at once
  if (active && b.water && brain.armored && BOSS_KINDS[b.kind].bait === 'fish') {
    for (const f of standingWhere((c) => c.id === 'fish')) {
      const key = `${f.rec.x},${f.rec.y},${f.rec.z}`;
      if (brain.baits.includes(key) || !b.inZone(f.centre.x, f.centre.z, 6)) continue;
      devour(ctx, f);
      baitTaken(ctx, key, tmp.copy(f.centre).setY(f.centre.y + 0.5));
    }
  }

  // music whose dance circle reaches its body sets it dancing for a while
  const reach = 3 * b.scale;
  const heard = active && !far && playingSpeakers().some((sp) => Math.hypot(sp.centre.x - b.pos.x, sp.centre.z - b.pos.z) < sp.dance + reach);

  // the rules: mouth, stomp, the dance
  for (const e of brain.step(dt, stompD / b.scale, BOSS.stompRange, heard)) {
    if (e === 'mouth-open') {
      b.flare = 1;
      if (Math.random() < 0.35 && playerD < 40) {
        voice.say(b.lines.roar, { priority: 2 });
        sfx.play('rumble', { volume: 0.6, pitch: b.water ? 0.8 : 1 });
      }
      ctx.effects.sparkle(b.mouthPoint(tmp), 0xffb12e);
    } else if (e === 'stomp-warn') {
      b.model.play('cast');
      b.stompRing.visible = true;
      b.ringT = 0;
      b.ringY = ringHeight(ctx, b);
      sfx.play('rumble', { volume: 0.35, pitch: b.water ? 1.1 : 1.4 });
      if (session.hints.stomp()) voice.say(b.lines.stomp, { priority: 7, interrupt: true });
    } else if (e === 'stomp') stomp(ctx, b);
    else if (e === 'dance') {
      if (!session.danceSaid && playerD < 40) {
        session.danceSaid = true;
        voice.say(b.lines.dance, { priority: 7, interrupt: true });
      }
    } else if (e === 'dance-end') {
      // it shakes the music off with a roar and gets back to work
      b.flare = 1;
      if (playerD < 40) {
        voice.say(b.lines.roar, { priority: 2 });
        sfx.play('rumble', { volume: 0.6, pitch: b.water ? 0.8 : 1 });
      }
    }
  }

  // roaming inside the zone; facing a hero who comes close
  const busy = brain.mouthOpen || brain.stompWarn > 0 || brain.dance > 0;
  let want = 0;
  if (brain.dance > 0) {
    // dancing on the spot
  } else if (near && nearD < BOSS.sight * b.scale) {
    b.yaw = turnTowards(b.yaw, yawOf(near.pos.x - b.pos.x, near.pos.z - b.pos.z), dt * 1.1);
  } else if (!busy) {
    b.wanderT -= dt;
    const tx = b.target.x - b.pos.x;
    const tz = b.target.z - b.pos.z;
    if (b.wanderT <= 0 || Math.hypot(tx, tz) < 1.5) {
      b.wanderT = 6 + Math.random() * 6;
      // the lake monster strolls from water to water; the Eater takes any spot
      for (let t = 0; t < 8; t++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * Math.max(2, b.zoneRadius - 7 * b.scale);
        const wx = Math.floor(b.site.x + Math.sin(a) * r);
        const wz = Math.floor(b.site.z + Math.cos(a) * r);
        b.target.set(wx + 0.5, 0, wz + 0.5);
        if (!b.water || ctx.world.isWater(wx, ctx.world.groundHeight(wx, wz), wz)) break;
      }
    }
    const goal = yawOf(tx, tz);
    b.yaw = turnTowards(b.yaw, goal, dt * 0.7);
    let diff = Math.abs(goal - b.yaw) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    want = BOSS.roamSpeed * brain.tempo * (diff < 0.6 ? 1 : 0.25);
  }
  b.speed += (want - b.speed) * (1 - Math.exp(-dt * 2));
  b.pos.x += Math.sin(b.yaw) * b.speed * dt;
  b.pos.z += Math.cos(b.yaw) * b.speed * dt;
  const ox = b.pos.x - b.site.x;
  const oz = b.pos.z - b.site.z;
  const lim = Math.max(1, b.zoneRadius - 6 * b.scale);
  const od = Math.hypot(ox, oz);
  if (od > lim) {
    b.pos.x = b.site.x + (ox / od) * lim;
    b.pos.z = b.site.z + (oz / od) * lim;
  }
  b.pos.y += (groundUnder(ctx, b) - b.pos.y) * (1 - Math.exp(-dt * 4));

  // a bite of the ground every couple of seconds while it strolls (only the Eater)
  b.chomp = Math.max(0, b.chomp - dt);
  b.biteT -= dt;
  if (b.biteT <= 0) {
    b.biteT = (BOSS.biteEvery / brain.tempo) * (0.8 + Math.random() * 0.4);
    if (!busy && !(near && nearD < BOSS.sight * b.scale) && playerD < 60 && BOSS_KINDS[b.kind].bitesGround) bite(ctx, b);
  }

  // the stomp telegraph pulses
  if (b.stompRing.visible) {
    b.ringT += dt;
    b.stompRing.position.set(b.stompAt.x, b.ringY, b.stompAt.z);
    const k = 1 + 0.04 * Math.sin(b.ringT * 30);
    b.stompRing.scale.set(k, 1, k);
    if (Math.floor(b.ringT / 0.25) !== Math.floor((b.ringT - dt) / 0.25)) ctx.effects.ring(tmp.copy(b.stompAt).setY(b.ringY + 0.1), SCENE[b.kind].ringB, BOSS.stompRadius * b.scale);
  }

  if (!far) b.sync(dt);
  if (active) pushHeroes(ctx, b);
  s.hp = brain.hp;

  // the zone, the voice, the HUD
  const inZone = b.inZone(player.pos.x, player.pos.z);
  if (inZone && !session.inZone && active && !session.spotSaid) {
    session.spotSaid = true;
    voice.say(b.lines.spot, { priority: 8, interrupt: true });
    b.flare = 1;
    if (b.water) {
      // the lake monster announces itself with a splash
      ctx.effects.poof(b.pos.clone().setY(SEA_LEVEL + 0.6), 0x8fd4e8, 20);
      ctx.effects.ring(b.pos.clone().setY(SEA_LEVEL + 0.1), 0x6fd8e8, 6);
    }
    sfx.play('rumble', { volume: 0.7, pitch: b.water ? 0.8 : 1 });
    // the first visit of a save: once its roar is over, the game pauses on the boss card (ui/guide.ts)
    if (!ctx.save.said.includes(guideLineOf(b.kind))) session.guideAt = ctx.clock.elapsed + 4.8;
    else setTimeout(() => armourHint(b), 4200);
  }
  session.inZone = inZone;
  if (session.guideAt !== null && ctx.clock.elapsed >= session.guideAt && active && inZone && !ctx.hud.isPaused && !ctx.map.isOpen && !ctx.album.isOpen) {
    session.guideAt = null;
    if (!ctx.save.said.includes(guideLineOf(b.kind))) {
      ctx.save.said.push(guideLineOf(b.kind));
      session.hints.told(brain.armored);
      ctx.hud.openGuide(b.kind === 'nessie' ? 'nessie' : 'boss');
    }
  }
  if (active && session.hints.tick(dt, inZone, brain.armored)) hint(b.lines.shy);
  if (active && !session.farSaid && ctx.clock.elapsed > 60 && !inZone && Math.hypot(player.pos.x - b.site.x, player.pos.z - b.site.z) > b.zoneRadius + 25) {
    session.farSaid = true;
    voice.say(b.lines.far, { priority: 3 });
  }
  ctx.hud.setBoss(active && playerD < BOSS.barRange + 4 * b.scale ? { hp: brain.hp / brain.maxHp, armored: brain.armored, baits: brain.baits.length, kind: b.kind } : null);
  suggest(ctx, active && inZone && brain.armored, inZone, BOSS_KINDS[b.kind].bait);
}

/** Highest ground along the stomp circle (the ring is drawn just above it; a swimming giant: the water's skin). */
function ringHeight(ctx: Ctx, b: Boss): number {
  if (b.water) return SEA_LEVEL + 0.06;
  const R = BOSS.stompRadius * b.scale;
  let top = b.pos.y;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    top = Math.max(top, ctx.world.groundHeight(Math.floor(b.stompAt.x + Math.sin(a) * R), Math.floor(b.stompAt.z + Math.cos(a) * R)));
  }
  return Math.min(top, b.pos.y + 1.2) + 0.02;
}

/** Ground under the beast: the average of its centre and its four feet (a swimming giant: the lake's surface). */
function groundUnder(ctx: Ctx, b: Boss): number {
  if (b.water) return SEA_LEVEL - 0.55;
  let sum = 0;
  for (const [x, z] of [[0, 0], [4, 3], [-4, 3], [4, -3], [-4, -3]] as const) {
    b.toWorld(x, 0, z, tmp);
    sum += ctx.world.groundHeight(Math.floor(tmp.x), Math.floor(tmp.z));
  }
  return sum / 5;
}

function bite(ctx: Ctx, b: Boss): void {
  const s = ctx.save.boss;
  if ((s.bites ?? 0) >= BOSS.bitesPerLevel * b.level) return;
  const p = b.toWorld(0, 0, b.measures.biteAt, tmp);
  const ground = groundCache(ctx);
  // never a shaft: if the spot is already low, it bites a higher neighbour (the crater grows wider)
  const spot = biteSpot(ground, Math.floor(p.x), Math.floor(p.z), waterAt(ctx, ground));
  if (!spot) return;
  const [x, z] = spot;
  if (!b.inZone(x + 0.5, z + 0.5, -1)) return;
  const g = ground(x, z);
  if (g <= 3 || !BITABLE.has(ctx.world.getBlock(x, g - 1, z))) return;
  ctx.world.setBlock(x, g - 1, z, B.AIR);
  s.bites = (s.bites ?? 0) + 1;
  b.chomp = 0.4;
  ctx.effects.poof(tmp.set(x + 0.5, g - 0.5, z + 0.5), 0x8e8e8e, 10);
  const d = Math.hypot(ctx.player.pos.x - x, ctx.player.pos.z - z);
  if (d < 30) sfx.play('break', { volume: Math.max(0.15, 0.6 - d / 50), pitch: 0.7 });
  groundChanged([[x, z]]);
}

/** The ground jumps around its front feet: the ring, dust, and a heart and a push for anyone inside. */
function stomp(ctx: Ctx, b: Boss): void {
  b.stompRing.visible = false;
  const R = BOSS.stompRadius * b.scale;
  const at = b.stompAt;
  const c = tmp.copy(at).setY(b.ringY + 0.15);
  ctx.effects.ring(c, SCENE[b.kind].ringA, R * 1.15);
  ctx.effects.ring(c, SCENE[b.kind].ringB, R * 0.7);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.effects.poof(tmp2.set(at.x + Math.sin(a) * R * 0.8, b.ringY + 0.3, at.z + Math.cos(a) * R * 0.8), b.water ? 0x8fd4e8 : 0x9b8a6e, 6);
  }
  const d = Math.hypot(ctx.player.pos.x - at.x, ctx.player.pos.z - at.z);
  sfx.play('rumble', { volume: Math.max(0.2, 1 - d / 40), pitch: b.water ? 1.15 : 1 });
  ctx.hud.flash(0.25);
  for (const h of ctx.heroes.values()) {
    const hd = Math.hypot(h.pos.x - at.x, h.pos.z - at.z);
    if (hd > R + h.body.radius || h.pos.y > b.ringY + 2.5) continue;
    hurtHero(ctx, h, 1, at);
    // knocked further out than a monster's bump
    const ax = (h.pos.x - at.x) / Math.max(0.01, hd);
    const az = (h.pos.z - at.z) / Math.max(0.01, hd);
    h.body.vel.x += ax * 5;
    h.body.vel.z += az * 5;
    h.body.vel.y = Math.max(h.body.vel.y, 7);
  }
}

/** Nobody walks into the beast: heroes are kept out of the body's capsule. */
function pushHeroes(ctx: Ctx, b: Boss): void {
  const m = b.measures;
  const top = m.boxes.reduce((hi, [, y0, y1]) => Math.max(hi, y1), 0);
  for (const h of ctx.heroes.values()) {
    const l = b.toLocal(h.pos, tmp);
    if (l.y > top || l.y < -2) continue;
    const cz = Math.max(-m.pushZ, Math.min(m.pushZ, l.z));
    const dx = l.x;
    const dz = l.z - cz;
    const d = Math.hypot(dx, dz);
    const r = m.pushR + h.body.radius / b.scale;
    if (d >= r) continue;
    const nx = d > 1e-3 ? dx / d : 1;
    const nz = d > 1e-3 ? dz / d : 0;
    b.toWorld(nx * r, l.y, cz + nz * r, tmp2);
    h.pos.x = tmp2.x;
    h.pos.z = tmp2.z;
  }
}

// ─── the kit suggests the lantern inside the wasteland ──────────────────────

function suggest(ctx: Ctx, want: boolean, inZone: boolean, bait: BuildingId = 'lantern'): void {
  if (!inZone) session.dismissed = false;
  if (session.suggesting && (selectedBuilding() !== bait || !pickedByBoss())) {
    // the child put the bait away or picked another building: respect it until the next visit
    session.suggesting = false;
    session.dismissed = true;
    ctx.hud.suggestKit(false);
  }
  if (want && !session.suggesting && !session.dismissed && !selectedBuilding()) {
    session.suggesting = true;
    pick(ctx, bait, true);
  } else if (!want && session.suggesting) {
    session.suggesting = false;
    if (selectedBuilding() === bait && pickedByBoss()) pick(ctx, null);
  }
}

// ─── defeat: a storm of bricks, coins, the heart; the land grows back ───────

interface Crumble {
  t: number;
  model: Boss;
  mesh: THREE.InstancedMesh;
  pieces: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; floor: number; s: number }[];
  coins: boolean;
  heart: boolean;
  centre: THREE.Vector3;
}

const PIECES = 40;

function crumbleBricks(ctx: Ctx): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.55, 0.9), ctx.skin.partMaterial('#ffffff'), PIECES);
  mesh.name = 'bossCrumble';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.toyNoShadow = true;
  mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
  mesh.setColorAt(0, new THREE.Color('#5b616a'));
  mesh.count = 1;
  return mesh;
}
const CRUMBLE_T = 3.6;

function defeat(ctx: Ctx, b: Boss): void {
  const s = ctx.save.boss;
  s.defeatedDay = ctx.save.day;
  s.hp = null;
  s.baits = [];
  s.bites = 0;
  boss = null;
  ctx.boss = null;
  setMapMarker('boss', null);
  ctx.hud.setBoss(null);
  suggest(ctx, false, false);
  b.stompRing.visible = false;
  voice.say(b.lines.defeated, { priority: 9, interrupt: true });
  sfx.play('rumble', { volume: 1, pitch: b.water ? 0.8 : 1 });
  sfx.play('poof');
  ctx.hud.flash(0.4);

  // physics-less bricks: thrown out of the body, they bounce once on the ground and shrink away
  const mesh = b.bricks;
  mesh.count = PIECES;
  const col = new THREE.Color();
  const shades = BOSS_KINDS[b.kind].crumble;
  const pieces: Crumble['pieces'] = [];
  for (let i = 0; i < PIECES; i++) {
    const p = b.toWorld((Math.random() - 0.5) * 6, 0.6 + Math.random() * 3.5, (Math.random() - 0.5) * 8, new THREE.Vector3());
    const out = new THREE.Vector3(p.x - b.pos.x, 0, p.z - b.pos.z).normalize();
    const sp = 3 + Math.random() * 5;
    pieces.push({
      p,
      v: new THREE.Vector3(out.x * sp, 2 + Math.random() * 4, out.z * sp),
      r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
      w: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
      floor: 0,
      s: (0.7 + Math.random() * 0.7) * b.scale,
    });
    mesh.setColorAt(i, col.set(shades[i % shades.length]));
  }
  for (const pc of pieces) pc.floor = b.water ? SEA_LEVEL : ctx.world.groundHeight(Math.floor(pc.p.x), Math.floor(pc.p.z));
  crumble = { t: 0, model: b, mesh, pieces, coins: false, heart: false, centre: b.mouthPoint(new THREE.Vector3()) };
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const sv = new THREE.Vector3();

function updateCrumble(ctx: Ctx, dt: number): void {
  const c = crumble;
  if (!c) return;
  const t0 = c.t;
  c.t += dt;
  const b = c.model;
  // the beast sinks and falls apart in the first second
  const k = Math.min(1, c.t / 0.9);
  b.model.root.scale.set(b.scale * (1 + 0.15 * k), b.scale * (1 - 0.9 * k), b.scale * (1 + 0.15 * k));
  b.model.root.position.y = b.pos.y - k * 0.5;
  if (c.t >= 0.9 && b.model.root.parent) b.dispose(ctx);
  // bursts of stone dust (a splash of drops for the lake monster)
  for (const at of [0, 0.15, 0.3, 0.5, 0.7]) {
    if (t0 <= at && c.t > at) {
      const p = b.toWorld((Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 7, tmp);
      ctx.effects.poof(p, SCENE[b.kind].dust, 26);
      ctx.effects.sparkle(p, b.water ? 0x7ff0d4 : 0xffa526);
    }
  }
  if (!c.coins && c.t > 0.5) {
    c.coins = true;
    ctx.effects.coinBurst(c.centre, 16, b.pos.y);
    dropCoins(ctx, c.centre, BOSS.coins);
  }
  // the trophy comes after the narrator's line, so its own line is heard
  if (!c.heart && c.t > 3.0) {
    c.heart = true;
    const key = `boss-heart:${b.level}`;
    ctx.pickups.set(key, {
      key,
      item: 'eater_heart',
      pos: tmp.copy(b.pos).setY(b.pos.y + 1.5).clone(),
      chunk: '',
      shown: false,
      vel: new THREE.Vector3(0, 7, 0),
      phase: 0,
      magnet: true,
    });
    ctx.effects.sparkle(tmp.copy(b.pos).setY(b.pos.y + 1.5), 0xffa526);
    sfx.play('sticker');
  }
  // the bricks
  for (let i = 0; i < c.pieces.length; i++) {
    const pc = c.pieces[i];
    pc.v.y -= 20 * dt;
    pc.p.addScaledVector(pc.v, dt);
    if (pc.p.y < pc.floor + 0.25 && pc.v.y < 0) {
      pc.p.y = pc.floor + 0.25;
      pc.v.y *= -0.35;
      pc.v.x *= 0.5;
      pc.v.z *= 0.5;
      pc.w.multiplyScalar(0.5);
    }
    pc.r.x += pc.w.x * dt;
    pc.r.y += pc.w.y * dt;
    pc.r.z += pc.w.z * dt;
    const shrink = c.t < 2.2 ? 1 : Math.max(0.001, 1 - (c.t - 2.2) / 1.2);
    c.mesh.setMatrixAt(i, m4.compose(pc.p, q.setFromEuler(pc.r), sv.setScalar(pc.s * shrink)));
  }
  c.mesh.instanceMatrix.needsUpdate = true;
  if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
  if (c.t >= CRUMBLE_T) {
    c.mesh.removeFromParent();
    c.mesh.dispose();
    c.mesh.geometry.dispose();
    crumble = null;
  }
  // the land starts growing back once the dust settles
  if (t0 < 1.4 && c.t >= 1.4) {
    const site = ctx.save.boss.eatenAt;
    if (site) {
      const list = eatenBlocks(ctx, site);
      regrow = { list, i: 0, t: 0, per: Math.max(1, list.length / 3.2) };
    }
  }
}

function updateRegrow(ctx: Ctx, dt: number): void {
  const r = regrow;
  if (!r) return;
  r.t += dt;
  const until = Math.min(r.list.length, Math.ceil(r.t * r.per));
  const touched: [number, number][] = [];
  for (; r.i < until; r.i++) {
    const [x, y, z] = r.list[r.i];
    revert(ctx, x, y, z);
    touched.push([x, z]);
    if (r.i % 9 === 0) ctx.effects.sparkle(tmp.set(x + 0.5, ctx.world.groundHeight(x, z) + 0.2, z + 0.5), 0x9cf06b);
  }
  if (touched.length) groundChanged(touched);
  if (r.i >= r.list.length) {
    regrow = null;
    ctx.save.boss.eatenAt = null;
  }
}

function updateEating(ctx: Ctx): void {
  const e = eatQueue;
  if (!e) return;
  const end = Math.min(e.cols.length, e.i + 160);
  const touched: [number, number][] = [];
  for (; e.i < end; e.i++) {
    const [x, z] = e.cols[e.i];
    eatColumn(ctx, e.site, x, z);
    touched.push([x, z]);
  }
  groundChanged(touched);
  if (e.i >= e.cols.length) {
    eatQueue = null;
    fillTraps(ctx, e.site);
  }
}

// ─── for automated checks and screenshots ───────────────────────────────────

function exposeForChecks(ctx: Ctx): void {
  (window as unknown as { __kotoBoss: object }).__kotoBoss = {
    /** Where the lake monster would live at this level, how much water is there and how long the search took. */
    lakeFor: (level: number) => {
      const t = performance.now();
      const site = chooseLake(ctx, level);
      const ms = Math.round(performance.now() - t);
      return { site, water: site ? +waterAround(ctx, site[0], site[1], 8).toFixed(2) : 0, ms };
    },
    get state() {
      const s = ctx.save.boss;
      const b = boss;
      return {
        alive: !!b,
        kind: s.kind,
        level: s.levels[s.kind],
        levels: { ...s.levels },
        site: s.site,
        pos: b ? b.pos.toArray().map((v) => +v.toFixed(1)) : null,
        hp: b?.brain.hp ?? null,
        maxHp: b?.brain.maxHp ?? null,
        armored: b?.brain.armored ?? null,
        baits: b?.brain.baits.length ?? 0,
        mouthOpen: b?.brain.mouthOpen ?? false,
        stompWarn: b?.brain.stompWarn ?? 0,
        dance: b ? +b.brain.dance.toFixed(1) : 0,
        danceRest: b ? +b.brain.danceRest.toFixed(1) : 0,
        defeatedDay: s.defeatedDay,
        day: ctx.save.day,
        hearts: ctx.save.inv.eater_heart ?? 0,
        crumbling: crumble ? +crumble.t.toFixed(2) : false,
        regrowing: !!regrow,
        /** Game time the boss card is due to pop up (first visit of a save), and the time now. */
        guideAt: session.guideAt,
        elapsed: +ctx.clock.elapsed.toFixed(2),
        eatenAt: s.eatenAt ?? null,
        model: b
          ? {
              visible: b.model.root.visible,
              inScene: !!b.model.root.parent,
              at: b.model.root.position.toArray().map((v) => +v.toFixed(1)),
              scale: +b.model.root.scale.x.toFixed(2),
            }
          : null,
      };
    },
    /** Open the mouth now (armour must be broken). */
    open: () => boss?.brain.forceMouth(),
    /** Start a stomp now (a hero must be close). */
    stomp: () => boss?.brain.forceStomp(),
    /** A hit in the open mouth, as if an arrow landed. */
    hit: (n = 1) => {
      const b = boss;
      if (!b) return null;
      if (!b.brain.mouthOpen && !b.brain.armored) b.brain.mouthOpen = true;
      return b.strike(ctx, 'mouth', n, b.mouthPoint(new THREE.Vector3()));
    },
    /** One bait beside the player, as the child would place it: a lantern block, or a fish from the kit. */
    bait: () => {
      if (!boss || boss.water) {
        (window as unknown as { __kotoKit?: { give: (id: string, place?: boolean) => void } }).__kotoKit?.give('fish', true);
        return 'fish';
      }
      const x = Math.floor(ctx.player.pos.x + 1);
      const z = Math.floor(ctx.player.pos.z);
      const y = ctx.world.groundHeight(x, z);
      ctx.world.setBlock(x, y, z, B.LANTERN);
      events.emit('block:placed', { x, y, z, id: B.LANTERN });
      return [x, y, z];
    },
    /** Places a lantern block on the ground next to the player, as the build button would. */
    lantern: (dx = 1, dz = 0) => {
      const x = Math.floor(ctx.player.pos.x + dx);
      const z = Math.floor(ctx.player.pos.z + dz);
      const y = ctx.world.groundHeight(x, z);
      ctx.world.setBlock(x, y, z, B.LANTERN);
      events.emit('block:placed', { x, y, z, id: B.LANTERN });
      return [x, y, z];
    },
    /** Top block ids across the lair: { id: columns }. */
    tops: () => {
      const s = ctx.save.boss.site;
      if (!s) return null;
      const out: Record<number, number> = {};
      for (const [x, z] of zoneColumns(s)) {
        const g = ctx.world.groundHeight(x, z);
        const id = ctx.world.getBlock(x, g - 1, z);
        out[id] = (out[id] ?? 0) + 1;
      }
      return { biome: ctx.world.biomeAt(s[0], s[1]), out };
    },
    /** Pretend days went by (the return check runs every frame). */
    days: (n = 1) => (ctx.save.day += n),
    /** Where the three heroes stand. */
    get party() {
      return [...ctx.heroes.values()].map((h) => h.pos.toArray().map((v) => +v.toFixed(2)));
    },
    /** The party `d` blocks from the boss, on the side towards its lair's centre. */
    near: (d = 10) => {
      const b = boss;
      if (!b) return null;
      const a = Math.atan2(b.site.x - b.pos.x, b.site.z - b.pos.z) || 0;
      [...ctx.heroes.values()].forEach((h, i) => {
        placeOnGround(ctx.world, h.body, b.pos.x + Math.sin(a) * d + i * 0.9, b.pos.z + Math.cos(a) * d);
        h.syncModel(0);
      });
      events.emit('hero:teleport', {});
      return ctx.player.pos.toArray().map((v) => +v.toFixed(1));
    },
    /** The party to the nearest low, dry cell by the lair's centre (the lake monster: its waterline), facing it. */
    shore: () => {
      const b = boss;
      if (!b) return null;
      let best: { x: number; z: number; d: number } | null = null;
      for (let dx = -24; dx <= 24; dx++)
        for (let dz = -24; dz <= 24; dz++) {
          const x = Math.floor(b.site.x) + dx;
          const z = Math.floor(b.site.z) + dz;
          const g = ctx.world.groundHeight(x, z);
          if (g <= SEA_LEVEL || g > SEA_LEVEL + 3) continue;
          if (ctx.world.isWater(x, g, z)) continue;
          const d = dx * dx + dz * dz;
          if (!best || d < best.d) best = { x, z, d };
        }
      if (!best) return null;
      [...ctx.heroes.values()].forEach((h, i) => {
        placeOnGround(ctx.world, h.body, best!.x + 0.5 + i * 0.7, best!.z + 0.5);
        h.yaw = yawOf(b.pos.x - h.pos.x, b.pos.z - h.pos.z);
        h.syncModel(0);
      });
      events.emit('hero:teleport', {});
      return ctx.player.pos.toArray().map((v) => +v.toFixed(1));
    },
    /** Digs a 3×3 hole `depth` deep under the party (as old saves may have), so a check can jump out. */
    pit: (depth = 2) => {
      const x0 = Math.floor(ctx.player.pos.x);
      const z0 = Math.floor(ctx.player.pos.z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const g = ctx.world.groundHeight(x0 + dx, z0 + dz);
          for (let i = 1; i <= depth; i++) ctx.world.setBlock(x0 + dx, g - i, z0 + dz, B.AIR);
        }
      groundChanged([[x0, z0]]);
      return { feet: ctx.world.groundHeight(x0, z0), trapped: trapped(groundCache(ctx), x0, z0) };
    },
  };
}

