export interface AnalyzeRequest {
  weeks: string[];
  series: Record<string, (number | null)[]>;
  comparable: boolean;
  priorities: Record<string, number>;
}
export interface CountryResult {
  momentum: number | null;
  weighted_growth: number | null;
  growth: Record<string, number | null>;
  deseasonalised: boolean;
  recent_level: number;
  peak: number;
  weeks: number;
}
export interface AnalyzeResult {
  per_country: Record<string, CountryResult>;
  notes: string[];
  history_weeks: number;
  last_week: string | null;
  foreign: {
    momentum: number;
    countries_observed: number;
    countries_confirming: number;
    agreement: number;
    peak: number;
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
    growth13: number | null;
    weeks_since_early: number | null;
  };
  lead_lag: {
    lag: number;
    months: number;
    correlation: number | null;
    usable: boolean;
    n: number;
    foreign_country: string;
  } | null;
}
export interface CategoryLag {
  lag_months: number | null;
  ci_low: number | null;
  ci_high: number | null;
  n: number;
  basis: "group" | "global" | "none";
}
export interface LeadLagResult {
  lag: number;
  correlation: number | null;
  usable: boolean;
  n: number;
}

/** The Python service. Injectable so scoring is testable without it. */
export interface AnalyticsClient {
  analyze(req: AnalyzeRequest): Promise<AnalyzeResult>;
  categoryLag(
    cases: { group: string; lag_months: number | null }[],
    group: string,
  ): Promise<CategoryLag>;
  leadLag(
    foreign: number[],
    india: number[],
    maxLag: number,
    smooth: number,
  ): Promise<LeadLagResult>;
}

export function httpAnalytics(baseUrl: string, timeoutMs = 60_000): AnalyticsClient {
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new Error(
        `Analytics service unreachable at ${baseUrl} (is it running? docker compose up analytics): ${e instanceof Error ? e.message : e}`,
      );
    }
    if (!res.ok)
      throw new Error(
        `Analytics ${path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    return (await res.json()) as T;
  };
  return {
    analyze: (req) => post("/analyze", req),
    categoryLag: (cases, group) => post("/backtest/category-lag", { cases, group }),
    leadLag: (foreign, india, maxLag, smooth) =>
      post("/lead-lag", { foreign, india, max_lag: maxLag, smooth }),
  };
}
