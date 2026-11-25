import { stageIndex } from "./workflow";

export interface ReportTrend {
  id: number;
  name: string;
  isSample: boolean;
  status: string;
  createdAt: string;
  opportunity: number | null;
  prevOpportunity: number | null;
  stage: string | null;
  prevStage: string | null;
  confidenceLevel: string | null;
  hasScenario: boolean;
  hasReviews: boolean;
}
export interface ReportWindow {
  festival: string;
  date: string;
  importDeadline: string;
  daysToImportDeadline: number;
  status: "start_now" | "manufacture_only" | "missed";
  gifts: { id: number; name: string; opportunity: number | null }[];
}
export interface ReportInput {
  weekOf: string;
  generatedAt: string;
  mode: "real" | "sample";
  trends: ReportTrend[];
  windows: ReportWindow[];
  alerts: { message: string; firedAt: string }[];
  pipeline: { id: number; title: string; stage: string; updatedAt: string; stuck: boolean }[];
  dataHealth: { staleSources: string[]; neverRunSources: string[]; indicativeTables: boolean };
}
export interface ReportItem {
  id: number;
  name: string;
  opportunity: number | null;
  delta: number | null;
  stage: string | null;
  confidenceLevel: string | null;
  isSample: boolean;
}
export interface Report {
  weekOf: string;
  generatedAt: string;
  mode: "real" | "sample";
  topOpportunities: ReportItem[];
  newEntrants: ReportItem[];
  rising: ReportItem[];
  fading: ReportItem[];
  stageChanges: { id: number; name: string; from: string; to: string }[];
  upcomingWindows: ReportWindow[];
  alerts: { message: string; firedAt: string }[];
  pipeline: {
    byStage: Record<string, number>;
    stuck: { id: number; title: string; stage: string; days: number }[];
  };
  dataHealth: ReportInput["dataHealth"];
  suggestedActions: string[];
  caveats: string[];
}

export const MOVE_THRESHOLD = 8; // opportunity points that count as rising / fading week over week
const item = (t: ReportTrend): ReportItem => ({
  id: t.id,
  name: t.name,
  opportunity: t.opportunity,
  delta:
    t.opportunity != null && t.prevOpportunity != null
      ? Math.round((t.opportunity - t.prevOpportunity) * 10) / 10
      : null,
  stage: t.stage,
  confidenceLevel: t.confidenceLevel,
  isSample: t.isSample,
});
const byOpp = (a: ReportTrend, b: ReportTrend) =>
  (b.opportunity ?? -1) - (a.opportunity ?? -1) || a.name.localeCompare(b.name);

/** Pure: turns gathered facts into the weekly report. Every line is derived from data; nothing is invented. */
export function composeReport(i: ReportInput): Report {
  const pool = i.trends.filter((t) => (i.mode === "real" ? !t.isSample : true));
  const scored = pool.filter((t) => t.opportunity != null);
  const top = [...scored].sort(byOpp).slice(0, 10);
  const weekAgo = new Date(new Date(i.generatedAt).getTime() - 7 * 86_400_000).toISOString();
  const newEntrants = pool
    .filter((t) => t.createdAt >= weekAgo)
    .sort(byOpp)
    .slice(0, 10);
  const movers = scored.filter((t) => t.prevOpportunity != null);
  const rising = movers
    .filter((t) => t.opportunity! - t.prevOpportunity! >= MOVE_THRESHOLD)
    .sort((a, b) => b.opportunity! - b.prevOpportunity! - (a.opportunity! - a.prevOpportunity!))
    .slice(0, 5);
  const fading = movers
    .filter((t) => t.prevOpportunity! - t.opportunity! >= MOVE_THRESHOLD)
    .sort((a, b) => a.opportunity! - a.prevOpportunity! - (b.opportunity! - b.prevOpportunity!))
    .slice(0, 5);
  const stageChanges = pool
    .filter(
      (t) =>
        t.stage &&
        t.prevStage &&
        t.stage !== t.prevStage &&
        stageIndex(t.stage) >= 0 &&
        stageIndex(t.prevStage) >= 0,
    )
    .map((t) => ({ id: t.id, name: t.name, from: t.prevStage!, to: t.stage! }));
  const stuck = i.pipeline
    .filter((p) => p.stuck)
    .map((p) => ({
      id: p.id,
      title: p.title,
      stage: p.stage,
      days: Math.round(
        (new Date(i.generatedAt).getTime() - new Date(p.updatedAt).getTime()) / 86_400_000,
      ),
    }));
  const byStage: Record<string, number> = {};
  for (const p of i.pipeline) byStage[p.stage] = (byStage[p.stage] ?? 0) + 1;

  const actions: string[] = [];
  if (i.mode === "sample")
    actions.push(
      "This report uses SAMPLE data. Track real trends (Verticals → starter set), run the sources and re-score to get a real report.",
    );
  for (const t of top.slice(0, 3)) {
    if (!t.hasScenario)
      actions.push(
        `Run unit economics for "${t.name}": it ranks in your top 3 but has no margin scenario yet.`,
      );
    if (!t.hasReviews && !t.isSample)
      actions.push(`Import reviews for "${t.name}" to see what to improve.`);
  }
  for (const w of i.windows.filter(
    (x) => x.status === "start_now" && x.daysToImportDeadline <= 45 && x.gifts.length,
  )) {
    actions.push(
      `Order samples of "${w.gifts[0]!.name}" for ${w.festival}: the import order deadline is ${w.importDeadline} (${w.daysToImportDeadline} days).`,
    );
  }
  for (const s of stuck.slice(0, 3))
    actions.push(
      `Review stuck idea "${s.title}": ${s.days} days in ${s.stage.replace(/_/g, " ")}. Move it on or drop it.`,
    );
  if (i.dataHealth.neverRunSources.length)
    actions.push(
      `Run sources that have never run: ${i.dataHealth.neverRunSources.slice(0, 4).join(", ")}.`,
    );
  if (i.dataHealth.staleSources.length)
    actions.push(`Refresh stale sources: ${i.dataHealth.staleSources.slice(0, 4).join(", ")}.`);
  if (i.dataHealth.indicativeTables)
    actions.push(
      "Verify the duty and fee tables with your CHA and seller portal: they are still indicative placeholders.",
    );

  const caveats = [
    "Scores are estimates from free data. Search interest is relative, marketplace rank is a proxy for demand, never sales.",
  ];
  if (i.mode === "sample")
    caveats.unshift("SAMPLE DATA: synthetic trends and scores for demonstration only.");
  if (i.dataHealth.indicativeTables)
    caveats.push("Margins use indicative duty and fee tables until you verify them.");

  return {
    weekOf: i.weekOf,
    generatedAt: i.generatedAt,
    mode: i.mode,
    topOpportunities: top.map(item),
    newEntrants: newEntrants.map(item),
    rising: rising.map(item),
    fading: fading.map(item),
    stageChanges,
    upcomingWindows: i.windows.slice(0, 3),
    alerts: i.alerts.slice(0, 20),
    pipeline: { byStage, stuck },
    dataHealth: i.dataHealth,
    suggestedActions: actions.slice(0, 12),
    caveats,
  };
}

const lbl = (s: string) => s.replace(/_/g, " ");
const line = (x: ReportItem) =>
  `${x.name}${x.isSample ? " [sample]" : ""}: ${x.opportunity == null ? "–" : Math.round(x.opportunity)}${x.delta != null ? ` (${x.delta > 0 ? "+" : ""}${x.delta})` : ""}${x.stage ? `, India ${lbl(x.stage)}` : ""}`;

export function reportSections(r: Report): { title: string; lines: string[] }[] {
  const none = ["Nothing this week."];
  return [
    {
      title: "Top 10 opportunities",
      lines: r.topOpportunities.length ? r.topOpportunities.map(line) : ["No scored trends yet."],
    },
    { title: "Suggested actions", lines: r.suggestedActions.length ? r.suggestedActions : none },
    { title: "New entrants", lines: r.newEntrants.length ? r.newEntrants.map(line) : none },
    { title: "Rising", lines: r.rising.length ? r.rising.map(line) : none },
    { title: "Fading", lines: r.fading.length ? r.fading.map(line) : none },
    {
      title: "India stage changes",
      lines: r.stageChanges.length
        ? r.stageChanges.map((s) => `${s.name}: ${lbl(s.from)} → ${lbl(s.to)}`)
        : none,
    },
    {
      title: "Upcoming gifting windows",
      lines: r.upcomingWindows.length
        ? r.upcomingWindows.map(
            (w) =>
              `${w.festival} (${w.date}): ${lbl(w.status)}, import order by ${w.importDeadline}${
                w.gifts.length
                  ? `. Gifts: ${w.gifts
                      .slice(0, 3)
                      .map((g) => g.name)
                      .join(", ")}`
                  : ""
              }`,
          )
        : none,
    },
    { title: "Alerts fired", lines: r.alerts.length ? r.alerts.map((a) => a.message) : none },
    {
      title: "Idea pipeline",
      lines: [
        Object.keys(r.pipeline.byStage).length
          ? Object.entries(r.pipeline.byStage)
              .map(([k, v]) => `${lbl(k)} ${v}`)
              .join(" · ")
          : "No ideas in the pipeline.",
        ...r.pipeline.stuck.map((s) => `Stuck: ${s.title} (${s.days} days in ${lbl(s.stage)})`),
      ],
    },
    { title: "Caveats", lines: r.caveats },
  ];
}

export function reportToMarkdown(r: Report): string {
  return [
    `# TrendBridge weekly report: week of ${r.weekOf}${r.mode === "sample" ? " (SAMPLE DATA)" : ""}`,
    "",
    ...reportSections(r).flatMap((s) => [`## ${s.title}`, ...s.lines.map((l) => `- ${l}`), ""]),
  ].join("\n");
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function reportToHtml(r: Report): string {
  return (
    `<h1>TrendBridge weekly report: week of ${esc(r.weekOf)}${r.mode === "sample" ? " (SAMPLE DATA)" : ""}</h1>` +
    reportSections(r)
      .map(
        (s) =>
          `<h2>${esc(s.title)}</h2><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,
      )
      .join("")
  );
}

/** Monday of the week containing d (UTC), as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
