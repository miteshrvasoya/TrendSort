import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Db } from "@trendbridge/db";
import { CONNECTORS } from "./connectors";
import { runConnector, type RunnerEnv } from "./framework/runner";
import { httpAnalytics } from "./scoring/analytics";
import { runScoring } from "./scoring/job";

export const INGEST = "ingest";
export const INGEST_DLQ = "ingest-dlq";
export const SCORE = "score";

/** Cron-like schedules per source (free-tier friendly). */
export const SCHEDULES: Record<string, string> = {
  ecb_fx: "0 6 * * *",
  google_trends: "30 2 * * *", // daily, off-peak
  google_trends_rss: "15 */6 * * *",
  google_news_rss: "0 */8 * * *",
  trade_press_rss: "20 */6 * * *",
  etsy: "40 3 * * *", // needs ETSY_API_KEY
  amazon_bestsellers: "10 3 * * *", // no-op while the source is disabled in the registry
};

export function makeRedis(url: string) {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createQueues(connection: Redis) {
  return {
    ingest: new Queue(INGEST, { connection }),
    dlq: new Queue(INGEST_DLQ, { connection }),
    score: new Queue(SCORE, { connection }),
  };
}

export async function registerSchedules(ingest: Queue, score?: Queue) {
  // daily re-score after the overnight ingestion runs
  await score?.upsertJobScheduler(
    "schedule:score",
    { pattern: "30 4 * * *" },
    {
      name: "score",
      data: {},
      opts: { attempts: 2, backoff: { type: "exponential", delay: 60_000 } },
    },
  );
  for (const [sourceKey, pattern] of Object.entries(SCHEDULES)) {
    await ingest.upsertJobScheduler(
      `schedule:${sourceKey}`,
      { pattern },
      {
        name: "ingest",
        data: { sourceKey },
        opts: { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
      },
    );
  }
}

export function startWorker(opts: {
  connection: Redis;
  db: Db;
  env: RunnerEnv;
  dlq: Queue;
  log: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}) {
  const worker = new Worker(
    INGEST,
    async (job: Job<{ sourceKey: string }>) => {
      const c = CONNECTORS[job.data.sourceKey];
      if (!c) throw new Error(`No connector for ${job.data.sourceKey}`);
      const res = await runConnector(opts.db, c, opts.env, opts.log);
      if (res.status === "error") throw new Error(res.reason); // triggers BullMQ retry
      return res;
    },
    { connection: opts.connection, concurrency: 2, limiter: { max: 10, duration: 60_000 } },
  );

  worker.on("failed", async (job, err) => {
    opts.log.warn({ job: job?.id, err: err.message }, "ingest job failed");
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await opts.dlq.add("dead", {
        original: job.data,
        error: err.message,
        failedAt: new Date().toISOString(),
      });
    }
  });
  return worker;
}

/** Scoring worker: `{ trendIds? }`. Needs the Python analytics service. */
export function startScoreWorker(opts: {
  connection: Redis;
  db: Db;
  analyticsUrl: string;
  log: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}) {
  const analytics = httpAnalytics(opts.analyticsUrl);
  return new Worker(
    SCORE,
    async (job: Job<{ trendIds?: number[] }>) => {
      const r = await runScoring(opts.db, analytics, { trendIds: job.data.trendIds });
      opts.log.info(r, "scoring finished");
      if (r.scored === 0 && r.failed.length > 0) throw new Error(r.failed[0]!.error);
      return r;
    },
    { connection: opts.connection, concurrency: 1 },
  );
}
