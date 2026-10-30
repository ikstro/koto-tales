# Конструктор: Льоша's wishes → the game (infrastructure only)

Plan written 2026-10-30 in a local session; to be continued in a cloud session. Decisions by the owner are marked.

## Context
Owner wants a repeatable way to put Льоша's ideas (monster, hero, item, building, artifact, tale…) into the game without reinventing the steps each time. Today: content is already data cards, but each kind is registered by hand in 4–11 places (unions, builder maps, a `switch`, face atlas, bake.html), only 3 kinds are checked by tests, the sprite bake rebakes everything, and the one skill (`new-tale`) is prose that relies on judgement. Goal of this work: **make every kind "one card + one model file + lines", make the check list the missing pieces, and wrap it in skills/agents/scripts.** No new content is created here (a throwaway monster only to prove the pipeline).

## The shape (every kind, same road)
```
owner retells wish ──► /wish skill ──► wishes/<date>-<slug>.md (his words, kinds, status)
        │
        ▼
 map onto CONTENT.md vocabulary (what the engine can already do)
   fits ──► per-kind skill (new-monster | new-building | new-item | new-companion | new-tale)
   no fit ─► one line to owner: nearest fit, or engine verb (only with yes)
        │
        ▼
 npm run new -- <kind> <id>   → stubs with TODO (card, model file, lines)
 agents fill in parallel: model-builder (opus) · lines-writer (sonnet)
 npm run check                → registry test lists exactly what's still missing
 npm run preview -- <kind> <id> → design-lab/new/<id>.png   (owner + Льоша look)
 owner says yes to lines      → npm run voice → play (?spawn= ?give= ?tale=) → ship only when asked
```

## Stage 0 — the vocabulary and the log
- **`CONTENT.md`** (root, @-imported from CLAUDE.md like DESIGN.md): per kind, the card type path, its fields in plain words, the **verbs** the engine has (monster: `ranged`, `cry`, `armor`, `flee`, `when/biomes`; building: `power/music/zap/shelter/food/signal/scan/follow/…` flags; item: `use` effects; artifact: `always` effects; tale: step kinds; companion: `trick`), the id/line/sprite naming rules, the ship steps (lines approval → voice → check → play → push on ask). One source for all skills.
- **`wishes/`** + `wishes/README.md`: one short md per wish (date, Льоша's words verbatim, kinds, status: idea / in game / needs engine). Children's words only, no photos. The owner's backlog.
- Rule written once: borrowed characters (e.g. an internet "siren head") become the game's own toy: own name, own look, no brand.

## Stage 1 — engine seams (a card registers itself)
| Kind | Today (touchpoints) | After |
|---|---|---|
| Monster | card `src/content/monsters.ts` + `MONSTER_ORDER`, part file, `PART_BUILDERS` line (`src/assets/models.ts:28`), `FaceId` + atlas in `src/assets/faces.ts`, 2 lines | card (order derived from object order) + **one part file** that exports `build` and `face` (a `FaceSpec` the atlas is drawn from) + 2 lines |
| Building | `BuildingId` union (`buildings.ts:11`), card, `create<X>` + `case` in `src/assets/buildings.ts:89`, `KIT_ORDER`, `REWARDS` in `progress.ts`, bake line, 2 lines | `BuildingId = keyof typeof BUILDINGS`; `BUILDING_MODELS: Record<BuildingId, (skin)=>BuildingModel>` map replaces the switch; `kit` order = object order; reward entry stays (product order) |
| Item | card `items.ts` + `ITEM_BUILDERS` (`src/assets/items.ts:83`) + line | same + optional **`use: Effect`** (see effects) |
| Artifact (new) | — | `src/content/artifacts.ts`: `{id, model, name, line, always: Effect, lyosha?}`; given by `TaleCard.artifact` / `CastleCard.artifact`; `save.artifacts: string[]`; album row «скарби», gold rim; `src/systems/artifacts.ts` keeps `always` effects on |
| Companion (new) | robot helper = a building with `follow` | `src/content/companions.ts`: `{id, model (parts), speaker, trick, lines{hi,yay}}`; `trick` ∈ existing verbs (`shoot` = robot helper's code generalised into `src/systems/companions.ts`, `heal`, `light`); given by reward/tale/castle; `save.companions` |
| Effects (new, shared) | heal (picnic), fast (ice cream), peace (music), freeze (searchlight), light (lantern), home (portal) exist as code paths | `src/content/effects.ts`: `Effect = {kind, for?: seconds, …}`; `src/systems/effects.ts` applies timed (item `use`) and passive (artifact `always`) effects by calling those existing paths. Adding an effect kind = one entry + one branch. |
| Monster verbs (new) | sound generic; kill = hp only | `cry?: {kind:'siren'\|'growl'\|'hiss'\|'beep', …}` synthesised in `src/voice/sfx.ts` (no files, like music), played on spot + now and then; `armor?: 'bolt'\|'lantern'` (arrows bounce, as the boss); `flee?: 'light'\|'music'` |
| Any card | tales only | `lyosha?: true` on any card → gold rim in the album (one helper in `ui/album.ts`) |
| Hero (playable) | 3 hard-coded (union `contracts.ts:20`, wake ritual, strip, keys 1–3, beds, guest houses) | **Stage 4** (below). Until then "a new hero" = companion or monster card. |
- Save: v13 migration adds `artifacts`, `companions` (`src/systems/save.ts` pattern, + `save.test.ts` case).
- Items with `use` (owner's call 2026-10-30): a **second row in the kit plate** (the box = everything you carry; tap = use, the plate closes, the effect starts; count on the cell; `use: 'auto'` items such as keys fire by themselves near their lock). Context prompt pieces (apple, cone) stay as they are.

## Stage 2 — checks and scripts (deterministic, not judgement)
- **`src/content/registry.test.ts`** (extends `content.test.ts`): for every card of every kind — model in registry, sprite in `SPRITES`, every line id in `LINES`, mp3 present; buildings also a `BUILDING_MODELS` entry and a `REWARDS`/`KIT` placement; rewards' lines; village cards; guide cards. Failure prints a checklist (`sirenhead: part file ✗, defeat_sirenhead ✗, mp3 ✗`). `STRICT_VOICE=1` in `deploy.yml` so a missing mp3 never ships.
- **`npm run hud -- --only b-x,item-y`**: `tools/hud/bake.mjs` passes the list to `bake.html` (query), bakes only those, merges into `public/hud/` and `src/ui/hudSprites.ts` without deleting the rest. Kills the "restore from git" dance.
- **`npm run preview -- <kind> <id>`**: Playwright shot (pattern `tools/check/shots.mjs`) of the thing on a studded plate under the world sun at tablet scale → `design-lab/new/<id>.png` (git-excluded). For a monster: idle + walk frame; building: with its bulb/animation; item/artifact: on the sticker tile.
- **`npm run new -- <kind> <id>`** (`tools/new/new.mjs`): writes stubs from templates (`tools/new/templates/*.ts.tpl`): part/model file, card appended with `TODO` fields, lines with `TODO` text. After it, `npm run check` fails with exactly the list to fill.
- **Debug params** (`src/core/params.ts` whitelist + `src/debug/`): `?spawn=<monster>` beside the hero, `?give=<building|item|artifact|companion>`, existing `?tale=`. `window.__koto*` hooks already there for tales/monsters.

## Stage 3 — skills and agents (`.claude/`)
- **`skills/wish/SKILL.md`** (`/wish`, trigger «Льоша хоче / вигадав / придумал…»): 1) write `wishes/<date>-<slug>.md`; 2) split into kinds; 3) map onto CONTENT.md, name misfits in one line; 4) run per-kind skills; 5) show owner: preview PNGs + all new lines in one block; 6) on yes: voice → check → play; 7) push only when asked. Product questions only (name, look, what it does, who asks); technical calls made silently.
- **Per-kind skills**, same 5-section template (~35 lines each): trigger · the card (type path + one real example) · files touched (≤3) · ids & lines convention · verify (`new` → `check` → `preview` → debug param). `new-monster`, `new-building`, `new-item` (items + artifacts), `new-companion`, and **`new-tale` rewritten** onto the template (adds `artifact` reward, drops the bake dance).
- **Agents** (`agents/*.md`, each with `model:` + `effort:`): `model-builder` (opus, high — a parts/building model from a description + the nearest existing file as reference, DESIGN.md materials), `lines-writer` (sonnet, medium — Ukrainian for a 6-year-old in the game's voice, speakers from `speakers.json`, Льоша's words kept), `content-check` (haiku, low — runs check + preview, returns the missing-list and PNG paths). `/wish` runs the first two in parallel.
- CLAUDE.md: a 3-line «Content pipeline» paragraph: `/wish`, CONTENT.md, `wishes/`.

## Stage 4 — N playable heroes (later, separate task — owner's call 2026-10-30)
`HeroId = keyof typeof HEROES`; wake ritual, hero strip, input keys, `sleepSpots`, guest-house spots, bake `HC` sprites driven by `HERO_ORDER.length`; `new-hero` skill. Not in this iteration. CONTENT.md says so: until then "a new hero" = a companion or a monster card.

## Order and size
1. Stage 0 (½ day) → 2. Stage 1 monsters + buildings seams + registry test + `--only` bake (1 day) → 3. effects, items `use`, artifacts, companions, save v13 (1–1½ days) → 4. `new`, `preview`, debug params (½ day) → 5. skills + agents + CLAUDE.md (½ day) → 6. dry run.
Touches: `src/content/*`, `src/assets/models.ts`, `faces.ts`, `buildings.ts`, `src/systems/{effects,artifacts,companions,save}.ts`, `src/ui/{album,hud,guide}.ts`, `tools/{hud,new,check}`, `.claude/{skills,agents}`, `CONTENT.md`, `CLAUDE.md`, `deploy.yml`.

## Verification
- `npm run check` green; registry test fails loudly when one piece of any kind is removed (try: delete a line id).
- `npm run hud -- --only b-tent` reproduces the tent entry, other PNGs untouched (git diff shows 2 files).
- Dry run on a branch: `/wish` with a throwaway «Сиренка» monster (tall, siren head, `cry: siren`, `armor: bolt`) and a «кристал» item with `use: {kind:'peace', for: 10}` → stubs → agents → check list shrinks to zero → preview PNG → `?spawn=` shows it alive, cries, arrows bounce, bolt kills → album gold rim. **Only the logic is kept** (owner's call): the throwaway cards, model, lines and mp3s are removed before merge; what the dry run taught goes into the skills/templates.
- `STRICT_VOICE=1` in `deploy.yml` (owner's call): a missing mp3 blocks publishing.
- Quick real-start check on the build before any publish.

## Decisions (owner, 2026-10-30)
- Items with `use`: second row in the kit plate; keys `use: 'auto'`.
- N playable heroes: later, separate task.
- Dry run: keep only the logic, drop the test content.
- Strict voice in deploy: yes.

## Exploration notes (for the cloud session; verified 2026-10-30 by reading the code)
- Cards and registries: `src/content/{monsters,heroes,items,buildings,progress,upgrades,tales,villages,castles}.ts`; `LineId = keyof lines.json` (`src/content/lines.ts`); `SPRITES` in `src/ui/hudSprites.ts` is generated by `npm run hud`.
- Models: `PART_BUILDERS` map `src/assets/models.ts:28`; part file = `export function build(skin): Rig` using `Kit` (`src/assets/parts/kit.ts`) + `bipedFrame` (`parts/frames.ts`) + `faceAtlas(id)` (`src/assets/faces.ts`, `FaceId` union at line ~12). Building models: `createBuilding` switch `src/assets/buildings.ts:89`, models spread over `buildings.ts, disco.ts, signal.ts, station.ts, food.ts, castles.ts, villages.ts`; hooks `update(dt, BuildingTick)` and `powerBulb` in `buildingParts.ts`.
- Monster runtime: `src/systems/monsters.ts` (spawn by `when/biomes/weight`), `combat.ts:152` loot, `narration.ts:55` lines; boss is bespoke (`boss.ts`, `bossLogic.ts`), out of the pipeline.
- Robot helper (companion prototype): building card with `follow`, handled in `src/systems/kit.ts` / `prizes`.
- Existing effect code paths: picnic heal and ice-cream fast (`src/systems/food*`), music peace (`music`/`monsters.ts` dance), searchlight freeze (`frozen` on Monster), lantern glow (`render/lanterns.ts`), portal home (`portals`).
- Tests: `src/content/content.test.ts` (heroes, monsters, items only; mp3 only warns unless `STRICT_VOICE=1`), `tales.test.ts`, `castles.test.ts`, `progress.test.ts` pins the exact `REWARDS` order.
- Bake: `tools/hud/bake.mjs` (Vite on 5291 + Playwright headless shell, 90 s virtual budget) runs hand-written `shoot(...)` calls in `tools/hud/bake.html`, deletes all PNGs first, regenerates `hudSprites.ts`.
- Voice: `tools/voice/gen.mjs` is incremental by hash (`voice-lock.json`), Azure keys in User env, ~3.3 s per new line; `speakers.json` per speaker; `--draft` never for the published build.
- Save: `SAVE_VERSION = 12`, `MIGRATIONS` map in `src/systems/save.ts`; keyed records (`found`, `inv`, `tales.done`) need no bump.
- Existing skill: `.claude/skills/new-tale/SKILL.md` (the only one; no agents, hooks or settings in `.claude/`).
