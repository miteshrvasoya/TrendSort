import { trendEntities, trackedKeywords, type Db } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import { containsTerm, jaccard, slugify, tokens } from "@trendbridge/shared";

export { containsTerm, jaccard, slugify, tokens };

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
