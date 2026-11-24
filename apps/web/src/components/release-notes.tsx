import type { VersionRow } from "@/lib/api";
import { Badge } from "./ui/badge";

const SECTIONS = [
  ["added", "Added"],
  ["changed", "Changed"],
  ["fixed", "Fixed"],
  ["removed", "Removed"],
] as const;

export function ReleaseNotes({ v }: { v: VersionRow }) {
  return (
    <article className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">
          v{v.version} — {v.title}
        </h3>
        <Badge>{v.releasedOn}</Badge>
      </header>
      <p className="text-sm text-muted-foreground">{v.summary}</p>
      {SECTIONS.map(
        ([k, label]) =>
          v[k].length > 0 && (
            <section key={k}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {v[k].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          ),
      )}
      <p className="rounded-lg bg-muted p-3 text-sm">
        <strong>What this means for you:</strong> {v.forYou}
      </p>
    </article>
  );
}
