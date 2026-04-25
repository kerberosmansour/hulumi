// Vendored copy of the verdict-matrix table from
// docs/TLAdocs/hulumi/HulumiDrift.trace.md (upstream planning corpus).
// The upstream file is the authoritative source. Any TLA+ trace edit
// MUST be reflected here AND HulumiDrift-verified.md's `verified_at`
// timestamp re-stamped — otherwise tests/tla-alignment.test.ts fails.
//
// 5 rows, in TLA+ trace order. Field semantics mirror VerdictSnapshot
// in src/types.ts.

import type { Confidence, DriftSource, VerdictSnapshot } from "../../src/types";

export interface TraceRow {
  id: number;
  description: string;
  snapshot: VerdictSnapshot;
  expected: { source: DriftSource; confidence: Confidence };
}

export const TRACE_MATRIX: readonly TraceRow[] = [
  {
    id: 1,
    description: "clean — !mutated",
    snapshot: {
      mutated: false,
      eventInTransit: false,
      eventDelivered: false,
      providerDrift: false,
    },
    expected: { source: "None", confidence: "none" },
  },
  {
    id: 2,
    description: "mutated && eventDelivered → ConsoleBreakGlass / high",
    snapshot: { mutated: true, eventInTransit: false, eventDelivered: true, providerDrift: false },
    expected: { source: "ConsoleBreakGlass", confidence: "high" },
  },
  {
    id: 3,
    description: "mutated && eventInTransit, !eventDelivered → Unknown / low (probe pending)",
    snapshot: { mutated: true, eventInTransit: true, eventDelivered: false, providerDrift: false },
    expected: { source: "Unknown", confidence: "low" },
  },
  {
    id: 4,
    description:
      "mutated, no event in transit, providerDrift → ProviderApiChurn / medium (NEVER high)",
    snapshot: { mutated: true, eventInTransit: false, eventDelivered: false, providerDrift: true },
    expected: { source: "ProviderApiChurn", confidence: "medium" },
  },
  {
    id: 5,
    description: "mutated, no event, no providerDrift → Unknown / low",
    snapshot: { mutated: true, eventInTransit: false, eventDelivered: false, providerDrift: false },
    expected: { source: "Unknown", confidence: "low" },
  },
] as const;
