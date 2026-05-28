---
title: Roll out security detection families
description: Add finite, routed alarm families for AWS organization, state, EKS, identity, CloudTrail/KMS/Config, and security-service disablement signals.
---

# Roll out security detection families

## When to use this recipe

Use this when you already have a CloudTrail-to-CloudWatch Logs path and severity-routed SNS topics, and you want one composable detection foundation rather than hand-copying EventBridge rules.

## Preconditions

- A `MonitoringFoundation` or equivalent SNS topic set for critical and high alerts.
- An `AuditTrail` or equivalent CloudTrail log group.
- A policy-pack rollout path for `HulumiHardeningPack`.

## Steps

1. Add the detection foundation:

```ts
import { SecurityDetectionFoundation } from "@hulumi/baseline/aws";

const detection = new SecurityDetectionFoundation("security-detection", {
  tier: "startup-hardened",
  trailLogGroupName: audit.cloudWatchLogsGroupName,
  criticalTopicArn: monitoring.criticalArn,
  highTopicArn: monitoring.highArn,
  mediumTopicArn: monitoring.mediumArn,
  runbookUrl: "https://example.internal/runbooks/security-detection",
});

export const enabledDetectionFamilies = detection.enabledFamilies;
export const detectionValidatorChecks = detection.validatorChecks;
```

2. Enable policy backstops in your Pulumi policy config:

```yaml
config:
  requireSecurityDetectionFoundation: startup-hardened
```

3. Keep medium advisory families opt-in:

```ts
new SecurityDetectionFoundation("security-detection", {
  tier: "startup-hardened",
  trailLogGroupName: audit.cloudWatchLogsGroupName,
  criticalTopicArn: monitoring.criticalArn,
  highTopicArn: monitoring.highArn,
  enabledFamilies: { "advisory-cost-anomaly": true },
});
```

Without `mediumTopicArn`, that family is visibly `advisory-disabled`; it is not counted as monitored.

## Verify

- `pnpm --filter @hulumi/baseline test -- --run tests/security-detection-foundation.test.ts`
- `pnpm --filter @hulumi/policies test -- --run tests/security-detection-pack.test.ts`
- `pnpm --filter @hulumi-examples/security-detection-foundation-smoke test`
- In a sandbox, run the credential-gated `security_detection_contract_or_skip` marker with documented env vars.

## Troubleshooting

- `criticalTopicArn is required` means a startup-hardened critical family would have no action. Wire `MonitoringFoundation.criticalArn`.
- `unknown alarm family` means a free-form string was supplied. Use one of the finite `SECURITY_DETECTION_ALARM_FAMILIES`.
- `catch-all` pattern means a custom rule has no finite `source`. Narrow it, or mark it advisory only when it is deliberately noisy.

## See also

- [SecurityDetectionFoundation component](../components/security-detection-foundation.md)
- [AuditTrail component](../components/audit-trail.md)
- [Live validator cookbook](./live-validator.md)
