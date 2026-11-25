import { trackedKeywords, trendEntities, type Db } from "@trendbridge/db";
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

/** Fallback queries so news flows even before you add keywords. Driven by verticals config. */
export const DEFAULT_QUERIES = [
  "gift trends",
  "personalised gifts",
  "water purifier trends",
  "reverse osmosis home",
  "viral kitchen gadget",
];
