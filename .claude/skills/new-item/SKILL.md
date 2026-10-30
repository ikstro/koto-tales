---
name: new-item
description: Adds an item (a thing found in the world, optionally usable) or an artifact (a rare treasure with a lasting power, found at the end of a tale or castle) to «Льошині казки». Use from /wish, or when the owner asks for a new thing to find, carry, use, or a treasure ("нова річ", "предмет", "артефакт", "скарб", "new item", "artifact").
---

# A new item or artifact

## Trigger
- **Item**: lies about in the world (or is given), shows in the album; with `use` the party carries it and a tap in the kit plate's second row uses one.
- **Artifact**: one rare thing at the end of a tale or castle; while the party has it, its `always` effect is on; album «скарби» row with a gold rim.
A thing only for a tale's gather step is a `TaleItem` (`new-tale`), not an item.

## The card
- Item — `ItemCard` in `src/content/items.ts`; example `key_gold` (`use: 'auto'`). `use: { kind, for?, reach? }` (CONTENT.md «Effect»: heal, fast, peace, freeze, light, home). `weight: 0` = never lies around (given only). Add its id to `ITEM_ORDER` (album order; `npm run new` appends it).
- Artifact — `ArtifactCard` in `src/content/artifacts.ts`: `always` (any kind but `home`); and the tale/castle card that gives it: `artifact: '<id>'` on `TaleCard` or `CastleCard`.

## Files touched (≤ 3)
1. The card (`items.ts` or `artifacts.ts`) — and for an artifact the giver's `artifact:` field.
2. The model: a builder in `ITEM_BUILDERS` (`src/assets/items.ts`) or `ARTIFACT_BUILDERS` (`src/assets/artifacts.ts`): toy parts 0.4–0.6 tall, origin bottom centre, glow parts (`{ c, glow: true }`), no lights.
3. `src/content/lines.json` — `item_<id>` (narrator: «Це …!») or `artifact_<id>` (pupsia: what it does, in one breath).

## Verify
`npm run new -- item|artifact <id>` → `model-builder`, `lines-writer` → `npm run check` → `npm run preview -- item|artifact <id>` → after voice: `?autostart=1&give=<id>` (an item: 3 of it; open the box, tap it in the second row; `window.__kotoEffects.timed`), an artifact: `window.__kotoEffects.lasting`, album row «скарби».

## Gotchas
- Album pictures of items and artifacts are rendered at runtime — no HUD bake needed.
- Using consumes the item from `save.inv`; the album sticker stays (found), its ×N count goes down.
