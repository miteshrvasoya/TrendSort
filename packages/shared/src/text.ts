/** Lexical helpers shared by workers (signal matching) and API (import matching). */
const STOP = new Set([
  "the",
  "a",
  "an",
  "for",
  "and",
  "of",
  "with",
  "to",
  "in",
  "on",
  "by",
  "pack",
  "set",
  "new",
  "best",
  "2024",
  "2025",
  "2026",
  "pcs",
  "piece",
  "pieces",
  "count",
  "inch",
  "ml",
  "oz",
]);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);

/** Lowercase tokens with stopwords, numbers-only tokens and trivial plurals removed. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t))
    .map((t) => t.replace(/iz(e|ed|es|ing|ation)$/, "is$1")) // US/UK spelling
    .map((t) => (t.length > 3 && t.endsWith("s") && !/(ss|is|us)$/.test(t) ? t.slice(0, -1) : t));
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a),
    B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** True when every token of `term` occurs in `text` (used for news/product -> tracked keyword matching). */
export function containsTerm(text: string, term: string): boolean {
  const t = new Set(tokens(text));
  const need = tokens(term);
  return need.length > 0 && need.every((x) => t.has(x));
}
