import { rawSignals } from "@trendbridge/db";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

/** INR per 1 unit of currency from the latest ECB raw signal; empty when the FX connector has never run. */
export async function fxRates(
  app: Pick<FastifyInstance, "db">,
): Promise<{ rates: Record<string, number>; asOf: string | null }> {
  const [r] = await app.db
    .select()
    .from(rawSignals)
    .where(eq(rawSignals.kind, "ecb_fx"))
    .orderBy(sql`fetched_at desc`)
    .limit(1);
  const p = r?.payload as { rates?: Record<string, number>; date?: string } | undefined;
  const rates = Object.fromEntries(
    Object.entries(p?.rates ?? {})
      .filter(([, v]) => v > 0)
      .map(([c, perInr]) => [c, 1 / perInr]),
  );
  return { rates, asOf: p?.date ?? null };
}
