"use client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ScoreDetail } from "@/lib/api";
import { SCORE_HELP } from "@/lib/scores";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 1000) / 10}%`);

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded bg-muted">
      <div
        className="h-2 rounded bg-primary"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** "Why this score": every input, weight and caveat behind the numbers. */
export function ScoreExplain({ d }: { d: ScoreDetail }) {
  const i = d.inputs;
  const conf = i.confidence;
  const level = d.isSample ? "sample" : conf.level;
  const history = d.history.filter((h) => h.opportunity != null);
  return (
    <Card className="space-y-4" data-tour="score-explain">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Why this score</h2>
        <span className="text-xs text-muted-foreground">
          Algorithm v{d.algorithmVersion} · computed{" "}
          {d.computedAt ? new Date(d.computedAt).toLocaleString() : ""}
        </span>
      </div>
      {d.isSample && (
        <p className="rounded-lg border border-dashed border-warn bg-warn/10 px-3 py-2 text-sm text-warn">
          Sample data: the series are synthetic, so these scores only demonstrate how the model
          works.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-6">
        <div title={SCORE_HELP.opportunity}>
          <p className="text-xs text-muted-foreground">India Opportunity</p>
          <p className="text-4xl font-bold">
            {d.opportunity == null ? "–" : fmtScore(d.opportunity)}
          </p>
          {d.customWeights && (
            <p className="text-xs text-warn">
              your weights (default {fmtScore(d.defaultOpportunity)})
            </p>
          )}
        </div>
        <div title={SCORE_HELP.confidence}>
          <p className="text-xs text-muted-foreground">Confidence</p>
          <p className="text-lg">
            <ConfidenceBadge level={level} />{" "}
            <span className="text-sm text-muted-foreground">{conf.value.toFixed(2)}</span>
          </p>
        </div>
        <div title={SCORE_HELP.stage}>
          <p className="text-xs text-muted-foreground">India stage</p>
          <p className="text-lg">
            {d.adoptionStage ? STAGE_LABEL[d.adoptionStage] : "Not available"}
          </p>
        </div>
        <div title={SCORE_HELP.lag}>
          <p className="text-xs text-muted-foreground">Typical India lag</p>
          <p className="text-lg">
            {i.categoryLag.lag_months != null ? `${i.categoryLag.lag_months} mo` : "–"}
            {i.categoryLag.ci_low != null && (
              <span className="text-xs text-muted-foreground">
                {" "}
                ({i.categoryLag.ci_low}–{i.categoryLag.ci_high})
              </span>
            )}
          </p>
        </div>
      </div>
      {d.explain?.note && <p className="text-sm text-warn">{d.explain.note}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              {["Input", "Value", "Weight used", "Adds", ""].map((h) => (
                <th key={h} className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.explain?.contributions.map((c) => {
              const info = d.info[c.key];
              return (
                <tr key={c.key} className="border-t border-border align-top">
                  <td className="px-2 py-1">
                    <span title={info?.help}>{info?.label ?? c.key}</span>
                  </td>
                  <td className="w-40 px-2 py-1">
                    {c.value == null ? (
                      <span className="text-xs text-muted-foreground">
                        Not available yet
                        {info && info.availableFrom > "0.3.0" ? ` (v${info.availableFrom})` : ""}
                      </span>
                    ) : (
                      <>
                        <span className="mr-2">{fmtScore(c.value)}</span>
                        <Bar value={c.value} />
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {c.value == null ? (
                      <span className="text-xs text-muted-foreground">excluded</span>
                    ) : (
                      pct(c.effectiveWeight)
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {c.value == null ? "–" : (Math.round(c.contribution * 10) / 10).toFixed(1)}
                  </td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">
                    {c.value == null ? "" : `of ${pct(c.weight)} set`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">
          Based on {pct(d.explain?.coverage)} of the total weight. Unavailable inputs are left out,
          not counted as zero.{" "}
          <Link className="underline" href="/scoring">
            Change weights
          </Link>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <h3 className="font-medium">Foreign signal</h3>
          <p title={SCORE_HELP.momentum}>
            Momentum <strong>{fmtScore(d.momentum)}</strong> · Breadth{" "}
            <strong>{fmtScore(d.breadth)}</strong> · Sustainability{" "}
            <strong>{fmtScore(d.sustainability)}</strong> · Proof{" "}
            <strong>{fmtScore(d.commercialProof)}</strong>
          </p>
          {i.foreign && (
            <p className="text-xs text-muted-foreground">
              {i.foreign.countries_confirming} of {i.foreign.countries_observed} foreign countries
              rising · {i.sourceTypes} source type(s) · agreement {pct(i.foreign.agreement)}
            </p>
          )}
          {i.foreign?.sustainability.spikiness != null && (
            <p className="text-xs text-muted-foreground">
              Spikiness {pct(i.foreign.sustainability.spikiness)} · persistence{" "}
              {pct(i.foreign.sustainability.persistence)} · slope stability{" "}
              {pct(i.foreign.sustainability.slope_stability)}
            </p>
          )}
          {i.proof.productCount === 0 && (
            <p className="text-xs text-muted-foreground">
              No marketplace products matched yet, so commercial proof is unavailable.
            </p>
          )}
          {Object.entries(i.momentumDetail).map(([cc, m]) => (
            <p key={cc} className="text-xs text-muted-foreground">
              {cc}: momentum {fmtScore(m.momentum)} (growth 7d {pct(m.growth.w1)}, 30d{" "}
              {pct(m.growth.w4)}, 90d {pct(m.growth.w13)}, 365d {pct(m.growth.w52)})
              {m.deseasonalised ? "" : " · seasonality not removed"}
            </p>
          ))}
        </div>
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <h3 className="font-medium">India side</h3>
          <p>
            India interest is <strong>{pct(i.india.ratio)}</strong> of the foreign peak
            {!i.comparable && " (not comparable: stage withheld)"}.
          </p>
          <p className="text-xs text-muted-foreground">
            Back-test group “{i.categoryLag.group}”: {i.categoryLag.n} case(s), basis{" "}
            {i.categoryLag.basis}. India early signal{" "}
            {i.india.weeks_since_early == null
              ? "not seen yet"
              : `${Math.round((i.india.weeks_since_early / 4.345) * 10) / 10} months ago`}
            .
          </p>
          {i.leadLag?.usable ? (
            <p className="text-xs text-muted-foreground">
              This trend’s own measured lead-lag vs {i.leadLag.foreign_country}: ~{i.leadLag.months}{" "}
              months (correlation {i.leadLag.correlation}).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This trend’s own lead-lag is not reliable (correlation below 0.4), so only the
              category lag is used.
            </p>
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer">Confidence breakdown and notes</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {Object.entries(conf.parts).map(([k, v]) => (
            <li key={k}>
              {k}: +{(v as number).toFixed(3)}
            </li>
          ))}
          {i.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>

      {history.length > 1 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Opportunity over time</h3>
          <div className="h-28">
            <ResponsiveContainer>
              <LineChart data={history.map((h) => ({ d: h.at.slice(0, 10), o: h.opportunity }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="d" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line dataKey="o" stroke="#2563eb" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <Badge>{d.isSample ? "sample" : "live"}</Badge>
    </Card>
  );
}
