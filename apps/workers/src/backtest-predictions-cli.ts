/** Replay the stage predictor on historical series: `pnpm --filter @trendbridge/workers backtest-predictions` (needs the analytics service). */
import { createDb } from "@trendbridge/db";
import { httpAnalytics } from "./scoring/analytics";
import { runPredictionBacktest } from "./scoring/backtest-predictions";

const { db, pool } = createDb();
console.log(
  await runPredictionBacktest(
    db,
    httpAnalytics(process.env.ANALYTICS_URL ?? "http://localhost:8000"),
  ),
);
await pool.end();
