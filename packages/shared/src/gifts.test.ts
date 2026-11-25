import { describe, expect, it } from "vitest";
import {
  BUNDLE_DISCOUNT_PCT,
  buildBundles,
  fitsBudget,
  parseInrBand,
  priceAtQty,
  sourcingHint,
  upcomingFestivals,
  windowFor,
  FESTIVALS,
} from "./index";

describe("price bands", () => {
  it("parses INR band strings", () => {
    expect(parseInrBand("₹800–2,000")).toEqual({ min: 800, max: 2000 });
    expect(parseInrBand("₹600–1,800/qtr")).toEqual({ min: 600, max: 1800 });
    expect(parseInrBand("₹999")).toEqual({ min: 999, max: 999 });
    expect(parseInrBand("n/a")).toBeNull();
    expect(parseInrBand(null)).toBeNull();
  });
  it("budget fit is overlap, and unknown price never fits", () => {
    expect(fitsBudget({ min: 800, max: 2000 }, "u1500")).toBe(true);
    expect(fitsBudget({ min: 1600, max: 2500 }, "u1500")).toBe(false);
    expect(fitsBudget({ min: 300, max: 900 }, "500-1000")).toBe(true);
    expect(fitsBudget({ min: 6000, max: 9000 }, "5000+")).toBe(true);
    expect(fitsBudget(null, "u500")).toBe(false);
  });
});

describe("gifting windows", () => {
  it("computes import and manufacture deadlines and status", () => {
    const w = windowFor("2027-10-29", new Date("2027-06-01"));
    expect(w.importDeadline).toBe("2027-07-16"); // 105 days before
    expect(w.manufactureDeadline).toBe("2027-08-24"); // 66 days before
    expect(w.status).toBe("start_now");
    expect(windowFor("2027-10-29", new Date("2027-08-01")).status).toBe("manufacture_only");
    expect(windowFor("2027-10-29", new Date("2027-09-15")).status).toBe("missed");
    expect(windowFor("2027-10-29", new Date("2027-07-16")).status).toBe("start_now"); // deadline day still ok
  });
  it("lists next occurrences soonest first and drops past ones", () => {
    const up = upcomingFestivals(FESTIVALS, new Date("2026-11-26"));
    expect(up[0]!.date <= up[1]!.date).toBe(true);
    expect(up.every((f) => f.date >= "2026-11-26")).toBe(true);
    expect(up.find((f) => f.key === "diwali")!.date).toBe("2027-10-29");
    expect(up.map((f) => f.date)).toEqual([...up.map((f) => f.date)].sort());
  });
});

describe("bundles", () => {
  const items = [
    {
      id: 1,
      name: "Candle trio",
      category: "Home",
      range: { min: 500, max: 1500 },
      opportunity: 60,
    },
    {
      id: 2,
      name: "Matcha kit",
      category: "Wellness",
      range: { min: 900, max: 2200 },
      opportunity: 80,
    },
    {
      id: 3,
      name: "Photo frame",
      category: "Tech",
      range: { min: 3000, max: 9000 },
      opportunity: 70,
    },
    {
      id: 4,
      name: "Sand garden",
      category: "Home",
      range: { min: 400, max: 1200 },
      opportunity: 50,
    },
  ];
  it("mixes categories, best opportunity first, applies discount and rounds to 50", () => {
    const [b] = buildBundles(items, { size: 3 });
    expect(b!.names[0]).toBe("Matcha kit");
    expect(new Set(b!.itemIds).size).toBe(b!.itemIds.length);
    const cats = b!.itemIds.map((id) => items.find((i) => i.id === id)!.category);
    expect(new Set(cats).size).toBe(cats.length);
    expect(b!.suggestedInr % 50).toBe(0);
    expect(b!.suggestedInr).toBeLessThan(b!.sumInr);
    expect(b!.discountPct).toBe(BUNDLE_DISCOUNT_PCT);
  });
  it("respects a budget cap and returns nothing when no pair fits", () => {
    expect(
      buildBundles(items, { budgetMax: 1500, size: 2 }).every((b) => b.suggestedInr <= 1500),
    ).toBe(true);
    expect(buildBundles(items, { budgetMax: 100 })).toEqual([]);
    expect(buildBundles([items[0]!])).toEqual([]);
  });
});

describe("corporate price breaks and hints", () => {
  it("applies the largest break at or below the quantity; under MOQ is null", () => {
    expect(priceAtQty(1000, 10)).toBeNull();
    expect(priceAtQty(1000, 25)).toMatchObject({ unit: 1000, discountPct: 0 });
    expect(priceAtQty(1000, 120)).toMatchObject({ unit: 900, total: 108000, discountPct: 10 });
    expect(priceAtQty(1000, 5000)!.discountPct).toBe(20);
  });
  it("falls back to a general sourcing hint", () => {
    expect(sourcingHint("water").hubs).toMatch(/RO/);
    expect(sourcingHint("zzz")).toBe(sourcingHint("general"));
  });
});
