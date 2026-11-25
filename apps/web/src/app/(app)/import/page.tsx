"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

type Kind = "marketplace_products" | "timeseries" | "reviews" | "india_listings";
interface Validation {
  total: number;
  valid: number;
  errors: { row: number; message: string }[];
  preview: Record<string, unknown>[];
}
interface Commit {
  inserted: number;
  skippedInvalid: number;
  unmatchedTrends: string[];
}

export default function ImportPage() {
  const [kind, setKind] = useState<Kind>("timeseries");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("manual import");
  const templates = useQuery({
    queryKey: ["import-templates"],
    queryFn: () => api<Record<Kind, { csv: string; description: string }>>("/import/templates"),
  });
  const body = { kind, format, text, sourceLabel: label };
  const validate = useMutation({
    mutationFn: () => api<Validation>("/import/validate", { method: "POST", json: body }),
  });
  const commit = useMutation({
    mutationFn: () => api<Commit>("/import/commit", { method: "POST", json: body }),
  });
  const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setFormat(f.name.endsWith(".json") ? "json" : "csv");
    validate.reset();
    commit.reset();
  };
  const download = () => {
    const t = templates.data?.[kind];
    if (!t) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t.csv], { type: "text/csv" }));
    a.download = `${kind}-template.csv`;
    a.click();
  };

  return (
    <>
      <h1 className="text-2xl font-bold">Import data</h1>
      <p className="text-sm text-muted-foreground">
        Bring in exports from free tools you run yourself (Google Trends CSVs, marketplace lists).
        Every row is validated first; nothing is saved until you commit. Imported data counts as
        manual, confidence 0.7.
      </p>
      <Card className="space-y-3" data-tour="import-form">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label>
            What
            <select
              aria-label="Import kind"
              className={`${sel} ml-1`}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                validate.reset();
                commit.reset();
              }}
            >
              <option value="timeseries">Weekly time series</option>
              <option value="marketplace_products">Marketplace products</option>
              <option value="reviews">Reviews</option>
              <option value="india_listings">India listings</option>
            </select>
          </label>
          <label>
            Format
            <select
              aria-label="Format"
              className={`${sel} ml-1`}
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "json")}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <label>
            Label
            <input
              className={`${sel} ml-1`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
            />
          </label>
          <Button variant="outline" onClick={download}>
            Download CSV template
          </Button>
          <input
            type="file"
            aria-label="Upload file"
            accept=".csv,.json"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {templates.data?.[kind].description} Time-series rows must reference a tracked
          (non-sample) trend by name or slug.
        </p>
        <textarea
          aria-label="Data"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            validate.reset();
            commit.reset();
          }}
          rows={10}
          placeholder={templates.data?.[kind].csv}
          className="w-full rounded-lg border border-border bg-background p-2 font-mono text-xs"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!text || validate.isPending}
            onClick={() => validate.mutate()}
          >
            Validate
          </Button>
          <Button
            disabled={!validate.data || validate.data.valid === 0 || commit.isPending}
            onClick={() => commit.mutate()}
          >
            Import {validate.data ? `${validate.data.valid} valid rows` : ""}
          </Button>
        </div>
        {validate.isError && (
          <p role="alert" className="text-sm text-danger">
            {(validate.error as Error).message}
          </p>
        )}
        {validate.data && (
          <div className="space-y-2 text-sm">
            <p>
              <Badge tone={validate.data.errors.length ? "warn" : "ok"}>
                {validate.data.valid}/{validate.data.total} rows valid
              </Badge>
            </p>
            {validate.data.errors.length > 0 && (
              <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-danger">
                {validate.data.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {commit.isError && (
          <p role="alert" className="text-sm text-danger">
            {(commit.error as Error).message}
          </p>
        )}
        {commit.data && (
          <p role="status" className="rounded-lg bg-ok/10 p-3 text-sm text-ok">
            Imported {commit.data.inserted} rows.{" "}
            {commit.data.skippedInvalid > 0 &&
              `${commit.data.skippedInvalid} invalid rows skipped. `}
            {commit.data.unmatchedTrends.length > 0 &&
              `No tracked trend found for: ${commit.data.unmatchedTrends.join(", ")}.`}
          </p>
        )}
      </Card>
    </>
  );
}
