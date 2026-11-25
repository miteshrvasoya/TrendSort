import { describe, expect, it } from "vitest";
import {
  assumptionsSchema,
  baseAssumptions,
  computeEconomics,
  dutyGroupFor,
  landedCost,
  marginComponent,
  priceFitComponent,
  sensitivity,
  type Assumptions,
} from "./index";

/** Hand-computed scenario: FOB $3 @ ₹80, 0.5 kg @ ₹100/kg, price ₹1,180 incl. 18% GST (revenue ₹1,000 ex-GST). */
function scenario(over: Partial<Assumptions> = {}): Assumptions {
  const a = baseAssumptions();
  a.sellingPriceInr = 1180;
  a.referralPct = 10;
  a.closingFeeInr = 20;
  a.fulfilmentFeeInr = 50;
  a.adSpendPct = 10;
  a.packagingInr = 30;
  a.returnsRatePct = 10;
  a.returnShippingInr = 100;
  a.returnWriteOffPct = 50;
  a.import = {
    ...a.import,
    fobAmount: 3,
    fxInrPerUnit: 80,
    weightKg: 0.5,
    freightPerKgInr: 100,
    insurancePct: 1,
    landingChargesPct: 1,
    bcdPct: 20,
    swsPctOfBcd: 10,
    igstPct: 18,
    otherDutyPct: 0,
    clearancePerShipmentInr: 12000,
    moqUnits: 500,
    certificationInr: 5000,
    samplesInr: 3000,
    leadTimeDays: 84,
  };
  a.manufacture = {
    ...a.manufacture,
    bomInr: 100,
    conversionInr: 50,
    defectPct: 4,
    inboundFreightInr: 8,
    gstOnInputsPct: 18,
    toolingInr: 60000,
    certificationInr: 0,
    moqUnits: 500,
    leadTimeDays: 45,
  };
  a.hybrid = {
    finishingInr: 40,
    finishingSetupInr: 10000,
    finishPremiumPct: 10,
    finishingLeadDays: 7,
  };
  return { ...a, ...over };
}

describe("landed cost (Indian customs maths)", () => {
  const l = landedCost(scenario().import);
  it("follows CIF -> assessable value -> BCD -> SWS -> IGST", () => {
    expect(l.fobInr).toBeCloseTo(240, 6);
    expect(l.freight).toBeCloseTo(50, 6);
    expect(l.insurance).toBeCloseTo(2.4, 6);
    expect(l.cif).toBeCloseTo(292.4, 6);
    expect(l.assessableValue).toBeCloseTo(295.324, 4);
    expect(l.bcd).toBeCloseTo(59.0648, 4);
    expect(l.sws).toBeCloseTo(5.90648, 4);
    expect(l.igst).toBeCloseTo(64.85, 1); // (295.324 + 59.0648 + 5.90648) x 18%
    expect(l.clearancePerUnit).toBeCloseTo(24, 6);
  });
  it("landing charges raise duty but are not a cash cost", () => {
    expect(l.landedExIgst).toBeCloseTo(292.4 + 59.0648 + 5.90648 + 24, 3);
    expect(l.landedInclIgst).toBeCloseTo(l.landedExIgst + l.igst, 6);
  });
});

describe("route economics", () => {
  const e = computeEconomics(scenario());
  const imp = e.routes.import;
  it("import contribution matches an independent calculation", () => {
    const rev = 1000;
    const unit = 292.4 + 59.0648 + 5.90648 + 24;
    const returns = 0.1 * (100 + 0.5 * unit);
    const expected = rev - unit - 30 - (0.1 * 1180 + 20 + 50) - 100 - returns;
    expect(imp.revenueExGst).toBeCloseTo(1000, 2);
    expect(imp.contribution).toBeCloseTo(expected, 1);
    expect(imp.marginPct).toBeCloseTo((expected / rev) * 100, 1);
  });
  it("break-even units = fixed costs / contribution, rounded up", () => {
    expect(imp.fixedCosts).toBe(8000);
    expect(imp.breakEvenUnits).toBe(Math.ceil(8000 / imp.contribution));
  });
  it("working capital includes IGST paid at the border and packaging", () => {
    const l = landedCost(scenario().import);
    expect(imp.workingCapital).toBeCloseTo((l.landedExIgst + l.igst) * 500 + 30 * 500, 0);
  });
  it("manufacture applies defect uplift to materials and conversion, adds inbound freight", () => {
    expect(e.routes.manufacture.unitCost).toBeCloseTo((100 + 50) * 1.04 + 8, 2);
    expect(e.routes.manufacture.fixedCosts).toBe(60000);
    expect(e.routes.manufacture.leadTimeDays).toBe(45);
  });
  it("hybrid = import + local finishing, sold at a premium, slower and with extra fixed cost", () => {
    const h = e.routes.hybrid;
    expect(h.unitCost).toBeCloseTo(imp.unitCost + 40, 2);
    expect(h.sellingPriceInr).toBeCloseTo(1180 * 1.1, 2);
    expect(h.leadTimeDays).toBe(91);
    expect(h.fixedCosts).toBe(18000);
  });
  it("unregistered sellers bear IGST and fee GST", () => {
    const u = computeEconomics(scenario({ gstRegistered: false })).routes.import;
    const l = landedCost(scenario().import);
    expect(u.unitCost).toBeCloseTo(l.landedInclIgst, 1);
    expect(u.fees).toBeCloseTo((0.1 * 1180 + 70) * 1.18, 2);
    expect(u.contribution).toBeLessThan(imp.contribution);
  });
  it("waterfall adds up to the contribution", () => {
    const w = imp.waterfall;
    const rev = w.find((x) => x.kind === "revenue")!.value;
    const costs = w.filter((x) => x.kind === "cost").reduce((s, x) => s + x.value, 0);
    expect(rev - costs).toBeCloseTo(imp.contribution, 1);
  });
  it("no break-even when a route loses money", () => {
    const bad = computeEconomics(scenario({ sellingPriceInr: 400 })).routes.import;
    expect(bad.contribution).toBeLessThan(0);
    expect(bad.breakEvenUnits).toBeNull();
  });
});

describe("recommendation", () => {
  it("picks the route with the highest planned profit and explains it", () => {
    const e = computeEconomics(scenario());
    const viable = Object.values(e.routes).filter((r) => r.marginPct >= 15 && r.contribution > 0);
    const top = viable.sort((a, b) => b.plannedProfit - a.plannedProfit)[0]!;
    expect(e.recommendation.route).toBe(top.route);
    expect(e.recommendation.reasons[0]).toMatch(/planned profit/);
  });
  it("lead-time limits rule out slow routes", () => {
    const e = computeEconomics(scenario({ daysAvailable: 60 }));
    expect(
      e.recommendation.blocked.some((b) => b.route === "import" && /lead time/.test(b.reason)),
    ).toBe(true);
    expect(["manufacture", "skip"]).toContain(e.recommendation.route);
  });
  it("working-capital budget rules out cash-hungry routes", () => {
    const e = computeEconomics(scenario({ workingCapitalBudgetInr: 1000 }));
    expect(e.recommendation.route).toBe("skip");
    expect(
      e.recommendation.blocked.every(
        (b) => /working capital/.test(b.reason) || /margin|loses/.test(b.reason),
      ),
    ).toBe(true);
  });
  it("recommends skip when every route loses money", () => {
    const e = computeEconomics(scenario({ sellingPriceInr: 300 }));
    expect(e.recommendation.route).toBe("skip");
    expect(e.recommendation.reasons.join(" ")).toMatch(/loses/);
  });
  it("margin floor blocks thin routes", () => {
    const e = computeEconomics(scenario({ minMarginPct: 99 }));
    expect(e.recommendation.route).toBe("skip");
  });
});

describe("sensitivity and components", () => {
  it("no stress improves contribution; FX only matters for routes that import", () => {
    const r = sensitivity(scenario());
    for (const s of r) expect(s.deltaPct).toBeLessThanOrEqual(0);
    expect(r.filter((s) => s.deltaPct < 0).length).toBeGreaterThanOrEqual(4);
  });
  it("margin component: 0% -> 0, 35%+ -> 100; margin below ~5% triggers the opportunity cap (<15)", () => {
    expect(marginComponent(0)).toBe(0);
    expect(marginComponent(35)).toBe(100);
    expect(marginComponent(80)).toBe(100);
    expect(marginComponent(5)).toBeLessThan(15);
  });
  it("price fit is 100 within budget and falls to 0 at 150% of the top", () => {
    expect(priceFitComponent(1200, { min: 800, max: 1500 })).toBe(100);
    expect(priceFitComponent(1875, { min: 800, max: 1500 })).toBeCloseTo(50, 1);
    expect(priceFitComponent(2250, { min: 800, max: 1500 })).toBe(0);
    expect(priceFitComponent(999, null)).toBeNull();
  });
  it("maps lag groups to duty groups", () => {
    expect(dutyGroupFor("tech")).toBe("electronics");
    expect(dutyGroupFor("water")).toBe("water-purification");
    expect(dutyGroupFor("personalised")).toBe("general");
  });
  it("validates assumptions", () => {
    expect(assumptionsSchema.safeParse(baseAssumptions()).success).toBe(true);
    expect(assumptionsSchema.safeParse({ ...baseAssumptions(), sellingPriceInr: -5 }).success).toBe(
      false,
    );
    const bad = baseAssumptions();
    bad.import.moqUnits = 0;
    expect(assumptionsSchema.safeParse(bad).success).toBe(false);
  });
});
