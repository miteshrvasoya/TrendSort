"use client";
import { SampleBanner } from "@/components/sample-banner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type TrendRow } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const VERTICALS = [
  ["", "All"],
  ["gifts", "Gifts"],
  ["ro", "RO / Water"],
  ["home-kitchen", "Home & Kitchen"],
  ["wellness", "Wellness"],
  ["pet", "Pet"],
  ["beauty", "Beauty"],
];
const col = createColumnHelper<TrendRow>();

export default function TrendsPage() {
  const [vertical, setVertical] = useState("");
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "opportunity", desc: true }]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["trends", vertical, q],
    queryFn: () =>
      api<TrendRow[]>(
        `/trends?limit=200${vertical ? `&vertical=${vertical}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      ),
  });
  const num = (
    label: string,
    key: "momentum" | "breadth" | "sustainability" | "commercialProof" | "opportunity",
  ) =>
    col.accessor((r) => r[key], {
      id: key,
      header: label,
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
        header: "India stage",
        cell: (c) => <Badge>{STAGE_LABEL[c.getValue() ?? ""] ?? "–"}</Badge>,
      }),
      num("Momentum", "momentum"),
      num("Breadth", "breadth"),
      num("Sustain.", "sustainability"),
      num("Proof", "commercialProof"),
      num("Opportunity", "opportunity"),
      col.accessor("lagMonths", { header: "Lag (mo)", cell: (c) => c.getValue() ?? "–" }),
      col.accessor("priceBandInr", { header: "Price band" }),
      col.display({
        id: "flag",
        header: "Data",
        cell: (c) => (c.row.original.isSample ? <Badge tone="sample">Sample</Badge> : null),
      }),
    ],
    [],
  );
  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <h1 className="text-2xl font-bold">Trend Explorer</h1>
      <SampleBanner />
      <div className="flex flex-wrap gap-2">
        {VERTICALS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setVertical(k!)}
            className={`rounded-full border px-3 py-1 text-sm ${vertical === k ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
          >
            {l}
          </button>
        ))}
        <input
          aria-label="Search trends"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto rounded-lg border border-border bg-background px-3 py-1 text-sm"
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
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="p-4 text-sm text-danger">Could not load trends.</p>}
        {data && data.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No trends match. Try another filter.</p>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Scores are placeholders until the Phase 2 scoring model ships. Hover headers in later
        versions for formulas.
      </p>
    </>
  );
}
