import { describe, expect, it } from "vitest";
import * as pulumi from "@pulumi/pulumi";

interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}

const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    const inputs = { ...(args.inputs as Record<string, unknown>) };
    registrations.push({ type: args.type, name: args.name, inputs });
    return {
      id: `${args.name}_id`,
      state: {
        ...inputs,
        arn: `arn:aws:mock:${args.type}:${args.name}`,
        name: inputs.name ?? args.name,
        latestVersion: "1",
      },
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

async function settle(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("examples/eks-cluster-foundation-smoke", () => {
  it("registers EKS cluster foundation resources under mocks", async () => {
    registrations.length = 0;
    await import("../index");
    await settle();

    expect(registrations.some((r) => r.type === "hulumi:k8s:EksClusterFoundation")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:eks/cluster:Cluster")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:eks/addon:Addon")).toBe(true);
    expect(
      registrations.some((r) => r.type === "aws:eks/podIdentityAssociation:PodIdentityAssociation"),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:ec2/launchTemplate:LaunchTemplate")).toBe(
      true,
    );
    expect(registrations.some((r) => r.type === "aws:eks/nodeGroup:NodeGroup")).toBe(true);
  });
});
