import type * as pulumi from "@pulumi/pulumi";

export interface EksRuntimeDetectionFoundationOutputs {
  /** GuardDuty feature names actually enabled (`EKS_AUDIT_LOGS`, `EKS_RUNTIME_MONITORING`). */
  guardDutyFeaturesEnabled: pulumi.Output<string[]>;
  /** ARNs of emitted CloudWatch alarms. */
  alarmArns: pulumi.Output<string[]>;
  /** True when `clusterCompute` is `"fargate-only"` and runtime monitoring is unsupported. */
  runtimeMonitoringUnsupported: pulumi.Output<boolean>;
}
