import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** pgvector column (384 dims = MiniLM). */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(384)",
  toDriver: (v) => `[${v.join(",")}]`,
  fromDriver: (v) => JSON.parse(v) as number[],
});

const provenance = {
  sourceId: integer("source_id").references(() => sources.id),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  confidence: doublePrecision("confidence").notNull().default(0.5),
  isSample: boolean("is_sample").notNull().default(false),
};

// ---------- users ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("admin"),
  lastSeenVersion: varchar("last_seen_version", { length: 20 }),
  tourCompletedVersion: varchar("tour_completed_version", { length: 20 }),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- reference ----------
export const countries = pgTable("countries", {
  code: varchar("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  priority: integer("priority").notNull().default(2),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
});

export const verticals = pgTable("verticals", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
});

export const festivals = pgTable("festivals", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  foreignEquivalent: text("foreign_equivalent"),
  giftIntensity: integer("gift_intensity").notNull().default(3),
  dates: jsonb("dates").notNull().default({}),
});

export const occasions = pgTable("occasions", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  festivalId: integer("festival_id").references(() => festivals.id),
});

// ---------- sources ----------
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 60 }).notNull().unique(),
  name: text("name").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  method: varchar("method", { length: 30 }).notNull(),
  scraped: boolean("scraped").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  reliability: doublePrecision("reliability").notNull().default(0.5),
  costPerCall: doublePrecision("cost_per_call").notNull().default(0),
  limitCalls: integer("limit_calls").notNull().default(0),
  limitWindow: varchar("limit_window", { length: 10 }).notNull().default("day"),
  termsNote: text("terms_note"),
  phase: integer("phase").notNull().default(1),
  circuitState: varchar("circuit_state", { length: 10 }).notNull().default("closed"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    status: varchar("status", { length: 20 }).notNull(), // ok | error | skipped
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    itemCount: integer("item_count").notNull().default(0),
    httpCalls: integer("http_calls").notNull().default(0),
    error: text("error"),
    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [index("source_runs_source_idx").on(t.sourceId, t.startedAt)],
);

export const rateLimitUsage = pgTable(
  "rate_limit_usage",
  {
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    day: date("day").notNull(),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.day] })],
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  url: text("url"),
  sourceKey: text("source_key"),
  detail: jsonb("detail").notNull().default({}),
});

// ---------- raw + normalised ----------
export const rawSignals = pgTable(
  "raw_signals",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").references(() => sourceRuns.id),
    kind: varchar("kind", { length: 30 }).notNull(),
    externalId: text("external_id"),
    payload: jsonb("payload").notNull(),
    ...provenance,
  },
  (t) => [index("raw_signals_source_idx").on(t.sourceId, t.fetchedAt)],
);

export const trendEntities = pgTable(
  "trend_entities",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: integer("category_id").references(() => categories.id),
    subCategory: text("sub_category"),
    verticalKeys: jsonb("vertical_keys").$type<string[]>().notNull().default([]),
    occasionKeys: jsonb("occasion_keys").$type<string[]>().notNull().default([]),
    priceBandInr: text("price_band_inr"),
    targetBuyer: text("target_buyer"),
    /** tracked = user/seed-defined; candidate = auto-created from signals, awaiting review */
    status: varchar("status", { length: 20 }).notNull().default("tracked"),
    origin: varchar("origin", { length: 20 }).notNull().default("user"),
    embedding: vector("embedding"),
    ...provenance,
  },
  (t) => [index("trend_entities_cat_idx").on(t.categoryId)],
);

export const trendSignalsTimeseries = pgTable(
  "trend_signals_timeseries",
  {
    trendId: integer("trend_id")
      .notNull()
      .references(() => trendEntities.id, { onDelete: "cascade" }),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    metric: varchar("metric", { length: 40 }).notNull(), // search_interest | rank | ...
    weekStart: date("week_start").notNull(),
    value: doublePrecision("value").notNull(),
    isEstimated: boolean("is_estimated").notNull().default(false),
    method: text("method"),
    ...provenance,
  },
  (t) => [primaryKey({ columns: [t.trendId, t.countryCode, t.metric, t.weekStart] })],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    trendId: integer("trend_id").references(() => trendEntities.id),
    marketplace: varchar("marketplace", { length: 40 }).notNull(),
    countryCode: varchar("country_code", { length: 2 }).references(() => countries.code),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    brand: text("brand"),
    seller: text("seller"),
    imageUrl: text("image_url"),
    url: text("url"),
    hsCode: varchar("hs_code", { length: 12 }),
    ...provenance,
  },
  (t) => [uniqueIndex("products_mk_ext").on(t.marketplace, t.externalId)],
);

export const trackedKeywords = pgTable(
  "tracked_keywords",
  {
    id: serial("id").primaryKey(),
    trendId: integer("trend_id")
      .notNull()
      .references(() => trendEntities.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    geos: jsonb("geos").$type<string[]>().notNull().default(["US", "IN"]),
    active: boolean("active").notNull().default(true),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("tracked_kw_uq").on(t.trendId, t.term)],
);

export const productSnapshots = pgTable(
  "product_snapshots",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: doublePrecision("price"),
    currency: varchar("currency", { length: 3 }),
    rating: doublePrecision("rating"),
    reviewCount: integer("review_count"),
    bsr: integer("bsr"),
    listType: varchar("list_type", { length: 30 }),
    categoryPath: text("category_path"),
    /** marketplace-specific extras, e.g. Etsy {views, favorers}; never a sales figure */
    metrics: jsonb("metrics").notNull().default({}),
    ...provenance,
  },
  (t) => [index("product_snapshots_p_idx").on(t.productId, t.fetchedAt)],
);

export const listingsIndia = pgTable("listings_india", {
  id: serial("id").primaryKey(),
  trendId: integer("trend_id").references(() => trendEntities.id),
  marketplace: varchar("marketplace", { length: 40 }).notNull(),
  title: text("title").notNull(),
  priceInr: doublePrecision("price_inr"),
  rating: doublePrecision("rating"),
  reviewCount: integer("review_count"),
  url: text("url"),
  ...provenance,
});

export const newsItems = pgTable(
  "news_items",
  {
    id: serial("id").primaryKey(),
    trendId: integer("trend_id").references(() => trendEntities.id),
    headline: text("headline").notNull(),
    publisher: text("publisher"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    url: text("url").notNull(),
    summary: text("summary"), // LLM or rule-based short summary only; never article text
    summaryMethod: varchar("summary_method", { length: 20 }),
    ...provenance,
  },
  (t) => [uniqueIndex("news_url_idx").on(t.url)],
);

export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    trendId: integer("trend_id")
      .notNull()
      .references(() => trendEntities.id, { onDelete: "cascade" }),
    algorithmVersion: varchar("algorithm_version", { length: 20 }).notNull(),
    momentum: doublePrecision("momentum"),
    breadth: doublePrecision("breadth"),
    sustainability: doublePrecision("sustainability"),
    commercialProof: doublePrecision("commercial_proof"),
    opportunity: doublePrecision("opportunity"),
    adoptionStage: varchar("adoption_stage", { length: 30 }),
    lagMonths: doublePrecision("lag_months"),
    weights: jsonb("weights").notNull().default({}),
    inputs: jsonb("inputs").notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    confidence: doublePrecision("confidence").notNull().default(0),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [index("scores_trend_idx").on(t.trendId, t.computedAt)],
);

// ---------- money tables (versioned, editable) ----------
export const dutyGstTables = pgTable("duty_gst_tables", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().default(1),
  hsCode: varchar("hs_code", { length: 12 }).notNull(),
  description: text("description"),
  basicDutyPct: doublePrecision("basic_duty_pct").notNull(),
  igstPct: doublePrecision("igst_pct").notNull(),
  otherPct: doublePrecision("other_pct").notNull().default(0),
  effectiveFrom: date("effective_from").notNull(),
  note: text("note"),
});

export const feeTables = pgTable("fee_tables", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().default(1),
  marketplace: varchar("marketplace", { length: 40 }).notNull(),
  category: text("category").notNull(),
  referralPct: doublePrecision("referral_pct").notNull(),
  closingFeeInr: doublePrecision("closing_fee_inr").notNull().default(0),
  effectiveFrom: date("effective_from").notNull(),
});

// ---------- workflow ----------
export const watchlists = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  trendIds: jsonb("trend_ids").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  trendId: integer("trend_id").references(() => trendEntities.id),
  rule: jsonb("rule").notNull(),
  active: boolean("active").notNull().default(true),
  lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
});

export const pipelineItems = pgTable("pipeline_items", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  trendId: integer("trend_id").references(() => trendEntities.id),
  stage: varchar("stage", { length: 30 }).notNull().default("spotted"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  trendId: integer("trend_id")
    .notNull()
    .references(() => trendEntities.id),
  predictedStage: varchar("predicted_stage", { length: 30 }).notNull(),
  horizonDate: date("horizon_date").notNull(),
  actualStage: varchar("actual_stage", { length: 30 }),
  confidence: doublePrecision("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- versioning / tour ----------
export const appVersions = pgTable("app_versions", {
  version: varchar("version", { length: 20 }).primaryKey(),
  releasedOn: date("released_on").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
});

export const releaseNotes = pgTable(
  "release_notes",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 })
      .notNull()
      .references(() => appVersions.version),
    added: jsonb("added").$type<string[]>().notNull().default([]),
    changed: jsonb("changed").$type<string[]>().notNull().default([]),
    fixed: jsonb("fixed").$type<string[]>().notNull().default([]),
    removed: jsonb("removed").$type<string[]>().notNull().default([]),
    forYou: text("for_you").notNull(),
  },
  (t) => [uniqueIndex("release_notes_v").on(t.version)],
);

export const tourSteps = pgTable(
  "tour_steps",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 })
      .notNull()
      .references(() => appVersions.version),
    featureKey: varchar("feature_key", { length: 60 }).notNull(),
    target: text("target").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    order: integer("order").notNull(),
    route: text("route"),
    screenshotUrl: text("screenshot_url"),
  },
  (t) => [uniqueIndex("tour_steps_v_f").on(t.version, t.featureKey)],
);

// helper for raw SQL elsewhere
export { sql };

export const backtestCases = pgTable(
  "backtest_cases",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    term: text("term").notNull(),
    group: varchar("lag_group", { length: 30 }).notNull(),
    usRise: varchar("us_rise", { length: 7 }).notNull(),
    inRise: varchar("in_rise", { length: 7 }).notNull(),
    estimatedLagMonths: doublePrecision("estimated_lag_months").notNull(),
    measuredLagMonths: doublePrecision("measured_lag_months"),
    measuredCorrelation: doublePrecision("measured_correlation"),
    measuredAt: timestamp("measured_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [uniqueIndex("backtest_term_uq").on(t.term)],
);

/** Gift-specific attributes for a trend. Seeded for samples; editable by you for live trends. */
export const giftProfiles = pgTable("gift_profiles", {
  trendId: integer("trend_id")
    .primaryKey()
    .references(() => trendEntities.id, { onDelete: "cascade" }),
  recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
  ageGroups: jsonb("age_groups").$type<string[]>().notNull().default([]),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  personalisation: varchar("personalisation", { length: 10 }).notNull().default("none"),
  priceMinInr: doublePrecision("price_min_inr"),
  priceMaxInr: doublePrecision("price_max_inr"),
  corporate: jsonb("corporate").$type<{
    moq: number;
    branding: string[];
    leadTimeDays: number;
    priceBreaks: { qty: number; discountPct: number }[];
  } | null>(),
  isSample: boolean("is_sample").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
