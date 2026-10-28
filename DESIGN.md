# Льошині казки — design rules

The source of the look is the game's own world, the «Діорама» skin: warm golden-hour toy bricks with rounded bevels and studs. The interface is made of the same material. Chosen by the owner on 2026-10-28 (comp `design-lab/2026-10-28-ui/comps/03-pieces`).

## Principles
- **The UI is toy pieces from this world**, rendered with the skin's plastic and the same sun (upper left), each with its own soft shadow. Never: white web circles, dark-outlined cartoon buttons, wooden boards, glossy candy gradients, stars, red badges.
- **The hero is always visible**: controls hug the corners, the centre stays free.
- **Nothing needs reading**: icons are printed on tiles; the only text is numbers (coins, monsters defeated, album counts). Finds are announced by voice only — no pop-up cards over the game.
- **One touch = one thing**, answered at once by motion and a click.
- **Sized by the screen, not the mock-up**: one unit `--u: clamp(44px, 8.5vmin, 76px)`; the bow ≈ 1.35u, other actions 1u, top pieces ≈ 0.8u. Nothing overlaps at 1280×800, 1024×600, 844×390 or 390×844 (portrait phone uses a compact layout).
- **Top right**: one hero piece (the current face; a tap fans out the three heroes), album, fullscreen, pause. Pause opens a plate of picture pieces: continue, sound, home (exit to the title); difficulty as three pieces with 1/2/3 skulls.

## Palette
| Token | Value | Use |
|---|---|---|
| plate | `#2f918b` (deep teal) | studded plates under groups of pieces — cool, to separate from the olive ground |
| print-cream | `#ffe3a3` | prints on dark pieces |
| print-dark | `#4a2c14` | prints and digits on light pieces |
| mustard | `#eab02b` / `#ffd23a` | number tile, joystick knob, active rim (gold) |
| coral | `#e0583f` / `#e8463a` | bow tile |
| blue | `#2f7fd6` | lightning tile, building brick default |
| green | `#3fa142` | building palette |
| pink | `#ee6a82` | Соломія's accents |
World colours come from `src/render/skins/diorama.ts`; building colours from `src/world/blocks.ts`.

## Pieces
- Round printed tile (bow, lightning, pickaxe), heart tile, the game's coin, mustard number tile, round hero tile with the rendered face (active: lifted, gold rim; others keep full colour), book piece (album), round joystick plate with a stud knob, the current building colour as a real 2×2 brick.
- Lightning charge: 8 studs around the tile light one by one; when full the tile pops.
- Sprites are baked from the game's models with the diorama materials: `tools/hud/` (re-bake after a skin or model change). Runtime cost: images + CSS transforms only.

## Type
Nunito 900, vendored woff2 (Cyrillic + Latin), `print-dark` on light pieces. Numbers only.

## Motion (damped springs, kinetics-like; stiffness / damping)
| Moment | Spring | Notes |
|---|---|---|
| drop-in of pieces on start | 300 / 17 | small squash on contact = the click |
| press | sink 7 px (one stud) in ~0.1 s, back 360 / 13 | shadow shrinks while sunk |
| counter bump on +1 | 420 / 9 | the number rolls |
| hero selection lift | 240 / 14 | the previous one settles back |
| ready pop (lightning full) | 380 / 10 | |
Every press plays its sound (`src/voice/sfx.ts`).

## Screens
- **Start**: «Розбуди героїв» — no words; the heroes asleep in the house, the touched one wakes and becomes the player (`src/ui/wake.ts`).
- **HUD**: as above (`src/ui/hud.ts`, `src/ui/style.css`).
- **Album, palette, chest prompt, toast, fade**: the same pieces and plates; no white sheets.

## Map
- **Minimap** (always on, `src/ui/map.ts`): a round studded plate ≈ 1.7u under the top-right row (left of the row on short landscape screens). The map is printed on the plate's tilted top: north up, the hero in the middle, ~24 blocks around. Redrawn 5×/s on a 2D canvas.
- **Big map**: a tap on the minimap opens it on a studded plate and pauses the game; coral ✕ or a tap outside closes it. Everything explored is fitted around the hero; when it no longer fits at a readable size, drag to look around.
- **Explored = seen**: the chunk (16×16) the hero stands in and its neighbours; the 5×5 chunks around the house are known from the start. The rest is under soft cream cloud puffs, never a flat sheet. Saved as a short list of `"cx,cz"`.
- **Tiles**: one block = a 3×3 px brick from above (lit upper-left edge, shaded lower-right, a stud highlight in the middle) in the «Діорама» colours: olive grass mosaic, dark-green / olive / golden crowns, golden sand, teal water, warm snow, sandstone; relief shading with the sun from the upper left.
- **Marks are pieces**: the hero's face tile, helpers as small tiles in their colours, monsters as purple Зомбік tiles, the house as a little house piece. Marks set with `setMapMarker` (house, boss, quest places) with `pointer` sit on the minimap rim when far away, with a coral arrow on the plate edge pointing the way; `zoneRadius` draws a dashed coral danger ring, visible over the clouds.
