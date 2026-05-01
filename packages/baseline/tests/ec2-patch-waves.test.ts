import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Ec2PatchWaves, EC2_PATCH_WAVES_COMPONENT_TYPE } from "../src/aws";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

beforeEach(() => {
  resetRegistrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const waveBase = {
  scheduleCron: "cron(0 4 ? * SUN *)",
  serviceRoleArn: "arn:aws:iam::111:role/SsmRole",
  resourceDataSyncBucketName: "patch-bucket",
  complianceMetric: { topicArn: "arn:aws:sns:us-east-1:111:topic/security" },
};

describe("Ec2PatchWaves — happy paths", () => {
  test("startup-hardened tier requires all three waves and emits the composite alarm health gate", async () => {
    const c = new Ec2PatchWaves("waves", {
      tier: "startup-hardened",
      dev: { ...waveBase, scheduleCron: "cron(0 1 ? * MON *)" },
      staging: { ...waveBase, scheduleCron: "cron(0 3 ? * WED *)" },
      production: { ...waveBase, scheduleCron: "cron(0 5 ? * SUN *)" },
    });
    await settlePulumi();
    expect(registrations.some((r) => r.type === EC2_PATCH_WAVES_COMPONENT_TYPE)).toBe(true);
    expect(
      registrations.some((r) => r.type === "aws:cloudwatch/compositeAlarm:CompositeAlarm"),
    ).toBe(true);
    const names = await valueOf(c.waveNames);
    expect(names).toEqual(["waves-dev", "waves-staging", "waves-production"]);
  });

  test("sandbox tier degrades cleanly to single-wave (dev only)", async () => {
    const c = new Ec2PatchWaves("waves", {
      tier: "sandbox",
      dev: waveBase,
    });
    await settlePulumi();
    expect(
      registrations.some((r) => r.type === "aws:cloudwatch/compositeAlarm:CompositeAlarm"),
    ).toBe(false);
    const names = await valueOf(c.waveNames);
    expect(names).toEqual(["waves-dev"]);
  });
});

describe("Ec2PatchWaves — invalid input refusals", () => {
  test("startup-hardened without staging refused", () => {
    expect(
      () =>
        new Ec2PatchWaves("c", {
          tier: "startup-hardened",
          dev: waveBase,
          production: waveBase,
        }),
    ).toThrow(/requires all three waves/);
  });

  test("startup-hardened without production refused", () => {
    expect(
      () =>
        new Ec2PatchWaves("c", {
          tier: "startup-hardened",
          dev: waveBase,
          staging: waveBase,
        }),
    ).toThrow(/requires all three waves/);
  });
});
