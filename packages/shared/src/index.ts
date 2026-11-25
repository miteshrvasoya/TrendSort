import festivalsJson from "./data/festivals.json";
import sourcesJson from "./data/sources.json";
import backtestJson from "./data/backtest.json";

export * from "./releases";
export * from "./tour";
export * from "./countries";
export * from "./verticals";
export * from "./schemas";
export * from "./url";
export * from "./scoring";
export { RUNNABLE_SOURCE_KEYS } from "./constants";
export * from "./gifts";
export * from "./economics";
export * from "./fit";
export * from "./reviews";
export * from "./text";
export * from "./subscription";
export * from "./workflow";
export * from "./report";

export const FESTIVALS = festivalsJson;
export const SOURCE_CATALOG = sourcesJson;

export const BACKTEST = backtestJson;
