---
name: new-tale
description: Turns a story Льоша made up into a playable tale in «Льошині казки» — a card in src/content/tales.ts, its lines, a new thing to gather when the story needs one, and optionally an artifact or a companion at the end. Use from /wish, or when the owner retells Льоша's story ("Льоша вигадав…", "нова казка", "додай казку", "add a tale") or asks to change one of the tales.
---

# A new tale

## Trigger
A little story of 1–4 steps. Tomorrow Льоша meets his own tale: it comes first, opens with «Цю казку вигадав Льоша!», its book page glows gold. Rules of the game win over the story (no losing, home is safe, nothing to read, no digging).

## The card — `TaleCard` in `src/content/tales.ts`
Real example: `yarn` (gather → home). Steps (`StepKind`, CONTENT.md «Tale»): `gather` N `item`s (`goal`, `spread` around `at`), `thief`, `place` a building (add it to `needs` unless it starts in the kit: tent, boombox, lantern), `visit` (home / a village), `music` N s, `defend`, `sleep`, `light`. Asker `from`: Пупся (a dream) or a race (a paper plane) — never the children. `lyosha: true`, coins 15–25. At the end, if the story has them: `artifact: '<id>'` (`new-item`), `companion: '<id>'` (`new-companion`). A beat that fits no step: nearest fit in one line to the owner; a new step kind is engine work (`systems/tales.ts` `makeRun`/`updateStep` + `tales.test.ts`) only with the yes.

## Files touched (≤ 3)
1. `src/content/tales.ts` — the card (`npm run new -- tale <id>` appends a stub).
2. `src/content/lines.json` — `tale_<id>_open`, `tale_<id>_1..n` (one ask per step), `tale_<id>_thanks`, `tale_<id>_retell` (narrator, one sentence «Казка про …»). Speakers: `pupsia`, or `elf` / `gnome` / `robot` / `alien` for letters.
3. Only for a new thing to gather: `src/assets/tales.ts` (`body()` toy parts, `COLUMN` sparkle colour), `TaleItem` + `TALE_ITEMS` icon, its picture in `tools/hud/bake.html` (`item-<kind>`, same loop as fish/scroll/yarn), baked with `npm run hud -- --only item-<kind>` (nothing else changes).

## Verify
`npm run check` (registry: lines, pictures, TODOs; `tales.test.ts`: steps, needs) → after voice: `npm run dev`, `?tale=<id>&autostart=1`; `window.__kotoTales` has `state`, `go(i)`, `finishStep()`, `beatThief()`, `letter()`.

## Gotchas
- Pictures (`sticker`, `picture`) must be HUD sprites that exist (`src/ui/hudSprites.ts`).
- A tale needing a building waits until the child has one — check the order still makes sense for a new save.
