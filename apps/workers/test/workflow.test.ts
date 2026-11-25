import { createDb, predictions, reports, trendEntities, users } from "@trendbridge/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mailConfigFromEnv, sendReportEmail } from "../src/reports/email";
import { runWeeklyReport } from "../src/reports/job";
import type { AnalyticsClient, AnalyzeResult } from "../src/scoring/analytics";
import { runPredictionBacktest } from "../src/scoring/backtest-predictions";

const { db, pool } = createDb(
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
);
let sampleId = 0;
let madeUser = false;

beforeAll(async () => {
  [sampleId] = (
    await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(eq(trendEntities.isSample, true))
      .limit(1)
  ).map((r) => r.id) as [number];
  if ((await db.select({ id: users.id }).from(users).limit(1)).length === 0) {
    await db.insert(users).values({ email: "workflow-test@example.invalid", passwordHash: "x" });
    madeUser = true;
  }
});
afterAll(async () => {
  await db
    .delete(predictions)
    .where(and(eq(predictions.trendId, sampleId), eq(predictions.origin, "backtest")));
  if (madeUser) await db.delete(users).where(eq(users.email, "workflow-test@example.invalid"));
  await pool.end();
});

const analysis = (ratio: number, growth13: number): AnalyzeResult => ({
  per_country: {},
  notes: [],
  history_weeks: 104,
  last_week: null,
  foreign: null,
  india: { present: true, comparable: true, ratio, growth13, weeks_since_early: null },
  lead_lag: null,
});

describe("prediction back-test", () => {
  it("predicts from truncated data, compares with the full data, stores it as a back-test, and is idempotent", async () => {
    await db
      .delete(predictions)
      .where(and(eq(predictions.trendId, sampleId), eq(predictions.origin, "backtest")));
    const lens: number[] = [];
    const fake: AnalyticsClient = {
      async analyze(req) {
        lens.push(req.weeks.length);
        // truncated (shorter) series: ratio 0.05 growing 50%/quarter; full series: ratio 0.12
        return req.weeks.length < 104 ? analysis(0.05, 0.5) : analysis(0.12, 0.3);
      },
      async categoryLag() {
        return { lag_months: 1, ci_low: 1, ci_high: 1, n: 1, basis: "group" };
      },
      async leadLag() {
        return { lag: 0, correlation: 0, usable: false, n: 0 };
      },
    };
    const r1 = await runPredictionBacktest(db, fake, { trendIds: [sampleId] });
    expect(r1.made).toBeGreaterThan(0);
    expect(lens.some((n) => n === 104 - 26)).toBe(true); // last 26 weeks hidden
    const [p] = await db
      .select()
      .from(predictions)
      .where(and(eq(predictions.trendId, sampleId), eq(predictions.origin, "backtest")));
    // 0.05 x 1.5^2 = 0.1125 -> emerging; full data ratio 0.12 -> emerging
    expect(p).toMatchObject({
      predictedStage: "emerging",
      actualStage: "emerging",
      hit: "exact",
      stageError: 0,
      isSample: true,
      origin: "backtest",
    });
    expect((p!.basis as { ratio: number }).ratio).toBe(0.05);
    expect(p!.resolvedAt).not.toBeNull();
    const r2 = await runPredictionBacktest(db, fake, { trendIds: [sampleId] });
    expect(r2.made).toBe(0);
  });
  it("skips trends without enough history or without an India series", async () => {
    const fake: AnalyticsClient = {
      async analyze() {
        throw new Error("must not be called");
      },
      async categoryLag() {
        throw new Error("x");
      },
      async leadLag() {
        throw new Error("x");
      },
    };
    const r = await runPredictionBacktest(db, fake, { minWeeks: 10_000, trendIds: [sampleId] });
    expect(r.made).toBe(0);
    expect(r.failed).toBe(0);
  });
});

describe("weekly report email", () => {
  const report = {
    weekOf: "2026-11-23",
    generatedAt: "2026-11-29T05:00:00Z",
    mode: "sample",
    topOpportunities: [],
    newEntrants: [],
    rising: [],
    fading: [],
    stageChanges: [],
    upcomingWindows: [],
    alerts: [],
    pipeline: { byStage: {}, stuck: [] },
    dataHealth: { staleSources: [], neverRunSources: [], indicativeTables: false },
    suggestedActions: [],
    caveats: ["c"],
  } as never;
  it("is not configured without SMTP settings, and then sends nothing", async () => {
    expect(mailConfigFromEnv({})).toBeNull();
    expect(mailConfigFromEnv({ SMTP_HOST: "smtp.example.com" })).toBeNull();
    const sent: unknown[] = [];
    expect(await sendReportEmail(report, null, { sendMail: async (m) => sent.push(m) })).toBe(
      false,
    );
    expect(sent).toHaveLength(0);
  });
  it("reads config from env and sends markdown and HTML through the transport", async () => {
    const cfg = mailConfigFromEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "me@example.com",
      SMTP_PASS: "pw",
      REPORT_EMAIL_TO: "you@example.com",
    })!;
    expect(cfg).toMatchObject({
      host: "smtp.example.com",
      port: 465,
      to: "you@example.com",
      from: "me@example.com",
    });
    const sent: { subject: string; text: string; html: string; to: string }[] = [];
    expect(await sendReportEmail(report, cfg, { sendMail: async (m) => sent.push(m) })).toBe(true);
    expect(sent[0]!.subject).toMatch(/week of 2026-11-23.*SAMPLE DATA/);
    expect(sent[0]!.text).toMatch(/^# TrendBridge weekly report/);
    expect(sent[0]!.html).toMatch(/<h1>/);
    expect(sent[0]!.to).toBe("you@example.com");
  });
  it("generates a stored report and marks it emailed only when mail is configured", async () => {
    const sent: unknown[] = [];
    const none = await runWeeklyReport(db, {
      mail: null,
      transport: { sendMail: async (m) => sent.push(m) },
    });
    expect(none).toMatchObject({ emailed: false });
    expect(sent).toHaveLength(0);
    const cfg = { host: "h", port: 587, from: "a@b.c", to: "d@e.f" };
    const yes = await runWeeklyReport(db, {
      mail: cfg,
      transport: { sendMail: async (m) => sent.push(m) },
    });
    expect(yes).toMatchObject({ emailed: true });
    const [row] = await db.select().from(reports).where(eq(reports.id, yes!.id));
    expect(row!.emailedAt).not.toBeNull();
    expect(sent).toHaveLength(1);
  });
});
