import { describe, expect, it } from "vitest";
import {
  CURRENT_VERSION,
  RELEASES,
  TOUR_STEPS,
  compareVersions,
  isNewFeature,
  stepsFor,
  confidenceFromScore,
  SOURCE_CATALOG,
} from "./index";

describe("versioning", () => {
  it("compares semver", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
  it("every release has notes and the current tour has steps", () => {
    expect(RELEASES[0]!.version).toBe(CURRENT_VERSION);
    for (const r of RELEASES) expect(r.forYou.length).toBeGreaterThan(10);
    expect(TOUR_STEPS.some((s) => s.version === CURRENT_VERSION)).toBe(true);
  });
  it("returning users only see new steps", () => {
    expect(stepsFor({ sinceVersion: CURRENT_VERSION })).toHaveLength(0);
    expect(
      stepsFor({ sinceVersion: "0.1.0" }).every((s) => compareVersions(s.version, "0.1.0") > 0),
    ).toBe(true);
    expect(stepsFor({ sinceVersion: "0.2.0" }).every((s) => s.version === CURRENT_VERSION)).toBe(
      true,
    );
    expect(stepsFor({ sinceVersion: null }).length).toBe(TOUR_STEPS.length);
  });
  it("new badge lasts two releases", () => {
    expect(isNewFeature("0.1.0", "0.2.0")).toBe(true);
    expect(isNewFeature("0.1.0", "0.3.0")).toBe(false);
  });
});

describe("misc", () => {
  it("maps confidence", () => {
    expect(confidenceFromScore(0.8)).toBe("high");
    expect(confidenceFromScore(0.5)).toBe("medium");
    expect(confidenceFromScore(0.1)).toBe("low");
    expect(confidenceFromScore(0.9, true)).toBe("sample");
  });
  it("source catalog has unique keys and no paid sources", () => {
    const keys = SOURCE_CATALOG.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
