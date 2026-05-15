import { describe, expect, it } from "vitest";

import {
  OrphanReconciler,
  type ReconcilePlanAction,
  type ReconcileTarget,
} from "../src/reconciler";

const NOW = new Date("2026-05-08T12:00:00.000Z");

function s3Target(id: string): ReconcileTarget {
  return {
    inState: false,
    existsInCloud: true,
    identity: {
      provider: "aws",
      type: "aws:s3/bucketV2:BucketV2",
      physicalId: `af-e2e-abc123-${id}`,
      region: "us-east-1",
      tags: { "hulumi:component": "AccountFoundation" },
    },
    ownership: [
      { signal: "name-prefix", subject: `af-e2e-abc123-${id}`, confidence: "high" },
      { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
    ],
  };
}

describe("OrphanReconciler execution", () => {
  it("refuses read-only plans before executors run", async () => {
    let calls = 0;
    const reconciler = new OrphanReconciler({
      executors: {
        drainS3BucketVersions: {
          execute: async () => {
            calls += 1;
            return { actionId: "never", status: "succeeded" };
          },
        },
      },
    });
    const plan = reconciler.plan({
      now: NOW,
      mode: "plan",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [s3Target("logs")],
    });

    await expect(reconciler.execute(plan, { confirmToken: plan.confirmToken })).rejects.toThrow(
      /read-only mode/,
    );
    expect(calls).toBe(0);
  });

  it("blocks concurrent execute calls for the same target", async () => {
    let startedResolve!: () => void;
    let release!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reconciler = new OrphanReconciler({
      executors: {
        drainS3BucketVersions: {
          execute: async (action) => {
            startedResolve();
            await gate;
            return { actionId: action.id, status: "succeeded" };
          },
        },
      },
    });
    const plan = reconciler.plan({
      now: NOW,
      mode: "sweep-only",
      scope: { stackName: "sandbox-abc123", resourcePrefix: "af-e2e-abc123" },
      targets: [s3Target("logs")],
    });

    const first = reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });
    await firstStarted;
    const second = await reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });
    release();

    expect(second.results[0]?.status).toBe("blocked");
    expect(second.results[0]?.message).toMatch(/locked/);
    expect((await first).results[0]?.status).toBe("succeeded");
  });

  it("captures executor failures and continues with later actions", async () => {
    const seen: string[] = [];
    const reconciler = new OrphanReconciler({
      executors: {
        drainS3BucketVersions: {
          execute: async (action: ReconcilePlanAction) => {
            seen.push(action.resource.physicalId ?? "");
            if (action.resource.physicalId?.endsWith("bad")) {
              throw new Error("secret bucket af-e2e-abc123-bad failed");
            }
            return { actionId: action.id, status: "succeeded" };
          },
        },
      },
    });
    const plan = reconciler.plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [s3Target("bad"), s3Target("good")],
    });

    const result = await reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });

    expect(seen.sort()).toEqual(["af-e2e-abc123-bad", "af-e2e-abc123-good"]);
    expect(result.results.map((entry) => entry.status).sort()).toEqual(["failed", "succeeded"]);
    expect(JSON.stringify(result)).not.toContain("af-e2e-abc123-bad");
  });

  it("refuses externally supplied plans without an in-memory token match", async () => {
    const reconciler = new OrphanReconciler({
      executors: {
        drainS3BucketVersions: {
          execute: async (action) => ({ actionId: action.id, status: "succeeded" }),
        },
      },
    });
    const planned = reconciler.plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: [s3Target("logs")],
    });
    const forgedPlan = {
      ...planned,
      actions: planned.actions.map((action) => ({
        ...action,
        id: "forged-action",
        executable: true,
      })),
    };

    await expect(
      new OrphanReconciler({
        executors: {
          drainS3BucketVersions: {
            execute: async (action) => ({ actionId: action.id, status: "succeeded" }),
          },
        },
      }).execute(forgedPlan, {
        confirmToken: forgedPlan.confirmToken,
        allow: ["deleteCloudResource"],
      }),
    ).rejects.toThrow(/unknown or expired/);
  });
});
