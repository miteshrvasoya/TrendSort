import {
  countries,
  scores,
  trendEntities,
  trendSignalsTimeseries,
  categories,
} from "@trendbridge/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export const trendRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/trends",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: z.object({
          vertical: z.string().optional(),
          q: z.string().optional(),
          limit: z.coerce.number().min(1).max(200).default(100),
        }),
      },
    },
    async (req) => {
      const { vertical, q, limit } = req.query;
      const rows = await app.db.execute(sql`
      select t.id, t.slug, t.name, t.description, t.sub_category as "subCategory", c.name as category, t.vertical_keys as "verticalKeys",
             t.occasion_keys as "occasionKeys", t.price_band_inr as "priceBandInr", t.is_sample as "isSample",
             s.momentum, s.breadth, s.sustainability, s.commercial_proof as "commercialProof", s.opportunity,
             s.adoption_stage as "adoptionStage", s.lag_months as "lagMonths", s.confidence, s.algorithm_version as "algorithmVersion"
      from trend_entities t
      left join categories c on c.id = t.category_id
      left join lateral (select * from scores where trend_id = t.id order by computed_at desc limit 1) s on true
      where (${vertical ?? null}::text is null or t.vertical_keys ? ${vertical ?? ""})
        and (${q ?? null}::text is null or t.name ilike ${"%" + (q ?? "") + "%"})
      order by s.opportunity desc nulls last
      limit ${limit}`);
      return rows.rows;
    },
  );

  app.get(
    "/trends/:id",
    { preHandler: app.authenticate, schema: { params: z.object({ id: z.coerce.number() }) } },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id))
        .limit(1);
      if (!t) return reply.code(404).send({ error: "Not found" });
      const [cat] = t.categoryId
        ? await app.db.select().from(categories).where(eq(categories.id, t.categoryId))
        : [];
      const [score] = await app.db
        .select()
        .from(scores)
        .where(eq(scores.trendId, t.id))
        .orderBy(desc(scores.computedAt))
        .limit(1);
      const rest = { ...t, embedding: undefined };
      return { ...rest, category: cat?.name ?? null, score: score ?? null };
    },
  );

  app.get(
    "/trends/:id/series",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ id: z.coerce.number() }),
        querystring: z.object({ metric: z.string().default("search_interest") }),
      },
    },
    async (req) => {
      const rows = await app.db
        .select({
          country: trendSignalsTimeseries.countryCode,
          week: trendSignalsTimeseries.weekStart,
          value: trendSignalsTimeseries.value,
          isSample: trendSignalsTimeseries.isSample,
          isEstimated: trendSignalsTimeseries.isEstimated,
        })
        .from(trendSignalsTimeseries)
        .where(
          and(
            eq(trendSignalsTimeseries.trendId, req.params.id),
            eq(trendSignalsTimeseries.metric, req.query.metric),
          ),
        )
        .orderBy(asc(trendSignalsTimeseries.weekStart));
      const names = await app.db.select().from(countries);
      return { countries: names, points: rows };
    },
  );
};
