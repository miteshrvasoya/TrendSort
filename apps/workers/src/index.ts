import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { createDb } from "@trendbridge/db";
import Fastify from "fastify";
import {
  createQueues,
  makeRedis,
  registerSchedules,
  startScoreWorker,
  startWorker,
} from "./queues";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  PORT: Number(process.env.WORKERS_PORT ?? 4100),
  UA: process.env.FETCH_USER_AGENT ?? "TrendBridge/0.1 (personal research tool; polite fetcher)",
  LIVE: (process.env.LIVE_FETCH_ENABLED ?? "true") === "true",
};

const app = Fastify({ logger: true });
const { db } = createDb(env.DATABASE_URL);
const connection = makeRedis(env.REDIS_URL);
const { ingest, dlq, score } = createQueues(connection);
await registerSchedules(ingest, score);
startScoreWorker({
  connection,
  db,
  analyticsUrl: process.env.ANALYTICS_URL ?? "http://localhost:8000",
  log: app.log,
});
startWorker({ connection, db, dlq, env: { userAgent: env.UA, liveFetch: env.LIVE }, log: app.log });

const board = new FastifyAdapter();
createBullBoard({
  queues: [new BullMQAdapter(ingest), new BullMQAdapter(dlq), new BullMQAdapter(score)],
  serverAdapter: board,
});
board.setBasePath("/admin/queues");
await app.register(board.registerPlugin(), { prefix: "/admin/queues" });
await app.listen({ port: env.PORT, host: "0.0.0.0" });
app.log.info(`Job dashboard at http://localhost:${env.PORT}/admin/queues`);
