import type { NewsRow } from "@/lib/api";
import { ExternalLink } from "lucide-react";

/** Headline, publisher, date, link only. We never store or show article text. */
export function NewsList({ items, empty }: { items: NewsRow[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <li key={n.id} className="py-2">
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-sm font-medium hover:underline"
          >
            {n.headline} <ExternalLink size={12} className="mt-1 shrink-0 opacity-60" />
          </a>
          <p className="text-xs text-muted-foreground">
            {n.publisher ?? "Unknown source"} ·{" "}
            {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : "no date"}
          </p>
        </li>
      ))}
    </ul>
  );
}
