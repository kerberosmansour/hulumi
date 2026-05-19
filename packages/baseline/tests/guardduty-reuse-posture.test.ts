// Regression: M-DETECTIVEREUSE GuardDuty arm.
//
// When `existingGuardDutyDetectorId` is supplied, AccountFoundation must
// not silently accept a suspended or non-FIFTEEN_MINUTES detector. The
// reuse path must invoke aws.guardduty.getDetector and assert posture
// (status === "ENABLED" && findingPublishingFrequency ===
// "FIFTEEN_MINUTES"); a mismatched detector must fail the deployment.
//
// Production wiring: the verified Output is folded into the CIS / NIST
// `standardsArn` input chain in securityhub.ts. On bad posture the
// Output rejects, Pulumi refuses to register the subscription resource,
// and the deploy aborts. The test observes this by wrapping
// `aws.securityhub.StandardsSubscription` and awaiting its
// `standardsArn` input — when the assertion throws, the wrapped Output
// rejects with the same error.
//
// Vitest isolates test files (default pool: threads, isolate: true), so
// the per-file `pulumi.runtime.setMocks` and constructor wrapper below
// only affect this file's resource graph.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { registrations, resetRegistrations, valueOf, settlePulumi } from "./setup";

const IAC_ROLE_ARN = "arn:aws:iam::111122223333:role/hulumi-sandbox-iac-role";
const EXISTING_ID = "existing-detector-123";

// Per-test mutable mock state for the aws:guardduty/getDetector invoke.
let mockDetectorPosture: { status: string; findingPublishingFrequency: string } = {
  status: "ENABLED",
  findingPublishingFrequency: "FIFTEEN_MINUTES",
};

// Capture the `standardsArn` Output of every StandardsSubscription
// constructed in this test file. The negative-path tests await these
// to observe whether the posture-gated chain throws.
const subscriptionStandardsArns: pulumi.Output<string>[] = [];

const OriginalStandardsSubscription = aws.securityhub.StandardsSubscription;
class InstrumentedStandardsSubscription extends OriginalStandardsSubscription {
  constructor(
    name: string,
    args: aws.securityhub.StandardsSubscriptionArgs,
    opts?: pulumi.CustomResourceOptions,
  ) {
    subscriptionStandardsArns.push(pulumi.output(args.standardsArn));
    super(name, args, opts);
  }
}

beforeAll(() => {
  Object.defineProperty(aws.securityhub, "StandardsSubscription", {
    value: InstrumentedStandardsSubscription,
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(aws.securityhub, "StandardsSubscription", {
    value: OriginalStandardsSubscription,
    writable: true,
    configurable: true,
  });
});

// Re-register Pulumi mocks for this file's worker. Extends the global
// setup.ts mocks with a tuned call() that returns the configured
// detector posture for getDetector invokes.
pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    const existingId = args.id !== undefined && args.id.length > 0 ? args.id : undefined;
    registrations.push({
      type: args.type,
      name: args.name,
      inputs: { ...(args.inputs as Record<string, unknown>) },
      ...(existingId !== undefined ? { id: existingId } : {}),
      ...(args.provider !== undefined ? { provider: args.provider } : {}),
    });
    const baseState: Record<string, unknown> = { ...(args.inputs as Record<string, unknown>) };
    if (args.type.startsWith("aws:s3/bucketV2") || args.type.startsWith("aws:s3/bucket")) {
      baseState.arn = baseState.arn ?? `arn:aws:s3:::${args.name}-mock`;
      baseState.bucketDomainName =
        baseState.bucketDomainName ?? `${args.name}-mock.s3.amazonaws.com`;
    } else if (args.type === "aws:cloudwatch/logGroup:LogGroup") {
      baseState.name = baseState.name ?? args.name;
    } else {
      baseState.arn = baseState.arn ?? `arn:aws:mock:${args.type}:${args.name}`;
    }
    return {
      id: existingId ?? `${args.name}_id`,
      state: baseState,
    };
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
    if (args.token === "aws:guardduty/getDetector:getDetector") {
      return {
        id: (args.inputs as { id?: string }).id ?? EXISTING_ID,
        arn: `arn:aws:guardduty:us-east-1:111122223333:detector/${EXISTING_ID}`,
        region: "us-east-1",
        serviceRoleArn: "arn:aws:iam::111122223333:role/aws-service-role/guardduty",
        tags: {},
        features: [],
        status: mockDetectorPosture.status,
        findingPublishingFrequency: mockDetectorPosture.findingPublishingFrequency,
      };
    }
    return args.inputs;
  },
});

// AccountFoundation is imported AFTER setMocks so any module-load
// side effects (none currently) see the per-file mocks.
import { AccountFoundation } from "../src/aws/account-foundation";

// Helper to await a Pulumi Output that may reject (valueOf in setup.ts
// only resolves on success). Used by the negative-path tests below.
function valueOfOrThrow<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      output.apply((value: T) => {
        resolve(value);
        return value;
      });
    } catch (e) {
      reject(e);
    }
    // Pulumi rejects via the underlying promise chain; observe it.
    (output as unknown as { promise: () => Promise<T> }).promise?.().catch(reject);
  });
}

// On the negative-posture tests the rejected gated Output fans out
// across (a) the StandardsSubscription's registerResource input
// serialization, (b) this test file's wrapper capture, (c) Pulumi's
// internal apply chains. Each consumer creates its own promise that
// rejects independently. The test's primary assertion is captured by
// expect(...).rejects.toThrow on subscriptionStandardsArns[0]; the
// fan-out copies emit `unhandledRejection` events that vitest's
// listener captures and surfaces as worker-level errors.
//
// We swap vitest's unhandledRejection listeners with a wrapper that
// drops events whose error message matches the expected
// M-DETECTIVEREUSE posture pattern. Any other unhandled rejection
// still flows through to vitest. Restored in afterAll().
const expectedPosturePattern = /Hulumi baseline requires (status|findingPublishingFrequency)=/;
type NodeListener = (...args: unknown[]) => unknown;
let savedListeners: NodeListener[] = [];

beforeAll(() => {
  savedListeners = process.listeners("unhandledRejection") as unknown as NodeListener[];
  process.removeAllListeners("unhandledRejection");
  for (const listener of savedListeners) {
    process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
      const msg = (reason as { message?: string } | undefined)?.message ?? String(reason);
      if (expectedPosturePattern.test(msg)) {
        return;
      }
      listener(reason, promise);
    });
  }
});

afterAll(() => {
  process.removeAllListeners("unhandledRejection");
  for (const listener of savedListeners) {
    process.on("unhandledRejection", listener as NodeListener);
  }
});

describe("M-DETECTIVEREUSE GuardDuty arm — reused detector posture is asserted", () => {
  beforeEach(() => {
    resetRegistrations();
    subscriptionStandardsArns.length = 0;
    // Reset to a healthy default; each test overrides as needed.
    mockDetectorPosture = { status: "ENABLED", findingPublishingFrequency: "FIFTEEN_MINUTES" };
  });

  it("accepts a reused detector that is ENABLED + FIFTEEN_MINUTES", async () => {
    mockDetectorPosture = { status: "ENABLED", findingPublishingFrequency: "FIFTEEN_MINUTES" };
    const af = new AccountFoundation("af-reuse-ok", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      existingGuardDutyDetectorId: EXISTING_ID,
    });
    await expect(valueOf(af.guardDutyDetectorId)).resolves.toBe(EXISTING_ID);
    await settlePulumi();
    // CIS subscription's posture-gated standardsArn resolves cleanly.
    expect(subscriptionStandardsArns.length).toBeGreaterThan(0);
    for (const arnOutput of subscriptionStandardsArns) {
      await expect(valueOfOrThrow(arnOutput)).resolves.toMatch(/cis-aws-foundations/);
    }
  });

  it("rejects a reused detector whose status is not ENABLED (e.g. SUSPENDED)", async () => {
    mockDetectorPosture = {
      status: "SUSPENDED",
      findingPublishingFrequency: "FIFTEEN_MINUTES",
    };
    new AccountFoundation("af-reuse-suspended", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      existingGuardDutyDetectorId: EXISTING_ID,
    });
    // The standards-subscription standardsArn input is folded into the
    // posture-verified Output, so it must reject on non-ENABLED status.
    expect(subscriptionStandardsArns.length).toBeGreaterThan(0);
    await expect(valueOfOrThrow(subscriptionStandardsArns[0])).rejects.toThrow(/ENABLED/);
  });

  it("rejects a reused detector whose findingPublishingFrequency is not FIFTEEN_MINUTES (e.g. SIX_HOURS)", async () => {
    mockDetectorPosture = {
      status: "ENABLED",
      findingPublishingFrequency: "SIX_HOURS",
    };
    new AccountFoundation("af-reuse-sixhours", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
      existingGuardDutyDetectorId: EXISTING_ID,
    });
    expect(subscriptionStandardsArns.length).toBeGreaterThan(0);
    await expect(valueOfOrThrow(subscriptionStandardsArns[0])).rejects.toThrow(/FIFTEEN_MINUTES/);
  });

  it("net-new (non-reuse) deploys are unaffected by the posture invoke", async () => {
    // No existingGuardDutyDetectorId → no getDetector invoke is required.
    // The detector resource is created with FIFTEEN_MINUTES + enable=true.
    const af = new AccountFoundation("af-netnew", {
      tier: "sandbox",
      iacRoleArn: IAC_ROLE_ARN,
    });
    await expect(valueOf(af.guardDutyDetectorId)).resolves.toBeDefined();
    await settlePulumi();
    const detector = registrations.find((r) => r.type === "aws:guardduty/detector:Detector");
    expect(detector?.inputs.enable).toBe(true);
    expect(detector?.inputs.findingPublishingFrequency).toBe("FIFTEEN_MINUTES");
  });
});
