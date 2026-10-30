# Льошині казки — content vocabulary

What the engine can already do, per kind of thing Льоша invents. One source for every content skill
(`.claude/skills/*`) and agent. A wish that fits these words is content (a card, a model file, lines);
a wish that does not is engine work, done only after the owner's yes.

## The road (every kind, same steps)
1. `/wish` logs Льоша's words in `wishes/<date>-<slug>.md` and splits them into kinds below.
2. `npm run new -- <kind> <id>` writes the stubs (card with `TODO`, model file, lines with `TODO`).
3. The model (`model-builder` agent) and the lines (`lines-writer` agent) are filled in.
4. `npm run check` lists exactly what is still missing (`src/content/registry.test.ts`), until green.
5. `npm run preview -- <kind> <id>` → `design-lab/new/<id>.png` for the owner and Льоша to look at.
6. The owner says yes to the lines → `npm run voice` (never `--draft`) → `npm run check` → play with
   `?spawn=` / `?give=` / `?tale=` → commit; push to `main` only when the owner asks (it deploys).

## Rules for every card
- What is shared and what is not (the owner's call, 2026-10-30): the logic is shared — a card only picks verbs the engine already has, so a wish writes no engine code. The model is not: each thing's toy is built by hand (the `model-builder` agent, from the nearest existing model), so every monster keeps its own look. No parts library or recipes.
- Ids: lower-case latin, `snake_case` (`siren`, `crystal_song`). The id is the card's key and its `id`/`kind`.
- Lines: in `src/content/lines.json`, `{ speaker, text }`; short spoken Ukrainian for a 6-year-old;
  Льоша's own words kept where they fit. Speakers: `tools/voice/speakers.json` (`narrator`, `pupsia`,
  `lyosha`, `solomiia`, `david`, `monster`, the races and their rulers). Every line needs its mp3
  (`public/voice/<id>.mp3`); `STRICT_VOICE=1` (the deploy) fails on a missing one.
- `lyosha: true` on a monster, item, artifact or tale card: its album sticker gets the gold rim.
- Borrowed characters (a cartoon, an internet monster like "siren head") become the game's own toy:
  own Ukrainian name, own look, no brand, no copied design. Generic toy-brick look only (CLAUDE.md).
- No losing, home is safe, nothing to read, no digging (DESIGN.md). A wish never breaks these.
- Models are toy plastic parts built in code (`Kit` in `src/assets/parts/kit.ts`), colours from DESIGN.md
  «Palette», no lights (glow materials only).

## Monster — `src/content/monsters.ts`
Card `MonsterCard`; model `src/assets/parts/<id>.ts` exporting `build(skin): Rig` and `face: FaceSpec`
(the 8×8 face the atlas is drawn from); 2 lines `monster_<id>_spot` (Пупся sees it) and `defeat_<id>`.
The album order is the cards' order. No sprite: the album portrait is rendered at runtime.
- Body: `hp`, `wanderSpeed`, `chaseSpeed`, `damage` (hearts per bump, keep 1), `sight`, `radius`, `height`,
  `coins: [min, max]`, `color` (the puff when beaten).
- Where and when: `when: 'day' | 'night' | 'any'`, `weight` (how often among others), `biomes?`
  (`meadow | forest | beach | hills | snow`).
- Verbs:
  - `ranged: { range, keep, every, speed }` — throws from a distance (like Кістлявчик).
  - `cry: { kind: 'siren' | 'growl' | 'hiss' | 'beep', every? }` — its own voice, made in code
    (`src/voice/sfx.ts`), when it spots a hero and now and then (`every` seconds, default 9).
  - `armor: 'bolt' | 'lantern'` — arrows bounce off with a «дзинь»; `bolt`: only the lightning hurts it;
    `lantern`: arrows hurt it only within 6 blocks of a placed lantern.
  - `flee: 'light' | 'music'` — runs away from a working lamp / lit zone at night (`light`) or from
    playing music (`music`) instead of dancing.
- Rig types: `biped` (`bipedFrame`), `quadruped`, `spider` (see `contracts.ts`). Nearest examples:
  `zombie.ts` (biped), `spider.ts`.

## Item — `src/content/items.ts`
Card `ItemCard`; model: a builder in `ITEM_BUILDERS` (`src/assets/items.ts`); line `item_<id>` (said when
found and when its sticker is tapped). Add the id to `ITEM_ORDER` (album order) unless `album: false`.
- Where: `biomes` (list or `'any'`), `weight` (0 = never lies around; given only), `color` (sparkle).
- `use?: Effect` — the party carries it (the box's second row shows it with a count); a tap uses one:
  the plate closes and the effect starts. `use: 'auto'` — never shown in the row; fires by itself near
  its lock (keys).
- Prompt pieces (apple, cone) are buildings' food, not items; they stay as they are.

## Effect — `src/content/effects.ts`
`{ kind, for?: seconds, reach?: blocks }`. One shape for an item's `use` (timed) and an artifact's
`always` (on while the party has it). Kinds:
| kind | timed (item `use`) | always (artifact) |
|---|---|---|
| `heal` | every hero's hearts full | hearts come back fast everywhere |
| `fast` | run ×1.5 for `for` s (default 20) | always ×1.5 |
| `peace` | monsters within `reach` (9) dance for `for` s (10) | monsters within `reach` of the party dance |
| `freeze` | monsters within `reach` (10) stand still for `for` s (3) | monsters within `reach` wait |
| `light` | no monster appears within `reach` (8) for `for` s (60) | no monster appears within `reach` at night |
| `home` | the party is carried home (portal) | — (not allowed) |
A new kind = one entry in `EFFECTS` + one branch in `src/systems/effects.ts` (engine work).

## Artifact — `src/content/artifacts.ts`
One rare thing per tale or castle, found at the end (`TaleCard.artifact`, `CastleCard.artifact`). Card
`{ id, name, line, always: Effect, lyosha? }`; model: a builder in `ARTIFACT_BUILDERS`
(`src/assets/artifacts.ts`, same toy parts as items); line `artifact_<id>` (said when found and on tap).
Kept in `save.artifacts`; the album's «скарби» row shows it with a gold rim.

## Building — `src/content/buildings.ts`
Card `BuildingCard` (the id is its key; the kit plate order is the cards' order); model: one entry in
`BUILDING_MODELS` (`src/assets/buildings.ts`) → `(skin) => BuildingModel` (often in its own file, like
`food.ts`); sprite `b-<id>` baked by `npm run hud -- --only b-<id>`; lines `first_<id>` and `reward_<id>`;
a place in `REWARDS` (`src/content/progress.ts`, product order — ask the owner where).
- Body: `size: [x, z]`, `solid` cells, `count` at the start (`null` = never runs out, 0 = given later).
- Verbs (flags): `power` (`give`, `solar`, `take`, `store`, `light`, `reach`, `arcs`), `music`, `floor`,
  `dj`, `zap`, `traffic`, `ride`, `beam`, `bounce`, `sleep`, `shelter`, `slam`, `follow`, `fly`, `signal`,
  `jump`, `scan`, `food`, `swing` — each documented on `BuildingCard`. Upgrades: `src/content/upgrades.ts`.
- `BuildingModel.update(dt, tick)` animates it; `powerBulb` (`buildingParts.ts`) for powered ones.

## Companion — `src/content/companions.ts`
A friend who walks with the party (not playable). Card `{ id, name, model: { kind: 'parts', id },
speaker, trick, lines: { hi, yay } }`; model `src/assets/parts/<id>.ts` (`build` + `face`, as a monster);
lines `companion_<id>_hi` (joins) and `companion_<id>_yay` (does its trick). Given by a reward
(`Reward.companion`), a tale (`TaleCard.companion`) or a castle (`CastleCard.companion`); kept in
`save.companions`. Tricks:
- `{ kind: 'shoot', reach }` — shoots the nearest monster (the robot helper's way).
- `{ kind: 'heal', every }` — every `every` s, a hurt hero near it gets a heart.
- `{ kind: 'light', reach }` — at night no monster appears within `reach` of it.

## Tale — `src/content/tales.ts`
Card `TaleCard` (`lyosha: true` puts it first); lines `tale_<id>_open`, `tale_<id>_1..n`, `tale_<id>_thanks`,
`tale_<id>_retell`. Steps (`StepKind`): `gather` N things (`item`, `goal`, `spread` around `at`), `thief`,
`place` a building (`needs`), `visit` (home / a village), `music` N s, `defend` a wave, `sleep`, `light` a
lighthouse. Asker (`from`): Пупся (a dream) or a race (a paper plane); never the children. At the end:
`coins`, and optionally an `artifact` and/or a `companion`. Things to gather: `TALE_ITEMS`
(`src/assets/tales.ts`).

## Hero (playable)
Four, in `src/content/heroes.ts` (`HERO_ORDER`: Льоша, Соломія, Пупся, Давид — Давид added on the owner's
call 2026-10-30). A new playable hero is engine work (the `HeroId` type, a bed in the house, sleep spots in
the tent, tree house and guest houses, seats at the food places, the HUD's hero and fire sprites, a
speaker); "a new hero" from a wish is otherwise a companion card or a monster card.
- `weapon` (`WeaponKind`): what the big button throws — `arrow` (Льоша's bow), `star` (Соломія's wand),
  `paw` (Пупся's cat magic), `axe` (Давид's throwing axes; his sword stays in his hand). Every weapon
  flies far and hits the same (`HERO_STATS`); only the look, the spin and the sound differ. The lightning
  is not a weapon: only the child casts it, by its button (helpers never do).

## Checks and tools
- `npm run check` — tsc + tests; `src/content/registry.test.ts` prints a checklist per card.
- `npm run new -- <monster|item|artifact|building|companion> <id>` — stubs.
- `npm run preview -- <kind> <id>` — a picture on a studded plate → `design-lab/new/<id>.png`.
- `npm run hud -- --only b-<id>` — bakes only those sprites, keeps the rest.
- Debug: `?spawn=<monster>` beside the hero, `?give=<building|item|artifact|companion>`, `?tale=<id>`
  (all with `&autostart=1`).
