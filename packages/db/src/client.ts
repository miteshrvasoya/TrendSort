import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
export type Db = ReturnType<typeof createDb>["db"];
