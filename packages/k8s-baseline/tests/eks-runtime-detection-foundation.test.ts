import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as pulumi from "@pulumi/pulumi";

import {
  EksRuntimeDetectionFoundation,
  EKS_RUNTIME_DETECTION_FOUNDATION_COMPONENT_TYPE,
} from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function detectorFeatures() {
  return registrations.filter((r) => r.type === "aws:guardduty/detectorFeature:DetectorFeature");
}
function alarms() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm");
}
function metricFilters() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/logMetricFilter:LogMetricFilter");
}

const baseArgs = {
  clusterName: "prod-eks",
  guardDutyDetectorId: "gd-detector-1",
  auditLogGroupName: "/aws/eks/prod-eks/audit",
  alarmSnsTopicArn: "arn:aws:sns:us-east-1:111:topic/security",
};

describe("EksRuntimeDetectionFoundation — happy paths", () => {
  test("Scenario: GuardDuty audit + runtime monitoring enabled by default (ec2-managed)", async () => {
    const c = new EksRuntimeDetectionFoundation("det", baseArgs);
    await settlePulumi();
    expect(
      registrations.some((r) => r.type === EKS_RUNTIME_DETECTION_FOUNDATION_COMPONENT_TYPE),
    ).toBe(true);
    const features = detectorFeatures();
    const names = features.map((f) => (f.inputs as { name: string }).name).sort();
    expect(names).toEqual(["EKS_AUDIT_LOGS", "EKS_RUNTIME_MONITORING"]);
    expect(await valueOf(c.guardDutyFeaturesEnabled)).toEqual(
      expect.arrayContaining(["EKS_AUDIT_LOGS", "EKS_RUNTIME_MONITORING"]),
    );
    expect(await valueOf(c.runtimeMonitoringUnsupported)).toBe(false);
  });

  test('Scenario: Fargate runtime limitation visible (clusterCompute: "fargate-only")', async () => {
    const warnSpy = vi.spyOn(pulumi.log, "warn").mockResolvedValue();
    const c = new EksRuntimeDetectionFoundation("det", {
      ...baseArgs,
      clusterCompute: "fargate-only",
      enableRuntimeMonitoring: true,
    });
    await settlePulumi();
    const messages = warnSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(messages).toMatch(/fargate-only.*Runtime Monitoring is unsupported/i);
    expect(await valueOf(c.runtimeMonitoringUnsupported)).toBe(true);
    expect(await valueOf(c.guardDutyFeaturesEnabled)).toEqual(["EKS_AUDIT_LOGS"]);
  });

  test("Scenario: Secret-read alarm emitted (filter + alarm pair)", async () => {
    new EksRuntimeDetectionFoundation("det", baseArgs);
    await settlePulumi();
    const filters = metricFilters();
    const secretFilter = filters.find((f) =>
      (f.inputs as { name: string }).name.includes("secret-read"),
    );
    expect(secretFilter).toBeDefined();
    const pattern = (secretFilter!.inputs as { pattern: string }).pattern;
    expect(pattern).toMatch(/objectRef\.resource = "secrets"/);
    expect(pattern).toMatch(/verb = "(get|list|watch)"/);
  });

  test("Scenario: Pod-exec alarm emitted (filter + alarm pair)", async () => {
    new EksRuntimeDetectionFoundation("det", baseArgs);
    await settlePulumi();
    const filters = metricFilters();
    const execFilter = filters.find((f) =>
      (f.inputs as { name: string }).name.includes("pod-exec"),
    );
    expect(execFilter).toBeDefined();
    const pattern = (execFilter!.inputs as { pattern: string }).pattern;
    expect(pattern).toMatch(/objectRef\.resource = "pods"/);
    expect(pattern).toMatch(/objectRef\.subresource = "exec"/);
  });

  test("Scenario: Alarm SNS targets propagate", async () => {
    new EksRuntimeDetectionFoundation("det", baseArgs);
    await settlePulumi();
    const arr = alarms();
    expect(arr.length).toBeGreaterThanOrEqual(2);
    const a = arr[0].inputs as { alarmActions: string[]; okActions: string[] };
    expect(a.alarmActions).toEqual([baseArgs.alarmSnsTopicArn]);
    expect(a.okActions).toEqual([baseArgs.alarmSnsTopicArn]);
  });
});

describe("EksRuntimeDetectionFoundation — invalid input refusals", () => {
  test("invalid clusterCompute refused", () => {
    expect(
      () =>
        new EksRuntimeDetectionFoundation("c", {
          ...baseArgs,
          clusterCompute: "wonky" as unknown as "ec2-managed",
        }),
    ).toThrow(/clusterCompute must be one of/);
  });
});
