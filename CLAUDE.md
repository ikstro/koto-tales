# Льошині казки

A blocky 3D browser game for a 6-year-old (Льоша) who invents its stories; his friends Соломія and Давид and the cat Пупся are the other heroes. Ukrainian voice-over, Android tablet (PWA, offline), published from `main` to https://ikstro.com/koto-tales/ by `.github/workflows/deploy.yml`.

@DESIGN.md
@CONTENT.md

## Commands
- `npm run dev` — dev server (`--host`), URL switches in `src/core/params.ts` (`?skin= &autostart=1 &hero= &x= &z= &time= &freeze=1 &fresh=1 &demo=1 &hud=0 &stats=1 &kit=1 &pause=1 &spawn=<monster> &give=<card id>`).
- `npm run check` — tsc + vitest (includes the content check: every card has its model and lines).
- `npm run shots` — tablet-size screenshots of fixed scenes into `design-lab/shots/`.
- `npm run voice` — `src/content/lines.json` → `public/voice/*.mp3` (Azure Speech; keys in User env).
- `npm run hud -- --only b-x,item-y` — bakes only those HUD sprites and merges them (`npm run hud` alone re-bakes all).
- `npm run new -- <kind> <id>`, `npm run preview -- <kind> <id>` — see «Content pipeline». `npm run serve` serves the built `dist/`.

## Architecture
- Seams live in `src/contracts.ts`. World data (`src/world`) is style-neutral; the look is a swappable skin (`src/render/skins`, default `diorama`). Models come from code parts, `.glb` or the child's drawings through one rig convention (`src/assets`).
- Content is data cards (`src/content`): a new monster/item/line/building/reward is a card, not engine code.
- Systems talk through `src/core/events.ts`. Saves are versioned with migrations (`src/systems/save.ts`).

## Rules
- Photos of the children never go into the repo; `design-lab/` is excluded from git (`.git/info/exclude`).
- Generic toy-brick aesthetic only: no brand names, logos on studs, minifigure shapes, or copies of real games' UI.
- No losing; home is safe; nothing must require reading.
- No digging or loose bricks: the ground never changes; achievements open ready-made buildings in the kit (DESIGN.md «Kit»), each with a real use.

## Content pipeline
- Льоша's ideas go in through `/wish` (`.claude/skills/wish`): logged in `wishes/`, split into kinds, built by the per-kind skills.
- `CONTENT.md` is the vocabulary: what each kind of card can say and do, ids, lines, the ship steps.
- `npm run new -- <kind> <id>` → stubs; `npm run check` lists what is missing; `npm run preview -- <kind> <id>` → a picture.
