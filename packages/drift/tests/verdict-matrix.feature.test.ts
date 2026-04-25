// Verdict-matrix feature — walks the 5-row table from
// HulumiDrift.trace.md (upstream planning corpus, vendored at
// tests/_utils/trace-matrix.ts) cell by cell. Each row is one Vitest
// test, plus a meta-row asserting the test count matches the trace
// row count (no silent row drift).

import { describe, it, expect } from "vitest";
import { hardenedVerdict } from "../src/verdict";
import { TRACE_MATRIX } from "./_utils/trace-matrix";

describe("verdict-matrix — TLA+ HardenedVerdict 5-row trace walk", () => {
  for (const row of TRACE_MATRIX) {
    it(`row ${row.id}: ${row.description}`, () => {
      const verdict = hardenedVerdict(row.snapshot);
      expect(verdict.source).toBe(row.expected.source);
      expect(verdict.confidence).toBe(row.expected.confidence);
    });
  }

  it("row_count_matches_trace_md — exactly 5 rows, no silent additions / removals", () => {
    expect(TRACE_MATRIX).toHaveLength(5);
    const ids = TRACE_MATRIX.map((r) => r.id);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("Row 4 — ProviderApiChurn never reaches high (TLA+ SafetyRealistic upper bound)", () => {
    // Even with mutated+providerDrift in any combination of probe state
    // EXCEPT eventDelivered, the verdict for ProviderApiChurn maxes at
    // medium. Brute-force the truth-table to be sure.
    for (const eventInTransit of [false, true]) {
      const v = hardenedVerdict({
        mutated: true,
        eventInTransit,
        eventDelivered: false,
        providerDrift: true,
      });
      if (v.source === "ProviderApiChurn") {
        expect(v.confidence).not.toBe("high");
      }
    }
  });
});
