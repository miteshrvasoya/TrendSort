import { Queue } from "bullmq";
import { Redis } from "ioredis";

let q: Queue | null = null;
export function ingestQueue(url: string): Queue {
  if (!q)
    q = new Queue("ingest", {
      connection: new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }),
    });
  return q;
}
export async function closeQueue() {
  if (q) {
    const c = await q.client;
    await q.close();
    c.disconnect();
    q = null;
  }
}
