/** Measure back-test lags from Google Trends: `pnpm --filter @trendbridge/workers measure-lag` (needs network + analytics). */
import { createDb } from "@trendbridge/db";
import { defaultClient } from "./connectors/googleTrends";
import { httpAnalytics } from "./scoring/analytics";
import { measureLags } from "./scoring/measure";

const { db, pool } = createDb();
console.log(
  await measureLags(
    db,
    defaultClient,
    httpAnalytics(process.env.ANALYTICS_URL ?? "http://localhost:8000"),
    { pauseMs: 5000, log: console.log },
  ),
);
await pool.end();
