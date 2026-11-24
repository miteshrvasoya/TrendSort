import { appVersions, releaseNotes, tourSteps, type Db } from "@trendbridge/db";
import { RELEASES, TOUR_STEPS } from "@trendbridge/shared";
import { sql } from "drizzle-orm";

/** Upserts release notes + tour steps from code into the DB (idempotent). */
export async function syncReleases(db: Db) {
  for (const r of RELEASES) {
    await db
      .insert(appVersions)
      .values({ version: r.version, releasedOn: r.date, title: r.title, summary: r.summary })
      .onConflictDoUpdate({
        target: appVersions.version,
        set: { title: r.title, summary: r.summary, releasedOn: r.date },
      });
    await db
      .insert(releaseNotes)
      .values({
        version: r.version,
        added: r.added,
        changed: r.changed,
        fixed: r.fixed,
        removed: r.removed,
        forYou: r.forYou,
      })
      .onConflictDoUpdate({
        target: releaseNotes.version,
        set: {
          added: r.added,
          changed: r.changed,
          fixed: r.fixed,
          removed: r.removed,
          forYou: r.forYou,
        },
      });
  }
  for (const s of TOUR_STEPS) {
    await db
      .insert(tourSteps)
      .values({
        version: s.version,
        featureKey: s.featureKey,
        target: s.target,
        title: s.title,
        body: s.body,
        order: s.order,
        route: s.route,
      })
      .onConflictDoUpdate({
        target: [tourSteps.version, tourSteps.featureKey],
        set: { target: s.target, title: s.title, body: s.body, order: s.order, route: s.route },
      });
  }
  return sql`ok`;
}
