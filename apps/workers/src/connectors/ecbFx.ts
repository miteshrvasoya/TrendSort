import type { Connector } from "../framework/types";
import fixture from "../fixtures/ecb-fx.json";

interface Raw {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}
export interface FxRate {
  currency: string;
  inrPerUnit: number;
  date: string;
}

/**
 * ECB reference rates via Frankfurter (free, no key). Official API, so robots.txt is not applied.
 * Stored as raw signals; normalised to INR-per-unit.
 */
export const ecbFx: Connector<Raw, FxRate> = {
  key: "ecb_fx",
  name: "ECB exchange rates (Frankfurter)",
  rateLimit: { calls: 100, windowMs: 86_400_000 },
  costPerCall: 0,
  reliabilityScore: 0.95,
  termsNote: "Free, no key, open ECB data.",
  scraped: false,

  async fetch(ctx) {
    if (ctx.fixtureMode) return [fixture as Raw];
    const r = await ctx.http.json<Raw>(
      "https://api.frankfurter.dev/v1/latest?base=INR&symbols=USD,GBP,EUR,AED,JPY,KRW,CNY,AUD,SGD",
      { skipRobots: true },
    );
    return [r];
  },

  normalize(raw) {
    return raw.flatMap((r) =>
      Object.entries(r.rates)
        .filter(([, v]) => v > 0)
        .map(([currency, perInr]) => ({
          currency,
          inrPerUnit: Math.round((1 / perInr) * 1e4) / 1e4,
          date: r.date,
        })),
    );
  },

  async healthCheck(ctx) {
    try {
      const r = await ctx.http.get("https://api.frankfurter.dev/v1/latest?base=INR&symbols=USD", {
        skipRobots: true,
      });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  },
};
