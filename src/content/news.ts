/**
 * The monster news on the grandmothers' TV (DESIGN.md «Бабуся»): what the save keeps. The rules and
 * the news themselves come with the TV (systems/tvNews.ts).
 */
export interface NewsSave {
  /** The news already shown, oldest first (a news item comes round again once all are told). */
  told: string[];
}

export const freshNews = (): NewsSave => ({ told: [] });
