import { verticals as verticalsTable } from "@trendbridge/db";
import {
  VERTICALS,
  VERTICAL_BY_KEY,
  effectiveVertical,
  verticalOverridesSchema,
  type VerticalConfig,
  type VerticalOverrides,
} from "@trendbridge/shared";
import type { FastifyInstance } from "fastify";

export interface LoadedVertical {
  key: string;
  base: VerticalConfig;
  overrides: VerticalOverrides;
  effective: VerticalConfig;
}

/** Shipped defaults + your saved overrides. Unknown or invalid stored overrides are ignored, never trusted. */
export async function loadVerticals(app: Pick<FastifyInstance, "db">): Promise<LoadedVertical[]> {
  const rows = await app.db
    .select({ key: verticalsTable.key, overrides: verticalsTable.overrides })
    .from(verticalsTable);
  const by = new Map(rows.map((r) => [r.key, r.overrides]));
  return VERTICALS.map((base) => {
    const parsed = verticalOverridesSchema.safeParse(by.get(base.key) ?? {});
    const overrides = parsed.success ? parsed.data : {};
    return { key: base.key, base, overrides, effective: effectiveVertical(base, overrides) };
  });
}

export async function loadVertical(
  app: Pick<FastifyInstance, "db">,
  key: string,
): Promise<LoadedVertical | null> {
  if (!VERTICAL_BY_KEY[key]) return null;
  return (await loadVerticals(app)).find((v) => v.key === key) ?? null;
}
