# Scoring methodology (algorithm v1.0.0)

All scores are 0–100 and explainable: every trend page has a **Why this score** panel with inputs, weights and caveats. Maths runs in `services/analytics` (Python); combination and weights are pure TypeScript in `packages/shared/src/scoring.ts` (one implementation shared by workers and API). No score is ever computed from fabricated data; missing inputs are excluded and lower confidence.

## Series preparation

- Weekly interest per country. Gaps are interpolated. Needs ≥ 26 weeks, else the country is skipped.
- **Seasonality**: STL (period 52, robust) when ≥ 104 weeks; the seasonal component is removed. Under 104 weeks the raw series is used and confidence drops.
- Then a 4-week trailing mean.
- Google Trends is fetched as one compare request per keyword so all countries share one scale (the highest point anywhere is 100). Series that did not come from such a request (e.g. manual imports) are marked **not comparable**: foreign momentum still works, but India adoption stage, competition gap and lag window are withheld.

## Momentum

`g_w = (mean(last w weeks) − mean(prior w weeks)) / max(mean(prior), 5)`, clamped to [−1, 3], for w = 1, 4, 13, 52 weeks (≈ 7/30/90/365 days).
`G = 0.15·g1 + 0.30·g4 + 0.35·g13 + 0.20·g52` (renormalised over windows with enough data).
`Momentum = 100 / (1 + e^(−2.2·G))`: flat = 50, +50% ≈ 73, doubling ≈ 90, halving ≈ 25.
Foreign momentum = mean over foreign countries, weighted 1.0 (priority countries) / 0.7 (others).

## Breadth

`100 · (0.6·min(1, countries rising / 4) + 0.4·min(1, source types / 4))`. "Rising" = country momentum ≥ 60. Source types: search, marketplace, news, social (social arrives with Reddit).

## Sustainability

On the foreign average series (last 104 weeks): `100 · (0.4·(1 − spikiness) + 0.3·persistence + 0.3·slope stability)`.

- spikiness = clamp((share of all interest in the top 10% of weeks − 0.10) / 0.30)
- persistence = share of the last 12 weeks above the series median
- slope stability = 1 − clamp(std of rolling 8-week slopes / (3% of mean level))

## Commercial proof (proxies, never sales)

`0.35·rank + 0.30·review velocity + 0.20·breadth + 0.15·price stability`, over what is available. Rank = mean over the best 3 products of `100·(1 − ln(rank)/ln(100))`; review velocity = `ln(1+reviews/month)/ln(1001)` from snapshots ≥ 3 days apart; breadth = products matched / 10; price stability = `1 − 5·CV`. Null with no products.

## India adoption stage

`ratio` = India's last-4-week level ÷ foreign peak (same scale). < 2% Not yet visible · 2–8% Early signal · 8–25% Emerging · 25–60% Growing · 60–100% Mainstream · > 100%, or ≥ 60% and no longer growing → Saturated.
The _India early signal_ date is the first week India stays ≥ 2% of the foreign peak for 4 weeks.

## India lag

- **Category lag**: median India lag in months across back-test cases in the trend's group (`lagGroupFor`), with a seeded 1000-draw bootstrap 80% interval; falls back to all cases when the group has < 3. Measured lag (`measure-lag` job) is preferred over the analyst estimate for each case.
- **Lag window** = `100 · (category lag − months since India early signal) / category lag`; 0 when India is Mainstream/Saturated; 100 when Not yet visible.
- A trend's own lead-lag (cross-correlation of differenced, smoothed series vs the strongest foreign country) is shown **only when its correlation ≥ 0.4**, and does not feed the score. It is noisy for a single trend and strongly seasonal products can show a seasonal rather than an adoption lag.

## India Opportunity

Components (0–100, or null when unavailable): foreign momentum (blend: 40% momentum, 20% breadth, 25% sustainability, 15% proof, renormalised), lag window, competition gap (`100 − 100·ratio`, a search-interest proxy until Indian listings exist), price fit, margin, regulatory ease, logistics (all four arrive in v0.5), seasonality (festival ≥ 45 days away and within ~170 days = 100; evergreen occasions = 60).
Default weights 0.22 / 0.18 / 0.14 / 0.10 / 0.14 / 0.07 / 0.05 / 0.10, editable on the Scoring page.
`Opp = Σ wᵢcᵢ / Σ wᵢ` over available components. Requires foreign momentum and ≥ 30% weight coverage; capped at 49 if margin or regulatory ease is < 15.

## Confidence

`0.30·coverage + 0.25·source reliability + 0.20·min(1, weeks/156) + 0.15·agreement + 0.10·freshness` → High ≥ 0.7, Medium 0.4–0.7, Low < 0.4. Sample data is capped at 0.2 and labelled Sample.

## Validation so far

- Python and TypeScript unit tests cover each formula (known lag recovered from a synthetic shifted S-curve; spike < steady on sustainability; a pure annual cycle gives neutral momentum; missing inputs are excluded).
- Sample trends are generated with a known India stage; the model recovers 28 of 34 exactly and all 34 within one stage. This checks the plumbing, not real-world accuracy.
- Real accuracy comes from the **prediction tracker** (Phase 6) and the measured back-test.
