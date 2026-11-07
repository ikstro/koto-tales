/**
 * The quick real-start check before publishing (the owner's call, 2026-10-29): the built game,
 * served like the site, opened WITHOUT autostart — the title's ▶, then a touch on a sleeping hero,
 * then playing. Page errors fail it (exit code 1). A few minutes, headless.
 *
 *   npm run build && npm run realstart            (serves dist at /koto-tales/ itself)
 *   npm run realstart -- --url http://localhost:4173/koto-tales/
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { findShell } from '../lib/shell.mjs';

const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const W = 1280;
const H = 800;
let server = null;
let base = opt('url');
if (!base) {
  server = spawn('npx vite preview --base /koto-tales/ --port 4190 --strictPort', {
    shell: true,
    stdio: 'ignore',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  base = 'http://localhost:4190/koto-tales/';
  await new Promise((r) => setTimeout(r, 2500));
}

const browser = await chromium.launch({
  executablePath: findShell(),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const until = (f, s = 300) => page.waitForFunction(f, null, { timeout: s * 1000, polling: 250 });

let ok = false;
try {
  const sep = base.includes('?') ? '&' : '?';
  await page.goto(`${base}${sep}fresh=1&mute=1`);
  await page.waitForSelector('.title-play', { state: 'visible', timeout: 300000 });
  console.log('title up');
  await page.waitForTimeout(1500);
  await page.click('.title-play', { force: true });
  await until(() => window.__koto?.wake && !window.__koto.wake.title);
  console.log('bedroom up');
  await page.waitForTimeout(3000);
  outer: for (let y = Math.round(H * 0.3); y < H * 0.95; y += 40)
    for (let x = Math.round(W * 0.12); x < W * 0.95; x += 50) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
      if (await page.evaluate(() => window.__koto.wake?.hero)) break outer;
    }
  await until(() => window.__koto.state.playing);
  console.log('playing:', await page.evaluate(() => window.__koto.wake?.hero));
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'design-lab/shots/realstart.png' }).catch(() => {});
  ok = true;
} catch (e) {
  console.error('FAIL', e.message);
}
const bad = errors.filter((e) => !/favicon|404/.test(e));
if (bad.length) {
  console.error(`${bad.length} page error(s):`);
  for (const e of bad.slice(0, 10)) console.error('  ' + e.slice(0, 300));
}
await browser.close();
if (server) server.kill();
console.log(ok && !bad.length ? 'real start: ok' : 'real start: FAILED');
process.exit(ok && !bad.length ? 0 : 1);
