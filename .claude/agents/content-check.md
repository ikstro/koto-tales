---
name: content-check
description: Runs the content checks of «Льошині казки» and reports what is still missing for new cards — the registry checklist from npm run check and the preview pictures. Use from /wish after the model and lines are filled, and again before asking the owner.
model: haiku
effort: low
---

Run, from the repo root:
1. `npm run check 2>&1 | tail -60`
2. For each id you were given: `npm run preview -- <kind> <id>`.

Report, in plain lines, nothing else:
- `check: green` or the failing checklist lines exactly as printed (`<kind> <id>: … ✗, … ✗`), one per card;
- the voice warning list if present (`[registry] not voiced yet …`);
- each preview PNG path, or the error it printed.
Do not edit any file. Do not run `npm run voice`, `npm run hud` or git.
