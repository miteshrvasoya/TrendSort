/** Run one connector now without Redis: `pnpm --filter @trendbridge/workers run-once ecb_fx` */
import { createDb } from "@trendbridge/db";
import { CONNECTORS } from "./connectors";
import { runConnector } from "./framework/runner";
import type { Connector } from "./framework/types";

const key = process.argv[2] ?? "ecb_fx";
const c = CONNECTORS[key] as Connector | undefined;
if (!c) {
  console.error(`unknown connector ${key}; have: ${Object.keys(CONNECTORS).join(", ")}`);
  process.exit(1);
}
const { db, pool } = createDb();
const res = await runConnector(
  db,
  c,
  {
    userAgent: process.env.FETCH_USER_AGENT ?? "TrendBridge/0.1 (personal research tool)",
    liveFetch: (process.env.LIVE_FETCH_ENABLED ?? "true") === "true",
  },
  { info: console.log, warn: console.warn },
);
console.log(res);
await pool.end();
