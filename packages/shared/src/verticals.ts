import { z } from "zod";
import gifts from "./data/verticals/gifts.json";
import ro from "./data/verticals/ro.json";
import homeKitchen from "./data/verticals/home-kitchen.json";
import wellness from "./data/verticals/wellness.json";
import pet from "./data/verticals/pet.json";
import beauty from "./data/verticals/beauty.json";
import { COMPONENT_KEYS, type ComponentKey } from "./scoring";

/**
 * Verticals are DATA. Each file in data/verticals/*.json is validated here; adding a vertical means adding a file and
 * registering it below. Behaviour that reads the config: default news queries, scoring-weight preset, extra India-fit
 * notes, the feature-gap matrix (when `features` exist), the starter trend set, water-profile fit and the subscription tool.
 */
const weightKey = z.enum(COMPONENT_KEYS as unknown as [ComponentKey, ...ComponentKey[]]);
export const verticalConfigSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  description: z.string().min(10),
  keywords: z.array(z.string().min(2)).min(1),
  newsQueries: z.array(z.string().min(3)).min(1),
  presetWeights: z.record(weightKey, z.number().min(0).max(1)),
  indiaFitNotes: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        detail: z.string(),
        verifyWith: z.string(),
        status: z.enum(["check", "action"]),
      }),
    )
    .default([]),
  features: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        matchTerm: z.string(),
        indiaPresence: z.number().int().min(0).max(3),
        presenceNote: z.string(),
      }),
    )
    .optional(),
  starterTrends: z
    .array(
      z.object({
        name: z.string().min(3),
        keywords: z.array(z.string()).min(1).max(10),
        geos: z.array(z.string().length(2)).optional(),
        feature: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .optional(),
  waterProfiles: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        typicalSource: z.string(),
        recommended: z.string(),
        notes: z.string(),
        featureFit: z.record(z.enum(["good", "partial", "poor"])),
      }),
    )
    .optional(),
  tools: z.array(z.enum(["subscription"])).default([]),
});
export type VerticalConfig = z.infer<typeof verticalConfigSchema>;

/** User edits stored in the DB; merged over the shipped defaults. Only these fields are editable. */
export const verticalOverridesSchema = z.object({
  keywords: z.array(z.string().min(2)).min(1).optional(),
  newsQueries: z.array(z.string().min(3)).min(1).optional(),
  presetWeights: z.record(weightKey, z.number().min(0).max(1)).optional(),
  featurePresence: z.record(z.number().int().min(0).max(3)).optional(),
});
export type VerticalOverrides = z.infer<typeof verticalOverridesSchema>;

export const VERTICALS: VerticalConfig[] = [gifts, ro, homeKitchen, wellness, pet, beauty].map(
  (c) => verticalConfigSchema.parse(c),
);
export const VERTICAL_BY_KEY = Object.fromEntries(VERTICALS.map((v) => [v.key, v])) as Record<
  string,
  VerticalConfig
>;

/** Defaults with the user's overrides applied (feature presence overrides update `indiaPresence`). */
export function effectiveVertical(
  base: VerticalConfig,
  o: VerticalOverrides | null | undefined,
): VerticalConfig {
  if (!o) return base;
  return {
    ...base,
    keywords: o.keywords ?? base.keywords,
    newsQueries: o.newsQueries ?? base.newsQueries,
    presetWeights: o.presetWeights ?? base.presetWeights,
    features: base.features?.map((f) => ({
      ...f,
      indiaPresence: o.featurePresence?.[f.key] ?? f.indiaPresence,
    })),
  };
}

/** Default news queries across all verticals, de-duplicated, for when no keywords are tracked yet. */
export function allNewsQueries(configs: VerticalConfig[]): string[] {
  return [...new Set(configs.flatMap((c) => c.newsQueries))];
}

export const PRESENCE_LABEL = [
  "None in India",
  "Rare in India",
  "Some brands in India",
  "Widespread in India",
] as const;

/**
 * Feature gap: how strongly the feature is rising abroad x how little India already has.
 * gap = foreign momentum blend x (3 - presence) / 3. null when the trend is unscored.
 */
export function featureGap(foreignMomentum: number | null, presence: number): number | null {
  if (foreignMomentum == null) return null;
  return Math.round(foreignMomentum * ((3 - Math.min(3, Math.max(0, presence))) / 3) * 10) / 10;
}
