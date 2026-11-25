"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type WatchlistRow } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function WatchlistsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => api<WatchlistRow[]>("/watchlists"),
  });
  const [name, setName] = useState("");
  const inval = () => qc.invalidateQueries({ queryKey: ["watchlists"] });
  const create = useMutation({
    mutationFn: () => api("/watchlists", { method: "POST", json: { name } }),
    onSuccess: () => {
      setName("");
      inval();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/watchlists/${id}`, { method: "DELETE" }),
    onSuccess: inval,
  });
  const drop = useMutation({
    mutationFn: (v: { id: number; trendId: number }) =>
      api(`/watchlists/${v.id}/items/${v.trendId}`, { method: "DELETE" }),
    onSuccess: inval,
  });
  return (
    <>
      <h1 className="text-2xl font-bold">Watchlists</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Save trends you care about and watch how their Opportunity moves. Add trends from their
        page; set alerts on a whole list from the Alerts page.
      </p>
      <Card className="flex flex-wrap items-center gap-2" data-tour="watchlist-new">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <input
            aria-label="New watchlist name"
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
            placeholder="New watchlist name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Create watchlist
          </Button>
        </form>
      </Card>
      {data?.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No watchlists yet. Create one, then add trends from a trend page.
          </p>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.map((w) => (
          <Card key={w.id} className="space-y-2" data-testid="watchlist">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{w.name}</h2>
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => confirm(`Delete “${w.name}”?`) && remove.mutate(w.id)}
              >
                Delete list
              </Button>
            </div>
            {w.trends.length === 0 ? (
              <p className="text-sm text-muted-foreground">Empty.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {w.trends.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <span>
                      <Link className="font-medium hover:underline" href={`/trends/${t.id}`}>
                        {t.name}
                      </Link>{" "}
                      {t.isSample && <Badge tone="sample">Sample</Badge>}
                    </span>
                    <span className="flex items-center gap-2">
                      {t.stage && <Badge>{STAGE_LABEL[t.stage]}</Badge>}
                      <span className="tabular-nums">{fmtScore(t.opportunity)}</span>
                      {t.delta != null && (
                        <span
                          title="Change in Opportunity over about a week"
                          className={
                            t.delta > 0
                              ? "text-ok"
                              : t.delta < 0
                                ? "text-danger"
                                : "text-muted-foreground"
                          }
                        >
                          {t.delta > 0 ? "▲" : t.delta < 0 ? "▼" : "="} {Math.abs(t.delta)}
                        </span>
                      )}
                      <button
                        aria-label={`Remove ${t.name}`}
                        className="text-xs text-muted-foreground underline"
                        onClick={() => drop.mutate({ id: w.id, trendId: t.id })}
                      >
                        remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
