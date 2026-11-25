"use client";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type RunRow, type SourceRow } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  healthy: { label: "Healthy", tone: "ok" },
  stale: { label: "Stale", tone: "warn" },
  circuit_open: { label: "Circuit open", tone: "danger" },
  disabled: { label: "Disabled", tone: "neutral" },
  never_run: { label: "Never run", tone: "warn" },
  static: { label: "Manual / static", tone: "neutral" },
  not_built_yet: { label: "Planned", tone: "neutral" },
};

export default function SourcesPage() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api<SourceRow[]>("/sources"),
    refetchInterval: 15_000,
  });
  const runs = useQuery({
    queryKey: ["source-runs"],
    queryFn: () => api<RunRow[]>("/sources/runs"),
    refetchInterval: 15_000,
  });
  const toggle = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) =>
      api(`/sources/${v.key}`, { method: "PATCH", json: { enabled: v.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  const run = useMutation({
    mutationFn: (key: string) => api<{ jobId: string }>(`/sources/${key}/run`, { method: "POST" }),
    onSuccess: (_r, key) => {
      setMsg(
        `Queued ${key}. Results appear in run history shortly (the workers process must be running).`,
      );
      setTimeout(() => qc.invalidateQueries(), 4000);
    },
    onError: (e) => setMsg((e as Error).message),
  });

  return (
    <>
      <h1 className="text-2xl font-bold">Source Registry</h1>
      <p className="text-sm text-muted-foreground">
        Every source is free (Rs 0). Scraped sources are off by default, flagged lower confidence,
        and never bypass blocks. Usage meters count today&apos;s calls against our self-imposed
        free-tier budget.
      </p>
      {msg && (
        <p role="status" className="rounded-lg bg-muted p-2 text-sm">
          {msg}
        </p>
      )}
      <Card className="overflow-x-auto p-0" data-tour="source-table">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Source",
                "Method",
                "Status",
                "Last sync",
                "Free-tier usage",
                "Reliability",
                "Phase",
                "Controls",
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
                  <td className="whitespace-nowrap px-3 py-2">
                    {s.implemented && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={s.enabled}
                            onChange={(e) =>
                              toggle.mutate({ key: s.key, enabled: e.target.checked })
                            }
                            aria-label={`Enable ${s.name}`}
                          />
                          On
                        </label>
                        {s.runnable && (
                          <Button
                            variant="outline"
                            className="px-2 py-1 text-xs"
                            disabled={!s.enabled || run.isPending}
                            onClick={() => run.mutate(s.key)}
                          >
                            Run now
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="p-4 text-sm text-danger">Could not load sources.</p>}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Recent runs</h2>
        {runs.data?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                {["When", "Source", "Status", "Items", "Note"].map((h) => (
                  <th key={h} className="px-2 py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.data.slice(0, 15).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-2 py-1">{r.source}</td>
                  <td className="px-2 py-1">
                    <Badge
                      tone={r.status === "ok" ? "ok" : r.status === "error" ? "danger" : "neutral"}
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-1">{r.items}</td>
                  <td
                    className="max-w-md truncate px-2 py-1 text-xs text-muted-foreground"
                    title={r.error ?? ""}
                  >
                    {r.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </Card>
    </>
  );
}
