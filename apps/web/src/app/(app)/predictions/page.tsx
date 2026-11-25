"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  api,
  downloadFile,
  type PredictionRow,
  type Summary,
  type TrackerSummary,
} from "@/lib/api";
import { STAGE_LABEL } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const tone = { exact: "ok", near: "warn", miss: "danger" } as const;

function Block({
  title,
  s,
  note,
  tourKey,
}: {
  title: string;
  s: Summary;
  note: string;
  tourKey?: string;
}) {
  const beats =
    s.exactRate != null && s.baselineExactRate != null ? s.exactRate - s.baselineExactRate : null;
  return (
    <Card className="space-y-2" data-tour={tourKey}>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{note}</p>
      {s.n === 0 ? (
        <p className="text-sm text-muted-foreground">No resolved predictions yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Cases</p>
              <p className="text-xl font-bold">{s.n}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Exact stage</p>
              <p className="text-xl font-bold">{pct(s.exactRate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Within one stage</p>
              <p className="text-xl font-bold">{pct(s.withinOneRate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Average error</p>
              <p className="text-xl font-bold">
                {s.meanAbsError}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  stages (bias {s.bias! > 0 ? "+" : ""}
                  {s.bias})
                </span>
              </p>
            </div>
          </div>
          <p className="rounded-lg bg-muted p-2 text-sm">
            Versus “nothing changes” (predict today&apos;s stage): exact {pct(s.baselineExactRate)},
            within one {pct(s.baselineWithinOneRate)}.{" "}
            {beats == null ? (
              ""
            ) : beats > 0.005 ? (
              <strong>The model beats that baseline on exact stage.</strong>
            ) : beats < -0.005 ? (
              <strong className="text-warn">The model does NOT beat that baseline yet.</strong>
            ) : (
              <strong>No better than that baseline.</strong>
            )}
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                {["Confidence", "Cases", "Exact", "Within one"].map((h) => (
                  <th key={h} className="py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.byConfidence.map((b) => (
                <tr key={b.band} className="border-t border-border">
                  <td className="py-1">{b.band}</td>
                  <td>{b.n}</td>
                  <td>{pct(b.exactRate)}</td>
                  <td>{pct(b.withinOneRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            A well-calibrated model is more accurate in the high-confidence band than the low one.
          </p>
        </>
      )}
    </Card>
  );
}

export default function PredictionsPage() {
  const qc = useQueryClient();
  const sum = useQuery({
    queryKey: ["tracker"],
    queryFn: () => api<TrackerSummary>("/predictions/summary"),
  });
  const [origin, setOrigin] = useState<"live" | "backtest">("live");
  const rows = useQuery({
    queryKey: ["predictions", origin],
    queryFn: () => api<PredictionRow[]>(`/predictions?origin=${origin}&limit=100`),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["tracker"] });
    qc.invalidateQueries({ queryKey: ["predictions"] });
  };
  const record = useMutation({
    mutationFn: () =>
      api<{ recorded: number; resolved: number }>("/predictions/record", { method: "POST" }),
    onSuccess: (r) => {
      setMsg(`Recorded ${r.recorded} new prediction(s), resolved ${r.resolved}.`);
      done();
    },
  });
  const back = useMutation({
    mutationFn: () => api("/predictions/backtest", { method: "POST" }),
    onSuccess: () => {
      setMsg(
        "Back-test queued. It needs the workers process and the analytics service; refresh in a minute.",
      );
      setTimeout(done, 20000);
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const s = sum.data;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Prediction tracker</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => record.mutate()}>
            Record / resolve now
          </Button>
          <Button variant="outline" onClick={() => back.mutate()}>
            Run back-test
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadFile("/export/predictions.csv", "predictions.csv").catch((e) =>
                setMsg((e as Error).message),
              )
            }
          >
            Export CSV
          </Button>
        </div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Each scoring run records where the model expects India&apos;s adoption stage to be in 6
        months (India&apos;s share of the foreign peak keeps growing at its recent rate). When the
        date arrives it is compared with what actually happened. Live results take 6 months to
        mature, so the <strong>back-test</strong> replays the same rule on historical series: it
        hides the last 26 weeks, predicts, then checks. Sample-data results only prove the plumbing.
      </p>
      {msg && (
        <p role="status" className="rounded-lg bg-muted p-2 text-sm">
          {msg}
        </p>
      )}
      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-1" data-tour="tracker-live">
            <h2 className="font-semibold">
              Live predictions {s.live.sample && <Badge tone="sample">Sample trends</Badge>}
            </h2>
            <p className="text-sm">
              {s.live.pending} pending · {s.live.n} resolved
            </p>
            {s.live.n > 0 && (
              <p className="text-sm">
                Exact {pct(s.live.exactRate)} · within one stage {pct(s.live.withinOneRate)} ·
                baseline exact {pct(s.live.baselineExactRate)}
              </p>
            )}
            {s.live.n === 0 && (
              <p className="text-xs text-muted-foreground">
                The first live predictions resolve 6 months after they were made.
              </p>
            )}
          </Card>
          <Block
            title="Back-test on real trends"
            s={s.backtest.real}
            note="Replayed on your tracked trends' own history (needs about 78+ weeks of data)."
          />
          <Block
            title="Back-test on sample trends"
            s={s.backtest.sample}
            note="Synthetic series: checks that the machinery works, not how well it predicts reality."
            tourKey="tracker-backtest"
          />
        </div>
      )}
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Predictions</h2>
          <div className="flex gap-1 text-sm">
            {(["live", "backtest"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOrigin(o)}
                className={`rounded-full border px-3 py-1 ${origin === o ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {o === "live" ? "Live" : "Back-test"}
              </button>
            ))}
          </div>
        </div>
        {rows.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None yet. Score your trends, then click “Record / resolve now”.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                {["Trend", "Made", "Horizon", "Predicted", "Actual", "Result", "Confidence"].map(
                  (h) => (
                    <th key={h} className="px-2 py-1 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.data?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 py-1">
                    <Link className="hover:underline" href={`/trends/${p.trendId}`}>
                      {p.trend}
                    </Link>{" "}
                    {p.isSample && <Badge tone="sample">Sample</Badge>}
                  </td>
                  <td className="px-2 py-1">{p.createdAt.slice(0, 10)}</td>
                  <td className="px-2 py-1">{p.horizonDate}</td>
                  <td className="px-2 py-1">{STAGE_LABEL[p.predictedStage]}</td>
                  <td className="px-2 py-1">
                    {p.actualStage ? (
                      STAGE_LABEL[p.actualStage]
                    ) : (
                      <span className="text-muted-foreground">pending</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {p.hit ? <Badge tone={tone[p.hit as keyof typeof tone]}>{p.hit}</Badge> : "–"}
                  </td>
                  <td className="px-2 py-1">
                    {p.confidence != null ? p.confidence.toFixed(2) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
