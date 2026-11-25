import { z } from "zod";

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export type LoginInput = z.infer<typeof loginSchema>;

export const markSeenSchema = z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) });

export const confidenceLevel = z.enum(["high", "medium", "low", "sample"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevel>;

export function confidenceFromScore(score: number, isSample = false): ConfidenceLevel {
  if (isSample) return "sample";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export const adoptionStage = z.enum([
  "not_yet_visible",
  "early_signal",
  "emerging",
  "growing",
  "mainstream",
  "saturated",
]);
export type AdoptionStage = z.infer<typeof adoptionStage>;

// ---------- Phase 1: tracked trends + manual import ----------
export const createTrendSchema = z.object({
  name: z.string().trim().min(3).max(120),
  keywords: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
  geos: z.array(z.string().length(2)).min(1).max(4).default(["US", "IN"]),
  verticals: z.array(z.string()).default([]),
  category: z.string().trim().max(80).optional(),
});
export type CreateTrendInput = z.infer<typeof createTrendSchema>;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const numCell = z.coerce.number().finite();
const optNum = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().finite().nullable(),
);

export const IMPORT_KINDS = [
  "marketplace_products",
  "timeseries",
  "reviews",
  "india_listings",
] as const;
export const importKind = z.enum(IMPORT_KINDS);
export type ImportKind = z.infer<typeof importKind>;

export const marketplaceRowSchema = z.object({
  marketplace: z.string().min(2), // e.g. amazon_us, etsy_us
  country: z.string().length(2),
  list_type: z
    .enum(["bestsellers", "new-releases", "movers-and-shakers", "most-wished-for", "search"])
    .default("bestsellers"),
  rank: z.coerce.number().int().min(1),
  external_id: z.string().min(1),
  title: z.string().min(3),
  price: optNum.default(null),
  currency: z.string().length(3).default("USD"),
  rating: optNum.default(null),
  review_count: optNum.default(null),
  url: z.string().url().optional().or(z.literal("")),
  category: z.string().optional(),
});
export const timeseriesRowSchema = z.object({
  trend: z.string().min(2), // trend name or slug
  country: z.string().length(2),
  metric: z.string().min(2).default("search_interest"),
  week_start: dateStr,
  value: numCell,
});
export const reviewRowSchema = z.object({
  trend: z.string().min(2), // trend name or slug
  source: z.string().min(2).default("manual"),
  rating: z.coerce.number().min(1).max(5),
  text: z.string().min(5).max(2000),
  date: dateStr.optional().or(z.literal("")),
});
export const indiaListingRowSchema = z.object({
  marketplace: z.string().min(2), // amazon_in, flipkart, meesho ...
  external_id: z.string().min(1),
  title: z.string().min(3),
  price_inr: optNum.default(null),
  rating: optNum.default(null),
  review_count: optNum.default(null),
  url: z.string().url().optional().or(z.literal("")),
  trend: z.string().optional(), // optional explicit trend name/slug; otherwise matched by title
});
export const IMPORT_SCHEMAS = {
  marketplace_products: marketplaceRowSchema,
  timeseries: timeseriesRowSchema,
  reviews: reviewRowSchema,
  india_listings: indiaListingRowSchema,
} as const;

export const importRequestSchema = z.object({
  kind: importKind,
  format: z.enum(["csv", "json"]),
  text: z.string().min(2).max(2_000_000),
  sourceLabel: z.string().max(80).default("manual import"),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const IMPORT_TEMPLATES: Record<ImportKind, { csv: string; description: string }> = {
  reviews: {
    description:
      "One row per review from a free browser export. Review text is kept only for theme counting and short example snippets.",
    csv: "trend,source,rating,text,date\nPersonalised star map,amazon_us,5,Sturdy frame and the print looks great. Perfect gift.,2026-11-01\n",
  },
  india_listings: {
    description:
      "Indian marketplace listings (Amazon.in, Flipkart, Meesho...) you found for a product. Matched to a trend by title unless 'trend' is given.",
    csv: "marketplace,external_id,title,price_inr,rating,review_count,url,trend\namazon_in,B0INEXAMPLE1,Personalised Star Map Night Sky Frame,1299,4.3,412,https://www.amazon.in/dp/B0INEXAMPLE1,Personalised star map\n",
  },
  marketplace_products: {
    description:
      "One row per product per list snapshot. Export from a free browser tool or type by hand.",
    csv: "marketplace,country,list_type,rank,external_id,title,price,currency,rating,review_count,url,category\namazon_us,US,bestsellers,1,B0EXAMPLE01,Personalized Star Map Frame,34.99,USD,4.7,2210,https://www.amazon.com/dp/B0EXAMPLE01,Home\n",
  },
  timeseries: {
    description:
      "Weekly values per trend and country (e.g. a Google Trends CSV export, one row per week).",
    csv: "trend,country,metric,week_start,value\nPersonalised star map,US,search_interest,2026-11-02,64\nPersonalised star map,IN,search_interest,2026-11-02,7\n",
  },
};

export type MarketplaceRow = z.output<typeof marketplaceRowSchema>;
export type ReviewRow = z.output<typeof reviewRowSchema>;
export type IndiaListingRow = z.output<typeof indiaListingRowSchema>;
export type TimeseriesRow = z.output<typeof timeseriesRowSchema>;
