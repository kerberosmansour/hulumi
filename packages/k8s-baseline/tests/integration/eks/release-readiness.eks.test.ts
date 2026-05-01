// EKS-gated release-readiness contract test for `@hulumi/k8s-baseline`
// (Runbook `hulumi-operations-k8s-security` Milestone 1).
//
// Purpose: Prove the EKS integration test lane is wired up and safely
// gated. Real EKS validations land in later milestones (M5, M6) when
// detection, backup, and upgrade-planner components need a live EKS
// sandbox. M1's job is to stand up the gating shape future EKS tests
// will reuse.

import { describe, it, expect } from "vitest";

const integrationFlag = process.env["HULUMI_INTEGRATION_EKS"] === "1";
const sandboxClusterName = process.env["HULUMI_EKS_SANDBOX_CLUSTER"];

describe("Feature: K8s package release readiness — EKS-gated contract", () => {
  it("eks_contract_or_skip — gated when integration flag or sandbox cluster is absent", () => {
    if (!integrationFlag) {
      console.log(
        "[release-readiness.eks] skipped: set HULUMI_INTEGRATION_EKS=1 and HULUMI_EKS_SANDBOX_CLUSTER=<name> to enable.",
      );
      expect(integrationFlag).toBe(false);
      return;
    }

    if (sandboxClusterName === undefined || sandboxClusterName.length === 0) {
      throw new Error(
        "HULUMI_INTEGRATION_EKS=1 requested EKS integration coverage but HULUMI_EKS_SANDBOX_CLUSTER is unset. Provide the sandbox cluster name or unset the flag.",
      );
    }

    expect(sandboxClusterName.length).toBeGreaterThan(0);
  });
});
