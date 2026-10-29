import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PART_BUILDERS } from '../assets/models';
import { BUILDINGS, type BuildingId } from './buildings';
import { CASTLE_CARDS, castleOpen, castleTask, freshCastle, type CastleSave } from './castles';
import { LINES, type LineId } from './lines';

const none = () => false;
const all = () => true;
const only = (...ids: BuildingId[]) => (id: BuildingId) => ids.includes(id);
const hud = fileURLToPath(new URL('../../public/hud', import.meta.url));

describe('castle tasks', () => {
  it('the siege first, then the race order; none once the gate is open', () => {
    const c = freshCastle();
    expect(castleTask(CASTLE_CARDS.elves, c, all)).toMatchObject({ kind: 'defend', goal: 8, blocked: false });
    c.done = ['defend'];
    expect(castleTask(CASTLE_CARDS.elves, c, all)).toMatchObject({ kind: 'gather', goal: 8 });
    c.done = ['defend', 'gather'];
    expect(castleTask(CASTLE_CARDS.elves, c, all)).toMatchObject({ kind: 'disco', goal: 20 });
    c.done = ['defend', 'gather', 'disco'];
    expect(castleOpen(c)).toBe(true);
    expect(castleTask(CASTLE_CARDS.elves, c, all)).toBeNull();
  });

  it('a task waiting for a building moves to the end', () => {
    const c: CastleSave = { ...freshCastle(), done: ['defend'] };
    // robots: power before find, but without a power building the little robot comes first
    expect(castleTask(CASTLE_CARDS.robots, c, none)?.kind).toBe('find');
    c.done = ['defend', 'find'];
    expect(castleTask(CASTLE_CARDS.robots, c, none)).toMatchObject({ kind: 'power', blocked: true });
    expect(castleTask(CASTLE_CARDS.robots, c, only('generator'))).toMatchObject({ kind: 'power', blocked: false });
  });

  it('keeps the task under way', () => {
    const c: CastleSave = { ...freshCastle(), done: ['defend'], cur: 'power', got: 0 };
    expect(castleTask(CASTLE_CARDS.aliens, c, all)?.kind).toBe('power');
  });
});

describe('castle cards', () => {
  for (const card of Object.values(CASTLE_CARDS)) {
    it(`${card.race}: lines, ruler, prize and pictures exist`, () => {
      const lines: LineId[] = [card.seen, card.pointer, card.hello, card.thanks, card.open, card.prizeLine, ...Object.values(card.ask)];
      if (card.kid) lines.push(card.kid.found);
      for (const l of lines) expect(LINES[l], l).toBeDefined();
      for (const k of card.tasks) expect(card.ask[k], k).toBeDefined();
      expect(PART_BUILDERS[card.ruler], card.ruler).toBeDefined();
      if (card.kid) expect(PART_BUILDERS[card.kid.model], card.kid.model).toBeDefined();
      expect(BUILDINGS[card.prize], card.prize).toBeDefined();
      expect(card.tasks[0]).toBe('defend');
      const sprites = [card.item, card.mark, card.sticker, ...(card.kid ? [card.kid.face] : [])];
      for (const s of sprites) expect(fs.existsSync(`${hud}/${s}.png`), s).toBe(true);
    });
  }
});
