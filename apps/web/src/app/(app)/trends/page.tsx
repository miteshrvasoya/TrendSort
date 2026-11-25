"use client";
import { SampleBanner } from "@/components/sample-banner";
import { TrackTrendDialog } from "@/components/track-trend-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type TrendRow } from "@/lib/api";
import { SCORE_HELP } from "@/lib/scores";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownUp, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const VERTICALS = [
  ["", "All verticals"],
  ["gifts", "Gifts"],
  ["ro", "RO / Water"],
  ["home-kitchen", "Home & Kitchen"],
  ["wellness", "Wellness"],
  ["pet", "Pet"],
  ["beauty", "Beauty"],
];
const DATA = [
  ["all", "All data"],
  ["real", "Real only"],
  ["sample", "Sample only"],
  ["candidate", "Candidates"],
] as const;
const col = createColumnHelper<TrendRow>();
const EMPTY: TrendRow[] = []; // stable reference: a fresh [] each render makes TanStack Table loop

export default function TrendsPage() {
  const [vertical, setVertical] = useState("");
  const [data, setData] = useState<(typeof DATA)[number][0]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const scoring = useMutation({
    mutationFn: () => api("/scores/run", { method: "POST", json: {} }),
    onSuccess: () => {
      setNote(
        "Scoring queued. Needs the workers process and the analytics service; refresh in a minute.",
      );
      setTimeout(() => qc.invalidateQueries({ queryKey: ["trends"] }), 15000);
    },
    onError: (e) => setNote((e as Error).message),
  });
  const qc = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([{ id: "opportunity", desc: true }]);
  const params = `limit=200${vertical ? `&vertical=${vertical}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}${data === "candidate" ? "&status=candidate" : data !== "all" ? `&data=${data}` : ""}`;
  const query = useQuery({
    queryKey: ["trends", params],
    queryFn: () => api<TrendRow[]>(`/trends?${params}`),
  });
  const num = (
    label: string,
    key: "momentum" | "breadth" | "sustainability" | "commercialProof" | "opportunity",
    help: string,
  ) =>
    col.accessor((r) => r[key], {
      id: key,
      header: () => <span title={help}>{label}</span>,
      cell: (c) => fmtScore(c.getValue()),
      sortUndefined: "last" as const,
    });
  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Trend",
        cell: (c) => (
          <Link className="font-medium hover:underline" href={`/trends/${c.row.original.id}`}>
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor("category", { header: "Category" }),
      col.accessor("adoptionStage", {
        header: () => <span title={SCORE_HELP.stage}>India stage</span>,
        cell: (c) =>
          c.getValue() ? (
            <Badge>{STAGE_LABEL[c.getValue() ?? ""]}</Badge>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      }),
      num("Momentum", "momentum", SCORE_HELP.momentum),
      num("Breadth", "breadth", SCORE_HELP.breadth),
      num("Sustain.", "sustainability", SCORE_HELP.sustainability),
      num("Proof", "commercialProof", SCORE_HELP.proof),
      num("Opportunity", "opportunity", SCORE_HELP.opportunity),
      col.accessor("lagMonths", {
        header: () => <span title={SCORE_HELP.lag}>Lag (mo)</span>,
        cell: (c) => c.getValue() ?? "–",
      }),
      col.display({
        id: "conf",
        header: () => <span title={SCORE_HELP.confidence}>Confidence</span>,
        cell: (c) => {
          const r = c.row.original;
          return r.confidenceLevel ? (
            <ConfidenceBadge level={r.isSample ? "sample" : r.confidenceLevel} />
          ) : (
            <span className="text-muted-foreground">–</span>
          );
        },
      }),
      col.accessor("newsCount", { header: "News" }),
      col.accessor("productCount", { header: "Products" }),
      col.accessor("lastSignalAt", {
        header: "Last signal",
        cell: (c) => (c.getValue() ? new Date(c.getValue()!).toLocaleDateString() : "–"),
      }),
      col.display({
        id: "flag",
        header: "Data",
        cell: (c) => {
          const r = c.row.original;
          return r.isSample ? (
            <Badge tone="sample">Sample</Badge>
          ) : r.status === "candidate" ? (
            <Badge tone="warn">Candidate</Badge>
          ) : (
            <Badge tone="ok">Live</Badge>
          );
        },
      }),
    ],
    [],
  );
  const table = useReactTable({
    data: query.data ?? EMPTY,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Trend Explorer</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={scoring.isPending} onClick={() => scoring.mutate()}>
            {scoring.isPending ? "Queuing…" : "Re-score all"}
          </Button>
          <Button data-tour="track-trend" onClick={() => setOpen(true)}>
            <Plus size={16} /> Track a trend
          </Button>
        </div>
      </div>
      {data !== "real" && data !== "candidate" && <SampleBanner />}
      <div className="flex flex-wrap items-center gap-2">
        <div data-tour="data-filter" className="flex gap-1">
          {DATA.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setData(k)}
              className={`rounded-full border px-3 py-1 text-sm ${data === k ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              {l}
            </button>
          ))}
        </div>
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
        <input
          aria-label="Search trends"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${sel} ml-auto`}
        />
      </div>
      <Card className="overflow-x-auto p-0" data-tour="trend-table">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="cursor-pointer whitespace-nowrap px-3 py-2 font-medium"
                    onClick={h.column.getToggleSortingHandler()}
                    title="Click to sort"
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <ArrowDownUp size={12} className="opacity-40" />
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="whitespace-nowrap px-3 py-2">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {query.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {query.isError && <p className="p-4 text-sm text-danger">Could not load trends.</p>}
        {query.data?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {data === "real"
              ? "No live trends yet. Click “Track a trend” to add one, or run a source."
              : "No trends match this filter."}
          </p>
        )}
      </Card>
      {note && (
        <p role="status" className="rounded-lg bg-muted p-2 text-sm">
          {note}
        </p>
      )}
      <p data-tour="score-legend" className="text-xs text-muted-foreground">
        Hover a column header for what it means. A dash means “not enough data yet”, never zero.
        Opportunity uses{" "}
        <Link className="underline" href="/scoring">
          your weights
        </Link>
        ; open a trend to see every input behind its score.
      </p>
      <TrackTrendDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
