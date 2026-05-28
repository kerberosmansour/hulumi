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
      },
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("examples/aws-secure-primitives-smoke", () => {
  it("registers hardened IAM, secret, and launch-template resources under mocks", async () => {
    registrations.length = 0;
    await import("../index");
    await settle();

    const role = registrations.find((r) => r.type === "aws:iam/role:Role");
    expect(role).toBeDefined();
    expect(role?.inputs.permissionsBoundary).toBeTruthy();
    expect(JSON.stringify(role?.inputs.assumeRolePolicy)).not.toContain("*");

    const secret = registrations.find((r) => r.type === "aws:secretsmanager/secret:Secret");
    expect(secret).toBeDefined();
    expect(secret?.inputs.kmsKeyId).toBeTruthy();
    expect(
      registrations.some((r) => r.type === "aws:secretsmanager/secretVersion:SecretVersion"),
    ).toBe(false);

    const launchTemplate = registrations.find(
      (r) => r.type === "aws:ec2/launchTemplate:LaunchTemplate",
    );
    expect(launchTemplate?.inputs.metadataOptions).toEqual(
      expect.objectContaining({ httpTokens: "required" }),
    );
  });
});
