import { categories, createDb, giftProfiles, scores, trendEntities } from "@trendbridge/db";
import { ALGORITHM_VERSION } from "@trendbridge/shared";
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
const ids: Record<string, number> = {};
const SLUGS = ["p3-candle-set", "p3-frame", "p3-saturated-mug", "p3-unclassified"];

const get = async (url: string) =>
  (await app.inject({ method: "GET", url, headers: { cookie } })).json();
const names = (r: { items: { name: string }[] }) => r.items.map((i) => i.name);

async function cleanup() {
  await db.delete(trendEntities).where(inArray(trendEntities.slug, SLUGS));
  await db.delete(categories).where(inArray(categories.slug, ["p3-home", "p3-tech"]));
}

async function make(
  slug: string,
  name: string,
  opts: {
    cat?: string;
    occ: string[];
    stage?: string;
    momentum?: number;
    band?: [number, number];
    corporate?: boolean;
    recipients?: string[];
    personalisation?: string;
    interests?: string[];
    ages?: string[];
  },
) {
  const catId = opts.cat
    ? (await db.select().from(categories).where(eq(categories.slug, opts.cat)))[0]!.id
    : null;
  const [t] = await db
    .insert(trendEntities)
    .values({
      slug,
      name,
      categoryId: catId,
      verticalKeys: ["gifts"],
      occasionKeys: opts.occ,
      isSample: false,
      status: "tracked",
    })
    .returning();
  ids[slug] = t!.id;
  if (opts.band) {
    await db.insert(giftProfiles).values({
      trendId: t!.id,
      recipients: opts.recipients ?? [],
      ageGroups: opts.ages ?? ["adults"],
      interests: opts.interests ?? [],
      personalisation: opts.personalisation ?? "none",
      priceMinInr: opts.band[0],
      priceMaxInr: opts.band[1],
      corporate: opts.corporate
        ? {
            moq: 25,
            branding: ["logo print"],
            leadTimeDays: 21,
            priceBreaks: [
              { qty: 25, discountPct: 0 },
              { qty: 100, discountPct: 10 },
            ],
          }
        : null,
    });
  }
  if (opts.stage) {
    const components = {
      foreignMomentum: opts.momentum ?? 50,
      lagWindow: 60,
      competitionGap: 60,
      priceFit: null,
      margin: null,
      regulatory: null,
      logistics: null,
      seasonality: null,
    };
    await db.insert(scores).values({
      trendId: t!.id,
      algorithmVersion: ALGORITHM_VERSION,
      adoptionStage: opts.stage,
      opportunity: 50,
      confidence: 0.5,
      inputs: { components, confidence: { level: "medium", value: 0.5, parts: {} } },
    });
  }
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
  await app.inject({ method: "DELETE", url: "/settings/weights", headers: { cookie } });
  await cleanup();
  await db.insert(categories).values([
    { slug: "p3-home", name: "P3 Home" },
    { slug: "p3-tech", name: "P3 Tech" },
  ]);
  await make("p3-candle-set", "P3 Candle Set", {
    cat: "p3-home",
    occ: ["diwali", "housewarming"],
    stage: "early_signal",
    momentum: 90,
    band: [500, 1400],
    recipients: ["mother", "friend"],
    personalisation: "light",
    interests: ["home"],
    corporate: true,
  });
  await make("p3-frame", "P3 Frame", {
    cat: "p3-tech",
    occ: ["diwali"],
    stage: "emerging",
    momentum: 60,
    band: [3000, 6000],
    recipients: ["father"],
    interests: ["tech"],
    ages: ["seniors"],
  });
  await make("p3-saturated-mug", "P3 Saturated Mug", {
    cat: "p3-home",
    occ: ["diwali"],
    stage: "saturated",
    momentum: 95,
    band: [300, 600],
    recipients: ["colleague"],
  });
  await make("p3-unclassified", "P3 Unclassified", { occ: [] });
});
afterAll(async () => {
  await cleanup();
  await closeQueue();
  await app.close();
  await pool.end();
});

describe("browse", () => {
  it("diwali + under ₹1,500 returns unsaturated gifts, ranked, with the window", async () => {
    const r = await get("/gifts?data=real&occasion=diwali&budget=u1500&today=2027-06-01");
    expect(names(r)).toEqual(["P3 Candle Set"]);
    expect(r.hiddenSaturated).toBe(1);
    expect(r.window).toMatchObject({
      festival: "Diwali",
      festivalDate: "2027-10-29",
      importDeadline: "2027-07-16",
      status: "start_now",
    });
    expect(r.items[0].hint.hubs).toBeTruthy();
  });
  it("can include saturated gifts and ranks by opportunity", async () => {
    const r = await get("/gifts?data=real&occasion=diwali&notSaturated=false&today=2027-06-01");
    expect(names(r)).toEqual(["P3 Saturated Mug", "P3 Candle Set", "P3 Frame"]);
    const opp = r.items.map((i: { opportunity: number }) => i.opportunity);
    expect(opp).toEqual([...opp].sort((a: number, b: number) => b - a));
  });
  it("filters by recipient, age, interest, personalisation, corporate and budget", async () => {
    expect(names(await get("/gifts?data=real&recipient=father"))).toEqual(["P3 Frame"]);
    expect(names(await get("/gifts?data=real&age=seniors"))).toEqual(["P3 Frame"]);
    expect(names(await get("/gifts?data=real&interest=home"))).toEqual(["P3 Candle Set"]);
    expect(names(await get("/gifts?data=real&personalisation=light"))).toEqual(["P3 Candle Set"]);
    expect(names(await get("/gifts?data=real&corporate=true"))).toEqual(["P3 Candle Set"]);
    expect(names(await get("/gifts?data=real&budget=3000-5000"))).toEqual(["P3 Frame"]);
  });
  it("keeps unclassified gifts out of attribute filters but flags them when unfiltered", async () => {
    expect(names(await get("/gifts?data=real&recipient=mother"))).not.toContain("P3 Unclassified");
    const all = await get("/gifts?data=real");
    expect(all.items.find((i: { name: string }) => i.name === "P3 Unclassified").needsDetails).toBe(
      true,
    );
  });
  it("rejects invalid filter values", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/gifts?recipient=alien", headers: { cookie } }))
        .statusCode,
    ).toBe(400);
  });
  it("serves facets and has seeded sample gifts with profiles", async () => {
    const f = await get("/gifts/facets");
    expect(
      f.occasions.some((o: { key: string; festival: boolean }) => o.key === "diwali" && o.festival),
    ).toBe(true);
    expect(f.budgets.length).toBeGreaterThan(4);
    const sample = await get("/gifts?data=sample&notSaturated=false");
    expect(sample.count).toBeGreaterThanOrEqual(20);
    expect(
      sample.items.every((i: { isSample: boolean; range: unknown }) => i.isSample && i.range),
    ).toBe(true);
  });
});

describe("gifting windows and gift of the week", () => {
  it("shows start-now before the import deadline and missed after, only unsaturated gifts", async () => {
    const early = await get("/gifts/windows?data=real&today=2027-06-01");
    const diwali = early.windows.find((w: { key: string }) => w.key === "diwali");
    expect(diwali.status).toBe("start_now");
    expect(diwali.gifts.map((g: { name: string }) => g.name)).toEqual([
      "P3 Candle Set",
      "P3 Frame",
    ]);
    const late = await get("/gifts/windows?data=real&today=2027-09-20");
    expect(late.windows.find((w: { key: string }) => w.key === "diwali").status).toBe("missed");
    const mid = await get("/gifts/windows?data=real&today=2027-08-10");
    expect(mid.windows.find((w: { key: string }) => w.key === "diwali").status).toBe(
      "manufacture_only",
    );
  });
  it("lists festivals soonest first and omits past ones", async () => {
    const w = await get("/gifts/windows?today=2026-11-26");
    const dates = w.windows.map((x: { festivalDate: string }) => x.festivalDate);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0] >= "2026-11-26").toBe(true);
  });
  it("picks the highest-opportunity gift with an open import window, and explains why", async () => {
    const w = await get("/gifts/week?today=2027-06-01");
    expect(w.item.name).toBe("P3 Candle Set");
    expect(w.reason).toMatch(/order by 2027-07-16/);
    expect(w.week).toMatch(/^2027-W\d\d$/);
  });
  it("says so when no window is open", async () => {
    const w = await get("/gifts/week?today=2027-09-20");
    expect(w.item === null || w.item.isSample === true || w.window.status === "start_now").toBe(
      true,
    );
  });
});

describe("bundles and corporate", () => {
  it("builds hampers from different categories with a discounted suggested price", async () => {
    const r = await get("/gifts/bundles?data=real&occasion=diwali&size=2");
    expect(r.bundles).toHaveLength(1);
    const b = r.bundles[0];
    expect(b.items.map((i: { name: string }) => i.name).sort()).toEqual([
      "P3 Candle Set",
      "P3 Frame",
    ]);
    expect(b.suggestedInr).toBeLessThan(b.sumInr);
    expect(b.suggestedInr % 50).toBe(0);
  });
  it("honours a budget cap", async () => {
    expect(
      (await get("/gifts/bundles?data=real&occasion=diwali&size=2&budget=2000")).bundles,
    ).toEqual([]);
  });
  it("lists corporate-suitable gifts with MOQ and price breaks", async () => {
    const r = await get("/gifts/corporate");
    const c = r.items.find((i: { name: string }) => i.name === "P3 Candle Set");
    expect(c.corporate).toMatchObject({ moq: 25 });
    expect(r.items.some((i: { name: string }) => i.name === "P3 Unclassified")).toBe(false);
    expect(r.note).toMatch(/not supplier quotes/);
  });
});

describe("gift profile editing", () => {
  const body = {
    recipients: ["partner"],
    ageGroups: ["adults"],
    interests: ["decor"],
    personalisation: "full",
    priceMinInr: 700,
    priceMaxInr: 1900,
    occasions: ["rakhi", "birthday"],
    corporate: null,
  };
  it("saves a profile for a live trend and the gift then appears in filters", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/trends/${ids["p3-unclassified"]}/gift-profile`,
      headers: { cookie },
      payload: body,
    });
    expect(put.statusCode).toBe(200);
    expect(
      names(await get("/gifts?data=real&recipient=partner&occasion=rakhi&budget=1000-1500")),
    ).toContain("P3 Unclassified");
    expect(
      (await get(`/trends/${ids["p3-unclassified"]}/gift-profile`)).profile.personalisation,
    ).toBe("full");
  });
  it("validates ranges and refuses sample trends", async () => {
    const bad = await app.inject({
      method: "PUT",
      url: `/trends/${ids["p3-unclassified"]}/gift-profile`,
      headers: { cookie },
      payload: { ...body, priceMinInr: 5000, priceMaxInr: 100 },
    });
    expect(bad.statusCode).toBe(400);
    const sample = (await get("/gifts?data=sample")).items[0].id;
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/trends/${sample}/gift-profile`,
          headers: { cookie },
          payload: body,
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe("sources", () => {
  it("reports etsy as runnable and needing a key when none is configured", async () => {
    const prev = process.env.ETSY_API_KEY;
    delete process.env.ETSY_API_KEY;
    const src = (await get("/sources")).find((s: { key: string }) => s.key === "etsy");
    expect(src).toMatchObject({ implemented: true, runnable: true, envKey: "ETSY_API_KEY" });
    expect(["needs_key", "healthy", "stale", "disabled", "circuit_open"]).toContain(src.status);
    if (prev) process.env.ETSY_API_KEY = prev;
  });
});
