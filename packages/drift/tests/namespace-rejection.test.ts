// E4 — namespace rejection. shouldFilterPrincipal() requires the FULL
// `hulumi:iac-role=true` tag. A bare `iac-role=true` (no namespace)
// MUST NOT be accepted as proof-of-IaC; the event flows through as a
// console mutation.

import { describe, it, expect } from "vitest";
import { shouldFilterPrincipal, CloudTrailAdapter } from "../src/adapters/cloudtrail";
import type { CloudTrailEvent } from "../src/adapters/cloudtrail";

describe("namespace rejection — E4", () => {
  it("filters principals carrying hulumi:iac-role=true", () => {
    expect(shouldFilterPrincipal({ "hulumi:iac-role": "true" })).toBe(true);
  });

  it("does NOT filter bare iac-role=true (no namespace)", () => {
    expect(shouldFilterPrincipal({ "iac-role": "true" })).toBe(false);
  });

  it("does NOT filter when tags are absent", () => {
    expect(shouldFilterPrincipal(undefined)).toBe(false);
    expect(shouldFilterPrincipal({})).toBe(false);
  });

  it("does NOT filter wrong-namespace variants (acme:iac-role, hulumi:iac-role-tag, etc.)", () => {
    expect(shouldFilterPrincipal({ "acme:iac-role": "true" })).toBe(false);
    expect(shouldFilterPrincipal({ "hulumi:iac-role-tag": "true" })).toBe(false);
    expect(shouldFilterPrincipal({ "hulumi:iac": "true" })).toBe(false);
  });

  it("does NOT filter when value is anything other than literal 'true'", () => {
    expect(shouldFilterPrincipal({ "hulumi:iac-role": "TRUE" })).toBe(false);
    expect(shouldFilterPrincipal({ "hulumi:iac-role": "1" })).toBe(false);
    expect(shouldFilterPrincipal({ "hulumi:iac-role": "yes" })).toBe(false);
  });

  it("CloudTrailAdapter passes bare-tag events through; filters namespaced ones", async () => {
    const events: CloudTrailEvent[] = [
      {
        EventTime: new Date(),
        EventName: "PutBucketTagging",
        Username: "console-user-bare",
        principalTags: { "iac-role": "true" },
      },
      {
        EventTime: new Date(),
        EventName: "PutBucketTagging",
        Username: "iac-bot",
        principalTags: { "hulumi:iac-role": "true" },
      },
    ];
    const adapter = new CloudTrailAdapter({
      lookup: async () => events,
    });
    const result = await adapter.signal("stack", "arn:aws:s3:::test", {
      before: "2026-01-01T00:00:00Z",
      after: "2026-12-31T23:59:59Z",
    });
    expect(result.ok).toBe(true);
    expect(result.detected).toBe(true);
    const data = result.data as Record<string, unknown>;
    const consoleEvents = data.consoleEvents as Array<{ username: string }>;
    expect(consoleEvents).toHaveLength(1);
    expect(consoleEvents[0].username).toBe("console-user-bare");
    expect(data.filteredCount).toBe(1);
  });
});
