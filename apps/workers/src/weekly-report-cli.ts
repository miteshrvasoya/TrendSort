/** Generate (and email, if SMTP is configured) the weekly report now: `pnpm --filter @trendbridge/workers weekly-report`. */
import { createDb } from "@trendbridge/db";
import { runWeeklyReport } from "./reports/job";

const { db, pool } = createDb();
console.log(await runWeeklyReport(db));
await pool.end();
