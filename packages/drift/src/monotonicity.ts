// Monotonicity guard — once a verdict reaches `high` confidence, it is
// not silently demoted. Per HulumiDrift-verified.md §5 SafetyRealistic +
// Monotonicity property. The classifier consults this guard before
// writing every cache entry.

import type { Confidence, DriftVerdict } from "./types";

const CONFIDENCE_RANK: Record<Confidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export interface MonotonicityResult {
  allowWrite: boolean;
  reason: string;
}

/**
 * Decide whether `incoming` may overwrite `existing` in the cache.
 *
 * - `existing` undefined: any write allowed.
 * - `incoming.confidence` >= `existing.confidence`: allowed.
 * - Otherwise: refused. The caller may invalidate-then-write via
 *   `invalidate()` if a CacheInvalidate event is in scope, but the
 *   default write path is silent-demotion-refused.
 */
export function checkMonotonicity(
  existing: DriftVerdict | undefined,
  incoming: DriftVerdict,
): MonotonicityResult {
  if (!existing) return { allowWrite: true, reason: "no prior cache entry" };
  const prior = CONFIDENCE_RANK[existing.confidence];
  const next = CONFIDENCE_RANK[incoming.confidence];
  if (next >= prior) {
    return {
      allowWrite: true,
      reason: `confidence non-decreasing (${existing.confidence} -> ${incoming.confidence})`,
    };
  }
  return {
    allowWrite: false,
    reason: `monotonicity violation: refusing to demote ${existing.confidence} -> ${incoming.confidence} for ${existing.resource} (existing=${existing.source}, incoming=${incoming.source}). Use CacheInvalidate to clear before re-writing.`,
  };
}
