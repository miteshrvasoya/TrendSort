import { createDb } from "@trendbridge/db";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { syncReleases } from "./releases-sync";
import { ensureAdmin } from "./seed/seed";

const config = loadConfig();
if (config.NODE_ENV === "production" && config.ADMIN_PASSWORD === "admin123") {
  console.warn("WARNING: using the sample admin password in production. Change ADMIN_PASSWORD.");
}
const { db } = createDb(config.DATABASE_URL);
await syncReleases(db);
await ensureAdmin(db, config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
const app = await buildApp({ db, config, logger: true });
await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
