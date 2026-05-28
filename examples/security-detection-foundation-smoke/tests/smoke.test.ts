import { describe, expect, it } from "vitest";
import * as pulumi from "@pulumi/pulumi";

interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}

const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    const inputs = { ...(args.inputs as Record<string, unknown>) };
    registrations.push({ type: args.type, name: args.name, inputs });
    return {
      id: `${args.name}_id`,
      state: {
        ...inputs,
        arn: `arn:aws:mock:${args.type}:${args.name}`,
        name: inputs.name ?? args.name,
      },
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

async function settle(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("examples/security-detection-foundation-smoke", () => {
  it("registers identity alarms plus finite EventBridge detection rules", async () => {
    registrations.length = 0;
    await import("../index");
    await settle();

    expect(
      registrations.some((r) => r.type === "hulumi:baseline:aws:SecurityDetectionFoundation"),
    ).toBe(true);
    expect(
      registrations.filter((r) => r.type === "aws:cloudwatch/metricAlarm:MetricAlarm").length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      registrations.filter((r) => r.type === "aws:cloudwatch/eventRule:EventRule").length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      registrations
        .filter((r) => r.type === "aws:cloudwatch/eventRule:EventRule")
        .every((r) => !JSON.stringify(r.inputs.eventPattern).includes('"*"')),
    ).toBe(true);
  });
});
