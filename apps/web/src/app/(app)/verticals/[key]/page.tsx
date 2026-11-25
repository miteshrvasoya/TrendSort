"use client";
import { SampleBanner } from "@/components/sample-banner";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  FeatureMatrixPanel,
  SubscriptionCalculator,
  VerticalConfigEditor,
} from "@/components/vertical-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type TrendRow, type VerticalDetail } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function VerticalPage() {
  const { key } = useParams<{ key: string }>();
  const qc = useQueryClient();
  const [preset, setPreset] = useState<"vertical" | "mine">("vertical");
  const [msg, setMsg] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["vertical", key],
    queryFn: () => api<VerticalDetail>(`/verticals/${key}`),
  });
  const trends = useQuery({
    queryKey: ["trends", "vertical", key, preset],
    queryFn: () => api<TrendRow[]>(`/trends?vertical=${key}&preset=${preset}&limit=100`),
  });
  const starter = useMutation({
    mutationFn: () =>
      api<{ created: string[]; skipped: string[] }>(`/verticals/${key}/starter`, {
        method: "POST",
      }),
    onSuccess: (r) => {
      setMsg(
        `Created ${r.created.length} tracked trends${r.skipped.length ? `, skipped ${r.skipped.length} that already exist` : ""}. Run Google Trends from the Source Registry to start collecting data.`,
      );
      qc.invalidateQueries();
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const d = detail.data;
  if (detail.isError) return <p className="text-sm text-danger">Unknown vertical.</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const e = d.effective;
  const hasStarter = !!d.defaults.starterTrends?.length;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{e.name}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{e.description}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/verticals" className="text-sm underline">
            all verticals
          </Link>
          {hasStarter && (
            <Button
              data-tour="starter-set"
              onClick={() => starter.mutate()}
              disabled={starter.isPending}
            >
              Track starter set ({d.defaults.starterTrends!.length})
            </Button>
          )}
        </div>
      </div>
      {msg && (
        <p role="status" className="rounded-lg bg-muted p-2 text-sm">
          {msg}
        </p>
      )}
      {trends.data?.some((t) => t.isSample) && <SampleBanner />}

      {e.features?.length ? <FeatureMatrixPanel vkey={key} /> : null}

      <Card className="space-y-2" data-tour="vertical-trends">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ranked trends</h2>
          <div className="flex gap-1 text-sm">
            {(["vertical", "mine"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-full border px-3 py-1 ${preset === p ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {p === "vertical" ? `${e.name} weighting` : "My weights"}
              </button>
            ))}
          </div>
        </div>
        {trends.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No trends in this vertical yet.
            {hasStarter
              ? " Track the starter set to begin."
              : " Track a trend and tag it with this vertical."}
          </p>
        )}
        <ul className="divide-y divide-border text-sm">
          {trends.data?.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                <Link className="font-medium hover:underline" href={`/trends/${t.id}`}>
                  {t.name}
                </Link>{" "}
                {t.isSample ? (
                  <Badge tone="sample">Sample</Badge>
                ) : t.status === "candidate" ? (
                  <Badge tone="warn">Candidate</Badge>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                {t.adoptionStage ? (
                  <Badge>{STAGE_LABEL[t.adoptionStage]}</Badge>
                ) : (
                  <span className="text-muted-foreground">no stage</span>
                )}
                <span className="w-8 text-right tabular-nums">{fmtScore(t.opportunity)}</span>
                {t.confidenceLevel && (
                  <ConfidenceBadge level={t.isSample ? "sample" : t.confidenceLevel} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {e.tools.includes("subscription") && <SubscriptionCalculator />}
      <VerticalConfigEditor vkey={key} detail={d} />
    </>
  );
}
