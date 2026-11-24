import { createDb, rateLimitUsage, rawSignals, sourceRuns, sources } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { circuitState } from "../src/framework/circuit";
import { PoliteHttp, RobotsBlockedError } from "../src/framework/http";
import { isAllowed, parseRobots } from "../src/framework/robots";
import { runConnector } from "../src/framework/runner";
import type { Connector } from "../src/framework/types";
import { ecbFx } from "../src/connectors/ecbFx";

describe("robots.txt", () => {
  const txt = `User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.json$\n\nUser-agent: TrendBridge\nDisallow: /blocked`;
  it("uses the specific UA group", () => {
    const r = parseRobots(txt, "TrendBridge/0.1");
    expect(isAllowed(r, "/blocked/x")).toBe(false);
    expect(isAllowed(r, "/private")).toBe(true);
  });
  it("falls back to * with longest match and wildcards", () => {
    const r = parseRobots(txt, "OtherBot/1.0");
    expect(isAllowed(r, "/private/secret")).toBe(false);
    expect(isAllowed(r, "/private/ok/page")).toBe(true);
    expect(isAllowed(r, "/data.json")).toBe(false);
    expect(isAllowed(r, "/data.jsonl")).toBe(true);
  });
});

describe("circuit breaker", () => {
  const now = 1_000_000_000;
  const run = (status: string, ago: number) => ({ status, at: now - ago });
  it("stays closed under threshold", () =>
    expect(circuitState([run("error", 1), run("ok", 2)], now)).toBe("closed"));
  it("opens after 3 consecutive errors, half-opens after cooldown", () => {
    const errs = [run("error", 1000), run("error", 2000), run("error", 3000)];
    expect(circuitState(errs, now)).toBe("open");
    expect(
      circuitState(
        errs.map((e) => ({ ...e, at: e.at - 3_600_000 })),
        now,
      ),
    ).toBe("half_open");
  });
  it("ignores skipped runs", () =>
    expect(circuitState([run("skipped", 1), run("ok", 2)], now)).toBe("closed"));
});

describe("PoliteHttp", () => {
  const sleeps: number[] = [];
  const mk = (responses: (() => Response)[]) => {
    let i = 0;
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (String(url).endsWith("/robots.txt"))
        return new Response("User-agent: *\nDisallow: /nope");
      return responses[Math.min(i++, responses.length - 1)]!();
    }) as unknown as typeof fetch;
    return {
      http: new PoliteHttp(null, "t", {
        userAgent: "T/1",
        fetchImpl,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        minIntervalMs: 0,
      }),
      calls,
    };
  };
  it("blocks robots-disallowed paths", async () => {
    const { http } = mk([() => new Response("ok")]);
    await expect(http.get("https://x.test/nope")).rejects.toBeInstanceOf(RobotsBlockedError);
  });
  it("retries 429 with backoff then succeeds", async () => {
    sleeps.length = 0;
    const { http } = mk([
      () => new Response("", { status: 429 }),
      () => new Response("", { status: 503 }),
      () => new Response("fine"),
    ]);
    const res = await http.get("https://x.test/ok");
    expect(await res.text()).toBe("fine");
    expect(sleeps.filter((s) => s > 0)).toEqual([1000, 2000]);
  });
  it("does not retry or bypass 403", async () => {
    const { http } = mk([() => new Response("", { status: 403 })]);
    await expect(http.get("https://x.test/ok")).rejects.toThrow(/not attempting to bypass/);
  });
});

describe("connector runner (DB)", () => {
  const { db, pool } = createDb(
    process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
  );
  beforeAll(async () => {
    await db
      .insert(sources)
      .values({ key: "test_src", name: "Test", type: "test", method: "static", limitCalls: 5 })
      .onConflictDoNothing();
    const [row] = await db.select().from(sources).where(eq(sources.key, "test_src"));
    await db.delete(rawSignals).where(eq(rawSignals.sourceId, row!.id));
    await db.delete(sourceRuns).where(eq(sourceRuns.sourceId, row!.id));
    await db.delete(rateLimitUsage).where(eq(rateLimitUsage.sourceId, row!.id));
    await db
      .update(sources)
      .set({ enabled: true, circuitState: "closed" })
      .where(eq(sources.key, "test_src"));
  });
  afterAll(async () => {
    await pool.end();
  });

  const fake = (fail: boolean): Connector<{ n: number }, number> => ({
    key: "test_src",
    name: "Test",
    rateLimit: { calls: 5, windowMs: 1 },
    costPerCall: 0,
    reliabilityScore: 0.5,
    termsNote: "",
    scraped: false,
    async fetch() {
      if (fail) throw new Error("boom");
      return [{ n: 1 }, { n: 2 }];
    },
    normalize: (raw) => raw.map((r) => r.n * 2),
    async healthCheck() {
      return { ok: true, detail: "" };
    },
  });
  const env = { userAgent: "T/1", liveFetch: false };

  it("stores raw signals and records an ok run", async () => {
    const res = await runConnector(db, fake(false) as Connector, env);
    expect(res).toMatchObject({ status: "ok", items: 2 });
    const [src] = await db.select().from(sources).where(eq(sources.key, "test_src"));
    expect(src!.lastSuccessAt).not.toBeNull();
    const raw = await db.select().from(rawSignals).where(eq(rawSignals.sourceId, src!.id));
    expect(raw.length).toBeGreaterThanOrEqual(2);
  });

  it("opens the circuit after 3 failures and then skips", async () => {
    for (let i = 0; i < 3; i++)
      expect((await runConnector(db, fake(true) as Connector, env)).status).toBe("error");
    const res = await runConnector(db, fake(false) as Connector, env);
    expect(res).toMatchObject({ status: "skipped", reason: "circuit open" });
  });

  it("ecb fx normalises fixture data to INR per unit", async () => {
    const norm = ecbFx.normalize(await ecbFx.fetch({ fixtureMode: true } as never));
    const usd = norm.find((n) => n.currency === "USD")!;
    expect(usd.inrPerUnit).toBeGreaterThan(50);
    expect(usd.inrPerUnit).toBeLessThan(150);
  });
});
