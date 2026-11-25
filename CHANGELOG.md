# Changelog

All notable changes. Format: [Semantic Versioning](https://semver.org). Release notes also live in the app (What's New) and the `app_versions` / `release_notes` tables; the source of truth is `packages/shared/src/releases.ts`.

## 0.4.0 — 2026-11-27 — Gifts vertical

**What this means for you:** pick a festival and a budget and see which gifts are rising abroad but not yet mainstream in India, when you must order by, and what hamper to build. Margin estimates arrive in v0.5. Etsy data needs your free API key.

### Added

- Gifts browser (occasion, recipient, INR budget band, age, interest, personalisation, corporate), hiding Mainstream/Saturated gifts by default
- Gifting windows: latest import-order and manufacturing-start dates per upcoming festival
- Gift of the week, bundles (suggested price with editable 10% discount), corporate bulk price-break calculator
- Gift details editor for live trends (`gift_profiles` table)
- Etsy Open API connector (key required) and Amazon Most Gifted / Most Wished For lists
- Source Registry "needs key" status

### Changed

- Sample gift trends carry gift attributes

## 0.3.0 — 2026-11-26 — Scoring and the India lag model

**What this means for you:** you can rank trends by how early India is, see exactly why each score is what it is, and tune the weights. Margin, price fit, regulation and logistics join Opportunity in v0.5; until then it covers demand and timing only, and says so. Back-test lags are estimates until you run `measure-lag`.

### Added

- Python analytics: seasonality-adjusted momentum, sustainability, breadth inputs, India ratio and early-signal date, lead-lag, back-test category lag with bootstrap interval
- Adoption stage, India Opportunity (eight weighted inputs), confidence, per-day score history
- "Why this score" panel, Scoring page (weight sliders, methodology, back-test table), confidence badges and header tooltips
- 30-case back-test dataset (analyst estimates) and `measure-lag` job; `score-now` command; daily scoring job; Re-score button
- `docs/SCORING.md`

### Changed

- Google Trends fetched as one compare request per keyword (one shared scale across countries)
- Opportunity excludes unavailable inputs instead of guessing and reports its coverage
- Sample trends are scored by the real model (still labelled Sample)

### Removed

- Placeholder `sample-0` scores

## 0.2.0 — 2026-11-25 — Signals MVP

**What this means for you:** you can add the products and ideas you care about and watch real search interest and news for them. Google Trends values are relative within each country, so compare shapes, not magnitudes. Scores are still placeholders until Phase 2.

### Added

- Track a trend (name, keywords, countries); Google Trends interest is fetched for it
- Connectors: Google Trends, Google Trends daily RSS, Google News RSS, trade-press and Indian D2C RSS, Amazon Best Sellers / New Releases / Movers (opt-in)
- Auto-created candidate trends from Movers & Shakers with approve / delete
- Trend detail: multi-country chart, news timeline, marketplace products with rank change, stale-data warnings
- Import screen (CSV/JSON) with templates and row-by-row validation for products and time series
- Source Registry: enable/disable, Run now, run history
- Trend Explorer filters: real / sample / candidates

### Changed

- Real signals never match sample trends
- Scraped sources are disabled until you switch them on

### Fixed

- Trend Explorer could freeze when a filter returned no rows while loading

## 0.1.0 — 2026-11-24 — Foundations

**What this means for you:** you can sign in, look around the empty-but-working app, and see exactly which free data sources are planned. Sample data is for demos only; real signals start flowing in Phase 1.

### Added

- Monorepo (pnpm): `apps/web`, `apps/api`, `apps/workers`, `services/analytics`, `packages/shared`, `packages/db`
- Single-user login (sample admin account from `.env`)
- Dashboard shell, Trend Explorer preview and trend detail chart (all on labelled sample data), dark/light mode
- Source Registry: 24 planned sources with cost (Rs 0), reliability, scraped flag, free-tier usage meter
- Connector framework: robots.txt, per-host throttle, retry/backoff, circuit breaker, daily free-tier budget, audit log, BullMQ jobs with DLQ and Bull Board
- Live ECB exchange-rate connector (free, no key) as the first real source
- 34 sample trend entities with 2 years of synthetic weekly series (flagged `is_sample`)
- What's New modal, version history, compare versions, guided tour (driver.js) and Help menu
- Python analytics service skeleton with a tested lead-lag primitive
- Postgres schema (pgvector enabled) and SQL migrations; CI workflow
