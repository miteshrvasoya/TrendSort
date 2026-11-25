import { Queue } from "bullmq";
import { Redis } from "ioredis";

let q: Queue | null = null;
let sq: Queue | null = null;
export function ingestQueue(url: string): Queue {
  if (!q)
    q = new Queue("ingest", {
      connection: new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }),
    });
  return q;
}
export function scoreQueue(url: string): Queue {
  if (!sq) sq = new Queue("score", { connection: new Redis(url, { maxRetriesPerRequest: null }) });
  return sq;
}
export async function closeQueue() {
  if (sq) {
    const c = await sq.client;
    await sq.close();
    c.disconnect();
    sq = null;
  }
  if (q) {
    const c = await q.client;
    await q.close();
    c.disconnect();
    q = null;
  }
}
