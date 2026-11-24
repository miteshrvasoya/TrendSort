import { describe, expect, it } from "vitest";
import { fmtScore, STAGE_LABEL } from "./utils";

describe("utils", () => {
  it("formats scores", () => {
    expect(fmtScore(null)).toBe("–");
    expect(fmtScore(72.6)).toBe("73");
  });
  it("labels every adoption stage", () => {
    expect(Object.keys(STAGE_LABEL)).toHaveLength(6);
  });
});
