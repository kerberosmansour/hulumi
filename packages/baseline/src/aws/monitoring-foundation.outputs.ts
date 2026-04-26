// MonitoringFoundation outputs.

import type * as pulumi from "@pulumi/pulumi";
import type * as aws from "@pulumi/aws";

export interface MonitoringFoundationOutputs {
  /** SNS topic ARN for CRITICAL alerts (page-now severity). */
  readonly criticalArn: pulumi.Output<string>;
  /** SNS topic ARN for HIGH alerts (urgent within 15 min). */
  readonly highArn: pulumi.Output<string>;
  /** SNS topic ARN for MEDIUM alerts (today). */
  readonly mediumArn: pulumi.Output<string>;
  /** SNS topic ARN for LOW alerts (weekly digest). */
  readonly lowArn: pulumi.Output<string>;

  /**
   * Map keyed by severity tier so consumers can iterate generically:
   *
   *     for (const [severity, arn] of Object.entries(monitoring.topicsBySeverity)) { ... }
   */
  readonly topicsBySeverity: Record<
    "critical" | "high" | "medium" | "low",
    pulumi.Output<string>
  >;

  /** Underlying SNS topic resources, exposed for advanced uses (custom subscriptions, etc). */
  readonly criticalTopic: aws.sns.Topic;
  readonly highTopic: aws.sns.Topic;
  readonly mediumTopic: aws.sns.Topic;
  readonly lowTopic: aws.sns.Topic;
}
