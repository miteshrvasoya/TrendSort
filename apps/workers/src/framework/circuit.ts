/** Pure circuit-breaker decision logic over the last runs of a source. */
export interface CircuitConfig {
  failureThreshold: number;
  cooldownMs: number;
}
export const DEFAULT_CIRCUIT: CircuitConfig = { failureThreshold: 3, cooldownMs: 30 * 60_000 };

export function circuitState(
  recent: { status: string; at: number }[],
  now: number,
  cfg = DEFAULT_CIRCUIT,
): "closed" | "open" | "half_open" {
  // recent: newest first. Skipped runs don't count.
  const real = recent.filter((r) => r.status !== "skipped");
  let streak = 0;
  for (const r of real) {
    if (r.status === "error") streak++;
    else break;
  }
  if (streak < cfg.failureThreshold) return "closed";
  const lastAt = real[0]!.at;
  return now - lastAt >= cfg.cooldownMs ? "half_open" : "open";
}
