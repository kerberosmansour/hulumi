import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Ec2PatchBaseline, EC2_PATCH_BASELINE_COMPONENT_TYPE } from "../src/aws";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const baseArgs = {
  patchGroup: "production" as const,
  tier: "startup-hardened" as const,
  scheduleCron: "cron(0 4 ? * SUN *)",
  serviceRoleArn: "arn:aws:iam::111:role/SsmMaintenanceWindowRole",
  resourceDataSyncBucketName: "patch-data-sync-bucket",
  complianceMetric: { topicArn: "arn:aws:sns:us-east-1:111:topic/security" },
};

describe("Ec2PatchBaseline — happy paths", () => {
  test("emits the expected SSM resources + compliance alarm", async () => {
    const c = new Ec2PatchBaseline("prod-patch", baseArgs);
    await settlePulumi();
    expect(registrations.some((r) => r.type === EC2_PATCH_BASELINE_COMPONENT_TYPE)).toBe(true);
    expect(registrations.some((r) => r.type === "aws:ssm/patchBaseline:PatchBaseline")).toBe(true);
    expect(registrations.some((r) => r.type === "aws:ssm/patchGroup:PatchGroup")).toBe(true);
    expect(
      registrations.some((r) => r.type === "aws:ssm/maintenanceWindow:MaintenanceWindow"),
    ).toBe(true);
    expect(
      registrations.some(
        (r) => r.type === "aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget",
      ),
    ).toBe(true);
    expect(
      registrations.some((r) => r.type === "aws:ssm/maintenanceWindowTask:MaintenanceWindowTask"),
    ).toBe(true);
    expect(registrations.some((r) => r.type === "aws:ssm/resourceDataSync:ResourceDataSync")).toBe(
      true,
    );
    expect(registrations.some((r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm")).toBe(
      true,
    );
    expect(await valueOf(c.rebootMode)).toBe("RebootIfNeeded");
    expect(await valueOf(c.staggerBucketCount)).toBe(4);
  });

  test("Patch:Group tag is restricted to {dev, staging, production}", () => {
    expect(
      () =>
        new Ec2PatchBaseline("c", {
          ...baseArgs,
          patchGroup: "qa" as unknown as "dev",
        }),
    ).toThrow(/patchGroup must be one of/);
  });
});

describe("Ec2PatchBaseline — RebootOption discriminated union", () => {
  test("default reboot is RebootIfNeeded", async () => {
    const c = new Ec2PatchBaseline("c", baseArgs);
    await settlePulumi();
    expect(await valueOf(c.rebootMode)).toBe("RebootIfNeeded");
  });

  test("NoReboot requires hulumi_decision_comment >= 8 chars", () => {
    expect(
      () =>
        new Ec2PatchBaseline("c", {
          ...baseArgs,
          tier: "sandbox",
          rebootOption: { kind: "NoReboot", hulumi_decision_comment: "ok" },
        }),
    ).toThrow(/hulumi_decision_comment.*8 chars/);
  });

  test("NoReboot at startup-hardened tier is forbidden (the breach-risk gate)", () => {
    expect(
      () =>
        new Ec2PatchBaseline("c", {
          ...baseArgs,
          rebootOption: {
            kind: "NoReboot",
            hulumi_decision_comment: "tenant-stability-required by mistake",
          },
        }),
    ).toThrow(/NoReboot.*forbidden at tier "startup-hardened"/);
  });

  test("NoReboot at sandbox tier with a real comment succeeds and tags the comment", async () => {
    const c = new Ec2PatchBaseline("c", {
      ...baseArgs,
      tier: "sandbox",
      rebootOption: {
        kind: "NoReboot",
        hulumi_decision_comment: "Long-running batch jobs reboot weekly via separate cron.",
      },
    });
    await settlePulumi();
    expect(await valueOf(c.rebootMode)).toBe("NoReboot");
    expect(await valueOf(c.noRebootDecisionComment)).toMatch(/Long-running batch jobs/);
  });
});

describe("Ec2PatchBaseline — invalid input refusals", () => {
  test("invalid scheduleCron rejected", () => {
    expect(
      () => new Ec2PatchBaseline("c", { ...baseArgs, scheduleCron: "0 4 * * 0" }),
    ).toThrow(/cron\(\.\.\.\) or rate\(\.\.\.\)/);
  });

  test("durationHours out of range rejected", () => {
    expect(() => new Ec2PatchBaseline("c", { ...baseArgs, durationHours: 25 })).toThrow(
      /durationHours must be 1\.\.24/,
    );
  });

  test("cutoffHours >= durationHours rejected", () => {
    expect(
      () =>
        new Ec2PatchBaseline("c", { ...baseArgs, durationHours: 4, cutoffHours: 4 }),
    ).toThrow(/cutoffHours must be 0\.\.durationHours-1/);
  });

  test("staggering.bucketCount > MAX rejected", () => {
    expect(
      () => new Ec2PatchBaseline("c", { ...baseArgs, staggering: { bucketCount: 17 } }),
    ).toThrow(/bucketCount must be 1\.\.16/);
  });

  test("complianceMetric.severities > MAX rejected", () => {
    expect(
      () =>
        new Ec2PatchBaseline("c", {
          ...baseArgs,
          complianceMetric: {
            topicArn: "arn",
            severities: [
              "CRITICAL",
              "IMPORTANT",
              "MEDIUM",
              "LOW",
              "CRITICAL",
            ] as unknown as Array<"CRITICAL">,
          },
        }),
    ).toThrow(/complianceMetric\.severities has 5.*max 4/);
  });
});
