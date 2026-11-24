"use client";
import { ReleaseNotes } from "@/components/release-notes";
import { Card } from "@/components/ui/card";
import { api, type VersionRow } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function Inner() {
  const compare = useSearchParams().get("compare");
  const { data } = useQuery({
    queryKey: ["versions"],
    queryFn: () => api<{ current: string; versions: VersionRow[] }>("/versions"),
  });
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const vs = data?.versions ?? [];
  const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";
  const diff = (from: string, to: string) =>
    vs
      .filter((v) => v.version > from && v.version <= to)
      .sort((x, y) => (x.version < y.version ? 1 : -1));
  const shown = compare && a && b ? diff(a, b) : vs;

  return (
    <>
      <h1 className="text-2xl font-bold">{compare ? "Compare versions" : "What's New"}</h1>
      <p className="text-sm text-muted-foreground">Current version: v{data?.current}</p>
      {compare && (
        <Card className="flex flex-wrap items-center gap-2 text-sm">
          Changes from{" "}
          <select
            className={sel}
            value={a}
            onChange={(e) => setA(e.target.value)}
            aria-label="From version"
          >
            <option value="">–</option>
            {vs.map((v) => (
              <option key={v.version}>{v.version}</option>
            ))}
          </select>
          to{" "}
          <select
            className={sel}
            value={b}
            onChange={(e) => setB(e.target.value)}
            aria-label="To version"
          >
            <option value="">–</option>
            {vs.map((v) => (
              <option key={v.version}>{v.version}</option>
            ))}
          </select>
          {a && b && shown.length === 0 && (
            <span className="text-muted-foreground">No releases in that range.</span>
          )}
        </Card>
      )}
      <div className="space-y-6">
        {shown.map((v) => (
          <Card key={v.version}>
            <ReleaseNotes v={v} />
          </Card>
        ))}
      </div>
    </>
  );
}

export default function WhatsNewPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
