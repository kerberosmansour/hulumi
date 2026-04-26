// IdentityAlarms args.

import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

/**
 * Optional extra event to alarm on, added to the canonical 6 baked into
 * IdentityAlarms. The CloudTrail JSON pattern documentation:
 *   https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html
 */
export interface IdentityAlarmExtraEvent {
  /**
   * Short kebab-case key. Used in resource names and CloudWatch metric
   * name. e.g., `s3-bucket-policy-change`.
   */
  name: string;
  severity: "CRITICAL" | "HIGH";
  /** Human-readable description (used in the alarm body + email subject). */
  description: string;
  /**
   * CloudTrail event filter pattern (CloudWatch Logs Insights JSON syntax).
   * e.g., `{ ($.eventName = "PutBucketPolicy") }`.
   */
  pattern: string;
}

export interface IdentityAlarmsArgs {
  /**
   * Tier. `sandbox` ships the canonical 6 alarms only. `startup-hardened`
   * is reserved for future expansion (e.g., session-token theft signals).
   * No load-bearing tier delta today — see issue #48.
   */
  tier: Tier;

  /**
   * CloudWatch Logs group name where CloudTrail events are streamed.
   * Source this from `AccountFoundation.cloudTrailLogGroupName` (post-
   * upstream-issue #47) or any equivalent CT-to-CWL setup.
   */
  trailLogGroupName: pulumi.Input<string>;

  /** SNS topic ARN for CRITICAL alarms. From MonitoringFoundation.criticalArn. */
  criticalTopicArn: pulumi.Input<string>;

  /** SNS topic ARN for HIGH alarms. From MonitoringFoundation.highArn. */
  highTopicArn: pulumi.Input<string>;

  /**
   * Runbook URL appended to every alarm description. Helps the on-call
   * engineer find the playbook entry for the firing alarm.
   * Recommend a section anchor pointing at "identity layer" in your
   * SRE doc.
   */
  runbookUrl?: pulumi.Input<string>;

  /**
   * Optional additional alarms beyond the canonical 6. Each renders as
   * a metric filter + alarm with the same naming and topic-routing
   * conventions.
   */
  additionalEvents?: IdentityAlarmExtraEvent[];

  /**
   * Optional namePrefix. Default: the component instance name.
   */
  namePrefix?: string;

  /** Optional extra tags merged into the per-tier component tags. */
  extraTags?: Record<string, string>;
}
