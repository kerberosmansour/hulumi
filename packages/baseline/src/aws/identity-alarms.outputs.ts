// IdentityAlarms outputs.

import type * as pulumi from "@pulumi/pulumi";
import type * as aws from "@pulumi/aws";

export interface IdentityAlarmsOutputs {
  /**
   * Map of alarm name → alarm resource. Keys are stable
   * (`root-account-use`, `iam-access-key-created`, `mfa-disabled`,
   * `iam-role-policy-change`, `cloudtrail-tampering`,
   * `console-login-no-mfa`, plus any keys from `additionalEvents`).
   */
  readonly alarms: Record<string, aws.cloudwatch.MetricAlarm>;

  /** ARNs of all created alarms, in deterministic creation order. */
  readonly alarmArns: pulumi.Output<string>[];

  /** Names of all created CloudWatch metrics (in `Sunlit/Security` namespace). */
  readonly metricNames: string[];
}
