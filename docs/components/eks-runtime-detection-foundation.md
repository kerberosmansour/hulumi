---
title: EksRuntimeDetectionFoundation
description: GuardDuty EKS Audit Logs + Runtime Monitoring features, plus CloudWatch metric filters / alarms for secret-read and pods/exec audit events. Routed to a consumer SNS topic.
---

# `EksRuntimeDetectionFoundation`

`@hulumi/k8s-baseline.EksRuntimeDetectionFoundation` — wires up the EKS detection lane (M5):

- `aws.guardduty.DetectorFeature` for `EKS_AUDIT_LOGS` and `EKS_RUNTIME_MONITORING`.
- `aws.cloudwatch.LogMetricFilter` + `aws.cloudwatch.MetricAlarm` for secret reads (`get` / `list` / `watch` on `secrets`).
- Same for `pods/exec` audit events.

Consumer supplies the GuardDuty detector ID, the CloudWatch Logs group receiving audit logs, and an SNS topic ARN for alarm actions (typically `MonitoringFoundation.alarmTopicArn`).

## Quick start

```ts
new EksRuntimeDetectionFoundation("prod-eks-detection", {
  clusterName: "prod-eks",
  guardDutyDetectorId: detector.id,
  auditLogGroupName: "/aws/eks/prod-eks/audit",
  alarmSnsTopicArn: monitoring.alarmTopicArn,
});
```

## Fargate caveat

GuardDuty Runtime Monitoring is **unsupported on EKS-on-Fargate**. When `clusterCompute: "fargate-only"` the component:

- skips the `EKS_RUNTIME_MONITORING` feature,
- emits `pulumi.log.warn` if `enableRuntimeMonitoring: true` was explicitly set,
- exposes `runtimeMonitoringUnsupported: Output<true>`.

Audit-log detection (which keys off control-plane logs, not pod runtime) still works on Fargate.

## Bounds

- `MAX_RUNTIME_ALARM_RULES = 32` — emitted alarm count is capped.

Source: [packages/k8s-baseline/src/eks-runtime-detection-foundation.ts](../../packages/k8s-baseline/src/eks-runtime-detection-foundation.ts).
