/** Hosts we may fetch from; connectors must still check robots.txt at runtime. */
export function hostOf(url: string): string {
  return new URL(url).host.toLowerCase();
}
