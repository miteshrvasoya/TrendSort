/** Source of truth for release notes. Synced into `app_versions` + `release_notes` at API start. */
export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
  /** Plain-language "what this means for you". */
  forYou: string;
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "0.1.0",
    date: "2026-11-24",
    title: "Foundations",
    summary:
      "The platform skeleton: sign-in, dashboard shell, source registry, connector framework, background jobs, sample data, and the What's New + guided tour system.",
    added: [
      "Monorepo with web, API, workers and a Python analytics service",
      "Single-user login (sample admin account)",
      "Dashboard shell with dark/light mode and a Trend Explorer preview on sample data",
      "Source Registry listing every planned data source with cost, reliability and free-tier usage meter",
      "Connector framework: robots.txt check, rate limit, circuit breaker, retries, audit log",
      "Live ECB exchange-rate connector (free, no key) as the first real data source",
      "34 sample trend entities with 2 years of synthetic weekly series, labelled 'Sample data'",
      "What's New modal, version history page, guided tour and Help menu",
    ],
    changed: [],
    fixed: [],
    removed: [],
    forYou:
      "You can sign in, look around the empty-but-working app, and see exactly which free data sources are planned. Sample data is for demos only; real signals start flowing in Phase 1.",
  },
];

export const CURRENT_VERSION = RELEASES[0]!.version;
