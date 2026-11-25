"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, downloadFile, type AnalyticsOverview } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";
const VERTICALS = [
  ["", "All verticals"],
  ["gifts", "Gifts"],
  ["ro", "RO / Water"],
  ["home-kitchen", "Home & Kitchen"],
  ["wellness", "Wellness"],
  ["pet", "Pet"],
  ["beauty", "Beauty"],
];

/** Sequential single-hue scale: stronger blue = stronger momentum. The number is always printed, never colour alone. */
const heat = (v: number | null) =>
  v == null
    ? "transparent"
    : `hsl(var(--primary) / ${0.08 + (Math.min(100, Math.max(0, v)) / 100) * 0.72})`;

export default function AnalyticsPage() {
  const [data, setData] = useState<"all" | "real" | "sample">("all");
  const [vertical, setVertical] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = `data=${data}${vertical ? `&vertical=${vertical}` : ""}`;
  const { data: d, isError } = useQuery({
    queryKey: ["analytics", q],
    queryFn: () => api<AnalyticsOverview>(`/analytics/overview?${q}`),
  });
  const dl = () =>
    downloadFile(`/export/trends.csv?${q}`, "trendbridge-trends.csv").catch((e) =>
      setErr((e as Error).message),
    );
  const real = d?.matrix.filter((m) => !m.isSample) ?? [];
  const sample = d?.matrix.filter((m) => m.isSample) ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Button variant="outline" onClick={dl}>
          Export trends CSV
        </Button>
      </div>
      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-sm" data-tour="analytics-filters">
        <select
          aria-label="Data"
          className={sel}
          value={data}
          onChange={(e) => setData(e.target.value as typeof data)}
        >
          <option value="all">All data</option>
          <option value="real">Real only</option>
          <option value="sample">Sample only</option>
        </select>
        <select
          aria-label="Vertical"
          className={sel}
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
        >
          {VERTICALS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {d && (
          <span className="self-center text-muted-foreground">
            {d.scored} of {d.count} trends scored
          </span>
        )}
      </div>
      {isError && <p className="text-sm text-danger">Could not load analytics.</p>}

      <Card className="space-y-2" data-tour="opportunity-matrix">
        <h2 className="font-semibold">Opportunity matrix</h2>
        <p className="text-xs text-muted-foreground">
          Right = stronger foreign momentum. Up = bigger India gap (less of the foreign peak already
          reached in India). Bubble size = commercial proof, or sustainability when there is no
          marketplace evidence yet. The top-right is where to look first.
        </p>
        {d && d.matrix.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing scored yet. Track trends, run sources and re-score.
          </p>
        ) : (
          <div
            className="h-96"
            role="img"
            aria-label="Bubble chart of foreign momentum against India gap"
          >
            <ResponsiveContainer>
              <ScatterChart margin={{ left: 0, right: 12, top: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Foreign momentum"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Foreign momentum",
                    position: "insideBottom",
                    offset: -12,
                    fontSize: 12,
                  }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="India gap"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "India gap", angle: -90, position: "insideLeft", fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <ZAxis type="number" dataKey="z" range={[40, 400]} name="Evidence" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as
                      AnalyticsOverview["matrix"][number] | undefined;
                    return p ? (
                      <div className="rounded-lg border border-border bg-card p-2 text-xs">
                        <strong>{p.name}</strong>
                        {p.isSample && " (sample)"}
                        <br />
                        Momentum {fmtScore(p.x)} · India gap {fmtScore(p.y)}
                        <br />
                        Size: {p.sizeBasis}
                        <br />
                        Opportunity {fmtScore(p.opportunity)}
                      </div>
                    ) : null;
                  }}
                />
                {real.length > 0 && (
                  <Scatter name="Live" data={real} fill="#2563eb" fillOpacity={0.7} />
                )}
                {sample.length > 0 && (
                  <Scatter name="Sample" data={sample} fill="#ea580c" fillOpacity={0.55} />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs">
          <span className="text-[#2563eb]">●</span> live{" "}
          <span className="ml-3 text-[#ea580c]">●</span> sample
        </p>
      </Card>

      <Card className="space-y-2" data-tour="country-heatmap">
        <h2 className="font-semibold">Country heatmap (momentum, top 15)</h2>
        {d && d.heatmap.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scored trends yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Trend</th>
                  {d?.heatmap.countries.map((c) => (
                    <th key={c} className="px-2 py-1 text-center font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d?.heatmap.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-1">
                      <Link className="hover:underline" href={`/trends/${r.id}`}>
                        {r.name}
                      </Link>{" "}
                      {r.isSample && <Badge tone="sample">Sample</Badge>}
                    </td>
                    {r.cells.map((v, i) => (
                      <td
                        key={i}
                        className="px-2 py-1 text-center tabular-nums"
                        style={{ background: heat(v) }}
                      >
                        {v == null ? "–" : Math.round(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          50 = flat, higher = growing. Darker blue = stronger momentum. A dash means no data for
          that country.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Rising stars</h2>
          <p className="text-xs text-muted-foreground">
            Highest foreign momentum among trends India has not reached yet (Emerging or earlier).
          </p>
          {d?.risingStars.length === 0 && (
            <p className="text-sm text-muted-foreground">None yet.</p>
          )}
          <ol className="divide-y divide-border text-sm">
            {d?.risingStars.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  {i + 1}.{" "}
                  <Link className="hover:underline" href={`/trends/${t.id}`}>
                    {t.name}
                  </Link>{" "}
                  {t.isSample && <Badge tone="sample">Sample</Badge>}
                </span>
                <span className="flex items-center gap-2">
                  {t.stage && <Badge>{STAGE_LABEL[t.stage]}</Badge>}
                  <span className="tabular-nums">{fmtScore(t.momentum)}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="space-y-2" data-tour="category-treemap">
          <h2 className="font-semibold">
            Categories (size = trends, colour = average opportunity)
          </h2>
          <div className="h-64" role="img" aria-label="Treemap of categories">
            <ResponsiveContainer>
              <Treemap
                data={d?.treemap ?? []}
                dataKey="size"
                nameKey="name"
                stroke="hsl(var(--card))"
                content={<TreeCell />}
              />
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="space-y-2" data-tour="marketplace-movers">
        <h2 className="font-semibold">Marketplace movers</h2>
        {d && d.movers.tracked === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rank history yet. Movers appear after two runs of a marketplace source (or two
            imports) for the same products. Rank is a proxy for demand, not sales.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["Climbing", d?.movers.risers],
                ["Falling", d?.movers.fallers],
              ] as const
            ).map(([title, list]) => (
              <div key={title}>
                <h3 className="mb-1 text-sm font-medium">{title}</h3>
                <ul className="divide-y divide-border text-sm">
                  {list?.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 py-1">
                      <span className="truncate" title={m.title}>
                        {m.url ? (
                          <a
                            className="hover:underline"
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {m.title}
                          </a>
                        ) : (
                          m.title
                        )}{" "}
                        <span className="text-xs text-muted-foreground">{m.marketplace}</span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums">
                        #{m.prevRank} → #{m.rank} ({m.change > 0 ? "▲" : "▼"} {Math.abs(m.change)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  avgOpportunity?: number | null;
}
function TreeCell({ x = 0, y = 0, width = 0, height = 0, name, size, avgOpportunity }: CellProps) {
  const v = avgOpportunity ?? null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: v == null ? "hsl(var(--muted))" : `hsl(var(--primary) / ${0.15 + (v / 100) * 0.7})`,
          stroke: "hsl(var(--card))",
          strokeWidth: 2,
        }}
      />
      {width > 70 && height > 34 && (
        <text x={x + 6} y={y + 16} fontSize={12} fill="hsl(var(--foreground))">
          {name}
        </text>
      )}
      {width > 70 && height > 34 && (
        <text x={x + 6} y={y + 31} fontSize={11} fill="hsl(var(--muted-foreground))">
          {size} · {v == null ? "–" : Math.round(v)}
        </text>
      )}
    </g>
  );
}
