import {
  auditLog,
  listingsIndia,
  productReviews,
  productSnapshots,
  products,
  sources,
  trendEntities,
  trendSignalsTimeseries,
} from "@trendbridge/db";
import {
  IMPORT_TEMPLATES,
  containsTerm,
  importRequestSchema,
  type IndiaListingRow,
  type MarketplaceRow,
  type ReviewRow,
  type TimeseriesRow,
} from "@trendbridge/shared";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { parseImport } from "../lib-import";

export const importRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/import/templates", { preHandler: app.authenticate }, async () => IMPORT_TEMPLATES);

  app.post(
    "/import/validate",
    { preHandler: app.authenticate, schema: { body: importRequestSchema } },
    async (req) => {
      const p = parseImport(req.body.kind, req.body.format, req.body.text);
      return {
        total: p.total,
        valid: p.rows.length,
        errors: p.errors.slice(0, 50),
        preview: p.rows.slice(0, 5),
      };
    },
  );

  app.post(
    "/import/commit",
    { preHandler: app.authenticate, schema: { body: importRequestSchema } },
    async (req, reply) => {
      const { kind, format, text, sourceLabel } = req.body;
      const p = parseImport(kind, format, text);
      if (p.rows.length === 0)
        return reply
          .code(422)
          .send({ error: "No valid rows to import", errors: p.errors.slice(0, 20) });
      const [src] = await app.db.select().from(sources).where(eq(sources.key, "manual_import"));
      const sourceId = src?.id;
      let inserted = 0;
      const unmatched = new Set<string>();

      await app.db.transaction(async (tx) => {
        if (kind === "marketplace_products") {
          const ents = await tx
            .select({ id: trendEntities.id, name: trendEntities.name })
            .from(trendEntities)
            .where(eq(trendEntities.isSample, false));
          for (const r of p.rows as unknown as MarketplaceRow[]) {
            const title = String(r.title).toLowerCase();
            const hit = ents.find((e) => title.includes(e.name.toLowerCase()));
            const [prod] = await tx
              .insert(products)
              .values({
                trendId: hit?.id ?? null,
                marketplace: r.marketplace,
                countryCode: String(r.country).toUpperCase(),
                externalId: r.external_id,
                title: r.title,
                url: r.url || null,
                sourceId,
                confidence: 0.7,
              })
              .onConflictDoUpdate({
                target: [products.marketplace, products.externalId],
                set: { title: r.title, fetchedAt: new Date() },
              })
              .returning({ id: products.id });
            await tx.insert(productSnapshots).values({
              productId: prod!.id,
              price: r.price,
              currency: r.currency,
              rating: r.rating,
              reviewCount: r.review_count,
              bsr: r.rank,
              listType: r.list_type,
              categoryPath: r.category ?? null,
              sourceId,
              confidence: 0.7,
            });
            inserted++;
          }
        } else if (kind === "timeseries") {
          const ents = await tx
            .select({ id: trendEntities.id, name: trendEntities.name, slug: trendEntities.slug })
            .from(trendEntities)
            .where(eq(trendEntities.isSample, false));
          for (const r of p.rows as unknown as TimeseriesRow[]) {
            const key = String(r.trend).toLowerCase();
            const e = ents.find((x) => x.slug === key || x.name.toLowerCase() === key);
            if (!e) {
              unmatched.add(String(r.trend));
              continue;
            }
            await tx
              .insert(trendSignalsTimeseries)
              .values({
                trendId: e.id,
                countryCode: String(r.country).toUpperCase(),
                metric: r.metric,
                weekStart: r.week_start,
                value: r.value,
                isEstimated: false,
                method: `manual import: ${sourceLabel}`,
                sourceId,
                confidence: 0.7,
              })
              .onConflictDoUpdate({
                target: [
                  trendSignalsTimeseries.trendId,
                  trendSignalsTimeseries.countryCode,
                  trendSignalsTimeseries.metric,
                  trendSignalsTimeseries.weekStart,
                ],
                set: { value: sql`excluded.value`, fetchedAt: new Date() },
              });
            inserted++;
          }
        } else {
          const ents = await tx
            .select({ id: trendEntities.id, name: trendEntities.name, slug: trendEntities.slug })
            .from(trendEntities)
            .where(eq(trendEntities.isSample, false));
          const byKey = (k: string) =>
            ents.find(
              (x) => x.slug === k.toLowerCase() || x.name.toLowerCase() === k.toLowerCase(),
            );
          if (kind === "reviews") {
            for (const r of p.rows as unknown as ReviewRow[]) {
              const e = byKey(r.trend);
              if (!e) {
                unmatched.add(r.trend);
                continue;
              }
              const hash = createHash("sha1").update(`${r.source}|${r.text}`).digest("hex");
              const res = await tx
                .insert(productReviews)
                .values({
                  trendId: e.id,
                  source: r.source,
                  rating: r.rating,
                  reviewText: r.text,
                  reviewedAt: r.date || null,
                  textHash: hash,
                })
                .onConflictDoNothing()
                .returning({ id: productReviews.id });
              inserted += res.length;
            }
          } else {
            for (const r of p.rows as unknown as IndiaListingRow[]) {
              const e = r.trend ? byKey(r.trend) : ents.find((x) => containsTerm(r.title, x.name));
              if (r.trend && !e) unmatched.add(r.trend);
              await tx
                .insert(listingsIndia)
                .values({
                  trendId: e?.id ?? null,
                  marketplace: r.marketplace,
                  externalId: r.external_id,
                  title: r.title,
                  priceInr: r.price_inr,
                  rating: r.rating,
                  reviewCount: r.review_count,
                  url: r.url || null,
                  sourceId,
                  confidence: 0.7,
                })
                .onConflictDoUpdate({
                  target: [listingsIndia.marketplace, listingsIndia.externalId],
                  set: {
                    title: r.title,
                    priceInr: r.price_inr,
                    rating: r.rating,
                    reviewCount: r.review_count,
                    trendId: e?.id ?? null,
                    fetchedAt: new Date(),
                  },
                });
              inserted++;
            }
          }
        }
        await tx.insert(auditLog).values({
          actor: req.user.email,
          action: "manual_import",
          sourceKey: "manual_import",
          detail: { kind, rows: p.total, inserted, label: sourceLabel },
        });
      });
      if (src)
        await app.db
          .update(sources)
          .set({ lastSuccessAt: new Date() })
          .where(eq(sources.id, src.id));
      return {
        inserted,
        skippedInvalid: p.errors.length,
        unmatchedTrends: [...unmatched],
        errors: p.errors.slice(0, 20),
      };
    },
  );
};
