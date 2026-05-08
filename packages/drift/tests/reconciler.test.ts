import { describe, expect, it } from "vitest";

import {
  OrphanReconciler,
  type ReconcilePlanAction,
  type ReconcileTarget,
} from "../src/reconciler";

const NOW = new Date("2026-05-08T12:00:00.000Z");

function s3Target(overrides: Partial<ReconcileTarget> = {}): ReconcileTarget {
  return {
    inState: false,
    existsInCloud: true,
    identity: {
      provider: "aws",
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:sandbox::hulumi::aws:s3/bucketV2:BucketV2::logs",
      physicalId: "af-e2e-abc123-logs",
      region: "us-east-1",
      accountId: "123456789012",
      createdAt: "2026-05-08T10:00:00.000Z",
      tags: { "hulumi:component": "AccountFoundation" },
    },
    ownership: [
      { signal: "name-prefix", subject: "af-e2e-abc123-logs", confidence: "high" },
      { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
    ],
    ...overrides,
  };
}

describe("OrphanReconciler", () => {
  it("rejects empty, wildcard, and broad prefixes", () => {
    const reconciler = new OrphanReconciler();
    for (const resourcePrefix of ["", "*", "prod", "abc"]) {
      expect(() =>
        reconciler.plan({
          now: NOW,
          scope: { resourcePrefix },
          targets: [],
        }),
      ).toThrow(/broad or empty resourcePrefix/);
    }
  });

  it("produces deterministic redacted plans for fixed inputs", () => {
    const reconciler = new OrphanReconciler();
    const request = {
      now: NOW,
      nonce: "fixed",
      mode: "sweep-only" as const,
      scope: {
        resourcePrefix: "af-e2e-abc123",
        regions: ["us-east-1"],
        accountIds: ["123456789012"],
        minAgeMinutes: 15,
      },
      targets: [s3Target()],
    };

    const first = reconciler.plan(request);
    const second = reconciler.plan(request);

    expect(first).toEqual(second);
    expect(first.actions[0]?.recommendedAction).toBe("deleteCloudResource");
    expect(first.actions[0]?.executable).toBe(true);
    expect(JSON.stringify(first)).not.toContain("123456789012");
    expect(JSON.stringify(first)).not.toContain("af-e2e-abc123-logs");
  });

  it("blocks cloud-only resources without multiple ownership signals", () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123", ownershipMinSignals: 2 },
      targets: [
        s3Target({
          ownership: [
            { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
          ],
        }),
      ],
    });

    expect(plan.executable).toBe(false);
    expect(plan.actions[0]?.recommendedAction).toBe("blocked");
    expect(plan.actions[0]?.blockedActions.map((b) => b.reason)).toContain(
      "insufficient ownership evidence",
    );
  });

  it("blocks cloud-only resources when no explicit prefix is provided", () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: {},
      targets: [s3Target()],
    });

    expect(plan.executable).toBe(false);
    expect(plan.actions[0]?.recommendedAction).toBe("blocked");
    expect(plan.actions[0]?.blockedActions.map((b) => b.reason)).toContain(
      "resourcePrefix is required for cloud-only resources",
    );
  });

  it("retains shared singletons by default", () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [
        {
          ...s3Target(),
          identity: {
            ...s3Target().identity,
            type: "aws:guardduty/detector:Detector",
            physicalId: "af-e2e-abc123-detector",
            singleton: true,
          },
        },
      ],
    });

    expect(plan.actions[0]?.recommendedAction).toBe("retainExternal");
    expect(plan.actions[0]?.type).toBe("retainSharedSingleton");
    expect(plan.actions[0]?.executable).toBe(false);
  });

  it("refuses execute when the confirmation token is changed", async () => {
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [s3Target()],
    });

    await expect(
      new OrphanReconciler().execute(plan, {
        confirmToken: `${plan.confirmToken}x`,
      }),
    ).rejects.toThrow(/confirmation token/);
  });

  it("executes with raw in-memory resource identifiers while keeping the plan artifact redacted", async () => {
    const seen: ReconcilePlanAction[] = [];
    const reconciler = new OrphanReconciler({
      executors: {
        drainS3BucketVersions: {
          execute: async (action) => {
            seen.push(action);
            return { actionId: action.id, status: "succeeded", counts: { deletedVersions: 0 } };
          },
        },
      },
    });
    const plan = reconciler.plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [s3Target()],
    });

    await reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });

    expect(plan.actions[0]?.resource.physicalId).toMatch(/^<redacted:/);
    expect(seen[0]?.resource.physicalId).toBe("af-e2e-abc123-logs");
  });
});
