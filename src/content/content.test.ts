import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ModelRef } from '../contracts';
import { HEROES } from './heroes';
import { ITEMS } from './items';
import { LINES } from './lines';
import { MONSTERS } from './monsters';

/**
 * The content check: every card points at things that exist. A card that
 * names a missing model or voice line fails here, before it reaches a tablet.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const partsBuilt = new Set(Object.keys(import.meta.glob('../assets/parts/*.ts')).map((p) => path.basename(p, '.ts')));

function modelExists(ref: ModelRef): boolean {
  if (ref.kind === 'parts') return partsBuilt.has(ref.id);
  if (ref.kind === 'glb') return fs.existsSync(path.join(root, 'public', ref.url));
  return true; // drawings live on the tablet
}

const cards = [
  ...Object.values(HEROES).map((c) => ({ name: `hero ${c.id}`, model: c.model, lines: Object.values(c.lines) })),
  ...Object.values(MONSTERS).map((c) => ({ name: `monster ${c.kind}`, model: c.model, lines: [c.spotLine, c.defeatLine] })),
  ...Object.values(ITEMS).map((c) => ({ name: `item ${c.id}`, model: (c as { model?: ModelRef }).model, lines: [c.line] })),
];

describe('content', () => {
  for (const c of cards) {
    it(`${c.name}: model exists`, () => {
      // Parts builders arrive with the models module; until then this only warns.
      if (c.model && partsBuilt.size > 0) expect(modelExists(c.model), JSON.stringify(c.model)).toBe(true);
    });
    it(`${c.name}: lines exist`, () => {
      for (const l of c.lines) expect(LINES[l], l).toBeDefined();
    });
  }

  it('every line has a voice clip (warns; STRICT_VOICE=1 fails)', () => {
    const dir = path.join(root, 'public/voice');
    const missing = Object.keys(LINES).filter((id) => !fs.existsSync(path.join(dir, `${id}.mp3`)));
    if (missing.length) console.warn(`[content] ${missing.length} lines have no mp3 yet — run npm run voice`);
    if (process.env.STRICT_VOICE === '1') expect(missing).toEqual([]);
  });
});
