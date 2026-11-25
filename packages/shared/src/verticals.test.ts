import { describe, expect, it } from "vitest";
import {
  COMPONENT_KEYS,
  PRESENCE_LABEL,
  VERTICALS,
  VERTICAL_BY_KEY,
  allNewsQueries,
  defaultSubscription,
  effectiveVertical,
  featureGap,
  normaliseWeights,
  subscriptionEconomics,
  verticalConfigSchema,
  verticalOverridesSchema,
} from "./index";

describe("vertical configs", () => {
  it("ships the six verticals, all valid, with unique keys", () => {
    expect(VERTICALS.map((v) => v.key).sort()).toEqual([
      "beauty",
      "gifts",
      "home-kitchen",
      "pet",
      "ro",
      "wellness",
    ]);
    expect(new Set(VERTICALS.map((v) => v.key)).size).toBe(VERTICALS.length);
    for (const v of VERTICALS) expect(verticalConfigSchema.safeParse(v).success).toBe(true);
  });
  it("preset weights are usable weights that differ by vertical", () => {
    for (const v of VERTICALS) {
      const w = normaliseWeights(v.presetWeights);
      expect(COMPONENT_KEYS.reduce((a, k) => a + w[k], 0)).toBeCloseTo(1);
    }
    const ro = normaliseWeights(VERTICAL_BY_KEY.ro!.presetWeights);
    const gifts = normaliseWeights(VERTICAL_BY_KEY.gifts!.presetWeights);
    expect(ro.regulatory).toBeGreaterThan(gifts.regulatory);
    expect(gifts.seasonality).toBeGreaterThan(ro.seasonality * 3);
  });
  it("RO has a feature taxonomy, starter trends tied to features, and water profiles covering every feature", () => {
    const ro = VERTICAL_BY_KEY.ro!;
    const keys = ro.features!.map((f) => f.key);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(ro.starterTrends!.every((s) => s.feature && keys.includes(s.feature))).toBe(true);
    for (const p of ro.waterProfiles!)
      expect(Object.keys(p.featureFit).sort()).toEqual([...keys].sort());
    expect(ro.tools).toContain("subscription");
  });
  it("every vertical has India-fit notes and news queries; only RO needs a feature matrix", () => {
    for (const v of VERTICALS) {
      expect(v.indiaFitNotes.length).toBeGreaterThan(0);
      expect(v.newsQueries.length).toBeGreaterThan(1);
    }
    expect(VERTICAL_BY_KEY.gifts!.features).toBeUndefined();
  });
  it("overrides replace queries, weights and presence without touching the defaults", () => {
    const base = VERTICAL_BY_KEY.ro!;
    const e = effectiveVertical(base, { newsQueries: ["only this"], featurePresence: { iot: 3 } });
    expect(e.newsQueries).toEqual(["only this"]);
    expect(e.features!.find((f) => f.key === "iot")!.indiaPresence).toBe(3);
    expect(base.features!.find((f) => f.key === "iot")!.indiaPresence).toBe(1);
    expect(effectiveVertical(base, null)).toBe(base);
  });
  it("validates overrides", () => {
    expect(verticalOverridesSchema.safeParse({ featurePresence: { iot: 9 } }).success).toBe(false);
    expect(verticalOverridesSchema.safeParse({ newsQueries: [] }).success).toBe(false);
    expect(verticalOverridesSchema.safeParse({ presetWeights: { nonsense: 1 } }).success).toBe(
      false,
    );
    expect(
      verticalOverridesSchema.safeParse({ keywords: ["ok term"], featurePresence: { iot: 2 } })
        .success,
    ).toBe(true);
  });
  it("merges news queries without duplicates", () => {
    const q = allNewsQueries(VERTICALS);
    expect(new Set(q).size).toBe(q.length);
    expect(q).toContain("water purifier trends");
  });
});

describe("feature gap", () => {
  it("is high for strongly rising features India lacks, zero when widespread, null when unscored", () => {
    expect(featureGap(80, 0)).toBe(80);
    expect(featureGap(80, 1)).toBeCloseTo(53.3, 1);
    expect(featureGap(80, 3)).toBe(0);
    expect(featureGap(null, 1)).toBeNull();
    expect(featureGap(60, 7)).toBe(0);
    expect(PRESENCE_LABEL).toHaveLength(4);
  });
});

describe("subscription economics", () => {
  it("computes contribution, lifetime, LTV, LTV:CAC and payback", () => {
    const r = subscriptionEconomics({
      annualPriceInr: 2360,
      gstPct: 18,
      filterCostInr: 700,
      deliveryCostInr: 100,
      serviceCostInr: 200,
      paymentFeePct: 2,
      churnPctPerYear: 25,
      acquisitionCostInr: 800,
      hardwareMarginInr: 200,
    });
    expect(r.annualRevenueExGst).toBeCloseTo(2000, 2);
    expect(r.annualCost).toBeCloseTo(700 + 100 + 200 + 40, 2);
    expect(r.annualContribution).toBeCloseTo(960, 2);
    expect(r.contributionMarginPct).toBeCloseTo(48, 1);
    expect(r.expectedLifetimeYears).toBe(4);
    expect(r.lifetimeValue).toBeCloseTo(960 * 4 + 200, 2);
    expect(r.ltvToCac).toBeCloseTo((960 * 4 + 200) / 800, 2);
    expect(r.paybackMonths).toBeCloseTo(((800 - 200) / 960) * 12, 1);
  });
  it("handles zero churn, losing plans and instant payback", () => {
    const base = defaultSubscription();
    expect(subscriptionEconomics({ ...base, churnPctPerYear: 0 }).lifetimeValue).toBeNull();
    const loss = subscriptionEconomics({ ...base, filterCostInr: 5000 });
    expect(loss.annualContribution).toBeLessThan(0);
    expect(loss.paybackMonths).toBeNull();
    expect(subscriptionEconomics({ ...base, hardwareMarginInr: 5000 }).paybackMonths).toBe(0);
  });
});
