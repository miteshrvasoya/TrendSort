import { backtestCases, scores, trendEntities } from "@trendbridge/db";
import {
  ALGORITHM_VERSION,
  COMPONENT_INFO,
  COMPONENT_KEYS,
  DEFAULT_WEIGHTS,
  normaliseWeights,
} from "@trendbridge/shared";
import { users } from "@trendbridge/db";
import { desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { isCustom, opportunityFor, userWeights } from "../lib-scores";
import { scoreQueue } from "../queue";

const weightsBody = z.object(
  Object.fromEntries(COMPONENT_KEYS.map((k) => [k, z.number().min(0).max(1)])) as Record<
    (typeof COMPONENT_KEYS)[number],
    z.ZodNumber
  >,
);

export const scoringRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/settings/weights", { preHandler: app.authenticate }, async (req) => {
    const weights = await userWeights(app.db, req.user.sub);
    return {
      weights,
      defaults: DEFAULT_WEIGHTS,
      custom: isCustom(weights),
      info: COMPONENT_INFO,
      algorithmVersion: ALGORITHM_VERSION,
    };
  });

  app.put(
    "/settings/weights",
    { preHandler: app.authenticate, schema: { body: weightsBody } },
    async (req) => {
      const weights = normaliseWeights(req.body);
      const [u] = await app.db
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, req.user.sub));
      await app.db
        .update(users)
        .set({ settings: { ...(u?.settings as object), weights } })
        .where(eq(users.id, req.user.sub));
      return { weights, custom: isCustom(weights) };
    },
  );

  app.delete("/settings/weights", { preHandler: app.authenticate }, async (req) => {
    const [u] = await app.db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, req.user.sub));
    const rest = { ...((u?.settings ?? {}) as Record<string, unknown>) };
    delete rest.weights;
    await app.db.update(users).set({ settings: rest }).where(eq(users.id, req.user.sub));
    return { weights: DEFAULT_WEIGHTS, custom: false };
  });

  /** Everything needed to explain a score: components, weights, contributions, confidence parts, lag details, history. */
  app.get(
    "/trends/:id/score",
    { preHandler: app.authenticate, schema: { params: z.object({ id: z.coerce.number() }) } },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id));
      if (!t) return reply.code(404).send({ error: "Not found" });
      const hist = await app.db
        .select()
        .from(scores)
        .where(eq(scores.trendId, t.id))
        .orderBy(desc(scores.computedAt))
        .limit(30);
      const latest = hist[0];
      if (!latest) return { scored: false, isSample: t.isSample };
      const weights = await userWeights(app.db, req.user.sub);
      const opp = opportunityFor(latest.inputs, weights);
      return {
        scored: true,
        isSample: latest.isSample,
        algorithmVersion: latest.algorithmVersion,
        computedAt: latest.computedAt,
        momentum: latest.momentum,
        breadth: latest.breadth,
        sustainability: latest.sustainability,
        commercialProof: latest.commercialProof,
        adoptionStage: latest.adoptionStage,
        lagMonths: latest.lagMonths,
        confidence: latest.confidence,
        opportunity: opp?.score ?? latest.opportunity,
        defaultOpportunity: latest.opportunity,
        customWeights: isCustom(weights),
        weights,
        defaults: DEFAULT_WEIGHTS,
        info: COMPONENT_INFO,
        explain: opp,
        inputs: latest.inputs,
        history: hist
          .map((h) => ({
            at: h.computedAt,
            opportunity: h.opportunity,
            momentum: h.momentum,
            stage: h.adoptionStage,
          }))
          .reverse(),
      };
    },
  );

  /** Queue scoring (all trends or one). Needs Redis, the workers process and the analytics service. */
  app.post(
    "/scores/run",
    {
      preHandler: app.authenticate,
      schema: { body: z.object({ trendId: z.number().optional() }).default({}) },
    },
    async (req, reply) => {
      try {
        const job = await scoreQueue(app.config.REDIS_URL).add(
          "score",
          { trendIds: req.body.trendId ? [req.body.trendId] : undefined },
          { attempts: 1 },
        );
        return { queued: true, jobId: job.id };
      } catch (e) {
        return reply.code(503).send({
          error: `Could not reach the job queue (is Redis running?): ${e instanceof Error ? e.message : e}`,
        });
      }
    },
  );

  app.get("/backtest", { preHandler: app.authenticate }, async () => {
    const rows = await app.db
      .select()
      .from(backtestCases)
      .orderBy(backtestCases.group, backtestCases.name);
    const med = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y);
      const m = Math.floor(s.length / 2);
      return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : null;
    };
    const groups = [...new Set(rows.map((r) => r.group))].map((g) => {
      const cs = rows.filter((r) => r.group === g);
      const eff = cs.map((c) => c.measuredLagMonths ?? c.estimatedLagMonths);
      return {
        group: g,
        n: cs.length,
        medianLagMonths: med(eff),
        measured: cs.filter((c) => c.measuredLagMonths != null).length,
      };
    });
    return {
      cases: rows,
      groups,
      note: "Lags are analyst estimates until measured with the measure-lag job; estimates are approximate (+/- 6 months) and need your verification.",
    };
  });
};
