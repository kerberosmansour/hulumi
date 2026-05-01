import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EksBackupFoundation, EKS_BACKUP_FOUNDATION_COMPONENT_TYPE } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function vaults() {
  return registrations.filter((r) => r.type === "aws:backup/vault:Vault");
}
function plans() {
  return registrations.filter((r) => r.type === "aws:backup/plan:Plan");
}
function selections() {
  return registrations.filter((r) => r.type === "aws:backup/selection:Selection");
}
function vaultLocks() {
  return registrations.filter(
    (r) => r.type === "aws:backup/vaultLockConfiguration:VaultLockConfiguration",
  );
}

const baseArgs = {
  clusterIdentifier: "prod",
  kmsKeyArn: "arn:aws:kms:us-east-1:111:key/abc",
  iamRoleArn: "arn:aws:iam::111:role/AWSBackupServiceRole",
  rules: [{ ruleName: "daily", schedule: "cron(0 5 * * ? *)", retentionDays: 30 }],
  resourceArns: ["arn:aws:efs:us-east-1:111:file-system/fs-abc"],
};

describe("EksBackupFoundation — happy paths", () => {
  test("Scenario: Backup vault encrypted via supplied KMS key", async () => {
    const c = new EksBackupFoundation("backup", baseArgs);
    await settlePulumi();
    expect(registrations.some((r) => r.type === EKS_BACKUP_FOUNDATION_COMPONENT_TYPE)).toBe(true);
    expect(vaults()).toHaveLength(1);
    const v = vaults()[0];
    expect(v.inputs.kmsKeyArn).toBe(baseArgs.kmsKeyArn);
    expect(plans()).toHaveLength(1);
    expect(selections()).toHaveLength(1);
    expect(await valueOf(c.immutableVaultLockManualStepRequired)).toBe(false);
  });

  test("Scenario: Vault lock / air-gap explicit emits VaultLockConfiguration", async () => {
    const c = new EksBackupFoundation("backup", {
      ...baseArgs,
      enableImmutableVaultLock: true,
      vaultLockMinRetentionDays: 30,
    });
    await settlePulumi();
    expect(vaultLocks()).toHaveLength(1);
    const lock = vaultLocks()[0];
    expect(lock.inputs.minRetentionDays).toBe(30);
    expect(lock.inputs.changeableForDays).toBe(3);
    expect(await valueOf(c.immutableVaultLockManualStepRequired)).toBe(true);
  });
});

describe("EksBackupFoundation — invalid input refusals", () => {
  test("Scenario: Retention bound enforced (retentionDays <= 0 → reject)", () => {
    expect(
      () =>
        new EksBackupFoundation("backup", {
          ...baseArgs,
          rules: [{ ruleName: "bad", schedule: "cron(0 5 * * ? *)", retentionDays: 0 }],
        }),
    ).toThrow(/retentionDays must be > 0/);
  });

  test("Scenario: Backup selections bounded (33 → reject)", () => {
    const tooMany: string[] = [];
    for (let i = 0; i < 33; i++) tooMany.push(`arn:aws:efs:us-east-1:111:file-system/fs-${i}`);
    expect(
      () => new EksBackupFoundation("backup", { ...baseArgs, resourceArns: tooMany }),
    ).toThrow(/resourceArns has 33.*max 32/);
  });

  test("Scenario: Lifecycle rules bounded (9 → reject)", () => {
    const rules: Array<{ ruleName: string; schedule: string; retentionDays: number }> = [];
    for (let i = 0; i < 9; i++) {
      rules.push({ ruleName: `r-${i}`, schedule: "cron(0 5 * * ? *)", retentionDays: 30 });
    }
    expect(() => new EksBackupFoundation("backup", { ...baseArgs, rules })).toThrow(
      /rules has 9.*max 8/,
    );
  });

  test("Scenario: enableImmutableVaultLock without vaultLockMinRetentionDays refused", () => {
    expect(
      () =>
        new EksBackupFoundation("backup", {
          ...baseArgs,
          enableImmutableVaultLock: true,
        }),
    ).toThrow(/enableImmutableVaultLock.*requires vaultLockMinRetentionDays/);
  });

  test("Scenario: coldStorageAfterDays must be at least 90 days less than retentionDays", () => {
    expect(
      () =>
        new EksBackupFoundation("backup", {
          ...baseArgs,
          rules: [
            {
              ruleName: "bad-cold",
              schedule: "cron(0 5 * * ? *)",
              retentionDays: 100,
              coldStorageAfterDays: 50, // would need to be 10 or less (100 - 90)
            },
          ],
        }),
    ).toThrow(/coldStorageAfterDays.*at least 90 days less/);
  });

  test("empty rules refused", () => {
    expect(() => new EksBackupFoundation("backup", { ...baseArgs, rules: [] })).toThrow(
      /rules must be non-empty/,
    );
  });

  test("empty resourceArns refused", () => {
    expect(
      () => new EksBackupFoundation("backup", { ...baseArgs, resourceArns: [] }),
    ).toThrow(/resourceArns must be non-empty/);
  });
});
