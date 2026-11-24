# TrendBridge

Finds products trending abroad before they peak in India, scores India-readiness, and compares import vs Indian-manufacture economics. Free data only (Rs 0). Current version: **0.1.0 (Phase 0: Foundations)**. See `docs/PROPOSAL.md` for the full design.

## Run locally (about 10 minutes)

Prereqs: Node 22, pnpm 10, Docker (or local Postgres 16 with pgvector and Redis 7), Python 3.12 optional.

```bash
cp .env.example .env
docker compose up -d postgres redis      # add `analytics` to also run the Python service
pnpm install
pnpm db:migrate && pnpm db:seed          # creates schema, sample data, admin user
pnpm dev:api        # http://localhost:4000  (OpenAPI docs at /docs)
pnpm dev:workers    # http://localhost:4100/admin/queues (Bull Board)
pnpm dev:web        # http://localhost:3000
```

Sign in with `admin@trendbridge.local` / `admin123` (sample admin; change in `.env`).

Fetch a live free source once, without the queue: `pnpm --filter @trendbridge/workers run-once ecb_fx`. Set `LIVE_FETCH_ENABLED=false` to use fixtures only.

## Test

```bash
pnpm lint && pnpm typecheck && pnpm test                 # needs Postgres + Redis running and migrated
cd services/analytics && pip install -r requirements.txt pytest httpx && pytest
cd apps/web && pnpm build && pnpm e2e                    # Playwright smoke test
```

## Layout

`apps/web` UI · `apps/api` REST API · `apps/workers` connectors and jobs · `services/analytics` Python maths · `packages/shared` types, release notes, tour steps, catalogs · `packages/db` schema and migrations.

Docs: `docs/ARCHITECTURE.md`, `docs/CONNECTORS.md`, `DECISIONS.md`, `CHANGELOG.md`.

## Definition of done (every feature)

Code + tests + docs + changelog entry (`packages/shared/src/releases.ts`) + tour steps (`packages/shared/src/tour.ts`).
