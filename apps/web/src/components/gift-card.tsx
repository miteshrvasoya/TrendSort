import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { GiftItem, WindowInfo } from "@/lib/api";
import {
  STAGE_LABEL,
  WINDOW_LABEL,
  WINDOW_TONE,
  fmtDate,
  fmtScore,
  inr,
  inrRange,
} from "@/lib/utils";
import Link from "next/link";
import { ConfidenceBadge } from "./confidence-badge";

export function GiftCard({
  g,
  window,
  festival,
}: {
  g: GiftItem;
  window?: WindowInfo | null;
  festival?: string;
}) {
  return (
    <Card className="space-y-2" data-testid="gift-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/trends/${g.id}`} className="font-semibold hover:underline">
            {g.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {g.category ?? "Uncategorised"}
            {g.personalisation !== "none" && ` · ${g.personalisation} personalisation`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {g.isSample && <Badge tone="sample">Sample</Badge>}
          {g.stage ? (
            <Badge>{STAGE_LABEL[g.stage]}</Badge>
          ) : (
            <Badge tone="neutral">India stage unknown</Badge>
          )}
          {g.opportunity != null && (
            <span title="India Opportunity (your weights)" className="font-medium">
              {fmtScore(g.opportunity)}
            </span>
          )}
          {g.confidenceLevel && !g.isSample && <ConfidenceBadge level={g.confidenceLevel} />}
        </div>
      </div>
      <p className="text-sm">
        <strong>{inrRange(g.range)}</strong>
        {g.priceSource === "foreign_converted" && (
          <span className="text-xs text-warn">
            {" "}
            foreign list price at ECB rate; not landed or Indian retail
          </span>
        )}
        {g.needsDetails && (
          <span className="text-xs text-warn">
            {" "}
            ·{" "}
            <Link className="underline" href={`/trends/${g.id}`}>
              add gift details
            </Link>
          </span>
        )}
      </p>
      {window && (
        <p className="text-sm">
          <Badge tone={WINDOW_TONE[window.status]}>
            {festival ?? "Festival"}: {WINDOW_LABEL[window.status]}
          </Badge>{" "}
          <span className="text-muted-foreground">
            import by <strong>{fmtDate(window.importDeadline)}</strong> · manufacture by{" "}
            {fmtDate(window.manufactureDeadline)} · festival {fmtDate(window.festivalDate)}
          </span>
        </p>
      )}
      {g.listings.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {g.listings.map((l, i) => (
            <li key={i}>
              {l.marketplace}
              {l.rank ? ` #${l.rank}` : ""}
              {l.price != null && ` · ${l.currency} ${l.price}`} ·{" "}
              {l.url ? (
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {l.title}
                </a>
              ) : (
                l.title
              )}
              {l.scraped && (
                <Badge tone="warn" className="ml-1">
                  scraped
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No foreign listings matched yet.</p>
      )}
      <p className="text-xs text-muted-foreground">
        <strong>Sourcing hint:</strong> {g.hint.route}. Hubs: {g.hint.hubs}.{" "}
        <span title="Landed-cost and margin model arrives in v0.5">
          Margin estimate: coming in v0.5.
        </span>
      </p>
    </Card>
  );
}
export { inr };
