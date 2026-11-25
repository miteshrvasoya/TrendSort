import {
  ALGORITHM_VERSION,
  DEFAULT_WEIGHTS,
  blendForeign,
  breadthScore,
  competitionGapFromRatio,
  computeOpportunity,
  confidence,
  lagWindowScore,
  marginComponent,
  priceFitComponent,
  stageFromRatio,
  type AdoptionStage,
  type Components,
  type ProofResult,
} from "@trendbridge/shared";
import type { AnalyzeResult, CategoryLag } from "./analytics";

export interface AssembleInput {
  analysis: AnalyzeResult;
  comparable: boolean;
  isSample: boolean;
  sourceTypes: number;
  sourceReliability: number;
  proof: ProofResult;
  seasonality: number | null;
  categoryLag: CategoryLag;
  lagGroup: string;
  freshnessDays: number | null;
  /** from the trend's primary unit-economics scenario (null when none saved) */
  econ?: { marginPct: number; sellingPriceInr: number; route: string } | null;
  giftRange?: { min: number; max: number } | null;
  /** from saved India fit attributes (null when none saved) */
  fit?: { regulatory: number; logistics: number } | null;
}

export interface ScoreRecord {
  algorithmVersion: string;
  momentum: number | null;
  breadth: number | null;
  sustainability: number | null;
  commercialProof: number | null;
  opportunity: number | null;
  adoptionStage: AdoptionStage | null;
  lagMonths: number | null;
  confidence: number;
  isSample: boolean;
  inputs: Record<string, unknown>;
}

/** Pure: combines Python maths and DB-side proxies into one explainable record. */
export function assemble(i: AssembleInput): ScoreRecord {
  const f = i.analysis.foreign;
  const momentum = f?.momentum ?? null;
  const breadth = f ? breadthScore(f.countries_confirming, i.sourceTypes) : null;
  const sustainability = f?.sustainability.score ?? null;
  const proof = i.proof.score;
  const foreignMomentum = blendForeign({ momentum, breadth, sustainability, proof });

  const ratio = i.analysis.india.ratio;
  const stage = stageFromRatio(
    ratio,
    i.analysis.india.growth13,
    i.comparable && i.analysis.india.present,
  );
  const monthsEarly =
    i.analysis.india.weeks_since_early == null ? null : i.analysis.india.weeks_since_early / 4.345;

  const components: Components = {
    foreignMomentum,
    lagWindow: lagWindowScore(i.categoryLag.lag_months, monthsEarly, stage),
    competitionGap: competitionGapFromRatio(stage == null ? null : ratio),
    priceFit: i.econ ? priceFitComponent(i.econ.sellingPriceInr, i.giftRange ?? null) : null,
    margin: i.econ ? marginComponent(i.econ.marginPct) : null,
    regulatory: i.fit?.regulatory ?? null,
    logistics: i.fit?.logistics ?? null,
    seasonality: i.seasonality,
  };
  const opp = computeOpportunity(components, DEFAULT_WEIGHTS);
  const conf = confidence({
    coverage: opp.coverage,
    sourceReliability: i.sourceReliability,
    historyWeeks: i.analysis.history_weeks,
    agreement: f?.agreement ?? 0,
    freshnessDays: i.freshnessDays,
    isSample: i.isSample,
  });
  const notes = [...i.analysis.notes];
  if (opp.note) notes.push(opp.note);
  if (i.isSample)
    notes.push("Sample data: synthetic series. Scores demonstrate the pipeline only.");

  return {
    algorithmVersion: ALGORITHM_VERSION,
    momentum,
    breadth,
    sustainability,
    commercialProof: proof,
    opportunity: opp.score,
    adoptionStage: stage,
    lagMonths: i.categoryLag.lag_months,
    confidence: conf.value,
    isSample: i.isSample,
    inputs: {
      components,
      opportunity: opp,
      confidence: conf,
      foreignMomentum,
      momentumDetail: i.analysis.per_country,
      foreign: f,
      india: i.analysis.india,
      leadLag: i.analysis.lead_lag,
      proof: i.proof,
      categoryLag: { ...i.categoryLag, group: i.lagGroup },
      econ: i.econ ?? null,
      fit: i.fit ?? null,
      sourceTypes: i.sourceTypes,
      comparable: i.comparable,
      notes,
    },
  };
}
