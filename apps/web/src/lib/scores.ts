export const SCORE_HELP = {
  momentum:
    "Momentum (0–100): seasonality-adjusted growth of foreign search interest over ~7, 30, 90 and 365 days, squashed so 50 = flat, 73 = +50% growth, 90 = doubling.",
  breadth:
    "Breadth (0–100): how many foreign countries confirm the rise (4+ = full) and how many independent source types agree (search, marketplace, news, social).",
  sustainability:
    "Sustainability (0–100): fad vs steady rise. Penalises spikes (share of interest in the top 10% of weeks), rewards persistence above the yearly median and a stable slope.",
  proof:
    "Commercial proof (0–100): marketplace proxies only: best-seller rank, review growth, number of products, price stability. It is NOT a sales figure.",
  opportunity:
    "India Opportunity (0–100): weighted blend of foreign momentum, lag window left, Indian competition gap, seasonality and (from v0.5) price fit, margin, regulation and logistics. Missing inputs are excluded, not guessed. Click a trend to see every input and weight.",
  stage:
    "India adoption stage from India's search interest as a share of the foreign peak: <2% not visible, 2–8% early signal, 8–25% emerging, 25–60% growing, 60%+ mainstream, above the peak or flat = saturated. Only shown when India and foreign share one scale.",
  lag: "Typical months India lags the source countries for this product group, the median of the back-test cases (with an 80% interval on the trend page).",
  confidence:
    "Confidence: input coverage, source reliability, history length, agreement across countries and freshness. Sample data is always capped and labelled.",
} as const;
