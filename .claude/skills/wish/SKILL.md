---
name: wish
description: Turns one of Льоша's ideas into the game the same way every time — logs it in wishes/, splits it into kinds (monster, item, artifact, building, companion, tale), maps them onto CONTENT.md, runs the per-kind skills, shows the owner pictures and lines, then voices, checks and plays. Use when the owner retells a wish ("Льоша хоче…", "Льоша вигадав…", "Лёша придумал…", "Lyosha wants…", "нове бажання", "/wish").
---

# A wish from Льоша → the game

The owner is a product designer: they decide what the child sees (name, look, what it does, who asks, where it sits). You decide everything technical, silently; say a technical call in one plain sentence only if it changes what they see. Talk in plain logic, in the owner's language. Rules of the game always win over the wish (DESIGN.md: no losing, home is safe, nothing to read, no digging, generic toy look, no brands).

## 1. Log it
Write `wishes/<YYYY-MM-DD>-<slug>.md` (format in `wishes/README.md`): Льоша's words verbatim, `status: idea`. Children's words only — no photos, surnames, places. A borrowed character (a cartoon, an internet monster) becomes the game's own toy: own Ukrainian name, own look.

## 2. Split and map
Split the wish into kinds and map each onto the words in `CONTENT.md` (the verbs each kind has). For each part, one line to the owner:
- fits → the card it becomes, in plain words («Сиренка: високий монстр, кричить сиреною, стріли відскакують — тільки блискавка»);
- does not fit → the nearest fit, or the engine verb it would need (engine work only with the owner's yes; log it as `needs engine`).
Ask only what the child will see and the wish does not say (look, name, what it says, where it comes from, its place among the rewards). One short message with all the questions; propose a default for each.

## 3. Build each part (per-kind skills)
`new-monster`, `new-item` (items and artifacts), `new-building`, `new-companion`, `new-tale`. Each starts with `npm run new -- <kind> <id>`. Run the agents in parallel, in one message:
- `model-builder` — the model file, from the owner's description and the nearest existing model;
- `lines-writer` — every `TODO` line of this wish, in one batch.
Then fill the card's own fields yourself (numbers, verbs, where it is given).

## 4. Show the owner
- `content-check` agent → `npm run check` list (must shrink to voice only) and `npm run preview` PNGs in `design-lab/new/`.
- One message: the pictures' paths, all new lines in one block (id · speaker · text), and how it plays (one sentence per part). Wait for yes / changes.

## 5. On yes
`npm run voice` (only new lines; never `--draft`) → `npm run check` green → play it: `npm run dev`, `?autostart=1&spawn=<monster>` / `&give=<id>` / `&tale=<id>` → `wishes/…md` `status: in game`, ids filled → commit on a branch. Push to `main` only when the owner asks (it deploys to the live game).

## Lessons from the dry run (2026-10-30)
See the per-kind skills' «Gotchas»; the pipeline itself: stubs typecheck, so the only failing tests are the registry checklist — read it, don't guess.
