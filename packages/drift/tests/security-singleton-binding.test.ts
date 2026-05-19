import { describe, expect, it } from "vitest";

import { discoverReconcileTargets, isSecuritySingletonType } from "../src/discovery";
import {
  OrphanReconciler,
  type ReconcileActionExecutor,
  type ReconcileActionResult,
  type ReconcileTarget,
} from "../src/reconciler";

const NOW = new Date("2026-05-08T12:00:00.000Z");

class NoopDeleteExecutor implements ReconcileActionExecutor {
  async execute(): Promise<ReconcileActionResult> {
    return { actionId: "x", status: "succeeded" };
  }
}

function cloudOnlyTarget(type: string, physicalId: string): ReconcileTarget {
  return {
    inState: false,
    existsInCloud: true,
    identity: {
      provider: "aws",
      type,
      physicalId,
      region: "us-east-1",
      accountId: "123456789012",
      createdAt: "2026-05-08T10:00:00.000Z",
      tags: { "hulumi:component": "AccountFoundation" },
    },
    ownership: [
      { signal: "name-prefix", subject: physicalId, confidence: "high" },
      { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
    ],
  };
}

function planFor(targets: ReconcileTarget[], allowSingletonDelete = false) {
  return new OrphanReconciler({
    executors: {
      deleteGuardDutyDetector: new NoopDeleteExecutor(),
      deleteSecurityHubHub: new NoopDeleteExecutor(),
    },
  }).plan({
    now: NOW,
    nonce: "fixed",
    mode: "sweep-only",
    scope: {
      resourcePrefix: "af-e2e-abc123",
      regions: ["us-east-1"],
      accountIds: ["123456789012"],
      minAgeMinutes: 15,
      allowSingletonDelete,
    },
    targets,
  });
}

describe("isSecuritySingletonType", () => {
  it("matches only the security-control singleton services", () => {
    expect(isSecuritySingletonType("aws:guardduty/detector:Detector")).toBe(true);
    expect(isSecuritySingletonType("aws:securityhub/account:Account")).toBe(true);
    expect(isSecuritySingletonType("aws:s3/bucket:Bucket")).toBe(false);
    expect(isSecuritySingletonType("aws:guardduty/detector:DetectorFeature")).toBe(false);
  });
});

describe("security singleton guard without a caller-supplied flag", () => {
  for (const type of ["aws:guardduty/detector:Detector", "aws:securityhub/account:Account"]) {
    it(`retains cloud-only ${type} with singleton UNSET and a delete executor registered`, () => {
      const target = cloudOnlyTarget(type, "af-e2e-abc123-sec");
      // No singleton flag from discovery/caller — pre-fix this slipped past.
      expect(target.identity.singleton).toBeUndefined();

      const plan = planFor([target]);

      expect(plan.actions[0]?.type).toBe("retainSharedSingleton");
      expect(plan.actions[0]?.recommendedAction).toBe("retainExternal");
      expect(plan.actions[0]?.executable).toBe(false);
      expect(plan.actions[0]?.blockedActions.map((b) => b.reason)).toContain(
        "shared singleton deletion is disabled",
      );
    });

    it(`still allows ${type} teardown when scope.allowSingletonDelete=true`, () => {
      const plan = planFor([cloudOnlyTarget(type, "af-e2e-abc123-sec")], true);

      expect(plan.actions[0]?.recommendedAction).toBe("deleteCloudResource");
      expect(plan.actions[0]?.type).toMatch(/^delete(GuardDutyDetector|SecurityHubHub)$/);
      expect(plan.actions[0]?.executable).toBe(true);
    });
  }
});

describe("discovery infers singleton from security-control type", () => {
  it("marks a cloud-only GuardDuty detector as shared-singleton with no caller flag", () => {
    const result = discoverReconcileTargets({
      scope: { resourcePrefix: "af-e2e-abc123" },
      pulumiState: { resources: [] },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:securityhub/account:Account",
          physicalId: "af-e2e-abc123-sechub",
          tags: { "hulumi:component": "AccountFoundation" },
        },
      ],
    });

    expect(result.targets[0]?.relationship).toBe("shared-singleton");
    expect(result.targets[0]?.identity.singleton).toBe(true);

    const plan = new OrphanReconciler({
      executors: { deleteSecurityHubHub: new NoopDeleteExecutor() },
    }).plan({
      now: NOW,
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123" },
      targets: result.targets,
    });
    expect(plan.actions[0]?.recommendedAction).toBe("retainExternal");
    expect(plan.actions[0]?.executable).toBe(false);
  });

  it("infers singleton for state-owned security-control resources", () => {
    const result = discoverReconcileTargets({
      scope: { resourceTypes: ["aws:guardduty/detector:Detector"] },
      pulumiState: {
        resources: [
          {
            urn: "urn:pulumi:s::p::aws:guardduty/detector:Detector::d",
            type: "aws:guardduty/detector:Detector",
            id: "detector-1",
          },
        ],
      },
      cloudResources: [
        {
          provider: "aws",
          type: "aws:guardduty/detector:Detector",
          physicalId: "detector-1",
          region: "us-east-1",
        },
      ],
    });

    expect(result.targets[0]?.identity.singleton).toBe(true);
  });
});
