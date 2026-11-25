"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type BacktestResponse, type WeightsResponse } from "@/lib/api";
import { SCORE_HELP } from "@/lib/scores";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const KEYS = [
  "foreignMomentum",
  "lagWindow",
  "competitionGap",
  "priceFit",
  "margin",
  "regulatory",
  "logistics",
  "seasonality",
];

export default function ScoringPage() {
  const qc = useQueryClient();
  const w = useQuery({
    queryKey: ["weights"],
    queryFn: () => api<WeightsResponse>("/settings/weights"),
  });
  const bt = useQuery({
    queryKey: ["backtest"],
    queryFn: () => api<BacktestResponse>("/backtest"),
  });
  const [draft, setDraft] = useState<Record<string, number>>({});
  useEffect(() => {
    if (w.data) setDraft(w.data.weights);
  }, [w.data]);
  const total = KEYS.reduce((a, k) => a + (draft[k] ?? 0), 0) || 1;
  const done = () => {
    qc.invalidateQueries({ queryKey: ["weights"] });
    qc.invalidateQueries({ queryKey: ["trends"] });
    qc.invalidateQueries({ queryKey: ["trend-score"] });
  };
  const save = useMutation({
    mutationFn: () => api("/settings/weights", { method: "PUT", json: draft }),
    onSuccess: done,
  });
  const reset = useMutation({
    mutationFn: () => api("/settings/weights", { method: "DELETE" }),
    onSuccess: done,
  });

  return (
    <>
      <h1 className="text-2xl font-bold">Scoring &amp; weights</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Opportunity is a weighted blend of eight inputs. Drag the sliders to say what matters to
        you; weights are renormalised to 100%. Inputs that have no data yet (price fit, margin,
        regulation, logistics arrive in v0.5) are left out rather than guessed, and shown as such on
        every trend.
      </p>
      <Card className="space-y-3" data-tour="weight-sliders">
        {KEYS.map((k) => {
          const info = w.data?.info[k];
          const unavailable = info && info.availableFrom > "0.3.0";
          return (
            <div key={k} className="grid items-center gap-2 sm:grid-cols-[14rem_1fr_5rem]">
              <label htmlFor={`w-${k}`} className="text-sm" title={info?.help}>
                {info?.label ?? k}
                {unavailable && (
                  <Badge className="ml-2" tone="neutral">
                    data from v{info!.availableFrom}
                  </Badge>
                )}
              </label>
              <input
                id={`w-${k}`}
                type="range"
                min={0}
                max={100}
                value={Math.round((draft[k] ?? 0) * 100)}
                onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) / 100 })}
              />
              <span className="text-sm tabular-nums">
                {Math.round(((draft[k] ?? 0) / total) * 100)}%
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save weights
          </Button>
          <Button variant="outline" onClick={() => reset.mutate()}>
            Reset to defaults
          </Button>
          {w.data?.custom && <Badge tone="warn">custom weights active</Badge>}
          {save.isSuccess && (
            <span role="status" className="text-sm text-ok">
              Saved. Scores in the explorer now use these weights.
            </span>
          )}
        </div>
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">How the scores work (v{w.data?.algorithmVersion})</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Momentum</strong>: {SCORE_HELP.momentum.split(": ")[1]}
          </li>
          <li>
            <strong>Breadth</strong>: {SCORE_HELP.breadth.split(": ")[1]}
          </li>
          <li>
            <strong>Sustainability</strong>: {SCORE_HELP.sustainability.split(": ")[1]}
          </li>
          <li>
            <strong>Commercial proof</strong>: {SCORE_HELP.proof.split(": ")[1]}
          </li>
          <li>
            <strong>India stage</strong>: {SCORE_HELP.stage}
          </li>
          <li>
            <strong>Confidence</strong>: {SCORE_HELP.confidence.split(": ")[1]}
          </li>
        </ul>
        <p className="text-muted-foreground">
          Opportunity = Σ weight × input ÷ Σ weight of inputs that have data. It needs foreign
          momentum and at least 30% of the weight, and is capped at 49 if margin or regulatory ease
          is below 15.
        </p>
      </Card>

      <Card className="space-y-2" data-tour="backtest">
        <h2 className="font-semibold">India lag back-test</h2>
        <p className="rounded-lg border border-dashed border-warn bg-warn/10 p-2 text-sm text-warn">
          {bt.data?.note}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {bt.data?.groups.map((g) => (
            <Badge key={g.group}>
              {g.group}: {g.medianLagMonths} mo median ({g.n} cases
              {g.measured ? `, ${g.measured} measured` : ""})
            </Badge>
          ))}
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground">
              <tr>
                {["Case", "Group", "Rose abroad", "Rose in India", "Lag (mo)", "Source"].map(
                  (h) => (
                    <th key={h} className="px-2 py-1 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {bt.data?.cases.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-2 py-1">{c.name}</td>
                  <td className="px-2 py-1">{c.group}</td>
                  <td className="px-2 py-1">{c.usRise}</td>
                  <td className="px-2 py-1">{c.inRise}</td>
                  <td className="px-2 py-1">{c.measuredLagMonths ?? c.estimatedLagMonths}</td>
                  <td className="px-2 py-1">
                    {c.measuredLagMonths != null ? (
                      <Badge tone="ok">measured r={c.measuredCorrelation?.toFixed(2)}</Badge>
                    ) : (
                      <Badge tone="warn">estimate</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          To replace estimates with measurements run{" "}
          <code>pnpm --filter @trendbridge/workers measure-lag</code> on a machine with internet
          (Google Trends monthly history, US vs India, cross-correlation). Only lags with
          correlation ≥ 0.4 replace an estimate.
        </p>
      </Card>
    </>
  );
}
