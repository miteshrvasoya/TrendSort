import {
  auditLog,
  categories,
  countries,
  newsItems,
  products,
  scores,
  trackedKeywords,
  trendEntities,
  trendSignalsTimeseries,
} from "@trendbridge/db";
import { createTrendSchema } from "@trendbridge/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
const id = z.object({ id: z.coerce.number() });

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
          data: z.enum(["all", "sample", "real"]).default("all"),
          status: z.enum(["tracked", "candidate"]).optional(),
        }),
      },
    },
    async (req) => {
      const { vertical, q, limit, data, status } = req.query;
      const rows = await app.db.execute(sql`
      select t.id, t.slug, t.name, t.description, t.sub_category as "subCategory", c.name as category, t.vertical_keys as "verticalKeys",
             t.occasion_keys as "occasionKeys", t.price_band_inr as "priceBandInr", t.is_sample as "isSample", t.status, t.origin,
             s.momentum, s.breadth, s.sustainability, s.commercial_proof as "commercialProof", s.opportunity,
             s.adoption_stage as "adoptionStage", s.lag_months as "lagMonths", s.confidence, s.algorithm_version as "algorithmVersion",
             (select count(*)::int from news_items n where n.trend_id = t.id) as "newsCount",
             (select count(*)::int from products p where p.trend_id = t.id) as "productCount",
             (select max(fetched_at) from trend_signals_timeseries x where x.trend_id = t.id and not x.is_sample) as "lastSignalAt"
      from trend_entities t
      left join categories c on c.id = t.category_id
      left join lateral (select * from scores where trend_id = t.id order by computed_at desc limit 1) s on true
      where (${vertical ?? null}::text is null or t.vertical_keys ? ${vertical ?? ""})
        and (${q ?? null}::text is null or t.name ilike ${"%" + (q ?? "") + "%"})
        and (${data}::text = 'all' or (${data}::text = 'sample' and t.is_sample) or (${data}::text = 'real' and not t.is_sample))
        and (${status ?? null}::text is null or t.status = ${status ?? ""})
      order by s.opportunity desc nulls last, t.id desc
      limit ${limit}`);
      return rows.rows;
    },
  );

  /** Track a new trend: creates the entity and its Google Trends keywords. */
  app.post(
    "/trends",
    { preHandler: app.authenticate, schema: { body: createTrendSchema } },
    async (req, reply) => {
      const b = req.body;
      const slug = slugify(b.name);
      const [dup] = await app.db
        .select({ id: trendEntities.id })
        .from(trendEntities)
        .where(eq(trendEntities.slug, slug));
      if (dup) return reply.code(409).send({ error: "A trend with this name already exists" });
      let categoryId: number | null = null;
      if (b.category) {
        const cs = slugify(b.category);
        await app.db
          .insert(categories)
          .values({ slug: cs, name: b.category })
          .onConflictDoNothing();
        categoryId =
          (await app.db.select().from(categories).where(eq(categories.slug, cs)))[0]?.id ?? null;
      }
      const [t] = await app.db
        .insert(trendEntities)
        .values({
          slug,
          name: b.name,
          categoryId,
          verticalKeys: b.verticals,
          status: "tracked",
          origin: "user",
          confidence: 0.5,
          isSample: false,
        })
        .returning();
      await app.db
        .insert(trackedKeywords)
        .values(b.keywords.map((term) => ({ trendId: t!.id, term, geos: b.geos })));
      await app.db.insert(auditLog).values({
        actor: req.user.email,
        action: "trend_created",
        detail: { id: t!.id, name: b.name },
      });
      return reply.code(201).send({ id: t!.id, slug });
    },
  );

  /** Promote an auto-created candidate to a tracked trend (adds its name as a keyword). */
  app.post(
    "/trends/:id/approve",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [t] = await app.db
        .update(trendEntities)
        .set({ status: "tracked" })
        .where(and(eq(trendEntities.id, req.params.id), eq(trendEntities.isSample, false)))
        .returning();
      if (!t) return reply.code(404).send({ error: "Not found" });
      await app.db
        .insert(trackedKeywords)
        .values({ trendId: t.id, term: t.name.toLowerCase() })
        .onConflictDoNothing();
      return { ok: true };
    },
  );

  app.delete(
    "/trends/:id",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id));
      if (!t) return reply.code(404).send({ error: "Not found" });
      if (t.isSample) return reply.code(400).send({ error: "Sample trends cannot be deleted" });
      await app.db.update(newsItems).set({ trendId: null }).where(eq(newsItems.trendId, t.id));
      await app.db.update(products).set({ trendId: null }).where(eq(products.trendId, t.id));
      await app.db.delete(trendEntities).where(eq(trendEntities.id, t.id));
      return { ok: true };
    },
  );

  app.get(
    "/trends/:id",
    { preHandler: app.authenticate, schema: { params: id } },
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
      const keywords = await app.db
        .select()
        .from(trackedKeywords)
        .where(eq(trackedKeywords.trendId, t.id));
      const rest = { ...t, embedding: undefined };
      return { ...rest, category: cat?.name ?? null, score: score ?? null, keywords };
    },
  );

  app.get(
    "/trends/:id/series",
    {
      preHandler: app.authenticate,
      schema: {
        params: id,
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
          method: trendSignalsTimeseries.method,
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

  app.get(
    "/trends/:id/news",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req) =>
      app.db
        .select({
          id: newsItems.id,
          headline: newsItems.headline,
          publisher: newsItems.publisher,
          publishedAt: newsItems.publishedAt,
          url: newsItems.url,
          fetchedAt: newsItems.fetchedAt,
        })
        .from(newsItems)
        .where(eq(newsItems.trendId, req.params.id))
        .orderBy(desc(newsItems.publishedAt))
        .limit(50),
  );

  /** Latest marketplace snapshot per product, with rank change vs the previous snapshot. */
  app.get(
    "/trends/:id/products",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req) => {
      const rows = await app.db.execute(sql`
      select p.id, p.marketplace, p.country_code as "country", p.title, p.url, p.image_url as "imageUrl", p.external_id as "externalId",
             s.price, s.currency, s.rating, s.review_count as "reviewCount", s.bsr as rank, s.list_type as "listType", s.fetched_at as "fetchedAt", s.confidence,
             prev.bsr as "prevRank", p.source_id is not null and (select scraped from sources where id = p.source_id) as scraped
      from products p
      join lateral (select * from product_snapshots where product_id = p.id order by fetched_at desc limit 1) s on true
      left join lateral (select bsr from product_snapshots where product_id = p.id order by fetched_at desc offset 1 limit 1) prev on true
      where p.trend_id = ${req.params.id} order by s.bsr asc nulls last limit 50`);
      return rows.rows;
    },
  );

  app.get("/news", { preHandler: app.authenticate }, async () =>
    app.db
      .select({
        id: newsItems.id,
        trendId: newsItems.trendId,
        headline: newsItems.headline,
        publisher: newsItems.publisher,
        publishedAt: newsItems.publishedAt,
        url: newsItems.url,
      })
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(40),
  );
};
