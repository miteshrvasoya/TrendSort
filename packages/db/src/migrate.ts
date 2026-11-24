import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** Tiny SQL-file migrator: applies migrations/*.sql in order, once each. */
export async function migrate(url = process.env.DATABASE_URL) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const pool = new pg.Pool({ connectionString: url });
  await pool.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz default now())",
  );
  const done = new Set((await pool.query("select name from _migrations")).rows.map((r) => r.name));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sqlText = readFileSync(join(dir, f), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const stmt of sqlText.split("--> statement-breakpoint"))
        if (stmt.trim()) await client.query(stmt);
      await client.query("insert into _migrations(name) values ($1)", [f]);
      await client.query("commit");
      console.log("applied", f);
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
