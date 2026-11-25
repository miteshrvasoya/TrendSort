import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Loads the nearest `.env` (walking up from the working directory) into process.env.
 * Real environment variables win over file values. Safe to call more than once.
 */
export function loadEnv(start = process.cwd()): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 6; i++) {
    const file = join(dir, ".env");
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return file;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
