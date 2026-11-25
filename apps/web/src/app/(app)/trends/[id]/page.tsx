"use client";
import { NewsList } from "@/components/news-list";
import { SampleBanner } from "@/components/sample-banner";
import { StaleWarning } from "@/components/stale-warning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GiftProfileDialog } from "@/components/gift-profile-dialog";
import { ScoreExplain } from "@/components/score-explain";
import { api, type NewsRow, type ProductRow, type ScoreDetail } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  status: string;
  origin: string;
  category: string | null;
  priceBandInr: string | null;
  isSample: boolean;
  keywords: { id: number; term: string; geos: string[]; lastFetchedAt: string | null }[];
  score: {
    opportunity: number | null;
    adoptionStage: string | null;
    lagMonths: number | null;
    algorithmVersion: string;
  } | null;
}
interface Series {
  countries: { code: string; name: string }[];
  points: {
    country: string;
    week: string;
    value: number;
    isSample: boolean;
    method: string | null;
  }[];
}

const COLORS = ["#2563eb", "#ea580c", "#0d9488", "#9333ea", "#ca8a04", "#db2777", "#475569"];

export default function TrendDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["trend", id], queryFn: () => api<Detail>(`/trends/${id}`) });
  const series = useQuery({
    queryKey: ["series", id],
    queryFn: () => api<Series>(`/trends/${id}/series`),
  });
  const news = useQuery({
    queryKey: ["trend-news", id],
    queryFn: () => api<NewsRow[]>(`/trends/${id}/news`),
  });
  const prods = useQuery({
    queryKey: ["trend-products", id],
    queryFn: () => api<ProductRow[]>(`/trends/${id}/products`),
  });
  const score = useQuery({
    queryKey: ["trend-score", id],
    queryFn: () => api<ScoreDetail>(`/trends/${id}/score`),
  });
  const [off, setOff] = useState<string[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);

  const approve = useMutation({
    mutationFn: () => api(`/trends/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/trends/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trends"] });
      router.push("/trends");
    },
  });

  const present = useMemo(
    () => [...new Set((series.data?.points ?? []).map((p) => p.country))],
    [series.data],
  );
  const rows = useMemo(() => {
    const by = new Map<string, Record<string, number | string>>();
    for (const p of series.data?.points ?? []) {
      const r = by.get(p.week) ?? { week: p.week };
      r[p.country] = p.value;
      by.set(p.week, r);
    }
    return [...by.values()];
  }, [series.data]);
  const lastLive =
    (series.data?.points ?? [])
      .filter((p) => !p.isSample)
      .map((p) => p.week)
      .sort()
      .at(-1) ?? null;
  const d = detail.data;
  const sample = d?.isSample;
  const relative = (series.data?.points ?? []).some((p) => p.method?.includes("google_trends"));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{d?.name ?? "Trend"}</h1>
        {d && !d.isSample && (
          <div className="flex gap-2">
            {d.status === "candidate" && (
              <Button onClick={() => approve.mutate()}>Approve &amp; track</Button>
            )}
            <Button variant="outline" onClick={() => setGiftOpen(true)}>
              Gift details
            </Button>
            <Button
              variant="outline"
              onClick={() => confirm("Delete this trend?") && remove.mutate()}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      {sample && <SampleBanner />}
      {d?.status === "candidate" && (
        <p className="rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm text-warn">
          Auto-created candidate from live marketplace signals. Review it, then approve to start
          tracking its keywords.
        </p>
      )}
      {d && !sample && (
        <StaleWarning iso={lastLive ? `${lastLive}T00:00:00Z` : null} label="Search interest" />
      )}
      {d && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {d.category && <Badge>{d.category}</Badge>}
          <Badge>{STAGE_LABEL[d.score?.adoptionStage ?? ""] ?? "Stage: not scored yet"}</Badge>
          {d.priceBandInr && (
            <span className="text-muted-foreground">Price band {d.priceBandInr}</span>
          )}
          {d.keywords.length > 0 && (
            <span className="text-muted-foreground">
              Keywords: {d.keywords.map((k) => k.term).join(", ")}
            </span>
          )}
          {score.data?.scored && (
            <span>
              Opportunity <strong>{fmtScore(score.data.opportunity)}</strong>
            </span>
          )}
        </div>
      )}
      {score.data?.scored ? (
        <ScoreExplain d={score.data} />
      ) : (
        score.data && (
          <Card>
            <p className="text-sm text-muted-foreground">
              Not scored yet. Scoring needs at least 26 weeks of search interest; click “Re-score
              all” on the Trend Explorer once data has arrived.
            </p>
          </Card>
        )
      )}
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Search interest by country{sample ? " (synthetic)" : ""}
          </h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {present.map((c, i) => (
              <label key={c} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!off.includes(c)}
                  onChange={() =>
                    setOff(off.includes(c) ? off.filter((x) => x !== c) : [...off, c])
                  }
                />
                <span style={{ color: COLORS[i % COLORS.length] }}>●</span>
                {c}
              </label>
            ))}
          </div>
        </div>
        {rows.length === 0 && !series.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No time series yet. Wait for the next Google Trends run, click Run now in Source
            Registry, or import a CSV.
          </p>
        ) : (
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
                {present
                  .filter((c) => !off.includes(c))
                  .map((c) => (
                    <Line
                      key={c}
                      type="monotone"
                      dataKey={c}
                      stroke={COLORS[present.indexOf(c) % COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                      connectNulls
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {series.isError && <p className="text-sm text-danger">Could not load series.</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          {sample
            ? "Synthetic series (is_sample=true); the India curve is a lagged, damped copy of the US curve by construction."
            : relative
              ? "Google Trends values are relative (0–100) within each country’s own request. Compare curve shapes and timing across countries, not heights."
              : "Imported or estimated values; see the source note for each point."}
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Marketplace products</h2>
        {prods.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  {["Rank", "Δ", "Product", "List", "Market", "Price", "Rating", "Reviews", ""].map(
                    (h) => (
                      <th key={h} className="px-2 py-1 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {prods.data.map((p) => {
                  const delta = p.prevRank != null && p.rank != null ? p.prevRank - p.rank : null;
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-2 py-1">#{p.rank ?? "–"}</td>
                      <td className="px-2 py-1">
                        {delta == null
                          ? "–"
                          : delta > 0
                            ? `▲ ${delta}`
                            : delta < 0
                              ? `▼ ${-delta}`
                              : "="}
                      </td>
                      <td className="max-w-sm px-2 py-1">
                        {p.url ? (
                          <a
                            className="hover:underline"
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {p.title}
                          </a>
                        ) : (
                          p.title
                        )}
                      </td>
                      <td className="px-2 py-1">{p.listType}</td>
                      <td className="px-2 py-1">{p.marketplace}</td>
                      <td className="whitespace-nowrap px-2 py-1">
                        {p.price != null ? `${p.currency} ${p.price}` : "–"}
                      </td>
                      <td className="px-2 py-1">{p.rating ?? "–"}</td>
                      <td className="px-2 py-1">{p.reviewCount ?? "–"}</td>
                      <td className="px-2 py-1">
                        {p.scraped && <Badge tone="warn">scraped · lower confidence</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No marketplace products matched yet. Enable the Amazon source or import a CSV from the
            Import page.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Rank is a proxy for demand, not sales. Rank change compares the last two snapshots.
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">News timeline</h2>
        <NewsList items={news.data ?? []} empty="No headlines matched this trend yet." />
      </Card>
      {d && !d.isSample && (
        <GiftProfileDialog trendId={d.id} open={giftOpen} onOpenChange={setGiftOpen} />
      )}
    </>
  );
}
