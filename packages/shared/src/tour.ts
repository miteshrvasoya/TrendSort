/** Tour steps are data. `version` is the release that introduced or changed the feature. */
export interface TourStepDef {
  version: string;
  featureKey: string;
  target: string; // CSS selector
  title: string;
  body: string;
  order: number;
  route?: string; // page the step lives on
}

export const TOUR_STEPS: TourStepDef[] = [
  {
    version: "0.1.0",
    featureKey: "shell",
    target: "[data-tour='sidebar']",
    title: "Navigation",
    body: "Everything lives here: Dashboard, Trend Explorer, Sources, What's New. More sections unlock phase by phase.",
    order: 1,
    route: "/",
  },
  {
    version: "0.1.0",
    featureKey: "sample-banner",
    target: "[data-tour='sample-banner']",
    title: "Sample data",
    body: "Until real connectors run, charts use clearly labelled synthetic data. Never treat it as market truth.",
    order: 2,
    route: "/",
  },
  {
    version: "0.1.0",
    featureKey: "theme",
    target: "[data-tour='theme-toggle']",
    title: "Dark / light mode",
    body: "Switch theme any time.",
    order: 3,
    route: "/",
  },
  {
    version: "0.1.0",
    featureKey: "trend-explorer",
    target: "[data-tour='trend-table']",
    title: "Trend Explorer",
    body: "Browse trend entities with their category, stage and scores. Scoring arrives in Phase 2; this table shows sample values for now.",
    order: 4,
    route: "/trends",
  },
  {
    version: "0.1.0",
    featureKey: "source-registry",
    target: "[data-tour='source-table']",
    title: "Source Registry",
    body: "Every data source with status, cost (always Rs 0), reliability and free-tier usage. Scraped sources are flagged lower confidence.",
    order: 5,
    route: "/sources",
  },
  {
    version: "0.1.0",
    featureKey: "help-menu",
    target: "[data-tour='help-menu']",
    title: "Help menu",
    body: "Replay this tour, see what changed, or compare versions.",
    order: 6,
    route: "/",
  },
  {
    version: "0.2.0",
    featureKey: "track-trend",
    target: "[data-tour='track-trend']",
    title: "Track a trend",
    body: "Add a product idea with keywords and countries. Google Trends interest is fetched for it daily.",
    order: 7,
    route: "/trends",
  },
  {
    version: "0.2.0",
    featureKey: "data-filter",
    target: "[data-tour='data-filter']",
    title: "Real vs sample",
    body: "Switch between real data, sample data and auto-created candidates.",
    order: 8,
    route: "/trends",
  },
  {
    version: "0.2.0",
    featureKey: "source-controls",
    target: "[data-tour='source-table']",
    title: "Enable and run sources",
    body: "Switch a source on or off and run it now. Scraped sources start off; enable them only if you accept their terms risk.",
    order: 9,
    route: "/sources",
  },
  {
    version: "0.2.0",
    featureKey: "import",
    target: "[data-tour='import-form']",
    title: "Import your own data",
    body: "Paste or upload a CSV/JSON export. Every row is validated before anything is saved.",
    order: 10,
    route: "/import",
  },
  {
    version: "0.3.0",
    featureKey: "score-legend",
    target: "[data-tour='score-legend']",
    title: "Scores, explained",
    body: "Hover any score column header for its meaning. A dash means not enough data yet, never zero. Open a trend to see 'Why this score'.",
    order: 11,
    route: "/trends",
  },
  {
    version: "0.3.0",
    featureKey: "weight-sliders",
    target: "[data-tour='weight-sliders']",
    title: "Your weights",
    body: "Decide what matters: foreign momentum, lag window left, competition gap and more. Opportunity scores update everywhere.",
    order: 12,
    route: "/scoring",
  },
  {
    version: "0.3.0",
    featureKey: "backtest",
    target: "[data-tour='backtest']",
    title: "India lag back-test",
    body: "Past trends and how long India took to catch up. These are labelled estimates until you run measure-lag with internet access.",
    order: 13,
    route: "/scoring",
  },
];

export function stepsFor(opts: { sinceVersion?: string | null; all?: boolean }): TourStepDef[] {
  const sorted = [...TOUR_STEPS].sort((a, b) => a.order - b.order);
  if (opts.all || !opts.sinceVersion) return sorted;
  return sorted.filter((s) => compareVersions(s.version, opts.sinceVersion!) > 0);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** A feature shows a "New" badge for the current and previous minor release. */
export function isNewFeature(featureVersion: string, current: string): boolean {
  const [fMaj, fMin] = featureVersion.split(".").map(Number);
  const [cMaj, cMin] = current.split(".").map(Number);
  if (fMaj !== cMaj) return (cMaj ?? 0) > (fMaj ?? 0) ? false : true;
  return (cMin ?? 0) - (fMin ?? 0) < 2;
}
