// MonitoringFoundation — severity-tiered SNS topics for alert routing.
//
// Tracked in #46. Closes the recurring "every account rebuilds the same
// SNS-topic-per-severity boilerplate" pain.
//
// Topology (4 SNS topics):
//   ${namePrefix}-alerts-critical → page (PagerDuty) + email + Slack
//   ${namePrefix}-alerts-high     → Slack #alerts-prod + email
//   ${namePrefix}-alerts-medium   → Slack #alerts
//   ${namePrefix}-alerts-low      → email digest
//
// Tier delta:
//   sandbox          → AWS-owned encryption.
//   startup-hardened → identical today; reserved for future CMK default
//                      flip + cross-account subscription guards. (Issue
//                      #46 acknowledges no per-tier delta is necessary at
//                      v1; the load-bearing per-tier deltas live in
//                      AccountFoundation per existing convention.)

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { assertValidTier } from "./tier";

import type {
  MonitoringFoundationArgs,
  AlertSeverity,
  AlertSubscriptionInput,
} from "./monitoring-foundation.args";
import { ALERT_SEVERITIES } from "./monitoring-foundation.args";
import type { MonitoringFoundationOutputs } from "./monitoring-foundation.outputs";

export const MONITORING_FOUNDATION_COMPONENT_TYPE =
  "hulumi:baseline:aws:MonitoringFoundation";

const CONTROLS_CLAIMED: readonly string[] = [
  // CIS-AWS v5.0.0 §3.4 — log metric filters and alarms (we don't create
  // the filters here, but we provide the routing target every filter
  // alarm needs).
  "CIS-AWS-v5.0.0:3.4",
  // CCM:LOG-04 — log review and alerting.
  "CCM:LOG-04",
  // NIST 800-53 r5 §IR-6 — incident reporting.
  "NIST-800-53-r5:IR-6",
];

function buildTags(
  tier: MonitoringFoundationArgs["tier"],
  extra: Record<string, string> | undefined,
): Record<string, string> {
  return {
    "hulumi:component": "MonitoringFoundation",
    "hulumi:tier": tier,
    "hulumi:controls": CONTROLS_CLAIMED.join("+"),
    ...(extra ?? {}),
  };
}

export class MonitoringFoundation
  extends pulumi.ComponentResource
  implements MonitoringFoundationOutputs
{
  public readonly criticalTopic: aws.sns.Topic;
  public readonly highTopic: aws.sns.Topic;
  public readonly mediumTopic: aws.sns.Topic;
  public readonly lowTopic: aws.sns.Topic;
  public readonly criticalArn: pulumi.Output<string>;
  public readonly highArn: pulumi.Output<string>;
  public readonly mediumArn: pulumi.Output<string>;
  public readonly lowArn: pulumi.Output<string>;
  public readonly topicsBySeverity: Record<AlertSeverity, pulumi.Output<string>>;

  constructor(
    name: string,
    args: MonitoringFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(MONITORING_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    const tags = buildTags(args.tier, args.extraTags);
    const namePrefix = args.namePrefix ?? name;
    const parent = { parent: this } as const;

    const topics = {} as Record<AlertSeverity, aws.sns.Topic>;
    for (const severity of ALERT_SEVERITIES) {
      const topicArgs: aws.sns.TopicArgs = {
        name: `${namePrefix}-alerts-${severity}`,
        displayName: `${namePrefix} ${severity.toUpperCase()} alerts`,
        tags: { ...tags, Severity: severity },
        ...(args.kmsKeyArn !== undefined ? { kmsMasterKeyId: args.kmsKeyArn } : {}),
      };
      const topic = new aws.sns.Topic(
        `${name}-topic-${severity}`,
        topicArgs,
        parent,
      );
      topics[severity] = topic;

      const subs = args.subscriptions?.[severity] ?? [];
      subs.forEach((sub: AlertSubscriptionInput, i: number) => {
        new aws.sns.TopicSubscription(
          `${name}-sub-${severity}-${String(i)}`,
          {
            topic: topic.arn,
            protocol: sub.protocol,
            endpoint: sub.endpoint,
          },
          parent,
        );
      });
    }

    this.criticalTopic = topics.critical;
    this.highTopic = topics.high;
    this.mediumTopic = topics.medium;
    this.lowTopic = topics.low;

    this.criticalArn = topics.critical.arn;
    this.highArn = topics.high.arn;
    this.mediumArn = topics.medium.arn;
    this.lowArn = topics.low.arn;

    this.topicsBySeverity = {
      critical: this.criticalArn,
      high: this.highArn,
      medium: this.mediumArn,
      low: this.lowArn,
    };

    this.registerOutputs({
      criticalArn: this.criticalArn,
      highArn: this.highArn,
      mediumArn: this.mediumArn,
      lowArn: this.lowArn,
    });
  }
}
