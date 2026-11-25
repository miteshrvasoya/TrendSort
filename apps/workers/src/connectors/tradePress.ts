import { persistNews, type NewsRecord } from "../lib/news";
import { parseRss } from "../lib/rss";
import { sourceIdOf } from "../lib/source";
import type { Connector } from "../framework/types";
import fixture from "../fixtures/trade-press.json";

interface Raw {
  feed: string;
  items: NewsRecord[];
}

export const FEEDS = [
  { name: "Inc42", url: "https://inc42.com/feed/" },
  { name: "YourStory", url: "https://yourstory.com/feed" },
  { name: "Entrackr", url: "https://entrackr.com/feed" },
  { name: "ET Retail", url: "https://retail.economictimes.indiatimes.com/rss/topstories" },
  { name: "Retail Dive", url: "https://www.retaildive.com/feeds/news/" },
];

/** Indian D2C + global retail trade press RSS. A feed that fails is skipped; the run only fails if all feeds fail. */
export const tradePress: Connector<Raw, NewsRecord> = {
  key: "trade_press_rss",
  name: "Trade press & Indian D2C RSS",
  rateLimit: { calls: 200, windowMs: 86_400_000 },
  costPerCall: 0,
  reliabilityScore: 0.7,
  scraped: false,
  termsNote: "Headline + link only; link back to publisher.",

  async fetch(ctx) {
    if (ctx.fixtureMode) return fixture as Raw[];
    const out: Raw[] = [];
    const errors: string[] = [];
    for (const f of FEEDS) {
      try {
        const xml = await (await ctx.http.get(f.url, { skipRobots: true })).text();
        out.push({
          feed: f.name,
          items: parseRss(xml)
            .slice(0, 30)
            .map((i) => ({ ...i, source: i.source ?? f.name, feed: f.name })),
        });
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : e}`);
        ctx.log.warn({ feed: f.name }, "feed failed");
      }
    }
    if (out.length === 0) throw new Error(`all feeds failed: ${errors.join("; ")}`);
    return out;
  },

  normalize: (raw) => raw.flatMap((r) => r.items),
  async persist(ctx, norm) {
    await persistNews(ctx.db, await sourceIdOf(ctx.db, "trade_press_rss"), 0.7, norm);
  },
  async healthCheck(ctx) {
    try {
      const r = await ctx.http.get(FEEDS[0]!.url, { skipRobots: true });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  },
};
