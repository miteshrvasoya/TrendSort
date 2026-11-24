import { rateLimitUsage, sourceRuns, sources } from "@trendbridge/db";
import { confidenceFromScore } from "@trendbridge/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const sourceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/sources", { preHandler: app.authenticate }, async () => {
    const rows = await app.db.select().from(sources).orderBy(sources.phase, sources.name);
    const today = new Date().toISOString().slice(0, 10);
    const usage = await app.db.select().from(rateLimitUsage).where(eq(rateLimitUsage.day, today));
    const usageBy = new Map(usage.map((u) => [u.sourceId, u.calls]));
    const stale = Date.now() - 36 * 3600_000;
    return rows.map((s) => {
      const used = usageBy.get(s.id) ?? 0;
      const live = s.phase === 0 && s.key === "ecb_fx";
      let status: string;
      if (!s.enabled) status = "disabled";
      else if (s.circuitState === "open") status = "circuit_open";
      else if (s.lastSuccessAt) status = s.lastSuccessAt.getTime() < stale ? "stale" : "healthy";
      else status = live ? "never_run" : s.method === "static" ? "static" : "not_built_yet";
      return {
        ...s,
        status,
        usedToday: used,
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

  app.get("/sources/summary", { preHandler: app.authenticate }, async () => {
    const [r] = await app.db
      .select({
        total: sql<number>`count(*)::int`,
        scraped: sql<number>`count(*) filter (where scraped)::int`,
      })
      .from(sources);
    return r;
  });
};
