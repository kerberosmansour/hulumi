// CloudTrailAdapter — calls CloudTrail LookupEvents scoped to a
// resource ARN + window, then filters event principals against the
// Hulumi-tagged IaC role list.
//
// E4 (namespace rejection): the tag filter requires the FULL
// `hulumi:` namespace prefix. A bare `iac-role=true` tag is NOT
// accepted as proof-of-IaC; the event flows through as a console
// mutation. The bare-tag rejection is enforced in
// shouldFilterPrincipal() and exercised by
// tests/namespace-rejection.test.ts.

import type { AdapterSignal, DriftAdapter } from "../types";

export interface CloudTrailEvent {
  EventTime: Date;
  EventName: string;
  Username?: string;
  CloudTrailEvent?: string;
  Resources?: Array<{ ResourceType?: string; ResourceName?: string }>;
  /** Parsed userIdentity tags — populated by the adapter's tag-fetcher. */
  principalTags?: Record<string, string>;
}

export interface CloudTrailLookupArgs {
  resourceArn: string;
  before: string;
  after: string;
}

export interface CloudTrailLookupFn {
  (args: CloudTrailLookupArgs): Promise<CloudTrailEvent[]>;
}

export interface CloudTrailRetryOptions {
  attempts: number;
  backoffMs: number;
  maxElapsedMs?: number;
  wait?: (delayMs: number) => Promise<void>;
}

export interface CloudTrailAdapterArgs {
  lookup: CloudTrailLookupFn;
  retry?: CloudTrailRetryOptions;
}

/**
 * Returns true iff the principal carries the FULL Hulumi-namespaced
 * iac-role tag. Bare `iac-role` keys without the `hulumi:` prefix are
 * rejected (E4).
 */
export function shouldFilterPrincipal(principalTags: Record<string, string> | undefined): boolean {
  if (!principalTags) return false;
  return principalTags["hulumi:iac-role"] === "true";
}

export class CloudTrailAdapter implements DriftAdapter {
  constructor(private readonly args: CloudTrailAdapterArgs) {}

  name(): string {
    return "CloudTrail";
  }

  async available(): Promise<boolean> {
    return true;
  }

  async signal(
    _stack: string,
    resource: string,
    window?: { before: string; after: string },
  ): Promise<AdapterSignal> {
    const before = window?.before ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const after = window?.after ?? new Date().toISOString();
    let lookup: LookupWithRetryResult;
    try {
      lookup = await lookupWithRetry(
        this.args.lookup,
        { resourceArn: resource, before, after },
        this.args.retry,
      );
    } catch (err) {
      const failed = err instanceof LookupWithRetryError ? err : undefined;
      return {
        detected: false,
        ok: false,
        data: {
          error: safeErrorMessage(err),
          retryAttempts: failed?.attempts ?? 1,
          retryDelayMs: failed?.retryDelayMs ?? 0,
          retryExhausted: true,
        },
      };
    }
    const consoleEvents = lookup.events.filter((e) => !shouldFilterPrincipal(e.principalTags));
    return {
      detected: consoleEvents.length > 0,
      ok: true,
      data: {
        consoleEvents: consoleEvents.map((e) => ({
          eventName: e.EventName,
          eventTime: e.EventTime.toISOString(),
          username: e.Username ?? "(unknown)",
        })),
        filteredCount: lookup.events.length - consoleEvents.length,
        retryAttempts: lookup.attempts,
        retryDelayMs: lookup.retryDelayMs,
      },
    };
  }
}

interface LookupWithRetryResult {
  events: CloudTrailEvent[];
  attempts: number;
  retryDelayMs: number;
}

class LookupWithRetryError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly retryDelayMs: number,
  ) {
    super(message);
    this.name = "LookupWithRetryError";
  }
}

async function lookupWithRetry(
  lookup: CloudTrailLookupFn,
  args: CloudTrailLookupArgs,
  retry: CloudTrailRetryOptions | undefined,
): Promise<LookupWithRetryResult> {
  const policy = normalizeRetry(retry);
  let attempts = 0;
  let retryDelayMs = 0;
  let nextDelayMs = policy.backoffMs;
  let lastError: unknown;

  while (attempts < policy.attempts) {
    attempts += 1;
    try {
      return {
        events: await lookup(args),
        attempts,
        retryDelayMs,
      };
    } catch (err) {
      lastError = err;
      if (attempts >= policy.attempts) break;
      if (policy.maxElapsedMs !== undefined && retryDelayMs + nextDelayMs > policy.maxElapsedMs)
        break;
      retryDelayMs += nextDelayMs;
      if (policy.wait !== undefined) await policy.wait(nextDelayMs);
      nextDelayMs = Math.min(Number.MAX_SAFE_INTEGER, nextDelayMs * 2);
    }
  }

  throw new LookupWithRetryError(safeErrorMessage(lastError), attempts, retryDelayMs);
}

function normalizeRetry(
  retry: CloudTrailRetryOptions | undefined,
): Required<Pick<CloudTrailRetryOptions, "attempts" | "backoffMs">> &
  Pick<CloudTrailRetryOptions, "maxElapsedMs" | "wait"> {
  if (retry === undefined) return { attempts: 1, backoffMs: 0 };
  const attempts = Number.isFinite(retry.attempts) ? Math.floor(retry.attempts) : 1;
  const backoffMs = Number.isFinite(retry.backoffMs) ? Math.max(0, retry.backoffMs) : 0;
  return {
    attempts: Math.max(1, attempts),
    backoffMs,
    ...(retry.maxElapsedMs !== undefined && Number.isFinite(retry.maxElapsedMs)
      ? { maxElapsedMs: Math.max(0, retry.maxElapsedMs) }
      : {}),
    ...(retry.wait !== undefined ? { wait: retry.wait } : {}),
  };
}

function safeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
