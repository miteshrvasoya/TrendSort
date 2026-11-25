import { trendSignalsTimeseries, type Db } from "@trendbridge/db";
import { and, eq } from "drizzle-orm";

export interface SeriesBundle {
  weeks: string[];
  series: Record<string, (number | null)[]>;
  comparable: boolean;
}

/** Weekly search-interest series per country, aligned on a common week axis. null = no data that week. */
export async function loadSeries(db: Db, trendId: number): Promise<SeriesBundle | null> {
  const rows = await db
    .select()
    .from(trendSignalsTimeseries)
    .where(
      and(
        eq(trendSignalsTimeseries.trendId, trendId),
        eq(trendSignalsTimeseries.metric, "search_interest"),
      ),
    );
  if (rows.length === 0) return null;
  const weeks = [...new Set(rows.map((r) => r.weekStart))].sort();
  const idx = new Map(weeks.map((w, i) => [w, i]));
  const series: Record<string, (number | null)[]> = {};
  for (const r of rows)
    (series[r.countryCode] ??= weeks.map(() => null))[idx.get(r.weekStart)!] = r.value;
  return {
    weeks,
    series,
    comparable: rows.every((r) => r.isSample || r.method?.includes("joint compare")),
  };
}
