import { describe, expect, it } from 'vitest';
import speakers from '../../tools/voice/speakers.json';
import { LINES, type LineId } from './lines';
import { MONSTER_ORDER } from './monsters';
import { COMMENTS, freshNews, metSubjects, NEWS_LINES, newsComment, newsPool, newsSubject, nextNews, tellNews, type NewsWorld } from './news';

const world = (o: Partial<NewsWorld> = {}): NewsWorld => ({
  found: [],
  said: [],
  boss: { kind: 'eater', levels: { eater: 1, nessie: 1 }, defeatedDay: null },
  news: freshNews(),
  ...o,
});

/** Shows `n` items in a row, as the TV does, and returns their ids. */
function show(w: NewsWorld, n: number): LineId[] {
  const out: LineId[] = [];
  for (let i = 0; i < n; i++) {
    const id = nextNews(w);
    out.push(id);
    w.news = tellNews(w, id);
  }
  return out;
}

describe('the monster news on the TV', () => {
  it('has every line, read by the anchor, and the anchor is a voice', () => {
    for (const id of NEWS_LINES) expect(LINES[id]?.speaker, id).toBe('anchor');
    const anchor = (speakers as Record<string, { engine: string; voice: string }>).anchor;
    expect(['azure', 'holos']).toContain(anchor.engine);
    expect(anchor.voice).toBeTruthy();
    expect(LINES[COMMENTS.pupsia[0]].speaker).toBe('pupsia');
    expect(LINES[COMMENTS.yulia[0]].speaker).toBe('babusia');
    expect(LINES[COMMENTS.olia[0]].speaker).toBe('olia');
  });

  it('two items for every monster card and both giants', () => {
    for (const k of [...MONSTER_ORDER, 'eater', 'nessie']) {
      expect(NEWS_LINES).toContain(`news_${k}_1`);
      expect(NEWS_LINES).toContain(`news_${k}_2`);
    }
  });

  it('knows whom the party has met: the album, and the giants by their card or a win', () => {
    expect(metSubjects(world())).toEqual([]);
    expect(metSubjects(world({ found: ['m:spider', 'm:zombie', 'i:apple'] }))).toEqual(['zombie', 'spider']);
    expect(metSubjects(world({ said: ['guide_nessie'] }))).toEqual(['nessie']);
    expect(metSubjects(world({ boss: { kind: 'eater', levels: { eater: 1, nessie: 1 }, defeatedDay: 4 } }))).toEqual(['eater']);
    expect(metSubjects(world({ boss: { kind: 'nessie', levels: { eater: 2, nessie: 2 }, defeatedDay: null } }))).toEqual(['eater']);
  });

  it('nobody met: the gentle items, in turn', () => {
    const w = world();
    expect(show(w, 4)).toEqual(['news_weather', 'news_house', 'news_weather', 'news_house']);
  });

  it('subjects take turns, first items before second ones, every item once a round', () => {
    const w = world({ found: ['m:zombie', 'm:skeleton'] });
    expect(show(w, 4)).toEqual(['news_zombie_1', 'news_skeleton_1', 'news_zombie_2', 'news_skeleton_2']);
    // a new round, never the one just told first
    expect(show(w, 4)).toEqual(['news_zombie_1', 'news_skeleton_1', 'news_zombie_2', 'news_skeleton_2']);
  });

  it('never the same item twice in a row, even when a round ends', () => {
    const w = world({ found: ['m:zombie'] });
    const seen = show(w, 9);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('a monster met mid-round gets its turn in the same round', () => {
    const w = world({ found: ['m:zombie'] });
    show(w, 1);
    w.found = ['m:zombie', 'm:sirenhead'];
    expect(show(w, 3)).toEqual(['news_sirenhead_1', 'news_zombie_2', 'news_sirenhead_2']);
  });

  it('an old save with told items no longer in the pool still moves on', () => {
    const w = world({ found: ['m:zombie'], news: { told: ['news_weather', 'news_house'], shown: 2, last: 'news_house' } });
    expect(show(w, 2)).toEqual(['news_zombie_1', 'news_zombie_2']);
  });

  it('counts what was shown', () => {
    const w = world();
    show(w, 3);
    expect(w.news.shown).toBe(3);
  });

  it('a comment after every second item: Пупся and the hostess by turns', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => newsComment(n, 'yulia'))).toEqual([
      null,
      'news_pupsia_1',
      null,
      'news_babusia_1',
      null,
      'news_pupsia_2',
      null,
      'news_babusia_1',
    ]);
    expect(newsComment(4, 'olia')).toBe('news_olia_1');
    // no hostess at home: only Пупся
    expect([2, 4, 6].map((n) => newsComment(n, null))).toEqual(['news_pupsia_1', 'news_pupsia_1', 'news_pupsia_2']);
    expect(newsComment(0, 'yulia')).toBeNull();
  });

  it('names the picture for each line', () => {
    expect(newsSubject('news_zombie_2')).toBe('zombie');
    expect(newsSubject('news_eater_1')).toBe('eater');
    expect(newsSubject('news_weather')).toBe('weather');
    expect(newsPool(world({ found: ['m:giftbox'] }))).toEqual(['news_giftbox_1', 'news_giftbox_2']);
  });
});
