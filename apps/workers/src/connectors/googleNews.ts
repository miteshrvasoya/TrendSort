import { activeKeywords, DEFAULT_QUERIES } from "../lib/keywords";
import { persistNews, type NewsRecord } from "../lib/news";
import { parseRss } from "../lib/rss";
import { sourceIdOf } from "../lib/source";
import type { Connector } from "../framework/types";
import fixture from "../fixtures/google-news.json";

interface Raw {
  query: string;
  geo: "US" | "IN";
  items: NewsRecord[];
}

const GEOS = {
  US: { hl: "en-US", gl: "US", ceid: "US:en" },
  IN: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
} as const;
const MAX_QUERIES = 10;

/** Google News RSS: headline, publisher, date, URL only. RSS feeds are published for machine reading, so robots.txt is not applied. */
export const googleNews: Connector<Raw, NewsRecord> = {
  key: "google_news_rss",
  name: "Google News RSS",
  rateLimit: { calls: 300, windowMs: 86_400_000 },
  costPerCall: 0,
  reliabilityScore: 0.6,
  scraped: false,
  termsNote: "Store headline, source, date, URL only; link back.",

  async fetch(ctx) {
    if (ctx.fixtureMode) return fixture as Raw[];
    const kws = await activeKeywords(ctx.db, MAX_QUERIES);
    const queries = kws.length ? kws.map((k) => k.term) : DEFAULT_QUERIES;
    const out: Raw[] = [];
    for (const q of queries)
      for (const geo of ["US", "IN"] as const) {
        const g = GEOS[geo];
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=${g.hl}&gl=${g.gl}&ceid=${g.ceid}`;
        const xml = await (await ctx.http.get(url, { skipRobots: true })).text();
        out.push({
          query: q,
          geo,
          items: parseRss(xml)
            .slice(0, 15)
            .map((i) => ({ ...i, feed: `google-news:${geo}` })),
        });
      }
    return out;
  },

  normalize: (raw) => {
    const seen = new Set<string>();
    return raw
      .flatMap((r) => r.items)
      .filter((i) => (seen.has(i.link) ? false : (seen.add(i.link), true)));
  },

  async persist(ctx, norm) {
    await persistNews(ctx.db, await sourceIdOf(ctx.db, "google_news_rss"), 0.6, norm);
  },

  async healthCheck(ctx) {
    try {
      const r = await ctx.http.get("https://news.google.com/rss/search?q=test", {
        skipRobots: true,
      });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  },
};
