---
title: Ec2PatchWaves
description: Composes up to three Ec2PatchBaseline instances (dev → staging → production) with a CloudWatch CompositeAlarm health gate between waves. No Lambda. No Step Functions.
---

# `Ec2PatchWaves`

`@hulumi/baseline.aws.Ec2PatchWaves` — wave-composer on top of `Ec2PatchBaseline`. Each wave gets its own `Ec2PatchBaseline` with the `patchGroup` fixed by position. A `aws.cloudwatch.CompositeAlarm` aggregates the per-wave compliance alarms; downstream waves can gate progression on the composite OK state via Pulumi `Output<bool>` chaining (consumer-supplied wiring).

## Quick start

```ts
new Ec2PatchWaves("prod-waves", {
  tier: "startup-hardened",
  dev:        { ...waveBase, scheduleCron: "cron(0 1 ? * MON *)" },
  staging:    { ...waveBase, scheduleCron: "cron(0 3 ? * WED *)" },
  production: { ...waveBase, scheduleCron: "cron(0 5 ? * SUN *)" },
});
```

## Tier semantics

| Tier               | Required waves                       |
| ------------------ | ------------------------------------ |
| `sandbox`          | `dev` only (degraded single-wave OK) |
| `startup-hardened` | `dev` + `staging` + `production`     |

`startup-hardened` tier with missing `staging` or `production` is rejected at construction.

Source: [packages/baseline/src/aws/ec2-patch-waves.ts](../../packages/baseline/src/aws/ec2-patch-waves.ts).
