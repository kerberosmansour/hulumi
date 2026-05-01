import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuditTrail, AUDIT_TRAIL_COMPONENT_TYPE } from "../src/aws";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const baseArgs = {
  tier: "startup-hardened" as const,
  kmsKeyArn: "arn:aws:kms:us-east-1:111:key/abc",
  archiveBucketName: "audit-archive-bucket",
  archiveBucketArn: "arn:aws:s3:::audit-archive-bucket",
};

function trails() {
  return registrations.filter((r) => r.type === "aws:cloudtrail/trail:Trail");
}
function logGroups() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/logGroup:LogGroup");
}

describe("AuditTrail — happy paths", () => {
  test("emits multi-region trail with log-file validation, KMS-encrypted CW Logs, and CT-to-CWL role", async () => {
    const c = new AuditTrail("audit", baseArgs);
    await settlePulumi();
    expect(registrations.some((r) => r.type === AUDIT_TRAIL_COMPONENT_TYPE)).toBe(true);
    expect(trails()).toHaveLength(1);
    const trail = trails()[0];
    expect(trail.inputs.isMultiRegionTrail).toBe(true);
    expect(trail.inputs.includeGlobalServiceEvents).toBe(true);
    expect(trail.inputs.enableLogFileValidation).toBe(true);
    expect(trail.inputs.kmsKeyId).toBe(baseArgs.kmsKeyArn);

    expect(logGroups()).toHaveLength(1);
    const lg = logGroups()[0];
    expect(lg.inputs.kmsKeyId).toBe(baseArgs.kmsKeyArn);
    expect(lg.inputs.retentionInDays).toBe(365);

    expect(await valueOf(c.multiRegion)).toBe(true);
    expect(await valueOf(c.logFileValidationEnabled)).toBe(true);
  });

  test("CW Logs retention configurable", async () => {
    new AuditTrail("audit", { ...baseArgs, cloudWatchLogsRetentionDays: 90 });
    await settlePulumi();
    expect(logGroups()[0].inputs.retentionInDays).toBe(90);
  });
});

describe("AuditTrail — invalid input refusals", () => {
  test("missing kmsKeyArn rejected", () => {
    expect(
      () =>
        new AuditTrail("c", {
          ...baseArgs,
          kmsKeyArn: undefined as unknown as string,
        }),
    ).toThrow(/kmsKeyArn is required/);
  });

  test("missing archiveBucketName rejected", () => {
    expect(
      () =>
        new AuditTrail("c", {
          ...baseArgs,
          archiveBucketName: undefined as unknown as string,
        }),
    ).toThrow(/archiveBucketName.*archiveBucketArn/);
  });

  test("non-positive retention rejected", () => {
    expect(
      () => new AuditTrail("c", { ...baseArgs, cloudWatchLogsRetentionDays: 0 }),
    ).toThrow(/cloudWatchLogsRetentionDays must be > 0/);
  });
});
