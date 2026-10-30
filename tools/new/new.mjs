/**
 * npm run new -- <kind> <id>
 *   kind: monster | item | artifact | building | companion | tale
 *   id:   lower-case latin, snake_case (siren, crystal_song)
 *
 * Writes the stubs of a new card from tools/new/templates: the card (fields that need a decision
 * say 'TODO'), its model file or builder (marked `TODO(<id>)`), its lines (text 'TODO'). Everything
 * typechecks; `npm run check` then fails in src/content/registry.test.ts with exactly the list of
 * what is still to fill (CONTENT.md «The road»). Nothing is voiced or baked here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tpl = (name) => fs.readFileSync(path.join(root, 'tools/new/templates', name), 'utf8');
const KINDS = ['monster', 'item', 'artifact', 'building', 'companion', 'tale'];

const [kind, id] = process.argv.slice(2);
if (!KINDS.includes(kind) || !id) fail(`usage: npm run new -- <${KINDS.join('|')}> <id>`);
if (!/^[a-z][a-z0-9_]*$/.test(id)) fail(`id "${id}": lower-case latin, digits and _ only (siren, crystal_song)`);
const Id = id.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const fill = (s) => s.replaceAll('{{id}}', id).replaceAll('{{Id}}', Id);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const file = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const written = [];
function write(rel, text) {
  fs.writeFileSync(file(rel), text);
  if (!written.includes(rel)) written.push(rel);
}
function create(rel, text) {
  if (fs.existsSync(file(rel))) fail(`${rel} already exists`);
  write(rel, text);
}

/** Puts `snippet` (whole lines) just before the line that closes the object/array opened at `start`. */
function insertInto(rel, start, snippet) {
  let src = read(rel);
  const at = src.indexOf(start);
  if (at < 0) fail(`${rel}: "${start}" not found`);
  // an empty object written as `= {};`
  const empty = src.indexOf('{};', at);
  const eol = src.indexOf('\n', at);
  if (empty >= 0 && empty < eol) {
    src = src.slice(0, empty) + `{\n${snippet}}` + src.slice(empty + 2);
  } else {
    const close = src.slice(at).search(/\n[}\]]/);
    if (close < 0) fail(`${rel}: the end of "${start}" not found`);
    const cut = at + close + 1;
    src = src.slice(0, cut) + snippet + src.slice(cut);
  }
  write(rel, src);
}

/** Lines with 'TODO' text, appended to lines.json in its one-entry-a-line format. */
function lines(entries) {
  const rel = 'src/content/lines.json';
  let src = read(rel);
  const have = JSON.parse(src);
  for (const [lid] of entries) if (lid in have) fail(`line "${lid}" already exists`);
  const add = entries.map(([lid, speaker]) => `  ${JSON.stringify(lid)}: { "speaker": "${speaker}", "text": "TODO" }`).join(',\n');
  src = src.replace(/\n}\s*$/, `,\n${add}\n}\n`);
  write(rel, src);
}

function exists(rel, key) {
  return new RegExp(`\\n  ${key}: \\{`).test(read(rel));
}

switch (kind) {
  case 'monster':
    if (exists('src/content/monsters.ts', id)) fail(`monster "${id}" already exists`);
    insertInto('src/content/monsters.ts', 'export const MONSTERS = {', fill(tpl('monster.card.tpl')));
    create(`src/assets/parts/${id}.ts`, fill(tpl('monster.part.ts.tpl')));
    lines([[`monster_${id}_spot`, 'monster'], [`defeat_${id}`, 'narrator']]);
    break;
  case 'item':
    if (exists('src/content/items.ts', id)) fail(`item "${id}" already exists`);
    insertInto('src/content/items.ts', 'export const ITEMS = {', fill(tpl('item.card.tpl')));
    insertInto('src/content/items.ts', 'export const ITEM_ORDER', `  '${id}',\n`);
    insertInto('src/assets/items.ts', 'const ITEM_BUILDERS', fill(tpl('item.builder.tpl')));
    lines([[`item_${id}`, 'narrator']]);
    break;
  case 'artifact':
    if (exists('src/content/artifacts.ts', id)) fail(`artifact "${id}" already exists`);
    insertInto('src/content/artifacts.ts', 'export const ARTIFACTS', fill(tpl('artifact.card.tpl')));
    insertInto('src/assets/artifacts.ts', 'export const ARTIFACT_BUILDERS', fill(tpl('artifact.builder.tpl')));
    lines([[`artifact_${id}`, 'pupsia']]);
    break;
  case 'building': {
    if (exists('src/content/buildings.ts', id)) fail(`building "${id}" already exists`);
    insertInto('src/content/buildings.ts', 'const CARDS = {', fill(tpl('building.card.tpl')));
    create(`src/assets/${id}.ts`, fill(tpl('building.model.ts.tpl')));
    insertInto('src/assets/buildings.ts', 'export const BUILDING_MODELS', `  ${id}: create${Id},\n`);
    let src = read('src/assets/buildings.ts');
    src = src.replace("import { createStation } from './station';", `import { createStation } from './station';\nimport { create${Id} } from './${id}';`);
    write('src/assets/buildings.ts', src);
    lines([[`first_${id}`, 'narrator'], [`reward_${id}`, 'narrator']]);
    break;
  }
  case 'companion':
    if (exists('src/content/companions.ts', id)) fail(`companion "${id}" already exists`);
    insertInto('src/content/companions.ts', 'export const COMPANIONS', fill(tpl('companion.card.tpl')));
    create(`src/assets/parts/${id}.ts`, fill(tpl('companion.part.ts.tpl')));
    lines([[`companion_${id}_hi`, 'narrator'], [`companion_${id}_yay`, 'narrator']]);
    break;
  case 'tale':
    if (read('src/content/tales.ts').includes(`id: '${id}'`)) fail(`tale "${id}" already exists`);
    insertInto('src/content/tales.ts', 'export const TALES: TaleCard[] = [', fill(tpl('tale.card.tpl')));
    lines([[`tale_${id}_open`, 'pupsia'], [`tale_${id}_1`, 'pupsia'], [`tale_${id}_thanks`, 'pupsia'], [`tale_${id}_retell`, 'narrator']]);
    break;
}

console.log(`new ${kind} "${id}":\n${written.map((w) => `  ${w}`).join('\n')}`);
const next = {
  monster: '`model-builder` agent → the part file; `lines-writer` agent → the 2 lines',
  item: '`model-builder` agent → the builder in src/assets/items.ts; `lines-writer` → item line; `use` if the party can use it',
  artifact: '`model-builder` → the builder in src/assets/artifacts.ts; `always` effect; a tale or castle that gives it (`artifact:`)',
  building: '`model-builder` → src/assets/' + id + '.ts; its verbs on the card; a place in REWARDS (ask the owner); npm run hud -- --only b-' + id,
  companion: '`model-builder` → the part file; `trick`; a reward, tale or castle that gives it (`companion:`)',
  tale: 'steps (CONTENT.md «Tale»), sticker, lines; `artifact:` / `companion:` at the end if the story has them',
}[kind];
console.log(`next: ${next}\nthen: npm run check — it lists what is still missing.`);
