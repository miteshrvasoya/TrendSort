"use client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type CorporateResponse } from "@/lib/api";
import { inr, inrRange } from "@/lib/utils";
import { priceAtQty } from "@trendbridge/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function CorporatePage() {
  const { data } = useQuery({
    queryKey: ["gift-corporate"],
    queryFn: () => api<CorporateResponse>("/gifts/corporate"),
  });
  const [qty, setQty] = useState(100);
  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Gifts suited to bulk and branded orders. {data?.note}
      </p>
      <Card className="flex flex-wrap items-center gap-2 text-sm" data-tour="corporate-calc">
        <label>
          Order quantity{" "}
          <input
            aria-label="Order quantity"
            type="number"
            min={1}
            className="w-24 rounded-lg border border-border bg-background px-2 py-1"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <span className="text-muted-foreground">
          Unit prices below use each gift&apos;s price breaks at its mid-range price.
        </span>
      </Card>
      {data?.items.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No corporate-friendly gifts yet. Mark a gift as corporate in its gift details.
          </p>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.items.map((g) => {
          const mid = g.range ? (g.range.min + g.range.max) / 2 : null;
          const c = g.corporate!;
          const p = mid != null ? priceAtQty(mid, qty, c.priceBreaks) : null;
          return (
            <Card key={g.id} className="space-y-2" data-testid="corporate-card">
              <div className="flex items-center justify-between gap-2">
                <Link className="font-semibold hover:underline" href={`/trends/${g.id}`}>
                  {g.name}
                </Link>
                {g.isSample && <Badge tone="sample">Sample</Badge>}
              </div>
              <p className="text-sm">
                {inrRange(g.range)} each · MOQ <strong>{c.moq}</strong> · lead time ~
                {c.leadTimeDays} days
              </p>
              <p className="text-xs text-muted-foreground">Branding: {c.branding.join(", ")}</p>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-0.5">Qty from</th>
                    {c.priceBreaks.map((b) => (
                      <th key={b.qty}>{b.qty}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-0.5">Discount</td>
                    {c.priceBreaks.map((b) => (
                      <td key={b.qty}>{b.discountPct}%</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="rounded-lg bg-muted p-2 text-sm">
                {p ? (
                  <>
                    At <strong>{qty}</strong> units: <strong>{inr(p.unit)}</strong> each,{" "}
                    <strong>{inr(p.total)}</strong> total ({p.discountPct}% off)
                  </>
                ) : (
                  `Below the MOQ of ${c.moq}: no bulk price.`
                )}
              </p>
            </Card>
          );
        })}
      </div>
    </>
  );
}
