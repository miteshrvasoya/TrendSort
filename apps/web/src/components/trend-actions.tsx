"use client";
import { api, type WatchlistRow } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "./ui/button";

const sel = "rounded-lg border border-border bg-background px-2 py-2 text-sm";

/** Watch, add to pipeline, and alert: the three things you do with a promising trend. */
export function TrendActions({ trendId }: { trendId: number }) {
  const qc = useQueryClient();
  const lists = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => api<WatchlistRow[]>("/watchlists"),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const say = (m: string) => setMsg(m);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      say(ok);
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    } catch (e) {
      say((e as Error).message);
    }
  };
  const watch = async (v: string) => {
    if (!v) return;
    if (v === "new") {
      const name = window.prompt("Name for the new watchlist")?.trim();
      if (!name) return;
      await run(async () => {
        const w = await api<{ id: number }>("/watchlists", { method: "POST", json: { name } });
        await api(`/watchlists/${w.id}/items`, { method: "POST", json: { trendId } });
      }, `Added to “${name}”.`);
      return;
    }
    await run(
      () => api(`/watchlists/${v}/items`, { method: "POST", json: { trendId } }),
      "Added to the watchlist.",
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-tour="trend-actions">
      <select
        aria-label="Add to watchlist"
        className={sel}
        value=""
        onChange={(e) => void watch(e.target.value)}
      >
        <option value="">☆ Watch…</option>
        {lists.data?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
        <option value="new">New watchlist…</option>
      </select>
      <Button
        variant="outline"
        onClick={() =>
          run(
            () => api("/pipeline", { method: "POST", json: { trendId } }),
            "Added to your pipeline as Spotted.",
          )
        }
      >
        Add to pipeline
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          run(
            () =>
              api("/alerts", {
                method: "POST",
                json: { rule: { type: "score_above", threshold: 75, scope: "trend" }, trendId },
              }),
            "Alert created: you will be told when Opportunity reaches 75.",
          )
        }
      >
        Alert at 75
      </Button>
      {msg && (
        <span role="status" className="text-sm text-muted-foreground">
          {msg}
        </span>
      )}
    </div>
  );
}
