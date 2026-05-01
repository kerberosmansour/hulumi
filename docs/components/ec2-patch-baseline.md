---
title: Ec2PatchBaseline
description: SSM Patch Baseline + PatchGroup + MaintenanceWindow + RunCommand task + ResourceDataSync + compliance alarm. Tier-aware reboot defaults; CRC32-bucket staggering; Patch:Group enum tightened to {dev, staging, production}.
---

# `Ec2PatchBaseline`

`@hulumi/baseline.aws.Ec2PatchBaseline` — wraps SSM Patch Manager into one ComponentResource. Added in runbook `hulumi-operations-k8s-security` Operations Milestone 1 (combined M7).

## Quick start

```ts
new Ec2PatchBaseline("prod-patch", {
  patchGroup: "production",
  tier: "startup-hardened",
  scheduleCron: "cron(0 4 ? * SUN *)",
  serviceRoleArn: ssmRole.arn,
  resourceDataSyncBucketName: patchSyncBucket.bucket,
  complianceMetric: { topicArn: monitoring.alarmTopicArn },
});
```

## Reboot policy (load-bearing decision)

`rebootOption` defaults to `{ kind: "RebootIfNeeded" }` at **both** tiers. The `NoReboot` option is a discriminated-union shape that requires `hulumi_decision_comment: string` (≥ 8 chars) — recorded as the `hulumi:no-reboot-comment` tag on emitted resources. `NoReboot` is **forbidden at tier "startup-hardened"** because the silent-un-patching trap (sixty-day-old kernel exploited in the wild) is a worse failure than a 04:00 UTC reboot.

```ts
// Sandbox-only NoReboot:
rebootOption: {
  kind: "NoReboot",
  hulumi_decision_comment: "Long-running batch jobs reboot weekly via separate cron.",
}
```

## Bounds

- `MAX_STAGGERING_BUCKETS = 16`.
- `MAX_COMPLIANCE_SEVERITIES = 4` (CRITICAL, IMPORTANT, MEDIUM, LOW).
- `Patch:Group` tag value enum: `dev | staging | production`.

Source: [packages/baseline/src/aws/ec2-patch-baseline.ts](../../packages/baseline/src/aws/ec2-patch-baseline.ts).
