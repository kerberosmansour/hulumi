// Suppression pattern per interfaces.md §2. A suppression silences one rule
// for one scope with a required reason and (when severity ≥ high) a
// required expiry. The evaluator is called by policy rules before reporting.

export interface Suppression {
  ruleId: string;
  reason: string;
  /** Glob-like URN prefix the suppression applies to. `*` matches any suffix. */
  urnScope?: string;
  expiresAt?: string;
}

export interface SuppressionMatch {
  suppressed: boolean;
  reason?: string;
}

function urnMatches(scope: string, urn: string): boolean {
  if (scope === urn) return true;
  if (scope.endsWith("*")) {
    return urn.startsWith(scope.slice(0, -1));
  }
  return false;
}

export function matchSuppression(
  ruleId: string,
  urn: string,
  suppressions: readonly Suppression[] | undefined,
  now: Date = new Date(),
): SuppressionMatch {
  if (!suppressions || suppressions.length === 0) return { suppressed: false };
  for (const s of suppressions) {
    if (s.ruleId !== ruleId) continue;
    if (s.urnScope !== undefined && !urnMatches(s.urnScope, urn)) continue;
    if (s.expiresAt !== undefined) {
      const expiry = new Date(s.expiresAt);
      if (Number.isFinite(expiry.getTime()) && expiry.getTime() < now.getTime()) {
        continue;
      }
    }
    return { suppressed: true, ...(s.reason ? { reason: s.reason } : {}) };
  }
  return { suppressed: false };
}
