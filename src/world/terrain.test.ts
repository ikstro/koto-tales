import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../contracts';
import { B } from './blocks';
import { Terrain } from './terrain';

const VOL = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
const SEED = 20261128;

function chunk(t: Terrain, cx: number, cz: number): Uint8Array {
  const out = new Uint8Array(VOL);
  t.generate(cx, cz, out);
  return out;
}

/** Highest solid block + 1 in a generated chunk column. */
function ground(data: Uint8Array, lx: number, lz: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const id = data[(y << 8) | (lz << 4) | lx];
    if (id !== B.AIR && id !== B.WATER) return y + 1;
  }
  return 0;
}

describe('terrain', () => {
  it('is deterministic: same seed → same blocks', () => {
    const a = new Terrain(SEED);
    const b = new Terrain(SEED);
    for (const [cx, cz] of [
      [0, 0],
      [-3, 5],
      [12, -7],
      [40, 40],
    ]) {
      expect(chunk(a, cx, cz)).toEqual(chunk(b, cx, cz));
    }
    // generation order does not matter
    const c = new Terrain(SEED);
    chunk(c, 40, 40);
    expect(chunk(c, -3, 5)).toEqual(chunk(a, -3, 5));
  });

  it('differs between seeds', () => {
    expect(chunk(new Terrain(1), 4, 4)).not.toEqual(chunk(new Terrain(2), 4, 4));
  });

  it('keeps the (0,0) area a dry meadow', () => {
    for (const seed of [SEED, 1, 42, 987654]) {
      const t = new Terrain(seed);
      for (let z = -16; z <= 16; z += 4) {
        for (let x = -16; x <= 16; x += 4) {
          expect(t.biomeAt(x, z)).toBe('meadow');
          expect(t.heightAt(x, z)).toBeGreaterThanOrEqual(SEA_LEVEL + 1);
        }
      }
      // no water and no trees right at home
      for (const [cx, cz] of [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ]) {
        const d = chunk(t, cx, cz);
        for (let i = 0; i < VOL; i++) {
          const x = cx * CHUNK_SIZE + (i & 15);
          const z = cz * CHUNK_SIZE + ((i >> 4) & 15);
          if (x * x + z * z > 8 * 8) continue;
          expect(d[i] === B.WATER || d[i] === B.LOG || d[i] === B.LEAVES).toBe(false);
        }
      }
    }
  });

  it('gives sane ground heights', () => {
    const t = new Terrain(SEED);
    for (let cz = -4; cz <= 4; cz += 2) {
      for (let cx = -4; cx <= 4; cx += 2) {
        const d = chunk(t, cx, cz);
        for (let lz = 0; lz < CHUNK_SIZE; lz += 5) {
          for (let lx = 0; lx < CHUNK_SIZE; lx += 5) {
            const g = ground(d, lx, lz);
            expect(g).toBeGreaterThanOrEqual(2);
            expect(g).toBeLessThan(WORLD_HEIGHT);
            const h = t.heightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
            // terrain top matches the height map unless a tree stands there
            const top = d[((h) << 8) | (lz << 4) | lx];
            expect(top).not.toBe(B.AIR);
            expect(g).toBeGreaterThanOrEqual(h + 1);
          }
        }
      }
    }
    // bedrock layer is always stone
    const d = chunk(t, 3, -2);
    for (let i = 0; i < 256; i++) expect(d[i]).toBe(B.STONE);
  });
});
