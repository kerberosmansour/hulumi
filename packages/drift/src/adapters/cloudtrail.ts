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

export interface CloudTrailAdapterArgs {
  lookup: CloudTrailLookupFn;
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
    let events: CloudTrailEvent[];
    try {
      events = await this.args.lookup({ resourceArn: resource, before, after });
    } catch (err) {
      return {
        detected: false,
        ok: false,
        data: { error: err instanceof Error ? err.message : String(err) },
      };
    }
    const consoleEvents = events.filter((e) => !shouldFilterPrincipal(e.principalTags));
    return {
      detected: consoleEvents.length > 0,
      ok: true,
      data: {
        consoleEvents: consoleEvents.map((e) => ({
          eventName: e.EventName,
          eventTime: e.EventTime.toISOString(),
          username: e.Username ?? "(unknown)",
        })),
        filteredCount: events.length - consoleEvents.length,
      },
    };
  }
}
