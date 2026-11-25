import { trackedKeywords, trendSignalsTimeseries } from "@trendbridge/db";
import { eq, sql } from "drizzle-orm";
import { activeKeywords } from "../lib/keywords";
import { sourceIdOf } from "../lib/source";
import type { Connector, FetchContext } from "../framework/types";
import fixture from "../fixtures/google-trends.json";

export interface InterestPoint {
  time: number;
  value: number;
} // unix seconds, 0-100
export interface Raw {
  trendId: number;
  keywordId: number;
  term: string;
  geo: string;
  points: InterestPoint[];
}
export interface Point {
  trendId: number;
  geo: string;
  week: string;
  value: number;
}

/** Injectable so tests never hit the network. The default wraps the unofficial `google-trends-api` package. */
export type InterestClient = (term: string, geo: string, start: Date) => Promise<InterestPoint[]>;

const MAX_KEYWORDS_PER_RUN = 8; // x geos (2 by default) = 16 calls; budget 200/day

export const defaultClient: InterestClient = async (term, geo, start) => {
  const { default: api } = await import("google-trends-api");
  const json = await api.interestOverTime({
    keyword: term,
    geo,
    startTime: start,
    granularTimeResolution: false,
  });
  const data = JSON.parse(json) as {
    default: { timelineData: { time: string; value: number[] }[] };
  };
  return data.default.timelineData.map((p) => ({ time: Number(p.time), value: p.value[0] ?? 0 }));
};

const monday = (unix: number) => {
  const d = new Date(unix * 1000);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

export function makeGoogleTrends(
  client: InterestClient = defaultClient,
  pauseMs = 4000,
): Connector<Raw, Point> {
  return {
    key: "google_trends",
    name: "Google Trends (unofficial)",
    rateLimit: { calls: 200, windowMs: 86_400_000 },
    costPerCall: 0,
    reliabilityScore: 0.6,
    scraped: false,
    termsNote:
      "Unofficial wrapper. Values are relative (0-100) within each country request, so US and India curves are NOT directly comparable in magnitude.",

    async fetch(ctx: FetchContext) {
      if (ctx.fixtureMode) return fixture as Raw[];
      const kws = await activeKeywords(ctx.db, MAX_KEYWORDS_PER_RUN);
      const start = new Date(Date.now() - 5 * 365 * 86_400_000);
      const out: Raw[] = [];
      for (const k of kws)
        for (const geo of k.geos) {
          await ctx.http.recordExternal(
            `google-trends://interestOverTime?q=${encodeURIComponent(k.term)}&geo=${geo}`,
          );
          try {
            out.push({
              trendId: k.trendId,
              keywordId: k.id,
              term: k.term,
              geo,
              points: await client(k.term, geo, start),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (out.length === 0 && /429|too many|quota/i.test(msg))
              throw new Error(`Google Trends rate-limited (429); backing off. ${msg}`);
            ctx.log.warn({ term: k.term, geo, msg }, "trends call failed");
          }
          await new Promise((r) => setTimeout(r, pauseMs));
        }
      if (kws.length && out.length === 0)
        throw new Error("Google Trends returned no data for any keyword");
      return out;
    },

    normalize: (raw) =>
      raw.flatMap((r) =>
        r.points.map((p) => ({
          trendId: r.trendId,
          geo: r.geo,
          week: monday(p.time),
          value: p.value,
        })),
      ),

    async persist(ctx, norm) {
      const sourceId = await sourceIdOf(ctx.db, "google_trends");
      for (let i = 0; i < norm.length; i += 500) {
        await ctx.db
          .insert(trendSignalsTimeseries)
          .values(
            norm.slice(i, i + 500).map((p) => ({
              trendId: p.trendId,
              countryCode: p.geo,
              metric: "search_interest",
              weekStart: p.week,
              value: p.value,
              isEstimated: false,
              method: "google_trends relative index per country request",
              sourceId,
              confidence: 0.6,
            })),
          )
          .onConflictDoUpdate({
            target: [
              trendSignalsTimeseries.trendId,
              trendSignalsTimeseries.countryCode,
              trendSignalsTimeseries.metric,
              trendSignalsTimeseries.weekStart,
            ],
            set: { value: sql`excluded.value`, fetchedAt: new Date() },
          });
      }
      const ids = new Set(norm.map((p) => p.trendId));
      for (const id of ids)
        await ctx.db
          .update(trackedKeywords)
          .set({ lastFetchedAt: new Date() })
          .where(eq(trackedKeywords.trendId, id));
    },

    async healthCheck() {
      return { ok: true, detail: "unofficial API; health is observed via run history" };
    },
  };
}

export const googleTrends = makeGoogleTrends();
