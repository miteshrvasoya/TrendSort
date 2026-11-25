import { backtestCases, type Db } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import type { InterestClient } from "../connectors/googleTrends";
import type { AnalyticsClient } from "./analytics";

/**
 * Replaces analyst-estimated lags with measured ones: pulls full-history (monthly) Google Trends for term in US and IN
 * jointly, then cross-correlates. A measured lag is only stored when the correlation is usable (>= 0.4).
 * Needs network access to Google Trends; run on your own machine.
 */
export async function measureLags(
  db: Db,
  trends: InterestClient,
  analytics: AnalyticsClient,
  opts: { pauseMs?: number; log?: (s: string) => void } = {},
) {
  const cases = await db.select().from(backtestCases);
  let measured = 0;
  for (const c of cases) {
    try {
      const series = await trends(c.term, ["US", "IN"], new Date("2004-01-01"));
      const us = series.US?.map((p) => p.value) ?? [],
        india = series.IN?.map((p) => p.value) ?? [];
      const n = Math.min(us.length, india.length);
      if (n < 36) {
        opts.log?.(`${c.term}: too little history`);
        continue;
      }
      const r = await analytics.leadLag(
        us.slice(-n),
        india.slice(-n),
        Math.min(60, Math.floor(n / 3)),
        3,
      );
      await db
        .update(backtestCases)
        .set({
          measuredLagMonths: r.usable ? r.lag : null,
          measuredCorrelation: r.correlation,
          measuredAt: new Date(),
        })
        .where(eq(backtestCases.id, c.id));
      if (r.usable) measured++;
      opts.log?.(
        `${c.term}: lag ${r.lag} mo, corr ${r.correlation}${r.usable ? "" : " (not usable; keeping estimate)"}`,
      );
    } catch (e) {
      opts.log?.(`${c.term}: ${e instanceof Error ? e.message : e}`);
      if (/429|too many/i.test(String(e))) break;
    }
    if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { cases: cases.length, measured };
}
