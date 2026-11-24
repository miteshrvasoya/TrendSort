import { z } from "zod";

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export type LoginInput = z.infer<typeof loginSchema>;

export const markSeenSchema = z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) });

export const confidenceLevel = z.enum(["high", "medium", "low", "sample"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevel>;

export function confidenceFromScore(score: number, isSample = false): ConfidenceLevel {
  if (isSample) return "sample";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export const adoptionStage = z.enum([
  "not_yet_visible",
  "early_signal",
  "emerging",
  "growing",
  "mainstream",
  "saturated",
]);
export type AdoptionStage = z.infer<typeof adoptionStage>;
