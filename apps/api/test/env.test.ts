import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "@trendbridge/db";
import { describe, expect, it } from "vitest";

describe("loadEnv", () => {
  it("finds the nearest .env walking up, without overriding real env vars", () => {
    const root = mkdtempSync(join(tmpdir(), "tb-env-"));
    mkdirSync(join(root, "a", "b"), { recursive: true });
    writeFileSync(join(root, ".env"), "TB_TEST_NEW=from-file\nTB_TEST_KEEP=from-file\n");
    process.env.TB_TEST_KEEP = "from-process";
    expect(loadEnv(join(root, "a", "b"))).toBe(join(root, ".env"));
    expect(process.env.TB_TEST_NEW).toBe("from-file");
    expect(process.env.TB_TEST_KEEP).toBe("from-process");
  });
  it("returns null when there is no .env", () => {
    expect(loadEnv(mkdtempSync(join(tmpdir(), "tb-noenv-")))).toBeNull();
  });
});
