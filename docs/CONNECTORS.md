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
