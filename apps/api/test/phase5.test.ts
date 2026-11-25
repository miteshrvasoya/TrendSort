import { createDb, scores, trackedKeywords, trendEntities, verticals } from "@trendbridge/db";
import {
  ALGORITHM_VERSION,
  DEFAULT_WEIGHTS,
  VERTICAL_BY_KEY,
  normaliseWeights,
  slugify,
} from "@trendbridge/shared";
import { eq, inArray } from "drizzle-orm";
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
const starterSlugs = VERTICAL_BY_KEY.ro!.starterTrends!.map((s) => slugify(s.name));
const TEST_SLUG = "p5-test-iot-water-monitor";

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });
const j = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  (await call(method, url, payload)).json();

async function cleanup() {
  await db.delete(trendEntities).where(inArray(trendEntities.slug, [TEST_SLUG, ...starterSlugs]));
  await db.update(verticals).set({ overrides: {} }).where(eq(verticals.key, "ro"));
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
  await call("DELETE", "/settings/weights");
  await cleanup();
  const [t] = await db
    .insert(trendEntities)
    .values({
      slug: TEST_SLUG,
      name: "P5 Test IoT Water Monitor",
      verticalKeys: ["ro"],
      isSample: false,
      status: "tracked",
    })
    .returning();
  trendId = t!.id;
  const components = {
    foreignMomentum: 80,
    lagWindow: 50,
    competitionGap: null,
    priceFit: null,
    margin: null,
    regulatory: 100,
    logistics: null,
    seasonality: null,
  };
  await db.insert(scores).values({
    trendId,
    algorithmVersion: ALGORITHM_VERSION,
    adoptionStage: "early_signal",
    opportunity: 85,
    confidence: 0.5,
    inputs: { components, confidence: { level: "medium", value: 0.5, parts: {} } },
  });
});
afterAll(async () => {
  await cleanup();
  await closeQueue();
  await app.close();
  await pool.end();
});

describe("vertical registry", () => {
  it("lists all six verticals with stats and capabilities", async () => {
    const list = await j("GET", "/verticals");
    expect(list.map((v: { key: string }) => v.key).sort()).toEqual([
      "beauty",
      "gifts",
      "home-kitchen",
      "pet",
      "ro",
      "wellness",
    ]);
    const ro = list.find((v: { key: string }) => v.key === "ro");
    expect(ro).toMatchObject({ hasFeatures: true, tools: ["subscription"] });
    expect(ro.trends).toBeGreaterThanOrEqual(10);
    expect(list.find((v: { key: string }) => v.key === "gifts").hasFeatures).toBe(false);
  });
  it("returns defaults, overrides and effective config; 404 for unknown", async () => {
    const d = await j("GET", "/verticals/ro");
    expect(d.defaults.features.length).toBeGreaterThan(8);
    expect(d.overrides).toEqual({});
    expect((await call("GET", "/verticals/nope")).statusCode).toBe(404);
  });
});

describe("overrides", () => {
  it("saves edits without touching defaults, validates, and resets", async () => {
    const r = await j("PUT", "/verticals/ro/overrides", {
      newsQueries: ["my ro query"],
      featurePresence: { iot: 3 },
    });
    expect(r.overrides.newsQueries).toEqual(["my ro query"]);
    const d = await j("GET", "/verticals/ro");
    expect(d.effective.newsQueries).toEqual(["my ro query"]);
    expect(d.effective.features.find((f: { key: string }) => f.key === "iot").indiaPresence).toBe(
      3,
    );
    expect(d.defaults.features.find((f: { key: string }) => f.key === "iot").indiaPresence).toBe(1);
    expect(
      (await call("PUT", "/verticals/ro/overrides", { featurePresence: { iot: 9 } })).statusCode,
    ).toBe(400);
    expect(
      (await call("PUT", "/verticals/ro/overrides", { featurePresence: { not_a_feature: 1 } }))
        .statusCode,
    ).toBe(400);
    expect((await call("DELETE", "/verticals/ro/overrides")).statusCode).toBe(200);
    expect((await j("GET", "/verticals/ro")).overrides).toEqual({});
  });
});

describe("feature gap matrix", () => {
  it("links a feature to a matching live trend and computes the gap from India presence", async () => {
    const m = await j("GET", "/verticals/ro/features");
    const iot = m.features.find((f: { key: string }) => f.key === "iot");
    expect(iot.trend.id).toBe(trendId);
    expect(iot.trend.foreignMomentum).toBe(80);
    expect(iot.presence).toBe(1);
    expect(iot.gap).toBeCloseTo(53.3, 1);
    const gaps = m.features.map((f: { gap: number | null }) => f.gap ?? -1);
    expect(gaps).toEqual([...gaps].sort((a: number, b: number) => b - a));
    expect(m.waterProfiles.length).toBe(3);
  });
  it("your presence edit changes the gap immediately and is flagged as edited", async () => {
    await j("PUT", "/verticals/ro/overrides", { featurePresence: { iot: 3 } });
    const iot = (await j("GET", "/verticals/ro/features")).features.find(
      (f: { key: string }) => f.key === "iot",
    );
    expect(iot).toMatchObject({ presence: 3, defaultPresence: 1, edited: true, gap: 0 });
    await call("DELETE", "/verticals/ro/overrides");
  });
});

describe("preset weights and fit notes", () => {
  it("ranks with the vertical's own weighting when asked, differing from yours", async () => {
    const mine = (await j("GET", "/trends?vertical=ro&data=real")).find(
      (t: { id: number }) => t.id === trendId,
    );
    const preset = (await j("GET", "/trends?vertical=ro&data=real&preset=vertical")).find(
      (t: { id: number }) => t.id === trendId,
    );
    const blend = (w: ReturnType<typeof normaliseWeights>) => {
      const used = { foreignMomentum: 80, lagWindow: 50, regulatory: 100 } as const;
      const den = Object.keys(used).reduce((a, k) => a + w[k as keyof typeof used], 0);
      return Object.entries(used).reduce((a, [k, v]) => a + v * w[k as keyof typeof used], 0) / den;
    };
    expect(mine.opportunity).toBeCloseTo(blend(normaliseWeights(DEFAULT_WEIGHTS)), 0);
    expect(preset.opportunity).toBeCloseTo(
      blend(normaliseWeights(VERTICAL_BY_KEY.ro!.presetWeights)),
      0,
    );
    expect(preset.opportunity).not.toBeCloseTo(mine.opportunity, 1);
  });
  it("adds the vertical's India-fit notes to a trend's checks without changing its scores", async () => {
    const fit = await j("GET", `/trends/${trendId}/fit`);
    const keys = fit.checks.map((c: { key: string }) => c.key);
    expect(keys).toContain("ro:service_network");
    expect(keys).toContain("ro:reject_water");
    expect(fit.checks.find((c: { key: string }) => c.key === "ro:service_network").penalty).toBe(0);
  });
});

describe("starter set", () => {
  it("creates tracked trends with keywords for each feature, and is idempotent", async () => {
    const first = await j("POST", "/verticals/ro/starter");
    expect(first.created.length).toBe(VERTICAL_BY_KEY.ro!.starterTrends!.length);
    const second = await j("POST", "/verticals/ro/starter");
    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBe(first.created.length);
    const [t] = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.slug, starterSlugs[0]!));
    expect(t).toMatchObject({ isSample: false, status: "tracked", verticalKeys: ["ro"] });
    expect(
      (await db.select().from(trackedKeywords).where(eq(trackedKeywords.trendId, t!.id))).length,
    ).toBeGreaterThanOrEqual(2);
  });
  it("rejects verticals without a starter set", async () => {
    expect((await call("POST", "/verticals/gifts/starter")).statusCode).toBe(400);
  });
});
