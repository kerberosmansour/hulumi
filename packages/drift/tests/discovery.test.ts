import { describe, expect, it } from "vitest";

import { OrphanReconciler } from "../src/reconciler";
import { discoverReconcileTargets } from "../src/discovery";

const NOW = new Date("2026-05-08T12:00:00.000Z");

describe("discoverReconcileTargets", () => {
  it("discovers state-owned, state-missing, and cloud-only relationships from explicit prefix scope", () => {
    const result = discoverReconcileTargets({
      scope: { resourcePrefix: "af-e2e-abc123", regions: ["us-east-1"] },
      pulumiState: {
        resources: [
          {
            urn: "urn:pulumi:sandbox::proj::aws:s3/bucketV2:BucketV2::owned",
            type: "aws:s3/bucketV2:BucketV2",
            id: "af-e2e-abc123-owned",
          },
          {
            urn: "urn:pulumi:sandbox::proj::aws:s3/bucketV2:BucketV2::missing",
            type: "aws:s3/bucketV2:BucketV2",
            id: "af-e2e-abc123-missing",
          },
        ],
      },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:s3/bucketV2:BucketV2",
          physicalId: "af-e2e-abc123-owned",
          region: "us-east-1",
          tags: { "hulumi:component": "AccountFoundation" },
        },
        {
          provider: "aws",
          type: "aws:s3/bucket:Bucket",
          physicalId: "af-e2e-abc123-cloud",
          region: "us-east-1",
          tags: { "hulumi:component": "AccountFoundation" },
        },
      ],
    });

    expect(result.targets.map((target) => target.relationship).sort()).toEqual([
      "cloud-only",
      "state-missing",
      "state-owned",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects unscoped inventory", () => {
    expect(() =>
      discoverReconcileTargets({
        scope: {},
        pulumiState: { resources: [] },
        cloudResources: [],
      }),
    ).toThrow(/explicit selector/);
  });

  it("filters wrong account and region with diagnostics", () => {
    const result = discoverReconcileTargets({
      scope: {
        resourcePrefix: "af-e2e-abc123",
        regions: ["us-east-1"],
        accountIds: ["123456789012"],
      },
      pulumiState: { resources: [] },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:s3/bucketV2:BucketV2",
          physicalId: "af-e2e-abc123-west",
          region: "us-west-2",
          accountId: "123456789012",
        },
        {
          provider: "aws",
          type: "aws:s3/bucketV2:BucketV2",
          physicalId: "af-e2e-abc123-other-account",
          region: "us-east-1",
          accountId: "999999999999",
        },
      ],
    });

    expect(result.targets).toHaveLength(0);
    expect(result.diagnostics.map((diagnostic) => diagnostic.reason).sort()).toEqual([
      "account-out-of-scope",
      "region-out-of-scope",
    ]);
  });

  it("preserves too-new resources so the planner blocks by age", () => {
    const result = discoverReconcileTargets({
      scope: { resourcePrefix: "af-e2e-abc123" },
      pulumiState: { resources: [] },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:s3/bucketV2:BucketV2",
          physicalId: "af-e2e-abc123-new",
          createdAt: "2026-05-08T11:58:00.000Z",
          tags: { "hulumi:component": "AccountFoundation" },
        },
      ],
    });

    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123", minAgeMinutes: 15 },
      targets: result.targets,
    });

    expect(plan.actions[0]?.blockedActions.map((blocked) => blocked.reason)).toContain(
      "resource is newer than minAgeMinutes",
    );
  });

  it("marks shared singletons and retains them by default in the planner", () => {
    const result = discoverReconcileTargets({
      scope: { resourcePrefix: "af-e2e-abc123" },
      pulumiState: { resources: [] },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:guardduty/detector:Detector",
          physicalId: "af-e2e-abc123-detector",
          singleton: true,
          tags: { "hulumi:component": "AccountFoundation" },
        },
      ],
    });

    expect(result.targets[0]?.relationship).toBe("shared-singleton");
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: result.targets,
    });
    expect(plan.actions[0]?.recommendedAction).toBe("retainExternal");
  });

  it("reports unsupported resources instead of dropping them", () => {
    const result = discoverReconcileTargets({
      scope: { resourcePrefix: "af-e2e-abc123" },
      pulumiState: { resources: [] },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:lambda/function:Function",
          physicalId: "af-e2e-abc123-function",
          tags: { "hulumi:component": "AccountFoundation" },
        },
      ],
    });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]?.relationship).toBe("cloud-only");
    const plan = new OrphanReconciler().plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: result.targets,
    });
    expect(plan.actions[0]?.recommendedAction).toBe("retainExternal");
  });
});
