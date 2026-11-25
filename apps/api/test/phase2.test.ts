import { createDb, scores, trendEntities, users } from "@trendbridge/db";
import { ALGORITHM_VERSION, DEFAULT_WEIGHTS } from "@trendbridge/shared";
import { eq } from "drizzle-orm";
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
let scoreId = 0;

const call = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });

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
  const [t] = await db
    .insert(trendEntities)
    .values({ slug: "phase2-test-trend", name: "Phase2 Test Trend", isSample: false })
    .onConflictDoNothing()
    .returning();
  trendId =
    t?.id ??
    (await db.select().from(trendEntities).where(eq(trendEntities.slug, "phase2-test-trend")))[0]!
      .id;
  await db.delete(scores).where(eq(scores.trendId, trendId));
  const components = {
    foreignMomentum: 90,
    lagWindow: 10,
    competitionGap: 50,
    priceFit: null,
    margin: null,
    regulatory: null,
    logistics: null,
    seasonality: null,
  };
  const [s] = await db
    .insert(scores)
    .values({
      trendId,
      algorithmVersion: ALGORITHM_VERSION,
      momentum: 90,
      opportunity: 50,
      adoptionStage: "emerging",
      lagMonths: 20,
      confidence: 0.55,
      inputs: { components, confidence: { level: "medium", value: 0.55, parts: {} }, notes: [] },
    })
    .returning();
  scoreId = s!.id;
});
afterAll(async () => {
  await db.delete(scores).where(eq(scores.id, scoreId));
  await db.delete(trendEntities).where(eq(trendEntities.id, trendId));
  await db.update(users).set({ settings: {} }).where(eq(users.email, config.ADMIN_EMAIL));
  await closeQueue();
  await app.close();
  await pool.end();
});

describe("weights", () => {
  it("returns defaults and component help", async () => {
    const r = (await call("GET", "/settings/weights")).json();
    expect(r.weights).toEqual(DEFAULT_WEIGHTS);
    expect(r.custom).toBe(false);
    expect(r.info.foreignMomentum.label).toBeTruthy();
  });
  it("saves normalised weights, rejects bad input, and resets", async () => {
    const w = {
      ...DEFAULT_WEIGHTS,
      foreignMomentum: 1,
      lagWindow: 1,
      competitionGap: 0,
      priceFit: 0,
      margin: 0,
      regulatory: 0,
      logistics: 0,
      seasonality: 0,
    };
    const r = (await call("PUT", "/settings/weights", w)).json();
    expect(r.weights.foreignMomentum).toBeCloseTo(0.5);
    expect(r.custom).toBe(true);
    expect((await call("PUT", "/settings/weights", { ...w, margin: 5 })).statusCode).toBe(400);
    expect((await call("DELETE", "/settings/weights")).json().custom).toBe(false);
  });
});

describe("score explanation", () => {
  it("recomputes opportunity per user weights, with defaults intact", async () => {
    const base = (await call("GET", `/trends/${trendId}/score`)).json();
    expect(base.scored).toBe(true);
    // 0.22*90 + 0.18*10 + 0.14*50 over 0.54 coverage
    expect(base.opportunity).toBeCloseTo((0.22 * 90 + 0.18 * 10 + 0.14 * 50) / 0.54, 0);
    expect(base.explain.coverage).toBeCloseTo(0.54);
    expect(
      base.explain.contributions.find((c: { key: string }) => c.key === "margin").value,
    ).toBeNull();

    await call("PUT", "/settings/weights", {
      ...DEFAULT_WEIGHTS,
      foreignMomentum: 1,
      lagWindow: 0,
      competitionGap: 0,
    });
    const heavy = (await call("GET", `/trends/${trendId}/score`)).json();
    expect(heavy.opportunity).toBeGreaterThan(base.opportunity);
    expect(heavy.customWeights).toBe(true);
    expect(heavy.defaultOpportunity).toBe(50);
    const list = (await call("GET", "/trends?data=real")).json();
    const row = list.find((t: { id: number }) => t.id === trendId);
    expect(row.opportunity).toBeCloseTo(heavy.opportunity, 5);
    expect(row.confidenceLevel).toBe("medium");
    expect(row.scoreInputs).toBeUndefined();
    await call("DELETE", "/settings/weights");
  });
  it("handles unscored and unknown trends", async () => {
    const [t] = await db
      .insert(trendEntities)
      .values({ slug: "phase2-unscored", name: "Phase2 Unscored", isSample: false })
      .onConflictDoNothing()
      .returning();
    const id =
      t?.id ??
      (await db.select().from(trendEntities).where(eq(trendEntities.slug, "phase2-unscored")))[0]!
        .id;
    expect((await call("GET", `/trends/${id}/score`)).json().scored).toBe(false);
    await db.delete(trendEntities).where(eq(trendEntities.id, id));
    expect((await call("GET", "/trends/99999999/score")).statusCode).toBe(404);
  });
});

describe("back-test and runs", () => {
  it("lists 30 labelled estimate cases with group medians", async () => {
    const b = (await call("GET", "/backtest")).json();
    expect(b.cases.length).toBeGreaterThanOrEqual(29);
    expect(b.note).toMatch(/estimates/i);
    const kitchen = b.groups.find((g: { group: string }) => g.group === "kitchen");
    expect(kitchen.medianLagMonths).toBeGreaterThan(10);
  });
  it("queues scoring or reports the queue is down", async () => {
    expect([200, 503]).toContain((await call("POST", "/scores/run", {})).statusCode);
  });
});
