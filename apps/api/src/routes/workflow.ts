import {
  alertEvents,
  alerts,
  evaluateAlerts,
  generateReport,
  pipelineEvents,
  pipelineItems,
  predictions,
  recordPredictions,
  reports,
  resolvePredictions,
  scores,
  snapshotOf,
  trackerSummary,
  trendEntities,
  unseenAlertCount,
  watchlists,
  weightsFor,
} from "@trendbridge/db";
import {
  PIPELINE_STAGES,
  alertRuleSchema,
  isStuck,
  reportToMarkdown,
  toCsv,
  type Report,
} from "@trendbridge/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { renderReportPdf } from "../lib-pdf";
import { scoreQueue } from "../queue";

const id = z.object({ id: z.coerce.number() });

async function trendCards(app: FastifyInstance, userId: string, ids: number[]) {
  if (ids.length === 0)
    return new Map<
      number,
      {
        id: number;
        name: string;
        isSample: boolean;
        opportunity: number | null;
        stage: string | null;
        delta: number | null;
      }
    >();
  const weights = await weightsFor(app.db, userId);
  const trends = await app.db.select().from(trendEntities).where(inArray(trendEntities.id, ids));
  const out = new Map<
    number,
    {
      id: number;
      name: string;
      isSample: boolean;
      opportunity: number | null;
      stage: string | null;
      delta: number | null;
    }
  >();
  for (const t of trends) {
    const rows = await app.db
      .select()
      .from(scores)
      .where(eq(scores.trendId, t.id))
      .orderBy(desc(scores.computedAt))
      .limit(30);
    const l = rows[0];
    const ls = l ? snapshotOf(l, weights) : null;
    const p = l
      ? rows.find(
          (r) =>
            r.computedAt.toISOString().slice(0, 10) <=
            new Date(l.computedAt.getTime() - 6 * 86_400_000).toISOString().slice(0, 10),
        )
      : null;
    const ps = p ? snapshotOf(p, weights) : null;
    out.set(t.id, {
      id: t.id,
      name: t.name,
      isSample: t.isSample,
      opportunity: ls?.opportunity ?? null,
      stage: l?.adoptionStage ?? null,
      delta:
        ls?.opportunity != null && ps?.opportunity != null
          ? Math.round((ls.opportunity - ps.opportunity) * 10) / 10
          : null,
    });
  }
  return out;
}

const csv = (
  reply: { header: (k: string, v: string) => unknown; type: (t: string) => unknown },
  name: string,
  body: string,
) => {
  reply.header("content-disposition", `attachment; filename="${name}"`);
  reply.type("text/csv; charset=utf-8");
  return body;
};

export const workflowRoutes: FastifyPluginAsyncZod = async (app) => {
  // ------------------------------------------------------------ watchlists
  app.get("/watchlists", { preHandler: app.authenticate }, async (req) => {
    const lists = await app.db
      .select()
      .from(watchlists)
      .where(eq(watchlists.userId, req.user.sub))
      .orderBy(watchlists.createdAt);
    const cards = await trendCards(app, req.user.sub, [
      ...new Set(lists.flatMap((l) => l.trendIds)),
    ]);
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      trends: l.trendIds.map((t) => cards.get(t)).filter(Boolean),
    }));
  });
  app.post(
    "/watchlists",
    {
      preHandler: app.authenticate,
      schema: { body: z.object({ name: z.string().trim().min(1).max(80) }) },
    },
    async (req, reply) => {
      const [w] = await app.db
        .insert(watchlists)
        .values({ userId: req.user.sub, name: req.body.name })
        .returning();
      return reply.code(201).send({ id: w!.id, name: w!.name, trends: [] });
    },
  );
  app.put(
    "/watchlists/:id",
    {
      preHandler: app.authenticate,
      schema: { params: id, body: z.object({ name: z.string().trim().min(1).max(80) }) },
    },
    async (req, reply) => {
      const r = await app.db
        .update(watchlists)
        .set({ name: req.body.name })
        .where(and(eq(watchlists.id, req.params.id), eq(watchlists.userId, req.user.sub)))
        .returning({ id: watchlists.id });
      return r.length ? { ok: true } : reply.code(404).send({ error: "Not found" });
    },
  );
  app.delete(
    "/watchlists/:id",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const r = await app.db
        .delete(watchlists)
        .where(and(eq(watchlists.id, req.params.id), eq(watchlists.userId, req.user.sub)))
        .returning({ id: watchlists.id });
      return r.length ? { ok: true } : reply.code(404).send({ error: "Not found" });
    },
  );
  app.post(
    "/watchlists/:id/items",
    {
      preHandler: app.authenticate,
      schema: { params: id, body: z.object({ trendId: z.number().int() }) },
    },
    async (req, reply) => {
      const [w] = await app.db
        .select()
        .from(watchlists)
        .where(and(eq(watchlists.id, req.params.id), eq(watchlists.userId, req.user.sub)));
      if (!w) return reply.code(404).send({ error: "Not found" });
      const [t] = await app.db
        .select({ id: trendEntities.id })
        .from(trendEntities)
        .where(eq(trendEntities.id, req.body.trendId));
      if (!t) return reply.code(404).send({ error: "Unknown trend" });
      const next = w.trendIds.includes(t.id) ? w.trendIds : [...w.trendIds, t.id];
      await app.db.update(watchlists).set({ trendIds: next }).where(eq(watchlists.id, w.id));
      return { ok: true, count: next.length };
    },
  );
  app.delete(
    "/watchlists/:id/items/:trendId",
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ id: z.coerce.number(), trendId: z.coerce.number() }) },
    },
    async (req, reply) => {
      const [w] = await app.db
        .select()
        .from(watchlists)
        .where(and(eq(watchlists.id, req.params.id), eq(watchlists.userId, req.user.sub)));
      if (!w) return reply.code(404).send({ error: "Not found" });
      await app.db
        .update(watchlists)
        .set({ trendIds: w.trendIds.filter((x) => x !== req.params.trendId) })
        .where(eq(watchlists.id, w.id));
      return { ok: true };
    },
  );

  // ------------------------------------------------------------ alerts
  const alertBody = z.object({
    rule: alertRuleSchema,
    trendId: z.number().int().nullable().default(null),
  });
  app.get("/alerts", { preHandler: app.authenticate }, async (req) => {
    const rows = await app.db
      .select()
      .from(alerts)
      .where(eq(alerts.userId, req.user.sub))
      .orderBy(desc(alerts.id));
    const names = new Map(
      (
        await app.db.select({ id: trendEntities.id, name: trendEntities.name }).from(trendEntities)
      ).map((t) => [t.id, t.name]),
    );
    const lists = new Map(
      (await app.db.select().from(watchlists).where(eq(watchlists.userId, req.user.sub))).map(
        (w) => [w.id, w.name],
      ),
    );
    return rows.map((a) => {
      const rule = a.rule as { scope: string; watchlistId?: number };
      return {
        id: a.id,
        rule: a.rule,
        active: a.active,
        lastFiredAt: a.lastFiredAt,
        trendId: a.trendId,
        trendName: a.trendId != null ? (names.get(a.trendId) ?? null) : null,
        watchlistName: rule.watchlistId != null ? (lists.get(rule.watchlistId) ?? null) : null,
      };
    });
  });
  app.post(
    "/alerts",
    { preHandler: app.authenticate, schema: { body: alertBody } },
    async (req, reply) => {
      const { rule, trendId } = req.body;
      if (rule.scope === "trend" && trendId == null)
        return reply.code(400).send({ error: "Choose a trend for a trend alert" });
      if (rule.scope === "watchlist") {
        const [w] =
          rule.watchlistId != null
            ? await app.db
                .select()
                .from(watchlists)
                .where(
                  and(eq(watchlists.id, rule.watchlistId), eq(watchlists.userId, req.user.sub)),
                )
            : [];
        if (!w) return reply.code(400).send({ error: "Choose one of your watchlists" });
      }
      const [a] = await app.db
        .insert(alerts)
        .values({ userId: req.user.sub, trendId: rule.scope === "trend" ? trendId : null, rule })
        .returning();
      return reply.code(201).send({ id: a!.id });
    },
  );
  app.put(
    "/alerts/:id",
    {
      preHandler: app.authenticate,
      schema: { params: id, body: z.object({ active: z.boolean() }) },
    },
    async (req, reply) => {
      const r = await app.db
        .update(alerts)
        .set({ active: req.body.active })
        .where(and(eq(alerts.id, req.params.id), eq(alerts.userId, req.user.sub)))
        .returning({ id: alerts.id });
      return r.length ? { ok: true } : reply.code(404).send({ error: "Not found" });
    },
  );
  app.delete(
    "/alerts/:id",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const r = await app.db
        .delete(alerts)
        .where(and(eq(alerts.id, req.params.id), eq(alerts.userId, req.user.sub)))
        .returning({ id: alerts.id });
      return r.length ? { ok: true } : reply.code(404).send({ error: "Not found" });
    },
  );
  app.get("/alerts/events", { preHandler: app.authenticate }, async (req) =>
    app.db
      .select({
        id: alertEvents.id,
        trendId: alertEvents.trendId,
        message: alertEvents.message,
        seen: alertEvents.seen,
        firedAt: alertEvents.firedAt,
      })
      .from(alertEvents)
      .where(eq(alertEvents.userId, req.user.sub))
      .orderBy(desc(alertEvents.firedAt))
      .limit(50),
  );
  app.get("/alerts/unseen", { preHandler: app.authenticate }, async (req) => ({
    count: await unseenAlertCount(app.db, req.user.sub),
  }));
  app.post("/alerts/events/seen", { preHandler: app.authenticate }, async (req) => {
    await app.db
      .update(alertEvents)
      .set({ seen: true })
      .where(eq(alertEvents.userId, req.user.sub));
    return { ok: true };
  });
  /** Evaluate now against stored scores (no analytics service needed). */
  app.post("/alerts/evaluate", { preHandler: app.authenticate }, async () =>
    evaluateAlerts(app.db),
  );

  // ------------------------------------------------------------ pipeline
  const quote = z.object({
    supplier: z.string().max(120),
    price: z.number().min(0).nullable().default(null),
    currency: z.string().max(3).default("USD"),
    moq: z.number().int().min(0).nullable().default(null),
    note: z.string().max(500).default(""),
    date: z.string().max(10).default(""),
  });
  const pipeBody = z.object({
    title: z.string().trim().max(160).nullable().optional(),
    stage: z.enum(PIPELINE_STAGES).optional(),
    notes: z.string().max(4000).nullable().optional(),
    quotes: z.array(quote).max(30).optional(),
    results: z.string().max(4000).nullable().optional(),
  });

  app.get("/pipeline", { preHandler: app.authenticate }, async (req) => {
    const items = await app.db
      .select()
      .from(pipelineItems)
      .where(eq(pipelineItems.userId, req.user.sub))
      .orderBy(desc(pipelineItems.updatedAt));
    const ids = items.map((i) => i.trendId).filter((x): x is number => x != null);
    const cards = await trendCards(app, req.user.sub, ids);
    const now = new Date();
    return items.map((i) => ({
      id: i.id,
      trendId: i.trendId,
      title: i.title ?? (i.trendId != null ? cards.get(i.trendId)?.name : null) ?? "Untitled idea",
      stage: i.stage,
      notes: i.notes,
      quotes: i.quotes,
      results: i.results,
      updatedAt: i.updatedAt,
      createdAt: i.createdAt,
      stuck: isStuck(i.stage, i.updatedAt, now),
      trend: i.trendId != null ? (cards.get(i.trendId) ?? null) : null,
    }));
  });
  app.post(
    "/pipeline",
    {
      preHandler: app.authenticate,
      schema: { body: pipeBody.extend({ trendId: z.number().int().nullable().optional() }) },
    },
    async (req, reply) => {
      const b = req.body;
      if (b.trendId == null && !b.title)
        return reply.code(400).send({ error: "Give the idea a title or pick a trend" });
      if (b.trendId != null) {
        const [t] = await app.db
          .select({ id: trendEntities.id })
          .from(trendEntities)
          .where(eq(trendEntities.id, b.trendId));
        if (!t) return reply.code(404).send({ error: "Unknown trend" });
        const [dup] = await app.db
          .select({ id: pipelineItems.id })
          .from(pipelineItems)
          .where(
            and(
              eq(pipelineItems.userId, req.user.sub),
              eq(pipelineItems.trendId, b.trendId),
              sql`stage <> 'dropped'`,
            ),
          );
        if (dup)
          return reply
            .code(409)
            .send({ error: "This trend is already in your pipeline", id: dup.id });
      }
      const stage = b.stage ?? "spotted";
      const [it] = await app.db
        .insert(pipelineItems)
        .values({
          userId: req.user.sub,
          trendId: b.trendId ?? null,
          title: b.title ?? null,
          stage,
          notes: b.notes ?? null,
          quotes: b.quotes ?? [],
        })
        .returning();
      await app.db
        .insert(pipelineEvents)
        .values({ itemId: it!.id, fromStage: null, toStage: stage });
      return reply.code(201).send({ id: it!.id });
    },
  );
  app.put(
    "/pipeline/:id",
    { preHandler: app.authenticate, schema: { params: id, body: pipeBody } },
    async (req, reply) => {
      const [cur] = await app.db
        .select()
        .from(pipelineItems)
        .where(and(eq(pipelineItems.id, req.params.id), eq(pipelineItems.userId, req.user.sub)));
      if (!cur) return reply.code(404).send({ error: "Not found" });
      const b = req.body;
      await app.db
        .update(pipelineItems)
        .set({
          ...(b.title !== undefined && { title: b.title }),
          ...(b.stage && { stage: b.stage }),
          ...(b.notes !== undefined && { notes: b.notes }),
          ...(b.quotes && { quotes: b.quotes }),
          ...(b.results !== undefined && { results: b.results }),
          updatedAt: new Date(),
        })
        .where(eq(pipelineItems.id, cur.id));
      if (b.stage && b.stage !== cur.stage)
        await app.db
          .insert(pipelineEvents)
          .values({ itemId: cur.id, fromStage: cur.stage, toStage: b.stage });
      return { ok: true };
    },
  );
  app.delete(
    "/pipeline/:id",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const r = await app.db
        .delete(pipelineItems)
        .where(and(eq(pipelineItems.id, req.params.id), eq(pipelineItems.userId, req.user.sub)))
        .returning({ id: pipelineItems.id });
      return r.length ? { ok: true } : reply.code(404).send({ error: "Not found" });
    },
  );
  app.get(
    "/pipeline/:id/events",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [cur] = await app.db
        .select({ id: pipelineItems.id })
        .from(pipelineItems)
        .where(and(eq(pipelineItems.id, req.params.id), eq(pipelineItems.userId, req.user.sub)));
      if (!cur) return reply.code(404).send({ error: "Not found" });
      return app.db
        .select()
        .from(pipelineEvents)
        .where(eq(pipelineEvents.itemId, cur.id))
        .orderBy(pipelineEvents.at);
    },
  );

  // ------------------------------------------------------------ predictions
  app.get("/predictions/summary", { preHandler: app.authenticate }, async () =>
    trackerSummary(app.db),
  );
  app.get(
    "/predictions",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: z.object({
          origin: z.enum(["live", "backtest"]).optional(),
          limit: z.coerce.number().min(1).max(300).default(100),
        }),
      },
    },
    async (req) => {
      const rows = await app.db
        .select({ p: predictions, name: trendEntities.name })
        .from(predictions)
        .innerJoin(trendEntities, eq(trendEntities.id, predictions.trendId))
        .where(req.query.origin ? eq(predictions.origin, req.query.origin) : undefined)
        .orderBy(desc(predictions.createdAt))
        .limit(req.query.limit);
      return rows.map(({ p, name }) => ({
        id: p.id,
        trendId: p.trendId,
        trend: name,
        origin: p.origin,
        isSample: p.isSample,
        predictedStage: p.predictedStage,
        actualStage: p.actualStage,
        hit: p.hit,
        stageError: p.stageError,
        horizonDate: p.horizonDate,
        confidence: p.confidence,
        createdAt: p.createdAt,
        resolvedAt: p.resolvedAt,
        basis: p.basis,
      }));
    },
  );
  app.post("/predictions/record", { preHandler: app.authenticate }, async () => ({
    recorded: await recordPredictions(app.db),
    resolved: await resolvePredictions(app.db),
  }));
  /** Replay the predictor on historical series (needs the workers process and analytics service). */
  app.post("/predictions/backtest", { preHandler: app.authenticate }, async (_req, reply) => {
    try {
      const job = await scoreQueue(app.config.REDIS_URL).add(
        "predictions-backtest",
        {},
        { attempts: 1 },
      );
      return { queued: true, jobId: job.id };
    } catch (e) {
      return reply.code(503).send({
        error: `Could not reach the job queue (is Redis running?): ${e instanceof Error ? e.message : e}`,
      });
    }
  });

  // ------------------------------------------------------------ reports
  app.get("/reports", { preHandler: app.authenticate }, async () =>
    app.db
      .select({
        id: reports.id,
        weekOf: reports.weekOf,
        mode: reports.mode,
        generatedAt: reports.generatedAt,
        emailedAt: reports.emailedAt,
      })
      .from(reports)
      .orderBy(desc(reports.weekOf), desc(reports.generatedAt))
      .limit(52),
  );
  app.get(
    "/reports/:id",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [r] = await app.db.select().from(reports).where(eq(reports.id, req.params.id));
      return r
        ? {
            id: r.id,
            weekOf: r.weekOf,
            mode: r.mode,
            generatedAt: r.generatedAt,
            emailedAt: r.emailedAt,
            report: r.payload as Report,
          }
        : reply.code(404).send({ error: "Not found" });
    },
  );
  app.post(
    "/reports/generate",
    {
      preHandler: app.authenticate,
      schema: { body: z.object({ mode: z.enum(["real", "sample"]).optional() }).default({}) },
    },
    async (req, reply) => {
      const g = await generateReport(app.db, { userId: req.user.sub, mode: req.body.mode });
      return reply.code(201).send({ id: g.id, report: g.report });
    },
  );
  app.get(
    "/reports/:id/pdf",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [r] = await app.db.select().from(reports).where(eq(reports.id, req.params.id));
      if (!r) return reply.code(404).send({ error: "Not found" });
      const buf = await renderReportPdf(r.payload as Report);
      reply.header(
        "content-disposition",
        `attachment; filename="trendbridge-report-${r.weekOf}.pdf"`,
      );
      return reply.type("application/pdf").send(buf);
    },
  );
  app.get(
    "/reports/:id/markdown",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [r] = await app.db.select().from(reports).where(eq(reports.id, req.params.id));
      if (!r) return reply.code(404).send({ error: "Not found" });
      reply.header(
        "content-disposition",
        `attachment; filename="trendbridge-report-${r.weekOf}.md"`,
      );
      return reply.type("text/markdown; charset=utf-8").send(reportToMarkdown(r.payload as Report));
    },
  );

  // ------------------------------------------------------------ CSV export
  app.get("/export/pipeline.csv", { preHandler: app.authenticate }, async (req, reply) => {
    const items = await app.db
      .select()
      .from(pipelineItems)
      .where(eq(pipelineItems.userId, req.user.sub));
    const names = new Map(
      (
        await app.db.select({ id: trendEntities.id, name: trendEntities.name }).from(trendEntities)
      ).map((t) => [t.id, t.name]),
    );
    return csv(
      reply,
      "pipeline.csv",
      toCsv(
        [
          { key: "title", label: "Idea" },
          { key: "stage", label: "Stage" },
          { key: "trend", label: "Trend" },
          { key: "notes", label: "Notes" },
          { key: "results", label: "Results" },
          { key: "updatedAt", label: "Updated" },
        ],
        items.map((i) => ({
          title: i.title ?? (i.trendId != null ? names.get(i.trendId) : "") ?? "",
          stage: i.stage,
          trend: i.trendId != null ? names.get(i.trendId) : "",
          notes: i.notes,
          results: i.results,
          updatedAt: i.updatedAt,
        })),
      ),
    );
  });
  app.get("/export/predictions.csv", { preHandler: app.authenticate }, async (_req, reply) => {
    const rows = await app.db
      .select({ p: predictions, name: trendEntities.name })
      .from(predictions)
      .innerJoin(trendEntities, eq(trendEntities.id, predictions.trendId))
      .orderBy(desc(predictions.createdAt))
      .limit(5000);
    return csv(
      reply,
      "predictions.csv",
      toCsv(
        [
          { key: "trend", label: "Trend" },
          { key: "origin", label: "Origin" },
          { key: "isSample", label: "Sample" },
          { key: "predicted", label: "Predicted stage" },
          { key: "actual", label: "Actual stage" },
          { key: "hit", label: "Result" },
          { key: "horizon", label: "Horizon" },
          { key: "confidence", label: "Confidence" },
        ],
        rows.map(({ p, name }) => ({
          trend: name,
          origin: p.origin,
          isSample: p.isSample,
          predicted: p.predictedStage,
          actual: p.actualStage,
          hit: p.hit,
          horizon: p.horizonDate,
          confidence: p.confidence,
        })),
      ),
    );
  });
};
