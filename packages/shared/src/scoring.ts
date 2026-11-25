import type { AdoptionStage } from "./schemas";

/** Scoring algorithm version. Bump on any formula change; scores are stored per version. */
export const ALGORITHM_VERSION = "1.0.0";

// ---------------------------------------------------------------- weights
export const COMPONENT_KEYS = [
  "foreignMomentum",
  "lagWindow",
  "competitionGap",
  "priceFit",
  "margin",
  "regulatory",
  "logistics",
  "seasonality",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];
export type Weights = Record<ComponentKey, number>;
export type Components = Record<ComponentKey, number | null>;

export const DEFAULT_WEIGHTS: Weights = {
  foreignMomentum: 0.22,
  lagWindow: 0.18,
  competitionGap: 0.14,
  priceFit: 0.1,
  margin: 0.14,
  regulatory: 0.07,
  logistics: 0.05,
  seasonality: 0.1,
};

export const COMPONENT_INFO: Record<
  ComponentKey,
  { label: string; help: string; availableFrom: string }
> = {
  foreignMomentum: {
    label: "Foreign momentum",
    help: "Blend of Momentum (40%), Breadth (20%), Sustainability (25%) and Commercial proof (15%), renormalised over what is available.",
    availableFrom: "0.3.0",
  },
  lagWindow: {
    label: "Lag window remaining",
    help: "How much of the typical India adoption lag for this category is still left, from the back-test lag and India's own early-signal date.",
    availableFrom: "0.3.0",
  },
  competitionGap: {
    label: "Indian competition gap",
    help: "Proxy: 100 minus India's search interest as a share of the foreign peak. Replaced by Indian listing density when India marketplace data arrives (Phase 4).",
    availableFrom: "0.3.0",
  },
  priceFit: {
    label: "Price fit (INR)",
    help: "Affordability for the target band. Needs landed cost and India price data (Phase 4).",
    availableFrom: "0.5.0",
  },
  margin: {
    label: "Margin potential",
    help: "Best of import vs manufacture from the unit-economics model (Phase 4).",
    availableFrom: "0.5.0",
  },
  regulatory: {
    label: "Regulatory ease",
    help: "BIS/WPC/CDSCO and import rules (Phase 4).",
    availableFrom: "0.5.0",
  },
  logistics: {
    label: "Logistics feasibility",
    help: "Size, fragility and shipping (Phase 4).",
    availableFrom: "0.5.0",
  },
  seasonality: {
    label: "Seasonality alignment",
    help: "Can an import land before the next relevant Indian festival? Evergreen occasions score 60.",
    availableFrom: "0.3.0",
  },
};

/** Clamp negatives, renormalise to sum 1. Falls back to defaults when everything is zero. */
export function normaliseWeights(w: Partial<Record<ComponentKey, number>>): Weights {
  const raw = COMPONENT_KEYS.map((k) => Math.max(0, Number.isFinite(w[k]) ? (w[k] as number) : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(COMPONENT_KEYS.map((k, i) => [k, raw[i]! / sum])) as Weights;
}

// ---------------------------------------------------------------- opportunity
export interface Contribution {
  key: ComponentKey;
  value: number | null;
  weight: number;
  effectiveWeight: number;
  contribution: number;
}
export interface OpportunityResult {
  score: number | null;
  coverage: number; // share of total weight that had data
  contributions: Contribution[];
  capped: boolean;
  note?: string;
}

/**
 * Opp = sum(w_i * c_i) / sum(w_i over available components).
 * Missing components are NOT treated as zero or neutral: they are excluded and lower coverage (and confidence).
 * Needs foreignMomentum and at least 30% of the weight; capped at 49 if margin or regulatory ease is below 15.
 */
export function computeOpportunity(c: Components, weights: Weights): OpportunityResult {
  const w = normaliseWeights(weights);
  const avail = COMPONENT_KEYS.filter((k) => c[k] != null);
  const coverage = avail.reduce((a, k) => a + w[k], 0);
  const contributions: Contribution[] = COMPONENT_KEYS.map((k) => {
    const v = c[k];
    const eff = v != null && coverage > 0 ? w[k] / coverage : 0;
    return {
      key: k,
      value: v,
      weight: w[k],
      effectiveWeight: eff,
      contribution: v != null ? v * eff : 0,
    };
  });
  if (c.foreignMomentum == null || coverage < 0.3) {
    return {
      score: null,
      coverage,
      contributions,
      capped: false,
      note: "Not enough inputs to score (needs foreign momentum and at least 30% of the weight).",
    };
  }
  let score = contributions.reduce((a, x) => a + x.contribution, 0);
  let capped = false;
  let note: string | undefined;
  if ((c.margin != null && c.margin < 15) || (c.regulatory != null && c.regulatory < 15)) {
    if (score > 49) {
      score = 49;
      capped = true;
      note = "Capped at 49: margin or regulatory ease is very low.";
    }
  }
  return { score: Math.round(score * 10) / 10, coverage, contributions, capped, note };
}

// ---------------------------------------------------------------- foreign blend
export interface ForeignParts {
  momentum: number | null;
  breadth: number | null;
  sustainability: number | null;
  proof: number | null;
}
const BLEND = { momentum: 0.4, breadth: 0.2, sustainability: 0.25, proof: 0.15 } as const;

export function blendForeign(p: ForeignParts): number | null {
  let num = 0,
    den = 0;
  for (const k of Object.keys(BLEND) as (keyof ForeignParts)[]) {
    const v = p[k];
    if (v != null) {
      num += v * BLEND[k];
      den += BLEND[k];
    }
  }
  return p.momentum == null || den === 0 ? null : Math.round((num / den) * 10) / 10;
}

// ---------------------------------------------------------------- breadth
/** 60% country confirmation (4+ countries = full), 40% independent source types (search, marketplace, news, social; 4 = full). */
export function breadthScore(countriesConfirming: number, sourceTypes: number): number {
  return (
    Math.round(
      100 * (0.6 * Math.min(1, countriesConfirming / 4) + 0.4 * Math.min(1, sourceTypes / 4)) * 10,
    ) / 10
  );
}

// ---------------------------------------------------------------- adoption stage
/**
 * India index as a share of the foreign peak (valid only when both come from one jointly-normalised comparison or are sample data).
 * <2% not visible, 2-8 early, 8-25 emerging, 25-60 growing, 60-100 mainstream; saturated if above the foreign peak,
 * or mainstream-level and India has stopped growing.
 */
export function stageFromRatio(
  ratio: number | null,
  indiaGrowth13w: number | null,
  comparable: boolean,
): AdoptionStage | null {
  if (!comparable || ratio == null) return null;
  if (ratio > 1) return "saturated";
  if (ratio >= 0.6)
    return indiaGrowth13w != null && indiaGrowth13w <= 0 ? "saturated" : "mainstream";
  if (ratio >= 0.25) return "growing";
  if (ratio >= 0.08) return "emerging";
  if (ratio >= 0.02) return "early_signal";
  return "not_yet_visible";
}

export const competitionGapFromRatio = (ratio: number | null): number | null =>
  ratio == null ? null : Math.round(100 * (1 - Math.min(1, Math.max(0, ratio))) * 10) / 10;

// ---------------------------------------------------------------- lag window
/** Share of the category lag still ahead of us. Late stages leave no window. */
export function lagWindowScore(
  categoryLagMonths: number | null,
  monthsSinceIndiaEarly: number | null,
  stage: AdoptionStage | null,
): number | null {
  if (categoryLagMonths == null || categoryLagMonths <= 0 || stage == null) return null;
  if (stage === "mainstream" || stage === "saturated") return 0;
  const elapsed = stage === "not_yet_visible" ? 0 : (monthsSinceIndiaEarly ?? 0);
  return (
    Math.round(
      100 * Math.min(1, Math.max(0, (categoryLagMonths - elapsed) / categoryLagMonths)) * 10,
    ) / 10
  );
}

// ---------------------------------------------------------------- seasonality
export const EVERGREEN_OCCASIONS = new Set([
  "birthday",
  "anniversary",
  "wedding",
  "housewarming",
  "baby-shower",
  "corporate",
]);
export const IMPORT_LEAD_DAYS = 84; // order + production + sea/air freight + clearance

/** Best alignment across the trend's occasions. null when the trend has no occasions. */
export function seasonalityScore(
  occasionKeys: string[],
  today: Date,
  festivals: { key: string; dates: Record<string, string> }[],
): number | null {
  if (occasionKeys.length === 0) return null;
  let best: number | null = null;
  for (const o of occasionKeys) {
    let s: number | null = null;
    if (EVERGREEN_OCCASIONS.has(o)) s = 60;
    else {
      const f = festivals.find((x) => x.key === o);
      if (f) {
        const days = Object.values(f.dates)
          .map((d) => (new Date(d).getTime() - today.getTime()) / 86_400_000)
          .filter((d) => d > 0)
          .sort((a, b) => a - b)[0];
        if (days != null)
          s = days < 45 ? 20 : days < IMPORT_LEAD_DAYS * 2 ? 100 : days < 240 ? 70 : 40;
      }
    }
    if (s != null) best = best == null ? s : Math.max(best, s);
  }
  return best;
}

// ---------------------------------------------------------------- commercial proof (marketplace proxies; never sales)
export interface ProofProduct {
  rank: number | null;
  reviewSnapshots: { t: number; count: number }[];
  prices: number[];
}
export interface ProofResult {
  score: number | null;
  parts: {
    rank: number | null;
    reviewVelocity: number | null;
    breadth: number | null;
    priceStability: number | null;
  };
  productCount: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function commercialProof(products: ProofProduct[]): ProofResult {
  const n = products.length;
  if (n === 0)
    return {
      score: null,
      parts: { rank: null, reviewVelocity: null, breadth: null, priceStability: null },
      productCount: 0,
    };
  const ranks = products
    .map((p) => p.rank)
    .filter((r): r is number => r != null)
    .sort((a, b) => a - b)
    .slice(0, 3);
  const rank = ranks.length
    ? ranks.reduce((a, r) => a + 100 * clamp01(1 - Math.log(Math.max(1, r)) / Math.log(100)), 0) /
      ranks.length
    : null;
  const vels = products.flatMap((p) => {
    const s = [...p.reviewSnapshots].sort((a, b) => a.t - b.t);
    if (s.length < 2) return [];
    const days = (s.at(-1)!.t - s[0]!.t) / 86_400_000;
    return days >= 3 ? [Math.max(0, (s.at(-1)!.count - s[0]!.count) / days) * 30] : [];
  });
  const reviewVelocity = vels.length
    ? 100 * clamp01(Math.log(1 + Math.max(...vels)) / Math.log(1001))
    : null;
  const breadth = 100 * clamp01(n / 10);
  const cvs = products.flatMap((p) => {
    if (p.prices.length < 3) return [];
    const m = p.prices.reduce((a, b) => a + b, 0) / p.prices.length;
    const sd = Math.sqrt(p.prices.reduce((a, b) => a + (b - m) ** 2, 0) / p.prices.length);
    return m > 0 ? [sd / m] : [];
  });
  const priceStability = cvs.length
    ? 100 * clamp01(1 - (cvs.reduce((a, b) => a + b, 0) / cvs.length) * 5)
    : null;
  const W = { rank: 0.35, reviewVelocity: 0.3, breadth: 0.2, priceStability: 0.15 };
  const parts = { rank, reviewVelocity, breadth, priceStability };
  let num = 0,
    den = 0;
  for (const k of Object.keys(W) as (keyof typeof W)[]) {
    const v = parts[k];
    if (v != null) {
      num += v * W[k];
      den += W[k];
    }
  }
  const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
  return {
    score: den ? r1(num / den) : null,
    parts: {
      rank: r1(rank),
      reviewVelocity: r1(reviewVelocity),
      breadth: r1(breadth),
      priceStability: r1(priceStability),
    },
    productCount: n,
  };
}

// ---------------------------------------------------------------- confidence
export interface ConfidenceInputs {
  coverage: number; // weight share of opportunity inputs available (0-1)
  sourceReliability: number; // mean reliability of contributing sources (0-1)
  historyWeeks: number;
  agreement: number; // share of foreign countries agreeing on direction (0-1)
  freshnessDays: number | null; // age of newest data point
  isSample: boolean;
}
export interface ConfidenceResult {
  value: number;
  level: "high" | "medium" | "low" | "sample";
  parts: Record<string, number>;
}

export function confidence(i: ConfidenceInputs): ConfidenceResult {
  const history = clamp01(i.historyWeeks / 156);
  const fresh = i.freshnessDays == null ? 0 : clamp01(1 - Math.max(0, i.freshnessDays - 14) / 60);
  const parts = {
    coverage: 0.3 * clamp01(i.coverage),
    sourceReliability: 0.25 * clamp01(i.sourceReliability),
    history: 0.2 * history,
    agreement: 0.15 * clamp01(i.agreement),
    freshness: 0.1 * fresh,
  };
  let value = Object.values(parts).reduce((a, b) => a + b, 0);
  if (i.isSample) value = Math.min(value, 0.2);
  value = Math.round(value * 1000) / 1000;
  return {
    value,
    level: i.isSample ? "sample" : value >= 0.7 ? "high" : value >= 0.4 ? "medium" : "low",
    parts,
  };
}

// ---------------------------------------------------------------- lag groups
const GROUPS: [RegExp, string][] = [
  [/water|purif|\bro\b|filter/i, "water"],
  [/personali[sz]ed|custom|engrav|keepsake/i, "personalised"],
  [/kitchen|cook|fryer|coffee|matcha|tea/i, "kitchen"],
  [/wear|ring|watch|tech|gadget|smart|device/i, "tech"],
  [/beauty|skin|hair|face|mask/i, "beauty"],
  [/wellness|sleep|massage|supplement|posture/i, "wellness"],
  [/drink|tumbler|bottle|cup/i, "drinkware"],
  [/home|decor|candle|lamp|diffuser/i, "home"],
  [/pet|dog|cat/i, "pet"],
];
export function lagGroupFor(category: string | null, name = ""): string {
  // category is the stronger signal ("Wellness Gifts" beats "coffee" in the name), so try it first
  for (const text of [category ?? "", name]) {
    for (const [re, g] of GROUPS) if (re.test(text)) return g;
  }
  return "general";
}
