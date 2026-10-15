import { describe, expect, it } from "vitest";

import { matchSuppression, type Suppression } from "../src/aws/suppressions";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const URN = "urn:pulumi:prod::platform::aws:s3/bucket:Bucket::legacy";

function entry(overrides: Record<string, unknown> = {}): Suppression {
  return {
    ruleId: "HULUMI-H1",
    reason: "Migration tracked in SEC-123",
    urnScope: URN,
    expiresAt: "2026-12-31",
    ...overrides,
  } as Suppression;
}

describe("policy suppression integrity", () => {
  it.each([null, "HULUMI-H1", 1, []])("rejects malformed non-record input %#", (value) => {
    expect(matchSuppression("HULUMI-H1", URN, [value] as unknown as Suppression[], NOW)).toEqual({
      suppressed: false,
    });
  });

  it.each([
    ["missing", { ruleId: undefined }],
    ["empty", { ruleId: "" }],
    ["whitespace", { ruleId: "   " }],
  ])("rejects a %s rule ID", (_label, overrides) => {
    expect(matchSuppression("HULUMI-H1", URN, [entry(overrides)], NOW)).toEqual({
      suppressed: false,
    });
  });

  it.each([
    ["missing", { reason: undefined }],
    ["empty", { reason: "" }],
    ["whitespace", { reason: "   " }],
  ])("rejects a %s reason", (_label, overrides) => {
    expect(matchSuppression("HULUMI-H1", URN, [entry(overrides)], NOW)).toEqual({
      suppressed: false,
    });
  });

  it.each([
    ["missing", { urnScope: undefined }],
    ["empty", { urnScope: "" }],
    ["whitespace", { urnScope: "   " }],
    ["global", { urnScope: "*" }],
    ["empty URN", { urnScope: "urn:" }],
    ["non-URN prefix", { urnScope: "legacy-*" }],
    ["internal wildcard", { urnScope: "urn:pulumi:*::aws:s3/bucket:Bucket::legacy" }],
    ["question mark", { urnScope: `${URN}?` }],
  ])("rejects a %s scope", (_label, overrides) => {
    expect(matchSuppression("HULUMI-H1", URN, [entry(overrides)], NOW)).toEqual({
      suppressed: false,
    });
  });

  it.each([
    ["missing", { expiresAt: undefined }],
    ["empty", { expiresAt: "" }],
    ["invalid", { expiresAt: "not-a-date" }],
    ["invalid calendar date", { expiresAt: "2026-02-31" }],
    ["offset timestamp", { expiresAt: "2026-12-31T01:00:00+01:00" }],
    ["lowercase UTC", { expiresAt: "2026-12-31T00:00:00z" }],
    ["excess precision", { expiresAt: "2026-12-31T00:00:00.0000Z" }],
    ["expired date", { expiresAt: "2026-10-15" }],
    ["expired timestamp", { expiresAt: "2026-10-15T11:59:59Z" }],
    ["current instant", { expiresAt: "2026-10-15T12:00:00Z" }],
  ])("rejects a %s expiry", (_label, overrides) => {
    expect(matchSuppression("HULUMI-H1", URN, [entry(overrides)], NOW)).toEqual({
      suppressed: false,
    });
  });

  it("rejects mismatched rules and resource scopes", () => {
    expect(matchSuppression("HULUMI-H2", URN, [entry()], NOW).suppressed).toBe(false);
    expect(matchSuppression("HULUMI-H1", `${URN}-other`, [entry()], NOW).suppressed).toBe(false);
  });

  it("accepts an exact URN with a canonical future date", () => {
    expect(matchSuppression("HULUMI-H1", URN, [entry()], NOW)).toEqual({
      suppressed: true,
      reason: "Migration tracked in SEC-123",
    });
  });

  it.each(["2026-12-31T00:00:00Z", "2026-12-31T00:00:00.000Z"])(
    "accepts canonical future UTC timestamp %s",
    (expiresAt) => {
      expect(matchSuppression("HULUMI-H1", URN, [entry({ expiresAt })], NOW).suppressed).toBe(true);
    },
  );

  it("accepts a non-global trailing URN prefix only for matching resources", () => {
    const suppression = entry({
      urnScope: "urn:pulumi:prod::platform::aws:iam/role:Role::legacy-*",
    });
    expect(
      matchSuppression(
        "HULUMI-H1",
        "urn:pulumi:prod::platform::aws:iam/role:Role::legacy-api",
        [suppression],
        NOW,
      ).suppressed,
    ).toBe(true);
    expect(
      matchSuppression(
        "HULUMI-H1",
        "urn:pulumi:prod::platform::aws:iam/role:Role::modern-api",
        [suppression],
        NOW,
      ).suppressed,
    ).toBe(false);
  });

  it("requires the exact stack scope for stack-level rules", () => {
    const stack = entry({ urnScope: "stack" });
    expect(matchSuppression("HULUMI-H1", "stack", [stack], NOW).suppressed).toBe(true);
    expect(matchSuppression("HULUMI-H1", URN, [stack], NOW).suppressed).toBe(false);
    expect(matchSuppression("HULUMI-H1", "stack", [entry({ urnScope: URN })], NOW).suppressed).toBe(
      false,
    );
  });

  it("fails closed when the evaluation clock is invalid", () => {
    expect(matchSuppression("HULUMI-H1", URN, [entry()], new Date(Number.NaN))).toEqual({
      suppressed: false,
    });
  });
});
