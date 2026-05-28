import { beforeEach, describe, expect, test } from "vitest";

import {
  SECURITY_DETECTION_FOUNDATION_COMPONENT_TYPE,
  SECURITY_DETECTION_EVENT_PATTERNS,
  SECURITY_DETECTION_SAMPLE_EVENTS,
  SecurityDetectionFoundation,
  assertSecurityDetectionPatternNotCatchAll,
  matchesSecurityDetectionPattern,
} from "../src/aws/security-detection-foundation";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const args = {
  tier: "startup-hardened" as const,
  trailLogGroupName: "/aws/cloudtrail/prod",
  criticalTopicArn: "arn:aws:sns:us-east-1:111122223333:alerts-critical",
  highTopicArn: "arn:aws:sns:us-east-1:111122223333:alerts-high",
  mediumTopicArn: "arn:aws:sns:us-east-1:111122223333:alerts-medium",
  namePrefix: "prod",
};

function eventRules() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/eventRule:EventRule");
}

function eventTargets() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/eventTarget:EventTarget");
}

function metricAlarms() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm");
}

describe("SecurityDetectionFoundation", () => {
  beforeEach(resetRegistrations);

  test("critical alarm families create routed rules and compose IdentityAlarms", async () => {
    const foundation = new SecurityDetectionFoundation("detect", args);
    await valueOf(foundation.enabledFamilies);
    await settlePulumi();

    expect(registrations.some((r) => r.type === SECURITY_DETECTION_FOUNDATION_COMPONENT_TYPE)).toBe(
      true,
    );
    expect(metricAlarms().filter((r) => String(r.inputs.name).includes("identity"))).toHaveLength(
      6,
    );

    const rules = eventRules();
    expect(rules.map((r) => r.inputs.tags as Record<string, string>)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "hulumi:detection-family": "security-service-disablement",
          "hulumi:detection-severity": "critical",
        }),
        expect.objectContaining({
          "hulumi:detection-family": "cloudtrail-kms-config",
          "hulumi:detection-severity": "critical",
        }),
      ]),
    );

    for (const rule of rules) {
      const ruleName = rule.inputs.name;
      expect(eventTargets().some((target) => target.inputs.rule === ruleName)).toBe(true);
    }
  });

  test("critical empty action is refused in startup-hardened mode", () => {
    expect(
      () =>
        new SecurityDetectionFoundation("detect", {
          ...args,
          criticalTopicArn: "",
        }),
    ).toThrow(/criticalTopicArn.*required/);
  });

  test("optional medium advisory family is visibly disabled when no medium topic is supplied", async () => {
    const foundation = new SecurityDetectionFoundation("detect", {
      tier: args.tier,
      trailLogGroupName: args.trailLogGroupName,
      criticalTopicArn: args.criticalTopicArn,
      highTopicArn: args.highTopicArn,
      namePrefix: args.namePrefix,
      enabledFamilies: { "advisory-cost-anomaly": true },
    });
    expect(await valueOf(foundation.disabledAdvisoryFamilies)).toContain("advisory-cost-anomaly");
    await settlePulumi();

    expect(
      eventRules().some((rule) =>
        JSON.stringify(rule.inputs.tags).includes("advisory-cost-anomaly"),
      ),
    ).toBe(false);
  });

  test("alarm family enum is bounded at runtime", () => {
    expect(
      () =>
        new SecurityDetectionFoundation("detect", {
          ...args,
          enabledFamilies: { "unknown-family": true } as never,
        }),
    ).toThrow(/unknown alarm family/);
  });

  test("sample events match their family patterns and mismatches fail", () => {
    expect(
      matchesSecurityDetectionPattern(
        SECURITY_DETECTION_EVENT_PATTERNS["security-service-disablement"],
        SECURITY_DETECTION_SAMPLE_EVENTS["security-service-disablement"],
      ),
    ).toBe(true);
    expect(
      matchesSecurityDetectionPattern(
        SECURITY_DETECTION_EVENT_PATTERNS["security-service-disablement"],
        SECURITY_DETECTION_SAMPLE_EVENTS["state-backend"],
      ),
    ).toBe(false);
  });

  test("broad catch-all event patterns are rejected unless explicitly advisory", () => {
    expect(() =>
      assertSecurityDetectionPatternNotCatchAll({ source: ["*"] }, "custom-catch-all", false),
    ).toThrow(/catch-all/);
    expect(() =>
      assertSecurityDetectionPatternNotCatchAll({ source: ["*"] }, "custom-catch-all", true),
    ).not.toThrow();
  });
});
