"use client";
import { NumField } from "@/components/num-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type FeatureMatrix, type VerticalDetail } from "@/lib/api";
import { STAGE_LABEL, fmtScore, inr } from "@/lib/utils";
import {
  COMPONENT_INFO,
  COMPONENT_KEYS,
  PRESENCE_LABEL,
  defaultSubscription,
  normaliseWeights,
  subscriptionEconomics,
} from "@trendbridge/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";
const FIT_TONE = { good: "ok", partial: "warn", poor: "danger" } as const;
const FIT_LABEL = { good: "Good fit", partial: "Partial", poor: "Poor fit" } as const;

/** Features rising abroad that India's brands lack. India presence is an editable estimate. */
export function FeatureMatrixPanel({ vkey }: { vkey: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["vfeatures", vkey],
    queryFn: () => api<FeatureMatrix>(`/verticals/${vkey}/features`),
  });
  const [water, setWater] = useState("");
  const setPresence = useMutation({
    mutationFn: (v: { key: string; value: number }) =>
      api(`/verticals/${vkey}/overrides`, {
        method: "PUT",
        json: { featurePresence: { [v.key]: v.value } },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vfeatures", vkey] });
      qc.invalidateQueries({ queryKey: ["vertical", vkey] });
    },
  });
  if (!data) return null;
  const profile = data.waterProfiles.find((p) => p.key === water);
  const top = data.features.filter((f) => f.gap != null && f.gap > 0).slice(0, 3);
  return (
    <Card className="space-y-3" data-tour="feature-matrix">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Feature gaps India has not filled</h2>
        {data.waterProfiles.length > 0 && (
          <label className="text-sm">
            Water type{" "}
            <select
              aria-label="Water type"
              className={sel}
              value={water}
              onChange={(e) => setWater(e.target.value)}
            >
              <option value="">All</option>
              {data.waterProfiles.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {data.note} Gap = how strongly the feature is rising abroad × how little India already has.
      </p>
      {top.length > 0 && (
        <p className="rounded-lg bg-muted p-2 text-sm">
          <strong>Biggest gaps right now:</strong>{" "}
          {top.map((f) => `${f.label} (${fmtScore(f.gap)})`).join(" · ")}
        </p>
      )}
      {profile && (
        <p className="rounded-lg border border-border p-2 text-sm">
          <strong>{profile.label}</strong> ({profile.typicalSource}). {profile.recommended}{" "}
          {profile.notes}{" "}
          <span className="text-xs text-muted-foreground">Guidance, not a water test.</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              {[
                "Feature",
                "In India today",
                "Rising abroad",
                "India stage",
                "Gap",
                ...(profile ? ["Fit for this water"] : []),
                "Evidence",
              ].map((h) => (
                <th key={h} className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.features.map((f) => (
              <tr key={f.key} className="border-t border-border align-top">
                <td className="px-2 py-1.5">
                  <div className="font-medium" title={f.description}>
                    {f.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{f.presenceNote}</div>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`India presence: ${f.label}`}
                    className={sel}
                    value={f.presence}
                    onChange={(e) =>
                      setPresence.mutate({ key: f.key, value: Number(e.target.value) })
                    }
                  >
                    {PRESENCE_LABEL.map((l, i) => (
                      <option key={l} value={i}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {f.edited && (
                    <Badge tone="warn" className="ml-1">
                      edited
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {f.trend?.foreignMomentum != null ? (
                    fmtScore(f.trend.foreignMomentum)
                  ) : (
                    <span className="text-muted-foreground">no score</span>
                  )}
                </td>
                <td className="px-2 py-1.5">{f.trend?.stage ? STAGE_LABEL[f.trend.stage] : "–"}</td>
                <td className="min-w-28 px-2 py-1.5">
                  {f.gap == null ? (
                    "–"
                  ) : (
                    <>
                      <span className="mr-2 tabular-nums">{fmtScore(f.gap)}</span>
                      <div className="mt-0.5 h-2 w-full rounded bg-muted">
                        <div
                          className="h-2 rounded bg-primary"
                          style={{ width: `${Math.min(100, f.gap)}%` }}
                        />
                      </div>
                    </>
                  )}
                </td>
                {profile && (
                  <td className="px-2 py-1.5">
                    {profile.featureFit[f.key] ? (
                      <Badge tone={FIT_TONE[profile.featureFit[f.key]!]}>
                        {FIT_LABEL[profile.featureFit[f.key]!]}
                      </Badge>
                    ) : (
                      "–"
                    )}
                  </td>
                )}
                <td className="px-2 py-1.5 text-xs">
                  {f.trend ? (
                    <Link className="underline" href={`/trends/${f.trend.id}`}>
                      {f.trend.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      no matching trend: add the starter set
                    </span>
                  )}
                  {f.trend?.isSample && (
                    <Badge tone="sample" className="ml-1">
                      Sample
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Filter subscription / refill economics (RO and any vertical with the subscription tool). */
export function SubscriptionCalculator() {
  const [a, setA] = useState(defaultSubscription());
  const r = useMemo(() => subscriptionEconomics(a), [a]);
  const set = (k: keyof typeof a) => (v: number) => setA({ ...a, [k]: v });
  return (
    <Card className="space-y-3" data-tour="subscription-calc">
      <h2 className="font-semibold">Filter subscription economics</h2>
      <p className="text-xs text-muted-foreground">
        Defaults are placeholders, not market data. Replace them with your own costs and what
        customers will pay.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <NumField
          label="Subscription price / year (incl. GST)"
          unit="₹"
          value={a.annualPriceInr}
          onChange={set("annualPriceInr")}
        />
        <NumField label="GST" unit="%" value={a.gstPct} onChange={set("gstPct")} />
        <NumField
          label="Filters and consumables / year"
          unit="₹"
          value={a.filterCostInr}
          onChange={set("filterCostInr")}
        />
        <NumField
          label="Delivery / year"
          unit="₹"
          value={a.deliveryCostInr}
          onChange={set("deliveryCostInr")}
        />
        <NumField
          label="Technician visits / year"
          unit="₹"
          value={a.serviceCostInr}
          onChange={set("serviceCostInr")}
        />
        <NumField
          label="Payment fees"
          unit="% of revenue"
          value={a.paymentFeePct}
          onChange={set("paymentFeePct")}
        />
        <NumField
          label="Subscribers lost / year"
          unit="%"
          value={a.churnPctPerYear}
          onChange={set("churnPctPerYear")}
        />
        <NumField
          label="Cost to win a subscriber"
          unit="₹"
          value={a.acquisitionCostInr}
          onChange={set("acquisitionCostInr")}
        />
        <NumField
          label="Device margin at signup"
          unit="₹"
          value={a.hardwareMarginInr}
          onChange={set("hardwareMarginInr")}
        />
      </div>
      <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm sm:grid-cols-3">
        <p>
          Annual contribution <strong>{inr(r.annualContribution)}</strong> (
          {r.contributionMarginPct}%)
        </p>
        <p>
          Expected lifetime <strong>{r.expectedLifetimeYears ?? "–"} yrs</strong>
        </p>
        <p>
          Lifetime value <strong>{r.lifetimeValue == null ? "–" : inr(r.lifetimeValue)}</strong>
        </p>
        <p>
          LTV : CAC <strong>{r.ltvToCac ?? "–"}</strong>
          {r.ltvToCac != null && r.ltvToCac < 3 && (
            <span className="text-warn"> (below the common 3× rule of thumb)</span>
          )}
        </p>
        <p>
          Payback <strong>{r.paybackMonths == null ? "never" : `${r.paybackMonths} months`}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          Lifetime = 1 ÷ churn, capped at 20 years; undiscounted.
        </p>
      </div>
    </Card>
  );
}

/** Edit what the vertical's config drives: news queries, keywords and the scoring preset. Defaults stay untouched. */
export function VerticalConfigEditor({ vkey, detail }: { vkey: string; detail: VerticalDetail }) {
  const qc = useQueryClient();
  const e = detail.effective;
  const [queries, setQueries] = useState(e.newsQueries.join("\n"));
  const [keywords, setKeywords] = useState(e.keywords.join(", "));
  const [weights, setWeights] = useState<Record<string, number>>(
    e.presetWeights as Record<string, number>,
  );
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setQueries(e.newsQueries.join("\n"));
    setKeywords(e.keywords.join(", "));
    setWeights(e.presetWeights as Record<string, number>);
  }, [e]);
  const done = (m: string) => {
    setMsg(m);
    qc.invalidateQueries({ queryKey: ["vertical", vkey] });
    qc.invalidateQueries({ queryKey: ["verticals"] });
    qc.invalidateQueries({ queryKey: ["trends"] });
  };
  const save = useMutation({
    mutationFn: () =>
      api(`/verticals/${vkey}/overrides`, {
        method: "PUT",
        json: {
          newsQueries: queries
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          keywords: keywords
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          presetWeights: weights,
        },
      }),
    onSuccess: () => done("Saved. News queries apply at the next news run."),
    onError: (x) => setMsg((x as Error).message),
  });
  const reset = useMutation({
    mutationFn: () => api(`/verticals/${vkey}/overrides`, { method: "DELETE" }),
    onSuccess: () => done("Back to the shipped defaults."),
  });
  const norm = normaliseWeights(weights);
  const input = "w-full rounded-lg border border-border bg-background px-2 py-1 text-sm";
  return (
    <Card className="space-y-3" data-tour="vertical-config">
      <h2 className="font-semibold">Vertical settings</h2>
      <p className="text-xs text-muted-foreground">
        This vertical is defined by a config file; edits here are saved separately and can be reset.
        News queries are used when you track nothing yet; the preset weighting ranks this vertical's
        trends.
      </p>
      <label className="block text-sm">
        Default news queries (one per line)
        <textarea
          aria-label="News queries"
          className={input}
          rows={4}
          value={queries}
          onChange={(x) => setQueries(x.target.value)}
        />
      </label>
      <label className="block text-sm">
        Keywords (comma separated)
        <input
          aria-label="Keywords"
          className={input}
          value={keywords}
          onChange={(x) => setKeywords(x.target.value)}
        />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Opportunity weighting for this vertical</legend>
        {COMPONENT_KEYS.map((k) => (
          <div key={k} className="grid items-center gap-2 text-sm sm:grid-cols-[14rem_1fr_3rem]">
            <label htmlFor={`vw-${k}`} title={COMPONENT_INFO[k].help}>
              {COMPONENT_INFO[k].label}
            </label>
            <input
              id={`vw-${k}`}
              type="range"
              min={0}
              max={100}
              value={Math.round((weights[k] ?? 0) * 100)}
              onChange={(x) => setWeights({ ...weights, [k]: Number(x.target.value) / 100 })}
            />
            <span className="tabular-nums">{Math.round(norm[k] * 100)}%</span>
          </div>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save settings
        </Button>
        <Button variant="outline" onClick={() => reset.mutate()}>
          Reset to defaults
        </Button>
        {Object.keys(detail.overrides).length > 0 && <Badge tone="warn">customised</Badge>}
        {msg && (
          <span role="status" className="text-sm text-ok">
            {msg}
          </span>
        )}
      </div>
    </Card>
  );
}
