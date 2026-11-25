# Connector authoring guide

A connector is an object implementing `Connector` (`apps/workers/src/framework/types.ts`):

| Member                                                                    | Purpose                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `key`                                                                     | must match a row in `sources` (add it to `packages/shared/src/data/sources.json`)                   |
| `rateLimit`, `costPerCall: 0`, `reliabilityScore`, `termsNote`, `scraped` | surfaced in the Source Registry                                                                     |
| `fetch(ctx)`                                                              | returns raw payloads exactly as received. Use `ctx.http` (polite: robots, throttle, retries, audit) |
| `normalize(raw)`                                                          | **pure** function to normalised records (unit-test it with fixtures)                                |
| `persist(ctx, norm)`                                                      | optional: write into domain tables                                                                  |
| `healthCheck(ctx)`                                                        | cheap reachability check                                                                            |

Steps: 1) write the connector in `src/connectors/`; 2) add a recorded fixture in `src/fixtures/` and honour `ctx.fixtureMode`; 3) register it in `src/connectors/index.ts`; 4) add a schedule in `src/queues.ts`; 5) test `normalize` and one runner path; 6) add a changelog entry and tour step.

Rules: free only; official APIs preferred; for page fetches use `ctx.http.get(url)` (robots enforced), never bypass logins, CAPTCHAs, paywalls or anti-bot; store facts and short summaries only. Run one now with `pnpm --filter @trendbridge/workers run-once <key>`.

## Phase 1 connectors

| Key                  | Method                                                              | Notes                                                                                            |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `google_trends`      | unofficial `google-trends-api`, called through an injectable client | up to 8 keywords x geos per run, 4s apart; values relative per country                           |
| `google_trends_rss`  | RSS                                                                 | only terms matching tracked trends are kept (`trending_now`, lower bound)                        |
| `google_news_rss`    | RSS                                                                 | headline, publisher, date, URL only; matched to trends by keyword tokens                         |
| `trade_press_rss`    | RSS (Inc42, YourStory, Entrackr, ET Retail, Retail Dive)            | a failing feed is skipped                                                                        |
| `amazon_bestsellers` | public list pages, cheerio parser                                   | opt-in, robots enforced, 403 never bypassed; unrecognised markup yields 0 items, never fake data |

RSS feeds are published for machine reading, so they skip the robots.txt check (`skipRobots`); page fetches never do. Entity matching is lexical in Phase 1 (token containment, Jaccard >= 0.6 for dedupe, US/UK spelling normalised); embeddings arrive with the analytics service in Phase 2.
