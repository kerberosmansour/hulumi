// MonitoringFoundation args.

import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

/** Severity tiers used to route alerts. Stable; do not reorder. */
export const ALERT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * One subscription endpoint to attach to a per-severity SNS topic.
 *
 * `protocol`/`endpoint` map directly onto `aws.sns.TopicSubscription`. The
 * SNS confirmation flow applies — for `email`/`email-json`, AWS sends a
 * confirmation message and the subscription is `PendingConfirmation` until
 * the recipient clicks the link.
 */
export interface AlertSubscriptionInput {
  /** SNS subscription protocol — see aws.sns.TopicSubscription docs. */
  protocol: pulumi.Input<
    | "email"
    | "email-json"
    | "https"
    | "http"
    | "lambda"
    | "sqs"
    | "application"
    | "sms"
  >;
  /** Endpoint for this protocol (e.g., email address, https URL, queue ARN). */
  endpoint: pulumi.Input<string>;
}

/**
 * Subscriptions keyed by severity. Each tier's array can be empty or
 * omitted — the topic still gets created, just with no subscribers.
 */
export type AlertSubscriptionsBySeverity = Partial<
  Record<AlertSeverity, AlertSubscriptionInput[]>
>;

export interface MonitoringFoundationArgs {
  /**
   * Tier — `sandbox` and `startup-hardened` produce identical SNS topology
   * today. The tier tag is preserved so future enhancements (e.g.,
   * KMS-CMK-encrypted topics in startup-hardened) have a knob to flip.
   */
  tier: Tier;

  /**
   * Optional subscriptions per severity tier. Missing tiers get no
   * subscriptions; the topic still exists and any alarm can publish to it.
   *
   * Severity-to-routing convention (from
   * docs/aws-sre-maintenance-guide.md §4.8):
   *  - critical → page (PagerDuty/phone) + email + Slack
   *  - high     → Slack #alerts-prod + email
   *  - medium   → Slack #alerts
   *  - low      → email digest
   */
  subscriptions?: AlertSubscriptionsBySeverity;

  /**
   * Optional KMS CMK ARN for SNS topic encryption. If omitted, AWS-owned
   * encryption is used (default; no key policy fuss). Provide a CMK only
   * if the alarm payloads themselves need to be encrypted with a key you
   * control — alarm names + metric values + runbook URLs are typically
   * not sensitive enough to require a CMK.
   *
   * The CMK's key policy MUST grant `kms:GenerateDataKey*` and `kms:Decrypt`
   * to the SNS service principal under a `kms:ViaService` condition for
   * `sns.<region>.amazonaws.com`.
   */
  kmsKeyArn?: pulumi.Input<string>;

  /**
   * Optional namePrefix for the four SNS topics. Default: the component
   * instance name. Topic names will be `${namePrefix}-alerts-${severity}`.
   */
  namePrefix?: string;

  /**
   * Optional extra tags merged into the per-tier component tags.
   */
  extraTags?: Record<string, string>;
}
