import { sources, type Db } from "@trendbridge/db";
import { eq } from "drizzle-orm";

export async function sourceIdOf(db: Db, key: string): Promise<number> {
  const [s] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, key));
  if (!s) throw new Error(`source ${key} not in registry; run db:seed`);
  return s.id;
}
