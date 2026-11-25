import { createDb, verticals } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultQueries } from "../src/lib/keywords";

const { db, pool } = createDb(
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/trendbridge",
);
let had = false;

beforeAll(async () => {
  had = (await db.select().from(verticals).where(eq(verticals.key, "ro"))).length > 0;
  if (!had)
    await db.insert(verticals).values({ key: "ro", name: "Water Purification / RO", config: {} });
  await db.update(verticals).set({ overrides: {} }).where(eq(verticals.key, "ro"));
});
afterAll(async () => {
  await db.update(verticals).set({ overrides: {} }).where(eq(verticals.key, "ro"));
  await pool.end();
});

describe("default news queries come from vertical config", () => {
  it("uses shipped defaults for every vertical, de-duplicated", async () => {
    const q = await defaultQueries(db);
    expect(q).toContain("tankless RO");
    expect(q).toContain("gift trends");
    expect(new Set(q).size).toBe(q.length);
  });
  it("applies your saved overrides and ignores invalid ones", async () => {
    await db
      .update(verticals)
      .set({ overrides: { newsQueries: ["custom ro query"] } })
      .where(eq(verticals.key, "ro"));
    const q = await defaultQueries(db);
    expect(q).toContain("custom ro query");
    expect(q).not.toContain("tankless RO");
    expect(q).toContain("gift trends");
    await db
      .update(verticals)
      .set({ overrides: { newsQueries: [] } })
      .where(eq(verticals.key, "ro"));
    expect(await defaultQueries(db)).toContain("tankless RO"); // invalid override ignored, defaults used
  });
});
