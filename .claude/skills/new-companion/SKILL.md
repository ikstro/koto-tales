---
name: new-companion
description: Adds a companion — a friend who walks with the party and helps with one trick (shoot, heal, light) — to «Льошині казки» as one card + one part file + 2 lines, given by a reward, a tale or a castle. Use from /wish, or when the owner asks for a new friend, helper, pet or "new hero" ("новий друг", "помічник", "новий герой", "new companion").
---

# A new companion

## Trigger
A friend who comes along. "A new hero" also lands here until playable heroes exist (a later, separate task — the owner's call 2026-10-30); say so to the owner in one line.

## The card — `CompanionCard` in `src/content/companions.ts`
`{ id, name, model: { kind: 'parts', id }, speaker, trick, lines: { hi, yay } }`. Tricks (CONTENT.md «Companion»): `{ kind: 'shoot', reach }` (the robot helper's way, `systems/follow.ts`), `{ kind: 'heal', every }`, `{ kind: 'light', reach }`. Speaker from `tools/voice/speakers.json` (a new voice is a new speaker entry — ask the owner how it sounds).

## Files touched (≤ 3 + the giver)
1. `src/content/companions.ts` — the card.
2. `src/assets/parts/<id>.ts` — `face` + `build` (a friendly biped; example `parts/lyosha.ts`, `parts/robot.ts`).
3. `src/content/lines.json` — `companion_<id>_hi` (joins), `companion_<id>_yay` (does its trick; said at most every 75 s).
4. Who gives it: `companion: '<id>'` on a `Reward` (ask the owner where), a `TaleCard` or a `CastleCard`.

## Verify
`npm run new -- companion <id>` → `model-builder`, `lines-writer` → `npm run check` → `npm run preview -- companion <id>` → after voice: `?autostart=1&give=<id>`; `window.__kotoCompanions.list`; walk away and back, meet a monster.

## Gotchas
- Companions cannot be hurt and never leave; `save.companions` keeps them.
- Set the card's `speaker` before the lines-writer runs (the stub says `narrator`); the lines take the card's speaker.
- A shooting companion's arrows bounce off armoured monsters like the heroes' do.
