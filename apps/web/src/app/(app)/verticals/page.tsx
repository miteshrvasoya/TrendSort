"use client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type VerticalSummary } from "@/lib/api";
import { fmtScore } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function VerticalsPage() {
  const { data, isError } = useQuery({
    queryKey: ["verticals"],
    queryFn: () => api<VerticalSummary[]>("/verticals"),
  });
  return (
    <>
      <h1 className="text-2xl font-bold">Verticals</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Each vertical is a config file: its keywords, default news queries, scoring weights,
        India-fit notes and (for RO) a feature taxonomy. Open one to rank its trends with its own
        weighting.
      </p>
      {isError && <p className="text-sm text-danger">Could not load verticals.</p>}
      <div className="grid gap-3 md:grid-cols-2" data-tour="vertical-list">
        {data?.map((v) => (
          <Card key={v.key} className="space-y-2" data-testid="vertical-card">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={v.key === "gifts" ? "/gifts" : `/verticals/${v.key}`}
                className="text-lg font-semibold hover:underline"
              >
                {v.name}
              </Link>
              <div className="flex gap-1">
                {v.hasFeatures && <Badge tone="primary">feature gaps</Badge>}
                {v.tools.includes("subscription") && (
                  <Badge tone="primary">subscription tool</Badge>
                )}
                {v.customised && <Badge tone="warn">customised</Badge>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{v.description}</p>
            <p className="text-sm">
              {v.trends} trends ({v.real} live, {v.sample} sample) · {v.scored} scored
              {v.avgOpportunity != null && (
                <>
                  {" "}
                  · average opportunity <strong>{fmtScore(v.avgOpportunity)}</strong>
                </>
              )}
            </p>
            {v.top && (
              <p className="text-sm">
                Top:{" "}
                <Link className="underline" href={`/trends/${v.top.id}`}>
                  {v.top.name}
                </Link>{" "}
                ({fmtScore(v.top.opportunity)})
                {v.top.isSample && (
                  <Badge tone="sample" className="ml-1">
                    Sample
                  </Badge>
                )}
              </p>
            )}
            <Link className="text-sm underline" href={`/verticals/${v.key}`}>
              Open {v.name}
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
