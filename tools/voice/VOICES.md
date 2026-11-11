# Voices: engines, sources, licences

The owner's calls of 2026-11-10, after blind listening (Azure with our IPA hints stressed wrong in 13–15 of 20 lines,
plain Azure in 6, HolosTTS in none; Azure's voice was liked more):

| Speakers | Engine | Voice | Source and licence |
|---|---|---|---|
| narrator, pupsia | Azure Speech (Microsoft) | uk-UA-OstapNeural, uk-UA-PolinaNeural | Azure terms; plain text, hints only from `stress.json` `azure` |
| david, olia | HolosTTS (patriotyk/HolosTTS, MIT) | `studio_tetiana` | speech-uk/opentts-tetiana, Apache-2.0 — the author is named in «Зміст гри» |
| lyosha, babusia, elf, elf_kid, alien_kid, elf_queen | HolosTTS | `cv_f_34013156` | Mozilla Common Voice uk (CC0), an adult volunteer |
| gnome, robot, alien, monster, rulers, sirko, anchor, chess_king | HolosTTS | `cv_m_b016b748` | Mozilla Common Voice uk (CC0), an adult volunteer |
| solomiia | HolosTTS | `own_f_calm` | the owner's family, recorded for the game with consent |

- HolosTTS's own preset voices are not used: its author took them without their owners' consent.
- No voice is made from Azure's output (Microsoft's terms forbid it), and no child's recording is used.
- A voice is a vector of 256 numbers in `design-lab/voices/voices.npz`, kept **outside git**: with it anyone could make
  the voice say anything. Only the finished lines (`public/voice/*.mp3`) are published. The recordings and the scripts
  that made the vectors are in `design-lab/voice-bakeoff/` (also outside git; `SAVEPOINT-holos.md` there).
- Each HolosTTS speaker is moved to `hz` (the pitch its Azure voice had) with one factor for all its lines, and set to
  `rate`; loudness −21 LUFS, like the Azure lines (`holos.py`).

## Fixing a wrongly stressed word
- A HolosTTS speaker: the word goes into `stress.json` `words` (or `lines` for one line), then `npm run voice`.
- Narrator or Пупся: `stress.json` `azure`: `"<line id>": ["сло́во"]`, then `npm run voice` (only that line is re-voiced).
  The hint is IPA with the stress mark right before the vowel (`toIpa(..., { beforeVowel: true })`), the only way Azure
  obeyed in the owner's test.
- A trial without touching the game: `node tools/voice/gen.mjs --only id1,id2 --out design-lab/tmp`.
