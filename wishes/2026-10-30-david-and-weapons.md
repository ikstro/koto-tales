# Давид і своя зброя в кожного
- date: 2026-10-30
- said: «Хочу добавить ещё одного героя Давида, это Лёшин друг. Плюс давай каждому герою дадим собственное оружие» (the owner, for Льоша)
- kinds: hero (playable), hero weapons
- status: built, waiting for the owner's yes on Давид's lines (then `npm run voice`)
- notes:
  - **Давид** — a fourth playable hero, Льоша's friend. Not in CONTENT.md: heroes are hard-coded (three).
    Nearest fit: a companion card (walks along, shoots; not playable). Engine work for a real hero:
    `HeroId`, `HERO_ORDER`, a 4th bed in the house, sleep spots in the tent and guest houses, seats at
    the picnic/kiosk, the wake screen with four sleepers, the hero fan in the HUD, a save migration
    (old saves: Давид comes to the door the next morning), his speaker in `tools/voice/speakers.json`,
    lines `go_david`, `david_hi`, `david_bolt`, `david_yay`, model `src/assets/parts/david.ts` + face.
  - **Own weapon per hero** — no such verb: all heroes share the bow (`fireArrow`, `HERO_STATS`).
    Engine verb: `weapon` on `HeroCard`, one per hero, same button, same strength in total
    (no hero is weaker); the lightning stays shared. Helpers fight with their own weapon too.
    Proposed set (waiting for the owner):
    - Льоша — лук (as now, his own colours);
    - Соломія — чарівна паличка: pink star-sparks that turn a little towards the monster;
    - Пупся — клубочок: a yarn ball thrown like a boomerang, hits all on the way there and back;
    - Давид — іграшковий меч: a swing close by that hits all around and pushes them back; near the
      boss the swing sends a short wave, so he can hit its mouth too.
    Also touched: the bow tile shows the current hero's weapon (new HUD sprites), the guide's
    «shoot» card per hero, armour rules (`bolt`/`lantern`) apply to every weapon alike.
- ids: david (hero), weapons arrow/star/paw/axe, lines go_david david_hi david_bolt david_yay
- built (2026-10-30, the owner's answers): Давид playable, in the house with everyone; everyone shoots far
  and the same — Льоша bow, Соломія star wand, Пупся cat magic (purr-balls with a paw print), Давид throwing
  axes with his sword always in hand; the lightning only by its button (helpers never cast it); a bigger
  house (13×9): bunk bed, kitchen with a table for four (a meal = full hearts + fast running), treasure
  shelf for artifacts, aquarium; old saves get the new house.
