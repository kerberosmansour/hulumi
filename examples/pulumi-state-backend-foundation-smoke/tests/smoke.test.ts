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
        bucket: inputs.bucket ?? args.name,
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

describe("examples/pulumi-state-backend-foundation-smoke", () => {
  it("registers the state backend resources under mocks", async () => {
    registrations.length = 0;
    await import("../index");
    await settle();

    expect(
      registrations.some((r) => r.type === "hulumi:platform:PulumiStateBackendFoundation"),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:kms/key:Key")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:kms/alias:Alias")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:s3/bucket:Bucket")).toBe(true);
    expect(
      registrations.some(
        (r) =>
          r.type ===
          "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      ),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:dynamodb/table:Table")).toBe(true);
  });
});
