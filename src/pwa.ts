/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from 'virtual:pwa-register';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let waiting = false;

/**
 * Registers the service worker (offline cache). A new version is downloaded
 * in the background and only switched to from the start screen, so a child
 * is never thrown out of the game by an update.
 */
export function registerPWA(): void {
  try {
    applyUpdate = registerSW({
      onNeedRefresh() {
        waiting = true;
      },
    });
  } catch {
    // Service workers unavailable (e.g. insecure origin): the game still runs online.
  }
}

/** Called on the start screen: reloads into the new version if one is waiting. */
export function applyWaitingUpdate(): boolean {
  if (!waiting || !applyUpdate) return false;
  void applyUpdate(true);
  return true;
}

const BOOT_KEY = 'koto-tales-boot';

/**
 * Two failed starts in a row (a broken build cached for offline) → drop the
 * service worker and its caches and load fresh from the network.
 * Call `bootStarted` first thing and `bootSucceeded` after the first frame.
 */
export async function bootStarted(): Promise<void> {
  let fails = 0;
  try {
    fails = Number(localStorage.getItem(BOOT_KEY) ?? 0);
    localStorage.setItem(BOOT_KEY, String(fails + 1));
  } catch {
    return;
  }
  if (fails < 2) return;
  try {
    localStorage.setItem(BOOT_KEY, '0');
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await globalThis.caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}

export function bootSucceeded(): void {
  try {
    localStorage.setItem(BOOT_KEY, '0');
  } catch {
    // nothing to do
  }
}
