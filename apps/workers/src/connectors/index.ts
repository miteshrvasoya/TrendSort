import type { Connector } from "../framework/types";
import { ecbFx } from "./ecbFx";

/** Register new connectors here. See docs/CONNECTORS.md. */
export const CONNECTORS: Record<string, Connector<never, unknown>> = {
  [ecbFx.key]: ecbFx as unknown as Connector<never, unknown>,
};
