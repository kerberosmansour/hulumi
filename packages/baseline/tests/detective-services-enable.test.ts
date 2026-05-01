import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  DetectiveServicesEnable,
  DETECTIVE_SERVICES_ENABLE_COMPONENT_TYPE,
} from "../src/aws";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const baseArgs = {
  tier: "startup-hardened" as const,
  findingsRoutingSnsArn: "arn:aws:sns:us-east-1:111:topic/security",
};

function eventRules() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/eventRule:EventRule");
}
function eventTargets() {
  return registrations.filter((r) => r.type === "aws:cloudwatch/eventTarget:EventTarget");
}

describe("DetectiveServicesEnable — happy paths", () => {
  test("default — Access Analyzer + Inspector v2 + Cost Anomaly + primary EventBridge route", async () => {
    const c = new DetectiveServicesEnable("det", baseArgs);
    await settlePulumi();
    expect(registrations.some((r) => r.type === DETECTIVE_SERVICES_ENABLE_COMPONENT_TYPE)).toBe(
      true,
    );
    expect(
      registrations.some((r) => r.type === "aws:accessanalyzer/analyzer:Analyzer"),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:inspector2/enabler:Enabler")).toBe(true);
    expect(
      registrations.some((r) => r.type === "aws:costexplorer/anomalyMonitor:AnomalyMonitor"),
    ).toBe(true);
    expect(eventRules()).toHaveLength(1); // primary only
    expect(eventTargets()).toHaveLength(1);
    expect(await valueOf(c.servicesEnabled)).toEqual([
      "AccessAnalyzer",
      "InspectorV2",
      "CostAnomalyDetection",
    ]);
    expect(await valueOf(c.kevDualRoutingActive)).toBe(false);
  });

  test("Scenario: KEV dual routing — Inspector v2 KEV-tagged findings flow to a separate topic", async () => {
    const c = new DetectiveServicesEnable("det", {
      ...baseArgs,
      findingsKevRoutingSnsArn: "arn:aws:sns:us-east-1:111:topic/kev-pager",
    });
    await settlePulumi();
    expect(eventRules()).toHaveLength(2);
    expect(eventTargets()).toHaveLength(2);
    expect(await valueOf(c.kevDualRoutingActive)).toBe(true);
  });

  test("Scenario: additional event patterns each emit their own rule", async () => {
    new DetectiveServicesEnable("det", {
      ...baseArgs,
      additionalEventPatterns: [
        JSON.stringify({ source: ["aws.securityhub"] }),
        JSON.stringify({ source: ["aws.config"] }),
      ],
    });
    await settlePulumi();
    expect(eventRules()).toHaveLength(3); // 1 primary + 2 extras
    expect(eventTargets()).toHaveLength(3);
  });

  test("Scenario: opt-out flips skip the matching service block", async () => {
    new DetectiveServicesEnable("det", {
      ...baseArgs,
      enableAccessAnalyzer: false,
      enableInspectorV2: false,
      enableCostAnomalyDetection: false,
    });
    await settlePulumi();
    expect(
      registrations.some((r) => r.type === "aws:accessanalyzer/analyzer:Analyzer"),
    ).toBe(false);
    expect(registrations.some((r) => r.type === "aws:inspector2/enabler:Enabler")).toBe(false);
    expect(
      registrations.some((r) => r.type === "aws:costexplorer/anomalyMonitor:AnomalyMonitor"),
    ).toBe(false);
  });
});

describe("DetectiveServicesEnable — invalid input refusals", () => {
  test("missing findingsRoutingSnsArn refused", () => {
    expect(
      () =>
        new DetectiveServicesEnable("c", {
          tier: "sandbox",
          findingsRoutingSnsArn: undefined as unknown as string,
        }),
    ).toThrow(/findingsRoutingSnsArn is required/);
  });

  test("invalid additionalEventPatterns (non-JSON) refused", () => {
    expect(
      () =>
        new DetectiveServicesEnable("c", {
          ...baseArgs,
          additionalEventPatterns: ["not-json{"],
        }),
    ).toThrow(/must be valid JSON/);
  });

  test("additionalEventPatterns bound enforced (17 → reject)", () => {
    const tooMany: string[] = [];
    for (let i = 0; i < 17; i++) tooMany.push(JSON.stringify({ source: [`x-${i}`] }));
    expect(
      () =>
        new DetectiveServicesEnable("c", {
          ...baseArgs,
          additionalEventPatterns: tooMany,
        }),
    ).toThrow(/additionalEventPatterns has 17.*max 16/);
  });
});
