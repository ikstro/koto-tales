/**
 * Asks for fullscreen and landscape where the browser allows it (Android Chrome
 * does). Call from a user gesture: the title's ▶ or, when the title is skipped,
 * the touch that wakes a hero.
 */
export async function goFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    // Desktop browsers and iOS refuse; the game works the same in a window.
  }
}
