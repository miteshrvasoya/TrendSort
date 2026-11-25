import type { Connector } from "../framework/types";
import { amazonBestsellers } from "./amazonBestsellers";
import { ecbFx } from "./ecbFx";
import { googleNews } from "./googleNews";
import { googleTrends } from "./googleTrends";
import { googleTrendsRss } from "./googleTrendsRss";
import { tradePress } from "./tradePress";

/** Register new connectors here. See docs/CONNECTORS.md. */
const all = [
  ecbFx,
  googleTrends,
  googleTrendsRss,
  googleNews,
  tradePress,
  amazonBestsellers,
] as unknown as Connector[];
export const CONNECTORS: Record<string, Connector> = Object.fromEntries(all.map((c) => [c.key, c]));
