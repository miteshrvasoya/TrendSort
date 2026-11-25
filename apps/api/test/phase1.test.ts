import { createDb, newsItems, products, productSnapshots, trendEntities } from "@trendbridge/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { closeQueue } from "../src/queue";
import { runSeed } from "../src/seed/seed";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>;
let cookie = "";
const NAME = "Phase1 Test Gift Lamp";

async function cleanup() {
  const ids = (
    await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(inArray(trendEntities.slug, ["phase1-test-gift-lamp"]))
  ).map((r) => r.id);
  if (!ids.length) return;
  const prods = (
    await db.select({ id: products.id }).from(products).where(inArray(products.trendId, ids))
  ).map((r) => r.id);
  if (prods.length)
    await db.delete(productSnapshots).where(inArray(productSnapshots.productId, prods));
  await db.delete(products).where(inArray(products.trendId, ids));
  await db.delete(newsItems).where(inArray(newsItems.trendId, ids));
  await db.delete(trendEntities).where(inArray(trendEntities.id, ids));
}

beforeAll(async () => {
  await runSeed();
  await cleanup();
  app = await buildApp({ db, config });
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD },
  });
  cookie = String(res.headers["set-cookie"]).split(";")[0]!;
});
afterAll(async () => {
  await cleanup();
  await closeQueue();
  await app.close();
  await pool.end();
});

const call = (method: "GET" | "POST" | "DELETE" | "PATCH", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });

describe("tracked trends", () => {
  let id = 0;
  it("creates a tracked trend with keywords, rejects duplicates and bad input", async () => {
    const r = await call("POST", "/trends", {
      name: NAME,
      keywords: ["gift lamp", "moon lamp gift"],
      geos: ["US", "IN"],
      verticals: ["gifts"],
    });
    expect(r.statusCode).toBe(201);
    id = r.json().id;
    expect((await call("POST", "/trends", { name: NAME, keywords: ["x y"] })).statusCode).toBe(409);
    expect((await call("POST", "/trends", { name: "ab", keywords: [] })).statusCode).toBe(400);
    const d = (await call("GET", `/trends/${id}`)).json();
    expect(d.keywords).toHaveLength(2);
    expect(d.isSample).toBe(false);
  });
  it("lists real vs sample separately", async () => {
    const real = (await call("GET", "/trends?data=real")).json();
    expect(real.some((t: { id: number }) => t.id === id)).toBe(true);
    expect(real.every((t: { isSample: boolean }) => !t.isSample)).toBe(true);
  });
  it("refuses to delete sample trends but deletes real ones", async () => {
    const sample = (await call("GET", "/trends?data=sample&limit=1")).json()[0].id;
    expect((await call("DELETE", `/trends/${sample}`)).statusCode).toBe(400);
    expect((await call("DELETE", `/trends/${id}`)).statusCode).toBe(200);
  });
});

describe("manual import", () => {
  let trendId = 0;
  beforeAll(async () => {
    trendId = (await call("POST", "/trends", { name: NAME, keywords: ["gift lamp"] })).json().id;
  });

  it("serves templates that validate against their own schema", async () => {
    const t = (await call("GET", "/import/templates")).json();
    for (const kind of ["marketplace_products", "timeseries"]) {
      const v = (
        await call("POST", "/import/validate", { kind, format: "csv", text: t[kind].csv })
      ).json();
      expect(v.errors).toEqual([]);
      expect(v.valid).toBeGreaterThanOrEqual(1);
    }
  });
  it("reports per-row validation errors", async () => {
    const csv =
      "trend,country,metric,week_start,value\nA lamp,US,search_interest,2026-13-99x,5\nA lamp,US,search_interest,2026-11-02,abc\nA lamp,US,search_interest,2026-11-02,50\n";
    const v = (
      await call("POST", "/import/validate", { kind: "timeseries", format: "csv", text: csv })
    ).json();
    expect(v).toMatchObject({ total: 3, valid: 1 });
    expect(v.errors).toHaveLength(2);
    expect(v.errors[0].message).toMatch(/week_start/);
  });
  it("commits time series idempotently and flags unmatched trends", async () => {
    const csv = `trend,country,metric,week_start,value\n${NAME},US,search_interest,2026-11-02,64\n${NAME},IN,search_interest,2026-11-02,7\nNo Such Trend,US,search_interest,2026-11-02,1\n`;
    const body = { kind: "timeseries", format: "csv", text: csv };
    const a = (await call("POST", "/import/commit", body)).json();
    expect(a).toMatchObject({ inserted: 2, unmatchedTrends: ["No Such Trend"] });
    await call("POST", "/import/commit", body);
    const s = (await call("GET", `/trends/${trendId}/series`)).json();
    expect(s.points).toHaveLength(2);
    expect(s.points.every((p: { isSample: boolean }) => !p.isSample)).toBe(true);
  });
  it("commits marketplace products (JSON) and links them to the trend by title", async () => {
    const rows = [
      {
        marketplace: "amazon_us",
        country: "US",
        list_type: "bestsellers",
        rank: 3,
        external_id: "B0TESTLAMP1",
        title: `${NAME} Deluxe`,
        price: 19.5,
        currency: "USD",
        rating: 4.6,
        review_count: 120,
      },
    ];
    const r = (
      await call("POST", "/import/commit", {
        kind: "marketplace_products",
        format: "json",
        text: JSON.stringify(rows),
      })
    ).json();
    expect(r.inserted).toBe(1);
    const prods = (await call("GET", `/trends/${trendId}/products`)).json();
    expect(prods[0]).toMatchObject({ rank: 3, price: 19.5, externalId: "B0TESTLAMP1" });
  });
  it("rejects garbage", async () => {
    expect(
      (await call("POST", "/import/commit", { kind: "timeseries", format: "json", text: "{nope" }))
        .statusCode,
    ).toBe(422);
  });
});

describe("sources", () => {
  it("toggles a source and flags scraped ones as disabled by default", async () => {
    const list = (await call("GET", "/sources")).json();
    const amazon = list.find((s: { key: string }) => s.key === "amazon_bestsellers");
    expect(amazon).toMatchObject({ scraped: true, implemented: true });
    expect(
      (await call("PATCH", "/sources/google_news_rss", { enabled: false })).json().enabled,
    ).toBe(false);
    expect(
      (await call("GET", "/sources"))
        .json()
        .find((s: { key: string }) => s.key === "google_news_rss").status,
    ).toBe("disabled");
    await call("PATCH", "/sources/google_news_rss", { enabled: true });
  });
  it("queues a run, and rejects sources without connectors", async () => {
    expect((await call("POST", "/sources/etsy/run")).statusCode).toBe(400);
    const r = await call("POST", "/sources/ecb_fx/run");
    expect([200, 503]).toContain(r.statusCode);
  });
});
