import { newsItems, type Db } from "@trendbridge/db";
import { loadEntityIndex, matchEntity } from "./entities";
import type { RssItem } from "./rss";

export interface NewsRecord extends RssItem {
  feed: string;
}

/** Stores headline, publisher, date and URL only. Links each item to a tracked trend when its keywords appear. */
export async function persistNews(
  db: Db,
  sourceId: number,
  confidence: number,
  items: NewsRecord[],
) {
  const index = await loadEntityIndex(db);
  for (const n of items) {
    const trendId = matchEntity(index, n.title);
    await db
      .insert(newsItems)
      .values({
        trendId,
        headline: n.title.slice(0, 500),
        publisher: n.source ?? n.feed,
        publishedAt: n.publishedAt ? new Date(n.publishedAt) : null,
        url: n.link,
        summaryMethod: "none",
        sourceId,
        confidence,
      })
      .onConflictDoUpdate({ target: newsItems.url, set: { trendId, fetchedAt: new Date() } });
  }
}
