// M3 smoke test: instantiate both AccountFoundation tiers under Pulumi
// mocks and assert the expected tier-appropriate sub-resource set.

import { describe, it, expect } from "vitest";
import * as pulumi from "@pulumi/pulumi";

interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}

const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    registrations.push({
      type: args.type,
      name: args.name,
      inputs: { ...(args.inputs as Record<string, unknown>) },
    });
    const baseState: Record<string, unknown> = {
      ...(args.inputs as Record<string, unknown>),
    };
    baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
    return { id: `${args.name}_id`, state: baseState };
  },
  call: (args: pulumi.runtime.MockCallArgs) => {
    if (args.token === "aws:index/getCallerIdentity:getCallerIdentity") {
      return {
        accountId: "111122223333",
        arn: "arn:aws:iam::111122223333:user/mock",
        userId: "MOCKID",
      };
    }
    if (args.token === "aws:index/getRegion:getRegion") {
      return {
        name: "us-east-1",
        description: "US East (N. Virginia)",
        endpoint: "ec2.us-east-1.amazonaws.com",
      };
    }
    return args.inputs;
  },
});

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("examples/account-foundation-smoke — preview emits expected tier diff", () => {
  it("creates sandbox + startup-hardened AccountFoundations with tier-appropriate sub-resources", async () => {
    registrations.length = 0;
    await import("../index");
    await settle();

    const sandboxTypes = new Set(
      registrations.filter((r) => r.name.startsWith("smoke-sandbox")).map((r) => r.type),
    );
    const hardenedTypes = new Set(
      registrations.filter((r) => r.name.startsWith("smoke-hardened")).map((r) => r.type),
    );

    // Both tiers share the baseline composition.
    for (const t of [
      "aws:kms/key:Key",
      "aws:cloudtrail/trail:Trail",
      "aws:guardduty/detector:Detector",
      "aws:securityhub/account:Account",
    ]) {
      expect(sandboxTypes.has(t)).toBe(true);
      expect(hardenedTypes.has(t)).toBe(true);
    }

    // Hardened-only deltas.
    for (const t of [
      "aws:accessanalyzer/analyzer:Analyzer",
      "aws:guardduty/detectorFeature:DetectorFeature",
      "aws:cfg/configurationAggregator:ConfigurationAggregator",
      "aws:cloudwatch/logGroup:LogGroup",
    ]) {
      expect(sandboxTypes.has(t)).toBe(false);
      expect(hardenedTypes.has(t)).toBe(true);
    }
  });
});
