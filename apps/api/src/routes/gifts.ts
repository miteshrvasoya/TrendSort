import { giftProfiles, rawSignals, trendEntities, categories } from "@trendbridge/db";
import {
  AGE_GROUPS,
  BUDGET_BANDS,
  DEFAULT_PRICE_BREAKS,
  EVERGREEN_OCCASIONS,
  FESTIVALS,
  INTERESTS,
  PERSONALISATION,
  RECIPIENTS,
  buildBundles,
  fitsBudget,
  lagGroupFor,
  parseInrBand,
  sourcingHint,
  upcomingFestivals,
  windowFor,
  type BudgetKey,
  type PriceRange,
  type WindowInfo,
} from "@trendbridge/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { opportunityFor, userWeights } from "../lib-scores";

export interface GiftItem {
  id: number;
  name: string;
  category: string | null;
  isSample: boolean;
  status: string;
  occasions: string[];
  recipients: string[];
  ageGroups: string[];
  interests: string[];
  personalisation: string;
  range: PriceRange | null;
  priceSource: "profile" | "foreign_converted" | null;
  needsDetails: boolean;
  corporate: {
    moq: number;
    branding: string[];
    leadTimeDays: number;
    priceBreaks: { qty: number; discountPct: number }[];
  } | null;
  opportunity: number | null;
  confidenceLevel: string | null;
  stage: string | null;
  lagMonths: number | null;
  listings: {
    title: string;
    url: string | null;
    marketplace: string;
    price: number | null;
    currency: string | null;
    rank: number | null;
    listType: string | null;
    scraped: boolean;
  }[];
  hint: { hubs: string; route: string };
  group: string;
}

/** INR per 1 unit of currency from the latest ECB raw signal; empty when the FX connector has never run. */
async function fxRates(app: FastifyInstance): Promise<Record<string, number>> {
  const [r] = await app.db
    .select()
    .from(rawSignals)
    .where(eq(rawSignals.kind, "ecb_fx"))
    .orderBy(sql`fetched_at desc`)
    .limit(1);
  const rates = (r?.payload as { rates?: Record<string, number> } | undefined)?.rates ?? {};
  return Object.fromEntries(
    Object.entries(rates)
      .filter(([, v]) => v > 0)
      .map(([c, perInr]) => [c, 1 / perInr]),
  );
}

export async function loadGiftItems(app: FastifyInstance, userId: string): Promise<GiftItem[]> {
  const weights = await userWeights(app.db, userId);
  const fx = await fxRates(app);
  const trends = await app.db
    .select({ t: trendEntities, gp: giftProfiles, cat: categories.name })
    .from(trendEntities)
    .leftJoin(giftProfiles, eq(giftProfiles.trendId, trendEntities.id))
    .leftJoin(categories, eq(categories.id, trendEntities.categoryId))
    .where(sql`${trendEntities.verticalKeys} ? 'gifts'`);
  if (trends.length === 0) return [];
  const ids = trends.map((x) => x.t.id);

  const sc = await app.db.execute(sql`
    select distinct on (trend_id) trend_id, inputs, adoption_stage, lag_months from scores
    where trend_id = any(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)}) order by trend_id, computed_at desc`);
  const scoreBy = new Map(
    (
      sc.rows as {
        trend_id: number;
        inputs: unknown;
        adoption_stage: string | null;
        lag_months: number | null;
      }[]
    ).map((r) => [r.trend_id, r]),
  );

  const pr = await app.db.execute(sql`
    select p.trend_id, p.title, p.url, p.marketplace, s.price, s.currency, s.bsr as rank, s.list_type as "listType",
           coalesce((select scraped from sources where id = p.source_id), false) as scraped
    from products p join lateral (select * from product_snapshots where product_id = p.id order by fetched_at desc limit 1) s on true
    where p.trend_id = any(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})
    order by s.bsr asc nulls last, p.fetched_at desc`);
  const prodBy = new Map<number, GiftItem["listings"]>();
  for (const r of pr.rows as (GiftItem["listings"][number] & { trend_id: number })[]) {
    const list = prodBy.get(r.trend_id) ?? [];
    if (list.length < 3)
      list.push({
        title: r.title,
        url: r.url,
        marketplace: r.marketplace,
        price: r.price,
        currency: r.currency,
        rank: r.rank,
        listType: r.listType,
        scraped: !!r.scraped,
      });
    prodBy.set(r.trend_id, list);
  }

  return trends.map(({ t, gp, cat }) => {
    const s = scoreBy.get(t.id);
    const opp = s ? opportunityFor(s.inputs, weights) : null;
    const conf =
      (s?.inputs as { confidence?: { level?: string } } | undefined)?.confidence?.level ?? null;
    const listings = prodBy.get(t.id) ?? [];
    let range: PriceRange | null =
      gp?.priceMinInr != null && gp?.priceMaxInr != null
        ? { min: gp.priceMinInr, max: gp.priceMaxInr }
        : parseInrBand(t.priceBandInr);
    let priceSource: GiftItem["priceSource"] = range ? "profile" : null;
    if (!range) {
      const inr = listings
        .filter((l) => l.price != null && l.currency && fx[l.currency])
        .map((l) => l.price! * fx[l.currency!]!)
        .sort((a, b) => a - b);
      if (inr.length) {
        const med = inr[Math.floor(inr.length / 2)]!;
        range = { min: Math.round(med), max: Math.round(med) };
        priceSource = "foreign_converted";
      }
    }
    const group = lagGroupFor(cat ?? null, t.name);
    return {
      id: t.id,
      name: t.name,
      category: cat ?? null,
      isSample: t.isSample,
      status: t.status,
      occasions: t.occasionKeys,
      recipients: gp?.recipients ?? [],
      ageGroups: gp?.ageGroups ?? [],
      interests: gp?.interests ?? [],
      personalisation: gp?.personalisation ?? "none",
      range,
      priceSource,
      needsDetails: !gp,
      corporate: gp?.corporate ?? null,
      opportunity: opp?.score ?? null,
      confidenceLevel: t.isSample ? "sample" : conf,
      stage: s?.adoption_stage ?? null,
      lagMonths: s?.lag_months ?? null,
      listings,
      hint: sourcingHint(group),
      group,
    };
  });
}

const SATURATED = new Set(["mainstream", "saturated"]);
const todayOf = (app: FastifyInstance, q?: string) =>
  q && app.config.NODE_ENV !== "production" ? new Date(q + "T00:00:00Z") : new Date();

/** Window for an item toward a festival (null when the item is not tagged for it). */
function itemWindow(
  item: GiftItem,
  festival: { key: string; date: string },
  today: Date,
): WindowInfo | null {
  return item.occasions.includes(festival.key) ? windowFor(festival.date, today) : null;
}

const filterQuery = z.object({
  occasion: z.string().optional(),
  recipient: z.enum(RECIPIENTS).optional(),
  budget: z.string().optional(),
  age: z.enum(AGE_GROUPS).optional(),
  interest: z.enum(INTERESTS).optional(),
  personalisation: z.enum(PERSONALISATION).optional(),
  corporate: z.coerce.boolean().optional(),
  notSaturated: z.enum(["true", "false"]).default("true"),
  data: z.enum(["all", "real", "sample"]).default("all"),
  q: z.string().optional(),
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const giftRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/gifts",
    { preHandler: app.authenticate, schema: { querystring: filterQuery } },
    async (req) => {
      const f = req.query;
      const today = todayOf(app, f.today);
      let items = await loadGiftItems(app, req.user.sub);
      if (f.data !== "all")
        items = items.filter((i) => (f.data === "sample" ? i.isSample : !i.isSample));
      if (f.q) items = items.filter((i) => i.name.toLowerCase().includes(f.q!.toLowerCase()));
      if (f.occasion) items = items.filter((i) => i.occasions.includes(f.occasion!));
      if (f.recipient) items = items.filter((i) => i.recipients.includes(f.recipient!));
      if (f.age) items = items.filter((i) => i.ageGroups.includes(f.age!));
      if (f.interest) items = items.filter((i) => i.interests.includes(f.interest!));
      if (f.personalisation) items = items.filter((i) => i.personalisation === f.personalisation);
      if (f.corporate) items = items.filter((i) => i.corporate != null);
      if (f.budget) items = items.filter((i) => fitsBudget(i.range, f.budget as BudgetKey));
      const hiddenSaturated = items.filter((i) => i.stage && SATURATED.has(i.stage)).length;
      if (f.notSaturated === "true")
        items = items.filter((i) => !(i.stage && SATURATED.has(i.stage)));
      items.sort(
        (a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1) || a.name.localeCompare(b.name),
      );

      const fest = f.occasion ? FESTIVALS.find((x) => x.key === f.occasion) : undefined;
      const next = fest ? upcomingFestivals([fest], today, 800)[0] : undefined;
      const window = next ? { festival: next.name, ...windowFor(next.date, today) } : null;
      return {
        items,
        count: items.length,
        hiddenSaturated,
        window,
        evergreen: f.occasion ? EVERGREEN_OCCASIONS.has(f.occasion) : false,
      };
    },
  );

  app.get("/gifts/facets", { preHandler: app.authenticate }, async () => ({
    occasions: [
      ...FESTIVALS.map((f) => ({ key: f.key, name: f.name, festival: true })),
      ...[...EVERGREEN_OCCASIONS].map((k) => ({
        key: k,
        name: k.replace(/-/g, " "),
        festival: false,
      })),
    ],
    recipients: RECIPIENTS,
    ages: AGE_GROUPS,
    interests: INTERESTS,
    personalisation: PERSONALISATION,
    budgets: BUDGET_BANDS.map((b) => ({ key: b.key, label: b.label })),
  }));

  /** For each upcoming Indian festival: gifts tagged for it, latest dates to start importing / manufacturing. */
  app.get(
    "/gifts/windows",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: z.object({
          today: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          data: z.enum(["all", "real", "sample"]).default("all"),
        }),
      },
    },
    async (req) => {
      const today = todayOf(app, req.query.today);
      let items = await loadGiftItems(app, req.user.sub);
      if (req.query.data !== "all")
        items = items.filter((i) => (req.query.data === "sample" ? i.isSample : !i.isSample));
      const windows = upcomingFestivals(FESTIVALS, today).map((fest) => {
        const w = windowFor(fest.date, today);
        const gifts = items
          .filter((i) => itemWindow(i, fest, today) && !(i.stage && SATURATED.has(i.stage)))
          .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1))
          .map((i) => ({
            id: i.id,
            name: i.name,
            opportunity: i.opportunity,
            stage: i.stage,
            confidenceLevel: i.confidenceLevel,
            range: i.range,
            isSample: i.isSample,
            hint: i.hint.route,
            group: i.group,
          }));
        return {
          key: fest.key,
          name: fest.name,
          foreignEquivalent: fest.foreignEquivalent,
          giftIntensity: fest.gift_intensity,
          ...w,
          gifts,
        };
      });
      return { today: today.toISOString().slice(0, 10), windows };
    },
  );

  app.get(
    "/gifts/week",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: z.object({
          today: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        }),
      },
    },
    async (req) => {
      const today = todayOf(app, req.query.today);
      const items = (await loadGiftItems(app, req.user.sub)).filter(
        (i) => i.opportunity != null && !(i.stage && SATURATED.has(i.stage)),
      );
      const fests = upcomingFestivals(FESTIVALS, today);
      const open = items.flatMap((i) =>
        fests
          .map((f) => ({ i, f, w: itemWindow(i, f, today) }))
          .filter((x) => x.w && x.w.status === "start_now")
          .map((x) => ({ item: x.i, festival: x.f.name, w: x.w! })),
      );
      const real = open.filter((o) => !o.item.isSample);
      const pool = real.length ? real : open;
      pool.sort(
        (a, b) =>
          b.item.opportunity! - a.item.opportunity! ||
          a.w.daysToImportDeadline - b.w.daysToImportDeadline,
      );
      const pick = pool[0];
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
      if (!pick)
        return {
          week,
          item: null,
          reason:
            "No scored gift currently has an open import window. Track gifts with an occasion, or check the Gifting windows tab.",
        };
      return {
        week,
        item: pick.item,
        festival: pick.festival,
        window: pick.w,
        reason: `Highest India Opportunity (${Math.round(pick.item.opportunity!)}) among gifts for ${pick.festival} that you can still import in time (order by ${pick.w.importDeadline}).`,
      };
    },
  );

  app.get(
    "/gifts/bundles",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: z.object({
          occasion: z.string().optional(),
          budget: z.coerce.number().positive().optional(),
          size: z.coerce.number().int().min(2).max(4).default(3),
          data: z.enum(["all", "real", "sample"]).default("all"),
        }),
      },
    },
    async (req) => {
      let items = (await loadGiftItems(app, req.user.sub)).filter(
        (i) => i.range && !(i.stage && SATURATED.has(i.stage)),
      );
      if (req.query.data !== "all")
        items = items.filter((i) => (req.query.data === "sample" ? i.isSample : !i.isSample));
      if (req.query.occasion)
        items = items.filter((i) => i.occasions.includes(req.query.occasion!));
      const byId = new Map(items.map((i) => [i.id, i]));
      const bundles = buildBundles(
        items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          range: i.range!,
          opportunity: i.opportunity,
        })),
        { budgetMax: req.query.budget, size: req.query.size, maxBundles: 6 },
      );
      return {
        candidates: items.length,
        bundles: bundles.map((b) => ({
          ...b,
          items: b.itemIds.map((id) => {
            const i = byId.get(id)!;
            return { id, name: i.name, range: i.range, stage: i.stage, opportunity: i.opportunity };
          }),
          isSample: b.itemIds.some((id) => byId.get(id)!.isSample),
        })),
      };
    },
  );

  app.get("/gifts/corporate", { preHandler: app.authenticate }, async (req) => {
    const items = (await loadGiftItems(app, req.user.sub)).filter(
      (i) => i.corporate && !(i.stage && SATURATED.has(i.stage)),
    );
    items.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
    return {
      items,
      defaultPriceBreaks: DEFAULT_PRICE_BREAKS,
      note: "MOQ, branding options and price breaks are working assumptions (editable per product), not supplier quotes.",
    };
  });

  const profileBody = z
    .object({
      recipients: z.array(z.enum(RECIPIENTS)).default([]),
      ageGroups: z.array(z.enum(AGE_GROUPS)).default([]),
      interests: z.array(z.enum(INTERESTS)).default([]),
      personalisation: z.enum(PERSONALISATION).default("none"),
      priceMinInr: z.number().min(0).nullable().default(null),
      priceMaxInr: z.number().min(0).nullable().default(null),
      occasions: z.array(z.string()).default([]),
      corporate: z
        .object({
          moq: z.number().int().min(1),
          branding: z.array(z.string()),
          leadTimeDays: z.number().int().min(1),
          priceBreaks: z
            .array(
              z.object({ qty: z.number().int().min(1), discountPct: z.number().min(0).max(60) }),
            )
            .min(1),
        })
        .nullable()
        .default(null),
    })
    .refine(
      (b) => b.priceMinInr == null || b.priceMaxInr == null || b.priceMinInr <= b.priceMaxInr,
      { message: "priceMinInr must be <= priceMaxInr" },
    );

  app.get(
    "/trends/:id/gift-profile",
    { preHandler: app.authenticate, schema: { params: z.object({ id: z.coerce.number() }) } },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id));
      if (!t) return reply.code(404).send({ error: "Not found" });
      const [gp] = await app.db.select().from(giftProfiles).where(eq(giftProfiles.trendId, t.id));
      return { exists: !!gp, occasions: t.occasionKeys, profile: gp ?? null };
    },
  );

  app.put(
    "/trends/:id/gift-profile",
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ id: z.coerce.number() }), body: profileBody },
    },
    async (req, reply) => {
      const [t] = await app.db
        .select()
        .from(trendEntities)
        .where(eq(trendEntities.id, req.params.id));
      if (!t) return reply.code(404).send({ error: "Not found" });
      if (t.isSample) return reply.code(400).send({ error: "Sample trends cannot be edited" });
      const b = req.body;
      const verticals = t.verticalKeys.includes("gifts")
        ? t.verticalKeys
        : [...t.verticalKeys, "gifts"];
      await app.db
        .update(trendEntities)
        .set({ occasionKeys: b.occasions, verticalKeys: verticals })
        .where(eq(trendEntities.id, t.id));
      const values = {
        recipients: b.recipients,
        ageGroups: b.ageGroups,
        interests: b.interests,
        personalisation: b.personalisation,
        priceMinInr: b.priceMinInr,
        priceMaxInr: b.priceMaxInr,
        corporate: b.corporate,
        updatedAt: new Date(),
      };
      await app.db
        .insert(giftProfiles)
        .values({ trendId: t.id, ...values, isSample: false })
        .onConflictDoUpdate({ target: giftProfiles.trendId, set: values });
      return { ok: true };
    },
  );
};
