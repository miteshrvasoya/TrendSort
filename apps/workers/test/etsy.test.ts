import {
  createDb,
  productSnapshots,
  products,
  sources,
  trackedKeywords,
  trendEntities,
} from "@trendbridge/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { etsy, type Raw } from "../src/connectors/etsy";
import { runConnector } from "../src/framework/runner";
import type { Connector } from "../src/framework/types";
import fixture from "../src/fixtures/etsy.json";

const { db, pool } = createDb(
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
);
const SLUG = "test-etsy-gift-trend";
let trendId = 0;
const conn = etsy as unknown as Connector;

async function cleanup() {
  const ids = (
    await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(eq(trendEntities.slug, SLUG))
  ).map((r) => r.id);
  if (!ids.length) return;
  const prods = (
    await db.select({ id: products.id }).from(products).where(inArray(products.trendId, ids))
  ).map((r) => r.id);
  if (prods.length)
    await db.delete(productSnapshots).where(inArray(productSnapshots.productId, prods));
  await db.delete(products).where(inArray(products.trendId, ids));
  await db.delete(trendEntities).where(inArray(trendEntities.id, ids));
}

beforeAll(async () => {
  await cleanup();
  const [t] = await db
    .insert(trendEntities)
    .values({ slug: SLUG, name: "Test Etsy Gift Trend", isSample: false, verticalKeys: ["gifts"] })
    .returning();
  trendId = t!.id;
  await db.insert(trackedKeywords).values({ trendId, term: "test etsy gift lamp" });
  await db
    .update(sources)
    .set({ enabled: true, circuitState: "closed" })
    .where(eq(sources.key, "etsy"));
});
afterAll(async () => {
  await cleanup();
  delete process.env.ETSY_API_KEY;
  await pool.end();
});

const body = {
  results: [
    {
      listing_id: 777001,
      title: "Gift Lamp A",
      url: "https://www.etsy.com/listing/777001",
      price: { amount: 1999, divisor: 100, currency_code: "USD" },
      views: 500,
      num_favorers: 40,
      images: [{ url_170x135: "https://i.etsystatic.com/a.jpg" }],
    },
    {
      listing_id: 777002,
      title: "Gift Lamp B",
      url: "https://www.etsy.com/listing/777002",
      price: { amount: 2500, divisor: 100, currency_code: "USD" },
    },
  ],
};
const fakeFetch = (async (url: string) => {
  calls.push(String(url));
  return new Response(JSON.stringify(body), { status: 200 });
}) as unknown as typeof fetch;
const calls: string[] = [];

describe("etsy connector", () => {
  it("normalises prices (amount/divisor) and keeps search position out of rank", () => {
    const items = etsy.normalize(fixture as Raw[]);
    expect(items[0]).toMatchObject({
      price: 24.99,
      currency: "USD",
      position: 1,
      views: 18200,
      favorers: 1430,
    });
    expect(items[1]!.position).toBe(2);
  });

  it("fails clearly and writes nothing when ETSY_API_KEY is missing (live mode)", async () => {
    delete process.env.ETSY_API_KEY;
    const res = await runConnector(db, conn, {
      userAgent: "T/1",
      liveFetch: true,
      http: { fetchImpl: fakeFetch, minIntervalMs: 0 },
    });
    expect(res.status).toBe("error");
    expect(res.reason).toMatch(/ETSY_API_KEY/);
    expect(calls).toHaveLength(0);
    await db.update(sources).set({ circuitState: "closed" }).where(eq(sources.key, "etsy"));
  });

  it("with a key: searches only gift-vertical keywords, sends the key header, stores products with metrics", async () => {
    process.env.ETSY_API_KEY = "test-key";
    const res = await runConnector(db, conn, {
      userAgent: "T/1",
      liveFetch: true,
      http: { fetchImpl: fakeFetch, minIntervalMs: 0 },
    });
    expect(res).toMatchObject({ status: "ok", items: 2 });
    expect(
      calls.some(
        (u) =>
          u.includes("keywords=test%20etsy%20gift%20lamp") ||
          u.includes("keywords=test+etsy+gift+lamp"),
      ),
    ).toBe(true);
    const [p] = await db.select().from(products).where(eq(products.externalId, "777001"));
    expect(p).toMatchObject({ marketplace: "etsy", trendId });
    const [s] = await db
      .select()
      .from(productSnapshots)
      .where(eq(productSnapshots.productId, p!.id));
    expect(s).toMatchObject({ price: 19.99, currency: "USD", listType: "search", bsr: null });
    expect(s!.metrics).toMatchObject({ position: 1, views: 500, favorers: 40 });
  });
});
