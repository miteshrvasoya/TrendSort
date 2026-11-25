import {
  dutyGstTables,
  feeTables,
  giftProfiles,
  categories,
  trendEntities,
  unitEconomicsScenarios,
} from "@trendbridge/db";
import {
  DUTY_GROUPS,
  assumptionsSchema,
  baseAssumptions,
  computeEconomics,
  dutyGroupFor,
  lagGroupFor,
  sensitivity,
  type Assumptions,
} from "@trendbridge/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { fxRates } from "../lib-fx";

const today = () => new Date().toISOString().slice(0, 10);
const MARKETPLACES = ["amazon_in", "flipkart"] as const;

async function latestDuty(app: FastifyInstance, group: string) {
  const [r] = await app.db
    .select()
    .from(dutyGstTables)
    .where(eq(dutyGstTables.groupKey, group))
    .orderBy(desc(dutyGstTables.version))
    .limit(1);
  return r ?? null;
}
async function latestFee(app: FastifyInstance, marketplace: string, group: string) {
  const [r] = await app.db
    .select()
    .from(feeTables)
    .where(and(eq(feeTables.marketplace, marketplace), eq(feeTables.category, group)))
    .orderBy(desc(feeTables.version))
    .limit(1);
  return r ?? null;
}

/** Prefilled assumptions with a note on where each default came from. Everything stays editable. */
export async function buildDefaults(
  app: FastifyInstance,
  opts: { trendId?: number; group?: string; marketplace?: string },
) {
  const a = baseAssumptions();
  const src: Record<string, string> = {};
  let group =
    opts.group && (DUTY_GROUPS as readonly string[]).includes(opts.group) ? opts.group : "general";
  let trendName: string | null = null;
  let range: { min: number; max: number } | null = null;
  if (opts.trendId) {
    const [t] = await app.db.select().from(trendEntities).where(eq(trendEntities.id, opts.trendId));
    if (t) {
      trendName = t.name;
      const cat = t.categoryId
        ? (await app.db.select().from(categories).where(eq(categories.id, t.categoryId)))[0]?.name
        : null;
      if (!opts.group) group = dutyGroupFor(lagGroupFor(cat ?? null, t.name));
      const [gp] = await app.db.select().from(giftProfiles).where(eq(giftProfiles.trendId, t.id));
      if (gp?.priceMinInr != null && gp.priceMaxInr != null)
        range = { min: gp.priceMinInr, max: gp.priceMaxInr };
    }
  }
  const marketplace =
    opts.marketplace && (MARKETPLACES as readonly string[]).includes(opts.marketplace)
      ? opts.marketplace
      : "amazon_in";
  a.marketplace = marketplace;
  a.feeCategory = group;

  const duty = await latestDuty(app, group);
  const fee = await latestFee(app, marketplace, group);
  if (duty) {
    a.import.bcdPct = duty.basicDutyPct;
    a.import.igstPct = duty.igstPct;
    a.import.otherDutyPct = duty.otherPct;
    src.duty = `Duty table "${group}" v${duty.version}${duty.isIndicative ? " (INDICATIVE placeholder: verify on CBIC/ICEGATE)" : " (edited by you)"}`;
  } else src.duty = "no duty table row; generic defaults";
  if (fee) {
    a.referralPct = fee.referralPct;
    a.closingFeeInr = fee.closingFeeInr;
    src.fees = `Fee table ${marketplace} / ${group} v${fee.version}${fee.isIndicative ? " (INDICATIVE placeholder: verify in your seller portal)" : " (edited by you)"}`;
  } else src.fees = "no fee table row; generic defaults";

  const fx = await fxRates(app);
  if (fx.rates.USD) {
    a.import.fxInrPerUnit = Math.round(fx.rates.USD * 100) / 100;
    src.fx = `ECB rate for USD as of ${fx.asOf ?? "latest run"}`;
  } else src.fx = "default 85: ECB rate not fetched yet (run the ecb_fx source)";

  if (range) {
    a.sellingPriceInr = Math.max(99, Math.round((range.min + range.max) / 2 / 100) * 100 - 1);
    src.price = "middle of the gift price range, rounded to ...99";
  } else src.price = "generic default; set your intended selling price";
  src.supplier = "FOB, weight, BOM and tooling are placeholders: replace with supplier quotes";
  return {
    assumptions: a,
    sources: src,
    group,
    trendName,
    tableVersions: { duty: duty?.version ?? null, fee: fee?.version ?? null },
    fxAsOf: fx.asOf,
  };
}

export const economicsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/economics/defaults",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: z.object({
          trendId: z.coerce.number().optional(),
          group: z.string().optional(),
          marketplace: z.string().optional(),
        }),
      },
    },
    async (req) => buildDefaults(app, req.query),
  );

  app.post(
    "/economics/calc",
    { preHandler: app.authenticate, schema: { body: assumptionsSchema } },
    async (req) => {
      const result = computeEconomics(req.body);
      return { ...result, sensitivity: sensitivity(req.body) };
    },
  );

  // ---------------------------------------------------------- versioned tables
  app.get("/economics/tables", { preHandler: app.authenticate }, async () => {
    const duty = await app.db
      .select()
      .from(dutyGstTables)
      .orderBy(dutyGstTables.groupKey, desc(dutyGstTables.version));
    const fees = await app.db
      .select()
      .from(feeTables)
      .orderBy(feeTables.marketplace, feeTables.category, desc(feeTables.version));
    const latestD = new Map<string, (typeof duty)[number]>();
    for (const d of duty) if (d.groupKey && !latestD.has(d.groupKey)) latestD.set(d.groupKey, d);
    const latestF = new Map<string, (typeof fees)[number]>();
    for (const f of fees) {
      const k = `${f.marketplace}|${f.category}`;
      if (!latestF.has(k)) latestF.set(k, f);
    }
    return {
      duty: [...latestD.values()],
      fees: [...latestF.values()],
      dutyHistory: duty,
      feeHistory: fees,
      groups: DUTY_GROUPS,
      marketplaces: MARKETPLACES,
    };
  });

  const dutyBody = z.object({
    groupKey: z.enum(DUTY_GROUPS),
    hsCode: z.string().max(12).optional(),
    bcdPct: z.number().min(0).max(300),
    igstPct: z.number().min(0).max(40),
    otherPct: z.number().min(0).max(300).default(0),
    note: z.string().max(300).optional(),
  });
  app.put(
    "/economics/tables/duty",
    { preHandler: app.authenticate, schema: { body: dutyBody } },
    async (req) => {
      const b = req.body;
      const prev = await latestDuty(app, b.groupKey);
      const [row] = await app.db
        .insert(dutyGstTables)
        .values({
          groupKey: b.groupKey,
          hsCode: b.hsCode ?? prev?.hsCode ?? "n/a",
          description: prev?.description ?? b.groupKey,
          basicDutyPct: b.bcdPct,
          igstPct: b.igstPct,
          otherPct: b.otherPct,
          version: (prev?.version ?? 0) + 1,
          isIndicative: false,
          effectiveFrom: today(),
          note: b.note ?? `edited by you (was v${prev?.version ?? 0})`,
        })
        .returning();
      return row;
    },
  );

  const feeBody = z.object({
    marketplace: z.enum(MARKETPLACES),
    category: z.enum(DUTY_GROUPS),
    referralPct: z.number().min(0).max(60),
    closingFeeInr: z.number().min(0).max(1000),
  });
  app.put(
    "/economics/tables/fees",
    { preHandler: app.authenticate, schema: { body: feeBody } },
    async (req) => {
      const b = req.body;
      const prev = await latestFee(app, b.marketplace, b.category);
      const [row] = await app.db
        .insert(feeTables)
        .values({
          ...b,
          version: (prev?.version ?? 0) + 1,
          isIndicative: false,
          effectiveFrom: today(),
        })
        .returning();
      return row;
    },
  );

  // ---------------------------------------------------------- scenarios
  const scenarioBody = z.object({
    trendId: z.number().nullable().default(null),
    name: z.string().trim().min(1).max(120),
    assumptions: assumptionsSchema,
    isPrimary: z.boolean().default(false),
    tableVersions: z.record(z.number().nullable()).default({}),
  });

  const save = async (userId: string, b: z.infer<typeof scenarioBody>, id?: number) => {
    const results = computeEconomics(b.assumptions);
    if (b.isPrimary && b.trendId != null) {
      await app.db
        .update(unitEconomicsScenarios)
        .set({ isPrimary: false })
        .where(
          and(
            eq(unitEconomicsScenarios.trendId, b.trendId),
            eq(unitEconomicsScenarios.userId, userId),
          ),
        );
    }
    const values = {
      userId,
      trendId: b.trendId,
      name: b.name,
      isPrimary: b.isPrimary && b.trendId != null,
      assumptions: b.assumptions,
      results,
      tableVersions: b.tableVersions,
      updatedAt: new Date(),
    };
    if (id) {
      const [r] = await app.db
        .update(unitEconomicsScenarios)
        .set(values)
        .where(and(eq(unitEconomicsScenarios.id, id), eq(unitEconomicsScenarios.userId, userId)))
        .returning();
      return r ?? null;
    }
    const [r] = await app.db.insert(unitEconomicsScenarios).values(values).returning();
    return r!;
  };

  app.get(
    "/economics/scenarios",
    {
      preHandler: app.authenticate,
      schema: { querystring: z.object({ trendId: z.coerce.number().optional() }) },
    },
    async (req) => {
      const where =
        req.query.trendId != null
          ? and(
              eq(unitEconomicsScenarios.userId, req.user.sub),
              eq(unitEconomicsScenarios.trendId, req.query.trendId),
            )
          : eq(unitEconomicsScenarios.userId, req.user.sub);
      return app.db
        .select()
        .from(unitEconomicsScenarios)
        .where(where)
        .orderBy(desc(unitEconomicsScenarios.isPrimary), desc(unitEconomicsScenarios.updatedAt))
        .limit(100);
    },
  );

  app.post(
    "/economics/scenarios",
    { preHandler: app.authenticate, schema: { body: scenarioBody } },
    async (req, reply) => reply.code(201).send(await save(req.user.sub, req.body)),
  );

  app.put(
    "/economics/scenarios/:id",
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ id: z.coerce.number() }), body: scenarioBody },
    },
    async (req, reply) => {
      const r = await save(req.user.sub, req.body, req.params.id);
      return r ?? reply.code(404).send({ error: "Not found" });
    },
  );

  app.delete(
    "/economics/scenarios/:id",
    { preHandler: app.authenticate, schema: { params: z.object({ id: z.coerce.number() }) } },
    async (req, reply) => {
      const r = await app.db
        .delete(unitEconomicsScenarios)
        .where(
          and(
            eq(unitEconomicsScenarios.id, req.params.id),
            eq(unitEconomicsScenarios.userId, req.user.sub),
          ),
        )
        .returning({ id: unitEconomicsScenarios.id });
      return r.length ? { ok: true } : reply.code(404).send({ error: "Not found" });
    },
  );
};

export type { Assumptions };
