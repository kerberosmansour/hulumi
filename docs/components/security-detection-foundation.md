---
title: SecurityDetectionFoundation
description: Composable AWS alarm-family foundation for identity, org, state, EKS control-plane, CloudTrail/KMS/Config, and security-service disablement detection.
---

# `SecurityDetectionFoundation`

`@hulumi/baseline.aws.SecurityDetectionFoundation` composes existing monitoring/audit primitives into a finite alarm-family surface:

- `IdentityAlarms` for the canonical identity CloudTrail metric filters and CloudWatch alarms.
- EventBridge rules and SNS targets for organization guardrail drift, Pulumi state backend tampering, EKS control-plane changes, CloudTrail/KMS/Config tampering, and security-service disablement.
- An optional medium-severity advisory family for cost-anomaly routing.

## Quick start

```ts
import {
  AuditTrail,
  MonitoringFoundation,
  SecurityDetectionFoundation,
} from "@hulumi/baseline/aws";

const monitoring = new MonitoringFoundation("monitoring", {
  tier: "startup-hardened",
});

const audit = new AuditTrail("audit", {
  tier: "startup-hardened",
  kmsKeyArn: "arn:aws:kms:us-east-1:111122223333:key/audit",
  archiveBucketName: "hulumi-audit-archive",
  archiveBucketArn: "arn:aws:s3:::hulumi-audit-archive",
});

export const detection = new SecurityDetectionFoundation("detection", {
  tier: "startup-hardened",
  trailLogGroupName: audit.cloudWatchLogsGroupName,
  criticalTopicArn: monitoring.criticalArn,
  highTopicArn: monitoring.highArn,
  mediumTopicArn: monitoring.mediumArn,
});
```

## Alarm families

| Family                         |      Severity | Default | What it catches                                                                                                     |
| ------------------------------ | ------------: | ------: | ------------------------------------------------------------------------------------------------------------------- |
| `identity-core`                | critical/high |      on | Root use, access key creation, MFA disablement, IAM policy change, CloudTrail tampering, console login without MFA. |
| `org-guardrail`                |      critical |      on | Organizations policy detach/disable and delegated-admin removal.                                                    |
| `state-backend`                |          high |      on | S3/KMS changes that can weaken or damage a Pulumi state backend.                                                    |
| `eks-control-plane`            |          high |      on | EKS control-plane and access-entry changes.                                                                         |
| `cloudtrail-kms-config`        |      critical |      on | CloudTrail, KMS, and AWS Config tampering.                                                                          |
| `security-service-disablement` |      critical |      on | GuardDuty, Security Hub, and AWS Config disablement.                                                                |
| `advisory-cost-anomaly`        |        medium |     off | Cost-anomaly event routing, enabled only when requested and a medium topic is supplied.                             |

Startup-Hardened stacks cannot disable critical families. If a medium advisory family is enabled without `mediumTopicArn`, the component marks it `advisory-disabled` instead of silently pretending it is monitored.

## Policy backstops

`HulumiHardeningPack` adds:

- `DETECT-1` — startup-hardened critical detection alarms must have actions.
- `DETECT-2` — when `requireSecurityDetectionFoundation: "startup-hardened"` is set, the stack must include a `security-service-disablement` rule with a target.
- `DETECT-3` — detection EventBridge rules must not use broad catch-all patterns unless explicitly advisory.

## Live validation

M6 does not change `@hulumi/drift` because this milestone's allow-list excludes validator source files. The component emits `validatorChecks` and ships `security_detection_contract_or_skip`, a credential-gated test marker that documents the read-only checks a future live adapter should perform:

- `cloudwatch:DescribeAlarms`
- `events:DescribeRule`
- `events:ListTargetsByRule`
- `logs:DescribeMetricFilters`

The validator follow-up is intentionally separate from the component API.

Source: [packages/baseline/src/aws/security-detection-foundation.ts](../../packages/baseline/src/aws/security-detection-foundation.ts).
