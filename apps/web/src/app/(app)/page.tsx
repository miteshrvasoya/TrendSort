"use client";
import { SampleBanner } from "@/components/sample-banner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NewsList } from "@/components/news-list";
import { StaleWarning } from "@/components/stale-warning";
import { api, type NewsRow, type SourceRow, type TrendRow } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function Dashboard() {
  const trends = useQuery({
    queryKey: ["trends", "top"],
    queryFn: () => api<TrendRow[]>("/trends?limit=8"),
  });
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api<SourceRow[]>("/sources") });
  const news = useQuery({ queryKey: ["news"], queryFn: () => api<NewsRow[]>("/news") });
  const newest =
    sources.data
      ?.map((x) => x.lastSuccessAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const live = sources.data?.filter((s) => s.status === "healthy").length ?? 0;

  return (
    <>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <SampleBanner />
      <StaleWarning iso={newest} label="Live sources" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Trend entities</p>
          <p className="text-3xl font-bold">{trends.data?.length ?? "–"}+</p>
          <p className="text-xs text-muted-foreground">all sample data</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Sources registered</p>
          <p className="text-3xl font-bold">{sources.data?.length ?? "–"}</p>
          <p className="text-xs text-muted-foreground">{live} syncing live · total cost Rs 0</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Scoring model</p>
          <p className="text-3xl font-bold">Phase 2</p>
          <p className="text-xs text-muted-foreground">scores shown are placeholders</p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Top sample opportunities</h2>
        {trends.isError && (
          <p className="text-sm text-danger">Could not load trends. Is the API running?</p>
        )}
        {trends.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <ul className="divide-y divide-border">
          {trends.data?.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/trends/${t.id}`} className="font-medium hover:underline">
                {t.name}
              </Link>
              <span className="flex items-center gap-2 text-sm">
                <Badge>{STAGE_LABEL[t.adoptionStage ?? ""] ?? "–"}</Badge>
                <span title="Placeholder sample score">{fmtScore(t.opportunity)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Latest headlines</h2>
        <NewsList
          items={news.data ?? []}
          empty="No headlines yet. Enable and run Google News RSS or the trade-press feeds in Source Registry."
        />
      </Card>
    </>
  );
}
