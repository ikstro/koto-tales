/**
 * npm run perf -- [--url https://ikstro.com/koto-tales/] [--tier 1] [--size 800x500]
 *
 * Plays a fixed route headless and reports what a player would feel as freezes:
 *   the real start (the title's ▶, then touching a sleeping hero), a walk, every village,
 *   the village portal home, the big map.
 * Per step: frames drawn, frames slower than 4× the median (freezes), the worst frame,
 * shader programs linked (after the start there should be none: everything is prepared
 * while the title is up) and which ones. Page errors fail the run (exit code 1).
 *
 * Headless WebGL is SwiftShader (the CPU draws), so frames are slow and only the
 * relative numbers mean anything: compare runs before and after a change.
 * Without --url it starts its own Vite server (no hot reload, so edits do not restart
 * the page). Needs `npx playwright install chromium-headless-shell` once.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tier = arg('tier', '1');
const [W, H] = arg('size', '800x500').split('x').map(Number);

function findShell() {
  const base = path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'ms-playwright');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const exe = path.join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (d.startsWith('chromium_headless_shell') && fs.existsSync(exe)) return exe;
  }
  throw new Error('headless shell not found: run `npx playwright install chromium-headless-shell`');
}

let server = null;
let base = arg('url', null);
if (!base) {
  const { createServer } = await import('vite');
  server = await createServer({ root, logLevel: 'error', server: { port: 5292, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0];
}

const browser = await chromium.launch({ executablePath: findShell(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Every drawn frame's gap and every shader program linked, counted from the first script.
await page.addInitScript(() => {
  const w = window;
  w.__perf = { links: 0, gaps: [] };
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const link = P.linkProgram;
    P.linkProgram = function (p) {
      w.__perf.links++;
      return link.call(this, p);
    };
  }
  let last = 0;
  const frame = (t) => {
    if (last) w.__perf.gaps.push(t - last);
    last = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

const ev = (f, a) => page.evaluate(f, a);
const until = (f, a, s = 400) => page.waitForFunction(f, a, { timeout: s * 1000, polling: 250 });
/** Waits `s` seconds of game time (headless draws a few frames a second). */
const gameTime = async (s) => {
  const c = await ev(() => window.__kotoVillages.clock);
  await until((c) => window.__kotoVillages.clock > c, c + s);
};
const steps = [];
const shaders = () => ev(() => window.__koto?.shaders?.() ?? []);
async function step(name, run) {
  await ev(() => {
    window.__perf.gaps = [];
    window.__perf.links0 = window.__perf.links;
  });
  const before = await shaders();
  const t0 = Date.now();
  await run();
  const r = await ev(() => ({ gaps: window.__perf.gaps, links: window.__perf.links - window.__perf.links0 }));
  const fresh = (await shaders()).filter((k) => {
    const i = before.indexOf(k);
    if (i < 0) return true;
    before.splice(i, 1);
    return false;
  });
  steps.push({ name, gaps: r.gaps, links: r.links, fresh, s: (Date.now() - t0) / 1000 });
  process.stdout.write('.');
}

const sep = base.includes('?') ? '&' : '?';
await page.goto(`${base}${sep}fresh=1&mute=1&tier=${tier}`);
await step('start: title ▶, wake a hero', async () => {
  await page.waitForSelector('.title-play', { state: 'visible', timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.click('.title-play', { force: true });
  await until(() => window.__koto?.wake && !window.__koto.wake.title, null, 300);
  await page.waitForTimeout(3000);
  outer: for (let y = Math.round(H * 0.3); y < H * 0.95; y += 40)
    for (let x = Math.round(W * 0.12); x < W * 0.95; x += 50) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
      if (await ev(() => window.__koto.wake?.hero)) break outer;
    }
  await until(() => window.__koto.state.playing, null, 300);
  await gameTime(3);
});
// the portal reward, so the village portal can take the party home later
await ev(() => window.__kotoProgress.finish());
await step('walk', async () => {
  await page.keyboard.down('KeyW');
  await gameTime(6);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await gameTime(6);
  await page.keyboard.up('KeyD');
});
for (const race of ['elves', 'gnomes', 'robots', 'aliens']) {
  await step(`village: ${race}`, async () => {
    await ev((r) => window.__kotoVillages.go(r), race);
    await gameTime(5);
  });
}
await step('village portal home', async () => {
  // stand three blocks in front of the aliens' portal (village-local (-7, 10), it faces the camera: +z) and walk in
  const v = await ev(() => window.__kotoVillages.sites().find((s) => s.race === 'aliens'));
  const c = Math.round(Math.cos((v.side * Math.PI) / 2));
  const s = Math.round(Math.sin((v.side * Math.PI) / 2));
  const [cx, cz] = [v.x + 0.5, v.z + 0.5];
  const portal = [cx - 7 * c + 10 * s, cz + 7 * s + 10 * c];
  // `go` sets the hero one block further +z than the spot asked
  const [dx, dz] = [portal[0] - cx, portal[1] + 2 - cz];
  await ev(([lx, lz]) => window.__kotoVillages.go('aliens', lx, lz), [dx * c - dz * s, dx * s + dz * c]);
  await gameTime(1);
  await page.keyboard.down('KeyW');
  await until(() => Math.hypot(window.__koto.state.pos[0], window.__koto.state.pos[2]) < 40, null, 300);
  await page.keyboard.up('KeyW');
  await gameTime(4);
});
await step('big map', async () => {
  await ev(() => window.__kotoMap.open());
  await page.waitForTimeout(4000);
});
const perf = await ev(() => window.__koto.perf);
await browser.close();
await server?.close();

const all = steps.flatMap((s) => s.gaps).sort((a, b) => a - b);
const median = all[all.length >> 1] ?? 16;
const freezeAt = Math.max(250, median * 4);
console.log(`\n${base}  tier ${tier}  ${W}×${H}  median frame ${Math.round(median)} ms  freeze > ${Math.round(freezeAt)} ms`);
console.log('step'.padEnd(30), 'frames'.padStart(7), 'freezes'.padStart(8), 'worst ms'.padStart(9), 'shaders'.padStart(8));
let freezes = 0;
let linked = 0;
for (const s of steps) {
  const f = s.gaps.filter((g) => g > freezeAt).length;
  const worst = Math.round(Math.max(0, ...s.gaps));
  if (!s.name.startsWith('start')) {
    freezes += f;
    linked += s.links;
  }
  console.log(s.name.padEnd(30), String(s.gaps.length).padStart(7), String(f).padStart(8), String(worst).padStart(9), String(s.links).padStart(8));
}
console.log(`after the start: ${freezes} freezes, ${linked} new shaders; game: ${perf.programs} programs, level ${perf.level}`);
for (const s of steps.slice(1)) if (s.fresh.length) console.log(`  new in «${s.name}»:\n    ${s.fresh.join('\n    ')}`);
if (errors.length) {
  console.log(`page errors:\n  ${[...new Set(errors)].slice(0, 5).join('\n  ')}`);
  process.exit(1);
}
