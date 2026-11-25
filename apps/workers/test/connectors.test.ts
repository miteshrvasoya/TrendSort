import {
  createDb,
  newsItems,
  products,
  productSnapshots,
  sources,
  trackedKeywords,
  trendEntities,
  trendSignalsTimeseries,
} from "@trendbridge/db";
import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  amazonBestsellers,
  parseListPage,
  type PageRaw,
} from "../src/connectors/amazonBestsellers";
import { googleNews } from "../src/connectors/googleNews";
import { makeGoogleTrends } from "../src/connectors/googleTrends";
import { googleTrendsRss, parseTraffic } from "../src/connectors/googleTrendsRss";
import { tradePress } from "../src/connectors/tradePress";
import { containsTerm, deriveTerm, jaccard, tokens } from "../src/lib/entities";
import { parseRss } from "../src/lib/rss";
import { runConnector } from "../src/framework/runner";
import type { Connector } from "../src/framework/types";
import amazonFx from "../src/fixtures/amazon-bestsellers.json";

const env = { userAgent: "T/1", liveFetch: false };
const { db, pool } = createDb(
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
);
const slug = "test-personalised-star-map";
let trendId = 0;

const SLUGS = [slug, "countertop-reverse-osmosis-water-purifier"];
async function cleanup() {
  const ids = (
    await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(or(inArray(trendEntities.slug, SLUGS), eq(trendEntities.origin, "auto")))
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
  await cleanup();
  const [t] = await db
    .insert(trendEntities)
    .values({ slug, name: "Personalised Star Map", isSample: false, origin: "user" })
    .returning();
  trendId = t!.id;
  await db
    .insert(trackedKeywords)
    .values({ trendId, term: "personalised star map", geos: ["US", "IN"] });
  await db
    .update(sources)
    .set({ enabled: true, circuitState: "closed" })
    .where(
      inArray(sources.key, [
        "amazon_bestsellers",
        "google_trends",
        "google_news_rss",
        "trade_press_rss",
        "google_trends_rss",
      ]),
    );
  await db
    .delete(newsItems)
    .where(
      inArray(newsItems.url, [
        "https://example.com/a1",
        "https://example.com/a2",
        "https://example.com/in1",
        "https://example.com/inc1",
        "https://example.com/rd1",
      ]),
    );
});
afterAll(async () => {
  await db.update(sources).set({ enabled: false }).where(eq(sources.key, "amazon_bestsellers"));
  await cleanup();
  await pool.end();
});

describe("text helpers", () => {
  it("tokenises, matches and dedupes", () => {
    expect(tokens("Silicone Air Fryer Liners, 4 Pack")).toEqual([
      "silicone",
      "air",
      "fryer",
      "liner",
    ]);
    expect(
      containsTerm("Why personalised star maps are topping gift guides", "personalised star map"),
    ).toBe(true);
    expect(containsTerm("star light", "personalised star map")).toBe(false);
    expect(
      jaccard(tokens("air fryer liners"), tokens("air fryer liner pack")),
    ).toBeGreaterThanOrEqual(0.6);
    expect(deriveTerm("Countertop Reverse Osmosis Water Purifier No Installation, 5-Stage")).toBe(
      "countertop reverse osmosis water purifier",
    );
  });
  it("parses RSS 2.0 and traffic", () => {
    const xml = `<rss version="2.0" xmlns:ht="x"><channel><item><title>Hello &amp; world</title><link>https://a.test/1</link><pubDate>Mon, 10 Nov 2026 08:00:00 GMT</pubDate><source url="x">Pub</source><ht:approx_traffic>2K+</ht:approx_traffic></item></channel></rss>`;
    const [i] = parseRss(xml);
    expect(i).toMatchObject({
      title: "Hello & world",
      source: "Pub",
      publishedAt: "2026-11-10T08:00:00.000Z",
      approxTraffic: "2K+",
    });
    expect(parseTraffic("2K+")).toBe(2000);
    expect(parseTraffic("1.5M+")).toBe(1_500_000);
    expect(parseTraffic("200+")).toBe(200);
  });
});

describe("amazon parser (fixture)", () => {
  it("extracts rank, asin, title, price", () => {
    const items = parseListPage((amazonFx as PageRaw[])[0]!);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      rank: 1,
      asin: "B0CXYZ0001",
      price: 34.99,
      currency: "USD",
      marketplace: "amazon_us",
    });
    expect(items[0]!.reviewCount).toBe(2210);
  });
  it("returns nothing (not fake data) for unrecognised markup", () => {
    expect(
      parseListPage({
        country: "US",
        host: "x",
        listType: "bestsellers",
        category: "all",
        html: "<html>captcha</html>",
      }),
    ).toEqual([]);
  });
});

describe("connectors end-to-end on fixtures", () => {
  it("amazon: stores products + snapshots, links tracked trend, creates candidate from movers", async () => {
    const res = await runConnector(db, amazonBestsellers as unknown as Connector, env);
    expect(res.status).toBe("ok");
    const [p] = await db.select().from(products).where(eq(products.externalId, "B0CXYZ0001"));
    expect(p!.trendId).toBe(trendId);
    const snaps = await db
      .select()
      .from(productSnapshots)
      .where(eq(productSnapshots.productId, p!.id));
    expect(snaps[0]).toMatchObject({ bsr: 1, listType: "bestsellers" });
    const [cand] = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.slug, "countertop-reverse-osmosis-water-purifier"));
    expect(cand).toMatchObject({ status: "candidate", origin: "auto", isSample: false });
  });

  it("google news + trade press: store headlines only and link to tracked trend", async () => {
    expect((await runConnector(db, googleNews as unknown as Connector, env)).status).toBe("ok");
    expect((await runConnector(db, tradePress as unknown as Connector, env)).status).toBe("ok");
    const linked = await db.select().from(newsItems).where(eq(newsItems.trendId, trendId));
    expect(linked.map((n) => n.url).sort()).toEqual([
      "https://example.com/a1",
      "https://example.com/a2",
    ]);
    expect(linked[0]!.summary).toBeNull();
    const [unlinked] = await db
      .select()
      .from(newsItems)
      .where(eq(newsItems.url, "https://example.com/rd1"));
    expect(unlinked!.trendId).toBeNull();
  });

  it("google trends: client injected, upserts weekly series and is idempotent", async () => {
    const calls: string[] = [];
    const c = makeGoogleTrends(async (term, geo) => {
      calls.push(`${term}|${geo}`);
      return [
        { time: 1730000000, value: geo === "US" ? 80 : 5 },
        { time: 1730604800, value: geo === "US" ? 100 : 9 },
      ];
    }, 0);
    expect(
      (await runConnector(db, c as unknown as Connector, { ...env, liveFetch: true })).status,
    ).toBe("ok");
    expect(calls).toEqual(["personalised star map|US", "personalised star map|IN"]);
    await db
      .update(trackedKeywords)
      .set({ lastFetchedAt: null })
      .where(eq(trackedKeywords.trendId, trendId));
    await runConnector(db, c as unknown as Connector, { ...env, liveFetch: true });
    const rows = await db
      .select()
      .from(trendSignalsTimeseries)
      .where(eq(trendSignalsTimeseries.trendId, trendId));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => !r.isSample && r.metric === "search_interest")).toBe(true);
  });

  it("google trends 429 surfaces as an error run (circuit breaker input)", async () => {
    const c = makeGoogleTrends(async () => {
      throw new Error("429 Too Many Requests");
    }, 0);
    await db
      .update(trackedKeywords)
      .set({ lastFetchedAt: null })
      .where(eq(trackedKeywords.trendId, trendId));
    const res = await runConnector(db, c as unknown as Connector, { ...env, liveFetch: true });
    expect(res.status).toBe("error");
    expect(res.reason).toMatch(/rate-limited/);
    await db
      .update(sources)
      .set({ circuitState: "closed" })
      .where(eq(sources.key, "google_trends"));
  });

  it("google trends RSS: keeps only terms matching tracked trends", async () => {
    await db
      .insert(trackedKeywords)
      .values({ trendId, term: "mushroom coffee", geos: ["US"] })
      .onConflictDoNothing();
    expect((await runConnector(db, googleTrendsRss as unknown as Connector, env)).status).toBe(
      "ok",
    );
    const rows = await db
      .select()
      .from(trendSignalsTimeseries)
      .where(eq(trendSignalsTimeseries.metric, "trending_now"));
    expect(rows.some((r) => r.trendId === trendId && r.value === 20000)).toBe(true);
  });
});
