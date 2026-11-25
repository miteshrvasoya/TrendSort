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

export interface GiftItem {
  id: number;
  name: string;
  category: string | null;
  isSample: boolean;
  status: string;
  occasions: string[];
  recipients: string[];
  ageGroups: string[];
  interests: string[];
  personalisation: string;
  range: { min: number; max: number } | null;
  priceSource: "profile" | "foreign_converted" | null;
  needsDetails: boolean;
  corporate: {
    moq: number;
    branding: string[];
    leadTimeDays: number;
    priceBreaks: { qty: number; discountPct: number }[];
  } | null;
  opportunity: number | null;
  confidenceLevel: string | null;
  stage: string | null;
  lagMonths: number | null;
  listings: {
    title: string;
    url: string | null;
    marketplace: string;
    price: number | null;
    currency: string | null;
    rank: number | null;
    listType: string | null;
    scraped: boolean;
  }[];
  hint: { hubs: string; route: string };
  group: string;
}
export interface WindowInfo {
  festivalDate: string;
  daysToFestival: number;
  importDeadline: string;
  manufactureDeadline: string;
  daysToImportDeadline: number;
  status: "start_now" | "manufacture_only" | "missed";
}
export interface GiftsResponse {
  items: GiftItem[];
  count: number;
  hiddenSaturated: number;
  window: (WindowInfo & { festival: string }) | null;
  evergreen: boolean;
}
export interface GiftFacets {
  occasions: { key: string; name: string; festival: boolean }[];
  recipients: string[];
  ages: string[];
  interests: string[];
  personalisation: string[];
  budgets: { key: string; label: string }[];
}
export interface GiftWeek {
  week: string;
  item: GiftItem | null;
  reason: string;
  festival?: string;
  window?: WindowInfo;
}
export interface WindowsResponse {
  today: string;
  windows: (WindowInfo & {
    key: string;
    name: string;
    foreignEquivalent: string;
    giftIntensity: number;
    gifts: {
      id: number;
      name: string;
      opportunity: number | null;
      stage: string | null;
      confidenceLevel: string | null;
      range: { min: number; max: number } | null;
      isSample: boolean;
      hint: string;
      group: string;
    }[];
  })[];
}
export interface BundlesResponse {
  candidates: number;
  bundles: {
    itemIds: number[];
    names: string[];
    sumInr: number;
    suggestedInr: number;
    discountPct: number;
    note: string;
    isSample: boolean;
    items: {
      id: number;
      name: string;
      range: { min: number; max: number } | null;
      stage: string | null;
      opportunity: number | null;
    }[];
  }[];
}
export interface CorporateResponse {
  items: GiftItem[];
  defaultPriceBreaks: { qty: number; discountPct: number }[];
  note: string;
}

export interface DefaultsResponse {
  assumptions: import("@trendbridge/shared").Assumptions;
  sources: Record<string, string>;
  group: string;
  trendName: string | null;
  tableVersions: { duty: number | null; fee: number | null };
  fxAsOf: string | null;
}
export interface ScenarioRow {
  id: number;
  trendId: number | null;
  name: string;
  isPrimary: boolean;
  isSample: boolean;
  assumptions: import("@trendbridge/shared").Assumptions;
  results: import("@trendbridge/shared").EconomicsResult;
  tableVersions: Record<string, number | null>;
  updatedAt: string;
}
export interface TablesResponse {
  duty: {
    id: number;
    groupKey: string;
    hsCode: string;
    basicDutyPct: number;
    igstPct: number;
    otherPct: number;
    version: number;
    isIndicative: boolean;
    effectiveFrom: string;
    note: string | null;
  }[];
  fees: {
    id: number;
    marketplace: string;
    category: string;
    referralPct: number;
    closingFeeInr: number;
    version: number;
    isIndicative: boolean;
    effectiveFrom: string;
  }[];
  dutyHistory: TablesResponse["duty"];
  feeHistory: TablesResponse["fees"];
  groups: string[];
  marketplaces: string[];
}
export interface ReviewsResponse {
  analysis: import("@trendbridge/shared").ReviewAnalysis | null;
  sources: string[];
  method: string;
}
export interface IndiaListingsResponse {
  listings: {
    id: number;
    marketplace: string;
    title: string;
    priceInr: number | null;
    rating: number | null;
    reviewCount: number | null;
    url: string | null;
  }[];
  count: number;
  priceRange: { min: number; median: number; max: number } | null;
  indiaDataRows: number;
  indiaDataAt: string | null;
  verdict: "listings_found" | "none_found_in_scanned_lists" | "not_checked";
  caveat: string;
}
export interface FitResponse {
  saved: boolean;
  attrs: import("@trendbridge/shared").FitAttrs;
  inferred: import("@trendbridge/shared").FitAttrs;
  brandHits: string[];
  checks: import("@trendbridge/shared").FitCheck[];
  scores: { regulatory: number; logistics: number };
  disclaimer: string;
}

export interface VerticalSummary {
  key: string;
  name: string;
  description: string;
  trends: number;
  real: number;
  sample: number;
  scored: number;
  avgOpportunity: number | null;
  top: { id: number; name: string; opportunity: number | null; isSample: boolean } | null;
  hasFeatures: boolean;
  tools: string[];
  customised: boolean;
}
export interface VerticalDetail {
  key: string;
  defaults: import("@trendbridge/shared").VerticalConfig;
  overrides: import("@trendbridge/shared").VerticalOverrides;
  effective: import("@trendbridge/shared").VerticalConfig;
}
export interface FeatureRow {
  key: string;
  label: string;
  description: string;
  presence: number;
  defaultPresence: number;
  presenceLabel: string;
  presenceNote: string;
  edited: boolean;
  gap: number | null;
  trend: {
    id: number;
    name: string;
    isSample: boolean;
    stage: string | null;
    opportunity: number | null;
    foreignMomentum: number | null;
    confidenceLevel: string | null;
  } | null;
}
export interface FeatureMatrix {
  features: FeatureRow[];
  waterProfiles: NonNullable<import("@trendbridge/shared").VerticalConfig["waterProfiles"]>;
  note: string;
}
