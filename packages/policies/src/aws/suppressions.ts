// Suppression pattern per interfaces.md §2. A suppression silences one rule
// for one explicit scope with a required reason and expiry. The evaluator is
// called by policy rules before reporting and fails closed on malformed input.

export interface Suppression {
  ruleId: string;
  reason: string;
  /** Exact URN, `stack`, or a non-global URN prefix ending in one `*`. */
  urnScope: string;
  expiresAt: string;
}

export interface SuppressionMatch {
  suppressed: boolean;
  reason?: string;
}

function urnMatches(scope: string, urn: string): boolean {
  if (scope === "stack") return urn === "stack";
  if (!scope.startsWith("urn:") || scope.includes("?") || scope.trim() !== scope) return false;

  const wildcard = scope.indexOf("*");
  if (wildcard === -1) return scope.length > "urn:".length && scope === urn;
  if (wildcard !== scope.length - 1 || scope.indexOf("*", wildcard + 1) !== -1) return false;

  const prefix = scope.slice(0, -1);
  return prefix.length > "urn:".length && urn.startsWith(prefix);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function canonicalExpiryMillis(value: string): number | undefined {
  if (ISO_DATE.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return undefined;
    }
    return date.getTime();
  }

  if (!ISO_UTC_TIMESTAMP.test(value)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return date.toISOString() === canonical ? date.getTime() : undefined;
}

export function matchSuppression(
  ruleId: string,
  urn: string,
  suppressions: readonly Suppression[] | undefined,
  now: Date = new Date(),
): SuppressionMatch {
  if (!suppressions || suppressions.length === 0) return { suppressed: false };
  const nowMillis = now.getTime();
  if (!Number.isFinite(nowMillis)) return { suppressed: false };
  for (const raw of suppressions) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const s = raw as Partial<Suppression>;
    if (
      typeof s.ruleId !== "string" ||
      s.ruleId.trim().length === 0 ||
      s.ruleId !== ruleId ||
      typeof s.reason !== "string" ||
      s.reason.trim().length === 0 ||
      typeof s.urnScope !== "string" ||
      !urnMatches(s.urnScope, urn) ||
      typeof s.expiresAt !== "string"
    ) {
      continue;
    }

    const expiry = canonicalExpiryMillis(s.expiresAt);
    if (expiry === undefined || expiry <= nowMillis) continue;
    return { suppressed: true, reason: s.reason };
  }
  return { suppressed: false };
}
