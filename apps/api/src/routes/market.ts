import {
  listingsIndia,
  productFit,
  productReviews,
  products,
  trendEntities,
  categories,
} from "@trendbridge/db";
import {
  analyseReviews,
  detectBrands,
  fitScores,
  inferFitAttrs,
  lagGroupFor,
  runFitChecks,
  type FitAttrs,
} from "@trendbridge/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { loadVertical } from "../lib-verticals";

const id = z.object({ id: z.coerce.number() });
const fitSchema = z.object({
  electrical: z.boolean(),
  wireless: z.boolean(),
  battery: z.boolean(),
  foodContact: z.boolean(),
  cosmetic: z.boolean(),
  waterRelated: z.boolean(),
  animalDerived: z.boolean(),
  liquidOrHazmat: z.boolean(),
  fragile: z.boolean(),
  festiveColourSensitive: z.boolean(),
  size: z.enum(["small", "medium", "large"]),
});

export const marketRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Review themes from reviews you imported. Rule-based (no LLM): praise, complaints, improvement hints. */
  app.get(
    "/trends/:id/reviews",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req) => {
      const rows = await app.db
        .select({
          rating: productReviews.rating,
          text: productReviews.reviewText,
          source: productReviews.source,
        })
        .from(productReviews)
        .where(eq(productReviews.trendId, req.params.id));
      const sources = [...new Set(rows.map((r) => r.source))];
      return {
        analysis: analyseReviews(rows),
        sources,
        method: "keyword themes, counted once per review, negation-aware (no AI)",
      };
    },
  );

  /** India listings found for this trend, plus how much India data we actually have (absence is not proof of no competition). */
  app.get(
    "/trends/:id/india-listings",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req) => {
      const rows = await app.db
        .select()
        .from(listingsIndia)
        .where(eq(listingsIndia.trendId, req.params.id))
        .orderBy(desc(listingsIndia.reviewCount));
      const [cov] = await app.db
        .select({ n: sql<number>`count(*)::int`, last: sql<string | null>`max(fetched_at)` })
        .from(listingsIndia);
      const prices = rows
        .map((r) => r.priceInr)
        .filter((x): x is number => x != null)
        .sort((a, b) => a - b);
      return {
        listings: rows.map((r) => ({
          id: r.id,
          marketplace: r.marketplace,
          title: r.title,
          priceInr: r.priceInr,
          rating: r.rating,
          reviewCount: r.reviewCount,
          url: r.url,
          fetchedAt: r.fetchedAt,
        })),
        count: rows.length,
        priceRange: prices.length
          ? { min: prices[0]!, median: prices[Math.floor(prices.length / 2)]!, max: prices.at(-1)! }
          : null,
        indiaDataRows: cov?.n ?? 0,
        indiaDataAt: cov?.last ?? null,
        verdict:
          rows.length > 0
            ? "listings_found"
            : (cov?.n ?? 0) > 0
              ? "none_found_in_scanned_lists"
              : "not_checked",
        caveat:
          "Only top-of-category lists (and listings you import) are scanned. 'No match' means none in those, not that nobody sells it. Search Amazon.in and Flipkart yourself and import what you find.",
      };
    },
  );

  /** Fit checklist from the saved attributes, or from heuristics (clearly marked) if you have not saved any. */
  app.get(
    "/trends/:id/fit",
    { preHandler: app.authenticate, schema: { params: id } },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id));
      if (!t) return reply.code(404).send({ error: "Not found" });
      const cat = t.categoryId
        ? ((await app.db.select().from(categories).where(eq(categories.id, t.categoryId)))[0]
            ?.name ?? null)
        : null;
      const titles = (
        await app.db
          .select({ title: products.title })
          .from(products)
          .where(eq(products.trendId, t.id))
          .limit(30)
      ).map((r) => r.title);
      const inferred = inferFitAttrs(lagGroupFor(cat, t.name), t.name, titles);
      const [saved] = await app.db.select().from(productFit).where(eq(productFit.trendId, t.id));
      const attrs = (saved?.attrs as FitAttrs | undefined) ?? inferred;
      const brandHits = detectBrands(titles);
      const checks = runFitChecks(attrs, brandHits);
      // vertical-specific notes come from the vertical configs (informational: they do not change the score)
      for (const vk of t.verticalKeys) {
        const vc = await loadVertical(app, vk);
        for (const n of vc?.effective.indiaFitNotes ?? [])
          checks.push({
            key: `${vk}:${n.key}`,
            title: n.title,
            status: n.status,
            detail: n.detail,
            verifyWith: n.verifyWith,
            penalty: 0,
          });
      }
      return {
        saved: !!saved,
        attrs,
        inferred,
        brandHits,
        checks,
        scores: fitScores(checks, attrs),
        disclaimer:
          "A checklist of things to verify, not legal advice or a clearance. Rules change; confirm with the named body.",
      };
    },
  );

  app.put(
    "/trends/:id/fit",
    { preHandler: app.authenticate, schema: { params: id, body: fitSchema } },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id));
      if (!t) return reply.code(404).send({ error: "Not found" });
      if (t.isSample) return reply.code(400).send({ error: "Sample trends cannot be edited" });
      await app.db
        .insert(productFit)
        .values({ trendId: t.id, attrs: req.body, isSample: false })
        .onConflictDoUpdate({
          target: productFit.trendId,
          set: { attrs: req.body, updatedAt: new Date() },
        });
      return { ok: true };
    },
  );
};
