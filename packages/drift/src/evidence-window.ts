import type { EvidenceWindow } from "./types";

export const DEFAULT_EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

export class InvalidEvidenceWindowError extends Error {
  constructor(message: string) {
    super(`Invalid evidence window: ${message}`);
    this.name = "InvalidEvidenceWindowError";
  }
}

/**
 * Build the default inclusive evidence interval from one captured clock
 * reading. `after` is the chronological lower bound; `before` is the upper.
 */
export function defaultEvidenceWindow(nowMs: number = Date.now()): EvidenceWindow {
  if (!Number.isFinite(nowMs)) {
    throw new InvalidEvidenceWindowError("the current time must be finite");
  }
  const before = new Date(nowMs);
  const after = new Date(nowMs - DEFAULT_EVIDENCE_WINDOW_MS);
  if (Number.isNaN(before.getTime()) || Number.isNaN(after.getTime())) {
    throw new InvalidEvidenceWindowError("the current time is outside the supported date range");
  }
  return {
    after: after.toISOString(),
    before: before.toISOString(),
  };
}

/** Validate an inclusive interval without rewriting the caller's timestamps. */
export function validateEvidenceWindow(window: EvidenceWindow): EvidenceWindow {
  if (window === null || typeof window !== "object") {
    throw new InvalidEvidenceWindowError("after and before timestamps are required");
  }
  if (typeof window.after !== "string" || !isFiniteTimestamp(window.after)) {
    throw new InvalidEvidenceWindowError("after must be a valid timestamp");
  }
  if (typeof window.before !== "string" || !isFiniteTimestamp(window.before)) {
    throw new InvalidEvidenceWindowError("before must be a valid timestamp");
  }
  if (Date.parse(window.after) > Date.parse(window.before)) {
    throw new InvalidEvidenceWindowError("after must be earlier than or equal to before");
  }
  return window;
}

export function resolveEvidenceWindow(window?: EvidenceWindow): EvidenceWindow {
  return window === undefined ? defaultEvidenceWindow() : validateEvidenceWindow(window);
}

function isFiniteTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
