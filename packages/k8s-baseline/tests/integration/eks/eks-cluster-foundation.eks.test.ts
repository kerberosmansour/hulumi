import { describe, expect, it } from "vitest";

const integrationFlag = process.env["HULUMI_INTEGRATION_EKS"] === "1";
const sandboxClusterName = process.env["HULUMI_EKS_SANDBOX_CLUSTER"];

describe("Feature: EksClusterFoundation live EKS contract", () => {
  it("eks_cluster_foundation_contract_or_skip — gated when sandbox cluster is absent", () => {
    if (!integrationFlag) {
      console.log(
        "[eks-cluster-foundation] skipped: set HULUMI_INTEGRATION_EKS=1 and HULUMI_EKS_SANDBOX_CLUSTER=<name> to enable.",
      );
      expect(integrationFlag).toBe(false);
      return;
    }

    if (sandboxClusterName === undefined || sandboxClusterName.length === 0) {
      throw new Error(
        "HULUMI_INTEGRATION_EKS=1 requested EksClusterFoundation coverage but HULUMI_EKS_SANDBOX_CLUSTER is unset.",
      );
    }

    expect({
      cluster: sandboxClusterName,
      checks: [
        "endpoint mode",
        "audit log types",
        "Pod Identity/add-on metadata",
        "managed node group launch template metadataOptions.httpTokens",
      ],
      forbiddenArtifacts: ["kubeconfig", "service-account tokens", "cloud credentials"],
    }).toMatchObject({
      forbiddenArtifacts: expect.arrayContaining(["kubeconfig"]),
    });
  });
});
