// IdentityAlarms BDD tests — canonical 6 events become 6 metric filters
// + 6 alarms by default, with topic routing by severity.

import { describe, it, expect, beforeEach } from "vitest";

import { IdentityAlarms } from "../src/aws/identity-alarms";
import { registrations, resetRegistrations, valueOf, settlePulumi } from "./setup";

const TRAIL_LOG_GROUP = "/aws/cloudtrail/test-trail";
const CRITICAL_ARN = "arn:aws:sns:us-east-1:111122223333:alerts-critical";
const HIGH_ARN = "arn:aws:sns:us-east-1:111122223333:alerts-high";

const CANONICAL_EVENT_NAMES = [
  "root-account-use",
  "iam-access-key-created",
  "mfa-disabled",
  "iam-role-policy-change",
  "cloudtrail-tampering",
  "console-login-no-mfa",
] as const;

describe("IdentityAlarms — canonical 6 events", () => {
  beforeEach(resetRegistrations);

  it("emits 6 metric filters and 6 alarms by default", async () => {
    const ia = new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
    });
    await valueOf(ia.alarmArns[0]);
    await settlePulumi();

    const filters = registrations.filter(
      (r) => r.type === "aws:cloudwatch/logMetricFilter:LogMetricFilter",
    );
    expect(filters).toHaveLength(6);

    const alarms = registrations.filter(
      (r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm",
    );
    expect(alarms).toHaveLength(6);
  });

  it("each canonical event name has both a filter and an alarm", async () => {
    new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
    });
    await settlePulumi();

    const filterNames = registrations
      .filter((r) => r.type === "aws:cloudwatch/logMetricFilter:LogMetricFilter")
      .map((r) => r.inputs.name as string)
      .sort();

    for (const event of CANONICAL_EVENT_NAMES) {
      expect(filterNames).toContain(`ia-identity-${event}`);
    }
  });

  it("CRITICAL events route to criticalTopicArn", async () => {
    new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
    });
    await settlePulumi();

    const criticalAlarmNames = ["root-account-use", "mfa-disabled", "cloudtrail-tampering"];
    for (const event of criticalAlarmNames) {
      const alarm = registrations.find(
        (r) =>
          r.type === "aws:cloudwatch/metricAlarm:MetricAlarm" &&
          r.inputs.name === `ia-identity-${event}`,
      );
      expect(alarm, `alarm for ${event} should exist`).toBeDefined();
      expect(alarm!.inputs.alarmActions).toEqual([CRITICAL_ARN]);
      expect(alarm!.inputs.okActions).toEqual([CRITICAL_ARN]);
    }
  });

  it("HIGH events route to highTopicArn", async () => {
    new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
    });
    await settlePulumi();

    const highAlarmNames = [
      "iam-access-key-created",
      "iam-role-policy-change",
      "console-login-no-mfa",
    ];
    for (const event of highAlarmNames) {
      const alarm = registrations.find(
        (r) =>
          r.type === "aws:cloudwatch/metricAlarm:MetricAlarm" &&
          r.inputs.name === `ia-identity-${event}`,
      );
      expect(alarm, `alarm for ${event} should exist`).toBeDefined();
      expect(alarm!.inputs.alarmActions).toEqual([HIGH_ARN]);
    }
  });

  it("filter pattern for root-account-use matches the documented JSON shape", async () => {
    new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
    });
    await settlePulumi();

    const rootFilter = registrations.find(
      (r) =>
        r.type === "aws:cloudwatch/logMetricFilter:LogMetricFilter" &&
        r.inputs.name === "ia-identity-root-account-use",
    );
    expect(rootFilter).toBeDefined();
    const pattern = rootFilter!.inputs.pattern as string;
    expect(pattern).toContain('$.userIdentity.type = "Root"');
    expect(pattern).toContain("$.userIdentity.invokedBy NOT EXISTS");
  });

  it("alarm description includes runbookUrl when provided", async () => {
    new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
      runbookUrl: "https://example.com/runbook#identity",
    });
    await settlePulumi();

    const rootAlarm = registrations.find(
      (r) =>
        r.type === "aws:cloudwatch/metricAlarm:MetricAlarm" &&
        r.inputs.name === "ia-identity-root-account-use",
    );
    expect(rootAlarm).toBeDefined();
    const desc = rootAlarm!.inputs.alarmDescription as string;
    expect(desc).toContain("Runbook: https://example.com/runbook#identity");
  });
});

describe("IdentityAlarms — additionalEvents", () => {
  beforeEach(resetRegistrations);

  it("appends extra events on top of the canonical 6", async () => {
    new IdentityAlarms("ia", {
      tier: "sandbox",
      trailLogGroupName: TRAIL_LOG_GROUP,
      criticalTopicArn: CRITICAL_ARN,
      highTopicArn: HIGH_ARN,
      additionalEvents: [
        {
          name: "s3-bucket-policy-change",
          severity: "HIGH",
          description: "S3 bucket policy modified.",
          pattern: '{ ($.eventName = "PutBucketPolicy") }',
        },
      ],
    });
    await settlePulumi();

    const alarms = registrations.filter(
      (r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm",
    );
    expect(alarms).toHaveLength(7);

    const extra = alarms.find(
      (a) => a.inputs.name === "ia-identity-s3-bucket-policy-change",
    );
    expect(extra).toBeDefined();
    expect(extra!.inputs.alarmActions).toEqual([HIGH_ARN]);
    expect(extra!.inputs.metricName).toBe("S3BucketPolicyChange");
  });
});

describe("IdentityAlarms — invalid tier", () => {
  beforeEach(resetRegistrations);

  it("throws on unknown tier", () => {
    expect(
      () =>
        new IdentityAlarms("ia", {
          // @ts-expect-error — intentionally invalid
          tier: "yolo",
          trailLogGroupName: TRAIL_LOG_GROUP,
          criticalTopicArn: CRITICAL_ARN,
          highTopicArn: HIGH_ARN,
        }),
    ).toThrow(/tier/i);
  });
});
