import { describe, expect, it } from 'vitest';
import { SPRITES } from '../ui/hudSprites';
import { LINES } from './lines';
import { LATEST_RELEASE, RELEASES, latestReleases, unseenThings } from './whatsNew';

describe('«Що нового»', () => {
  it('releases count up from 1, the latest adds wind hunting', () => {
    expect(RELEASES.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(LATEST_RELEASE).toBe(6);
  });

  it('a save sees every release after its own', () => {
    expect(unseenThings(0).length).toBe(17);
    expect(unseenThings(0)[0].id).toBe('flight');
    expect(unseenThings(1).map((t) => t.id)).toEqual(['bighouse', 'slide', 'chess', 'easel', 'hometv', 'chess_kingdom', 'tornadoes', 'tornado_map', 'tornado_hunt']);
    expect(unseenThings(2).map((t) => t.id)).toEqual(['chess_kingdom', 'tornadoes', 'tornado_map', 'tornado_hunt']);
    expect(unseenThings(3).map((t) => t.id)).toEqual(['tornadoes','tornado_map', 'tornado_hunt']);
    expect(unseenThings(4).map((t) => t.id)).toEqual(['tornado_map', 'tornado_hunt']);
    expect(unseenThings(5).map((t) => t.id)).toEqual(['tornado_hunt']);
    expect(unseenThings(LATEST_RELEASE)).toEqual([]);
  });

  it('the newest release comes first in «Зміст гри»', () => {
    expect(latestReleases(2).map((r) => r.id)).toEqual([6, 5]);
    expect(latestReleases(1).map((r) => r.id)).toEqual([6]);
  });

  it('every thing has a picture, Пупся’s line and a sentence for the parents', () => {
    const ids = new Set<string>();
    for (const t of unseenThings(0)) {
      expect(ids.has(t.id), t.id).toBe(false);
      ids.add(t.id);
      expect(t.pic in SPRITES, t.pic).toBe(true);
      expect(LINES[t.line]?.speaker, t.line).toBe('pupsia');
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.about.length).toBeGreaterThan(20);
    }
    for (const id of ['new_hello', 'new_reminder'] as const) expect(LINES[id].speaker).toBe('pupsia');
    expect('gift' in SPRITES).toBe(true);
  });
});
