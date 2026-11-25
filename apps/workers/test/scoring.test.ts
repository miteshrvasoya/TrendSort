import {
  backtestCases,
  createDb,
  productFit,
  scores,
  trendEntities,
  unitEconomicsScenarios,
  users,
} from "@trendbridge/db";
import {
  ALGORITHM_VERSION,
  DEFAULT_WEIGHTS,
  computeOpportunity,
  type ProofResult,
} from "@trendbridge/shared";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assemble, type AssembleInput } from "../src/scoring/assemble";
import type { AnalyticsClient, AnalyzeResult } from "../src/scoring/analytics";
import { runScoring } from "../src/scoring/job";
import { measureLags } from "../src/scoring/measure";

const noProof: ProofResult = {
  score: null,
  parts: { rank: null, reviewVelocity: null, breadth: null, priceStability: null },
  productCount: 0,
};
const analysis = (over: Partial<AnalyzeResult> = {}): AnalyzeResult => ({
  per_country: {},
  notes: [],
  history_weeks: 150,
  last_week: "2026-11-23",
  foreign: {
    momentum: 78,
    countries_observed: 3,
    countries_confirming: 3,
    agreement: 1,
    peak: 90,
    sustainability: { score: 70, spikiness: 0.1, persistence: 0.9, slope_stability: 0.8 },
  },
  india: { present: true, comparable: true, ratio: 0.05, growth13: 0.4, weeks_since_early: 10 },
  lead_lag: null,
  ...over,
});
const input = (over: Partial<AssembleInput> = {}): AssembleInput => ({
  analysis: analysis(),
  comparable: true,
  isSample: false,
  sourceTypes: 2,
  sourceReliability: 0.6,
  proof: noProof,
  seasonality: 60,
  categoryLag: { lag_months: 24, ci_low: 18, ci_high: 30, n: 6, basis: "group" },
  lagGroup: "kitchen",
  freshnessDays: 3,
  ...over,
});

describe("assemble (pure)", () => {
  it("builds an explainable record with early-signal stage and open lag window", () => {
    const r = assemble(input());
    expect(r.adoptionStage).toBe("early_signal");
    expect(r.momentum).toBe(78);
    expect(r.breadth).toBeCloseTo(60 * 0.75 + 0.4 * 50 * 0 + 20, 0); // 0.6*0.75 + 0.4*0.5 = 0.65 -> 65
    expect(r.opportunity).not.toBeNull();
    const comps = r.inputs.components as Record<string, number | null>;
    expect(comps.priceFit).toBeNull();
    expect(comps.competitionGap).toBe(95);
    expect(comps.lagWindow).toBeCloseTo((100 * (24 - 10 / 4.345)) / 24, 0);
    expect(r.algorithmVersion).toBe(ALGORITHM_VERSION);
  });
  it("matches computeOpportunity on its own components (single source of truth)", () => {
    const r = assemble(input());
    const again = computeOpportunity(r.inputs.components as never, DEFAULT_WEIGHTS);
    expect(r.opportunity).toBe(again.score);
  });
  it("withholds stage, competition gap and lag window when series are not comparable", () => {
    const r = assemble(
      input({
        comparable: false,
        analysis: analysis({
          india: {
            present: true,
            comparable: false,
            ratio: null,
            growth13: null,
            weeks_since_early: null,
          },
        }),
      }),
    );
    expect(r.adoptionStage).toBeNull();
    const c = r.inputs.components as Record<string, number | null>;
    expect(c.lagWindow).toBeNull();
    expect(c.competitionGap).toBeNull();
  });
  it("mainstream India leaves no lag window and lowers opportunity", () => {
    const r = assemble(
      input({
        analysis: analysis({
          india: {
            present: true,
            comparable: true,
            ratio: 0.8,
            growth13: 0.2,
            weeks_since_early: 80,
          },
        }),
      }),
    );
    expect(r.adoptionStage).toBe("mainstream");
    expect((r.inputs.components as Record<string, number>).lagWindow).toBe(0);
    expect(r.opportunity!).toBeLessThan(assemble(input()).opportunity!);
  });
  it("has no opportunity without foreign data, and caps sample confidence", () => {
    expect(assemble(input({ analysis: analysis({ foreign: null }) })).opportunity).toBeNull();
    const s = assemble(input({ isSample: true }));
    expect(s.confidence).toBeLessThanOrEqual(0.2);
    expect(s.isSample).toBe(true);
  });
});

describe("assemble: economics and fit inputs", () => {
  const econ = (marginPct: number, price = 999) => ({
    marginPct,
    sellingPriceInr: price,
    route: "import",
  });
  it("fills margin, price fit, regulatory and logistics from saved scenario and fit, raising coverage", () => {
    const base = assemble(input());
    const r = assemble(
      input({
        econ: econ(35),
        giftRange: { min: 500, max: 1500 },
        fit: { regulatory: 90, logistics: 80 },
      }),
    );
    const c = r.inputs.components as Record<string, number | null>;
    expect(c).toMatchObject({ margin: 100, priceFit: 100, regulatory: 90, logistics: 80 });
    expect((r.inputs.opportunity as { coverage: number }).coverage).toBeGreaterThan(
      (base.inputs.opportunity as { coverage: number }).coverage,
    );
  });
  it("a very thin margin caps Opportunity at 49 no matter how strong the demand", () => {
    const r = assemble(
      input({
        econ: econ(3),
        analysis: analysis({
          india: {
            present: true,
            comparable: true,
            ratio: 0.01,
            growth13: 1,
            weeks_since_early: null,
          },
        }),
      }),
    );
    expect(r.opportunity).toBe(49);
    expect((r.inputs.opportunity as { capped: boolean }).capped).toBe(true);
  });
  it("price above the gift budget lowers price fit; no gift range leaves it unavailable", () => {
    const hi = assemble(input({ econ: econ(30, 1875), giftRange: { min: 500, max: 1500 } })).inputs
      .components as Record<string, number | null>;
    expect(hi.priceFit).toBeCloseTo(50, 0);
    const none = assemble(input({ econ: econ(30), giftRange: null })).inputs.components as Record<
      string,
      number | null
    >;
    expect(none.priceFit).toBeNull();
    expect(none.margin).not.toBeNull();
  });
});

describe("runScoring (DB, fake analytics)", () => {
  const { db, pool } = createDb(
    process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
  );
  const calls: string[] = [];
  const fake: AnalyticsClient = {
    async analyze(req) {
      calls.push(Object.keys(req.series).join(","));
      return analysis();
    },
    async categoryLag(cases, _group) {
      return { lag_months: 24, ci_low: 20, ci_high: 28, n: cases.length, basis: "group" };
    },
    async leadLag() {
      return { lag: 8, correlation: 0.6, usable: true, n: 100 };
    },
  };
  let sampleId = 0;
  beforeAll(async () => {
    [sampleId] = (
      await db
        .select({ id: trendEntities.id })
        .from(trendEntities)
        .where(eq(trendEntities.isSample, true))
        .limit(1)
    ).map((r) => r.id) as [number];
    await db
      .insert(backtestCases)
      .values({
        name: "t",
        term: "test-term-scoring",
        group: "test",
        usRise: "2020-01",
        inRise: "2021-01",
        estimatedLagMonths: 12,
      })
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await db.delete(backtestCases).where(eq(backtestCases.term, "test-term-scoring"));
    await pool.end();
  });

  it("scores a sample trend, flags it sample, and is idempotent per day", async () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(await runScoring(db, fake, { trendIds: [sampleId], now })).toMatchObject({
      scored: 1,
      skipped: 0,
    });
    await runScoring(db, fake, { trendIds: [sampleId], now });
    const rows = await db
      .select()
      .from(scores)
      .where(eq(scores.trendId, sampleId))
      .orderBy(desc(scores.computedAt));
    const today = rows.filter(
      (r) =>
        r.algorithmVersion === ALGORITHM_VERSION &&
        r.computedAt.toISOString().startsWith("2026-11-25"),
    );
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ isSample: true, adoptionStage: "early_signal" });
    expect(today[0]!.confidence).toBeLessThanOrEqual(0.2);
    expect((today[0]!.inputs as { comparable: boolean }).comparable).toBe(true);
    await db.delete(scores).where(eq(scores.id, today[0]!.id));
  });
  it("feeds a saved scenario and fit profile into the score", async () => {
    const now = new Date("2026-11-26T10:00:00Z");
    const [u] = await db
      .insert(users)
      .values({ email: "scoring-test@example.invalid", passwordHash: "x" })
      .onConflictDoNothing()
      .returning();
    const userId =
      u?.id ??
      (await db.select().from(users).where(eq(users.email, "scoring-test@example.invalid")))[0]!.id;
    await db.delete(unitEconomicsScenarios).where(eq(unitEconomicsScenarios.trendId, sampleId));
    await db.delete(productFit).where(eq(productFit.trendId, sampleId));
    await db.insert(unitEconomicsScenarios).values({
      userId,
      trendId: sampleId,
      name: "t",
      isPrimary: true,
      assumptions: { sellingPriceInr: 999 },
      results: { best: { marginPct: 21, route: "hybrid" } },
      isSample: true,
    });
    await db.insert(productFit).values({
      trendId: sampleId,
      attrs: {
        electrical: false,
        wireless: false,
        battery: false,
        foodContact: false,
        cosmetic: false,
        waterRelated: false,
        animalDerived: false,
        liquidOrHazmat: false,
        fragile: false,
        festiveColourSensitive: false,
        size: "small",
      },
      isSample: true,
    });
    await runScoring(db, fake, { trendIds: [sampleId], now });
    const [row] = await db
      .select()
      .from(scores)
      .where(eq(scores.trendId, sampleId))
      .orderBy(desc(scores.computedAt))
      .limit(1);
    const c = (
      row!.inputs as { components: Record<string, number | null>; econ: { route: string } }
    ).components;
    expect(c.margin).toBeCloseTo(60, 0); // 21 / 35
    expect(c.regulatory).toBe(95);
    expect(c.logistics).toBe(100);
    expect((row!.inputs as { econ: { route: string } }).econ.route).toBe("hybrid");
    await db.delete(scores).where(eq(scores.id, row!.id));
    await db.delete(unitEconomicsScenarios).where(eq(unitEconomicsScenarios.trendId, sampleId));
    await db.delete(productFit).where(eq(productFit.trendId, sampleId));
    await db.delete(users).where(eq(users.email, "scoring-test@example.invalid"));
  });
  it("skips trends with no series", async () => {
    const [t] = await db
      .insert(trendEntities)
      .values({ slug: "score-test-empty", name: "Score Test Empty", isSample: false })
      .onConflictDoNothing()
      .returning();
    const id =
      t?.id ??
      (await db.select().from(trendEntities).where(eq(trendEntities.slug, "score-test-empty")))[0]!
        .id;
    expect((await runScoring(db, fake, { trendIds: [id] })).skipped).toBe(1);
    await db.delete(trendEntities).where(eq(trendEntities.id, id));
  });
  it("stops early and reports when the analytics service is down", async () => {
    const down: AnalyticsClient = {
      ...fake,
      async analyze() {
        throw new Error("Analytics service unreachable at http://x");
      },
    };
    const r = await runScoring(db, down, { trendIds: [sampleId] });
    expect(r.scored).toBe(0);
    expect(r.failed[0]!.error).toMatch(/unreachable/);
  });
});

describe("measureLags", () => {
  const { db, pool } = createDb(
    process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
  );
  afterAll(async () => {
    await db.delete(backtestCases).where(eq(backtestCases.group, "measure-test"));
    await pool.end();
  });
  it("stores a measured lag only when the correlation is usable", async () => {
    await db
      .insert(backtestCases)
      .values([
        {
          name: "a",
          term: "measure-a",
          group: "measure-test",
          usRise: "2020-01",
          inRise: "2021-01",
          estimatedLagMonths: 12,
        },
        {
          name: "b",
          term: "measure-b",
          group: "measure-test",
          usRise: "2020-01",
          inRise: "2021-01",
          estimatedLagMonths: 12,
        },
      ])
      .onConflictDoNothing();
    const trends = async (
      term: string,
    ): Promise<Record<string, { time: number; value: number }[]>> => {
      const pts = Array.from({ length: 60 }, (_, i) => ({
        time: i,
        value: i + (term === "measure-b" ? 1 : 0),
      }));
      return term === "measure-a" || term === "measure-b" ? { US: pts, IN: pts } : {};
    };
    const analytics: AnalyticsClient = {
      analyze: async () => analysis(),
      categoryLag: async () => ({ lag_months: 1, ci_low: 1, ci_high: 1, n: 1, basis: "group" }),
      leadLag: async (_f, _i, _m, _s) =>
        _f[0] === 0
          ? { lag: 14, correlation: 0.7, usable: true, n: 60 }
          : { lag: 3, correlation: 0.1, usable: false, n: 60 },
    };
    await measureLags(db, trends, analytics);
    const rows = (
      await db.select().from(backtestCases).where(eq(backtestCases.group, "measure-test"))
    ).sort((x, y) => x.term.localeCompare(y.term));
    expect(rows[0]).toMatchObject({ measuredLagMonths: 14, measuredCorrelation: 0.7 });
    expect(rows[1]).toMatchObject({ measuredLagMonths: null, measuredCorrelation: 0.1 });
    expect(rows[1]!.estimatedLagMonths).toBe(12);
  });
});
