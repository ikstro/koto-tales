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
7. An update that brings something the child should notice gets a release in `src/content/whatsNew.ts`
   (each new thing: a picture, a `new_<id>` line for Пупся, a name and an `about`; DESIGN.md «What's new»).

## Rules for every card
- What is shared and what is not (the owner's call, 2026-10-30): the logic is shared — a card only picks verbs the engine already has, so a wish writes no engine code. The model is not: each thing's toy is built by hand (the `model-builder` agent, from the nearest existing model), so every monster keeps its own look. No parts library or recipes.
- Ids: lower-case latin, `snake_case` (`siren`, `crystal_song`). The id is the card's key and its `id`/`kind`.
- Lines: in `src/content/lines.json`, `{ speaker, text }`; short spoken Ukrainian for a 6-year-old;
  Льоша's own words kept where they fit. Speakers: `tools/voice/speakers.json` (`narrator`, `pupsia`,
  `lyosha`, `solomiia`, `david`, `monster`, the races and their rulers). Every line needs its mp3
  (`public/voice/<id>.mp3`); `STRICT_VOICE=1` (the deploy) fails on a missing one.
- Two engines (the owner's call, 2026-11-10; `tools/voice/VOICES.md`): the narrator and Пупся are Azure, sent plain
  text; everyone else is HolosTTS on this computer (`tools/voice/holos.py`, its Python in `tools/voice/.venv`, voices
  outside git), which reads our stress exactly. A new speaker gets `engine` and its voice in `speakers.json`.
- Stress (the owner's calls, 2026-11-07 and 2026-11-10): `npm run voice` marks the stress of every word by itself
  (`tools/voice/autostress.py`) for the HolosTTS speakers; names, homographs and words it gets wrong go into
  `tools/voice/stress.json` by hand (`words`, or `lines` for one line), and the script lists what is still unmarked.
  A word Azure stresses wrong goes into `stress.json` `azure` under its line id; only those words get a hint.
  Пупся says «Мау» and «Мур» (never «Мяу» or «Мур-р-р»: the voice growls them). `tools/voice/listen.mjs` hears the
  mp3s with Gemini and reports wrong stress (20 free requests a day; a flagged word is a lead, not a verdict).
- `lyosha: true` on a monster, item, artifact or tale card: its album sticker gets the gold rim.
- `about` on a monster, item, artifact, building or companion card (a tale has `name`, its title): one plain Ukrainian
  sentence for the parents — what it does or where it is met — shown in «Зміст гри» (DESIGN.md «Contents»). Not voiced.
  The stubs say `TODO`; the content check fails until it is written.
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
  - `shy: true` — runs from the heroes and never bites (the runaway gift).
- Rig types: `biped` (`bipedFrame`), `quadruped`, `spider` (see `contracts.ts`). Nearest examples:
  `zombie.ts` (biped), `spider.ts`.

## Item — `src/content/items.ts`
Card `ItemCard`; model: a builder in `ITEM_BUILDERS` (`src/assets/items.ts`); line `item_<id>` (said when
found and when its sticker is tapped). Add the id to `ITEM_ORDER` (album order) unless `album: false`.
- Where: `biomes` (list or `'any'`), `weight` (0 = never lies around; given only), `color` (sparkle).
- `use?: Effect` — the party carries it (the box's second row shows it with a count); a tap uses one:
  the plate closes and the effect starts. `use: 'auto'` — never shown in the row; fires by itself near
  its lock (keys).
- `reusable: true` — a tool stays in the box on use (shown once, without accumulating copies).
  The wind whistle uses `{ kind: 'wind' }` to recall one friendly wind, not a consumable charge.
- Prompt pieces (apple, cone) are buildings' food, not items; they stay as they are.
- A music disc is an item `disc_<song>` in `ITEM_ORDER`, weight 0, no `use`, plus one entry in `DISC_SONGS`
  (`src/content/music.ts`) and a line `song_<song>`. Found, its song joins the note's round. The song itself
  is engine work (`src/voice/music.ts`), always a tune of our own.

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
| `babusia` | the party is carried to her gate | — (not allowed) |
| `bloom` | daisies and poppies come up round the hero | — (not allowed) |
| `wind` | recalls the friendly blue wind; tap to fly high, joystick to steer, jump to land; saved distance-based fuel and automatic safe return | — (not allowed) |
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
- `tab`: which tab of the kit plate it sits in (`home | music | power | nature | fun`).
- Бабуся's verbs (each documented on `BuildingCard`, run by `src/systems/gadgets.ts`): `blast` (throws monsters back), `stage` (standing on it the party sings), `tap` (`drum | weather | cinema | fireworks | surprise | telescope`, a tap on the thing), `keys`, `fog`, `pedal`, `water` (set by water only), `rod`, `turret`, `bubble`, `wash`, `span` (bank to bank across water), `mount` (a hero rides it), `daily` (a thing by it each morning). `ride` and `swing` take their numbers.
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
- `guards: '<building id>'` — while one of these buildings stands in the world the friend stays at it
  and does its trick there (the yard dog at its будка): lying by it through the day, up and watching
  at night. Until one is put up (and if it is ever taken back) it walks with the party.

## Tale — `src/content/tales.ts`
Card `TaleCard` (`lyosha: true` puts it first); lines `tale_<id>_open`, `tale_<id>_1..n`, `tale_<id>_thanks`,
`tale_<id>_retell`. A tale with `follows` waits until that tale is done. Steps (`StepKind`): `gather` N things (`item`, `goal`, `spread` around `at`), `thief`,
`place` a building (`needs`), `visit` (home / a village), `music` N s, `defend` a wave, `sleep`, `light` a
lighthouse. Asker (`from`): Пупся (a dream), a race (a paper plane) or `babusia` (a stork); never the children. `host: 'olia'` or `'yulia'` on a `babusia` tale: it comes only while that hostess is at home, its lines spoken by her; `arrives: true`: it comes first of all once she is there. A step's
`at` may be `babusia`: wherever she stands that day, and she stays put while a tale leads to her. At the end:
`coins`, and optionally an `artifact`, a `companion` and/or `gifts` (`[{ item, n? } | { building }]`, straight
into the box); `weather` (the weather she makes) and `after` (a word from someone else after the thanks). The `monster` of a `thief` step says who runs off (Зомбік unless said). Things to gather: `TALE_ITEMS` (`src/assets/tales.ts`). A thief of `pole` or `disc` shows it in
its hand (`IN_HAND`, `src/systems/tales.ts`).
`wind: 'blue' | 'fire'` brings a wind into a tale, and restores it on resume (fire still respects safe areas).
The first blue-wind tale, `wind_friend`, follows `dog`: gather three shells → music → the reusable whistle.
Бабуся's tales: no family details, no surnames, nothing bad happens to either hostess (DESIGN.md «Бабуся», «Оля»). Both say
«котики». Food is what grandmothers cook, never cakes.

## Recipe — `src/content/recipes.ts`
Card `RecipeCard`: `host` (whose book it is in), `needs` (two products; the same one twice when it takes two), `dish` (an item), `snack`
(what the children hold at the table), `line`, `about`. A dish is an item in `ITEM_ORDER`, weight 0, with a `use` (three portions go into
the box); its model is in `DISH_BUILDERS` (`src/assets/dishes.ts`). A product is an item with a `weight` and `biomes`, listed in `PRODUCTS`,
with a line `babusia_cook_need_<id>` and `olia_cook_need_<id>` (what is short and where it lies). Lines: `item_<dish>`, `recipe_<id>` (spoken by its hostess).
Food is what grandmothers cook, never cakes. A step of a tale may be `cook`: done when a dish is on the table.

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
- Wind encounter: `?tornado=fire|blue|both&autostart=1`; `?give=wind_whistle` adds the reusable tool.
  Winds are a separate bounded engine system, not ordinary monster cards (`content/tornadoes.ts`, `systems/tornadoes.ts`).
