import { beforeEach, describe, expect, it } from "vitest";
import type { PolicyResource, ResourceValidationArgs, StackValidationArgs } from "@pulumi/policy";

import {
  detect1CriticalAlarmActionsRequired,
  detect2SecurityServiceDisablementRequired,
  detect3NoCatchAllDetectionRules,
  hulumiHardeningPackMetadata,
} from "../src";

function makeResourceArgs(partial: Partial<ResourceValidationArgs>): ResourceValidationArgs {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    opts: {} as ResourceValidationArgs["opts"],
    isType: (() => false) as ResourceValidationArgs["isType"],
    asType: ((): undefined => undefined) as ResourceValidationArgs["asType"],
    getConfig: (() => ({})) as ResourceValidationArgs["getConfig"],
    ...partial,
  } as ResourceValidationArgs;
}

function makePolicyResource(partial: Partial<PolicyResource>): PolicyResource {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    dependencies: [],
    propertyDependencies: {},
    ...partial,
  } as PolicyResource;
}

function makeStackArgs(
  resources: PolicyResource[],
  config: Record<string, unknown> = {},
): StackValidationArgs {
  return {
    resources,
    getConfig: (() => config) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

let violations: string[];
const report = (msg: string): void => {
  violations.push(msg);
};

beforeEach(() => {
  violations = [];
});

describe("Security detection policy backstops", () => {
  it("DETECT-1 rejects startup-hardened critical alarms with no actions", () => {
    const args = makeResourceArgs({
      type: "aws:cloudwatch/metricAlarm:MetricAlarm",
      urn: "urn:p::p::aws:cloudwatch/metricAlarm:MetricAlarm::critical",
      name: "critical",
      props: {
        alarmActions: [],
        tags: {
          "hulumi:component": "SecurityDetectionFoundation",
          "hulumi:tier": "startup-hardened",
          "hulumi:detection-severity": "critical",
        },
      },
    });

    (
      detect1CriticalAlarmActionsRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("DETECT-1");
  });

  it("DETECT-2 requires the security-service-disablement family when detection is mandatory", () => {
    const args = makeStackArgs([], { requireSecurityDetectionFoundation: "startup-hardened" });

    (
      detect2SecurityServiceDisablementRequired.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("DETECT-2");
  });

  it("DETECT-2 accepts a disablement rule with a target", () => {
    const rule = makePolicyResource({
      type: "aws:cloudwatch/eventRule:EventRule",
      urn: "urn:p::p::aws:cloudwatch/eventRule:EventRule::disable",
      name: "disable",
      props: {
        name: "detect-security-service-disablement",
        tags: {
          "hulumi:component": "SecurityDetectionFoundation",
          "hulumi:detection-family": "security-service-disablement",
        },
      },
    });
    const target = makePolicyResource({
      type: "aws:cloudwatch/eventTarget:EventTarget",
      urn: "urn:p::p::aws:cloudwatch/eventTarget:EventTarget::disable",
      name: "disable",
      props: {
        rule: "detect-security-service-disablement",
        arn: "arn:aws:sns:us-east-1:111122223333:alerts-critical",
      },
    });
    const args = makeStackArgs([rule, target], {
      requireSecurityDetectionFoundation: "startup-hardened",
    });

    (
      detect2SecurityServiceDisablementRequired.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(0);
  });

  it("DETECT-3 rejects broad catch-all event patterns unless advisory", () => {
    const args = makeResourceArgs({
      type: "aws:cloudwatch/eventRule:EventRule",
      urn: "urn:p::p::aws:cloudwatch/eventRule:EventRule::catch-all",
      name: "catch-all",
      props: {
        eventPattern: JSON.stringify({ source: ["*"] }),
        tags: {
          "hulumi:component": "SecurityDetectionFoundation",
          "hulumi:detection-family": "custom",
        },
      },
    });

    (
      detect3NoCatchAllDetectionRules.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("DETECT-3");
  });

  it("metadata includes the DETECT rule family", () => {
    const ids = hulumiHardeningPackMetadata.rules.map((rule) => rule.id);
    expect(ids).toEqual(expect.arrayContaining(["DETECT-1", "DETECT-2", "DETECT-3"]));
  });
});
