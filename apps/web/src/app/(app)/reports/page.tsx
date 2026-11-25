"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, downloadFile, type ReportListRow, type ReportResponse } from "@/lib/api";
import { STAGE_LABEL, fmtDate, fmtScore } from "@/lib/utils";
import { reportSections } from "@trendbridge/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function ReportsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["reports"], queryFn: () => api<ReportListRow[]>("/reports") });
  const [picked, setPicked] = useState<number | null>(null);
  const current = picked ?? list.data?.[0]?.id ?? null;
  const one = useQuery({
    queryKey: ["report", current],
    queryFn: () => api<ReportResponse>(`/reports/${current}`),
    enabled: current != null,
  });
  const gen = useMutation({
    mutationFn: () => api<{ id: number }>("/reports/generate", { method: "POST", json: {} }),
    onSuccess: (r) => {
      setPicked(r.id);
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["report"] });
    },
  });
  const [err, setErr] = useState<string | null>(null);
  const r = one.data?.report;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Weekly intelligence report</h1>
        <div className="flex gap-2">
          <Button data-tour="report-generate" onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? "Generating…" : "Generate now"}
          </Button>
          {current != null && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  downloadFile(
                    `/reports/${current}/pdf`,
                    `trendbridge-report-${r?.weekOf ?? "week"}.pdf`,
                  ).catch((e) => setErr((e as Error).message))
                }
              >
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadFile(
                    `/reports/${current}/markdown`,
                    `trendbridge-report-${r?.weekOf ?? "week"}.md`,
                  ).catch((e) => setErr((e as Error).message))
                }
              >
                Markdown
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Generated automatically every Monday when the workers process runs, from your stored scores,
        alerts, pipeline and source health. If you set SMTP details in <code>.env</code> it is also
        emailed (see README); otherwise download it here.
      </p>
      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
      {list.data?.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">No report yet. Click Generate now.</p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div className="space-y-3" data-tour="report-body">
          {r && (
            <>
              {r.mode === "sample" && (
                <p className="rounded-lg border border-dashed border-warn bg-warn/10 p-2 text-sm text-warn">
                  <strong>Sample data.</strong> This report is built from synthetic demo trends.
                  Track real trends to get a real one.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Week of {fmtDate(r.weekOf)} · generated {new Date(r.generatedAt).toLocaleString()}
                {one.data?.emailedAt &&
                  ` · emailed ${new Date(one.data.emailedAt).toLocaleString()}`}
              </p>
              {reportSections(r).map((s) => (
                <Card key={s.title} className="space-y-1">
                  <h2 className="font-semibold">{s.title}</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {s.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </Card>
              ))}
              <Card>
                <h2 className="mb-1 font-semibold">Open the trends</h2>
                <div className="flex flex-wrap gap-2 text-sm">
                  {r.topOpportunities.map((t) => (
                    <Link
                      key={t.id}
                      className="rounded-full border border-border px-3 py-1 hover:bg-muted"
                      href={`/trends/${t.id}`}
                    >
                      {t.name} · {fmtScore(t.opportunity)}
                      {t.stage ? ` · ${STAGE_LABEL[t.stage]}` : ""}
                    </Link>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
        <Card className="h-fit space-y-2">
          <h2 className="font-semibold">History</h2>
          <ul className="space-y-1 text-sm">
            {list.data?.map((x) => (
              <li key={x.id}>
                <button
                  className={`w-full rounded px-2 py-1 text-left hover:bg-muted ${x.id === current ? "bg-muted font-medium" : ""}`}
                  onClick={() => setPicked(x.id)}
                >
                  {fmtDate(x.weekOf)} {x.mode === "sample" && <Badge tone="sample">Sample</Badge>}
                  {x.emailedAt && (
                    <Badge tone="ok" className="ml-1">
                      emailed
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
