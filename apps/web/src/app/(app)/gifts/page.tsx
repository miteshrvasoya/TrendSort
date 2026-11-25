"use client";
import { GiftCard } from "@/components/gift-card";
import { SampleBanner } from "@/components/sample-banner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type GiftFacets, type GiftWeek, type GiftsResponse } from "@/lib/api";
import { WINDOW_LABEL, WINDOW_TONE, fmtDate } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";
const label = (s: string) => s.replace(/-/g, " ");

export default function GiftsPage() {
  const [f, setF] = useState({
    occasion: "",
    recipient: "",
    budget: "",
    age: "",
    interest: "",
    personalisation: "",
    corporate: false,
    notSaturated: true,
    data: "all",
    q: "",
  });
  const facets = useQuery({
    queryKey: ["gift-facets"],
    queryFn: () => api<GiftFacets>("/gifts/facets"),
  });
  const week = useQuery({ queryKey: ["gift-week"], queryFn: () => api<GiftWeek>("/gifts/week") });
  const qs = new URLSearchParams(
    Object.entries({
      ...f,
      corporate: f.corporate ? "true" : "",
      notSaturated: String(f.notSaturated),
    }).filter(([, v]) => v !== ""),
  ).toString();
  const res = useQuery({
    queryKey: ["gifts", qs],
    queryFn: () => api<GiftsResponse>(`/gifts?${qs}`),
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const Sel = ({
    k,
    title,
    opts,
  }: {
    k: "recipient" | "age" | "interest" | "personalisation";
    title: string;
    opts: readonly string[];
  }) => (
    <select
      aria-label={title}
      className={sel}
      value={f[k]}
      onChange={(e) => set(k, e.target.value)}
    >
      <option value="">{title}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );
  const w = week.data;
  const festName = res.data?.window?.festival;

  return (
    <>
      {res.data?.items.some((i) => i.isSample) && <SampleBanner />}
      <Card data-tour="gift-of-week" className="space-y-1 border-primary/40">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Gift of the week</h2>
          {w && <span className="text-xs text-muted-foreground">{w.week}</span>}
        </div>
        {w?.item ? (
          <>
            <p className="text-lg font-medium">
              {w.item.name} {w.item.isSample && <Badge tone="sample">Sample</Badge>}
            </p>
            <p className="text-sm text-muted-foreground">{w.reason}</p>
            {w.window && (
              <p className="text-sm">
                Latest import order: <strong>{fmtDate(w.window.importDeadline)}</strong> (
                {w.window.daysToImportDeadline} days left)
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{w?.reason ?? "Loading…"}</p>
        )}
      </Card>

      <Card className="space-y-3" data-tour="gift-filters">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Occasion"
            className={sel}
            value={f.occasion}
            onChange={(e) => set("occasion", e.target.value)}
          >
            <option value="">Any occasion</option>
            <optgroup label="Festivals">
              {facets.data?.occasions
                .filter((o) => o.festival)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Other occasions">
              {facets.data?.occasions
                .filter((o) => !o.festival)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {label(o.name)}
                  </option>
                ))}
            </optgroup>
          </select>
          <Sel k="recipient" title="Any recipient" opts={facets.data?.recipients ?? []} />
          <select
            aria-label="Budget"
            className={sel}
            value={f.budget}
            onChange={(e) => set("budget", e.target.value)}
          >
            <option value="">Any budget (INR)</option>
            {facets.data?.budgets.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <Sel k="age" title="Any age" opts={facets.data?.ages ?? []} />
          <Sel k="interest" title="Any interest" opts={facets.data?.interests ?? []} />
          <Sel
            k="personalisation"
            title="Any personalisation"
            opts={facets.data?.personalisation ?? []}
          />
          <select
            aria-label="Data"
            className={sel}
            value={f.data}
            onChange={(e) => set("data", e.target.value)}
          >
            <option value="all">All data</option>
            <option value="real">Real only</option>
            <option value="sample">Sample only</option>
          </select>
          <input
            aria-label="Search gifts"
            placeholder="Search…"
            className={`${sel} ml-auto`}
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={f.notSaturated}
              onChange={(e) => set("notSaturated", e.target.checked)}
            />{" "}
            Hide Mainstream / Saturated in India
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={f.corporate}
              onChange={(e) => set("corporate", e.target.checked)}
            />{" "}
            Corporate-friendly only
          </label>
          {res.data && (
            <span className="text-muted-foreground">
              {res.data.count} gift ideas
              {res.data.hiddenSaturated > 0 &&
                f.notSaturated &&
                ` · ${res.data.hiddenSaturated} hidden as already mainstream in India`}
            </span>
          )}
        </div>
        {res.data?.window && (
          <p className="rounded-lg bg-muted p-2 text-sm">
            <Badge tone={WINDOW_TONE[res.data.window.status]}>
              {festName}: {WINDOW_LABEL[res.data.window.status]}
            </Badge>{" "}
            festival {fmtDate(res.data.window.festivalDate)} · latest import order{" "}
            <strong>{fmtDate(res.data.window.importDeadline)}</strong> · latest manufacture start{" "}
            {fmtDate(res.data.window.manufactureDeadline)}
          </p>
        )}
        {res.data?.evergreen && (
          <p className="text-sm text-muted-foreground">
            Evergreen occasion: no fixed date, so no sourcing deadline applies.
          </p>
        )}
      </Card>

      {res.isError && <p className="text-sm text-danger">Could not load gifts.</p>}
      {res.data?.count === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No gifts match. Loosen a filter
            {f.notSaturated && ", or show Mainstream/Saturated gifts"}. To add your own,{" "}
            <a className="underline" href="/trends">
              track a trend
            </a>{" "}
            and add gift details on its page.
          </p>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {res.data?.items.map((g) => (
          <GiftCard
            key={g.id}
            g={g}
            window={res.data.window}
            festival={res.data.window && g.occasions.includes(f.occasion) ? festName : undefined}
          />
        ))}
      </div>
    </>
  );
}
