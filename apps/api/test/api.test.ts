import { createDb, users } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import { CURRENT_VERSION } from "@trendbridge/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { runSeed } from "../src/seed/seed";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>;
let cookie = "";

beforeAll(async () => {
  await runSeed();
  await db
    .update(users)
    .set({ lastSeenVersion: null, tourCompletedVersion: null })
    .where(eq(users.email, config.ADMIN_EMAIL));
  app = await buildApp({ db, config });
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD },
  });
  cookie = String(res.headers["set-cookie"]).split(";")[0]!;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

describe("auth", () => {
  it("rejects bad password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: config.ADMIN_EMAIL, password: "nope" },
    });
    expect(res.statusCode).toBe(401);
  });
  it("blocks unauthenticated access", async () => {
    expect((await app.inject({ method: "GET", url: "/trends" })).statusCode).toBe(401);
  });
  it("returns the user", async () => {
    expect((await get("/auth/me")).json().email).toBe(config.ADMIN_EMAIL);
  });
});

describe("versions & tour", () => {
  it("first-time users see the release in What's New and a full tour", async () => {
    const wn = (await get("/versions/whats-new")).json();
    expect(wn.current).toBe(CURRENT_VERSION);
    expect(wn.versions.length).toBeGreaterThan(0);
    expect((await get("/tour")).json().steps.length).toBeGreaterThan(0);
  });
  it("marks version seen and tour complete", async () => {
    await app.inject({
      method: "POST",
      url: "/versions/seen",
      headers: { cookie },
      payload: { version: CURRENT_VERSION },
    });
    await app.inject({ method: "POST", url: "/tour/complete", headers: { cookie } });
    expect((await get("/versions/whats-new")).json().versions).toHaveLength(0);
    expect((await get("/tour")).json().steps).toHaveLength(0);
    expect((await get("/tour?mode=full")).json().steps.length).toBeGreaterThan(0);
  });
});

describe("data", () => {
  it("lists at least 30 sample trends flagged as sample", async () => {
    const rows = (await get("/trends?data=sample")).json();
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(rows.every((r: { isSample: boolean }) => r.isSample)).toBe(true);
  });
  it("filters by vertical", async () => {
    const ro = (await get("/trends?vertical=ro")).json();
    expect(ro.length).toBeGreaterThan(5);
  });
  it("returns a 104-week series with India and US", async () => {
    const id = (await get("/trends?limit=1")).json()[0].id;
    const s = (await get(`/trends/${id}/series`)).json();
    expect(s.points.filter((p: { country: string }) => p.country === "IN")).toHaveLength(104);
  });
  it("lists sources with Rs 0 cost", async () => {
    const src = (await get("/sources")).json();
    expect(src.length).toBeGreaterThan(20);
    expect(src.every((s: { costInr: number }) => s.costInr === 0)).toBe(true);
  });
});
