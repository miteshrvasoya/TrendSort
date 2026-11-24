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
