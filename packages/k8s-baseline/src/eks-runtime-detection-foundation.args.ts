import type * as pulumi from "@pulumi/pulumi";

/** EKS compute mode — determines which runtime-monitoring features are supported. */
export type EksComputeMode = "ec2-managed" | "fargate-only" | "mixed";

/** Bound on emitted CloudWatch alarms. */
export const MAX_RUNTIME_ALARM_RULES = 32;

export interface EksRuntimeDetectionFoundationArgs {
  /** EKS cluster name (used in alarm names + metric filter selection). */
  clusterName: pulumi.Input<string>;
  /** GuardDuty detector ID to attach EKS protection features to. */
  guardDutyDetectorId: pulumi.Input<string>;
  /** CloudWatch Logs group that receives the EKS audit logs. */
  auditLogGroupName: pulumi.Input<string>;
  /** SNS topic ARN for alarm actions (typically the consumer's MonitoringFoundation topic). */
  alarmSnsTopicArn: pulumi.Input<string>;
  /**
   * Default `"ec2-managed"`. When `"fargate-only"`, the component does NOT
   * enable GuardDuty Runtime Monitoring (unsupported on Fargate-only); the
   * component emits a warning and an output flag.
   */
  clusterCompute?: EksComputeMode;
  /** Default `true`. Enables `EKS_AUDIT_LOGS` GuardDuty feature. */
  enableEksAuditLogs?: boolean;
  /** Default `true` for non-Fargate. Enables `EKS_RUNTIME_MONITORING`. */
  enableRuntimeMonitoring?: boolean;
  /** Default `true`. Emits a CloudWatch metric filter + alarm for secret-read events. */
  enableSecretReadAlarm?: boolean;
  /** Default `true`. Emits a metric filter + alarm for `pods/exec` subresource events. */
  enablePodExecAlarm?: boolean;
  /** Tags merged onto emitted resources. */
  tags?: Record<string, string>;
}
