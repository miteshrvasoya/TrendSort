# Architecture (v0.1.0)

```
web (Next.js)  ->  api (Fastify)  ->  Postgres + pgvector
                      |                    ^
                      +-> analytics (FastAPI, lead-lag)
workers (BullMQ + Redis) -> connectors -> raw_signals -> normalise -> domain tables
                      \-> Bull Board at :4100/admin/queues, DLQ queue "ingest-dlq"
```

- `raw_signals` is append-only JSONB; normalised tables never mutate it. Every record carries `source_id`, `fetched_at`, `confidence`, `is_sample`.
- Source health: `source_runs`, `sources.circuit_state`, `rate_limit_usage` (daily free-tier meter), `audit_log` (every HTTP pull).
- Circuit breaker: 3 consecutive failed runs open the circuit for 30 minutes, then half-open.
- Versioning: `app_versions`, `release_notes`, `tour_steps`, `users.last_seen_version`, `users.tour_completed_version`.
- Scoring formulas and the lag model are specified in `docs/PROPOSAL.md` §e and ship in Phase 2 (`docs/SCORING.md` then).
