import { STAGE_ORDER, stageIndex, toCsv, type Components } from "@trendbridge/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { opportunityFor, userWeights } from "../lib-scores";

interface Scored {
  id: number;
  name: string;
  category: string | null;
  isSample: boolean;
  status: string;
  verticals: string[];
  stage: string | null;
  lagMonths: number | null;
  confidence: number;
  momentum: number | null;
  breadth: number | null;
  sustainability: number | null;
  proof: number | null;
  opportunity: number | null;
  confidenceLevel: string | null;
  foreignMomentum: number | null;
  competitionGap: number | null;
  countries: Record<string, number | null>;
}

async function loadScored(
  app: FastifyInstance,
  userId: string,
  f: { data: string; vertical?: string },
): Promise<Scored[]> {
  const weights = await userWeights(app.db, userId);
  const r = await app.db.execute(sql`
    select t.id, t.name, c.name as category, t.is_sample as "isSample", t.status, t.vertical_keys as verticals,
           s.adoption_stage as stage, s.lag_months as "lagMonths", s.confidence, s.momentum, s.breadth, s.sustainability, s.commercial_proof as proof, s.inputs
    from trend_entities t
    join lateral (select * from scores where trend_id = t.id order by computed_at desc limit 1) s on true
    left join categories c on c.id = t.category_id
    where (${f.data}::text = 'all' or (${f.data}::text = 'sample' and t.is_sample) or (${f.data}::text = 'real' and not t.is_sample))
      and (${f.vertical ?? null}::text is null or t.vertical_keys ? ${f.vertical ?? ""})`);
  return (r.rows as Record<string, unknown>[]).map((row) => {
    const inputs = row.inputs as {
      components?: Components;
      confidence?: { level?: string };
      momentumDetail?: Record<string, { momentum: number | null }>;
    } | null;
    const opp = opportunityFor(inputs, weights);
    const countries: Record<string, number | null> = {};
    for (const [cc, v] of Object.entries(inputs?.momentumDetail ?? {})) countries[cc] = v.momentum;
    return {
      id: row.id as number,
      name: row.name as string,
      category: (row.category as string | null) ?? null,
      isSample: row.isSample as boolean,
      status: row.status as string,
      verticals: row.verticals as string[],
      stage: (row.stage as string | null) ?? null,
      lagMonths: (row.lagMonths as number | null) ?? null,
      confidence: row.confidence as number,
      momentum: (row.momentum as number | null) ?? null,
      breadth: (row.breadth as number | null) ?? null,
      sustainability: (row.sustainability as number | null) ?? null,
      proof: (row.proof as number | null) ?? null,
      opportunity: opp?.score ?? null,
      confidenceLevel: row.isSample ? "sample" : (inputs?.confidence?.level ?? null),
      foreignMomentum: inputs?.components?.foreignMomentum ?? null,
      competitionGap: inputs?.components?.competitionGap ?? null,
      countries,
    };
  });
}

const filters = z.object({
  data: z.enum(["all", "real", "sample"]).default("all"),
  vertical: z.string().optional(),
});
const COUNTRY_ORDER = ["US", "GB", "AE", "JP", "KR", "CN", "DE", "AU", "SG", "IN"];

export const analyticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/analytics/overview",
    { preHandler: app.authenticate, schema: { querystring: filters } },
    async (req) => {
      const all = await loadScored(app, req.user.sub, req.query);
      const byOpp = [...all].sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));

      const matrix = all
        .filter((t) => t.foreignMomentum != null && t.competitionGap != null)
        .map((t) => ({
          id: t.id,
          name: t.name,
          x: t.foreignMomentum!,
          y: t.competitionGap!,
          z: t.proof ?? t.sustainability ?? 40,
          sizeBasis:
            t.proof != null ? "commercial proof" : "sustainability (no marketplace proof yet)",
          isSample: t.isSample,
          stage: t.stage,
          opportunity: t.opportunity,
        }));

      const top = byOpp.filter((t) => t.opportunity != null).slice(0, 15);
      const present = new Set(top.flatMap((t) => Object.keys(t.countries)));
      const countries = [
        ...COUNTRY_ORDER.filter((c) => present.has(c)),
        ...[...present].filter((c) => !COUNTRY_ORDER.includes(c)).sort(),
      ];
      const heatmap = {
        countries,
        rows: top.map((t) => ({
          id: t.id,
          name: t.name,
          isSample: t.isSample,
          cells: countries.map((c) => t.countries[c] ?? null),
        })),
      };

      const rising = all
        .filter(
          (t) =>
            t.momentum != null &&
            t.opportunity != null &&
            stageIndex(t.stage) >= 0 &&
            stageIndex(t.stage) <= 2,
        )
        .sort((a, b) => b.momentum! - a.momentum!)
        .slice(0, 8)
        .map((t) => ({
          id: t.id,
          name: t.name,
          momentum: t.momentum,
          stage: t.stage,
          opportunity: t.opportunity,
          isSample: t.isSample,
        }));

      const cat = new Map<string, { n: number; sum: number; scored: number }>();
      for (const t of all) {
        const k = t.category ?? "Uncategorised";
        const c = cat.get(k) ?? { n: 0, sum: 0, scored: 0 };
        c.n++;
        if (t.opportunity != null) {
          c.sum += t.opportunity;
          c.scored++;
        }
        cat.set(k, c);
      }
      const treemap = [...cat.entries()]
        .map(([name, c]) => ({
          name,
          size: c.n,
          avgOpportunity: c.scored ? Math.round((c.sum / c.scored) * 10) / 10 : null,
        }))
        .sort((a, b) => b.size - a.size);

      const mv = await app.db.execute(sql`
      select p.id, p.title, p.marketplace, p.country_code as country, p.url, s1.bsr as rank, s2.bsr as "prevRank", s1.list_type as "listType"
      from products p
      join lateral (select bsr, list_type, fetched_at from product_snapshots where product_id = p.id and bsr is not null order by fetched_at desc limit 1) s1 on true
      join lateral (select bsr from product_snapshots where product_id = p.id and bsr is not null and fetched_at < s1.fetched_at order by fetched_at desc limit 1) s2 on true`);
      const moves = (
        mv.rows as {
          id: number;
          title: string;
          marketplace: string;
          country: string | null;
          url: string | null;
          rank: number;
          prevRank: number;
          listType: string | null;
        }[]
      ).map((m) => ({ ...m, change: m.prevRank - m.rank }));
      const movers = {
        risers: moves
          .filter((m) => m.change > 0)
          .sort((a, b) => b.change - a.change)
          .slice(0, 8),
        fallers: moves
          .filter((m) => m.change < 0)
          .sort((a, b) => a.change - b.change)
          .slice(0, 8),
        tracked: moves.length,
      };

      return {
        count: all.length,
        scored: all.filter((t) => t.opportunity != null).length,
        matrix,
        heatmap,
        risingStars: rising,
        treemap,
        movers,
        stages: STAGE_ORDER,
      };
    },
  );

  app.get(
    "/export/trends.csv",
    { preHandler: app.authenticate, schema: { querystring: filters } },
    async (req, reply) => {
      const rows = (await loadScored(app, req.user.sub, req.query)).sort(
        (a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1),
      );
      const body = toCsv(
        [
          { key: "name", label: "Trend" },
          { key: "category", label: "Category" },
          { key: "data", label: "Data" },
          { key: "stage", label: "India stage" },
          { key: "momentum", label: "Momentum" },
          { key: "breadth", label: "Breadth" },
          { key: "sustainability", label: "Sustainability" },
          { key: "proof", label: "Commercial proof" },
          { key: "opportunity", label: "Opportunity (your weights)" },
          { key: "lagMonths", label: "Typical India lag (months)" },
          { key: "confidenceLevel", label: "Confidence" },
        ],
        rows.map((t) => ({ ...t, data: t.isSample ? "sample" : t.status })),
      );
      reply.header("content-disposition", 'attachment; filename="trendbridge-trends.csv"');
      return reply.type("text/csv; charset=utf-8").send(body);
    },
  );
};
