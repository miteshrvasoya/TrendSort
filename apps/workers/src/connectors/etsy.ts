import { productSnapshots, products, trackedKeywords } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import type { Connector } from "../framework/types";
import { activeKeywords } from "../lib/keywords";
import { sourceIdOf } from "../lib/source";
import fixture from "../fixtures/etsy.json";

export interface EtsyListing {
  listing_id: number;
  title: string;
  url: string;
  price: { amount: number; divisor: number; currency_code: string };
  views?: number;
  num_favorers?: number;
  images?: { url_170x135?: string }[];
}
export interface Raw {
  trendId: number;
  term: string;
  listings: EtsyListing[];
}
export interface Item {
  trendId: number;
  term: string;
  position: number;
  externalId: string;
  title: string;
  price: number | null;
  currency: string;
  url: string;
  imageUrl: string | null;
  views: number | null;
  favorers: number | null;
}

const MAX_KEYWORDS = 10;
const API = "https://openapi.etsy.com/v3/application/listings/active";

/**
 * Etsy Open API v3 (official, free key; Etsy approves keys manually). Searches active listings for the keywords of
 * your tracked gift trends. Search position is relevance order, NOT sales rank, so it is stored as metrics.position
 * and never as a best-seller rank. Without a key a live run fails with a clear message and writes nothing.
 */
export const etsy: Connector<Raw, Item> = {
  key: "etsy",
  name: "Etsy Open API v3",
  rateLimit: { calls: 5000, windowMs: 86_400_000 },
  costPerCall: 0,
  reliabilityScore: 0.85,
  scraped: false,
  termsNote: "Official API; free key needs Etsy approval. Listing facts only, linked back to Etsy.",

  async fetch(ctx) {
    if (ctx.fixtureMode) return fixture as Raw[];
    const key = process.env.ETSY_API_KEY;
    if (!key)
      throw new Error(
        "ETSY_API_KEY is not set. Get a free key at https://www.etsy.com/developers (approval can take days) and add it to .env.",
      );
    const kws = await activeKeywords(ctx.db, MAX_KEYWORDS, { vertical: "gifts" });
    const out: Raw[] = [];
    for (const k of kws) {
      const url = `${API}?keywords=${encodeURIComponent(k.term)}&limit=12&sort_on=score&includes=Images`;
      const body = await ctx.http.json<{ results?: EtsyListing[] }>(url, {
        headers: { "x-api-key": key },
        skipRobots: true,
      });
      out.push({ trendId: k.trendId, term: k.term, listings: body.results ?? [] });
    }
    return out;
  },

  normalize: (raw) =>
    raw.flatMap((r) =>
      r.listings.map((l, i) => ({
        trendId: r.trendId,
        term: r.term,
        position: i + 1,
        externalId: String(l.listing_id),
        title: l.title,
        price: l.price?.divisor ? l.price.amount / l.price.divisor : null,
        currency: l.price?.currency_code ?? "USD",
        url: l.url,
        imageUrl: l.images?.[0]?.url_170x135 ?? null,
        views: l.views ?? null,
        favorers: l.num_favorers ?? null,
      })),
    ),

  async persist(ctx, items) {
    const sourceId = await sourceIdOf(ctx.db, "etsy");
    for (const it of items) {
      const [p] = await ctx.db
        .insert(products)
        .values({
          trendId: it.trendId,
          marketplace: "etsy",
          countryCode: "US",
          externalId: it.externalId,
          title: it.title,
          imageUrl: it.imageUrl,
          url: it.url,
          sourceId,
          confidence: 0.85,
        })
        .onConflictDoUpdate({
          target: [products.marketplace, products.externalId],
          set: { title: it.title, trendId: it.trendId, fetchedAt: new Date() },
        })
        .returning({ id: products.id });
      await ctx.db.insert(productSnapshots).values({
        productId: p!.id,
        price: it.price,
        currency: it.currency,
        listType: "search",
        categoryPath: it.term,
        sourceId,
        confidence: 0.85,
        metrics: { position: it.position, views: it.views, favorers: it.favorers },
      });
    }
    for (const id of new Set(items.map((i) => i.trendId)))
      await ctx.db
        .update(trackedKeywords)
        .set({ lastFetchedAt: new Date() })
        .where(eq(trackedKeywords.trendId, id));
  },

  async healthCheck(ctx) {
    const key = process.env.ETSY_API_KEY;
    if (!key) return { ok: false, detail: "ETSY_API_KEY not set" };
    try {
      const r = await ctx.http.get("https://openapi.etsy.com/v3/application/openapi-ping", {
        headers: { "x-api-key": key },
        skipRobots: true,
      });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};
