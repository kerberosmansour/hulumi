---
title: AuditTrail
description: Multi-region CloudTrail with log-file validation, KMS-encrypted CW Logs, and a SecureBucket-backed S3 archive. Source for IdentityAlarms.
---

# `AuditTrail`

`@hulumi/baseline.aws.AuditTrail` — multi-region CloudTrail wired up correctly (M9 / Ops M3):

- `aws.cloudtrail.Trail` — `isMultiRegionTrail: true`, `enableLogFileValidation: true`, `kmsKeyId` (consumer-supplied).
- `aws.cloudwatch.LogGroup` — encrypted with the same KMS key, retention configurable (default 365 days).
- `aws.iam.Role` + `RolePolicy` — CloudTrail → CloudWatch Logs delivery role.
- Reads from a SecureBucket-shaped archive (consumer-supplied bucket name + ARN).

## Quick start

```ts
const archive = new SecureBucket("audit-archive", { tier, kmsKeyArn });
const trail = new AuditTrail("account-trail", {
  tier: "startup-hardened",
  kmsKeyArn: archive.kmsKeyArn,
  archiveBucketName: archive.bucketName,
  archiveBucketArn: archive.bucketArn,
});

new IdentityAlarms("identity", {
  tier,
  trailLogGroupName: trail.cloudWatchLogsGroupName,
  criticalTopicArn: monitoring.criticalArn,
  highTopicArn: monitoring.highArn,
});
```

## Invariants

- Multi-region: always on.
- Log-file validation: always on (cryptographic signing of trail digests).
- CW Logs are KMS-encrypted with the same key as the trail.
- `kmsKeyArn` required (no AWS-managed default).

## Bounds

- Retention configurable; must be > 0.

Source: [packages/baseline/src/aws/audit-trail.ts](../../packages/baseline/src/aws/audit-trail.ts).

## 3.0 migration: explicit data-event scope

Management events remain enabled. Object data events now require explicit `dataEventBucketArns` containing exact application-bucket ARNs (up to 250), and exclude the archive destination. Omitting the list records management events only. The old default recorded the archive's own delivery writes, creating a recursive logging/cost loop. CloudTrail's service trust is also bound to the account and exact trail ARN.

Pass the application buckets that need object-level monitoring; do not assume that a management trail alone records object reads/writes. The current Pulumi provider does not expose AWS's `RecursiveLogging` suppression setting, so the component excludes its destination instead of pretending to set an unsupported property. See [AWS recursive logging](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-trail-recursive-logging.html).
