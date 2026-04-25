// URN sanitization — treats Pulumi URNs as OPAQUE DATA, never as
// shell strings. The GitLogAdapter (the only adapter that touches a
// subprocess) goes through simple-git's argv-based API; URNs are
// passed as parameters, never interpolated into a command string.
// This file is the central guard so any adapter wishing to reference
// a URN runs it through validateUrn() first.
//
// Threat model: S3 (shell injection via crafted URN). A malicious or
// mistyped URN containing $(...) / `...` / pipe characters MUST never
// reach a subprocess as part of a shell-interpreted command line.

const SAFE_URN_PATTERN = /^[A-Za-z0-9:/$._\-+]+$/;

export class UnsafeUrnError extends Error {
  constructor(urn: string, reason: string) {
    super(`Refusing to use unsafe URN ${JSON.stringify(urn)}: ${reason}`);
    this.name = "UnsafeUrnError";
  }
}

/**
 * Validate that the URN contains only the character classes expected
 * for a Pulumi resource URN. Throws UnsafeUrnError if any
 * shell-metacharacter or whitespace is present.
 *
 * NOTE: this is defense-in-depth, not the primary guard. The primary
 * guard is that no Hulumi adapter passes URNs to a shell — simple-git
 * is argv-based, and the AWS SDK calls take typed parameters. This
 * function exists so a future drift-by-drift `child_process` slip-up
 * is rejected at the URN-handling boundary.
 */
export function validateUrn(urn: string): string {
  if (typeof urn !== "string") {
    throw new UnsafeUrnError(String(urn), "URN must be a string");
  }
  if (urn.length === 0) {
    throw new UnsafeUrnError(urn, "URN must be non-empty");
  }
  if (!SAFE_URN_PATTERN.test(urn)) {
    throw new UnsafeUrnError(
      urn,
      "URN contains characters outside the safe set [A-Za-z0-9:/$._-+]",
    );
  }
  return urn;
}

export function isSafeUrn(urn: string): boolean {
  try {
    validateUrn(urn);
    return true;
  } catch {
    return false;
  }
}
