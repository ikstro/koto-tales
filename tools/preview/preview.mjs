/**
 * npm run preview -- <monster|companion|building|item|artifact> <id>
 *
 * A picture of one new thing for the owner and Льоша to look at before it goes in: rendered by
 * tools/preview/preview.html in Playwright's headless shell (the game's own models and skin), saved
 * to design-lab/new/<id>.png (git-excluded). Needs `npx playwright install chromium-headless-shell`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { findShell } from '../lib/shell.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [kind, id] = process.argv.slice(2);
if (!kind || !id) {
  console.error('usage: npm run preview -- <monster|companion|building|item|artifact> <id>');
  process.exit(1);
}
const outDir = path.join(root, 'design-lab/new');
const out = path.join(outDir, `${id}.png`);

const server = await createServer({ root, configFile: false, logLevel: 'error', optimizeDeps: { entries: ['tools/preview/preview.html'] }, server: { port: 5292, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ executablePath: findShell(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.resolvedUrls.local[0]}tools/preview/preview.html?kind=${kind}&id=${id}`);
  await page.waitForFunction(() => document.title === 'done' || false, null, { timeout: 60000 }).catch(() => undefined);
  if (errors.length) throw new Error(`preview page: ${errors.join('; ')}`);
  fs.mkdirSync(outDir, { recursive: true });
  await page.locator('canvas').screenshot({ path: out });
  console.log(path.relative(root, out));
} finally {
  await browser.close();
  await server.close();
}
