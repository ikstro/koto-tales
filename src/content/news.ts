/**
 * The monster news on the grandmothers' TV (DESIGN.md «Бабуся»): a tap on the set and a bright
 * anchor reads one funny item about a monster or a giant the party has met, the monster's portrait
 * on the screen. The rules are pure (tested in news.test.ts); systems/tvNews.ts runs the set.
 * - Two items per subject; nobody met yet: a gentle item about the weather or the flying house.
 * - In turn: subjects take turns (every first item before any second one), never the same item
 *   twice in a row, and every item once before any comes again (`told`).
 * - Now and then, after the item, Пупся or the hostess at home says one short line.
 */
import type { LineId } from './lines';
import { MONSTER_ORDER, type MonsterKind } from './monsters';

export interface NewsSave {
  /** The news already shown this round, oldest first (a news item comes round again once all are told). */
  told: string[];
  /** How many news items were shown, ever (the comment's turn). */
  shown: number;
  /** The item shown last (never the same twice in a row, across rounds). */
  last: string | null;
}

export const freshNews = (): NewsSave => ({ told: [], shown: 0, last: null });

/** The giants (systems/bossLogic.ts `BossKind`). */
export type Giant = 'eater' | 'nessie';
export type NewsSubject = MonsterKind | Giant;
/** The gentle items when nobody is met yet. */
export type Fallback = 'weather' | 'house';

/** Items per subject. */
export const PER_SUBJECT = 2;
export const GIANTS: readonly Giant[] = ['eater', 'nessie'];
export const FALLBACK: readonly Fallback[] = ['weather', 'house'];

/** What the save must tell for the news (a slice of SaveData). */
export interface NewsWorld {
  /** Album keys: `m:<kind>` once a monster is met. */
  found: readonly string[];
  /** Said once: `guide_boss` / `guide_nessie` when a giant's card popped up on the first visit. */
  said: readonly string[];
  boss: { kind: Giant; levels: Record<Giant, number>; defeatedDay: number | null };
  news: NewsSave;
}

/** The line of a subject's n-th item (1-based). */
export const newsLine = (subject: NewsSubject, n: number): LineId => `news_${subject}_${n}` as LineId;
export const fallbackLine = (f: Fallback): LineId => `news_${f}` as LineId;

/** Whose picture goes on the screen for a news line. */
export function newsSubject(id: string): NewsSubject | Fallback {
  return id.replace(/^news_/, '').replace(/_\d+$/, '') as NewsSubject | Fallback;
}

/** Every news line, for the content check. */
export const NEWS_LINES: LineId[] = [
  ...[...MONSTER_ORDER, ...GIANTS].flatMap((s) => Array.from({ length: PER_SUBJECT }, (_, i) => newsLine(s, i + 1))),
  ...FALLBACK.map(fallbackLine),
];

/** Whether a giant has been met: its card popped up on the first visit, it came back after a win, or it was beaten. */
export function giantMet(w: Pick<NewsWorld, 'said' | 'boss'>, g: Giant): boolean {
  if (w.said.includes(g === 'eater' ? 'guide_boss' : 'guide_nessie')) return true;
  if (w.boss.kind === g && w.boss.defeatedDay !== null) return true;
  // the land-eater's level starts at 1 when it first comes; the lake monster's at 1 unseen (content/contents.ts)
  return g === 'eater' ? w.boss.levels.eater > 1 : w.boss.levels.nessie > 2;
}

/** The monsters (in the album's order) and giants the party has met. */
export function metSubjects(w: Pick<NewsWorld, 'found' | 'said' | 'boss'>): NewsSubject[] {
  const out: NewsSubject[] = MONSTER_ORDER.filter((k) => w.found.includes(`m:${k}`));
  for (const g of GIANTS) if (giantMet(w, g)) out.push(g);
  return out;
}

/** Every item that can be told now, in turn: each subject's first item, then each one's second. */
export function newsPool(w: Pick<NewsWorld, 'found' | 'said' | 'boss'>): LineId[] {
  const met = metSubjects(w);
  if (!met.length) return FALLBACK.map(fallbackLine);
  const out: LineId[] = [];
  for (let n = 1; n <= PER_SUBJECT; n++) for (const s of met) out.push(newsLine(s, n));
  return out;
}

/** The next item: the first in turn not told this round and not the one just shown; all told: a new round. */
export function nextNews(w: Pick<NewsWorld, 'found' | 'said' | 'boss' | 'news'>): LineId {
  const pool = newsPool(w);
  const { last } = w.news;
  const untold = pool.filter((id) => !w.news.told.includes(id));
  const round = untold.length ? untold : pool;
  return round.find((id) => id !== last) ?? round[0];
}

/** The save after `id` was shown: once every item of the pool is told, the round starts over. */
export function tellNews(w: Pick<NewsWorld, 'found' | 'said' | 'boss' | 'news'>, id: LineId): NewsSave {
  const pool = newsPool(w);
  const told = [...w.news.told.filter((t) => t !== id), id];
  const roundDone = pool.every((p) => told.includes(p));
  return { told: roundDone ? [] : told, shown: w.news.shown + 1, last: id };
}

/** Who may comment: Пупся always, the hostess at home if there is one (her own lines). */
export const COMMENTS = {
  pupsia: ['news_pupsia_1', 'news_pupsia_2'],
  yulia: ['news_babusia_1'],
  olia: ['news_olia_1'],
} as const satisfies Record<string, readonly LineId[]>;

/**
 * The comment after the `shown`-th item (1-based, as in the save after `tellNews`): after every
 * second item; by turns Пупся and the hostess (Пупся when no hostess is at home); her lines in turn.
 */
export function newsComment(shown: number, host: 'yulia' | 'olia' | null): LineId | null {
  if (shown <= 0 || shown % 2 !== 0) return null;
  const turn = shown / 2;
  const own = host && turn % 2 === 0 ? COMMENTS[host] : COMMENTS.pupsia;
  return own[Math.floor((turn - 1) / 2) % own.length];
}
