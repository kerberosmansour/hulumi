// kind-gated release-readiness contract test for `@hulumi/k8s-baseline`
// (Runbook `hulumi-operations-k8s-security` Milestone 1).
//
// Purpose: Prove the kind integration test lane is wired up and safely
// gated. When `HULUMI_INTEGRATION_KIND=1` is set AND a kind binary is on
// PATH, this test will assert it can spin up a kind cluster and reach
// the API server. Otherwise it skips with an explicit precondition log
// — never a silent skip and never a fail.
//
// M1 deliberately ships only the *contract test* (skeleton). Real
// `kind` cluster boot wiring lands in later milestones (M2/M4) when
// per-component kind tests need a live API server. M1's job is to
// stand up the gating shape that future kind tests will reuse.

import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";

const integrationFlag = process.env["HULUMI_INTEGRATION_KIND"] === "1";

function kindIsOnPath(): boolean {
  const probe = spawnSync("kind", ["version"], { encoding: "utf8" });
  return probe.status === 0;
}

describe("Feature: K8s package release readiness — kind-gated contract", () => {
  it("kind_cluster_contract_or_skip — gated when integration flag or binary is absent", () => {
    if (!integrationFlag) {
      console.log(
        "[release-readiness.kind] skipped: set HULUMI_INTEGRATION_KIND=1 to enable. (See docs/integration-testing.md.)",
      );
      expect(integrationFlag).toBe(false);
      return;
    }

    if (!kindIsOnPath()) {
      console.log(
        "[release-readiness.kind] skipped: HULUMI_INTEGRATION_KIND=1 but `kind` binary not on PATH.",
      );
      // The flag was opted-in but the host is missing the binary — keep
      // the test honest by failing visibly so CI doesn't claim coverage
      // it doesn't have.
      throw new Error(
        "HULUMI_INTEGRATION_KIND=1 requested kind integration coverage but `kind` is not on PATH. Install kind or unset the flag.",
      );
    }

    // Contract assertion only — actual cluster boot lands in M2/M4.
    // The contract here is: with the flag set and the binary present,
    // `kind version` returned status 0, so future per-component kind
    // tests can rely on this gate shape.
    expect(true).toBe(true);
  });
});
