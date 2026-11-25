import { describe, expect, it } from "vitest";
import {
  EMPTY_FIT,
  analyseReviews,
  detectBrands,
  fitScores,
  inferFitAttrs,
  runFitChecks,
} from "./index";

describe("fit inference and checks", () => {
  it("infers attributes from words, group and listing titles", () => {
    const ring = inferFitAttrs("tech", "Smart ring (health tracking)");
    expect(ring).toMatchObject({ electrical: true, wireless: true, battery: true, size: "small" });
    const ro = inferFitAttrs("water", "Under-sink reverse osmosis system (tankless)");
    expect(ro).toMatchObject({ waterRelated: true, foodContact: true, size: "large" });
    const blanket = inferFitAttrs("wellness", "Weighted blanket (adult)");
    expect(blanket).toMatchObject({ electrical: false, wireless: false, size: "large" });
    expect(inferFitAttrs("home", "Scented soy candle trio")).toMatchObject({
      fragile: true,
      liquidOrHazmat: true,
      festiveColourSensitive: true,
    });
  });
  it("flags wireless and cosmetics as action, and always reminds about labelling and import policy", () => {
    const checks = runFitChecks({
      ...EMPTY_FIT,
      electrical: true,
      wireless: true,
      battery: true,
      cosmetic: true,
    });
    const by = Object.fromEntries(checks.map((c) => [c.key, c]));
    expect(by.wpc!.status).toBe("action");
    expect(by.cosmetic!.status).toBe("action");
    expect(by.bis!.status).toBe("check");
    expect(by.metrology!.status).toBe("check");
    expect(by.import_policy!.status).toBe("check");
    for (const c of checks) expect(c.verifyWith.length).toBeGreaterThan(2);
  });
  it("trademark check names the brands and says it is informational", () => {
    const hits = detectBrands([
      "Stanley Quencher 40oz",
      "Generic tumbler",
      "Hydro Flask lookalike",
    ]);
    expect(hits).toEqual(["stanley", "hydro flask"]);
    const t = runFitChecks(EMPTY_FIT, hits).find((c) => c.key === "trademark")!;
    expect(t.status).toBe("action");
    expect(t.detail).toMatch(/lawyer/);
    expect(runFitChecks(EMPTY_FIT, []).find((c) => c.key === "trademark")!.detail).toMatch(
      /not a clearance/,
    );
  });
  it("scores: plain gift is easy, wireless battery electronics is harder, RO is bulky", () => {
    const plain = fitScores(runFitChecks(EMPTY_FIT), EMPTY_FIT);
    const attrs = {
      ...EMPTY_FIT,
      electrical: true,
      wireless: true,
      battery: true,
      size: "small" as const,
    };
    const tech = fitScores(runFitChecks(attrs), attrs);
    expect(plain.regulatory).toBe(95);
    expect(tech.regulatory).toBeLessThan(plain.regulatory - 40);
    const big = { ...EMPTY_FIT, size: "large" as const, fragile: true };
    expect(fitScores(runFitChecks(big), big).logistics).toBe(55);
    expect(plain.logistics).toBe(90);
  });
});

describe("review mining", () => {
  const rv = (rating: number, text: string) => ({ rating, text });
  it("returns null with no reviews", () => expect(analyseReviews([])).toBeNull());
  it("counts a theme once per review, ranks by count, and shares sum sensibly", () => {
    const a = analyseReviews([
      rv(5, "Sturdy and well made. Looks great! Perfect gift for my mom."),
      rv(5, "Very sturdy, solid build. Easy to use."),
      rv(2, "It broke after a week. Flimsy plastic, broke again."),
      rv(1, "Arrived damaged in shipping and then it stopped working."),
    ])!;
    expect(a.n).toBe(4);
    expect(a.praise[0]).toMatchObject({ key: "quality", count: 2, share: 0.5 });
    expect(a.complaints.find((c) => c.key === "breaks")!.count).toBe(1);
    expect(a.avgRating).toBe(3.25);
    expect(a.lowRatingShare).toBe(0.5);
    expect(a.ratingCounts).toMatchObject({ "5": 2, "2": 1, "1": 1 });
  });
  it("ignores negated matches", () => {
    const a = analyseReviews([
      rv(5, "It doesn't leak at all and never broke."),
      rv(4, "Not flimsy, no leaks. Works great."),
    ])!;
    expect(a.complaints.find((c) => c.key === "leaks")).toBeUndefined();
    expect(a.complaints.find((c) => c.key === "breaks")).toBeUndefined();
    expect(a.praise.find((p) => p.key === "performance")!.count).toBe(1);
  });
  it("turns frequent complaints into improvement suggestions and warns on small samples", () => {
    const a = analyseReviews([
      rv(2, "Too small, smaller than pictured"),
      rv(3, "It is too big"),
      rv(5, "Lovely and well made"),
    ])!;
    expect(a.suggestions[0]).toMatch(/size guide/);
    expect(a.caveat).toMatch(/Only 3 reviews/);
    const many = analyseReviews(
      Array.from({ length: 25 }, () => rv(5, "Great value, looks great")),
    )!;
    expect(many.caveat).toBeNull();
  });
  it("examples are short snippets from the review, not the whole text", () => {
    const long = "x ".repeat(200) + "It leaked everywhere. " + "y ".repeat(200);
    const a = analyseReviews([rv(1, long)])!;
    expect(a.complaints[0]!.examples[0]!.length).toBeLessThanOrEqual(140);
  });
});
