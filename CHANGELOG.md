# Changelog

All notable changes. Format: [Semantic Versioning](https://semver.org). Release notes also live in the app (What's New) and the `app_versions` / `release_notes` tables; the source of truth is `packages/shared/src/releases.ts`.

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
