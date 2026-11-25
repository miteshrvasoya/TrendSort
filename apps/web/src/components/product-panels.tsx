"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  api,
  type FitResponse,
  type IndiaListingsResponse,
  type ReviewsResponse,
  type ScenarioRow,
} from "@/lib/api";
import { inr } from "@/lib/utils";
import { formatInr, sourcingHint, type FitAttrs, type FitStatus } from "@trendbridge/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

const ROUTE: Record<string, string> = {
  import: "Import and resell",
  manufacture: "Indian manufacture",
  hybrid: "Hybrid",
  skip: "Skip",
};

/** Primary unit-economics scenario for the trend, with a link to the full calculator. */
export function EconomicsSummary({
  trendId,
  isSample,
  group,
}: {
  trendId: number;
  isSample: boolean;
  group: string;
}) {
  const { data } = useQuery({
    queryKey: ["scenarios", trendId],
    queryFn: () => api<ScenarioRow[]>(`/economics/scenarios?trendId=${trendId}`),
  });
  const s = data?.find((x) => x.isPrimary) ?? data?.[0];
  const r = s?.results;
  const best = r?.best;
  return (
    <Card className="space-y-2" data-tour="trend-economics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Unit economics</h2>
        <Link className="text-sm underline" href={`/economics?trend=${trendId}`}>
          {s ? "Open calculator" : "Start a scenario"}
        </Link>
      </div>
      {!s || !r || !best ? (
        <p className="text-sm text-muted-foreground">
          No scenario yet. Open the calculator, enter supplier quotes, and save it as this
          trend&apos;s primary scenario; its margin then feeds the Opportunity score.
        </p>
      ) : (
        <>
          {s.isSample && <Badge tone="sample">Sample scenario (synthetic costs)</Badge>}
          <p className="text-sm">
            Recommended: <strong>{ROUTE[r.recommendation.route]}</strong>. Best route {best.route}:{" "}
            {inr(best.contribution)} per unit, <strong>{best.marginPct.toFixed(1)}% margin</strong>,
            break-even{" "}
            {best.breakEvenUnits == null
              ? "never"
              : `${best.breakEvenUnits.toLocaleString("en-IN")} units`}
            , first order {formatInr(best.workingCapital)}, lead time {best.leadTimeDays} days.
          </p>
          <p className="text-xs text-muted-foreground">
            {r.recommendation.reasons[0]} Scenario “{s.name}”, updated{" "}
            {new Date(s.updatedAt).toLocaleDateString()}.
            {isSample
              ? ""
              : " Margin and price fit use the primary scenario when the trend is next scored."}
          </p>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        <strong>Sourcing hint:</strong> {sourcingHint(group).route}. Likely hubs:{" "}
        {sourcingHint(group).hubs}.
      </p>
    </Card>
  );
}

/** Praise and complaints mined from reviews you imported, with improvement hints. */
export function ReviewsPanel({ trendId }: { trendId: number }) {
  const { data } = useQuery({
    queryKey: ["reviews", trendId],
    queryFn: () => api<ReviewsResponse>(`/trends/${trendId}/reviews`),
  });
  const a = data?.analysis;
  return (
    <Card className="space-y-2" data-tour="trend-reviews">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">What reviewers say</h2>
        <Link href="/import" className="text-sm underline">
          Import reviews
        </Link>
      </div>
      {!a ? (
        <p className="text-sm text-muted-foreground">
          No reviews imported. Review text is not fetched automatically (marketplace terms). Export
          reviews with a free browser tool you run yourself and import them as CSV or JSON; themes
          are then counted here.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {a.n} reviews · average {a.avgRating}★ · {Math.round(a.lowRatingShare * 100)}% rated
            1–2★{" "}
            {data?.sources.length ? (
              <span className="text-muted-foreground">({data.sources.join(", ")})</span>
            ) : null}
          </p>
          {a.caveat && <p className="text-xs text-warn">{a.caveat}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Praised for", a.praise, "ok"],
                ["Complaints", a.complaints, "danger"],
              ] as const
            ).map(([title, list, tone]) => (
              <div key={title}>
                <h3 className="mb-1 text-sm font-medium">{title}</h3>
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing recurring found.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((t) => (
                      <li key={t.key} className="text-sm">
                        <div className="flex justify-between">
                          <span>{t.label}</span>
                          <Badge tone={tone}>
                            {t.count} ({Math.round(t.share * 100)}%)
                          </Badge>
                        </div>
                        {t.examples[0] && (
                          <p className="text-xs italic text-muted-foreground">“{t.examples[0]}”</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {a.suggestions.length > 0 && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <h3 className="font-medium">Make yours better</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {a.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Method: {data?.method}.</p>
        </>
      )}
    </Card>
  );
}

/** Matching Indian listings, with the honest caveat about what absence means. */
export function IndiaListingsPanel({ trendId }: { trendId: number }) {
  const { data } = useQuery({
    queryKey: ["india-listings", trendId],
    queryFn: () => api<IndiaListingsResponse>(`/trends/${trendId}/india-listings`),
  });
  return (
    <Card className="space-y-2" data-tour="trend-india-listings">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">India market</h2>
        <Link href="/import" className="text-sm underline">
          Import listings
        </Link>
      </div>
      {data?.verdict === "not_checked" && (
        <p className="text-sm text-muted-foreground">
          India listings have not been checked yet. Enable the Amazon source (it scans Amazon.in top
          lists) or import listings you found on Amazon.in, Flipkart or Meesho.
        </p>
      )}
      {data?.verdict === "none_found_in_scanned_lists" && (
        <p className="text-sm">
          <Badge tone="warn">No match found in scanned lists</Badge>{" "}
          <span className="text-muted-foreground">
            a possible gap, but verify by searching the marketplaces yourself.
          </span>
        </p>
      )}
      {data && data.count > 0 && (
        <>
          <p className="text-sm">
            {data.count} Indian listing{data.count === 1 ? "" : "s"}
            {data.priceRange && (
              <>
                , price {inr(data.priceRange.min)}–{inr(data.priceRange.max)} (median{" "}
                {inr(data.priceRange.median)})
              </>
            )}
          </p>
          <ul className="divide-y divide-border text-sm">
            {data.listings.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-1">
                <span>
                  {l.marketplace} ·{" "}
                  {l.url ? (
                    <a
                      className="hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={l.url}
                    >
                      {l.title}
                    </a>
                  ) : (
                    l.title
                  )}
                </span>
                <span className="text-muted-foreground">
                  {l.priceInr != null ? inr(l.priceInr) : "–"}
                  {l.rating != null && ` · ${l.rating}★`}
                  {l.reviewCount != null && ` · ${l.reviewCount} reviews`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-muted-foreground">{data?.caveat}</p>
    </Card>
  );
}

const STATUS_TONE: Record<FitStatus, "ok" | "warn" | "danger"> = {
  ok: "ok",
  check: "warn",
  action: "danger",
};
const STATUS_LABEL: Record<FitStatus, string> = { ok: "OK", check: "Check", action: "Action" };
const ATTRS: [keyof FitAttrs, string][] = [
  ["electrical", "Mains-powered"],
  ["wireless", "Wi-Fi / Bluetooth"],
  ["battery", "Has a battery"],
  ["foodContact", "Food or drink contact"],
  ["cosmetic", "Cosmetic"],
  ["waterRelated", "Water-related"],
  ["animalDerived", "Animal-derived material"],
  ["liquidOrHazmat", "Liquid / hazardous"],
  ["fragile", "Fragile"],
  ["festiveColourSensitive", "Colour-sensitive (festive)"],
];

/** India fit checklist. Starts from marked heuristics; only saved attributes feed the score. */
export function FitPanel({ trendId, isSample }: { trendId: number; isSample: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["fit", trendId],
    queryFn: () => api<FitResponse>(`/trends/${trendId}/fit`),
  });
  const [attrs, setAttrs] = useState<FitAttrs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (data) setAttrs(data.attrs);
  }, [data]);
  const save = useMutation({
    mutationFn: () => api(`/trends/${trendId}/fit`, { method: "PUT", json: attrs }),
    onSuccess: () => {
      setMsg(
        "Saved. Regulatory ease and logistics now feed this trend's score at the next scoring run.",
      );
      qc.invalidateQueries({ queryKey: ["fit", trendId] });
    },
    onError: (e) => setMsg((e as Error).message),
  });
  if (!data || !attrs) return null;
  const dirty = JSON.stringify(attrs) !== JSON.stringify(data.attrs);
  return (
    <Card className="space-y-3" data-tour="trend-fit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">India fit checks</h2>
        <span className="text-sm">
          Regulatory ease <strong>{data.scores.regulatory}</strong> · Logistics{" "}
          <strong>{data.scores.logistics}</strong>{" "}
          {data.saved ? (
            <Badge tone="ok">saved</Badge>
          ) : (
            <Badge tone="warn">inferred: review, then save</Badge>
          )}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
      {!isSample && (
        <details className="text-sm">
          <summary className="cursor-pointer">Product attributes (drive the checks)</summary>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {ATTRS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={attrs[k] as boolean}
                  onChange={(e) => setAttrs({ ...attrs, [k]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1">
              Size{" "}
              <select
                className="rounded border border-border bg-background px-1"
                value={attrs.size}
                onChange={(e) => setAttrs({ ...attrs, size: e.target.value as FitAttrs["size"] })}
              >
                <option>small</option>
                <option>medium</option>
                <option>large</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (!dirty && data.saved)}
            >
              {data.saved ? "Save changes" : "Confirm and save"}
            </Button>
            {msg && (
              <span role="status" className="text-xs text-ok">
                {msg}
              </span>
            )}
          </div>
        </details>
      )}
      <ul className="space-y-2">
        {data.checks
          .filter((c) => c.status !== "ok")
          .concat(data.checks.filter((c) => c.status === "ok"))
          .map((c) => (
            <li key={c.key} className="text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                <span className="font-medium">{c.title}</span>
              </div>
              <p className="ml-1 text-xs text-muted-foreground">
                {c.detail} <span className="italic">Verify with: {c.verifyWith}.</span>
              </p>
            </li>
          ))}
      </ul>
    </Card>
  );
}
