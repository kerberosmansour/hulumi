import { describe, expect, it } from "vitest";

import { OrphanReconciler, type ReconcileTarget } from "../src/reconciler";

const NOW = new Date("2026-05-09T00:00:00.000Z");

function baseTarget(overrides: Partial<ReconcileTarget> = {}): ReconcileTarget {
  return {
    inState: true,
    existsInCloud: true,
    identity: {
      provider: "aws",
      type: "aws:cloudwatch/logGroup:LogGroup",
      urn: "urn:pulumi:sandbox::hulumi::aws:cloudwatch/logGroup:LogGroup::audit",
      physicalId: "af-e2e-abc123-audit",
      region: "us-east-1",
      accountId: "123456789012",
      createdAt: "2026-05-08T22:00:00.000Z",
      tags: { "hulumi:component": "AccountFoundation" },
    },
    ownership: [
      {
        signal: "pulumi-state",
        subject: "urn:pulumi:sandbox::hulumi::aws:cloudwatch/logGroup:LogGroup::audit",
        confidence: "high",
      },
      { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
    ],
    ...overrides,
  };
}

describe("OrphanReconciler state/adoption decisions", () => {
  it("recommends refreshState for state-owned resources only in state mutation modes", () => {
    const target = baseTarget({ supportedActions: ["refreshState"] });
    const readonlyPlan = new OrphanReconciler().plan({
      now: NOW,
      mode: "plan",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [target],
    });
    const statePlan = new OrphanReconciler().plan({
      now: NOW,
      mode: "state-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [target],
    });

    expect(readonlyPlan.actions[0]?.recommendedAction).toBe("refreshState");
    expect(readonlyPlan.actions[0]?.stateMutation).toBe(true);
    expect(readonlyPlan.actions[0]?.cloudMutation).toBe(false);
    expect(readonlyPlan.actions[0]?.executable).toBe(false);

    expect(statePlan.actions[0]?.recommendedAction).toBe("refreshState");
    expect(statePlan.actions[0]?.executable).toBe(true);
  });

  it("recommends importToState for strongly-owned cloud-only resources in adopt-only mode", () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "adopt-only",
      scope: { resourcePrefix: "af-e2e-abc123", ownershipMinSignals: 2 },
      targets: [
        baseTarget({
          inState: false,
          existsInCloud: true,
          supportedActions: ["importToState"],
        }),
      ],
    });

    expect(plan.actions[0]?.recommendedAction).toBe("importToState");
    expect(plan.actions[0]?.allowedActions).toEqual(
      expect.arrayContaining(["importToState", "retainExternal", "deleteCloudResource"]),
    );
    expect(plan.actions[0]?.stateMutation).toBe(true);
    expect(plan.actions[0]?.cloudMutation).toBe(false);
    expect(plan.actions[0]?.executable).toBe(true);
  });

  it("retains unsupported cloud-only non-S3 resources instead of defaulting to delete", () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123", ownershipMinSignals: 2 },
      targets: [
        baseTarget({
          inState: false,
          existsInCloud: true,
          identity: {
            ...baseTarget().identity,
            type: "aws:lambda/function:Function",
            urn: "urn:pulumi:sandbox::hulumi::aws:lambda/function:Function::audit",
            physicalId: "af-e2e-abc123-function",
          },
        }),
      ],
    });

    expect(plan.actions[0]?.recommendedAction).toBe("retainExternal");
    expect(plan.actions[0]?.type).toBe("retainUnsupportedResource");
    expect(plan.actions[0]?.allowedActions).toEqual(
      expect.arrayContaining(["importToState", "retainExternal"]),
    );
    expect(plan.actions[0]?.cloudMutation).toBe(false);
    expect(plan.actions[0]?.executable).toBe(false);
  });

  it("keeps existing S3 sweep planning backwards compatible", () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123", ownershipMinSignals: 2 },
      targets: [
        baseTarget({
          inState: false,
          existsInCloud: true,
          identity: {
            ...baseTarget().identity,
            type: "aws:s3/bucketV2:BucketV2",
            physicalId: "af-e2e-abc123-logs",
          },
        }),
      ],
    });

    expect(plan.actions[0]?.recommendedAction).toBe("deleteCloudResource");
    expect(plan.actions[0]?.type).toBe("drainS3BucketVersions");
    expect(plan.actions[0]?.cloudMutation).toBe(true);
    expect(plan.actions[0]?.executable).toBe(true);
  });
});
