---
name: new-tale
description: Turns a story Льоша made up into a playable tale in «Льошині казки» — a card in src/content/tales.ts, its voiced lines, a new model when the story needs a thing the game has not got, checks, and a deploy. Use when the owner retells Льоша's story ("Льоша вигадав…", "нова казка", "додай казку", "add a tale") or asks to change one of the tales.
---

# A new tale from Льоша's story

The owner tells the story in plain words. The goal: tomorrow Льоша meets his own tale in the game — it comes first, opens with «Цю казку вигадав Льоша!», and its book page glows gold. Rules of the game always win over the story (DESIGN.md: no losing, home is safe, nothing to read, no digging, generic toy look, no brands).

## 1. Retell it as steps
Map the story onto the step kinds the engine has (`StepKind` in `src/content/tales.ts`), 1–4 steps:
- `gather` N things (`item`, `goal`, `spread` around `at`) — something lost, scattered, collected;
- `thief` — a monster carries a thing off; beaten, it drops it;
- `place` a building near a place (`building`; the child must own one, so add it to `needs` unless it starts in the kit: tent, boombox, lantern);
- `visit` a place (`home`, a race's village);
- `music` for N seconds near the hero; `defend` (a wave of N at a place); `sleep`; `light` (a lighthouse).
Who asks (`from`): Пупся (her tale comes as a dream after sleep) or a race (a paper plane). The children never ask; they play.
If a story beat fits no step kind, say so to the owner in one line and offer the nearest fit; a new step kind is engine work in `src/systems/tales.ts` (`makeRun` / `updateStep`) and a test in `src/content/tales.test.ts` — only with the owner's yes.

## 2. The card
Add it to `TALES` with `lyosha: true` (it goes first). Pictures (`picture`, `sticker`) are HUD sprites that exist (`src/ui/hudSprites.ts`). Coins 15–25.

## 3. Lines
In `src/content/lines.json`, ids `tale_<id>_open`, `tale_<id>_1..n` (one ask per step), `tale_<id>_thanks`, `tale_<id>_retell` (narrator, one sentence starting «Казка про …»). Speakers: `pupsia` for asks and her dreams, `elf` / `gnome` / `robot` / `alien` for letters and their thanks. Short, spoken Ukrainian for a 6-year-old; keep Льоша's own words where they fit.
Show the owner all new lines before voicing. Voice only after the yes: `npm run voice` (it voices only missing lines; never `--draft`).

## 4. A new thing
A thing to gather that the game has not got: a body in `body()` of `src/assets/tales.ts` (toy plastic parts, no lights), a `TaleItem` entry with its icon, its sparkle colour in `COLUMN`, and a picture baked in `tools/hud/bake.html` (`item-<kind>`, same loop as fish/scroll/yarn). Bake with `npm run hud`, then keep only the new sprites: restore the other PNGs and `src/ui/hudSprites.ts` from git and add the new manifest lines (the bake re-renders sprites with random phases).

## 5. Check and ship
- `npm run check` (the tale test checks lines, pictures, needs and steps).
- Play it: `npm run dev`, then `?tale=<id>&autostart=1`; `window.__kotoTales` has `state`, `go(i)`, `finishStep()`, `beatThief()`, `letter()`.
- Quick real-start check on the build before publishing; commit and push to `main` only when the owner asks (deploy is `.github/workflows/deploy.yml`).
