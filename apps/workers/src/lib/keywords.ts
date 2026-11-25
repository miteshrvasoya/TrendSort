import { trackedKeywords, trendEntities, verticals, type Db } from "@trendbridge/db";
import {
  VERTICALS,
  allNewsQueries,
  effectiveVertical,
  verticalOverridesSchema,
} from "@trendbridge/shared";
import { and, asc, eq, sql } from "drizzle-orm";

/** Active tracked terms, least recently fetched first. Sample entities are never fetched. */
export async function activeKeywords(db: Db, limit: number, opts: { vertical?: string } = {}) {
  return db
    .select({
      id: trackedKeywords.id,
      trendId: trackedKeywords.trendId,
      term: trackedKeywords.term,
      geos: trackedKeywords.geos,
    })
    .from(trackedKeywords)
    .innerJoin(trendEntities, eq(trendEntities.id, trackedKeywords.trendId))
    .where(
      and(
        eq(trackedKeywords.active, true),
        eq(trendEntities.isSample, false),
        opts.vertical ? sql`${trendEntities.verticalKeys} ? ${opts.vertical}` : undefined,
      ),
    )
    .orderBy(asc(trackedKeywords.lastFetchedAt))
    .limit(limit);
}

/**
 * Fallback news queries so headlines flow before you track anything. They come from the vertical configs
 * (shipped defaults plus your saved overrides), not from code.
 */
export async function defaultQueries(db: Db): Promise<string[]> {
  const rows = await db
    .select({ key: verticals.key, overrides: verticals.overrides })
    .from(verticals);
  const by = new Map(rows.map((r) => [r.key, r.overrides]));
  const configs = VERTICALS.map((base) => {
    const parsed = verticalOverridesSchema.safeParse(by.get(base.key) ?? {});
    return effectiveVertical(base, parsed.success ? parsed.data : {});
  });
  return allNewsQueries(configs);
}
