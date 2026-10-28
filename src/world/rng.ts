/** Small deterministic random helpers (no allocations in the hash functions). */

/** Seeded PRNG returning [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit integer hash of (seed, a, b). */
export function hash2(seed: number, a: number, b: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

/** 32-bit integer hash of (seed, a, b, c). */
export function hash3(seed: number, a: number, b: number, c: number): number {
  return hash2(hash2(seed, a, b), c, 0x51ed27);
}

/** Hash of a string (FNV-1a), for seeding textures by look. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
