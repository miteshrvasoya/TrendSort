import { trackedKeywords, trendEntities, verticals as verticalsTable } from "@trendbridge/db";
import {
  PRESENCE_LABEL,
  containsTerm,
  featureGap,
  normaliseWeights,
  slugify,
  verticalOverridesSchema,
  type Components,
} from "@trendbridge/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { opportunityFor } from "../lib-scores";
import { loadVertical, loadVerticals } from "../lib-verticals";

const key = z.object({ key: z.string() });

interface Row {
  id: number;
  name: string;
  slug: string;
  is_sample: boolean;
  status: string;
  inputs: unknown;
  adoption_stage: string | null;
}

async function trendRows(app: Parameters<FastifyPluginAsyncZod>[0], vkey: string): Promise<Row[]> {
  const r = await app.db.execute(sql`
    select t.id, t.name, t.slug, t.is_sample, t.status, s.inputs, s.adoption_stage
    from trend_entities t
    left join lateral (select inputs, adoption_stage from scores where trend_id = t.id order by computed_at desc limit 1) s on true
    where t.vertical_keys ? ${vkey}`);
  return r.rows as unknown as Row[];
}

export const verticalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/verticals", { preHandler: app.authenticate }, async () => {
    const all = await loadVerticals(app);
    return Promise.all(
      all.map(async (v) => {
        const rows = await trendRows(app, v.key);
        const preset = normaliseWeights(v.effective.presetWeights);
        const scored = rows
          .map((r) => ({ r, opp: opportunityFor(r.inputs, preset)?.score ?? null }))
          .filter((x) => x.opp != null)
          .sort((a, b) => b.opp! - a.opp!);
        return {
          key: v.key,
          name: v.effective.name,
          description: v.effective.description,
          trends: rows.length,
          real: rows.filter((r) => !r.is_sample).length,
          sample: rows.filter((r) => r.is_sample).length,
          scored: scored.length,
          avgOpportunity: scored.length
            ? Math.round((scored.reduce((a, x) => a + x.opp!, 0) / scored.length) * 10) / 10
            : null,
          top: scored[0]
            ? {
                id: scored[0].r.id,
                name: scored[0].r.name,
                opportunity: scored[0].opp,
                isSample: scored[0].r.is_sample,
              }
            : null,
          hasFeatures: !!v.effective.features?.length,
          tools: v.effective.tools,
          customised: Object.keys(v.overrides).length > 0,
        };
      }),
    );
  });

  app.get(
    "/verticals/:key",
    { preHandler: app.authenticate, schema: { params: key } },
    async (req, reply) => {
      const v = await loadVertical(app, req.params.key);
      if (!v) return reply.code(404).send({ error: "Unknown vertical" });
      return { key: v.key, defaults: v.base, overrides: v.overrides, effective: v.effective };
    },
  );

  /** Edit keywords, news queries, preset weights or how much of a feature India already has. Defaults stay untouched. */
  app.put(
    "/verticals/:key/overrides",
    { preHandler: app.authenticate, schema: { params: key, body: verticalOverridesSchema } },
    async (req, reply) => {
      const v = await loadVertical(app, req.params.key);
      if (!v) return reply.code(404).send({ error: "Unknown vertical" });
      const known = new Set((v.base.features ?? []).map((f) => f.key));
      const bad = Object.keys(req.body.featurePresence ?? {}).filter((k) => !known.has(k));
      if (bad.length) return reply.code(400).send({ error: `Unknown feature: ${bad.join(", ")}` });
      const merged = {
        ...v.overrides,
        ...req.body,
        featurePresence: { ...v.overrides.featurePresence, ...req.body.featurePresence },
      };
      await app.db
        .update(verticalsTable)
        .set({ overrides: merged })
        .where(eq(verticalsTable.key, v.key));
      return { ok: true, overrides: merged };
    },
  );

  app.delete(
    "/verticals/:key/overrides",
    { preHandler: app.authenticate, schema: { params: key } },
    async (req, reply) => {
      const v = await loadVertical(app, req.params.key);
      if (!v) return reply.code(404).send({ error: "Unknown vertical" });
      await app.db
        .update(verticalsTable)
        .set({ overrides: {} })
        .where(eq(verticalsTable.key, v.key));
      return { ok: true };
    },
  );

  /** Creates the vertical's starter trends as tracked trends with their keywords. Existing ones are skipped. */
  app.post(
    "/verticals/:key/starter",
    { preHandler: app.authenticate, schema: { params: key } },
    async (req, reply) => {
      const v = await loadVertical(app, req.params.key);
      if (!v) return reply.code(404).send({ error: "Unknown vertical" });
      const starters = v.effective.starterTrends ?? [];
      if (starters.length === 0)
        return reply.code(400).send({ error: "This vertical has no starter set" });
      const created: string[] = [];
      const skipped: string[] = [];
      for (const s of starters) {
        const slug = slugify(s.name);
        const [dup] = await app.db
          .select({ id: trendEntities.id })
          .from(trendEntities)
          .where(eq(trendEntities.slug, slug));
        if (dup) {
          skipped.push(s.name);
          continue;
        }
        const [t] = await app.db
          .insert(trendEntities)
          .values({
            slug,
            name: s.name,
            verticalKeys: [v.key],
            status: "tracked",
            origin: "user",
            confidence: 0.5,
            isSample: false,
            subCategory: s.feature ?? null,
          })
          .returning();
        await app.db
          .insert(trackedKeywords)
          .values(
            s.keywords.map((term) => ({ trendId: t!.id, term, geos: s.geos ?? ["US", "IN"] })),
          );
        created.push(s.name);
      }
      return { created, skipped };
    },
  );

  /** Feature taxonomy x foreign momentum x India presence. Answers: what is rising abroad that India's brands lack? */
  app.get(
    "/verticals/:key/features",
    { preHandler: app.authenticate, schema: { params: key } },
    async (req, reply) => {
      const v = await loadVertical(app, req.params.key);
      if (!v) return reply.code(404).send({ error: "Unknown vertical" });
      const features = v.effective.features ?? [];
      const rows = await trendRows(app, v.key);
      const starterSlug = new Map(
        (v.effective.starterTrends ?? [])
          .filter((s) => s.feature)
          .map((s) => [s.feature!, slugify(s.name)]),
      );
      const defaults = new Map((v.base.features ?? []).map((f) => [f.key, f.indiaPresence]));
      const out = features.map((f) => {
        const candidates = rows.filter(
          (r) => r.slug === starterSlug.get(f.key) || containsTerm(r.name, f.matchTerm),
        );
        const pick =
          candidates.find((r) => !r.is_sample && r.inputs) ??
          candidates.find((r) => !r.is_sample) ??
          candidates.find((r) => r.inputs) ??
          candidates[0] ??
          null;
        const comps =
          (pick?.inputs as { components?: Components; confidence?: { level?: string } } | null) ??
          null;
        const foreign = comps?.components?.foreignMomentum ?? null;
        const opp = pick
          ? opportunityFor(pick.inputs, normaliseWeights(v.effective.presetWeights))
          : null;
        return {
          key: f.key,
          label: f.label,
          description: f.description,
          presence: f.indiaPresence,
          defaultPresence: defaults.get(f.key) ?? f.indiaPresence,
          presenceLabel: PRESENCE_LABEL[f.indiaPresence],
          presenceNote: f.presenceNote,
          edited: f.indiaPresence !== defaults.get(f.key),
          trend: pick
            ? {
                id: pick.id,
                name: pick.name,
                isSample: pick.is_sample,
                stage: pick.adoption_stage,
                opportunity: opp?.score ?? null,
                foreignMomentum: foreign,
                confidenceLevel: pick.is_sample ? "sample" : (comps?.confidence?.level ?? null),
              }
            : null,
          gap: featureGap(foreign, f.indiaPresence),
        };
      });
      out.sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.label.localeCompare(b.label));
      return {
        features: out,
        waterProfiles: v.effective.waterProfiles ?? [],
        note: "India presence is a rough analyst estimate by feature (0 none, 3 widespread). Edit it with your own market knowledge; gaps update instantly.",
      };
    },
  );
};
