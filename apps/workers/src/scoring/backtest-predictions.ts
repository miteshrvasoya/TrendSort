import {
  insertBacktestPrediction,
  predictions,
  scores,
  trendEntities,
  type Db,
} from "@trendbridge/db";
import {
  COUNTRIES,
  PREDICTION_HORIZON_MONTHS,
  predictStage,
  stageFromRatio,
} from "@trendbridge/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AnalyticsClient } from "./analytics";
import { loadSeries } from "./series";

const PRIORITY = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.priority]));

/**
 * Honest back-test of the stage predictor: for each trend with enough history, hide the last `horizonWeeks`, predict the India
 * stage at the end of the series from the truncated data, then compare with the stage the full data shows. Stored with
 * origin "backtest" so it is never mixed with live predictions. Sample trends are flagged sample.
 */
export async function runPredictionBacktest(
  db: Db,
  analytics: AnalyticsClient,
  opts: { horizonWeeks?: number; minWeeks?: number; trendIds?: number[] } = {},
): Promise<{ made: number; skipped: number; failed: number }> {
  const horizon = opts.horizonWeeks ?? Math.round((PREDICTION_HORIZON_MONTHS * 52) / 12);
  const minWeeks = opts.minWeeks ?? horizon + 52;
  const trends = await db
    .select()
    .from(trendEntities)
    .where(opts.trendIds?.length ? inArray(trendEntities.id, opts.trendIds) : undefined);
  const out = { made: 0, skipped: 0, failed: 0 };
  for (const t of trends) {
    try {
      const b = await loadSeries(db, t.id);
      if (!b || b.weeks.length < minWeeks || !b.series.IN) {
        out.skipped++;
        continue;
      }
      const horizonDate = b.weeks.at(-1)!;
      const dup = await db
        .select({ id: predictions.id })
        .from(predictions)
        .where(
          and(
            eq(predictions.trendId, t.id),
            eq(predictions.origin, "backtest"),
            eq(predictions.horizonDate, horizonDate),
          ),
        );
      if (dup.length) {
        out.skipped++;
        continue;
      }
      const cut = b.weeks.length - horizon;
      const trunc = Object.fromEntries(
        Object.entries(b.series).map(([c, v]) => [c, v.slice(0, cut)]),
      );
      const [early, full] = await Promise.all([
        analytics.analyze({
          weeks: b.weeks.slice(0, cut),
          series: trunc,
          comparable: b.comparable,
          priorities: PRIORITY,
        }),
        analytics.analyze({
          weeks: b.weeks,
          series: b.series,
          comparable: b.comparable,
          priorities: PRIORITY,
        }),
      ]);
      const basis = {
        ratio: early.india.ratio,
        growth13: early.india.growth13,
        currentStage:
          early.india.ratio == null
            ? null
            : stageFromRatio(early.india.ratio, early.india.growth13, b.comparable),
      };
      const pred = predictStage(basis);
      const actual =
        full.india.ratio == null
          ? null
          : stageFromRatio(full.india.ratio, full.india.growth13, b.comparable);
      if (!pred || !actual) {
        out.skipped++;
        continue;
      }
      const [s] = await db
        .select({ c: scores.confidence })
        .from(scores)
        .where(eq(scores.trendId, t.id))
        .orderBy(desc(scores.computedAt))
        .limit(1);
      const ok = await insertBacktestPrediction(db, {
        trendId: t.id,
        predictedStage: pred.stage,
        actualStage: actual,
        confidence: s?.c ?? null,
        isSample: t.isSample,
        basis: { ...basis, projectedRatio: pred.projectedRatio },
        madeAt: new Date(b.weeks[cut - 1]! + "T00:00:00Z"),
        horizonAt: new Date(horizonDate + "T00:00:00Z"),
      });
      if (ok) out.made++;
      else out.skipped++;
    } catch {
      out.failed++;
    }
  }
  return out;
}
