import {
  COMPONENT_KEYS,
  DEFAULT_WEIGHTS,
  computeOpportunity,
  normaliseWeights,
  type AlertSnapshot,
  type Components,
  type Weights,
} from "@trendbridge/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { users } from "../schema";

export async function weightsFor(db: Db, userId: string): Promise<Weights> {
  const [u] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
  const w = (u?.settings as { weights?: Partial<Weights> } | null)?.weights;
  return w ? normaliseWeights(w) : { ...DEFAULT_WEIGHTS };
}

interface ScoreRowLike {
  inputs: unknown;
  adoptionStage: string | null;
}

/** Opportunity under the user's weights, India's own momentum and the stage, from one stored score row. */
export function snapshotOf(row: ScoreRowLike, weights: Weights): AlertSnapshot {
  const inputs = row.inputs as {
    components?: Components;
    momentumDetail?: Record<string, { momentum: number | null }>;
  } | null;
  const comps = inputs?.components;
  const opp =
    comps && COMPONENT_KEYS.some((k) => comps[k] != null)
      ? computeOpportunity(comps, weights).score
      : null;
  return {
    opportunity: opp,
    indiaMomentum: inputs?.momentumDetail?.IN?.momentum ?? null,
    stage: row.adoptionStage,
  };
}
