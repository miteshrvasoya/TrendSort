import {
  categories,
  countries,
  createDb,
  festivals,
  occasions,
  scores,
  sources,
  trendEntities,
  trendSignalsTimeseries,
  users,
  verticals,
  type Db,
} from "@trendbridge/db";
import { COUNTRIES, FESTIVALS, SOURCE_CATALOG, VERTICALS } from "@trendbridge/shared";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { loadConfig } from "../config";
import { syncReleases } from "../releases-sync";
import { SEED_TRENDS } from "./trends";
import { foreignCurve, hashStr, indiaCurve, mulberry32, STAGE_DAMP, weekStarts } from "./synthetic";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const WEEKS = 104;

export async function ensureAdmin(db: Db, email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (u) return u;
  const hash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), passwordHash: hash, role: "admin" })
    .returning();
  return created!;
}

export async function seedReference(db: Db) {
  for (const c of COUNTRIES)
    await db
      .insert(countries)
      .values(c)
      .onConflictDoUpdate({
        target: countries.code,
        set: { name: c.name, currency: c.currency, priority: c.priority },
      });
  for (const v of VERTICALS)
    await db
      .insert(verticals)
      .values({ key: v.key, name: v.name, config: v })
      .onConflictDoUpdate({ target: verticals.key, set: { name: v.name, config: v } });
  for (const f of FESTIVALS) {
    const [row] = await db
      .insert(festivals)
      .values({
        key: f.key,
        name: f.name,
        foreignEquivalent: f.foreignEquivalent,
        giftIntensity: f.gift_intensity,
        dates: f.dates,
      })
      .onConflictDoUpdate({ target: festivals.key, set: { name: f.name, dates: f.dates } })
      .returning();
    await db
      .insert(occasions)
      .values({ key: f.key, name: f.name, festivalId: row!.id })
      .onConflictDoNothing();
  }
  for (const o of [
    "birthday",
    "anniversary",
    "wedding",
    "housewarming",
    "baby-shower",
    "corporate",
  ]) {
    await db
      .insert(occasions)
      .values({ key: o, name: o.replace(/-/g, " ") })
      .onConflictDoNothing();
  }
  for (const s of SOURCE_CATALOG) {
    const enabled = !s.scraped; // scraped sources are opt-in
    await db
      .insert(sources)
      .values({
        key: s.key,
        name: s.name,
        type: s.type,
        method: s.method,
        scraped: s.scraped,
        reliability: s.reliability,
        limitCalls: s.limit.calls,
        limitWindow: s.limit.window,
        termsNote: s.termsNote,
        phase: s.phase,
        enabled,
      })
      .onConflictDoUpdate({
        target: sources.key,
        set: {
          name: s.name,
          reliability: s.reliability,
          limitCalls: s.limit.calls,
          termsNote: s.termsNote,
          phase: s.phase,
          scraped: s.scraped,
          method: s.method,
        },
      });
  }
}

export async function seedSampleTrends(db: Db) {
  const cnt = (await db.execute(sql`select count(*)::int as n from trend_entities where is_sample`))
    .rows[0] as { n: number } | undefined;
  if ((cnt?.n ?? 0) > 0) return 0;
  const [sampleSrc] = await db.select().from(sources).where(eq(sources.key, "sample_seed"));
  const weeks = weekStarts(WEEKS);
  const foreignCountries = ["US", "GB", "AE", "JP", "KR", "CN"];
  for (const t of SEED_TRENDS) {
    const catSlug = slugify(t.category);
    await db.insert(categories).values({ slug: catSlug, name: t.category }).onConflictDoNothing();
    const [cat] = await db.select().from(categories).where(eq(categories.slug, catSlug));
    const [row] = await db
      .insert(trendEntities)
      .values({
        slug: slugify(t.name),
        name: t.name,
        categoryId: cat!.id,
        subCategory: t.sub,
        verticalKeys: t.verticals,
        occasionKeys: t.occasions,
        priceBandInr: t.band,
        description: "Sample trend entity (synthetic demo data).",
        sourceId: sampleSrc?.id,
        confidence: 0.2,
        isSample: true,
      })
      .returning();
    const rnd = mulberry32(hashStr(t.name));
    const us = foreignCurve(t.profile, WEEKS, t.base, rnd);
    const rows: (typeof trendSignalsTimeseries.$inferInsert)[] = [];
    const add = (cc: string, series: number[]) =>
      series.forEach((v, i) =>
        rows.push({
          trendId: row!.id,
          countryCode: cc,
          metric: "search_interest",
          weekStart: weeks[i]!,
          value: v,
          isSample: true,
          isEstimated: true,
          method: "synthetic seed",
          sourceId: sampleSrc?.id,
          confidence: 0.2,
        }),
      );
    add("US", us);
    for (const cc of foreignCountries.slice(1))
      add(cc, foreignCurve(t.profile, WEEKS, t.base * (0.6 + rnd() * 0.5), rnd));
    add("IN", indiaCurve(us, t.lagWeeks, STAGE_DAMP[t.stage]!, rnd));
    for (let i = 0; i < rows.length; i += 500)
      await db
        .insert(trendSignalsTimeseries)
        .values(rows.slice(i, i + 500))
        .onConflictDoNothing();

    const last = us.slice(-12),
      prev = us.slice(-24, -12);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const growth = (avg(last) - avg(prev)) / Math.max(avg(prev), 1);
    // Placeholder values so the UI has something to show; real scoring ships in Phase 2.
    const momentum = Math.round(Math.max(0, Math.min(100, 50 + growth * 80)));
    await db.insert(scores).values({
      trendId: row!.id,
      algorithmVersion: "sample-0",
      momentum,
      breadth: Math.round(40 + rnd() * 50),
      sustainability: Math.round(35 + rnd() * 55),
      commercialProof: Math.round(30 + rnd() * 60),
      opportunity: Math.round(30 + momentum * 0.4 + rnd() * 25),
      adoptionStage: t.stage,
      lagMonths: Math.round((t.lagWeeks / 4.345) * 10) / 10,
      weights: {},
      inputs: { note: "Placeholder sample score; not computed by the real model" },
      confidence: 0.2,
      isSample: true,
    });
  }
  return SEED_TRENDS.length;
}

export async function runSeed() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  await seedReference(db);
  await syncReleases(db);
  await ensureAdmin(db, config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
  const n = await seedSampleTrends(db);
  await pool.end();
  return n;
}
