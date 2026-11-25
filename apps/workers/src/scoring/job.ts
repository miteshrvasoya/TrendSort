import {
  backtestCases,
  categories,
  newsItems,
  productSnapshots,
  products,
  scores,
  sources,
  trendEntities,
  trendSignalsTimeseries,
  type Db,
} from "@trendbridge/db";
import {
  COUNTRIES,
  FESTIVALS,
  ALGORITHM_VERSION,
  commercialProof,
  lagGroupFor,
  seasonalityScore,
  type ProofProduct,
} from "@trendbridge/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AnalyticsClient, CategoryLag } from "./analytics";
import { assemble } from "./assemble";

const PRIORITY = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.priority]));

export interface ScoreRunResult {
  scored: number;
  skipped: number;
  failed: { trendId: number; error: string }[];
}

async function loadLagCases(db: Db) {
  const rows = await db.select().from(backtestCases);
  return rows.map((r) => ({
    group: r.group,
    lag_months: r.measuredLagMonths ?? r.estimatedLagMonths,
  }));
}

/** Scores every trend (or the given ids). Sample trends are scored too and stay flagged as sample. */
export async function runScoring(
  db: Db,
  analytics: AnalyticsClient,
  opts: { trendIds?: number[]; now?: Date } = {},
): Promise<ScoreRunResult> {
  const now = opts.now ?? new Date();
  const trends = await db
    .select()
    .from(trendEntities)
    .where(opts.trendIds?.length ? inArray(trendEntities.id, opts.trendIds) : undefined);
  const cats = new Map((await db.select().from(categories)).map((c) => [c.id, c.name]));
  const cases = await loadLagCases(db);
  const lagCache = new Map<string, CategoryLag>();
  const res: ScoreRunResult = { scored: 0, skipped: 0, failed: [] };

  for (const t of trends) {
    try {
      const rows = await db
        .select()
        .from(trendSignalsTimeseries)
        .where(
          and(
            eq(trendSignalsTimeseries.trendId, t.id),
            eq(trendSignalsTimeseries.metric, "search_interest"),
          ),
        );
      if (rows.length === 0) {
        res.skipped++;
        continue;
      }

      const weeks = [...new Set(rows.map((r) => r.weekStart))].sort();
      const idx = new Map(weeks.map((w, i) => [w, i]));
      const series: Record<string, (number | null)[]> = {};
      for (const r of rows)
        (series[r.countryCode] ??= weeks.map(() => null))[idx.get(r.weekStart)!] = r.value;
      const isSample = t.isSample;
      const comparable = rows.every((r) => r.isSample || r.method?.includes("joint compare"));

      const analysis = await analytics.analyze({ weeks, series, comparable, priorities: PRIORITY });

      const [prodN] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.trendId, t.id));
      const [newsN] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(newsItems)
        .where(eq(newsItems.trendId, t.id));
      const sourceTypes = 1 + ((prodN?.n ?? 0) > 0 ? 1 : 0) + ((newsN?.n ?? 0) > 0 ? 1 : 0);

      const srcIds = [
        ...new Set(rows.map((r) => r.sourceId).filter((x): x is number => x != null)),
      ];
      const srcs = srcIds.length
        ? await db.select().from(sources).where(inArray(sources.id, srcIds))
        : [];
      const sourceReliability = srcs.length
        ? srcs.reduce((a, s) => a + s.reliability, 0) / srcs.length
        : 0;
      const lastWeek = weeks.at(-1)!;
      const freshnessDays = Math.max(
        0,
        Math.round((now.getTime() - new Date(lastWeek).getTime()) / 86_400_000),
      );

      const prods = await db.select().from(products).where(eq(products.trendId, t.id));
      const proofProducts: ProofProduct[] = [];
      for (const p of prods) {
        const snaps = await db
          .select()
          .from(productSnapshots)
          .where(eq(productSnapshots.productId, p.id))
          .orderBy(productSnapshots.fetchedAt);
        proofProducts.push({
          rank: snaps.at(-1)?.bsr ?? null,
          reviewSnapshots: snaps
            .filter((s) => s.reviewCount != null)
            .map((s) => ({ t: s.fetchedAt.getTime(), count: s.reviewCount! })),
          prices: snaps.map((s) => s.price).filter((x): x is number => x != null),
        });
      }

      const group = lagGroupFor(t.categoryId ? (cats.get(t.categoryId) ?? null) : null, t.name);
      let lag = lagCache.get(group);
      if (!lag) {
        lag = await analytics.categoryLag(cases, group);
        lagCache.set(group, lag);
      }

      const rec = assemble({
        analysis,
        comparable,
        isSample,
        sourceTypes,
        sourceReliability,
        proof: commercialProof(proofProducts),
        seasonality: seasonalityScore(t.occasionKeys, now, FESTIVALS),
        categoryLag: lag,
        lagGroup: group,
        freshnessDays,
      });

      // one row per trend per version per day
      await db
        .delete(scores)
        .where(
          and(
            eq(scores.trendId, t.id),
            eq(scores.algorithmVersion, ALGORITHM_VERSION),
            sql`computed_at::date = ${now.toISOString().slice(0, 10)}::date`,
          ),
        );
      await db.insert(scores).values({
        trendId: t.id,
        algorithmVersion: rec.algorithmVersion,
        momentum: rec.momentum,
        breadth: rec.breadth,
        sustainability: rec.sustainability,
        commercialProof: rec.commercialProof,
        opportunity: rec.opportunity,
        adoptionStage: rec.adoptionStage,
        lagMonths: rec.lagMonths,
        weights: {},
        inputs: rec.inputs,
        confidence: rec.confidence,
        isSample: rec.isSample,
        computedAt: now,
      });
      res.scored++;
    } catch (e) {
      res.failed.push({ trendId: t.id, error: e instanceof Error ? e.message : String(e) });
      if (res.failed.length === 1 && /unreachable/.test(String(e))) break; // service down: no point trying the rest
    }
  }
  return res;
}
