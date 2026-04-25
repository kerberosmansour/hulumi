// hardenedVerdict — TS mirror of TLA+ HardenedVerdict.
//
// Authoritative spec: docs/TLAdocs/hulumi/HulumiDrift.tla in the
// upstream planning corpus, verified per HulumiDrift-verified.md.
// Trace table walked row-by-row in tests/verdict-matrix.feature.test.ts.
//
// Keep in lockstep with TLA+. Any change here needs a paired TLA+ edit
// + re-verification + the verified_at marker bumped — otherwise the
// tla-alignment.test.ts meta-test fails.

import type { DriftSource, Confidence, VerdictSnapshot } from "./types";

export interface VerdictResult {
  source: DriftSource;
  confidence: Confidence;
}

/**
 * The 5-row matrix from HulumiDrift.trace.md:
 *
 *   1. !mutated                                                 → None / none
 *   2. mutated && eventDelivered                                → ConsoleBreakGlass / high
 *   3. mutated && !eventDelivered && eventInTransit             → Unknown / low (probe pending)
 *   4. mutated && !eventDelivered && !eventInTransit
 *      && providerDrift                                          → ProviderApiChurn / medium (NEVER high)
 *   5. mutated && !eventDelivered && !eventInTransit
 *      && !providerDrift                                         → Unknown / low
 */
export function hardenedVerdict(snapshot: VerdictSnapshot): VerdictResult {
  if (!snapshot.mutated) {
    return { source: "None", confidence: "none" };
  }
  if (snapshot.eventDelivered) {
    return { source: "ConsoleBreakGlass", confidence: "high" };
  }
  if (snapshot.eventInTransit) {
    return { source: "Unknown", confidence: "low" };
  }
  if (snapshot.providerDrift) {
    // TLA+-proven UPPER BOUND: ProviderApiChurn never reaches `high` in any
    // reachable state (SafetyRealistic invariant). The classifier MUST cap
    // at `medium`.
    return { source: "ProviderApiChurn", confidence: "medium" };
  }
  return { source: "Unknown", confidence: "low" };
}
