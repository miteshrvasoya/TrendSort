import type { Db } from "@trendbridge/db";
import type { PoliteHttp } from "./http";

export interface FetchContext {
  http: PoliteHttp;
  db: Db;
  /** true when LIVE_FETCH_ENABLED=false or no API key: connector must use fixtures. */
  fixtureMode: boolean;
  log: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}

/** Every data source is a Connector. All must be free (costPerCall === 0). */
export interface Connector<Raw = unknown, Norm = unknown> {
  readonly key: string; // must match sources.key
  readonly name: string;
  readonly rateLimit: { calls: number; windowMs: number };
  readonly costPerCall: 0;
  readonly reliabilityScore: number;
  readonly termsNote: string;
  readonly scraped: boolean;
  /** Raw payloads, exactly as received. */
  fetch(ctx: FetchContext): Promise<Raw[]>;
  /** Pure function: raw -> normalised records. */
  normalize(raw: Raw[]): Norm[];
  /** Optional: persist normalised records into domain tables. */
  persist?(ctx: FetchContext, norm: Norm[]): Promise<void>;
  healthCheck(ctx: FetchContext): Promise<{ ok: boolean; detail: string }>;
}

export interface RunResult {
  status: "ok" | "error" | "skipped";
  items: number;
  httpCalls: number;
  reason?: string;
}
