/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from 'virtual:pwa-register';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let waiting = false;
let onTitle = true;

/**
 * Registers the service worker (offline cache). A new version is downloaded
 * in the background and only switched to at a break — on the title, at the
 * exit door, or on coming back after a long absence — so a child is never
 * thrown out of the game by an update.
 */
export function registerPWA(): void {
  try {
    applyUpdate = registerSW({
      onNeedRefresh() {
        waiting = true;
        // Finished downloading while the title is still up: nothing to lose yet.
        if (onTitle) void applyUpdate?.(true);
      },
      onRegisteredSW(_url, r) {
        registration = r;
      },
    });
  } catch {
    // Service workers unavailable (e.g. insecure origin): the game still runs online.
  }
}

/** The child woke a hero: from here on a waiting version waits for a break. */
export function leftTitle(): void {
  onTitle = false;
}

/** Reloads into the new version if one is waiting. */
export function applyWaitingUpdate(): boolean {
  if (!waiting || !applyUpdate) return false;
  void applyUpdate(true);
  return true;
}

/** Asks the server for a new version (an installed game may stay open for days). */
export async function checkForUpdate(): Promise<void> {
  try {
    await registration?.update();
  } catch {
    // offline: try again next time
  }
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
