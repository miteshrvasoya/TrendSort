import { auditLog, rateLimitUsage, sourceRuns, sources } from "@trendbridge/db";
import { confidenceFromScore } from "@trendbridge/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ingestQueue } from "../queue";

/** Sources that have a working connector or import path in this version. */
export const IMPLEMENTED = new Set([
  "ecb_fx",
  "google_trends",
  "google_trends_rss",
  "google_news_rss",
  "trade_press_rss",
  "amazon_bestsellers",
  "manual_import",
  "festival_calendar",
  "sample_seed",
]);
const RUNNABLE = new Set([
  "ecb_fx",
  "google_trends",
  "google_trends_rss",
  "google_news_rss",
  "trade_press_rss",
  "amazon_bestsellers",
]);

export const sourceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/sources", { preHandler: app.authenticate }, async () => {
    const rows = await app.db.select().from(sources).orderBy(sources.phase, sources.name);
    const today = new Date().toISOString().slice(0, 10);
    const usage = await app.db.select().from(rateLimitUsage).where(eq(rateLimitUsage.day, today));
    const usageBy = new Map(usage.map((u) => [u.sourceId, u.calls]));
    const stale = Date.now() - 36 * 3600_000;
    return rows.map((s) => {
      const implemented = IMPLEMENTED.has(s.key);
      let status: string;
      if (!implemented) status = "not_built_yet";
      else if (!s.enabled) status = "disabled";
      else if (s.circuitState === "open") status = "circuit_open";
      else if (s.lastSuccessAt) status = s.lastSuccessAt.getTime() < stale ? "stale" : "healthy";
      else status = s.method === "static" || s.method === "manual" ? "static" : "never_run";
      return {
        ...s,
        status,
        implemented,
        runnable: RUNNABLE.has(s.key),
        usedToday: usageBy.get(s.id) ?? 0,
        confidenceLevel: confidenceFromScore(s.reliability, s.key === "sample_seed"),
        costInr: 0,
      };
    });
  });

  app.get("/sources/runs", { preHandler: app.authenticate }, async () =>
    app.db
      .select({
        id: sourceRuns.id,
        source: sources.key,
        status: sourceRuns.status,
        startedAt: sourceRuns.startedAt,
        items: sourceRuns.itemCount,
        error: sourceRuns.error,
      })
      .from(sourceRuns)
      .innerJoin(sources, eq(sources.id, sourceRuns.sourceId))
      .orderBy(desc(sourceRuns.startedAt))
      .limit(50),
  );

  app.patch(
    "/sources/:key",
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ key: z.string() }), body: z.object({ enabled: z.boolean() }) },
    },
    async (req, reply) => {
      const [s] = await app.db
        .update(sources)
        .set({ enabled: req.body.enabled, ...(req.body.enabled ? { circuitState: "closed" } : {}) })
        .where(eq(sources.key, req.params.key))
        .returning();
      if (!s) return reply.code(404).send({ error: "Unknown source" });
      await app.db.insert(auditLog).values({
        actor: req.user.email,
        action: req.body.enabled ? "source_enabled" : "source_disabled",
        sourceKey: s.key,
      });
      return { key: s.key, enabled: s.enabled };
    },
  );

  /** Queue a run on the worker. Needs Redis + the workers process. */
  app.post(
    "/sources/:key/run",
    { preHandler: app.authenticate, schema: { params: z.object({ key: z.string() }) } },
    async (req, reply) => {
      if (!RUNNABLE.has(req.params.key))
        return reply.code(400).send({ error: "This source has no connector to run" });
      try {
        const job = await ingestQueue(app.config.REDIS_URL).add(
          "ingest",
          { sourceKey: req.params.key },
          { attempts: 1 },
        );
        await app.db
          .insert(auditLog)
          .values({ actor: req.user.email, action: "run_requested", sourceKey: req.params.key });
        return { queued: true, jobId: job.id };
      } catch (e) {
        return reply.code(503).send({
          error: `Could not reach the job queue (is Redis running?): ${e instanceof Error ? e.message : e}`,
        });
      }
    },
  );
};
