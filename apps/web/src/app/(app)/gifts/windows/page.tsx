"use client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type WindowsResponse } from "@/lib/api";
import { STAGE_LABEL, WINDOW_LABEL, WINDOW_TONE, fmtDate, fmtScore, inrRange } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function WindowsPage() {
  const { data, isError } = useQuery({
    queryKey: ["gift-windows"],
    queryFn: () => api<WindowsResponse>("/gifts/windows"),
  });
  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        For each upcoming Indian festival: the latest date to place an import order (festival − 84
        days lead time − 21 days to list and warm up ads) and to start Indian manufacturing (− 45 −
        21 days). Only gifts tagged for that festival and not yet mainstream in India are shown.
      </p>
      {isError && <p className="text-sm text-danger">Could not load windows.</p>}
      <div className="space-y-3" data-tour="gift-windows">
        {data?.windows.map((w) => (
          <Card key={w.key} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                {w.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {fmtDate(w.festivalDate)} · {w.daysToFestival} days · foreign equivalent:{" "}
                  {w.foreignEquivalent}
                </span>
              </h2>
              <Badge tone={WINDOW_TONE[w.status]}>{WINDOW_LABEL[w.status]}</Badge>
            </div>
            <p className="text-sm">
              Latest import order: <strong>{fmtDate(w.importDeadline)}</strong>
              {w.daysToImportDeadline >= 0
                ? ` (${w.daysToImportDeadline} days left)`
                : ` (passed ${-w.daysToImportDeadline} days ago)`}{" "}
              · latest manufacture start: <strong>{fmtDate(w.manufactureDeadline)}</strong>
            </p>
            {w.gifts.length ? (
              <ul className="divide-y divide-border text-sm">
                {w.gifts.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <span>
                      <Link className="font-medium hover:underline" href={`/trends/${g.id}`}>
                        {g.name}
                      </Link>{" "}
                      {g.isSample && <Badge tone="sample">Sample</Badge>}{" "}
                      <span className="text-muted-foreground">{inrRange(g.range)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {g.stage ? <Badge>{STAGE_LABEL[g.stage]}</Badge> : null}
                      <span>{fmtScore(g.opportunity)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No gifts are tagged for this festival yet. Add the occasion in a trend&apos;s gift
                details.
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
