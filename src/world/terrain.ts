/**
 * Deterministic terrain: a height map from a few layers of simplex noise,
 * biomes from low-frequency noise, trees placed on a jittered 5×5 grid so
 * they can be generated chunk by chunk without seams. Water is lakes and
 * rivers (no sea, the owner's call): a river is the zero line of a slow,
 * warped noise, carved below the water level with sandy banks.
 *
 * Column model: `h` = y of the top solid block. Columns with h < SEA_LEVEL
 * are filled with water up to SEA_LEVEL (inclusive).
 */
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, type Biome } from '../contracts';
import { B } from './blocks';
import { hash2, mulberry32 } from './rng';
import { findVillages, PLAZA, squareDist, toLocal, VILLAGE_EDGE, VILLAGE_HALF, type Race, type VillageSite } from './villages';
import { CASTLE_EDGE, CASTLE_HALF, castlePaved, findCastles, type CastleSite } from './castles';

export const BIOME_MEADOW = 0;
export const BIOME_FOREST = 1;
export const BIOME_BEACH = 2;
export const BIOME_HILLS = 3;
export const BIOME_SNOW = 4;
export const BIOME_NAMES: readonly Biome[] = ['meadow', 'forest', 'beach', 'hills', 'snow'];

export const SNOW_LINE = 24;
const TREE_CELL = 5;
/** River bed height: two blocks of water under the water line. */
const RIVER_BED = SEA_LEVEL - 1.6;
/** No river comes closer to home than this. */
const RIVER_HOME_CLEAR = 44;
/** Half-width of a river in field units (about 2–4 blocks), and of its banks. */
const RIVER_W = 0.03;
const RIVER_BANK = 0.024;
/** Trees stay out of this radius around (0,0): the house goes there. */
const HOME_CLEAR = 10;
/** A village's floor and its plaza (with the path to the gate); 0 keeps the land's own top. */
const VILLAGE_FLOOR: Record<Race, number> = { elves: 0, gnomes: 0, robots: 0, aliens: B.SAND };
const VILLAGE_PAVE: Record<Race, number> = { elves: B.PLANKS, gnomes: B.COBBLE, robots: B.STONE, aliens: B.STONE };
/** The aliens' crater: a rim this high just outside the floor. */
const RIM_H = 2.2;
/** A castle's floor (grass; the aliens' crater is sand); its plaza and path are paved like the race's village. */
const CASTLE_FLOOR: Record<Race, number> = { elves: B.GRASS, gnomes: B.GRASS, robots: B.GRASS, aliens: B.SAND };

export interface ColumnSample {
  /** Float height before flooring. */
  hf: number;
  /** y of the top solid block. */
  h: number;
  wet: number;
  /** How much of it is lake (the rest of `wet` is river). */
  lake: number;
  hill: number;
  forest: number;
  biome: number;
  /** 1 on a village's or a castle's floor, falling to 0 across its slope. */
  village: number;
  /** A village's or castle's own top block (0: the land's). */
  vtop: number;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const CS = CHUNK_SIZE;
const G = CS + 2; // height grid with a 1-block margin

export class Terrain {
  private nA: NoiseFunction2D;
  private nB: NoiseFunction2D;
  private nH: NoiseFunction2D;
  private nS: NoiseFunction2D;
  private nL: NoiseFunction2D;
  private nF: NoiseFunction2D;
  private nR: NoiseFunction2D;
  private nW: NoiseFunction2D;
  /** Where the river field is sampled from: chosen so that home sits far from any river. */
  private rOff: [number, number];
  private treeSeed: number;
  private seed: number;

  // scratch (no allocations per chunk)
  private gH = new Int16Array(G * G);
  private gHf = new Float32Array(G * G);
  private gWet = new Float32Array(G * G);
  private gHill = new Float32Array(G * G);
  private gBiome = new Uint8Array(G * G);
  private gTop = new Uint8Array(G * G);
  private s: ColumnSample = { hf: 0, h: 0, wet: 0, lake: 0, hill: 0, forest: 0, biome: 0, village: 0, vtop: 0 };
  private s2: ColumnSample = { hf: 0, h: 0, wet: 0, lake: 0, hill: 0, forest: 0, biome: 0, village: 0, vtop: 0 };
  /** The four villages (world/villages.ts); their squares are flattened in `sample`. */
  villages: VillageSite[] = [];
  /** The four castles (world/castles.ts), far beyond the villages; flattened in `sample` too. */
  castles: CastleSite[] = [];

  constructor(seed: number) {
    this.seed = seed | 0;
    const mk = (salt: number) => createNoise2D(mulberry32(hash2(seed, salt, 7)));
    this.nA = mk(1);
    this.nB = mk(2);
    this.nH = mk(3);
    this.nS = mk(4);
    this.nL = mk(6);
    this.nF = mk(7);
    this.nR = mk(8);
    this.nW = mk(9);
    this.treeSeed = hash2(seed, 0x7ee5, 3);
    // The first offset (from the seed) where the river field around home is far from zero:
    // rivers then pass the yard by instead of ending at its edge.
    const rand = mulberry32(hash2(seed, 0x51de, 5));
    this.rOff = [0, 0];
    for (let i = 0; i < 64; i++) {
      this.rOff = [Math.floor(rand() * 20000) - 10000, Math.floor(rand() * 20000) - 10000];
      if (this.riverAway(RIVER_HOME_CLEAR)) break;
    }
    // found on the raw land (no villages yet), then flattened from here on
    this.villages = findVillages({ raw: (x, z) => this.sample(x, z, this.s2) });
    // castles keep 140 from every village, so the land they are found on is still raw
    this.castles = findCastles({ raw: (x, z) => this.sample(x, z, this.s2) }, this.villages);
  }

  /** The castle whose square (with its slope) holds (x, z), if any. */
  castleAt(x: number, z: number): CastleSite | null {
    const R = CASTLE_HALF + CASTLE_EDGE;
    for (const c of this.castles) if (Math.abs(x - c.x) <= R && Math.abs(z - c.z) <= R) return c;
    return null;
  }

  /** The village whose square (with its slope) holds (x, z), if any. */
  villageAt(x: number, z: number): VillageSite | null {
    const R = VILLAGE_HALF + VILLAGE_EDGE;
    for (const v of this.villages) if (Math.abs(x - v.x) <= R && Math.abs(z - v.z) <= R) return v;
    return null;
  }

  /** Full column sample into `out`. */
  sample(x: number, z: number, out: ColumnSample): ColumnSample {
    const d = Math.sqrt(x * x + z * z);
    const homeT = 1 - smoothstep(28, 72, d);

    let land = 12.6 + 2.2 * this.nA(x / 70, z / 70) + 0.9 * this.nB(x / 25, z / 25);
    const hill = smoothstep(0.2, 0.62, this.nH(x / 320, z / 320)) * (1 - homeT);
    const hs = this.nS(x / 90, z / 90) * 0.5 + 0.5;
    land += hill * (3 + 13 * Math.pow(hs, 1.5));

    // low meadows stay above the water: no stray puddles away from lakes and rivers
    land = Math.max(land, SEA_LEVEL + 1.3);
    const lake = smoothstep(0.6, 0.85, this.nL(x / 120, z / 120)) * (1 - homeT);
    // the yard stays dry even if a river comes close
    const river = this.riverAt(x, z, hill) * smoothstep(RIVER_HOME_CLEAR - 16, RIVER_HOME_CLEAR, d);
    const wet = Math.max(lake, river);
    const bottom = 5.5 + 1.5 * this.nB(x / 30 + 50, z / 30 - 50);
    let hf = land + (bottom - land) * lake;
    hf += (Math.min(hf, RIVER_BED) - hf) * river;
    // keep the home meadow dry
    if (homeT > 0) hf = hf + (Math.max(hf, 12.2) - hf) * homeT;

    // a village's square: flat, with a soft slope back to the land (the aliens' sits in a crater)
    let village = 0;
    let vtop = 0;
    const v = this.villages.length ? this.villageAt(x, z) : null;
    if (v) {
      const dist = squareDist(v, x, z);
      village = 1 - smoothstep(VILLAGE_HALF + 0.5, VILLAGE_HALF + 0.5 + VILLAGE_EDGE, dist);
      hf += (v.y + 0.5 - hf) * village;
      if (v.race === 'aliens') {
        hf += RIM_H * smoothstep(VILLAGE_HALF + 0.5, VILLAGE_HALF + 2, dist) * Math.exp(-(((dist - VILLAGE_HALF - 3.5) / 2.4) ** 2));
        if (dist < VILLAGE_HALF + 7) vtop = B.SAND;
      }
      if (village > 0.97) {
        const [lx, lz] = toLocal(v, x, z);
        const paved = Math.max(Math.abs(lx), Math.abs(lz)) <= PLAZA || (Math.abs(lx) <= 1 && lz > 0);
        vtop = paved ? VILLAGE_PAVE[v.race] : VILLAGE_FLOOR[v.race];
      }
    }
    // a castle's square: the same, bigger (the gnomes' raised into a hill, the aliens' sunk into a crater)
    const c = !v && this.castles.length ? this.castleAt(x, z) : null;
    if (c) {
      const dist = squareDist(c, x, z, CASTLE_HALF);
      village = 1 - smoothstep(CASTLE_HALF + 0.5, CASTLE_HALF + 0.5 + CASTLE_EDGE, dist);
      hf += (c.y + 0.5 - hf) * village;
      if (c.race === 'aliens') {
        hf += RIM_H * smoothstep(CASTLE_HALF + 0.5, CASTLE_HALF + 2, dist) * Math.exp(-(((dist - CASTLE_HALF - 3.5) / 2.4) ** 2));
        if (dist < CASTLE_HALF + 7) vtop = B.SAND;
      }
      const [lx, lz] = toLocal(c, x, z);
      if (castlePaved(lx, lz)) vtop = VILLAGE_PAVE[c.race];
      else if (village > 0.97) vtop = CASTLE_FLOOR[c.race];
    }

    const forest = this.nF(x / 160, z / 160) + 0.25 * this.nF(x / 40 + 9.1, z / 40 + 3.3) - homeT * 2;

    let h = Math.floor(hf);
    if (h < 1) h = 1;
    if (h > WORLD_HEIGHT - 12) h = WORLD_HEIGHT - 12;

    let biome: number;
    if (h < SEA_LEVEL || (wet > 0.02 && h <= SEA_LEVEL + 1)) biome = BIOME_BEACH;
    else if (hill > 0.45) biome = h >= SNOW_LINE ? BIOME_SNOW : BIOME_HILLS;
    else biome = forest > 0.2 ? BIOME_FOREST : BIOME_MEADOW;

    out.hf = hf;
    out.h = h;
    out.wet = wet;
    out.lake = lake;
    out.hill = hill;
    out.forest = forest;
    out.biome = biome;
    out.village = village;
    out.vtop = vtop;
    return out;
  }

  /** The raw river field: 0 on a river's middle line, ±RIVER_W at its edges. */
  riverField(x: number, z: number): number {
    const wx = x + 34 * this.nW(x / 110, z / 110);
    const wz = z + 34 * this.nW(x / 110 + 41.3, z / 110 - 17.9);
    return this.nR((wx + this.rOff[0]) / 380, (wz + this.rOff[1]) / 380);
  }

  /** 1 in a river, falling to 0 across its banks (wider valleys in the hills). */
  private riverAt(x: number, z: number, hill: number): number {
    const v = Math.abs(this.riverField(x, z));
    return 1 - smoothstep(RIVER_W, RIVER_W + RIVER_BANK + 0.06 * hill, v);
  }

  /** Whether no river line passes within `r` of home (checked on a coarse ring grid). */
  private riverAway(r: number): boolean {
    const sign = Math.sign(this.riverField(0, 0));
    for (let rr = 0; rr <= r; rr += 6) {
      for (let a = 0; a < 24; a++) {
        const v = this.riverField(Math.cos((a / 24) * Math.PI * 2) * rr, Math.sin((a / 24) * Math.PI * 2) * rr);
        if (Math.sign(v) !== sign || Math.abs(v) < RIVER_W + RIVER_BANK) return false;
      }
    }
    return true;
  }

  heightAt(x: number, z: number): number {
    return this.sample(x, z, this.s2).h;
  }

  biomeAt(x: number, z: number): Biome {
    return BIOME_NAMES[this.sample(Math.floor(x), Math.floor(z), this.s2).biome];
  }

  /** Fills `out` (16×48×16, index (y<<8)|(z<<4)|x) with generated terrain (no edits). */
  generate(cx: number, cz: number, out: Uint8Array): void {
    out.fill(0);
    const x0 = cx * CS;
    const z0 = cz * CS;
    const s = this.s;
    const { gH, gHf, gWet, gHill, gBiome, gTop } = this;

    for (let gz = 0; gz < G; gz++) {
      for (let gx = 0; gx < G; gx++) {
        this.sample(x0 + gx - 1, z0 + gz - 1, s);
        const i = gz * G + gx;
        gH[i] = s.h;
        gHf[i] = s.hf;
        gWet[i] = s.wet;
        gHill[i] = s.hill;
        gBiome[i] = s.biome;
        gTop[i] = s.vtop;
      }
    }

    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const gi = (lz + 1) * G + lx + 1;
        const h = gH[gi];
        const biome = gBiome[gi];
        const hf = gHf[gi];
        const slope = Math.max(
          Math.abs(hf - gHf[gi - 1]),
          Math.abs(hf - gHf[gi + 1]),
          Math.abs(hf - gHf[gi - G]),
          Math.abs(hf - gHf[gi + G]),
        );
        const step = Math.max(
          Math.abs(h - gH[gi - 1]),
          Math.abs(h - gH[gi + 1]),
          Math.abs(h - gH[gi - G]),
          Math.abs(h - gH[gi + G]),
        );
        const r = hash2(this.seed, x0 + lx, z0 + lz);

        let top: number = B.GRASS;
        let fill: number = B.DIRT;
        let depth = 3;
        if (h < SEA_LEVEL) {
          top = h >= SEA_LEVEL - 2 || (r & 3) === 0 ? B.SAND : B.DIRT;
          fill = B.SAND;
          depth = 2;
        } else if (biome === BIOME_BEACH) {
          top = B.SAND;
          fill = B.SAND;
        } else if (gHill[gi] > 0.3 && (step >= 2 || slope > 0.85)) {
          top = B.STONE;
          fill = B.STONE;
        } else if (biome === BIOME_SNOW || (gHill[gi] > 0.4 && h >= SNOW_LINE - 1 && (r & 1) === 0)) {
          top = B.SNOW;
          depth = 2;
        } else if (biome === BIOME_HILLS && h >= SNOW_LINE - 4 && (r & 7) === 0) {
          top = B.STONE;
        }
        if (gTop[gi] && h >= SEA_LEVEL) {
          top = gTop[gi];
          if (top === B.SAND) fill = B.SAND;
        }

        const col = (lz << 4) | lx;
        out[col] = B.STONE; // y = 0
        for (let y = 1; y <= h; y++) {
          out[(y << 8) | col] = y === h ? top : y > h - depth ? fill : B.STONE;
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) out[(y << 8) | col] = B.WATER;
      }
    }

    this.placeTrees(x0, z0, out);
  }

  /** The tree of grid cell (gx, gz), if one grows there: trunk position, ground, trunk height, its hash. */
  private treeIn(gx: number, gz: number): [number, number, number, number, number] | null {
    const s = this.s2;
    const r = hash2(this.treeSeed, gx, gz);
    const tx = gx * TREE_CELL + 1 + ((r & 15) % 3);
    const tz = gz * TREE_CELL + 1 + (((r >>> 4) & 15) % 3);
    if (tx * tx + tz * tz < HOME_CLEAR * HOME_CLEAR) return null;
    const roll = ((r >>> 8) & 0xffff) / 65536;
    this.sample(tx, tz, s);
    // villages keep their squares and slopes clear (crowns reach two blocks out)
    if (s.village > 0 || this.villageAt(tx + 2, tz + 2) || this.villageAt(tx - 2, tz - 2)) return null;
    if (this.castleAt(tx + 2, tz + 2) || this.castleAt(tx - 2, tz - 2)) return null;
    let p = 0;
    switch (s.biome) {
      case BIOME_FOREST:
        p = 0.72;
        break;
      case BIOME_MEADOW:
        p = 0.12;
        break;
      case BIOME_HILLS:
        p = 0.1;
        break;
      case BIOME_SNOW:
        p = 0.05;
        break;
    }
    if (roll >= p) return null;
    const h = s.h;
    if (h < SEA_LEVEL + 1) return null;
    // no trees on steep spots
    if (
      Math.abs(this.heightAt(tx + 1, tz) - h) > 1 ||
      Math.abs(this.heightAt(tx - 1, tz) - h) > 1 ||
      Math.abs(this.heightAt(tx, tz + 1) - h) > 1 ||
      Math.abs(this.heightAt(tx, tz - 1) - h) > 1
    ) {
      return null;
    }
    return [tx, tz, h, 4 + ((r >>> 24) % 3), r];
  }

  private placeTrees(x0: number, z0: number, out: Uint8Array): void {
    const c0x = Math.floor((x0 - 3) / TREE_CELL);
    const c1x = Math.floor((x0 + CS + 2) / TREE_CELL);
    const c0z = Math.floor((z0 - 3) / TREE_CELL);
    const c1z = Math.floor((z0 + CS + 2) / TREE_CELL);
    for (let gz = c0z; gz <= c1z; gz++) {
      for (let gx = c0x; gx <= c1x; gx++) {
        const t = this.treeIn(gx, gz);
        if (t) this.writeTree(out, x0, z0, t[0], t[1], t[2], t[3], t[4]);
      }
    }
  }

  /** Whether a tree (trunk or crown) reaches into the box [x0, x1) × [z0, z1). */
  treeNear(x0: number, z0: number, x1: number, z1: number): boolean {
    for (let gz = Math.floor((z0 - 3) / TREE_CELL); gz <= Math.floor((z1 + 2) / TREE_CELL); gz++) {
      for (let gx = Math.floor((x0 - 3) / TREE_CELL); gx <= Math.floor((x1 + 2) / TREE_CELL); gx++) {
        const t = this.treeIn(gx, gz);
        if (t && t[0] + 2 >= x0 && t[0] - 2 < x1 && t[1] + 2 >= z0 && t[1] - 2 < z1) return true;
      }
    }
    return false;
  }

  private writeTree(
    out: Uint8Array,
    x0: number,
    z0: number,
    tx: number,
    tz: number,
    ground: number,
    trunk: number,
    r: number,
  ): void {
    const topLog = ground + trunk;
    const set = (x: number, y: number, z: number, id: number, overwrite: boolean) => {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 1 || y >= WORLD_HEIGHT) return;
      const i = (y << 8) | (lz << 4) | lx;
      if (overwrite || out[i] === B.AIR) out[i] = id;
    };
    for (let y = ground + 1; y <= topLog; y++) set(tx, y, tz, B.LOG, true);
    // ground under trunk becomes dirt
    set(tx, ground, tz, B.DIRT, true);
    let bit = 0;
    for (let y = topLog - 1; y <= topLog + 2; y++) {
      const rad = y <= topLog ? 2 : 1;
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
          if (corner) {
            if (y === topLog + 2) continue; // plus shape on top
            if ((r >>> (bit++ & 31)) & 1) continue; // ragged corners
          }
          set(tx + dx, y, tz + dz, B.LEAVES, false);
        }
      }
    }
  }
}
