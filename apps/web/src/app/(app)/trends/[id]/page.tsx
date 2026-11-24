"use client";
import { SampleBanner } from "@/components/sample-banner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Detail {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  priceBandInr: string | null;
  isSample: boolean;
  score: {
    opportunity: number | null;
    adoptionStage: string | null;
    lagMonths: number | null;
    algorithmVersion: string;
  } | null;
}
interface Series {
  points: { country: string; week: string; value: number }[];
}

export default function TrendDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery({ queryKey: ["trend", id], queryFn: () => api<Detail>(`/trends/${id}`) });
  const series = useQuery({
    queryKey: ["series", id],
    queryFn: () => api<Series>(`/trends/${id}/series`),
  });

  const rows = useMemo(() => {
    const by = new Map<string, Record<string, number | string>>();
    for (const p of series.data?.points ?? []) {
      if (p.country !== "US" && p.country !== "IN") continue;
      const r = by.get(p.week) ?? { week: p.week };
      r[p.country] = p.value;
      by.set(p.week, r);
    }
    return [...by.values()];
  }, [series.data]);

  const d = detail.data;
  return (
    <>
      <h1 className="text-2xl font-bold">{d?.name ?? "Trend"}</h1>
      {d?.isSample && <SampleBanner />}
      {d && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{d.category}</Badge>
          <Badge>{STAGE_LABEL[d.score?.adoptionStage ?? ""] ?? "–"}</Badge>
          <span className="text-muted-foreground">Price band {d.priceBandInr}</span>
          <span title={`Algorithm: ${d.score?.algorithmVersion}`}>
            Opportunity (placeholder): <strong>{fmtScore(d.score?.opportunity)}</strong>
          </span>
          {d.score?.lagMonths != null && <span>Lag ≈ {d.score.lagMonths} months (sample)</span>}
        </div>
      )}
      <Card>
        <h2 className="mb-2 font-semibold">Search interest: US vs India (synthetic)</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11 }}
                minTickGap={40}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="US"
                name="United States"
                stroke="hsl(var(--primary))"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="IN"
                name="India"
                stroke="hsl(var(--accent))"
                dot={false}
                strokeWidth={2}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {series.isError && <p className="text-sm text-danger">Could not load series.</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Synthetic series (is_sample=true). India curve is a lagged, damped copy of the US curve by
          construction.
        </p>
      </Card>
    </>
  );
}
