export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !location.pathname.startsWith("/login")
  )
    location.href = "/login";
  if (!res.ok)
    throw new ApiError(res.status, (await res.json().catch(() => ({})))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

export interface TrendRow {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  subCategory: string | null;
  verticalKeys: string[];
  occasionKeys: string[];
  priceBandInr: string | null;
  isSample: boolean;
  momentum: number | null;
  breadth: number | null;
  sustainability: number | null;
  commercialProof: number | null;
  opportunity: number | null;
  adoptionStage: string | null;
  lagMonths: number | null;
  confidence: number | null;
  algorithmVersion: string | null;
  status: string;
  origin: string;
  newsCount: number;
  productCount: number;
  lastSignalAt: string | null;
  coverage: number | null;
  confidenceLevel: string | null;
}
export interface SourceRow {
  id: number;
  key: string;
  name: string;
  type: string;
  method: string;
  scraped: boolean;
  enabled: boolean;
  reliability: number;
  limitCalls: number;
  limitWindow: string;
  termsNote: string | null;
  phase: number;
  status: string;
  usedToday: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  confidenceLevel: string;
  implemented: boolean;
  runnable: boolean;
}
export interface NewsRow {
  id: number;
  trendId: number | null;
  headline: string;
  publisher: string | null;
  publishedAt: string | null;
  url: string;
}
export interface ProductRow {
  id: number;
  marketplace: string;
  country: string;
  title: string;
  url: string | null;
  price: number | null;
  currency: string | null;
  rating: number | null;
  reviewCount: number | null;
  rank: number | null;
  prevRank: number | null;
  listType: string | null;
  fetchedAt: string;
  scraped: boolean | null;
}
export interface RunRow {
  id: number;
  source: string;
  status: string;
  startedAt: string;
  items: number;
  error: string | null;
}
export interface VersionRow {
  version: string;
  releasedOn: string;
  title: string;
  summary: string;
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
  forYou: string;
}

export interface Contribution {
  key: string;
  value: number | null;
  weight: number;
  effectiveWeight: number;
  contribution: number;
}
export interface ScoreDetail {
  scored: boolean;
  isSample: boolean;
  algorithmVersion?: string;
  computedAt?: string;
  momentum: number | null;
  breadth: number | null;
  sustainability: number | null;
  commercialProof: number | null;
  adoptionStage: string | null;
  lagMonths: number | null;
  confidence: number;
  opportunity: number | null;
  defaultOpportunity: number | null;
  customWeights: boolean;
  weights: Record<string, number>;
  defaults: Record<string, number>;
  info: Record<string, { label: string; help: string; availableFrom: string }>;
  explain: {
    score: number | null;
    coverage: number;
    contributions: Contribution[];
    capped: boolean;
    note?: string;
  } | null;
  inputs: {
    confidence: { value: number; level: string; parts: Record<string, number> };
    foreign: {
      momentum: number;
      countries_observed: number;
      countries_confirming: number;
      agreement: number;
      sustainability: {
        score: number | null;
        spikiness: number | null;
        persistence: number | null;
        slope_stability: number | null;
      };
    } | null;
    india: {
      present: boolean;
      comparable: boolean;
      ratio: number | null;
      weeks_since_early: number | null;
    };
    leadLag: {
      lag: number;
      months: number;
      correlation: number | null;
      usable: boolean;
      foreign_country: string;
    } | null;
    categoryLag: {
      lag_months: number | null;
      ci_low: number | null;
      ci_high: number | null;
      n: number;
      basis: string;
      group: string;
    };
    proof: { score: number | null; productCount: number; parts: Record<string, number | null> };
    momentumDetail: Record<
      string,
      { momentum: number | null; growth: Record<string, number | null>; deseasonalised: boolean }
    >;
    sourceTypes: number;
    comparable: boolean;
    notes: string[];
  };
  history: {
    at: string;
    opportunity: number | null;
    momentum: number | null;
    stage: string | null;
  }[];
}
export interface WeightsResponse {
  weights: Record<string, number>;
  defaults: Record<string, number>;
  custom: boolean;
  info: ScoreDetail["info"];
  algorithmVersion: string;
}
export interface BacktestResponse {
  note: string;
  groups: { group: string; n: number; medianLagMonths: number | null; measured: number }[];
  cases: {
    id: number;
    name: string;
    term: string;
    group: string;
    usRise: string;
    inRise: string;
    estimatedLagMonths: number;
    measuredLagMonths: number | null;
    measuredCorrelation: number | null;
  }[];
}
