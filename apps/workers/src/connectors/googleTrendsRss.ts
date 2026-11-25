import { trendSignalsTimeseries } from "@trendbridge/db";
import { loadEntityIndex, matchEntity } from "../lib/entities";
import { parseRss } from "../lib/rss";
import { sourceIdOf } from "../lib/source";
import type { Connector } from "../framework/types";
import fixture from "../fixtures/google-trends-rss.json";

interface Raw {
  geo: string;
  items: {
    title: string;
    link: string;
    publishedAt: string | null;
    approxTraffic: string | null;
  }[];
}
export interface Trending {
  geo: string;
  term: string;
  traffic: number;
  date: string;
}

export const GEOS = ["US", "GB", "AE", "JP", "KR", "IN"];

/** "2K+" -> 2000, "200+" -> 200. */
export function parseTraffic(s: string | null | undefined): number {
  const m = /([\d,.]+)\s*([KkMm]?)\+?/.exec(s ?? "");
  if (!m) return 0;
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  return Math.round(
    n * (m[2]!.toLowerCase() === "k" ? 1e3 : m[2]!.toLowerCase() === "m" ? 1e6 : 1),
  );
}

const monday = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

/** Daily trending searches. Mostly news, so we only keep ones matching tracked trends (as a 'trending_now' signal). */
export const googleTrendsRss: Connector<Raw, Trending> = {
  key: "google_trends_rss",
  name: "Google Trends daily RSS",
  rateLimit: { calls: 48, windowMs: 86_400_000 },
  costPerCall: 0,
  reliabilityScore: 0.6,
  scraped: false,
  termsNote: "Public feed.",

  async fetch(ctx) {
    if (ctx.fixtureMode) return fixture as Raw[];
    const out: Raw[] = [];
    for (const geo of GEOS) {
      const xml = await (
        await ctx.http.get(`https://trends.google.com/trending/rss?geo=${geo}`, {
          skipRobots: true,
        })
      ).text();
      out.push({
        geo,
        items: parseRss(xml).map((i) => ({
          title: i.title,
          link: i.link,
          publishedAt: i.publishedAt,
          approxTraffic: i.approxTraffic ?? null,
        })),
      });
    }
    return out;
  },

  normalize: (raw) =>
    raw.flatMap((r) =>
      r.items.map((i) => ({
        geo: r.geo,
        term: i.title,
        traffic: parseTraffic(i.approxTraffic),
        date: (i.publishedAt ?? new Date().toISOString()).slice(0, 10),
      })),
    ),

  async persist(ctx, norm) {
    const index = await loadEntityIndex(ctx.db);
    const sourceId = await sourceIdOf(ctx.db, "google_trends_rss");
    for (const t of norm) {
      const trendId = matchEntity(index, t.term);
      if (!trendId) continue;
      await ctx.db
        .insert(trendSignalsTimeseries)
        .values({
          trendId,
          countryCode: t.geo === "GB" ? "GB" : t.geo,
          metric: "trending_now",
          weekStart: monday(new Date(t.date)),
          value: t.traffic,
          isEstimated: true,
          method: "approx_traffic from Google Trends daily RSS (lower bound)",
          sourceId,
          confidence: 0.5,
        })
        .onConflictDoUpdate({
          target: [
            trendSignalsTimeseries.trendId,
            trendSignalsTimeseries.countryCode,
            trendSignalsTimeseries.metric,
            trendSignalsTimeseries.weekStart,
          ],
          set: { value: t.traffic },
        });
    }
  },

  async healthCheck(ctx) {
    try {
      const r = await ctx.http.get("https://trends.google.com/trending/rss?geo=US", {
        skipRobots: true,
      });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  },
};
