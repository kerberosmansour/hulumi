import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PulumiStateBackendFoundation,
  claimPulumiStateLease,
  classifyStateBackendEvents,
  summarizePulumiOutput,
} from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

describe("PulumiStateBackendFoundation", () => {
  beforeEach(() => {
    resetRegistrations();
  });

  afterEach(() => {
    resetRegistrations();
  });

  it("Scenario: startup-hardened backend creates hardened storage and optional lease table", async () => {
    const backend = new PulumiStateBackendFoundation("state", {
      tier: "startup-hardened",
      bucketName: "hulumi-state-example",
      kmsAliasName: "alias/hulumi/state/example",
      enableLeaseTable: true,
      objectLock: true,
    });

    await settlePulumi();

    expect(
      registrations.some((r) => r.type === "hulumi:platform:PulumiStateBackendFoundation"),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:kms/key:Key")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:kms/alias:Alias")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:s3/bucket:Bucket")).toBe(true);
    expect(
      registrations.some(
        (r) => r.type === "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
      ),
    ).toBe(true);
    expect(
      registrations.some(
        (r) =>
          r.type ===
          "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      ),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:s3/bucketVersioning:BucketVersioning")).toBe(
      true,
    );
    expect(registrations.some((r) => r.type === "aws:dynamodb/table:Table")).toBe(true);
    await expect(valueOf(backend.backendUrl)).resolves.toBe("s3://hulumi-state-example");
    await expect(valueOf(backend.drPosture)).resolves.toBe("object-lock");
  });

  it("Scenario: no DR option selected marks posture as advisory degraded", async () => {
    const backend = new PulumiStateBackendFoundation("state", {
      tier: "sandbox",
      bucketName: "hulumi-state-sandbox",
      kmsAliasName: "alias/hulumi/state/sandbox",
    });

    await expect(valueOf(backend.drPosture)).resolves.toBe("advisory-degraded");
    await expect(valueOf(backend.caveats)).resolves.toContain(
      "No object lock or replication configured; state recovery posture is advisory-degraded.",
    );
  });

  it("Scenario: KMS alias name is required", () => {
    expect(
      () =>
        new PulumiStateBackendFoundation("state", {
          tier: "startup-hardened",
          bucketName: "hulumi-state-example",
          kmsAliasName: "",
        }),
    ).toThrow(/kmsAliasName/);
    expect(registrations).toHaveLength(0);
  });
});

describe("Pulumi state helper invariants", () => {
  it("Scenario: second active writer for the same stack key is blocked", () => {
    const current = [{ stackKey: "org/prod", holderId: "ci-1", status: "active" as const }];
    const result = claimPulumiStateLease(current, {
      stackKey: "org/prod",
      holderId: "ci-2",
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toMatch(/already held/);
  });

  it("Scenario: state object delete activity is unsafe/degraded, not clean", () => {
    const posture = classifyStateBackendEvents([
      {
        eventName: "DeleteObject",
        objectKey: ".pulumi/stacks/prod.json",
        actor: "arn:aws:iam::111122223333:user/example",
      },
    ]);

    expect(posture.status).toBe("unsafe-degraded");
    expect(posture.findings[0]).toMatch(/DeleteObject/);
  });

  it("Scenario: secret output values are redacted", () => {
    const summary = summarizePulumiOutput({
      name: "dbPassword",
      value: "super-secret-value",
      secret: true,
    });

    expect(summary.valuePreview).toBe("[pulumi-secret-redacted]");
    expect(JSON.stringify(summary)).not.toContain("super-secret-value");
  });
});
