import { beforeEach, describe, expect, test } from "vitest";

import { EksClusterFoundation, EKS_CLUSTER_FOUNDATION_COMPONENT_TYPE } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});

function resourceTypes(): string[] {
  return registrations.map((r) => r.type);
}

function clusterInputs(): Record<string, unknown> {
  const cluster = registrations.find((r) => r.type === "aws:eks/cluster:Cluster");
  if (cluster === undefined) throw new Error("expected EKS cluster registration");
  return cluster.inputs;
}

describe("EksClusterFoundation — startup-hardened create mode", () => {
  test("Scenario: Startup-hardened cluster foundation creates private endpoint, audit logs, Pod Identity, and IMDSv2 node posture", async () => {
    const foundation = new EksClusterFoundation("foundation", {
      tier: "startup-hardened",
      mode: "create",
      clusterName: "prod-eks",
      roleArn: "arn:aws:iam::111122223333:role/eks-control-plane",
      subnetIds: ["subnet-a", "subnet-b"],
      addons: [{ name: "vpc-cni", version: "v1.20.0-eksbuild.1" }],
      podIdentityAssociations: [
        {
          namespace: "kube-system",
          serviceAccount: "aws-load-balancer-controller",
          roleArn: "arn:aws:iam::111122223333:role/alb-controller",
        },
      ],
      nodePools: [
        {
          name: "system",
          nodeRoleArn: "arn:aws:iam::111122223333:role/eks-node",
          subnetIds: ["subnet-a", "subnet-b"],
          instanceTypes: ["t3.large"],
          minSize: 1,
          desiredSize: 2,
          maxSize: 3,
        },
      ],
    });

    await settlePulumi();

    expect(resourceTypes()).toContain(EKS_CLUSTER_FOUNDATION_COMPONENT_TYPE);
    expect(resourceTypes()).toContain("aws:eks/cluster:Cluster");
    expect(resourceTypes()).toContain("aws:eks/addon:Addon");
    expect(resourceTypes()).toContain("aws:eks/podIdentityAssociation:PodIdentityAssociation");
    expect(resourceTypes()).toContain("aws:ec2/launchTemplate:LaunchTemplate");
    expect(resourceTypes()).toContain("aws:eks/nodeGroup:NodeGroup");

    expect(clusterInputs()).toMatchObject({
      name: "prod-eks",
      enabledClusterLogTypes: expect.arrayContaining(["audit"]),
      vpcConfig: {
        subnetIds: ["subnet-a", "subnet-b"],
        endpointPrivateAccess: true,
        endpointPublicAccess: false,
      },
    });
    const launchTemplate = registrations.find(
      (r) => r.type === "aws:ec2/launchTemplate:LaunchTemplate",
    );
    expect(launchTemplate?.inputs.metadataOptions).toMatchObject({ httpTokens: "required" });
    await expect(valueOf(foundation.clusterName)).resolves.toBe("prod-eks");
    await expect(valueOf(foundation.ownedClusterResources)).resolves.toBe(true);
    await expect(valueOf(foundation.validationExpectations)).resolves.toMatchObject({
      auditLogsRequired: true,
      imdsV2Required: true,
      podIdentityPreferred: true,
    });
  });
});

describe("EksClusterFoundation — invalid input and bounded resources", () => {
  test("Scenario: Public unrestricted endpoint refused", () => {
    expect(
      () =>
        new EksClusterFoundation("bad", {
          tier: "startup-hardened",
          mode: "create",
          clusterName: "bad-eks",
          roleArn: "arn:aws:iam::111122223333:role/eks-control-plane",
          subnetIds: ["subnet-a", "subnet-b"],
          endpoint: { mode: "restricted-public", publicAccessCidrs: ["0.0.0.0/0"] },
        }),
    ).toThrow(/publicAccessCidrs.*entire internet/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  test("Scenario: Node pool bound exceeded", () => {
    const nodePools = Array.from({ length: 9 }, (_, index) => ({
      name: `pool-${index}`,
      nodeRoleArn: "arn:aws:iam::111122223333:role/eks-node",
      subnetIds: ["subnet-a", "subnet-b"],
      instanceTypes: ["t3.large"],
      minSize: 1,
      desiredSize: 1,
      maxSize: 2,
    }));

    expect(
      () =>
        new EksClusterFoundation("too-many", {
          tier: "startup-hardened",
          mode: "create",
          clusterName: "too-many",
          roleArn: "arn:aws:iam::111122223333:role/eks-control-plane",
          subnetIds: ["subnet-a", "subnet-b"],
          nodePools,
        }),
    ).toThrow(/nodePools has 9 entries; max 8/);
  });

  test("Scenario: Broad pod AWS credentials without Pod Identity are rejected", () => {
    expect(
      () =>
        new EksClusterFoundation("pod-creds", {
          tier: "startup-hardened",
          mode: "create",
          clusterName: "pod-creds",
          roleArn: "arn:aws:iam::111122223333:role/eks-control-plane",
          subnetIds: ["subnet-a", "subnet-b"],
          allowBroadPodAwsCredentials: true,
        }),
    ).toThrow(/Pod Identity/);
  });
});

describe("EksClusterFoundation — adopt mode", () => {
  test("Scenario: Adopt existing cluster emits validation expectations without claiming ownership", async () => {
    const foundation = new EksClusterFoundation("adopt", {
      tier: "startup-hardened",
      mode: "adopt",
      clusterName: "existing-prod",
      expectedEndpointMode: "private",
    });

    await settlePulumi();

    expect(resourceTypes()).toContain(EKS_CLUSTER_FOUNDATION_COMPONENT_TYPE);
    expect(resourceTypes()).not.toContain("aws:eks/cluster:Cluster");
    await expect(valueOf(foundation.clusterName)).resolves.toBe("existing-prod");
    await expect(valueOf(foundation.ownedClusterResources)).resolves.toBe(false);
    await expect(valueOf(foundation.validationExpectations)).resolves.toMatchObject({
      endpointMode: "private",
      auditLogsRequired: true,
      imdsV2Required: true,
      podIdentityPreferred: true,
    });
  });
});
