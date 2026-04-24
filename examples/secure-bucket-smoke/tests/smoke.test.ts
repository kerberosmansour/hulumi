// M2 smoke test: instantiate both SecureBucket tiers under Pulumi mocks
// and assert the expected tier-appropriate sub-resource set.

import { describe, it, expect } from "vitest";
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

describe("examples/secure-bucket-smoke — preview emits expected tier diff", () => {
  it("creates sandbox + startup-hardened SecureBuckets with tier-appropriate sub-resources and correct tags", async () => {
    registrations.length = 0;

    // Dynamic import after setMocks so the Pulumi runtime sees the mocks.
    await import("../index");
    await settle();

    const typesByBucketName = new Map<string, Set<string>>();
    for (const r of registrations) {
      const parent = r.name.split("-").slice(0, 2).join("-");
      if (!typesByBucketName.has(parent)) typesByBucketName.set(parent, new Set());
      typesByBucketName.get(parent)!.add(r.type);
    }

    const sandboxTypes = typesByBucketName.get("smoke-sandbox") ?? new Set<string>();
    const hardenedTypes = typesByBucketName.get("smoke-hardened") ?? new Set<string>();

    expect(sandboxTypes.has("aws:s3/bucketV2:BucketV2")).toBe(true);
    expect(hardenedTypes.has("aws:s3/bucketV2:BucketV2")).toBe(true);

    // Startup-Hardened must emit the three deltas; Sandbox must not.
    const hardenedOnlyTypes = [
      "aws:s3/bucketObjectLockConfigurationV2:BucketObjectLockConfigurationV2",
      "aws:s3/bucketLoggingV2:BucketLoggingV2",
      "aws:cloudtrail/eventDataStore:EventDataStore",
    ];
    for (const t of hardenedOnlyTypes) {
      expect(sandboxTypes.has(t)).toBe(false);
      expect(hardenedTypes.has(t)).toBe(true);
    }

    // Tags present on both bucket instances.
    const sandboxBucket = registrations.find(
      (r) => r.name === "smoke-sandbox-bucket" && r.type === "aws:s3/bucketV2:BucketV2",
    );
    const hardenedBucket = registrations.find(
      (r) => r.name === "smoke-hardened-bucket" && r.type === "aws:s3/bucketV2:BucketV2",
    );
    expect(sandboxBucket).toBeDefined();
    expect(hardenedBucket).toBeDefined();
    const sandboxTags = sandboxBucket!.inputs.tags as Record<string, string>;
    const hardenedTags = hardenedBucket!.inputs.tags as Record<string, string>;
    expect(sandboxTags["hulumi:tier"]).toBe("sandbox");
    expect(hardenedTags["hulumi:tier"]).toBe("startup-hardened");
    expect(sandboxTags["hulumi:component"]).toBe("SecureBucket");
    expect(hardenedTags["hulumi:component"]).toBe("SecureBucket");
  });
});
