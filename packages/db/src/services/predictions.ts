import {
  ALGORITHM_VERSION,
  PREDICTION_HORIZON_MONTHS,
  classifyHit,
  predictStage,
  summarisePredictions,
  type PredictionBasis,
  type PredictionSummary,
} from "@trendbridge/shared";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { predictions, scores, trendEntities } from "../schema";

const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + m);
  return x;
};
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

/** One live prediction per trend per 30 days, made from the latest score's India ratio and growth. */
export async function recordPredictions(db: Db, now = new Date()): Promise<number> {
  const rows = await db.execute(sql`
    select distinct on (s.trend_id) s.trend_id as "trendId", s.inputs, s.adoption_stage as stage, s.confidence, t.is_sample as "isSample"
    from scores s join trend_entities t on t.id = s.trend_id
    order by s.trend_id, s.computed_at desc`);
  let made = 0;
  for (const r of rows.rows as {
    trendId: number;
    inputs: { india?: { ratio: number | null; growth13: number | null } };
    stage: string | null;
    confidence: number;
    isSample: boolean;
  }[]) {
    const basis: PredictionBasis = {
      ratio: r.inputs?.india?.ratio ?? null,
      growth13: r.inputs?.india?.growth13 ?? null,
      currentStage: r.stage,
    };
    const p = predictStage(basis);
    if (!p) continue;
    const recent = await db.execute(
      sql`select 1 from predictions where trend_id = ${r.trendId} and origin = 'live' and created_at > ${new Date(now.getTime() - 30 * 86_400_000)} limit 1`,
    );
    if (recent.rows.length) continue;
    await db.insert(predictions).values({
      trendId: r.trendId,
      predictedStage: p.stage,
      horizonDate: dateStr(addMonths(now, PREDICTION_HORIZON_MONTHS)),
      confidence: r.confidence,
      origin: "live",
      isSample: r.isSample,
      algorithmVersion: ALGORITHM_VERSION,
      basis: { ...basis, projectedRatio: p.projectedRatio },
      createdAt: now,
    });
    made++;
  }
  return made;
}

/** Compares live predictions whose horizon has passed with the trend's latest stage. */
export async function resolvePredictions(db: Db, now = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.origin, "live"),
        isNull(predictions.resolvedAt),
        lte(predictions.horizonDate, dateStr(now)),
      ),
    );
  let n = 0;
  for (const p of due) {
    const [s] = await db
      .select({ stage: scores.adoptionStage })
      .from(scores)
      .where(eq(scores.trendId, p.trendId))
      .orderBy(desc(scores.computedAt))
      .limit(1);
    const c = s?.stage ? classifyHit(p.predictedStage, s.stage) : null;
    if (!c) continue;
    await db
      .update(predictions)
      .set({ actualStage: s!.stage, resolvedAt: now, hit: c.hit, stageError: c.error })
      .where(eq(predictions.id, p.id));
    n++;
  }
  return n;
}

export async function insertBacktestPrediction(
  db: Db,
  v: {
    trendId: number;
    predictedStage: string;
    actualStage: string;
    confidence: number | null;
    isSample: boolean;
    basis: PredictionBasis & { projectedRatio?: number };
    madeAt: Date;
    horizonAt: Date;
  },
) {
  const c = classifyHit(v.predictedStage, v.actualStage);
  if (!c) return false;
  await db.insert(predictions).values({
    trendId: v.trendId,
    predictedStage: v.predictedStage,
    actualStage: v.actualStage,
    horizonDate: dateStr(v.horizonAt),
    confidence: v.confidence,
    origin: "backtest",
    isSample: v.isSample,
    algorithmVersion: ALGORITHM_VERSION,
    basis: v.basis,
    resolvedAt: v.horizonAt,
    hit: c.hit,
    stageError: c.error,
    createdAt: v.madeAt,
  });
  return true;
}

export interface TrackerSummary {
  live: PredictionSummary & { pending: number; sample: boolean };
  backtest: { real: PredictionSummary; sample: PredictionSummary };
}

export async function trackerSummary(db: Db): Promise<TrackerSummary> {
  const rows = await db
    .select({ p: predictions })
    .from(predictions)
    .orderBy(desc(predictions.createdAt));
  const resolved = (f: (p: typeof predictions.$inferSelect) => boolean) =>
    rows
      .map((r) => r.p)
      .filter((p) => p.resolvedAt && p.actualStage && f(p))
      .map((p) => ({
        predictedStage: p.predictedStage,
        actualStage: p.actualStage!,
        confidence: p.confidence,
        currentStage: (p.basis as PredictionBasis).currentStage ?? null,
      }));
  const liveRows = rows.map((r) => r.p).filter((p) => p.origin === "live");
  return {
    live: {
      ...summarisePredictions(resolved((p) => p.origin === "live")),
      pending: liveRows.filter((p) => !p.resolvedAt).length,
      sample: liveRows.length > 0 && liveRows.every((p) => p.isSample),
    },
    backtest: {
      real: summarisePredictions(resolved((p) => p.origin === "backtest" && !p.isSample)),
      sample: summarisePredictions(resolved((p) => p.origin === "backtest" && p.isSample)),
    },
  };
}

export const countTrends = async (db: Db) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(trendEntities))[0]?.n ?? 0;
