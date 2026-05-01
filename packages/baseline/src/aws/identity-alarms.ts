// IdentityAlarms — top-N identity-layer CloudWatch alarms fed by
// CloudTrail-to-CloudWatch-Logs.
//
// Tracked in #48. The canonical 6 events covered here are the ones with
// the highest blast radius if missed:
//
//   1. Root account API use                CRITICAL
//   2. IAM access key creation             HIGH
//   3. MFA disabled                        CRITICAL
//   4. IAM role policy change              HIGH
//   5. CloudTrail tampered (stop/delete)   CRITICAL
//   6. Console login without MFA           HIGH
//
// Consumer wiring: feed `trailLogGroupName` from a CT-to-CWL setup
// (today: AccountFoundation startup-hardened tier creates one but
// doesn't yet expose its name as an output — tracked in #47); feed
// the SNS topic ARNs from MonitoringFoundation (#46).

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { assertValidTier } from "./tier";

import type { IdentityAlarmsArgs, IdentityAlarmExtraEvent } from "./identity-alarms.args";
import type { IdentityAlarmsOutputs } from "./identity-alarms.outputs";

export const IDENTITY_ALARMS_COMPONENT_TYPE = "hulumi:baseline:aws:IdentityAlarms";

const METRIC_NAMESPACE = "Hulumi/IdentityAlarms";

const CONTROLS_CLAIMED: readonly string[] = [
  "CIS-AWS-v5.0.0:3.4", // Log metric filter and alarm exists for unauthorized API calls
  "CIS-AWS-v5.0.0:3.5", // Log metric filter for management console login w/o MFA
  "CIS-AWS-v5.0.0:3.6", // Log metric filter for root user
  "CIS-AWS-v5.0.0:3.10", // Log metric filter for IAM policy changes
  "CIS-AWS-v5.0.0:4.5", // Log metric filter for CloudTrail config changes
  "CCM:LOG-04",
  "NIST-800-53-r5:AU-6", // Audit Record Review, Analysis, and Reporting
  "NIST-800-53-r5:IR-6", // Incident Reporting
];

interface CanonicalEvent {
  name: string;
  severity: "CRITICAL" | "HIGH";
  description: string;
  pattern: string;
  metricName: string;
}

const CANONICAL_EVENTS: readonly CanonicalEvent[] = [
  {
    name: "root-account-use",
    severity: "CRITICAL",
    description:
      "Root account API call detected. Root MUST NOT be used for daily ops. Investigate via CloudTrail event history NOW.",
    pattern:
      '{ ($.userIdentity.type = "Root") && ($.userIdentity.invokedBy NOT EXISTS) && ($.eventType != "AwsServiceEvent") }',
    metricName: "RootAccountUse",
  },
  {
    name: "iam-access-key-created",
    severity: "HIGH",
    description:
      "An IAM access key was created. Verify this was intentional (CreateAccessKey API call).",
    pattern: '{ ($.eventName = "CreateAccessKey") }',
    metricName: "IamAccessKeyCreated",
  },
  {
    name: "mfa-disabled",
    severity: "CRITICAL",
    description:
      "MFA was disabled or a virtual MFA device deleted. Common precursor to account-takeover. Investigate IMMEDIATELY.",
    pattern:
      '{ ($.eventName = "DeactivateMFADevice") || ($.eventName = "DeleteVirtualMFADevice") }',
    metricName: "MfaDisabled",
  },
  {
    name: "iam-role-policy-change",
    severity: "HIGH",
    description:
      "IAM role policy attach/detach/put. Verify the change is expected and within scope.",
    pattern:
      '{ ($.eventName = "AttachRolePolicy") || ($.eventName = "DetachRolePolicy") || ($.eventName = "PutRolePolicy") || ($.eventName = "DeleteRolePolicy") }',
    metricName: "IamRolePolicyChange",
  },
  {
    name: "cloudtrail-tampering",
    severity: "CRITICAL",
    description:
      "CloudTrail logging was stopped, deleted, or modified. This is what attackers do to hide their tracks. Investigate IMMEDIATELY.",
    pattern:
      '{ ($.eventName = "StopLogging") || ($.eventName = "DeleteTrail") || ($.eventName = "UpdateTrail") }',
    metricName: "CloudTrailTampering",
  },
  {
    name: "console-login-no-mfa",
    severity: "HIGH",
    description:
      "AWS Console login succeeded WITHOUT MFA. Should never happen with SSO; investigate which account/user.",
    pattern:
      '{ ($.eventName = "ConsoleLogin") && ($.additionalEventData.MFAUsed != "Yes") && ($.userIdentity.type != "AssumedRole") }',
    metricName: "ConsoleLoginNoMfa",
  },
] as const;

function buildTags(
  tier: IdentityAlarmsArgs["tier"],
  extra: Record<string, string> | undefined,
): Record<string, string> {
  return {
    "hulumi:component": "IdentityAlarms",
    "hulumi:tier": tier,
    "hulumi:controls": CONTROLS_CLAIMED.join("+"),
    ...(extra ?? {}),
  };
}

function metricNameFor(eventName: string): string {
  // `s3-bucket-policy-change` → `S3BucketPolicyChange`
  return eventName
    .split("-")
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

export class IdentityAlarms extends pulumi.ComponentResource implements IdentityAlarmsOutputs {
  public readonly alarms: Record<string, aws.cloudwatch.MetricAlarm>;
  public readonly alarmArns: pulumi.Output<string>[];
  public readonly metricNames: string[];

  constructor(name: string, args: IdentityAlarmsArgs, opts?: pulumi.ComponentResourceOptions) {
    super(IDENTITY_ALARMS_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    const tags = buildTags(args.tier, args.extraTags);
    const namePrefix = args.namePrefix ?? name;
    const parent = { parent: this } as const;

    this.alarms = {};
    this.alarmArns = [];
    this.metricNames = [];

    const allEvents: Array<CanonicalEvent | (IdentityAlarmExtraEvent & { metricName?: string })> = [
      ...CANONICAL_EVENTS,
      ...(args.additionalEvents ?? []),
    ];

    for (const event of allEvents) {
      const metricName =
        "metricName" in event && event.metricName !== undefined
          ? event.metricName
          : metricNameFor(event.name);
      this.metricNames.push(metricName);

      const filter = new aws.cloudwatch.LogMetricFilter(
        `${name}-filter-${event.name}`,
        {
          name: `${namePrefix}-identity-${event.name}`,
          logGroupName: args.trailLogGroupName,
          pattern: event.pattern,
          metricTransformation: {
            name: metricName,
            namespace: METRIC_NAMESPACE,
            value: "1",
            defaultValue: "0",
          },
        },
        parent,
      );

      const topicArn = event.severity === "CRITICAL" ? args.criticalTopicArn : args.highTopicArn;

      const baseDescription = `${event.severity}: ${event.description}`;
      // For typing: alarm description is `pulumi.Input<string> | undefined`.
      // We accept a runbookUrl that may be a literal or an Output and
      // concat via interpolate so both shapes work.
      const description: pulumi.Input<string> =
        args.runbookUrl !== undefined
          ? pulumi.interpolate`${baseDescription} | Runbook: ${args.runbookUrl}`
          : baseDescription;

      const alarm = new aws.cloudwatch.MetricAlarm(
        `${name}-alarm-${event.name}`,
        {
          name: `${namePrefix}-identity-${event.name}`,
          metricName,
          namespace: METRIC_NAMESPACE,
          statistic: "Sum",
          period: 60,
          evaluationPeriods: 1,
          threshold: 1,
          comparisonOperator: "GreaterThanOrEqualToThreshold",
          treatMissingData: "notBreaching",
          alarmDescription: description,
          alarmActions: [topicArn],
          okActions: [topicArn],
          tags: { ...tags, Severity: event.severity, Event: event.name },
        },
        { ...parent, dependsOn: [filter] },
      );

      this.alarms[event.name] = alarm;
      this.alarmArns.push(alarm.arn);
    }

    this.registerOutputs({});
  }
}
