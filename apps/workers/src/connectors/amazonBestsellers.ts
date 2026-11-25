import { listingsIndia, productSnapshots, products } from "@trendbridge/db";
import * as cheerio from "cheerio";
import { deriveTerm, findOrCreateCandidate, loadEntityIndex, matchEntity } from "../lib/entities";
import { sourceIdOf } from "../lib/source";
import type { Connector } from "../framework/types";
import fixture from "../fixtures/amazon-bestsellers.json";

export type ListType =
  "bestsellers" | "new-releases" | "movers-and-shakers" | "most-gifted" | "most-wished-for";
export interface PageRaw {
  country: string;
  host: string;
  listType: ListType;
  category: string;
  html: string;
}
export interface Item {
  marketplace: string;
  country: string;
  listType: ListType;
  category: string;
  rank: number;
  asin: string;
  title: string;
  price: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  url: string;
}

const COUNTRY_HOSTS: Record<string, { host: string; currency: string }> = {
  US: { host: "www.amazon.com", currency: "USD" },
  GB: { host: "www.amazon.co.uk", currency: "GBP" },
  DE: { host: "www.amazon.de", currency: "EUR" },
  AE: { host: "www.amazon.ae", currency: "AED" },
  AU: { host: "www.amazon.com.au", currency: "AUD" },
  JP: { host: "www.amazon.co.jp", currency: "JPY" },
  IN: { host: "www.amazon.in", currency: "INR" },
};
/** Top-level list pages only (low frequency). Category-specific pages can be added later via config. */
const TARGETS = [
  ...(["US", "GB", "AE", "IN"] as const).flatMap((c) =>
    (["bestsellers", "new-releases", "movers-and-shakers"] as const).map((l) => ({
      country: c,
      listType: l,
    })),
  ),
  // gift signals: what people actually buy for others / save on wish lists
  ...(["US", "GB"] as const).flatMap((c) =>
    (["most-gifted", "most-wished-for"] as const).map((l) => ({ country: c, listType: l })),
  ),
];

function money(s: string): number | null {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]!) : null;
}
const num = (s: string | undefined) => {
  const m = (s ?? "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]!) : null;
};

/** Best-effort parser for Amazon list pages. Markup changes often; failures yield 0 items and a clear error, never fake data. */
export function parseListPage(p: PageRaw): Item[] {
  const $ = cheerio.load(p.html);
  const out: Item[] = [];
  const cur = COUNTRY_HOSTS[p.country]?.currency ?? "USD";
  const seen = new Set<string>();
  const roots = $("[id=gridItemRoot]").length
    ? $("[id=gridItemRoot]")
    : $(".zg-grid-general-faceout, li.zg-item-immersion");
  roots.each((i, el) => {
    const root = $(el);
    const link = root.find("a[href*='/dp/']").first();
    const href = link.attr("href") ?? "";
    const asin =
      /\/dp\/([A-Z0-9]{10})/.exec(href)?.[1] ?? root.find("[data-asin]").attr("data-asin") ?? "";
    if (!asin || seen.has(asin)) return;
    seen.add(asin);
    const rank = num(root.find(".zg-bdg-text").first().text()) ?? i + 1;
    const img = root.find("img").first();
    const title = (
      img.attr("alt") ??
      root.find("[class*='line-clamp']").first().text() ??
      ""
    ).trim();
    if (!title) return;
    out.push({
      marketplace: `amazon_${p.country.toLowerCase()}`,
      country: p.country,
      listType: p.listType,
      category: p.category,
      rank,
      asin,
      title,
      price: money(root.find("[class*='price']").first().text()),
      currency: cur,
      rating: num(root.find("[class*='a-icon-alt']").first().text()),
      reviewCount: num(root.find("a[href*='customerReviews'] span, .a-size-small").last().text()),
      imageUrl: img.attr("src") ?? null,
      url: `https://${p.host}/dp/${asin}`,
    });
  });
  return out;
}

/**
 * Amazon public Best Sellers / New Releases / Movers & Shakers. SCRAPED, lower confidence, DISABLED by default.
 * Amazon's terms restrict automated access: robots.txt is enforced and blocks (403/robots) are never bypassed.
 */
export const amazonBestsellers: Connector<PageRaw, Item> = {
  key: "amazon_bestsellers",
  name: "Amazon Best Sellers / New Releases / Movers",
  rateLimit: { calls: 60, windowMs: 86_400_000 },
  costPerCall: 0,
  reliabilityScore: 0.4,
  scraped: true,
  termsNote: "Scraped; robots.txt enforced; polite; lower confidence.",

  async fetch(ctx) {
    if (ctx.fixtureMode) return fixture as PageRaw[];
    const out: PageRaw[] = [];
    const errors: string[] = [];
    for (const t of TARGETS) {
      const host = COUNTRY_HOSTS[t.country]!.host;
      try {
        const res = await ctx.http.get(`https://${host}/gp/${t.listType}/`, {
          headers: { "accept-language": "en" },
        });
        out.push({
          country: t.country,
          host,
          listType: t.listType,
          category: "all",
          html: await res.text(),
        });
      } catch (e) {
        errors.push(`${t.country}/${t.listType}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (out.length === 0)
      throw new Error(
        `no Amazon pages fetched (blocked or disallowed): ${errors.slice(0, 3).join("; ")}`,
      );
    return out;
  },

  normalize: (raw) => raw.flatMap(parseListPage),

  async persist(ctx, items) {
    const sourceId = await sourceIdOf(ctx.db, "amazon_bestsellers");
    const index = await loadEntityIndex(ctx.db);
    for (const it of items) {
      let trendId = matchEntity(index, it.title);
      if (it.country === "IN") {
        // India side: stored as listings (competition evidence), never as foreign products and never creating candidates
        await ctx.db
          .insert(listingsIndia)
          .values({
            trendId,
            marketplace: it.marketplace,
            externalId: it.asin,
            title: it.title,
            priceInr: it.price,
            rating: it.rating,
            reviewCount: it.reviewCount,
            url: it.url,
            sourceId,
            confidence: 0.4,
          })
          .onConflictDoUpdate({
            target: [listingsIndia.marketplace, listingsIndia.externalId],
            set: {
              title: it.title,
              priceInr: it.price,
              rating: it.rating,
              reviewCount: it.reviewCount,
              trendId: trendId ?? undefined,
              fetchedAt: new Date(),
            },
          });
        continue;
      }
      if (!trendId && it.listType === "movers-and-shakers") {
        const term = deriveTerm(it.title);
        trendId =
          (await findOrCreateCandidate(ctx.db, index, term, { sourceId, confidence: 0.3 }))?.id ??
          null;
      }
      const [p] = await ctx.db
        .insert(products)
        .values({
          trendId,
          marketplace: it.marketplace,
          countryCode: it.country,
          externalId: it.asin,
          title: it.title,
          imageUrl: it.imageUrl,
          url: it.url,
          sourceId,
          confidence: 0.4,
        })
        .onConflictDoUpdate({
          target: [products.marketplace, products.externalId],
          set: { title: it.title, trendId: trendId ?? undefined, fetchedAt: new Date() },
        })
        .returning({ id: products.id });
      await ctx.db.insert(productSnapshots).values({
        productId: p!.id,
        price: it.price,
        currency: it.currency,
        rating: it.rating,
        reviewCount: it.reviewCount,
        bsr: it.rank,
        listType: it.listType,
        categoryPath: it.category,
        sourceId,
        confidence: 0.4,
      });
    }
  },

  async healthCheck(ctx) {
    try {
      const r = await ctx.http.get("https://www.amazon.com/gp/bestsellers/");
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};
