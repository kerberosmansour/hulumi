---
title: EksBackupFoundation
description: AWS Backup vault (KMS-encrypted) + plan + selection for EKS workload state. Optional immutable vault lock with operator-confirmation gate.
---

# `EksBackupFoundation`

`@hulumi/k8s-baseline.EksBackupFoundation` — provisions the AWS Backup posture for an EKS cluster's stateful workloads (M5):

- `aws.backup.Vault` — KMS-encrypted (consumer supplies key ARN; no AWS-managed default).
- `aws.backup.VaultLockConfiguration` — when `enableImmutableVaultLock: true`. AWS Backup's vault lock is **irreversible** once finalized; the component leaves the standard 3-day `changeableForDays` window and exposes `immutableVaultLockManualStepRequired: Output<true>` so operators know to confirm.
- `aws.backup.Plan` — bounded at 8 lifecycle rules.
- `aws.backup.Selection` — bounded at 32 resource ARNs.

## Quick start

```ts
new EksBackupFoundation("prod-eks-backup", {
  clusterIdentifier: "prod",
  kmsKeyArn: kmsKey.arn,
  iamRoleArn: backupRole.arn,
  rules: [
    { ruleName: "daily", schedule: "cron(0 5 * * ? *)", retentionDays: 30 },
    {
      ruleName: "weekly-cold",
      schedule: "cron(0 5 ? * SUN *)",
      retentionDays: 365,
      coldStorageAfterDays: 90,
    },
  ],
  resourceArns: [efs.arn, rdsInstance.arn],
});
```

## Bounds and invariants

- `retentionDays` must be `> 0` (M5 invariant).
- `coldStorageAfterDays` must be at least 90 days less than `retentionDays` (AWS Backup hard limit).
- `enableImmutableVaultLock: true` requires `vaultLockMinRetentionDays > 0`.
- `MAX_BACKUP_LIFECYCLE_RULES = 8`.
- `MAX_BACKUP_SELECTIONS = 32`.

Source: [packages/k8s-baseline/src/eks-backup-foundation.ts](../../packages/k8s-baseline/src/eks-backup-foundation.ts).
