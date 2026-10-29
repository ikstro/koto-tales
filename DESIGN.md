# Льошині казки — design rules

The source of the look is the game's own world, the «Діорама» skin: warm golden-hour toy bricks with rounded bevels and studs. The interface is made of the same material. Chosen by the owner on 2026-10-28 (comp `design-lab/2026-10-28-ui/comps/03-pieces`).

## Principles
- **The UI is toy pieces from this world**, rendered with the skin's plastic and the same sun (upper left), each with its own soft shadow. Never: white web circles, dark-outlined cartoon buttons, wooden boards, glossy candy gradients, stars, red badges.
- **The hero is always visible**: controls hug the corners, the centre stays free.
- **Nothing needs reading**: icons are printed on tiles; the only text is numbers (coins, monsters defeated, album counts). Finds are announced by voice only — no pop-up cards over the game.
- **One touch = one thing**, answered at once by motion and a click.
- **Sized by the screen, not the mock-up**: one unit `--u: clamp(44px, 8.5vmin, 76px)`; the bow ≈ 1.35u, other actions 1u, top pieces ≈ 0.8u. Nothing overlaps at 1280×800, 1024×600, 844×390 or 390×844 (portrait phone uses a compact layout).
- **Where the thumbs are**: a tablet is held by both sides a little below the middle, so on a tablet (shorter side ≥ 560 px) the bow and the joystick's rest sit at about ⅔ of the height, near the side edges; the other actions arc around the bow. Phones are held by their bottom corners: there they stay at the bottom edge.
- **Top right**: one hero piece (the current face; a tap fans out the three heroes), album, fullscreen, pause. Pause opens a plate of picture pieces: continue, sound, «?» (the guide), the door (exit: saved, Пупся says goodbye, the installed game closes; in a browser tab it goes back to the title); difficulty as three pieces with 1/2/3 skulls.

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
- Round printed tile (bow, lightning, ✓, moon, fold, note, door), heart tile, the game's coin, mustard number tile, round hero tile with the rendered face (active: lifted, gold rim; others keep full colour), book piece (album), round joystick plate with a stud knob, the kit box (a mustard toolbox with a coral lid) on its own stud ring, the kit's buildings as their real models, the lantern as a real toy lantern piece (dark frame and cap, ring handle, warm glass, bright core, a soft glow behind it); the boss bar's lantern slots are small ones.
- Lightning charge: 8 studs around the tile light one by one; when full the tile pops. The kit box's ring works the same way for its task.
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

## Kit
No digging and no loose bricks (the owner's call): the ground is never changed. Achievements open **ready-made buildings** in a kit box; the child puts them up anywhere and packs them away again.
- **The box** sits left of the bow on a stud ring. A tap opens the kit plate: each building as its model with how many are left (none left: faded); the last cell is the next reward as a dark silhouette with its task's picture (Зомбік, coin, cloud, moon, boss) breathing on it — a tap says the task.
- **Placing**: a building chosen in the plate walks in front of the hero as a breathing see-through ghost, always on the nearest free spot (never on trees, water, the house, its doorstep and campfire, the portal arch or another building; the floor within two blocks of the hero's feet). The box turns into a green ✓ with a small coral ✕; ✓ drops the building in from above with a bounce. Ground uneven by one block gets a teal plinth. Buildings face the camera, like toys set out on a table.
- **Folding**: next to one of the child's buildings a fold piece (arrow into a box) breathes above the actions; a tap packs it back into the box.
- **Tasks** (`src/content/progress.ts`): one at a time, in a circle — monsters, coins, new places on the map, monsters, a night's sleep, the boss — each circle asking a little more, up to a cap. Once the windmill is out, the second «monsters» of a circle becomes «light a lighthouse»; once the dance floor is out, every other circle's «coins» becomes «dance» (seconds danced, near music or on the floor). The ring's studs show how far; when full: a fanfare, «Ура!», the reward's line. Rewards are cards in order — the portal; the windmill with four poles; three lamps; the solar panel; the battery; the engine-generator; the big speaker; the dance floor; the traffic light; the disco ball; the tesla tower; the DJ console — then, endlessly, more of each building in turn up to a cap (poles two at a time), then coins.
- The plate shows only what the child has (in the box or standing); with many buildings it grows wider before taller.
- Buildings: **tent** (sleep in it at night), **boombox** (music), **lantern** (never runs out; inside the boss's wasteland the box picks it by itself and ✓ pulses), and the power ones below.

## Power
One rule: **what stands close (7 blocks) joins by itself** — wires sag between neighbours, sparks run along the ones that work. Nobody drags a wire. Numbers are «sparks» a second (`src/content/power.ts`, tested):
| Building | Power | Look |
|---|---|---|
| windmill | +2 always | tall mast, spinning coral blades |
| solar panel | +3 × daylight | blue panel turning to the sun; rests at night |
| battery | stores 200, gives back what is missing | big toy battery, five studs show the charge |
| engine-generator | +6 always | engine, flywheel, meshing gears, puffs of smoke; a quiet putt nearby |
| pole | 0, carries it on | wooden pole with a crossarm |
| street lamp | −1; at night no monster appears within 8 | teal pole, warm lamp head with a halo and a pool |
| lighthouse (in the world) | −2; within 16 | see «World» |
| big speaker | −2 | tall cabinet, thumping cones, dust hopping on top (see «Music») |
| dance floor | −2 | 3×3 tiles lighting on the beat, brightest under feet |
| disco ball | −1 | mirror ball on a stand; coloured spots circle the ground at night |
| DJ console | −1 | turntables, sliders, a display in the song's colour |
| tesla tower | −3 | copper coil, a ball crackling; strikes the nearest monster within 7 every 1.3 s |
| traffic light | −1 | green 6 s, yellow 1.5 s, red 6 s (all lights together); on red, monsters within 9 stop and wait |
- Every powered building has a little bulb: warm = works, blinking coral = the network is short, grey = joined to nothing.
- Four times a second each network is balanced: enough → everything works, the spare fills batteries; short → batteries give; still short → **the whole network blinks and nothing on it works** (lamps don't protect), and Пупся says «струму мало» (at most once a minute, only nearby; at night with only the sun she says the panel is asleep). The first network that lights: «Ура, є струм!».
- The tesla never strikes a dancing monster (music means peace); waiting monsters at a red light neither chase nor bite.
- So it teaches itself: windmill + lighthouse = enough; windmill + three lamps = blinking; sun + lamp = fine by day, blinking at night until a battery comes.
- While a powered building's ghost walks along, a see-through wire shows what it would join.

## World: rivers, bridges, lighthouses
No sea (the owner's call): lakes and winding rivers, 5–6 blocks wide with sandy banks, cutting little valleys through the hills; the yard at home stays dry and no river comes within ~44 blocks of it. Everything comes from the seed (`src/world/terrain.ts`, `src/world/landmarks.ts`); the child never changes it.
- **Bridges**: about one every 56 blocks of river — toy plank bridges with teal railings, slightly arched. Their flat deck is invisible solid cells, so everyone walks over (heroes can also swim).
- **Lighthouses**: at most one per 128×128 region, on flat dry shore where there is plenty of water (a lake or a wide bend), never on trees; the nearest is ~85 blocks from home. A striped cream/coral tower ~10 high, a teal balcony, a glass lamp room, a mustard dome; a little coral boat bobs in front. Its tower dissolves on the camera–hero line, like trees.
- A lighthouse is dark until a network with enough power reaches it (bring the windmill and set it beside). Then its lamp burns, two warm beams sweep over the water (stronger at night), monsters do not appear within 16 at night. The first time: a fanfare, «Маяк світить!», a lighthouse sticker in the album (×N lit). Without power it goes dark again, but it stays counted.
- The first dark lighthouse met: Пупся «Ой, маяк! Він темний…».
- Map: dark lighthouses appear once their place is seen, lit ones always; the nearest lit one (or, during the lighthouse task, the nearest dark one) has the rim arrow.

## Music
- Four little songs made in code (no files, `src/voice/music.ts`): **disco** (kick, clap, hats, octave bass, chord stabs, a bell tune; C–G–Am–F, 120 a minute), **rock** (kick and snare, chugging power chords, a square riff; 132), **happy** (oom-pah bass, plucked chords, a whistled tune, shaker and woodblock; 108), **lullaby** (a music box over a soft pad, no drums; 72). One song for every speaker; it gets louder as the hero comes closer, dips under the voice and stops while paused.
- Speakers: the boombox (no power; heard within 18, monsters dance within 9) and the big speaker (needs power; heard within 30, dance within 14, a little louder).
- **Monsters near playing music dance and do not bite**; helpers leave dancing monsters alone. Standing still near the music, the party dances too; on a working dance floor at once; a step and they stop. The child's dancing time is counted (the «dance» task).
- **DJ console**: next to a working one a note piece breathes where the placing ✕ sits; a tap plays the next song, Пупся names it («Диско!», «Рок!», «Весела пісенька!», «Колискова… Тсс»). The song is saved.
- The boombox thumps on the beat, its display changes colour, notes float up.

## Portals
- The kit's first reward. An arch (teal pillars, mustard keystone, a turning warm swirl) stands in the front yard, left of the campfire.
- Far from home, a tap on the house on the big map opens a portal where the party stands and carries them out in front of the arch; that field portal stays, with its swirl mark on the map. Walking into the arch takes them back to it; walking into it takes them home. One field portal: the next jump home moves it. Before the reward, the tap gets Пупся's «скоро в нас буде портал».

## Sleep
- From evening till dawn, inside the house or next to a tent, a moon piece breathes above the actions (and Пупся says so once a night). A tap: the three lie down (beds at home, side by side in the tent), «На добраніч», a dark fade with warm stars, morning — hearts full, a new day, saved.

## Map
- **Minimap** (always on, `src/ui/map.ts`): a round studded plate ≈ 1.7u under the top-right row (left of the row on short landscape screens). The map is printed on the plate's tilted top: north up, the hero in the middle, ~24 blocks around. Redrawn 5×/s on a 2D canvas.
- **Big map**: a tap on the minimap opens it on a studded plate and pauses the game; coral ✕ or a tap outside closes it. Everything explored is fitted around the hero; when it no longer fits at a readable size, drag to look around.
- **Explored = seen**: the chunk (16×16) the hero stands in and its neighbours; the 5×5 chunks around the house are known from the start. The rest is under soft cream cloud puffs, never a flat sheet. Saved as a short list of `"cx,cz"`.
- **Tiles**: one block = a 3×3 px brick from above (lit upper-left edge, shaded lower-right, a stud highlight in the middle) in the «Діорама» colours: olive grass mosaic, dark-green / olive / golden crowns, golden sand, teal water, warm snow, sandstone; relief shading with the sun from the upper left.
- **Marks are pieces**: the hero's face tile, helpers as small tiles in their colours, monsters as purple Зомбік tiles, the house as a little house piece, the field portal as a small swirl tile, lighthouses as little striped towers (dark or lit). A mark may act on a tap (the house: the portal home). Marks set with `setMapMarker` (house, boss, quest places) with `pointer` sit on the minimap rim when far away, with a coral arrow on the plate edge pointing the way; `zoneRadius` draws a dashed coral danger ring, visible over the clouds.

## Lanterns in the world
- A placed lantern block is drawn by the skin as a lantern: dark moulded frame on its edges, warm glass, a hot core (diorama.ts, surface lantern); src/render/lanterns.ts adds a cap with a pyramid roof and ring handle on top and a soft additive halo plus a warm pool on the ground — two instanced draws for all lanterns, no light per lantern, on every quality level. Brighter at night; inside the boss's wasteland they pulse gently (they are cracking its armour).

## Guide
- «?» in the pause menu opens a plate of picture cards built from the HUD pieces and game renders: run (joystick), shoot (bow + monster), lightning (half-lit charge ring), buildings (kit box → tent), heal (apple + heart + house), map (minimap with the house and the boss arrow), portal (house → arch), sleep (moon + tent), power (windmill, pole, lamp), lighthouse (windmill → lit lighthouse), disco (big speaker, dance floor, DJ console), defence (tesla tower, traffic light), and the boss as a 3-step strip: three lanterns → cracked armour → arrow into the open glowing mouth. A tap on a card plays its voiced line (guide_*) and the picture hops. Coral ✕ or a tap outside closes; the game stays paused.
- Captions are short and for parents only; the pictures and the voice explain.
- The first time a save enters the boss's wasteland, after its roar the game pauses on the boss card alone (with guide_boss) and a ▶; any tap continues. Remembered in save.said as guide_boss.

## Voice frequency
- Пупся is chatty on purpose (the owner's call): she keeps the child company. Rules in `src/systems/pacing.ts` (tested) only stop her talking over herself: a thought every ~2–3 minutes, waiting for any playing line to end; the night tip every night.
- Boss fight: the stone hint whenever arrows bounce off the armour (at most every 25 s); the mouth hint after the armour breaks and when shots hit the closed mouth (at most every 35 s); the stomp warning once per session; one line per lantern. A boss card that popped up counts as the hint it explained.
