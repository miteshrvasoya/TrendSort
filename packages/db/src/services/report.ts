import {
  FESTIVALS,
  RUNNABLE_SOURCE_KEYS,
  SOURCE_CATALOG,
  composeReport,
  isStuck,
  upcomingFestivals,
  weekStart,
  windowFor,
  type Report,
  type ReportInput,
  type ReportTrend,
  type ReportWindow,
} from "@trendbridge/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  alertEvents,
  pipelineItems,
  productReviews,
  reports,
  sources,
  trendEntities,
  unitEconomicsScenarios,
} from "../schema";
import { snapshotOf, weightsFor } from "./snapshots";

const SATURATED = new Set(["mainstream", "saturated"]);

/** Collects the facts the weekly report needs. Pure composition happens in shared `composeReport`. */
export async function gatherReportInput(
  db: Db,
  opts: { userId: string; now?: Date; mode?: "real" | "sample" },
): Promise<ReportInput> {
  const now = opts.now ?? new Date();
  const weights = await weightsFor(db, opts.userId);
  const trendRows = await db.select().from(trendEntities);
  const weekAgo = new Date(now.getTime() - 5 * 86_400_000);
  const ids = trendRows.map((t) => t.id);

  const latest = ids.length
    ? await db.execute(
        sql`select distinct on (trend_id) trend_id, inputs, adoption_stage, confidence from scores where trend_id = any(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)}) and computed_at <= ${now} order by trend_id, computed_at desc`,
      )
    : { rows: [] };
  const older = ids.length
    ? await db.execute(
        sql`select distinct on (trend_id) trend_id, inputs, adoption_stage from scores where trend_id = any(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)}) and computed_at < ${weekAgo} order by trend_id, computed_at desc`,
      )
    : { rows: [] };
  const latestBy = new Map(
    (
      latest.rows as {
        trend_id: number;
        inputs: unknown;
        adoption_stage: string | null;
        confidence: number;
      }[]
    ).map((r) => [r.trend_id, r]),
  );
  const olderBy = new Map(
    (older.rows as { trend_id: number; inputs: unknown; adoption_stage: string | null }[]).map(
      (r) => [r.trend_id, r],
    ),
  );
  const withScenario = new Set(
    (
      await db
        .select({ id: unitEconomicsScenarios.trendId })
        .from(unitEconomicsScenarios)
        .where(eq(unitEconomicsScenarios.isPrimary, true))
    ).map((r) => r.id),
  );
  const withReviews = new Set(
    (await db.selectDistinct({ id: productReviews.trendId }).from(productReviews)).map((r) => r.id),
  );

  const trends: ReportTrend[] = trendRows.map((t) => {
    const l = latestBy.get(t.id),
      o = olderBy.get(t.id);
    const ls = l
      ? snapshotOf({ inputs: l.inputs, adoptionStage: l.adoption_stage }, weights)
      : null;
    const os = o
      ? snapshotOf({ inputs: o.inputs, adoptionStage: o.adoption_stage }, weights)
      : null;
    const level =
      (l?.inputs as { confidence?: { level?: string } } | undefined)?.confidence?.level ?? null;
    return {
      id: t.id,
      name: t.name,
      isSample: t.isSample,
      status: t.status,
      createdAt: t.fetchedAt.toISOString(),
      opportunity: ls?.opportunity ?? null,
      prevOpportunity: os?.opportunity ?? null,
      stage: l?.adoption_stage ?? null,
      prevStage: o?.adoption_stage ?? null,
      confidenceLevel: t.isSample ? "sample" : level,
      hasScenario: withScenario.has(t.id),
      hasReviews: withReviews.has(t.id),
    };
  });

  const mode =
    opts.mode ?? (trends.some((t) => !t.isSample && t.opportunity != null) ? "real" : "sample");
  const pool = trends.filter((t) => (mode === "real" ? !t.isSample : true));

  const windows: ReportWindow[] = upcomingFestivals(FESTIVALS, now, 250)
    .slice(0, 4)
    .map((f) => {
      const w = windowFor(f.date, now);
      const gifts = trendRows
        .filter((t) => t.occasionKeys.includes(f.key))
        .map((t) => pool.find((p) => p.id === t.id))
        .filter(
          (t): t is ReportTrend =>
            !!t && t.opportunity != null && !(t.stage && SATURATED.has(t.stage)),
        )
        .sort((a, b) => b.opportunity! - a.opportunity!)
        .slice(0, 5)
        .map((t) => ({ id: t.id, name: t.name, opportunity: t.opportunity }));
      return {
        festival: f.name,
        date: f.date,
        importDeadline: w.importDeadline,
        daysToImportDeadline: w.daysToImportDeadline,
        status: w.status,
        gifts,
      };
    });

  const events = await db
    .select()
    .from(alertEvents)
    .where(
      and(
        eq(alertEvents.userId, opts.userId),
        gte(alertEvents.firedAt, new Date(now.getTime() - 7 * 86_400_000)),
      ),
    )
    .orderBy(desc(alertEvents.firedAt));
  const items = await db.select().from(pipelineItems).where(eq(pipelineItems.userId, opts.userId));
  const nameOf = new Map(trendRows.map((t) => [t.id, t.name]));

  const srcs = await db.select().from(sources).where(eq(sources.enabled, true));
  const envKeys = new Map(
    SOURCE_CATALOG.filter((c) => "envKey" in c).map((c) => [
      c.key,
      (c as { envKey: string }).envKey,
    ]),
  );
  const runnable = new Set<string>(RUNNABLE_SOURCE_KEYS);
  const stale = srcs
    .filter(
      (s) =>
        runnable.has(s.key) &&
        s.lastSuccessAt &&
        now.getTime() - s.lastSuccessAt.getTime() > 36 * 3_600_000,
    )
    .map((s) => s.key);
  const never = srcs
    .filter(
      (s) =>
        runnable.has(s.key) &&
        !s.lastSuccessAt &&
        !(envKeys.has(s.key) && !process.env[envKeys.get(s.key)!]),
    )
    .map((s) => s.key);
  const [ind] = (
    await db.execute(
      sql`select ((select count(*) from duty_gst_tables where is_indicative) + (select count(*) from fee_tables where is_indicative))::int as n`,
    )
  ).rows as { n: number }[];

  return {
    weekOf: weekStart(now),
    generatedAt: now.toISOString(),
    mode,
    trends,
    windows,
    alerts: events.map((e) => ({ message: e.message, firedAt: e.firedAt.toISOString() })),
    pipeline: items.map((p) => ({
      id: p.id,
      title: p.title ?? (p.trendId != null ? nameOf.get(p.trendId) : null) ?? "Untitled idea",
      stage: p.stage,
      updatedAt: p.updatedAt.toISOString(),
      stuck: isStuck(p.stage, p.updatedAt, now),
    })),
    dataHealth: {
      staleSources: stale,
      neverRunSources: never,
      indicativeTables: (ind?.n ?? 0) > 0,
    },
  };
}

/** Builds and stores this week's report (replacing an earlier one for the same week and mode). */
export async function generateReport(
  db: Db,
  opts: { userId: string; now?: Date; mode?: "real" | "sample" },
): Promise<{ id: number; report: Report }> {
  const input = await gatherReportInput(db, opts);
  const report = composeReport(input);
  await db
    .delete(reports)
    .where(and(eq(reports.weekOf, report.weekOf), eq(reports.mode, report.mode)));
  const [row] = await db
    .insert(reports)
    .values({
      weekOf: report.weekOf,
      mode: report.mode,
      payload: report,
      generatedAt: opts.now ?? new Date(),
    })
    .returning({ id: reports.id });
  return { id: row!.id, report };
}
