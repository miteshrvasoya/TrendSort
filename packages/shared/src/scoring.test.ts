import { describe, expect, it } from "vitest";
import {
  COMPONENT_KEYS,
  DEFAULT_WEIGHTS,
  blendForeign,
  breadthScore,
  commercialProof,
  competitionGapFromRatio,
  computeOpportunity,
  confidence,
  lagGroupFor,
  lagWindowScore,
  normaliseWeights,
  seasonalityScore,
  stageFromRatio,
  type Components,
  BACKTEST,
} from "./index";

const none = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, null])) as Components;

describe("weights", () => {
  it("defaults sum to 1", () =>
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1));
  it("normalises and clamps", () => {
    const w = normaliseWeights({ foreignMomentum: 2, lagWindow: 2, margin: -5 });
    expect(w.foreignMomentum).toBeCloseTo(0.5);
    expect(w.margin).toBe(0);
    expect(normaliseWeights({})).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("opportunity", () => {
  it("excludes missing components instead of treating them as zero", () => {
    const r = computeOpportunity(
      { ...none, foreignMomentum: 80, lagWindow: 60, competitionGap: 70 },
      DEFAULT_WEIGHTS,
    );
    const expected = (80 * 0.22 + 60 * 0.18 + 70 * 0.14) / (0.22 + 0.18 + 0.14);
    expect(r.score).toBeCloseTo(expected, 0);
    expect(r.coverage).toBeCloseTo(0.54);
  });
  it("is null without foreign momentum or with too little coverage", () => {
    expect(computeOpportunity({ ...none, lagWindow: 90 }, DEFAULT_WEIGHTS).score).toBeNull();
    expect(
      computeOpportunity({ ...none, foreignMomentum: 90, regulatory: 50 }, DEFAULT_WEIGHTS).score,
    ).toBeNull();
  });
  it("caps at 49 when margin is very low", () => {
    const r = computeOpportunity(
      { ...none, foreignMomentum: 95, lagWindow: 95, competitionGap: 95, margin: 5 },
      DEFAULT_WEIGHTS,
    );
    expect(r.score).toBe(49);
    expect(r.capped).toBe(true);
  });
  it("weights change the score", () => {
    const c = { ...none, foreignMomentum: 100, lagWindow: 0, competitionGap: 50 };
    const a = computeOpportunity(c, {
      ...DEFAULT_WEIGHTS,
      foreignMomentum: 1,
      lagWindow: 0.01,
    }).score!;
    const b = computeOpportunity(c, {
      ...DEFAULT_WEIGHTS,
      foreignMomentum: 0.01,
      lagWindow: 1,
    }).score!;
    expect(a).toBeGreaterThan(b);
  });
});

describe("foreign blend, breadth", () => {
  it("renormalises over available parts and requires momentum", () => {
    expect(blendForeign({ momentum: 80, breadth: null, sustainability: null, proof: null })).toBe(
      80,
    );
    expect(blendForeign({ momentum: null, breadth: 90, sustainability: 90, proof: 90 })).toBeNull();
    expect(blendForeign({ momentum: 100, breadth: 0, sustainability: 0, proof: 0 })).toBe(40);
  });
  it("breadth rewards countries and source types", () => {
    expect(breadthScore(0, 0)).toBe(0);
    expect(breadthScore(4, 4)).toBe(100);
    expect(breadthScore(2, 1)).toBeCloseTo(40);
  });
});

describe("adoption stage", () => {
  const cases: [number, string][] = [
    [0.01, "not_yet_visible"],
    [0.05, "early_signal"],
    [0.15, "emerging"],
    [0.4, "growing"],
    [0.8, "mainstream"],
    [1.3, "saturated"],
  ];
  for (const [ratio, stage] of cases)
    it(`ratio ${ratio} -> ${stage}`, () => expect(stageFromRatio(ratio, 1, true)).toBe(stage));
  it("flat mainstream is saturated; non-comparable data gives no stage", () => {
    expect(stageFromRatio(0.7, -0.1, true)).toBe("saturated");
    expect(stageFromRatio(0.3, 1, false)).toBeNull();
    expect(stageFromRatio(null, null, true)).toBeNull();
  });
  it("competition gap is the inverse of adoption", () => {
    expect(competitionGapFromRatio(0.25)).toBe(75);
    expect(competitionGapFromRatio(2)).toBe(0);
    expect(competitionGapFromRatio(null)).toBeNull();
  });
});

describe("lag window", () => {
  it("full window when India not visible, shrinks with elapsed time, zero when late", () => {
    expect(lagWindowScore(24, null, "not_yet_visible")).toBe(100);
    expect(lagWindowScore(24, 6, "early_signal")).toBe(75);
    expect(lagWindowScore(24, 30, "emerging")).toBe(0);
    expect(lagWindowScore(24, 3, "mainstream")).toBe(0);
    expect(lagWindowScore(null, 3, "emerging")).toBeNull();
  });
});

describe("seasonality", () => {
  const fest = [{ key: "diwali", dates: { "2026": "2026-11-08", "2027": "2027-10-29" } }];
  it("scores festival timing against import lead time", () => {
    expect(seasonalityScore(["diwali"], new Date("2026-11-01"), fest)).toBe(20); // 7 days: too late
    expect(seasonalityScore(["diwali"], new Date("2027-06-30"), fest)).toBe(100); // 121 days
    expect(seasonalityScore(["diwali"], new Date("2027-01-01"), fest)).toBe(40); // far away
  });
  it("evergreen occasions are 60; no occasions is null", () => {
    expect(seasonalityScore(["birthday"], new Date(), fest)).toBe(60);
    expect(seasonalityScore([], new Date(), fest)).toBeNull();
  });
});

describe("commercial proof", () => {
  it("is null with no products and never fabricates parts", () => {
    expect(commercialProof([]).score).toBeNull();
    const r = commercialProof([{ rank: 1, reviewSnapshots: [], prices: [] }]);
    expect(r.parts.reviewVelocity).toBeNull();
    expect(r.parts.rank).toBe(100);
    expect(r.score).not.toBeNull();
  });
  it("rewards rank, review velocity and stable prices", () => {
    const day = 86_400_000;
    const good = commercialProof([
      {
        rank: 2,
        reviewSnapshots: [
          { t: 0, count: 100 },
          { t: 10 * day, count: 900 },
        ],
        prices: [20, 20, 20.5],
      },
    ]);
    const poor = commercialProof([
      {
        rank: 90,
        reviewSnapshots: [
          { t: 0, count: 100 },
          { t: 10 * day, count: 101 },
        ],
        prices: [10, 25, 14],
      },
    ]);
    expect(good.score!).toBeGreaterThan(poor.score!);
  });
});

describe("confidence", () => {
  const base = {
    coverage: 1,
    sourceReliability: 1,
    historyWeeks: 200,
    agreement: 1,
    freshnessDays: 1,
    isSample: false,
  };
  it("is high with full inputs and low with little", () => {
    expect(confidence(base).level).toBe("high");
    expect(
      confidence({
        ...base,
        coverage: 0.2,
        historyWeeks: 10,
        agreement: 0,
        freshnessDays: 200,
        sourceReliability: 0.3,
      }).level,
    ).toBe("low");
  });
  it("sample data is capped and labelled", () => {
    const c = confidence({ ...base, isSample: true });
    expect(c.value).toBeLessThanOrEqual(0.2);
    expect(c.level).toBe("sample");
  });
});

describe("groups and backtest data", () => {
  it("maps categories to lag groups", () => {
    expect(lagGroupFor("Water Purification")).toBe("water");
    expect(lagGroupFor("Personalised Gifts")).toBe("personalised");
    expect(lagGroupFor("Tech Gifts", "Smart ring")).toBe("tech");
    expect(lagGroupFor("Wellness Gifts", "Mushroom coffee gift set")).toBe("wellness");
    expect(lagGroupFor(null, "Air fryer")).toBe("kitchen");
    expect(lagGroupFor(null, "xyz")).toBe("general");
  });
  it("back-test has 30 labelled estimate cases with India after the US", () => {
    expect(BACKTEST.cases.length).toBeGreaterThanOrEqual(30 - 1);
    expect(BACKTEST.note).toMatch(/ESTIMATES/);
    for (const c of BACKTEST.cases) expect(c.inRise > c.usRise).toBe(true);
  });
});
