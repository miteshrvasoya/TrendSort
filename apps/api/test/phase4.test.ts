import {
  createDb,
  dutyGstTables,
  feeTables,
  listingsIndia,
  productFit,
  productReviews,
  trendEntities,
  unitEconomicsScenarios,
} from "@trendbridge/db";
import { baseAssumptions, computeEconomics } from "@trendbridge/shared";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { closeQueue } from "../src/queue";
import { runSeed } from "../src/seed/seed";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>;
let cookie = "";
let trendId = 0;
const NAME = "Phase4 Test Steel Bottle";

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });
const j = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  (await call(method, url, payload)).json();

async function cleanup() {
  const ids = (
    await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(eq(trendEntities.slug, "phase4-test-steel-bottle"))
  ).map((r) => r.id);
  if (ids.length) {
    await db.delete(listingsIndia).where(inArray(listingsIndia.trendId, ids));
    await db.delete(trendEntities).where(inArray(trendEntities.id, ids));
  }
  await db.delete(listingsIndia).where(like(listingsIndia.externalId, "P4TEST%"));
  await db.delete(dutyGstTables).where(like(dutyGstTables.note, "phase4 test%"));
  await db
    .delete(feeTables)
    .where(and(eq(feeTables.marketplace, "flipkart"), eq(feeTables.referralPct, 7.77)));
}

beforeAll(async () => {
  await runSeed();
  app = await buildApp({ db, config });
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD },
  });
  cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  await cleanup();
  trendId = (
    await j("POST", "/trends", {
      name: NAME,
      keywords: ["steel water bottle"],
      geos: ["US", "IN"],
      verticals: ["gifts"],
    })
  ).id;
});
afterAll(async () => {
  await cleanup();
  await closeQueue();
  await app.close();
  await pool.end();
});

describe("economics defaults and tables", () => {
  it("prefills duty and fees from the tables and says where each default came from", async () => {
    const d = await j("GET", "/economics/defaults?group=electronics&marketplace=amazon_in");
    expect(d.group).toBe("electronics");
    expect(d.assumptions.import.bcdPct).toBeGreaterThan(0);
    expect(d.assumptions.marketplace).toBe("amazon_in");
    expect(d.sources.duty).toMatch(/INDICATIVE/);
    expect(d.sources.fees).toMatch(/INDICATIVE/);
    expect(d.sources.supplier).toMatch(/quotes/);
  });
  it("derives the product group from the trend", async () => {
    const d = await j("GET", `/economics/defaults?trendId=${trendId}`);
    expect(d.trendName).toBe(NAME);
    expect(["drinkware", "general", "kitchen-steel"]).toContain(d.group);
  });
  it("edits create a new version and defaults then use it (history is kept)", async () => {
    const before = await j("GET", "/economics/tables");
    const v1 = before.duty.find((x: { groupKey: string }) => x.groupKey === "plastics");
    const put = await j("PUT", "/economics/tables/duty", {
      groupKey: "plastics",
      bcdPct: 7.5,
      igstPct: 12,
      otherPct: 0,
      note: "phase4 test",
    });
    expect(put.version).toBe(v1.version + 1);
    expect(put.isIndicative).toBe(false);
    const d = await j("GET", "/economics/defaults?group=plastics");
    expect(d.assumptions.import.bcdPct).toBe(7.5);
    expect(d.assumptions.import.igstPct).toBe(12);
    expect(d.sources.duty).toMatch(/edited by you/);
    expect(d.tableVersions.duty).toBe(put.version);
    const after = await j("GET", "/economics/tables");
    expect(
      after.dutyHistory.filter((x: { groupKey: string }) => x.groupKey === "plastics").length,
    ).toBeGreaterThanOrEqual(2);
  });
  it("versions fee rows and rejects bad values", async () => {
    const r = await j("PUT", "/economics/tables/fees", {
      marketplace: "flipkart",
      category: "general",
      referralPct: 7.77,
      closingFeeInr: 18,
    });
    expect(r.version).toBeGreaterThan(1);
    expect(
      (
        await call("PUT", "/economics/tables/duty", {
          groupKey: "plastics",
          bcdPct: -1,
          igstPct: 18,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call("PUT", "/economics/tables/duty", {
          groupKey: "nonsense",
          bcdPct: 10,
          igstPct: 18,
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe("calculator and scenarios", () => {
  it("calculates server-side identically to the shared function, with sensitivity", async () => {
    const a = baseAssumptions();
    const r = await j("POST", "/economics/calc", a);
    expect(r.routes.import.contribution).toBe(computeEconomics(a).routes.import.contribution);
    expect(r.sensitivity.length).toBe(5);
    expect((await call("POST", "/economics/calc", { ...a, sellingPriceInr: -1 })).statusCode).toBe(
      400,
    );
  });
  it("saves scenarios with recomputed results; only one primary per trend", async () => {
    const a = baseAssumptions();
    const s1 = await j("POST", "/economics/scenarios", {
      trendId,
      name: "A",
      assumptions: a,
      isPrimary: true,
    });
    const s2 = await j("POST", "/economics/scenarios", {
      trendId,
      name: "B",
      assumptions: { ...a, sellingPriceInr: 1499 },
      isPrimary: true,
    });
    expect(s1.results.recommendation).toBeTruthy();
    const list = await j("GET", `/economics/scenarios?trendId=${trendId}`);
    expect(
      list.filter((x: { isPrimary: boolean }) => x.isPrimary).map((x: { id: number }) => x.id),
    ).toEqual([s2.id]);
    const upd = await j("PUT", `/economics/scenarios/${s1.id}`, {
      trendId,
      name: "A2",
      assumptions: { ...a, sellingPriceInr: 1999 },
      isPrimary: false,
    });
    expect(upd.name).toBe("A2");
    expect(upd.results.routes.import.sellingPriceInr).toBe(1999);
    expect((await call("DELETE", `/economics/scenarios/${s1.id}`)).statusCode).toBe(200);
    expect((await call("DELETE", `/economics/scenarios/${s1.id}`)).statusCode).toBe(404);
    await db.delete(unitEconomicsScenarios).where(eq(unitEconomicsScenarios.trendId, trendId));
  });
  it("seeds a primary sample scenario and fit for every sample trend", async () => {
    const sample = (await j("GET", "/trends?data=sample&limit=1"))[0].id;
    const sc = await j("GET", `/economics/scenarios?trendId=${sample}`);
    expect(sc[0]).toMatchObject({ isPrimary: true, isSample: true });
    expect((await j("GET", `/trends/${sample}/fit`)).saved).toBe(true);
  });
});

describe("reviews", () => {
  const csv = (rows: string[]) => `trend,source,rating,text,date\n${rows.join("\n")}\n`;
  it("imports reviews, dedupes, and mines themes with improvement hints", async () => {
    const rows = [
      `${NAME},amazon_us,5,"Sturdy and well made. Looks great.",2026-11-01`,
      `${NAME},amazon_us,2,"It leaked after a week. Too small as well.",2026-11-02`,
      `${NAME},amazon_us,1,"Leaks everywhere and arrived damaged in shipping.",2026-11-03`,
      `Unknown Trend,amazon_us,5,"Great value for money.",2026-11-03`,
    ];
    const body = { kind: "reviews", format: "csv", text: csv(rows) };
    const first = await j("POST", "/import/commit", body);
    expect(first).toMatchObject({ inserted: 3, unmatchedTrends: ["Unknown Trend"] });
    const again = await j("POST", "/import/commit", body);
    expect(again.inserted).toBe(0);
    const a = await j("GET", `/trends/${trendId}/reviews`);
    expect(a.analysis.n).toBe(3);
    expect(a.analysis.complaints[0]).toMatchObject({ key: "leaks", count: 2 });
    expect(a.analysis.suggestions.join(" ")).toMatch(/pressure-test/);
    expect(a.analysis.caveat).toMatch(/Only 3 reviews/);
    expect(a.method).toMatch(/no AI/);
    await db.delete(productReviews).where(eq(productReviews.trendId, trendId));
  });
  it("returns an empty analysis when none are imported and validates ratings", async () => {
    expect((await j("GET", `/trends/${trendId}/reviews`)).analysis).toBeNull();
    const v = await j("POST", "/import/validate", {
      kind: "reviews",
      format: "csv",
      text: csv([`${NAME},x,9,"too high rating here",2026-11-01`]),
    });
    expect(v.valid).toBe(0);
  });
});

describe("india listings", () => {
  it("says 'not checked' when no India data exists at all, then lists matches after import", async () => {
    await db.delete(listingsIndia);
    expect((await j("GET", `/trends/${trendId}/india-listings`)).verdict).toBe("not_checked");
    const csv = `marketplace,external_id,title,price_inr,rating,review_count,url,trend\namazon_in,P4TEST1,Steel Water Bottle 1L,499,4.2,120,https://www.amazon.in/dp/P4TEST1,${NAME}\namazon_in,P4TEST2,Unrelated Gadget,299,4.0,10,,\n`;
    const r = await j("POST", "/import/commit", {
      kind: "india_listings",
      format: "csv",
      text: csv,
    });
    expect(r.inserted).toBe(2);
    const l = await j("GET", `/trends/${trendId}/india-listings`);
    expect(l.verdict).toBe("listings_found");
    expect(l.count).toBe(1);
    expect(l.priceRange).toMatchObject({ min: 499, max: 499 });
    expect(l.caveat).toMatch(/not that nobody sells it/);
    await db.delete(listingsIndia).where(like(listingsIndia.externalId, "P4TEST%"));
    expect((await j("GET", `/trends/${trendId}/india-listings`)).verdict).toBe("not_checked");
  });
  it("reports 'none found in scanned lists' when India data exists but nothing matches", async () => {
    await db.insert(listingsIndia).values({
      marketplace: "amazon_in",
      externalId: "P4TEST9",
      title: "Other thing",
      priceInr: 100,
    });
    expect((await j("GET", `/trends/${trendId}/india-listings`)).verdict).toBe(
      "none_found_in_scanned_lists",
    );
    await db.delete(listingsIndia).where(eq(listingsIndia.externalId, "P4TEST9"));
  });
});

describe("india fit", () => {
  it("uses clearly-marked inferred attributes until you save, then your saved attributes", async () => {
    const before = await j("GET", `/trends/${trendId}/fit`);
    expect(before.saved).toBe(false);
    expect(before.disclaimer).toMatch(/not legal advice/);
    expect(before.checks.find((c: { key: string }) => c.key === "food").status).toBe("check");
    const attrs = {
      ...before.attrs,
      electrical: true,
      wireless: true,
      battery: true,
      size: "small",
    };
    expect((await call("PUT", `/trends/${trendId}/fit`, attrs)).statusCode).toBe(200);
    const after = await j("GET", `/trends/${trendId}/fit`);
    expect(after.saved).toBe(true);
    expect(after.checks.find((c: { key: string }) => c.key === "wpc").status).toBe("action");
    expect(after.scores.regulatory).toBeLessThan(before.scores.regulatory);
    await db.delete(productFit).where(eq(productFit.trendId, trendId));
  });
  it("refuses to edit sample trends and validates attributes", async () => {
    const sample = (await j("GET", "/trends?data=sample&limit=1"))[0].id;
    const a = (await j("GET", `/trends/${sample}/fit`)).attrs;
    expect((await call("PUT", `/trends/${sample}/fit`, a)).statusCode).toBe(400);
    expect((await call("PUT", `/trends/${trendId}/fit`, { ...a, size: "huge" })).statusCode).toBe(
      400,
    );
  });
});
