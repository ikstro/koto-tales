import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ModelRef } from '../contracts';
import { BUILDING_MODELS } from '../assets/buildings';
import { ITEM_IDS } from '../assets/items';
import { SPRITES } from '../ui/hudSprites';
import { BUILDINGS, KIT_ORDER } from './buildings';
import { CASTLE_CARDS } from './castles';
import { HEROES } from './heroes';
import { ITEMS, ITEM_ORDER } from './items';
import { LINES } from './lines';
import { MONSTERS } from './monsters';
import { ENDLESS, REWARDS } from './progress';
import { RACE_CARDS } from './villages';

/**
 * The registry check (CONTENT.md): every card of every kind has all its pieces. A card that is
 * missing something fails with a checklist of exactly what is missing, e.g.
 *   monster siren: face ✗, defeat_siren ✗, mp3 defeat_siren ✗
 * so after `npm run new` this test is the to-do list. Missing mp3s fail only with STRICT_VOICE=1
 * (the deploy); locally they are listed as a warning until the lines are approved and voiced.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const strictVoice = process.env.STRICT_VOICE === '1';
const PART_FILES = import.meta.glob<Record<string, unknown>>('../assets/parts/*.ts', { eager: true });
const partFile = (id: string) => PART_FILES[`../assets/parts/${id}.ts`];
const hasMp3 = (id: string) => fs.existsSync(path.join(root, 'public/voice', `${id}.mp3`));
const hasPng = (sprite: string) => fs.existsSync(path.join(root, 'public/hud', `${sprite}.png`));

interface Entry {
  name: string;
  missing: string[];
  unvoiced: string[];
}

class Card {
  readonly e: Entry;
  constructor(name: string) {
    this.e = { name, missing: [], unvoiced: [] };
  }
  need(label: string, ok: boolean): this {
    if (!ok) this.e.missing.push(`${label} ✗`);
    return this;
  }
  /** A voice line: in lines.json, not a TODO, and voiced. */
  line(id: string | undefined): this {
    if (!id) return this;
    const l = (LINES as Record<string, { text: string } | undefined>)[id];
    this.need(id, !!l);
    if (l) this.need(`${id} text (TODO)`, !/TODO/.test(l.text));
    if (l && !hasMp3(id)) this.e.unvoiced.push(`mp3 ${id} ✗`);
    return this;
  }
  /** No field of the card still says TODO (stubs from `npm run new`). */
  done(card: object): this {
    return this.need('TODO in the card', !/TODO/.test(JSON.stringify(card)));
  }
  /** A parts model: its file exists and exports `build` (and `face` when the kind has one). */
  parts(ref: ModelRef | undefined, face: boolean): this {
    if (!ref) return this.need('model', false);
    if (ref.kind === 'glb') return this.need(`model ${ref.url}`, fs.existsSync(path.join(root, 'public', ref.url)));
    if (ref.kind !== 'parts') return this;
    const mod = partFile(ref.id);
    this.need(`part file src/assets/parts/${ref.id}.ts`, !!mod);
    if (mod) this.need('build', typeof mod.build === 'function');
    if (mod && face) this.need('face', typeof mod.face === 'object');
    return this;
  }
  sprite(name: string | undefined): this {
    if (!name) return this;
    return this.need(`sprite ${name} (npm run hud -- --only ${name})`, name in SPRITES && hasPng(name));
  }
}

const entries: Entry[] = [];
const card = (name: string) => {
  const c = new Card(name);
  entries.push(c.e);
  return c;
};

// ─── heroes (three, hard-coded for now) ───
for (const h of Object.values(HEROES)) card(`hero ${h.id}`).parts(h.model, false).line(h.lines.go).line(h.lines.hi).line(h.lines.bolt).line(h.lines.yay);

// ─── monsters: card + part file (build, face) + 2 lines ───
// the folk and rulers are in race files; only monsters keep the one-file rule with a face
for (const [key, m] of Object.entries(MONSTERS)) {
  card(`monster ${key}`)
    .need('kind = key', m.kind === key)
    .done(m)
    .parts(m.model, true)
    .line(m.spotLine)
    .line(m.defeatLine);
}

// ─── items: card + builder + line + album place ───
const builders = new Set<string>(ITEM_IDS);
for (const [key, it] of Object.entries(ITEMS)) {
  card(`item ${key}`)
    .need('id = key', it.id === key)
    .done(it)
    .need('model in ITEM_BUILDERS (src/assets/items.ts)', builders.has(key))
    .need('place in ITEM_ORDER', (it as { album?: false }).album === false || (ITEM_ORDER as string[]).includes(key))
    .line(it.line);
}

// ─── buildings: card + model + sprite + lines + a way to get it ───
const given = new Set<string>([
  ...REWARDS.flatMap((r) => (r.items ?? []).map(([b]) => b)),
  ...ENDLESS.map((e) => e.building),
  ...Object.values(RACE_CARDS).map((r) => r.prize),
  ...Object.values(CASTLE_CARDS).map((c) => c.prize),
]);
for (const [key, b] of Object.entries(BUILDINGS)) {
  card(`building ${key}`)
    .need('id = key', b.id === key)
    .done(b)
    .need('model in BUILDING_MODELS (src/assets/buildings.ts)', typeof (BUILDING_MODELS as Record<string, unknown>)[key] === 'function')
    .sprite(b.sprite)
    .need('a way to get it (REWARDS, ENDLESS, a prize, or count > 0 at the start)', b.count !== 0 || given.has(key))
    .line(b.firstLine)
    .line(b.rewardLine);
}

// ─── rewards, villages and castles: their lines ───
for (const r of REWARDS) card(`reward ${r.id}`).line(r.line);
for (const e of ENDLESS) card(`endless ${e.building}`).line(e.line);
for (const [race, r] of Object.entries(RACE_CARDS)) {
  const c = card(`village ${race}`).sprite(r.sticker);
  for (const l of [r.hello, r.prizeLine, ...Object.values(r.ask ?? {})]) c.line(l);
}
for (const [race, k] of Object.entries(CASTLE_CARDS)) {
  const c = card(`castle ${race}`).sprite(k.sticker).sprite(k.item).sprite(k.mark);
  for (const l of [k.hello, k.thanks, k.open, k.prizeLine, k.seen, k.pointer, ...Object.values(k.ask)]) c.line(l);
}

describe('registry: every card has all its pieces', () => {
  it('the kit order is the cards order', () => {
    expect(KIT_ORDER).toEqual(Object.keys(BUILDINGS));
  });

  for (const e of entries) {
    it(e.name, () => {
      const list = strictVoice ? [...e.missing, ...e.unvoiced] : e.missing;
      expect(list, `${e.name}: ${list.join(', ')}`).toEqual([]);
    });
  }

  it('missing voice (warns; STRICT_VOICE=1 fails above)', () => {
    const unvoiced = entries.filter((e) => e.unvoiced.length);
    if (unvoiced.length && !strictVoice) console.warn(`[registry] not voiced yet — npm run voice:\n${unvoiced.map((e) => `  ${e.name}: ${e.unvoiced.join(', ')}`).join('\n')}`);
  });
});
