import { alertRuleSchema, evaluateRule } from "@trendbridge/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { alertEvents, alerts, scores, trendEntities, watchlists } from "../schema";
import { snapshotOf, weightsFor } from "./snapshots";

/**
 * Evaluates every active alert against the latest two daily scores of its trends and records crossings.
 * Idempotent: one event per (alert, trend, rule, day). Scope "all" ignores sample trends; trend/watchlist scopes do not.
 */
export async function evaluateAlerts(db: Db): Promise<{ checked: number; fired: number }> {
  const active = await db.select().from(alerts).where(eq(alerts.active, true));
  let checked = 0,
    fired = 0;
  for (const a of active) {
    const parsed = alertRuleSchema.safeParse(a.rule);
    if (!parsed.success) continue;
    const rule = parsed.data;
    let trendIds: number[] = [];
    if (rule.scope === "trend") trendIds = a.trendId != null ? [a.trendId] : [];
    else if (rule.scope === "watchlist") {
      const [w] =
        rule.watchlistId != null
          ? await db
              .select()
              .from(watchlists)
              .where(and(eq(watchlists.id, rule.watchlistId), eq(watchlists.userId, a.userId)))
          : [];
      trendIds = w?.trendIds ?? [];
    } else
      trendIds = (
        await db
          .select({ id: trendEntities.id })
          .from(trendEntities)
          .where(eq(trendEntities.isSample, false))
      ).map((r) => r.id);
    const weights = await weightsFor(db, a.userId);
    for (const trendId of trendIds) {
      const rows = await db
        .select()
        .from(scores)
        .where(eq(scores.trendId, trendId))
        .orderBy(desc(scores.computedAt))
        .limit(30);
      const latest = rows[0];
      if (!latest) continue;
      const day = latest.computedAt.toISOString().slice(0, 10);
      const prev = rows.find((r) => r.computedAt.toISOString().slice(0, 10) < day);
      const [t] = await db
        .select({ name: trendEntities.name })
        .from(trendEntities)
        .where(eq(trendEntities.id, trendId));
      checked++;
      const res = evaluateRule(
        rule,
        snapshotOf(latest, weights),
        prev ? snapshotOf(prev, weights) : null,
        t?.name ?? `Trend ${trendId}`,
      );
      if (!res.fired) continue;
      const ins = await db
        .insert(alertEvents)
        .values({
          alertId: a.id,
          userId: a.userId,
          trendId,
          message: res.message!,
          fingerprint: `${rule.type}:${day}`,
        })
        .onConflictDoNothing()
        .returning({ id: alertEvents.id });
      if (ins.length) {
        fired++;
        await db.update(alerts).set({ lastFiredAt: new Date() }).where(eq(alerts.id, a.id));
      }
    }
  }
  return { checked, fired };
}

export const unseenAlertCount = async (db: Db, userId: string): Promise<number> =>
  (
    (
      await db.execute(
        sql`select count(*)::int as n from alert_events where user_id = ${userId} and not seen`,
      )
    ).rows[0] as { n: number }
  ).n;
