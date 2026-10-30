---
name: new-monster
description: Adds a monster to «Льошині казки» as one card + one part file + 2 lines (src/content/monsters.ts, src/assets/parts/<id>.ts). Use from /wish, or when the owner asks for a new monster or a change to one ("новий монстр", "додай монстра", "new monster").
---

# A new monster

## Trigger
A wish part that walks the world, can be beaten, and is not a friend. A friend who walks with the party is a companion (`new-companion`). A boss is engine work (the land-eater is bespoke).

## The card — `MonsterCard` in `src/content/monsters.ts`
Real example: `skeleton` (ranged). Fields and verbs: CONTENT.md «Monster». Defaults that keep it fair for a 6-year-old: `damage: 1`, `hp` 3–6, `chaseSpeed` ≤ 3.5, `weight` 1–3 (rarer = lower). Verbs: `ranged`, `cry`, `armor` (`'bolt'`: arrows bounce, only lightning; `'lantern'`), `flee`, `when`, `biomes`. `lyosha: true` for the gold rim. Album order = card order.

## Files touched (≤ 3)
1. `src/content/monsters.ts` — the card.
2. `src/assets/parts/<id>.ts` — `export const face: FaceSpec` + `export function build(skin): Rig` (it registers itself by file name; nothing else to list).
3. `src/content/lines.json` — `monster_<id>_spot` (speaker `monster`: what it says when Пупся sees it) and `defeat_<id>` (`narrator`: «<Name> переможено!»).

## Ids & lines
id = snake_case latin (`siren`); `kind` = the key. Lines short, funny not scary, the monster's own little want («Де мої морквинки?»).

## Verify
`npm run new -- monster <id>` → `model-builder` (part file), `lines-writer` (2 lines) → `npm run check` (the registry lists what's missing) → `npm run preview -- monster <id>` → after voice: `npm run dev`, `?autostart=1&spawn=<id>`; `window.__kotoMonsters.list` shows it; check its verbs (it cries, arrows «дзинь», the bolt beats it).

## Gotchas
- Pass the face to the atlas: `faceAtlas('<id>', face)` — the id alone is not enough for a new monster.
- Tall monsters: set `height` on the card close to the rig's `height` (hit box and arrows aim at the middle). Сиренка (2.4) was fine to play; taller than ~2.6 hides the hero behind it on the steep camera.
- `armor: 'bolt'` makes the bow useless against it: keep `hp` ≤ 6 so two lightnings win (the lightning does 3, chains a little), and give it `weight` ≤ 1 so it stays a treat.
- A borrowed character's model: the model-builder's first try can read as something else (Сиренка's siren cap read as a Santa hat) — look at the preview before showing the owner.
