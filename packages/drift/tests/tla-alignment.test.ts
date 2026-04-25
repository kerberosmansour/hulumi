// Meta-test — verifies that src/verdict.ts cites the TLA+ spec by
// name in its top-of-file documentation. If a future maintainer
// rewrites verdict.ts and forgets the TLA+ reference, this test fails
// and demands re-syncing the trace + verified-design.
//
// The upstream verified-design lives in the planning corpus; we don't
// import its `verified_at` timestamp here because the corpus is a
// separate repo. This test catches the most-common drift signal
// (citation removed); deeper alignment is reviewed on every PR
// touching verdict.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DRIFT_SOURCES } from "../src/types";

describe("TLA+ alignment meta-test", () => {
  const verdictSrc = readFileSync(resolve(__dirname, "../src/verdict.ts"), "utf8");

  it("verdict.ts cites HulumiDrift.tla by name", () => {
    expect(verdictSrc).toMatch(/HulumiDrift\.tla/);
  });

  it("verdict.ts mentions HulumiDrift-verified.md (verified-design source)", () => {
    expect(verdictSrc).toMatch(/HulumiDrift-verified\.md/);
  });

  it("DriftSource enum values exactly match the TLA+ Source set (vendored matrix)", () => {
    // The upstream TLA+ spec defines:
    //   Source == {"None", "ProviderApiChurn", "ConsoleBreakGlass",
    //              "GenuineIacDrift", "Mixed", "Unknown"}
    expect(DRIFT_SOURCES).toEqual([
      "None",
      "ProviderApiChurn",
      "ConsoleBreakGlass",
      "GenuineIacDrift",
      "Mixed",
      "Unknown",
    ]);
  });
});
