import {
  backtestCases,
  giftProfiles,
  categories,
  countries,
  createDb,
  festivals,
  occasions,
  sources,
  trendEntities,
  trendSignalsTimeseries,
  users,
  verticals,
  type Db,
} from "@trendbridge/db";
import {
  BACKTEST,
  COUNTRIES,
  DEFAULT_PRICE_BREAKS,
  parseInrBand,
  FESTIVALS,
  SOURCE_CATALOG,
  VERTICALS,
} from "@trendbridge/shared";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { loadConfig } from "../config";
import { syncReleases } from "../releases-sync";
import { GIFT_META } from "./giftmeta";
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

const monthsBetween = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 +
  (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));

/** Analyst-estimated back-test cases. Never overwrites a measured lag. */
export async function seedBacktest(db: Db) {
  for (const c of BACKTEST.cases) {
    await db
      .insert(backtestCases)
      .values({
        name: c.name,
        term: c.term,
        group: c.group,
        usRise: c.usRise,
        inRise: c.inRise,
        estimatedLagMonths: monthsBetween(c.usRise, c.inRise),
        note: "analyst estimate; verify",
      })
      .onConflictDoUpdate({
        target: backtestCases.term,
        set: {
          name: c.name,
          group: c.group,
          usRise: c.usRise,
          inRise: c.inRise,
          estimatedLagMonths: monthsBetween(c.usRise, c.inRise),
        },
      });
  }
  // Phase 0/1 placeholder scores are gone: real scores come from the scoring job.
  await db.execute(sql`delete from scores where algorithm_version = 'sample-0'`);
}

export async function seedSampleTrends(db: Db, opts: { reset?: boolean } = {}) {
  if (opts.reset) {
    await db.execute(
      sql`delete from scores where trend_id in (select id from trend_entities where is_sample)`,
    );
    await db.execute(sql`delete from trend_entities where is_sample`);
  }
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
    const gm = GIFT_META[t.name];
    if (gm) {
      const r = parseInrBand(t.band);
      await db
        .insert(giftProfiles)
        .values({
          trendId: row!.id,
          recipients: gm.recipients,
          ageGroups: gm.ages,
          interests: gm.interests,
          personalisation: gm.pers,
          priceMinInr: r?.min ?? null,
          priceMaxInr: r?.max ?? null,
          isSample: true,
          corporate: gm.corporate
            ? {
                moq: 25,
                branding:
                  gm.pers === "none"
                    ? ["custom box / sleeve", "personalised card"]
                    : ["logo print", "laser engraving", "custom box / sleeve"],
                leadTimeDays: gm.pers === "full" ? 30 : 21,
                priceBreaks: DEFAULT_PRICE_BREAKS,
              }
            : null,
        })
        .onConflictDoNothing();
    }
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
  }
  return SEED_TRENDS.length;
}

export async function runSeed() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  await seedReference(db);
  await seedBacktest(db);
  await syncReleases(db);
  await ensureAdmin(db, config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
  const n = await seedSampleTrends(db, { reset: process.env.RESEED_SAMPLE === "1" });
  await pool.end();
  return n;
}
