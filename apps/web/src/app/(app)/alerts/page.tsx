"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type AlertEvent, type AlertRow, type TrendRow, type WatchlistRow } from "@/lib/api";
import { ALERT_LABEL, ALERT_TYPES, DEFAULT_THRESHOLD } from "@trendbridge/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";
type AlertType = (typeof ALERT_TYPES)[number];

export default function AlertsPage() {
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api<AlertRow[]>("/alerts") });
  const events = useQuery({
    queryKey: ["alert-events"],
    queryFn: () => api<AlertEvent[]>("/alerts/events"),
    refetchInterval: 60_000,
  });
  const lists = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => api<WatchlistRow[]>("/watchlists"),
  });
  const trends = useQuery({
    queryKey: ["trends", "alert-picker"],
    queryFn: () => api<TrendRow[]>("/trends?limit=200&data=real"),
  });
  const [type, setType] = useState<AlertType>("score_above");
  const [threshold, setThreshold] = useState(75);
  const [scope, setScope] = useState<"trend" | "watchlist" | "all">("all");
  const [trendId, setTrendId] = useState("");
  const [listId, setListId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["alert-events"] });
    qc.invalidateQueries({ queryKey: ["alerts-unseen"] });
  };
  const create = useMutation({
    mutationFn: () =>
      api("/alerts", {
        method: "POST",
        json: {
          rule: {
            type,
            scope,
            ...(type !== "india_stage_up" ? { threshold } : {}),
            ...(scope === "watchlist" ? { watchlistId: Number(listId) } : {}),
          },
          trendId: scope === "trend" ? Number(trendId) : null,
        },
      }),
    onSuccess: () => {
      setMsg("Alert created.");
      inval();
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: number; active: boolean }) =>
      api(`/alerts/${v.id}`, { method: "PUT", json: { active: v.active } }),
    onSuccess: inval,
  });
  const del = useMutation({
    mutationFn: (id: number) => api(`/alerts/${id}`, { method: "DELETE" }),
    onSuccess: inval,
  });
  const evalNow = useMutation({
    mutationFn: () =>
      api<{ checked: number; fired: number }>("/alerts/evaluate", { method: "POST" }),
    onSuccess: (r) => {
      setMsg(`Checked ${r.checked} trend(s), ${r.fired} new alert(s).`);
      inval();
    },
  });
  const seen = useMutation({
    mutationFn: () => api("/alerts/events/seen", { method: "POST" }),
    onSuccess: inval,
  });
  const ready =
    scope === "all" || (scope === "trend" && trendId) || (scope === "watchlist" && listId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <Button variant="outline" onClick={() => evalNow.mutate()}>
          Check now
        </Button>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Alerts fire when something crosses a line, not on every run, and are checked after each
        scoring run. “All trends” covers your live trends (not sample data).
      </p>
      {msg && (
        <p role="status" className="rounded-lg bg-muted p-2 text-sm">
          {msg}
        </p>
      )}
      <Card className="space-y-3" data-tour="alert-form">
        <h2 className="font-semibold">New alert</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label>
            When{" "}
            <select
              aria-label="Alert type"
              className={sel}
              value={type}
              onChange={(e) => {
                const t = e.target.value as AlertType;
                setType(t);
                setThreshold(DEFAULT_THRESHOLD[t] || 0);
              }}
            >
              {ALERT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ALERT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          {type !== "india_stage_up" && (
            <label>
              {type === "score_above" ? "Score" : "India momentum"} ≥{" "}
              <input
                aria-label="Threshold"
                type="number"
                min={0}
                max={100}
                className={`${sel} w-20`}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>
          )}
          <label>
            For{" "}
            <select
              aria-label="Scope"
              className={sel}
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="all">all my live trends</option>
              <option value="trend">one trend</option>
              <option value="watchlist">a watchlist</option>
            </select>
          </label>
          {scope === "trend" && (
            <select
              aria-label="Trend"
              className={sel}
              value={trendId}
              onChange={(e) => setTrendId(e.target.value)}
            >
              <option value="">Choose…</option>
              {trends.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {scope === "watchlist" && (
            <select
              aria-label="Watchlist"
              className={sel}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
            >
              <option value="">Choose…</option>
              {lists.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={() => create.mutate()} disabled={!ready || create.isPending}>
            Create alert
          </Button>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Your alerts</h2>
          {alerts.data?.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          <ul className="divide-y divide-border text-sm">
            {alerts.data?.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {ALERT_LABEL[a.rule.type as AlertType]}
                  {a.rule.threshold != null && ` ≥ ${a.rule.threshold}`} ·{" "}
                  <span className="text-muted-foreground">
                    {a.rule.scope === "trend"
                      ? (a.trendName ?? "trend")
                      : a.rule.scope === "watchlist"
                        ? `list “${a.watchlistName ?? "?"}”`
                        : "all live trends"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={a.active}
                      onChange={(e) => toggle.mutate({ id: a.id, active: e.target.checked })}
                      aria-label="Active"
                    />
                    on
                  </label>
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => del.mutate(a.id)}
                  >
                    delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-2" data-tour="alert-events">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">What fired</h2>
            <Button variant="ghost" className="text-xs" onClick={() => seen.mutate()}>
              Mark all seen
            </Button>
          </div>
          {events.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing has fired yet.</p>
          )}
          <ul className="divide-y divide-border text-sm">
            {events.data?.map((e) => (
              <li key={e.id} className="py-1.5">
                <Link className="hover:underline" href={`/trends/${e.trendId}`}>
                  {e.message}
                </Link>{" "}
                {!e.seen && <Badge tone="primary">new</Badge>}
                <div className="text-xs text-muted-foreground">
                  {new Date(e.firedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
