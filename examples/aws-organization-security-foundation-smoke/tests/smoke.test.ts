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
    registrations.push({
      type: args.type,
      name: args.name,
      inputs: { ...(args.inputs as Record<string, unknown>) },
    });
    const baseState: Record<string, unknown> = {
      ...(args.inputs as Record<string, unknown>),
    };
    baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
    return { id: `${args.name}_id`, state: baseState };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("examples/aws-organization-security-foundation-smoke", () => {
  it("registers the organization guardrail resources under mocks", async () => {
    registrations.length = 0;
    await import("../index");
    await settle();

    expect(
      registrations.some((r) => r.type === "hulumi:baseline:aws:AwsOrganizationSecurityFoundation"),
    ).toBe(true);
    expect(
      registrations.filter(
        (r) => r.type === "aws:organizations/delegatedAdministrator:DelegatedAdministrator",
      ),
    ).toHaveLength(4);
    expect(
      registrations.some(
        (r) => r.type === "aws:s3/accountPublicAccessBlock:AccountPublicAccessBlock",
      ),
    ).toBe(true);
    expect(registrations.filter((r) => r.type === "aws:organizations/policy:Policy")).toHaveLength(
      3,
    );
  });
});
