import {
  alertEvents,
  alerts,
  createDb,
  pipelineItems,
  predictions,
  reports,
  scores,
  trendEntities,
  watchlists,
} from "@trendbridge/db";
import { ALGORITHM_VERSION } from "@trendbridge/shared";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { closeQueue } from "../src/queue";
import { runSeed } from "../src/seed/seed";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>;
let cookie = "";
const ids: Record<string, number> = {};
const SLUGS = ["p6-rising-gadget", "p6-stage-mover", "p6-formula-trend"];

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });
const j = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  (await call(method, url, payload)).json();
const day = (n: number) => new Date(Date.now() - n * 86_400_000);

async function makeTrend(slug: string, name: string) {
  const [t] = await db
    .insert(trendEntities)
    .values({ slug, name, isSample: false, status: "tracked", verticalKeys: ["gifts"] })
    .returning();
  ids[slug] = t!.id;
  return t!.id;
}
async function addScore(
  trendId: number,
  o: {
    daysAgo: number;
    foreign: number;
    stage: string;
    indiaMomentum?: number;
    ratio?: number;
    growth13?: number;
  },
) {
  const components = {
    foreignMomentum: o.foreign,
    lagWindow: 60,
    competitionGap: 60,
    priceFit: null,
    margin: null,
    regulatory: null,
    logistics: null,
    seasonality: null,
  };
  await db.insert(scores).values({
    trendId,
    algorithmVersion: ALGORITHM_VERSION,
    adoptionStage: o.stage,
    opportunity: 50,
    confidence: 0.6,
    computedAt: day(o.daysAgo),
    inputs: {
      components,
      confidence: { level: "medium", value: 0.6, parts: {} },
      momentumDetail: o.indiaMomentum != null ? { IN: { momentum: o.indiaMomentum } } : {},
      india: { ratio: o.ratio ?? null, growth13: o.growth13 ?? null },
    },
  });
}

async function cleanup() {
  const t = (
    await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(inArray(trendEntities.slug, SLUGS))
  ).map((r) => r.id);
  if (t.length) {
    await db.delete(alertEvents).where(inArray(alertEvents.trendId, t));
    await db.delete(alerts).where(inArray(alerts.trendId, t));
    await db.delete(predictions).where(inArray(predictions.trendId, t));
    await db.delete(pipelineItems).where(inArray(pipelineItems.trendId, t));
    await db.delete(trendEntities).where(inArray(trendEntities.id, t));
  }
  await db.delete(alerts).where(eq(alerts.active, true)); // scope-all alerts created by these tests
  await db.delete(watchlists).where(like(watchlists.name, "P6 %"));
  await db.delete(pipelineItems).where(like(pipelineItems.title, "P6 %"));
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
  const a = await makeTrend("p6-rising-gadget", "P6 Rising Gadget");
  await addScore(a, {
    daysAgo: 8,
    foreign: 50,
    stage: "early_signal",
    indiaMomentum: 40,
    ratio: 0.05,
    growth13: 0.5,
  });
  await addScore(a, {
    daysAgo: 0,
    foreign: 95,
    stage: "early_signal",
    indiaMomentum: 70,
    ratio: 0.06,
    growth13: 0.5,
  });
  const b = await makeTrend("p6-stage-mover", "P6 Stage Mover");
  await addScore(b, { daysAgo: 8, foreign: 70, stage: "early_signal" });
  await addScore(b, { daysAgo: 0, foreign: 70, stage: "emerging" });
  await makeTrend("p6-formula-trend", "=SUM(1) Formula Trend");
});
afterAll(async () => {
  await cleanup();
  await db.delete(reports).where(eq(reports.mode, "real"));
  await closeQueue();
  await app.close();
  await pool.end();
});

describe("watchlists", () => {
  it("creates, adds, lists with current scores, removes, renames and deletes", async () => {
    const w = await j("POST", "/watchlists", { name: "P6 Favourites" });
    expect(
      (await call("POST", `/watchlists/${w.id}/items`, { trendId: ids["p6-rising-gadget"] }))
        .statusCode,
    ).toBe(200);
    await call("POST", `/watchlists/${w.id}/items`, { trendId: ids["p6-rising-gadget"] }); // idempotent
    expect(
      (await call("POST", `/watchlists/${w.id}/items`, { trendId: 99999999 })).statusCode,
    ).toBe(404);
    const list = (await j("GET", "/watchlists")).find((x: { id: number }) => x.id === w.id);
    expect(list.trends).toHaveLength(1);
    expect(list.trends[0]).toMatchObject({ name: "P6 Rising Gadget", stage: "early_signal" });
    expect(list.trends[0].delta).toBeGreaterThan(0); // up versus 8 days ago
    expect((await call("PUT", `/watchlists/${w.id}`, { name: "P6 Renamed" })).statusCode).toBe(200);
    expect(
      (await call("DELETE", `/watchlists/${w.id}/items/${ids["p6-rising-gadget"]}`)).statusCode,
    ).toBe(200);
    expect(
      (await j("GET", "/watchlists")).find((x: { id: number }) => x.id === w.id).trends,
    ).toHaveLength(0);
    expect((await call("DELETE", `/watchlists/${w.id}`)).statusCode).toBe(200);
    expect((await call("DELETE", `/watchlists/${w.id}`)).statusCode).toBe(404);
  });
});

describe("alerts", () => {
  it("validates scope", async () => {
    expect(
      (
        await call("POST", "/alerts", {
          rule: { type: "score_above", threshold: 75, scope: "trend" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call("POST", "/alerts", { rule: { type: "score_above", scope: "watchlist" } }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call("POST", "/alerts", { rule: { type: "nonsense", scope: "all" } })).statusCode,
    ).toBe(400);
  });
  it("fires once on a crossing, not again on re-evaluation, and the bell counts unseen events", async () => {
    await db.delete(alertEvents);
    const a = await j("POST", "/alerts", {
      rule: { type: "score_above", threshold: 70, scope: "trend" },
      trendId: ids["p6-rising-gadget"],
    });
    const s = await j("POST", "/alerts", {
      rule: { type: "india_stage_up", scope: "trend" },
      trendId: ids["p6-stage-mover"],
    });
    const r1 = await j("POST", "/alerts/evaluate");
    expect(r1.fired).toBe(2);
    const r2 = await j("POST", "/alerts/evaluate");
    expect(r2.fired).toBe(0);
    const ev = await j("GET", "/alerts/events");
    expect(ev.map((e: { message: string }) => e.message).join(" | ")).toMatch(
      /Rising Gadget: Opportunity is now.*threshold 70/,
    );
    expect(ev.map((e: { message: string }) => e.message).join(" | ")).toMatch(
      /Stage Mover: India stage advanced from early signal to emerging/,
    );
    expect((await j("GET", "/alerts/unseen")).count).toBe(2);
    await call("POST", "/alerts/events/seen");
    expect((await j("GET", "/alerts/unseen")).count).toBe(0);
    const list = await j("GET", "/alerts");
    expect(list.find((x: { id: number }) => x.id === a.id).trendName).toBe("P6 Rising Gadget");
    expect((await call("PUT", `/alerts/${s.id}`, { active: false })).statusCode).toBe(200);
    expect((await call("DELETE", `/alerts/${a.id}`)).statusCode).toBe(200);
  });
  it("india_rising and watchlist scope work; inactive alerts never fire", async () => {
    await db.delete(alertEvents);
    const w = await j("POST", "/watchlists", { name: "P6 Alert list" });
    await call("POST", `/watchlists/${w.id}/items`, { trendId: ids["p6-rising-gadget"] });
    const a = await j("POST", "/alerts", {
      rule: { type: "india_rising", threshold: 60, scope: "watchlist", watchlistId: w.id },
    });
    expect((await j("POST", "/alerts/evaluate")).fired).toBe(1);
    await call("PUT", `/alerts/${a.id}`, { active: false });
    await db.delete(alertEvents);
    expect((await j("POST", "/alerts/evaluate")).fired).toBe(0);
    await call("DELETE", `/watchlists/${w.id}`);
  });
});

describe("pipeline", () => {
  it("adds from a trend or a title, rejects duplicates, moves stages with history, flags stuck ideas", async () => {
    const a = await j("POST", "/pipeline", { trendId: ids["p6-rising-gadget"] });
    expect((await call("POST", "/pipeline", { trendId: ids["p6-rising-gadget"] })).statusCode).toBe(
      409,
    );
    expect((await call("POST", "/pipeline", {})).statusCode).toBe(400);
    const b = await j("POST", "/pipeline", { title: "P6 Napkin idea", stage: "researching" });
    expect(
      (
        await call("PUT", `/pipeline/${a.id}`, {
          stage: "sourcing",
          notes: "Asked 3 suppliers",
          quotes: [{ supplier: "Acme", price: 3.2, currency: "USD", moq: 500, note: "FOB Ningbo" }],
        })
      ).statusCode,
    ).toBe(200);
    await call("PUT", `/pipeline/${a.id}`, {
      stage: "sample_ordered",
      results: "Sample arrives Friday",
    });
    const ev = await j("GET", `/pipeline/${a.id}/events`);
    expect(ev.map((e: { toStage: string }) => e.toStage)).toEqual([
      "spotted",
      "sourcing",
      "sample_ordered",
    ]);
    await db
      .update(pipelineItems)
      .set({ updatedAt: day(40) })
      .where(eq(pipelineItems.id, b.id));
    const board = await j("GET", "/pipeline");
    const card = board.find((x: { id: number }) => x.id === a.id);
    expect(card).toMatchObject({
      stage: "sample_ordered",
      title: "P6 Rising Gadget",
      notes: "Asked 3 suppliers",
      stuck: false,
    });
    expect(card.quotes[0]).toMatchObject({ supplier: "Acme", moq: 500 });
    expect(board.find((x: { id: number }) => x.id === b.id)).toMatchObject({
      stuck: true,
      title: "P6 Napkin idea",
    });
    expect((await call("PUT", `/pipeline/${a.id}`, { stage: "teleported" })).statusCode).toBe(400);
    const csv = (await call("GET", "/export/pipeline.csv")).body;
    expect(csv.split("\r\n")[0]).toBe("Idea,Stage,Trend,Notes,Results,Updated");
    expect(csv).toMatch(/P6 Napkin idea/);
    expect((await call("DELETE", `/pipeline/${b.id}`)).statusCode).toBe(200);
    await call("DELETE", `/pipeline/${a.id}`);
  });
});

describe("prediction tracker", () => {
  it("records live predictions from India ratio and growth, resolves due ones, and summarises hit rate", async () => {
    await db.delete(predictions).where(eq(predictions.trendId, ids["p6-rising-gadget"]!));
    const rec = await j("POST", "/predictions/record");
    expect(rec.recorded).toBeGreaterThan(0);
    const [p] = await db
      .select()
      .from(predictions)
      .where(eq(predictions.trendId, ids["p6-rising-gadget"]!));
    // 0.06 x 1.5^2 = 0.135 -> emerging
    expect(p).toMatchObject({
      predictedStage: "emerging",
      origin: "live",
      isSample: false,
      resolvedAt: null,
    });
    expect((p!.basis as { currentStage: string }).currentStage).toBe("early_signal");
    expect((await j("POST", "/predictions/record")).recorded).toBe(0); // one per trend per 30 days
    await db
      .update(predictions)
      .set({ horizonDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) })
      .where(eq(predictions.id, p!.id));
    await addScore(ids["p6-rising-gadget"]!, {
      daysAgo: 0,
      foreign: 95,
      stage: "growing",
      indiaMomentum: 70,
      ratio: 0.06,
      growth13: 0.5,
    }); // India got further than predicted
    const res = await j("POST", "/predictions/record");
    expect(res.resolved).toBeGreaterThanOrEqual(1);
    const [done] = await db.select().from(predictions).where(eq(predictions.id, p!.id));
    expect(done).toMatchObject({ actualStage: "growing", hit: "near", stageError: -1 }); // predicted emerging, India actually got to growing
  });
  it("serves the summary and the list, and the back-test endpoint answers", async () => {
    const s = await j("GET", "/predictions/summary");
    expect(s.live).toHaveProperty("pending");
    expect(s.backtest.real).toHaveProperty("n");
    expect(s.backtest.sample.byConfidence).toHaveLength(3);
    const list = await j("GET", "/predictions?origin=live&limit=5");
    expect(list.length).toBeGreaterThan(0);
    expect([200, 503]).toContain((await call("POST", "/predictions/backtest")).statusCode);
    expect((await call("GET", "/export/predictions.csv")).body.split("\r\n")[0]).toBe(
      "Trend,Origin,Sample,Predicted stage,Actual stage,Result,Horizon,Confidence",
    );
  });
});

describe("weekly report", () => {
  it("generates a real-data report from stored facts, with actions, and downloads as PDF and Markdown", async () => {
    const g = await j("POST", "/reports/generate", { mode: "real" });
    const r = g.report;
    expect(r.mode).toBe("real");
    expect(r.topOpportunities.map((x: { name: string }) => x.name)).toContain("P6 Rising Gadget");
    expect(r.rising.map((x: { name: string }) => x.name)).toContain("P6 Rising Gadget"); // opportunity jumped well over the threshold in a week
    expect(r.stageChanges.map((x: { name: string }) => x.name)).toContain("P6 Stage Mover");
    expect(r.suggestedActions.join(" ")).toMatch(/Run unit economics for/);
    const list = await j("GET", "/reports");
    expect(list[0]).toMatchObject({ id: g.id, mode: "real" });
    expect((await j("GET", `/reports/${g.id}`)).report.weekOf).toBe(r.weekOf);
    const pdf = await call("GET", `/reports/${g.id}/pdf`);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    const md = await call("GET", `/reports/${g.id}/markdown`);
    expect(md.body).toMatch(/^# TrendBridge weekly report/);
    expect((await call("GET", "/reports/99999999")).statusCode).toBe(404);
  });
  it("regenerating the same week replaces the earlier report", async () => {
    await j("POST", "/reports/generate", { mode: "real" });
    await j("POST", "/reports/generate", { mode: "real" });
    expect(
      (await j("GET", "/reports")).filter((x: { mode: string }) => x.mode === "real"),
    ).toHaveLength(1);
  });
});

describe("analytics and exports", () => {
  it("returns matrix, heatmap, rising stars, treemap and movers shapes", async () => {
    const a = await j("GET", "/analytics/overview?data=all");
    expect(a.matrix.length).toBeGreaterThan(5);
    expect(a.matrix[0]).toHaveProperty("sizeBasis");
    expect(a.heatmap.countries).toContain("US");
    expect(a.heatmap.rows[0].cells).toHaveLength(a.heatmap.countries.length);
    expect(a.treemap.length).toBeGreaterThan(2);
    expect(a.movers).toHaveProperty("risers");
    expect((await call("GET", "/analytics/overview?data=bogus")).statusCode).toBe(400);
  });
  it("exports trends as CSV and neutralises spreadsheet formulas", async () => {
    const r = await call("GET", "/export/trends.csv?data=real");
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.headers["content-disposition"]).toMatch(/attachment/);
    expect(r.body.split("\r\n")[0]).toMatch(/^Trend,Category,Data,India stage,Momentum/);
    expect(r.body).toMatch(/P6 Rising Gadget/);
    await db.insert(scores).values({
      trendId: ids["p6-formula-trend"]!,
      algorithmVersion: ALGORITHM_VERSION,
      adoptionStage: "emerging",
      confidence: 0.5,
      inputs: { components: { foreignMomentum: 70, lagWindow: 50, competitionGap: 50 } },
    });
    const again = (await call("GET", "/export/trends.csv?data=real")).body;
    expect(again).toMatch(/'=SUM\(1\) Formula Trend/);
    expect(again).not.toMatch(/(^|\r\n)=SUM/);
  });
});
