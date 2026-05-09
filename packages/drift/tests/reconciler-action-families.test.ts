import { describe, expect, it } from "vitest";

import {
  OrphanReconciler,
  type ReconcileActionType,
  type ReconcileTarget,
} from "../src/reconciler";

const NOW = new Date("2026-05-08T12:00:00.000Z");

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

function plan(targets: ReconcileTarget[], allowSingletonDelete = false) {
  return new OrphanReconciler().plan({
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

describe("OrphanReconciler non-S3 action families", () => {
  it("plans typed non-S3 AWS cleanup families without making them executable", () => {
    const result = plan([
      cloudOnlyTarget("aws:cloudtrail/trail:Trail", "af-e2e-abc123-trail"),
      cloudOnlyTarget("aws:cloudwatch/logGroup:LogGroup", "af-e2e-abc123-log"),
      cloudOnlyTarget("aws:cfg/recorder:Recorder", "af-e2e-abc123-recorder"),
      cloudOnlyTarget("aws:cfg/deliveryChannel:DeliveryChannel", "af-e2e-abc123-channel"),
      cloudOnlyTarget("aws:iam/role:Role", "af-e2e-abc123-role"),
      cloudOnlyTarget("aws:kms/key:Key", "af-e2e-abc123-key"),
      cloudOnlyTarget("aws:sns/topic:Topic", "af-e2e-abc123-topic"),
      cloudOnlyTarget("aws:cloudwatch/eventRule:EventRule", "af-e2e-abc123-rule"),
      cloudOnlyTarget("aws:accessanalyzer/analyzer:Analyzer", "af-e2e-abc123-analyzer"),
    ]);

    expect(result.actions.map((action) => action.type)).toEqual([
      "deleteAccessAnalyzer",
      "deleteCloudTrailTrail",
      "deleteCloudWatchLogGroup",
      "deleteConfigDeliveryChannel",
      "deleteConfigRecorder",
      "deleteEventBridgeRule",
      "deleteIamRole",
      "deleteSnsTopic",
      "scheduleKmsKeyDeletion",
    ]);
    expect(
      result.actions.every((action) => action.recommendedAction === "deleteCloudResource"),
    ).toBe(true);
    expect(result.actions.every((action) => action.executable === false)).toBe(true);
    expect(result.actions.every((action) => action.cloudMutation === true)).toBe(true);
    expect(result.actions.map((action) => action.blockedActions[0]?.reason)).toEqual(
      result.actions.map(() => "no executor registered for planning-only action family"),
    );
  });

  it("orders AWS Config delivery channel before recorder deletion", () => {
    const result = plan([
      cloudOnlyTarget("aws:cfg/recorder:Recorder", "af-e2e-abc123-recorder"),
      cloudOnlyTarget("aws:cfg/deliveryChannel:DeliveryChannel", "af-e2e-abc123-channel"),
    ]);

    const channel = result.actions.find((action) => action.type === "deleteConfigDeliveryChannel");
    const recorder = result.actions.find((action) => action.type === "deleteConfigRecorder");

    expect(result.actions.map((action) => action.type)).toEqual([
      "deleteConfigDeliveryChannel",
      "deleteConfigRecorder",
    ]);
    expect(recorder?.dependsOn).toEqual([channel?.id]);
  });

  it("retains shared singleton services by default and plans typed deletion only when allowed", () => {
    const guardDuty = {
      ...cloudOnlyTarget("aws:guardduty/detector:Detector", "af-e2e-abc123-detector"),
      identity: {
        ...cloudOnlyTarget("aws:guardduty/detector:Detector", "af-e2e-abc123-detector").identity,
        singleton: true,
      },
    };
    const securityHub = {
      ...cloudOnlyTarget("aws:securityhub/account:Account", "af-e2e-abc123-securityhub"),
      identity: {
        ...cloudOnlyTarget("aws:securityhub/account:Account", "af-e2e-abc123-securityhub").identity,
        singleton: true,
      },
    };

    const defaultPlan = plan([guardDuty, securityHub]);
    expect(defaultPlan.actions.map((action) => action.type)).toEqual([
      "retainSharedSingleton",
      "retainSharedSingleton",
    ]);
    expect(
      defaultPlan.actions.every((action) => action.recommendedAction === "retainExternal"),
    ).toBe(true);

    const allowedPlan = plan([guardDuty, securityHub], true);
    expect(allowedPlan.actions.map((action) => action.type)).toEqual([
      "deleteGuardDutyDetector",
      "deleteSecurityHubHub",
    ]);
    expect(allowedPlan.actions.every((action) => action.executable === false)).toBe(true);
  });

  it("keeps non-S3 action family plans deterministic and redacted", () => {
    const targets = [
      cloudOnlyTarget("aws:sns/topic:Topic", "af-e2e-abc123-topic"),
      cloudOnlyTarget("aws:cloudtrail/trail:Trail", "af-e2e-abc123-trail"),
    ];

    const first = plan(targets);
    const second = plan(targets);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("123456789012");
    expect(JSON.stringify(first)).not.toContain("af-e2e-abc123-topic");
    expect(first.actions.map((action) => action.type satisfies ReconcileActionType)).toEqual([
      "deleteCloudTrailTrail",
      "deleteSnsTopic",
    ]);
  });

  it("still blocks typed non-S3 cleanup when ownership evidence is weak", () => {
    const result = plan([
      {
        ...cloudOnlyTarget("aws:iam/role:Role", "af-e2e-abc123-role"),
        ownership: [
          { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
        ],
      },
    ]);

    expect(result.actions[0]?.type).toBe("retainUnsupportedResource");
    expect(result.actions[0]?.recommendedAction).toBe("blocked");
    expect(result.actions[0]?.executable).toBe(false);
  });
});
