import { trendEntities, trackedKeywords, type Db } from "@trendbridge/db";
import { eq } from "drizzle-orm";

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

/** Short candidate trend phrase from a product title: drops brand-ish leading token and trailing spec noise. */
export function deriveTerm(title: string, maxTokens = 5): string {
  const head = title.split(/[,|(–—]| - /)[0] ?? title;
  const toks = tokens(head);
  return toks.slice(0, maxTokens).join(" ");
}

export interface EntityIndexRow {
  id: number;
  name: string;
  tokens: string[];
  terms: string[];
}

export async function loadEntityIndex(db: Db): Promise<EntityIndexRow[]> {
  const ents = await db
    .select({ id: trendEntities.id, name: trendEntities.name })
    .from(trendEntities)
    .where(eq(trendEntities.isSample, false)); // sample data never matches live signals
  const kws = await db.select().from(trackedKeywords);
  return ents.map((e) => ({
    id: e.id,
    name: e.name,
    tokens: tokens(e.name),
    terms: [e.name, ...kws.filter((k) => k.trendId === e.id).map((k) => k.term)],
  }));
}

/** Best tracked entity whose name/keyword is contained in the text. */
export function matchEntity(index: EntityIndexRow[], text: string): number | null {
  let best: { id: number; len: number } | null = null;
  for (const e of index) {
    for (const term of e.terms) {
      if (containsTerm(text, term)) {
        const len = tokens(term).length;
        if (!best || len > best.len) best = { id: e.id, len };
      }
    }
  }
  return best?.id ?? null;
}

/** Find an existing entity similar enough (Jaccard >= 0.6) or create a candidate. Returns the id and whether it was created. */
export async function findOrCreateCandidate(
  db: Db,
  index: EntityIndexRow[],
  term: string,
  meta: { sourceId?: number; confidence: number; verticals?: string[] },
): Promise<{ id: number; created: boolean } | null> {
  const toks = tokens(term);
  if (toks.length < 2) return null; // single words are too ambiguous to be a product trend
  const similar = index.find((e) => jaccard(e.tokens, toks) >= 0.6);
  if (similar) return { id: similar.id, created: false };
  const name = toks.join(" ");
  const [row] = await db
    .insert(trendEntities)
    .values({
      slug: slugify(name),
      name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
      status: "candidate",
      origin: "auto",
      verticalKeys: meta.verticals ?? [],
      sourceId: meta.sourceId,
      confidence: meta.confidence,
      isSample: false,
      description: "Auto-created candidate from live signals. Review before relying on it.",
    })
    .onConflictDoNothing()
    .returning({ id: trendEntities.id });
  if (!row) {
    const [ex] = await db
      .select({ id: trendEntities.id })
      .from(trendEntities)
      .where(eq(trendEntities.slug, slugify(name)));
    return ex ? { id: ex.id, created: false } : null;
  }
  index.push({ id: row.id, name, tokens: toks, terms: [name] });
  return { id: row.id, created: true };
}
