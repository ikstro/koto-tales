---
name: new-building
description: Adds a kit building to «Льошині казки» as one card + one model file + its sprite + 2 lines + a place among the rewards (src/content/buildings.ts, src/assets/<id>.ts, BUILDING_MODELS). Use from /wish, or when the owner asks for a new building, machine or prize in the kit box ("нова будівля", "споруда", "new building").
---

# A new building

## Trigger
A thing the child puts up from the kit box and packs away, with a real use (DESIGN.md «Kit»). Never digging or loose bricks.

## The card — `BuildingCard` in `src/content/buildings.ts`
The id is its key (`BuildingId` comes from the cards); the kit plate order is the card order. Real example: `picnic` (food) or `wifi` (signal). Verbs are flags (CONTENT.md «Building»): `power`, `music`, `zap`, `traffic`, `beam`, `shelter`, `food`, `swing`, `scan`, `follow`, …. A new verb is engine work (owner's yes). `count: 0` = given later by a reward.

## Files touched (≤ 3 + the reward)
1. `src/content/buildings.ts` — the card.
2. `src/assets/<id>.ts` — `create<Id>(skin): BuildingModel` (`update(dt, tick)` animates it; `powerBulb` for powered ones; glows, never lights) and its line in `BUILDING_MODELS` (`src/assets/buildings.ts`; `npm run new` adds both).
3. `src/content/lines.json` — `first_<id>` (said the first time it goes up) and `reward_<id>` (when it comes out of the box).
4. A way to get it: a `REWARDS` entry in `src/content/progress.ts` — **ask the owner where in the order** (product decision); `progress.test.ts` pins the order, update it with the owner's answer. Or a village/castle `prize`.

## Verify
`npm run new -- building <id>` → `model-builder` → `npm run hud -- --only b-<id>` (the sprite; nothing else changes) → `npm run check` → `npm run preview -- building <id>` → after voice: `?autostart=1&give=<id>&kit=1`, put it up, watch its verb work.

## Gotchas
- The sprite has a generic shot in `tools/hud/bake.html` (fed, lit, fitted); give it a hand-tuned `shoot('b-<id>', …)` only if it reads badly.
- Footprint `size` and `solid` cells must sit inside the model's base, front towards +Z.
