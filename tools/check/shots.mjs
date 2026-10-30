/**
 * npm run shots -- [--url http://localhost:5190] [--out design-lab/shots] [--skins pixel,toy,hybrid]
 *
 * Screenshots of the running game at tablet size (1280×800) for every skin
 * and a few fixed scenes, plus an index.html contact sheet to compare them.
 * Needs a dev server (`npm run dev`) and Playwright's headless shell
 * (`npx playwright install chromium-headless-shell` once).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findShell } from '../lib/shell.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const url = arg('url', 'http://localhost:5190');
const out = path.resolve(arg('out', 'design-lab/shots'));
const skins = arg('skins', 'pixel,toy,hybrid').split(',');

/** The same moments for every skin. Positions are near the house of seed 20261128. */
const SCENES = [
  { id: 'start', label: 'Заставка', q: 'time=0.3&demo=1' },
  { id: 'home', label: 'Біля дому, день', q: 'autostart=1&hero=lyosha&time=0.3&freeze=1&x=6&z=14&demo=1' },
  { id: 'meadow', label: 'Луг і ліс', q: 'autostart=1&hero=solomiia&time=0.25&freeze=1&x=-30&z=20' },
  { id: 'evening', label: 'Вечір', q: 'autostart=1&hero=pupsia&time=0.66&freeze=1&x=6&z=14&demo=1' },
];


const shell = findShell();
fs.mkdirSync(out, { recursive: true });
const rows = [];
for (const scene of SCENES) {
  const cells = [];
  for (const skin of skins) {
    const file = `${scene.id}-${skin}.png`;
    const target = `${url}/?skin=${skin}&fresh=1&${scene.q}`;
    execFileSync(
      shell,
      [`--screenshot=${path.join(out, file)}`, '--window-size=1280,800', '--hide-scrollbars', '--mute-audio', '--virtual-time-budget=15000', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', target],
      { stdio: 'ignore' },
    );
    console.log(`ok  ${file}`);
    cells.push(`<figure><img src="${file}" loading="lazy"><figcaption>${skin}</figcaption></figure>`);
  }
  rows.push(`<section><h2>${scene.label}</h2><div class="row">${cells.join('')}</div></section>`);
}

fs.writeFileSync(
  path.join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Кото-казки · кадри стилю</title>
<style>body{margin:0;padding:24px;font:16px system-ui;background:#f4f1ea;color:#1f2a37}h1{margin:0 0 16px}h2{margin:28px 0 10px}
.row{display:grid;grid-template-columns:repeat(${skins.length},1fr);gap:14px}figure{margin:0}img{width:100%;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.15)}
figcaption{text-align:center;font-weight:700;margin-top:6px;text-transform:uppercase;letter-spacing:1px}</style>
<h1>Кото-казки · кадри стилю</h1>${rows.join('\n')}`,
);
console.log(`\ncontact sheet: ${path.join(out, 'index.html')}`);
