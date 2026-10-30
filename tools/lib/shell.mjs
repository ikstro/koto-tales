import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Playwright's headless shell wherever it was installed (Windows, macOS, Linux, a cloud image). */
export function findShell() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  ].filter(Boolean);
  const exes = [
    ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
    ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
    ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
    ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
  ];
  for (const base of bases) {
    for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
      if (!d.startsWith('chromium_headless_shell')) continue;
      for (const [dir, exe] of exes) if (fs.existsSync(path.join(base, d, dir, exe))) return path.join(base, d, dir, exe);
    }
  }
  throw new Error('headless shell not found: run `npx playwright install chromium-headless-shell`');
}
