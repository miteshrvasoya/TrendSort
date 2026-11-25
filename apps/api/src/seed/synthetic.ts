/** Deterministic synthetic weekly series. ALWAYS stored with is_sample = true. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Profile = "rising" | "steady" | "spike" | "seasonal";

/** Foreign curve for `weeks` weeks; value 0-100. */
export function foreignCurve(
  profile: Profile,
  weeks: number,
  base: number,
  rnd: () => number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < weeks; i++) {
    const x = i / (weeks - 1);
    let v: number;
    switch (profile) {
      case "rising":
        v = base * 0.35 + base * 1.3 * x ** 2;
        break;
      case "steady":
        v = base * 0.9 + 8 * Math.sin(x * 6);
        break;
      case "spike":
        v = base * 0.3 + base * 1.8 * Math.exp(-((x - 0.72) ** 2) / 0.012);
        break;
      case "seasonal":
        v =
          base * 0.7 +
          base * 0.6 * Math.max(0, Math.sin(((i % 52) / 52) * 2 * Math.PI - 1.2)) +
          10 * x;
        break;
    }
    out.push(v + (rnd() - 0.5) * 6);
  }
  const max = Math.max(...out, 1);
  return out.map((v) => Math.round(Math.max(0, Math.min(100, (v / max) * 100)) * 10) / 10);
}

/**
 * India = lagged copy of the foreign curve, scaled so that at the END of the series it sits at `targetRatio`
 * of the foreign peak (so the generator and the stage bands in stageFromRatio agree).
 */
export function indiaCurve(
  foreign: number[],
  lagWeeks: number,
  targetRatio: number,
  rnd: () => number,
): number[] {
  const n = foreign.length;
  const peak = Math.max(...foreign, 1);
  const srcEnd = Math.max(foreign[Math.max(0, n - 1 - lagWeeks)] ?? 1, 1);
  const k = (targetRatio * peak) / srcEnd;
  return foreign.map((_, i) => {
    const src = foreign[i - lagWeeks];
    const v =
      src === undefined
        ? 0.3 + rnd() * 0.5
        : src * k + (rnd() - 0.5) * Math.max(1, targetRatio * peak * 0.08);
    return Math.round(Math.max(0, Math.min(130, v)) * 10) / 10;
  });
}

export function weekStarts(weeks: number, end = new Date()): string[] {
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  e.setUTCDate(e.getUTCDate() - ((e.getUTCDay() + 6) % 7)); // Monday
  const out: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(e);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** India level as a share of the foreign curve, set to the middle of each adoption-stage band (see stageFromRatio). */
export const STAGE_DAMP: Record<string, number> = {
  not_yet_visible: 0.01,
  early_signal: 0.05,
  emerging: 0.15,
  growing: 0.4,
  mainstream: 0.8,
  saturated: 1.15,
};
