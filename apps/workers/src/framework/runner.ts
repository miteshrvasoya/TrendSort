import { rateLimitUsage, rawSignals, sourceRuns, sources, type Db } from "@trendbridge/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { circuitState } from "./circuit";
import { PoliteHttp } from "./http";
import type { Connector, FetchContext, RunResult } from "./types";

export interface RunnerEnv {
  userAgent: string;
  liveFetch: boolean;
  http?: Partial<ConstructorParameters<typeof PoliteHttp>[2]>;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Runs one connector end-to-end: guards (enabled, circuit, daily budget) -> fetch -> raw store -> normalise -> persist. */
export async function runConnector(
  db: Db,
  connector: Connector,
  env: RunnerEnv,
  log: FetchContext["log"] = { info: () => {}, warn: () => {} },
): Promise<RunResult> {
  const [src] = await db.select().from(sources).where(eq(sources.key, connector.key));
  if (!src) throw new Error(`Unknown source ${connector.key}`);

  const startRun = async (status: string, error?: string) => {
    const [r] = await db.insert(sourceRuns).values({ sourceId: src.id, status, error }).returning();
    return r!;
  };
  const skip = async (reason: string): Promise<RunResult> => {
    await startRun("skipped", reason);
    return { status: "skipped", items: 0, httpCalls: 0, reason };
  };

  if (!src.enabled) return skip("source disabled");

  const recent = await db
    .select()
    .from(sourceRuns)
    .where(eq(sourceRuns.sourceId, src.id))
    .orderBy(desc(sourceRuns.startedAt))
    .limit(10);
  const state = circuitState(
    recent.map((r) => ({ status: r.status, at: r.startedAt.getTime() })),
    Date.now(),
  );
  if (state === "open") {
    await db.update(sources).set({ circuitState: "open" }).where(eq(sources.id, src.id));
    return skip("circuit open");
  }

  const [usage] = await db
    .select()
    .from(rateLimitUsage)
    .where(and(eq(rateLimitUsage.sourceId, src.id), eq(rateLimitUsage.day, today())));
  if (connector.rateLimit.calls > 0 && (usage?.calls ?? 0) >= connector.rateLimit.calls)
    return skip("daily free-tier budget reached");

  const run = await startRun("running");
  const http = new PoliteHttp(db, connector.key, { userAgent: env.userAgent, ...env.http });
  const ctx: FetchContext = { http, db, fixtureMode: !env.liveFetch, log };
  try {
    const raw = await connector.fetch(ctx);
    for (const r of raw) {
      await db.insert(rawSignals).values({
        runId: run.id,
        kind: connector.key,
        payload: r as object,
        sourceId: src.id,
        confidence: connector.reliabilityScore,
      });
    }
    const norm = connector.normalize(raw);
    if (connector.persist) await connector.persist(ctx, norm);
    await db
      .update(sourceRuns)
      .set({ status: "ok", finishedAt: new Date(), itemCount: norm.length, httpCalls: http.calls })
      .where(eq(sourceRuns.id, run.id));
    await db
      .update(sources)
      .set({ lastSuccessAt: new Date(), lastError: null, circuitState: "closed" })
      .where(eq(sources.id, src.id));
    await bumpUsage(db, src.id, http.calls);
    return { status: "ok", items: norm.length, httpCalls: http.calls };
  } catch (e) {
    const cause =
      e instanceof Error && e.cause ? ` (${String((e.cause as Error).message ?? e.cause)})` : "";
    const msg = (e instanceof Error ? e.message : String(e)) + cause;
    await db
      .update(sourceRuns)
      .set({ status: "error", finishedAt: new Date(), error: msg, httpCalls: http.calls })
      .where(eq(sourceRuns.id, run.id));
    await db.update(sources).set({ lastError: msg }).where(eq(sources.id, src.id));
    await bumpUsage(db, src.id, http.calls);
    return { status: "error", items: 0, httpCalls: http.calls, reason: msg };
  }
}

async function bumpUsage(db: Db, sourceId: number, calls: number) {
  if (calls <= 0) return;
  await db
    .insert(rateLimitUsage)
    .values({ sourceId, day: today(), calls })
    .onConflictDoUpdate({
      target: [rateLimitUsage.sourceId, rateLimitUsage.day],
      set: { calls: sql`${rateLimitUsage.calls} + ${calls}` },
    });
}
