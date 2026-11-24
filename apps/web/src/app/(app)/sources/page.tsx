"use client";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type SourceRow } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  healthy: { label: "Healthy", tone: "ok" },
  stale: { label: "Stale", tone: "warn" },
  circuit_open: { label: "Circuit open", tone: "danger" },
  disabled: { label: "Disabled", tone: "neutral" },
  never_run: { label: "Never run", tone: "warn" },
  static: { label: "Static data", tone: "neutral" },
  not_built_yet: { label: "Planned", tone: "neutral" },
};

export default function SourcesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api<SourceRow[]>("/sources"),
  });
  return (
    <>
      <h1 className="text-2xl font-bold">Source Registry</h1>
      <p className="text-sm text-muted-foreground">
        Every source is free (Rs 0). Scraped sources are flagged lower confidence and never bypass
        blocks. Usage meters count today&apos;s calls against our self-imposed free-tier budget.
      </p>
      <Card className="overflow-x-auto p-0" data-tour="source-table">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Source",
                "Type",
                "Method",
                "Status",
                "Last sync",
                "Free-tier usage",
                "Reliability",
                "Phase",
                "Cost",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.map((s) => {
              const st = STATUS[s.status] ?? STATUS.not_built_yet!;
              const pct = s.limitCalls > 0 ? Math.min(100, (s.usedToday / s.limitCalls) * 100) : 0;
              return (
                <tr
                  key={s.key}
                  className="border-t border-border align-top"
                  title={s.termsNote ?? ""}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.name}</div>
                    <div className="max-w-md text-xs text-muted-foreground">{s.termsNote}</div>
                  </td>
                  <td className="px-3 py-2">{s.type}</td>
                  <td className="px-3 py-2">
                    {s.method}
                    {s.scraped && (
                      <Badge tone="warn" className="ml-1">
                        scraped · lower confidence
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {s.lastError && (
                      <div className="max-w-48 truncate text-xs text-danger" title={s.lastError}>
                        {s.lastError}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString() : "–"}
                  </td>
                  <td className="min-w-32 px-3 py-2">
                    {s.limitCalls > 0 ? (
                      <>
                        <div
                          className="h-2 w-full rounded bg-muted"
                          role="progressbar"
                          aria-valuenow={s.usedToday}
                          aria-valuemax={s.limitCalls}
                        >
                          <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {s.usedToday}/{s.limitCalls} per {s.limitWindow}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">n/a (manual/static)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge level={s.confidenceLevel} />{" "}
                    <span className="text-xs text-muted-foreground">
                      {s.reliability.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.phase}</td>
                  <td className="px-3 py-2">Rs 0</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="p-4 text-sm text-danger">Could not load sources.</p>}
      </Card>
    </>
  );
}
