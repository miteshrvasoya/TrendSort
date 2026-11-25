/** Score everything now: `pnpm --filter @trendbridge/workers score-now` (needs the analytics service). */
import { createDb, evaluateAlerts, recordPredictions, resolvePredictions } from "@trendbridge/db";
import { httpAnalytics } from "./scoring/analytics";
import { runScoring } from "./scoring/job";

const { db, pool } = createDb();
const r = await runScoring(db, httpAnalytics(process.env.ANALYTICS_URL ?? "http://localhost:8000"));
console.log(r);
console.log({
  predictionsRecorded: await recordPredictions(db),
  predictionsResolved: await resolvePredictions(db),
  alerts: await evaluateAlerts(db),
});
await pool.end();
