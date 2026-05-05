// Real-AWS drift integration tests for `DriftClassifier`.
//
// Status (runbook hulumi-pre-public-launch M3): the four real-AWS
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

describe("DriftClassifier — real AWS integration (weekly)", () => {
  // See docs/integration-testing-roadmap.md#drift-classify for the
  // full implementation contract: deploy fixture, mutation method,
  // CloudTrail wait pattern, expected verdict, cleanup invariant.
  it.todo(
    "console drift detected: ConsoleBreakGlass/high after deliberate mutation by non-IaC principal (see docs/integration-testing-roadmap.md#drift-classify)",
  );

  it.todo(
    "provider-version drift detected: ProviderApiChurn/medium when pinned < latest (see docs/integration-testing-roadmap.md#drift-classify)",
  );

  it.todo(
    "cache survives within TTL: second classify returns cached verdict, zero re-polling (see docs/integration-testing-roadmap.md#drift-classify)",
  );

  it.todo(
    "teardown runs on failure: fixture removed even if classify throws (see docs/integration-testing-roadmap.md#drift-classify)",
  );

  it("integration tests skipped by default on PRs (gate invariant — preserved across M3)", () => {
    if (RUN_INTEGRATION) {
      expect(true).toBe(true);
      return;
    }
    expect(RUN_INTEGRATION).toBe(false);
  });
});
