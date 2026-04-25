import { describe, it, expect } from "vitest";
import { checkMonotonicity } from "../src/monotonicity";
import type { DriftVerdict } from "../src/types";

function v(source: DriftVerdict["source"], confidence: DriftVerdict["confidence"]): DriftVerdict {
  return { resource: "urn:r1", source, confidence, evidence: [] };
}

describe("monotonicity — high never silently demoted", () => {
  it("allows write when there is no prior cache entry", () => {
    const r = checkMonotonicity(undefined, v("Unknown", "low"));
    expect(r.allowWrite).toBe(true);
  });

  it("allows write when confidence is non-decreasing", () => {
    const r = checkMonotonicity(v("Unknown", "low"), v("ConsoleBreakGlass", "high"));
    expect(r.allowWrite).toBe(true);
  });

  it("refuses to demote ConsoleBreakGlass/high → Unknown/low", () => {
    const r = checkMonotonicity(v("ConsoleBreakGlass", "high"), v("Unknown", "low"));
    expect(r.allowWrite).toBe(false);
    expect(r.reason).toMatch(/monotonicity violation/);
    expect(r.reason).toMatch(/Use CacheInvalidate/);
  });

  it("refuses to demote ProviderApiChurn/medium → Unknown/low", () => {
    const r = checkMonotonicity(v("ProviderApiChurn", "medium"), v("Unknown", "low"));
    expect(r.allowWrite).toBe(false);
  });

  it("allows same-confidence overwrite (e.g. evidence refresh)", () => {
    const r = checkMonotonicity(v("ConsoleBreakGlass", "high"), v("ConsoleBreakGlass", "high"));
    expect(r.allowWrite).toBe(true);
  });
});
