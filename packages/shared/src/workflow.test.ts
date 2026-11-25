import { describe, expect, it } from "vitest";
import {
  classifyHit,
  composeReport,
  evaluateRule,
  isStuck,
  predictStage,
  reportToHtml,
  reportToMarkdown,
  summarisePredictions,
  toCsv,
  weekStart,
  type ReportInput,
  type ReportTrend,
} from "./index";

const snap = (o: number | null, i: number | null = null, s: string | null = null) => ({
  opportunity: o,
  indiaMomentum: i,
  stage: s,
});

describe("alert rules fire on crossings, not every run", () => {
  const above = { type: "score_above" as const, threshold: 75, scope: "all" as const };
  it("score_above: fires on crossing and on first sight above, not while staying above", () => {
    expect(evaluateRule(above, snap(80), snap(70), "X").fired).toBe(true);
    expect(evaluateRule(above, snap(80), null, "X").fired).toBe(true);
    expect(evaluateRule(above, snap(82), snap(80), "X").fired).toBe(false);
    expect(evaluateRule(above, snap(60), snap(50), "X").fired).toBe(false);
    expect(evaluateRule(above, snap(null), null, "X").fired).toBe(false);
    expect(evaluateRule(above, snap(80), snap(70), "Smart ring").message).toMatch(
      /Smart ring.*80.*75/,
    );
  });
  it("uses the default threshold when none is given", () => {
    expect(evaluateRule({ type: "score_above", scope: "all" }, snap(76), snap(70), "X").fired).toBe(
      true,
    );
    expect(evaluateRule({ type: "score_above", scope: "all" }, snap(74), snap(70), "X").fired).toBe(
      false,
    );
  });
  it("india_rising: fires when India's own momentum reaches the threshold", () => {
    const r = { type: "india_rising" as const, threshold: 60, scope: "all" as const };
    expect(evaluateRule(r, snap(null, 65), snap(null, 52), "X").fired).toBe(true);
    expect(evaluateRule(r, snap(null, 65), snap(null, 64), "X").fired).toBe(false);
    expect(evaluateRule(r, snap(null, null), snap(null, 40), "X").fired).toBe(false);
  });
  it("india_stage_up: only when the stage advances, never on first sight or regression", () => {
    const r = { type: "india_stage_up" as const, scope: "all" as const };
    expect(
      evaluateRule(r, snap(null, null, "emerging"), snap(null, null, "early_signal"), "X"),
    ).toMatchObject({ fired: true });
    expect(
      evaluateRule(r, snap(null, null, "emerging"), snap(null, null, "emerging"), "X").fired,
    ).toBe(false);
    expect(
      evaluateRule(r, snap(null, null, "early_signal"), snap(null, null, "emerging"), "X").fired,
    ).toBe(false);
    expect(evaluateRule(r, snap(null, null, "emerging"), null, "X").fired).toBe(false);
  });
});

describe("stage predictor and scoring", () => {
  it("projects India's share forward at its recent quarterly growth", () => {
    // 6 months = 2 quarters: 0.1 x 1.5^2 = 0.225 -> emerging (8-25%)
    expect(predictStage({ ratio: 0.1, growth13: 0.5, currentStage: "emerging" })).toMatchObject({
      stage: "emerging",
      projectedRatio: 0.225,
    });
    expect(predictStage({ ratio: 0.1, growth13: 1.0, currentStage: "emerging" })!.stage).toBe(
      "growing",
    ); // 0.4
    expect(predictStage({ ratio: 0.1, growth13: -0.5, currentStage: "emerging" })!.stage).toBe(
      "early_signal",
    ); // 0.025 -> early
  });
  it("caps the projection and refuses without inputs", () => {
    expect(
      predictStage({ ratio: 0.9, growth13: 3, currentStage: "mainstream" })!.projectedRatio,
    ).toBe(1.2);
    expect(predictStage({ ratio: null, growth13: 0.5, currentStage: null })).toBeNull();
    expect(predictStage({ ratio: 0.2, growth13: null, currentStage: null })).toBeNull();
  });
  it("classifies exact, near and miss with a signed error", () => {
    expect(classifyHit("emerging", "emerging")).toEqual({ hit: "exact", error: 0 });
    expect(classifyHit("growing", "emerging")).toEqual({ hit: "near", error: 1 });
    expect(classifyHit("early_signal", "growing")).toEqual({ hit: "miss", error: -2 });
    expect(classifyHit("nope", "growing")).toBeNull();
  });
  it("summarises hit rates, bias, the persistence baseline and calibration bands", () => {
    const rows = [
      {
        predictedStage: "emerging",
        actualStage: "emerging",
        confidence: 0.8,
        currentStage: "early_signal",
      },
      {
        predictedStage: "growing",
        actualStage: "emerging",
        confidence: 0.5,
        currentStage: "emerging",
      },
      {
        predictedStage: "early_signal",
        actualStage: "growing",
        confidence: 0.2,
        currentStage: "emerging",
      },
      {
        predictedStage: "emerging",
        actualStage: "emerging",
        confidence: 0.2,
        currentStage: "emerging",
      },
    ];
    const s = summarisePredictions(rows);
    expect(s).toMatchObject({
      n: 4,
      exact: 2,
      near: 1,
      miss: 1,
      exactRate: 0.5,
      withinOneRate: 0.75,
    });
    expect(s.meanAbsError).toBe(0.75); // |0| + |+1| + |-2| + |0| over 4
    expect(s.bias).toBe(-0.25); // (0 + 1 - 2 + 0) / 4
    // persistence baseline ('no change' = stage at prediction time): near, exact, near, exact -> exact 2/4, within-one 4/4
    expect(s.baselineExactRate).toBe(0.5);
    expect(s.baselineWithinOneRate).toBe(1);
    expect(s.byConfidence.map((b) => [b.band, b.n])).toEqual([
      ["high", 1],
      ["medium", 1],
      ["low", 2],
    ]);
  });
  it("handles an empty history", () => {
    expect(summarisePredictions([])).toMatchObject({ n: 0, exactRate: null, meanAbsError: null });
  });
});

describe("csv and pipeline helpers", () => {
  it("quotes properly and neutralises spreadsheet formulas, but leaves negative numbers alone", () => {
    const csv = toCsv(
      [
        { key: "a", label: "Name" },
        { key: "b", label: "Note" },
        { key: "c", label: "Delta" },
      ],
      [
        { a: 'He said "hi", ok', b: '=HYPERLINK("x")', c: -3.5 },
        { a: "+cmd", b: null, c: 2 },
      ],
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Name,Note,Delta");
    expect(lines[1]).toBe('"He said ""hi"", ok","\'=HYPERLINK(""x"")",-3.5');
    expect(lines[2]).toBe("'+cmd,,2");
  });
  it("flags ideas as stuck after 21 days, except scaling and dropped", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(isStuck("sourcing", new Date("2026-11-01T00:00:00Z"), now)).toBe(true);
    expect(isStuck("sourcing", new Date("2026-11-20T00:00:00Z"), now)).toBe(false);
    expect(isStuck("scaling", new Date("2026-01-01T00:00:00Z"), now)).toBe(false);
    expect(isStuck("dropped", new Date("2026-01-01T00:00:00Z"), now)).toBe(false);
  });
  it("weekStart returns the Monday", () => {
    expect(weekStart(new Date("2026-11-26T10:00:00Z"))).toBe("2026-11-23");
    expect(weekStart(new Date("2026-11-23T00:00:00Z"))).toBe("2026-11-23");
    expect(weekStart(new Date("2026-11-29T23:59:00Z"))).toBe("2026-11-23");
  });
});

const T = (o: Partial<ReportTrend> & { id: number; name: string }): ReportTrend => ({
  isSample: false,
  status: "tracked",
  createdAt: "2026-10-01T00:00:00Z",
  opportunity: 50,
  prevOpportunity: 50,
  stage: "emerging",
  prevStage: "emerging",
  confidenceLevel: "medium",
  hasScenario: true,
  hasReviews: true,
  ...o,
});
const base = (over: Partial<ReportInput> = {}): ReportInput => ({
  weekOf: "2026-11-23",
  generatedAt: "2026-11-29T05:00:00Z",
  mode: "real",
  trends: [],
  windows: [],
  alerts: [],
  pipeline: [],
  dataHealth: { staleSources: [], neverRunSources: [], indicativeTables: false },
  ...over,
});

describe("weekly report", () => {
  it("ranks the top 10, finds new entrants, risers, fallers and stage changes from data only", () => {
    const trends = [
      T({ id: 1, name: "A", opportunity: 90, prevOpportunity: 70 }),
      T({ id: 2, name: "B", opportunity: 60, prevOpportunity: 75 }),
      T({
        id: 3,
        name: "C",
        opportunity: 55,
        prevOpportunity: 54,
        createdAt: "2026-11-27T00:00:00Z",
      }),
      T({ id: 4, name: "D", opportunity: 48, stage: "growing", prevStage: "emerging" }),
      T({ id: 5, name: "Sample", opportunity: 99, isSample: true }),
      T({ id: 6, name: "Unscored", opportunity: null, prevOpportunity: null }),
    ];
    const r = composeReport(base({ trends }));
    expect(r.topOpportunities.map((x) => x.name)).toEqual(["A", "B", "C", "D"]); // real mode excludes the sample trend
    expect(r.topOpportunities[0]).toMatchObject({ delta: 20 });
    expect(r.rising.map((x) => x.name)).toEqual(["A"]);
    expect(r.fading.map((x) => x.name)).toEqual(["B"]);
    expect(r.newEntrants.map((x) => x.name)).toContain("C");
    expect(r.stageChanges).toEqual([{ id: 4, name: "D", from: "emerging", to: "growing" }]);
  });
  it("sample mode includes sample trends and says so loudly", () => {
    const r = composeReport(
      base({ mode: "sample", trends: [T({ id: 1, name: "S", isSample: true, opportunity: 80 })] }),
    );
    expect(r.topOpportunities[0]!.isSample).toBe(true);
    expect(r.caveats[0]).toMatch(/SAMPLE DATA/);
    expect(r.suggestedActions[0]).toMatch(/SAMPLE data/);
    expect(reportToMarkdown(r)).toMatch(/SAMPLE DATA/);
  });
  it("derives suggested actions from gaps: missing scenario/reviews, deadlines, stuck ideas, stale sources, indicative tables", () => {
    const r = composeReport(
      base({
        trends: [T({ id: 1, name: "Top", opportunity: 90, hasScenario: false, hasReviews: false })],
        windows: [
          {
            festival: "Diwali",
            date: "2027-10-29",
            importDeadline: "2027-07-16",
            daysToImportDeadline: 20,
            status: "start_now",
            gifts: [{ id: 1, name: "Candle set", opportunity: 70 }],
          },
        ],
        pipeline: [
          {
            id: 9,
            title: "Old idea",
            stage: "sourcing",
            updatedAt: "2026-10-01T00:00:00Z",
            stuck: true,
          },
        ],
        dataHealth: {
          staleSources: ["google_trends"],
          neverRunSources: ["etsy"],
          indicativeTables: true,
        },
      }),
    );
    const a = r.suggestedActions.join("\n");
    expect(a).toMatch(/Run unit economics for "Top"/);
    expect(a).toMatch(/Import reviews for "Top"/);
    expect(a).toMatch(/Order samples of "Candle set" for Diwali.*2027-07-16/);
    expect(a).toMatch(/stuck idea "Old idea"/);
    expect(a).toMatch(/never run: etsy/);
    expect(a).toMatch(/stale sources: google_trends/);
    expect(a).toMatch(/Verify the duty and fee tables/);
    expect(r.pipeline.byStage).toEqual({ sourcing: 1 });
    expect(r.caveats.join(" ")).toMatch(/indicative/);
  });
  it("renders markdown and escaped HTML without throwing on an empty week", () => {
    const r = composeReport(base({ trends: [T({ id: 1, name: "<b>Evil</b>", opportunity: 70 })] }));
    expect(reportToHtml(r)).not.toMatch(/<b>Evil/);
    expect(reportToHtml(r)).toMatch(/&lt;b&gt;Evil/);
    const empty = composeReport(base());
    expect(reportToMarkdown(empty)).toMatch(/No scored trends yet/);
  });
});
