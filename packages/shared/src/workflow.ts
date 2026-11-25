import { z } from "zod";
import type { AdoptionStage } from "./schemas";
import { stageFromRatio } from "./scoring";

// ------------------------------------------------------------------ pipeline
export const PIPELINE_STAGES = [
  "spotted",
  "researching",
  "sourcing",
  "sample_ordered",
  "listed",
  "scaling",
  "dropped",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export const PIPELINE_LABEL: Record<PipelineStage, string> = {
  spotted: "Spotted",
  researching: "Researching",
  sourcing: "Sourcing",
  sample_ordered: "Sample ordered",
  listed: "Listed",
  scaling: "Scaling",
  dropped: "Dropped",
};
export const STUCK_DAYS = 21;
export const isStuck = (stage: string, updatedAt: Date, now: Date): boolean =>
  stage !== "scaling" &&
  stage !== "dropped" &&
  (now.getTime() - updatedAt.getTime()) / 86_400_000 > STUCK_DAYS;

// ------------------------------------------------------------------ stages
export const STAGE_ORDER: AdoptionStage[] = [
  "not_yet_visible",
  "early_signal",
  "emerging",
  "growing",
  "mainstream",
  "saturated",
];
export const stageIndex = (s: string | null | undefined): number =>
  s ? STAGE_ORDER.indexOf(s as AdoptionStage) : -1;

// ------------------------------------------------------------------ alerts
export const ALERT_TYPES = ["score_above", "india_rising", "india_stage_up"] as const;
export const ALERT_LABEL: Record<(typeof ALERT_TYPES)[number], string> = {
  score_above: "Opportunity crosses a score",
  india_rising: "India search starts rising",
  india_stage_up: "India adoption stage advances",
};
export const alertRuleSchema = z.object({
  type: z.enum(ALERT_TYPES),
  threshold: z.number().min(0).max(100).optional(),
  scope: z.enum(["trend", "watchlist", "all"]).default("trend"),
  watchlistId: z.number().int().optional(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;
export interface AlertSnapshot {
  opportunity: number | null;
  indiaMomentum: number | null;
  stage: string | null;
}

export const DEFAULT_THRESHOLD = { score_above: 75, india_rising: 60, india_stage_up: 0 } as const;

/**
 * Fires on a CROSSING, not on every run: score_above when it reaches the threshold (or on first sight above it),
 * india_rising when India's own momentum reaches the threshold, india_stage_up when the stage advances.
 */
export function evaluateRule(
  rule: AlertRule,
  current: AlertSnapshot,
  previous: AlertSnapshot | null,
  trendName: string,
): { fired: boolean; message?: string } {
  const t = rule.threshold ?? DEFAULT_THRESHOLD[rule.type];
  if (rule.type === "score_above") {
    if (current.opportunity == null || current.opportunity < t) return { fired: false };
    if (previous?.opportunity != null && previous.opportunity >= t) return { fired: false };
    return {
      fired: true,
      message: `${trendName}: Opportunity is now ${Math.round(current.opportunity)} (threshold ${t})`,
    };
  }
  if (rule.type === "india_rising") {
    if (current.indiaMomentum == null || current.indiaMomentum < t) return { fired: false };
    if (previous?.indiaMomentum != null && previous.indiaMomentum >= t) return { fired: false };
    return {
      fired: true,
      message: `${trendName}: India search momentum reached ${Math.round(current.indiaMomentum)} (threshold ${t})`,
    };
  }
  const a = stageIndex(current.stage),
    b = stageIndex(previous?.stage);
  if (a < 0 || b < 0 || a <= b) return { fired: false };
  return {
    fired: true,
    message: `${trendName}: India stage advanced from ${previous!.stage!.replace(/_/g, " ")} to ${current.stage!.replace(/_/g, " ")}`,
  };
}

// ------------------------------------------------------------------ stage predictor
export const PREDICTION_HORIZON_MONTHS = 6;
export interface PredictionBasis {
  ratio: number | null;
  growth13: number | null;
  currentStage: string | null;
}

/**
 * Baseline extrapolation: India's share of the foreign peak keeps growing at its recent quarterly rate.
 * projected = ratio x (1 + growth13)^(months / 3), capped at 1.2; stage from the same bands as the live stage.
 * It is deliberately simple so that the tracker can say whether it beats "nothing changes".
 */
export function predictStage(
  b: PredictionBasis,
  horizonMonths = PREDICTION_HORIZON_MONTHS,
): { stage: AdoptionStage; projectedRatio: number } | null {
  if (b.ratio == null || b.growth13 == null) return null;
  const factor = Math.max(0, 1 + b.growth13) ** (horizonMonths / 3);
  const projected = Math.min(1.2, Math.max(0, b.ratio * factor));
  const stage = stageFromRatio(projected, b.growth13, true);
  return stage ? { stage, projectedRatio: Math.round(projected * 10000) / 10000 } : null;
}

export type Hit = "exact" | "near" | "miss";
export function classifyHit(predicted: string, actual: string): { hit: Hit; error: number } | null {
  const a = stageIndex(predicted),
    b = stageIndex(actual);
  if (a < 0 || b < 0) return null;
  const error = a - b; // + means we predicted further along than reality
  return { hit: error === 0 ? "exact" : Math.abs(error) === 1 ? "near" : "miss", error };
}

export interface ResolvedPrediction {
  predictedStage: string;
  actualStage: string;
  confidence: number | null;
  currentStage: string | null;
}
export interface PredictionSummary {
  n: number;
  exact: number;
  near: number;
  miss: number;
  exactRate: number | null;
  withinOneRate: number | null;
  meanAbsError: number | null;
  bias: number | null;
  /** accuracy of "nothing changes" (predict the stage we saw when predicting): the bar the model must beat */
  baselineExactRate: number | null;
  baselineWithinOneRate: number | null;
  byConfidence: {
    band: "high" | "medium" | "low";
    n: number;
    exactRate: number | null;
    withinOneRate: number | null;
  }[];
}

export function summarisePredictions(rows: ResolvedPrediction[]): PredictionSummary {
  const rate = (k: number, n: number) => (n ? Math.round((k / n) * 1000) / 1000 : null);
  const cls = rows
    .map((r) => ({ r, c: classifyHit(r.predictedStage, r.actualStage) }))
    .filter(
      (x): x is { r: ResolvedPrediction; c: NonNullable<ReturnType<typeof classifyHit>> } =>
        x.c != null,
    );
  const n = cls.length;
  const exact = cls.filter((x) => x.c.hit === "exact").length,
    near = cls.filter((x) => x.c.hit === "near").length;
  const base = cls
    .map((x) => (x.r.currentStage ? classifyHit(x.r.currentStage, x.r.actualStage) : null))
    .filter((x): x is NonNullable<typeof x> => x != null);
  const band = (c: number | null) =>
    (c == null ? "low" : c >= 0.7 ? "high" : c >= 0.4 ? "medium" : "low") as
      "high" | "medium" | "low";
  return {
    n,
    exact,
    near,
    miss: n - exact - near,
    exactRate: rate(exact, n),
    withinOneRate: rate(exact + near, n),
    meanAbsError: n
      ? Math.round((cls.reduce((a, x) => a + Math.abs(x.c.error), 0) / n) * 100) / 100
      : null,
    bias: n ? Math.round((cls.reduce((a, x) => a + x.c.error, 0) / n) * 100) / 100 : null,
    baselineExactRate: rate(base.filter((x) => x.hit === "exact").length, base.length),
    baselineWithinOneRate: rate(base.filter((x) => x.hit !== "miss").length, base.length),
    byConfidence: (["high", "medium", "low"] as const).map((b) => {
      const g = cls.filter((x) => band(x.r.confidence) === b);
      return {
        band: b,
        n: g.length,
        exactRate: rate(g.filter((x) => x.c.hit === "exact").length, g.length),
        withinOneRate: rate(g.filter((x) => x.c.hit !== "miss").length, g.length),
      };
    }),
  };
}

// ------------------------------------------------------------------ CSV
const FORMULA = /^[=+\-@\t\r]/;
/** RFC-4180 CSV. Cells that start with = + - @ are prefixed with ' so spreadsheets never run them as formulas. */
export function toCsv(
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
): string {
  const cell = (v: unknown) => {
    let s =
      v == null
        ? ""
        : v instanceof Date
          ? v.toISOString()
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
    if (FORMULA.test(s) && !(typeof v === "number" && Number.isFinite(v))) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    [
      columns.map((c) => cell(c.label)).join(","),
      ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
