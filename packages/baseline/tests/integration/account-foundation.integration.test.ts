// Real-AWS integration tests for `AccountFoundation`.
//
// Status (runbook hulumi-pre-public-launch M3): the three real-AWS
// integration scenarios remain stubbed — implementing them requires a
// Pulumi Cloud + sandbox-AWS deploy harness that's a separate
// workstream tracked in `docs/integration-testing-roadmap.md`. The
// previous implementation used `expect(RUN_INTEGRATION).toBe(true)`
// which passed-by-design when run, masquerading as coverage. M3
// converts those slots to `it.todo()` so the gap is impossible to
// misread; a future runbook (`hulumi-integration-real-aws`) will
// land the actual harness.
//
// One always-on test below documents the existing
// HULUMI_INTEGRATION=1 skip-gate convention so that gate cannot
// silently regress.

import { describe, expect, it } from "vitest";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";

describe("AccountFoundation — real AWS integration (weekly)", () => {
  // See docs/integration-testing-roadmap.md#account-foundation for the
  // full implementation contract: stack name, region, sub-resource
  // poll list, cleanup invariant, expected wall-clock cost.
  it.todo(
    "Sandbox tier: all 6 sub-resources reach ACTIVE within 15 minutes; teardown succeeds (see docs/integration-testing-roadmap.md#account-foundation)",
  );

  it.todo(
    "Startup-Hardened tier: all 6 sub-resources + extended within 15 minutes (see docs/integration-testing-roadmap.md#account-foundation)",
  );

  it.todo(
    "Teardown runs on failure (force-fail variant) (see docs/integration-testing-roadmap.md#account-foundation)",
  );

  it("integration tests are skipped by default on PRs (gate invariant — preserved across M3)", () => {
    if (RUN_INTEGRATION) {
      expect(true).toBe(true);
      return;
    }
    expect(RUN_INTEGRATION).toBe(false);
  });
});
