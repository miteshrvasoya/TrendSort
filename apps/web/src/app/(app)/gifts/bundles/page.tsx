"use client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, type BundlesResponse, type GiftFacets } from "@/lib/api";
import { inr, inrRange } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";

export default function BundlesPage() {
  const [occasion, setOccasion] = useState("");
  const [budget, setBudget] = useState("");
  const [size, setSize] = useState("3");
  const facets = useQuery({
    queryKey: ["gift-facets"],
    queryFn: () => api<GiftFacets>("/gifts/facets"),
  });
  const qs = new URLSearchParams({
    size,
    ...(occasion ? { occasion } : {}),
    ...(budget ? { budget } : {}),
  }).toString();
  const { data } = useQuery({
    queryKey: ["bundles", qs],
    queryFn: () => api<BundlesResponse>(`/gifts/bundles?${qs}`),
  });
  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Hamper ideas of 2–4 items from different categories, best India Opportunity first. The
        suggested price is the sum of typical item prices less a 10% bundle discount, rounded to
        ₹50. It excludes the hamper box and packaging.
      </p>
      <Card className="flex flex-wrap items-center gap-2 text-sm" data-tour="bundle-controls">
        <select
          aria-label="Occasion"
          className={sel}
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
        >
          <option value="">Any occasion</option>
          {facets.data?.occasions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
        <label>
          Max price ₹{" "}
          <input
            aria-label="Max bundle price"
            type="number"
            min={0}
            step={100}
            className={`${sel} w-28`}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="no limit"
          />
        </label>
        <label>
          Items{" "}
          <select
            aria-label="Items per bundle"
            className={sel}
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            {[2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground">{data?.candidates ?? 0} candidate gifts</span>
      </Card>
      {data?.bundles.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No bundle fits. Try a higher price cap, fewer items, or another occasion (bundles need
            items from at least two categories).
          </p>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.bundles.map((b) => (
          <Card key={b.itemIds.join("-")} className="space-y-2" data-testid="bundle">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{b.items.length}-item hamper</h2>
              {b.isSample && <Badge tone="sample">Sample</Badge>}
            </div>
            <ul className="space-y-1 text-sm">
              {b.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <Link className="hover:underline" href={`/trends/${i.id}`}>
                    {i.name}
                  </Link>
                  <span className="text-muted-foreground">{inrRange(i.range)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Suggested price <strong>{inr(b.suggestedInr)}</strong>{" "}
              <span className="text-muted-foreground">
                (items total {inr(b.sumInr)}, −{b.discountPct}%)
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{b.note}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
