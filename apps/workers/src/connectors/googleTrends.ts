import { trackedKeywords, trendSignalsTimeseries } from "@trendbridge/db";
import { eq, sql } from "drizzle-orm";
import { activeKeywords } from "../lib/keywords";
import { sourceIdOf } from "../lib/source";
import type { Connector, FetchContext } from "../framework/types";
import fixture from "../fixtures/google-trends.json";

export interface InterestPoint {
  time: number; // unix seconds
  value: number; // 0-100, normalised jointly across all geos in the request
}
export interface Raw {
  trendId: number;
  keywordId: number;
  term: string;
  series: Record<string, InterestPoint[]>;
}
export interface Point {
  trendId: number;
  geo: string;
  week: string;
  value: number;
}

/**
 * One request per keyword compares all its geos, so values share ONE scale (the single highest point across
 * all geos is 100). That is what makes India vs foreign directly comparable. Injectable so tests never hit the network.
 */
export type InterestClient = (
  term: string,
  geos: string[],
  start: Date,
) => Promise<Record<string, InterestPoint[]>>;

export const METHOD = "google_trends joint compare (one scale across countries)";
const MAX_KEYWORDS_PER_RUN = 8; // 1 call per keyword; budget 200/day

export const defaultClient: InterestClient = async (term, geos, start) => {
  const { default: api } = await import("google-trends-api");
  const json = await api.interestOverTime({
    keyword: geos.map(() => term) as unknown as string,
    geo: geos as unknown as string,
    startTime: start,
    granularTimeResolution: false,
  });
  const data = JSON.parse(json) as {
    default: { timelineData: { time: string; value: number[] }[] };
  };
  const out: Record<string, InterestPoint[]> = {};
  geos.forEach((g, i) => {
    out[g] = data.default.timelineData.map((p) => ({
      time: Number(p.time),
      value: p.value[i] ?? 0,
    }));
  });
  return out;
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
      "Unofficial wrapper. One compare request per keyword, so all countries share one 0-100 scale.",

    async fetch(ctx: FetchContext) {
      if (ctx.fixtureMode) return fixture as Raw[];
      const kws = await activeKeywords(ctx.db, MAX_KEYWORDS_PER_RUN);
      const start = new Date(Date.now() - 5 * 365 * 86_400_000);
      const out: Raw[] = [];
      for (const k of kws) {
        const geos = [...new Set(k.geos)].slice(0, 5);
        await ctx.http.recordExternal(
          `google-trends://interestOverTime?q=${encodeURIComponent(k.term)}&geo=${geos.join(",")}`,
        );
        try {
          out.push({
            trendId: k.trendId,
            keywordId: k.id,
            term: k.term,
            series: await client(k.term, geos, start),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (out.length === 0 && /429|too many|quota/i.test(msg))
            throw new Error(`Google Trends rate-limited (429); backing off. ${msg}`);
          ctx.log.warn({ term: k.term, msg }, "trends call failed");
        }
        await new Promise((r) => setTimeout(r, pauseMs));
      }
      if (kws.length && out.length === 0)
        throw new Error("Google Trends returned no data for any keyword");
      return out;
    },

    normalize: (raw) =>
      raw.flatMap((r) =>
        Object.entries(r.series).flatMap(([geo, pts]) =>
          pts.map((p) => ({ trendId: r.trendId, geo, week: monday(p.time), value: p.value })),
        ),
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
              method: METHOD,
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
            set: { value: sql`excluded.value`, method: METHOD, fetchedAt: new Date() },
          });
      }
      for (const id of new Set(norm.map((p) => p.trendId)))
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
