import { users, type Db } from "@trendbridge/db";
import {
  COMPONENT_KEYS,
  DEFAULT_WEIGHTS,
  computeOpportunity,
  normaliseWeights,
  type Components,
  type Weights,
} from "@trendbridge/shared";
import { eq } from "drizzle-orm";

export async function userWeights(db: Db, userId: string): Promise<Weights> {
  const [u] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
  const w = (u?.settings as { weights?: Partial<Weights> } | null)?.weights;
  return w ? normaliseWeights(w) : { ...DEFAULT_WEIGHTS };
}

export function isCustom(w: Weights): boolean {
  return COMPONENT_KEYS.some((k) => Math.abs(w[k] - DEFAULT_WEIGHTS[k]) > 1e-6);
}

/** Re-evaluates opportunity from stored components with the viewer's weights (cheap, no recompute of trend maths). */
export function opportunityFor(inputs: unknown, weights: Weights) {
  const comps = (inputs as { components?: Components } | null)?.components;
  if (!comps) return null;
  return computeOpportunity(comps, weights);
}
