# TrendBridge

Finds products trending abroad before they peak in India, scores India-readiness, and compares import vs Indian-manufacture economics. Free data only (Rs 0). Current version: **0.6.0 (Phase 5: Config-driven verticals and the RO deep-dive)**. See `docs/PROPOSAL.md` for the full design.

## Run locally (about 10 minutes)

Prereqs: Node 22, pnpm 10, Docker (or local Postgres 16 with pgvector and Redis 7), Python 3.12 optional.

```bash
cp .env.example .env     # set DATABASE_URL here if your Postgres password is not `postgres`
docker compose up -d postgres redis      # add `analytics` to also run the Python service
pnpm install
pnpm db:migrate && pnpm db:seed          # creates schema, sample data, admin user
pnpm dev:api        # http://localhost:4000  (OpenAPI docs at /docs)
pnpm dev:workers    # http://localhost:4100/admin/queues (Bull Board)
pnpm dev:web        # http://localhost:3000
```

Sign in with `admin@trendbridge.local` / `admin123` (sample admin; change in `.env`).

Fetch a live free source once, without the queue: `pnpm --filter @trendbridge/workers run-once ecb_fx`. Set `LIVE_FETCH_ENABLED=false` to use fixtures only.

## Getting real data (Phase 1)

1. Sign in, open **Trend Explorer → Track a trend** and add a trend with keywords (e.g. `star map frame, custom night sky print`).
2. Make sure `pnpm dev:workers` is running (needs Redis). Open **Source Registry** and click **Run now** on Google Trends, Google News RSS and the trade-press feeds. They also run on a schedule.
3. Optional: switch on **Amazon Best Sellers** (scraped, off by default; robots.txt is enforced, blocks are never bypassed). Or use **Import** to load a CSV from a free browser tool.
4. Google Trends is an unofficial API and may rate-limit (429); the circuit breaker pauses it for 30 minutes after 3 failures.

Run one connector without the queue: `pnpm --filter @trendbridge/workers run-once google_news_rss`. Set `LIVE_FETCH_ENABLED=false` for fixture mode.

## Scoring (Phase 2)

Scores need the Python analytics service: `docker compose up -d analytics` (or `cd services/analytics && pip install -r requirements.txt && uvicorn app.main:app --port 8000`). Then **Trend Explorer → Re-score all**, or `pnpm --filter @trendbridge/workers score-now`. Scoring also runs daily at 04:30 when the workers process is up. Methodology: `docs/SCORING.md`.

Replace the analyst-estimated back-test lags with measured ones (needs internet, uses Google Trends gently, ~30 requests): `pnpm --filter @trendbridge/workers measure-lag`.

Reset sample data after a generator change: `RESEED_SAMPLE=1 pnpm db:seed`.

## Gifts (Phase 3)

Open **Gifts**. Pick a festival and a budget; gifts already Mainstream/Saturated in India are hidden by default. On any live trend use **Gift details** to set occasions, recipients, price range and corporate terms so it appears in the filters.
Etsy data: get a free key at https://www.etsy.com/developers (manual approval, can take days), add `ETSY_API_KEY` to `.env`, restart the workers, then **Source Registry → Run now** on Etsy. Without a key Etsy shows "needs key" and writes nothing.
Sourcing deadlines assume 84 days to import + 21 days to list (45 + 21 for Indian manufacture); change them in `packages/shared/src/gifts.ts`.

## Economics, reviews and fit (Phase 4)

Open a trend, then **Unit economics → Open calculator**. Defaults come from **Economics → Edit duty & fee tables** (indicative placeholders; verify with your CHA and seller portal, then edit: each edit is a new version). Save a scenario as the trend's primary to feed its margin into the score, then **Re-score all**. Reviews and India listings are added through **Import**. See `docs/ECONOMICS.md`.

## Verticals and the RO deep-dive (Phase 5)

Open **Verticals → Water Purification / RO → Track starter set**, run Google Trends from the Source Registry, then **Re-score all**. The feature-gap matrix, water-type guide and subscription calculator are on that page. Vertical definitions live in `packages/shared/src/data/verticals/*.json` (see `docs/VERTICALS.md`).

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
