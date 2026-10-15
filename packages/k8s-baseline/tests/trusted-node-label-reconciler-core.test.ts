import { describe, expect, test } from "vitest";

import {
  classifyNodeGroupCapacity,
  planTrustedNodeLabel,
  validateReconciliationPlan,
  type NodeSnapshot,
  type ReconciliationInput,
} from "../src/trusted-node-label-reconciler-core";

const NOW = Date.parse("2026-10-15T10:00:00.000Z");
const INSTANCE_ID = "i-0123456789abcdef0";
const PROVIDER_ID = `aws:///eu-west-2a/${INSTANCE_ID}`;
const PROTECTED_LABEL = "security.hulumi.dev.node-restriction.kubernetes.io/workload-tier";

function baseInput(): ReconciliationInput {
  return {
    nowEpochMs: NOW,
    policy: {
      clusterName: "prod-eks",
      nodeGroupName: "trusted-workers",
      awsAccountId: "123456789012",
      region: "eu-west-2",
      protectedLabelKey: PROTECTED_LABEL,
      protectedLabelValue: "sensitive",
      allowedInstanceTypes: ["m7i.large", "m7i.xlarge"],
      expectedTaints: [{ key: "workload", value: "sensitive", effect: "NoSchedule" }],
      maxEvidenceAgeMs: 60_000,
      maxEvidenceSkewMs: 5_000,
    },
    node: {
      name: "ip-10-0-0-10.eu-west-2.compute.internal",
      uid: "68d3aa5f-ff74-4721-8dde-0aafe7da81c2",
      resourceVersion: "2401",
      providerId: PROVIDER_ID,
      labels: {
        "eks.amazonaws.com/nodegroup": "trusted-workers",
        "node.kubernetes.io/instance-type": "m7i.large",
        "topology.kubernetes.io/zone": "eu-west-2a",
      },
      taints: [{ key: "workload", value: "sensitive", effect: "NoSchedule" }],
    },
    nodeGroup: {
      clusterName: "prod-eks",
      nodeGroupName: "trusted-workers",
      status: "ACTIVE",
      autoScalingGroupNames: ["eks-trusted-workers-old"],
      scalingConfig: { minSize: 1, desiredSize: 2, maxSize: 4 },
      capturedAtEpochMs: NOW - 2_000,
    },
    autoScalingGroups: [
      {
        name: "eks-trusted-workers-old",
        instances: [
          {
            instanceId: INSTANCE_ID,
            lifecycleState: "InService",
            healthStatus: "Healthy",
          },
        ],
        capturedAtEpochMs: NOW - 1_000,
      },
    ],
    ec2Instance: {
      instanceId: INSTANCE_ID,
      accountId: "123456789012",
      region: "eu-west-2",
      availabilityZone: "eu-west-2a",
      instanceType: "m7i.large",
      state: "running",
      capturedAtEpochMs: NOW - 500,
    },
  };
}

function expectDeny(input: ReconciliationInput, reason: string): void {
  expect(planTrustedNodeLabel(input)).toEqual({ action: "deny", reason });
}

function expectRevoke(input: ReconciliationInput, reason: string): void {
  input.node.labels[PROTECTED_LABEL] = "sensitive";
  const decision = planTrustedNodeLabel(input);
  expect(decision.action).toBe("revoke");
  if (decision.action !== "revoke") return;
  expect(decision.reason).toBe(reason);
  expect(decision.plan).toMatchObject({
    mutation: "remove",
    protectedLabelKey: PROTECTED_LABEL,
    protectedLabelValue: "sensitive",
  });
  expect(decision.patch).toEqual([
    { op: "test", path: "/metadata/uid", value: input.node.uid },
    { op: "test", path: "/metadata/resourceVersion", value: input.node.resourceVersion },
    { op: "test", path: "/spec/providerID", value: input.node.providerId },
    {
      op: "test",
      path: "/metadata/labels/security.hulumi.dev.node-restriction.kubernetes.io~1workload-tier",
      value: "sensitive",
    },
    {
      op: "remove",
      path: "/metadata/labels/security.hulumi.dev.node-restriction.kubernetes.io~1workload-tier",
    },
  ]);
}

describe("trusted node-label reconciliation kernel", () => {
  test("BDD-1: emits one protected-label mutation with UID, version and provider tests", () => {
    const result = planTrustedNodeLabel(baseInput());

    expect(result.action).toBe("patch");
    if (result.action !== "patch") return;

    expect(result.patch).toEqual([
      { op: "test", path: "/metadata/uid", value: baseInput().node.uid },
      {
        op: "test",
        path: "/metadata/resourceVersion",
        value: baseInput().node.resourceVersion,
      },
      { op: "test", path: "/spec/providerID", value: PROVIDER_ID },
      {
        op: "add",
        path: "/metadata/labels/security.hulumi.dev.node-restriction.kubernetes.io~1workload-tier",
        value: "sensitive",
      },
    ]);
    expect(result.plan.instanceId).toBe(INSTANCE_ID);
    expect(result.plan).toMatchObject({
      mutation: "add",
      protectedLabelValue: "sensitive",
    });
    expect(result.patch.filter((operation) => operation.op !== "test")).toHaveLength(1);
  });

  test.each([
    [
      "provider_id_malformed",
      (input: ReconciliationInput): void => {
        input.node.providerId = "aws://malformed";
      },
    ],
    [
      "evidence_stale",
      (input: ReconciliationInput): void => {
        input.nodeGroup.capturedAtEpochMs = NOW - 60_001;
      },
    ],
    [
      "node_group_mismatch",
      (input: ReconciliationInput): void => {
        input.nodeGroup.nodeGroupName = "other-workers";
      },
    ],
    [
      "membership_missing",
      (input: ReconciliationInput): void => {
        input.autoScalingGroups[0].instances = [];
      },
    ],
    [
      "instance_not_running",
      (input: ReconciliationInput): void => {
        input.ec2Instance.state = "stopped";
      },
    ],
    [
      "node_zone_label_mismatch",
      (input: ReconciliationInput): void => {
        input.node.labels["topology.kubernetes.io/zone"] = "eu-west-2b";
      },
    ],
    [
      "expected_taint_missing",
      (input: ReconciliationInput): void => {
        input.node.taints = [];
      },
    ],
  ] as const)("BDD-M4a-1: revokes exact trust after %s", (reason, mutate) => {
    const input = baseInput();
    mutate(input);
    expectRevoke(input, reason);
  });

  test("BDD-2: forged kubelet labels cannot replace absent AWS membership", () => {
    const input = baseInput();
    input.node.labels["eks.amazonaws.com/nodegroup"] = "trusted-workers";
    input.node.labels["node.kubernetes.io/instance-type"] = "m7i.large";
    input.autoScalingGroups[0].instances = [];

    expectDeny(input, "membership_missing");
  });

  test("BDD-3: distinguishes foreign, duplicate and unhealthy membership", () => {
    const foreign = baseInput();
    foreign.autoScalingGroups[0].name = "foreign-workers";
    expectDeny(foreign, "asg_not_attested");

    const duplicate = baseInput();
    duplicate.nodeGroup.status = "UPDATING";
    duplicate.nodeGroup.autoScalingGroupNames.push("eks-trusted-workers-new");
    duplicate.autoScalingGroups.push({
      ...duplicate.autoScalingGroups[0],
      name: "eks-trusted-workers-new",
    });
    expectDeny(duplicate, "membership_ambiguous");

    const unhealthy = baseInput();
    unhealthy.autoScalingGroups[0].instances[0].healthStatus = "Unhealthy";
    expectDeny(unhealthy, "membership_unhealthy");
  });

  test.each([
    [
      "account_mismatch",
      (input: ReconciliationInput): void => {
        input.ec2Instance.accountId = "999999999999";
      },
    ],
    [
      "region_mismatch",
      (input: ReconciliationInput): void => {
        input.ec2Instance.region = "us-east-1";
      },
    ],
    [
      "availability_zone_mismatch",
      (input: ReconciliationInput): void => {
        input.ec2Instance.availabilityZone = "eu-west-2b";
      },
    ],
    [
      "instance_type_denied",
      (input: ReconciliationInput): void => {
        input.ec2Instance.instanceType = "t3.nano";
      },
    ],
    [
      "instance_not_running",
      (input: ReconciliationInput): void => {
        input.ec2Instance.state = "stopped";
      },
    ],
  ] as const)("BDD-3: denies %s", (reason, mutate) => {
    const input = baseInput();
    mutate(input);
    expectDeny(input, reason);
  });

  test("BDD-3: denies missing and conflicting expected taints", () => {
    const missing = baseInput();
    missing.node.taints = [];
    expectDeny(missing, "expected_taint_missing");

    const conflict = baseInput();
    conflict.node.taints = [{ key: "workload", value: "general", effect: "NoSchedule" }];
    expectDeny(conflict, "expected_taint_conflict");
  });

  test("BDD-3: ordinary zone and instance-type labels are consistency checks only", () => {
    const wrongZone = baseInput();
    wrongZone.node.labels["topology.kubernetes.io/zone"] = "eu-west-2b";
    expectDeny(wrongZone, "node_zone_label_mismatch");

    const wrongType = baseInput();
    wrongType.node.labels["node.kubernetes.io/instance-type"] = "m7i.xlarge";
    expectDeny(wrongType, "node_instance_type_label_mismatch");
  });

  test("BDD-4: rejects stale plans when UID, version or provider identity changes", () => {
    const decision = planTrustedNodeLabel(baseInput());
    expect(decision.action).toBe("patch");
    if (decision.action !== "patch") return;

    const current = baseInput().node;
    expect(validateReconciliationPlan(decision.plan, current)).toEqual({ valid: true });

    expect(
      validateReconciliationPlan(decision.plan, { ...current, uid: "replacement-uid" }),
    ).toEqual({ valid: false, reason: "node_uid_changed" });
    expect(
      validateReconciliationPlan(decision.plan, { ...current, resourceVersion: "2402" }),
    ).toEqual({ valid: false, reason: "resource_version_changed" });
    expect(
      validateReconciliationPlan(decision.plan, {
        ...current,
        providerId: `aws:///eu-west-2a/i-0fedcba9876543210`,
      }),
    ).toEqual({ valid: false, reason: "provider_id_changed" });
  });

  test("BDD-5: fully attests before noop and refuses protected-label conflicts", () => {
    const expected = baseInput();
    expected.node.labels[PROTECTED_LABEL] = "sensitive";
    expect(planTrustedNodeLabel(expected).action).toBe("noop");

    const forgedExpected = baseInput();
    forgedExpected.node.labels[PROTECTED_LABEL] = "sensitive";
    forgedExpected.autoScalingGroups[0].instances = [];
    expect(planTrustedNodeLabel(forgedExpected)).toMatchObject({
      action: "revoke",
      reason: "membership_missing",
    });

    const conflict = baseInput();
    conflict.node.labels[PROTECTED_LABEL] = "general";
    expectDeny(conflict, "protected_label_conflict");
  });

  test("BDD-6: accepts one old/new ASG membership during a rolling update", () => {
    const rolling = baseInput();
    rolling.nodeGroup.status = "UPDATING";
    rolling.nodeGroup.autoScalingGroupNames.push("eks-trusted-workers-new");
    rolling.autoScalingGroups.push({
      name: "eks-trusted-workers-new",
      instances: [],
      capturedAtEpochMs: NOW - 1_250,
    });
    expect(planTrustedNodeLabel(rolling).action).toBe("patch");

    rolling.autoScalingGroups[0].instances = [];
    expectDeny(rolling, "membership_missing");
  });

  test("BDD-7: distinguishes intentional zero capacity from missing nodes", () => {
    expect(classifyNodeGroupCapacity(0, 0)).toBe("zero_capacity");
    expect(classifyNodeGroupCapacity(2, 0)).toBe("awaiting_nodes");
    expect(classifyNodeGroupCapacity(2, 1)).toBe("reconciling");
    expect(classifyNodeGroupCapacity(2, 2)).toBe("ready");
    expect(classifyNodeGroupCapacity(-1, 0)).toBe("invalid");
  });

  test("BDD-8: denies stale, future-dated and excessively skewed evidence", () => {
    const stale = baseInput();
    stale.nodeGroup.capturedAtEpochMs = NOW - 60_001;
    expectDeny(stale, "evidence_stale");

    const future = baseInput();
    future.ec2Instance.capturedAtEpochMs = NOW + 1;
    expectDeny(future, "evidence_from_future");

    const skewed = baseInput();
    skewed.nodeGroup.capturedAtEpochMs = NOW - 10_000;
    expectDeny(skewed, "evidence_skew_exceeded");
  });

  test("BDD-8: malformed provider IDs and input bounds fail closed without throwing", () => {
    const malformed = baseInput();
    malformed.node.providerId = "aws://i-not-valid";
    expectDeny(malformed, "provider_id_malformed");

    const tooManyAsgs = baseInput();
    tooManyAsgs.nodeGroup.autoScalingGroupNames = Array.from(
      { length: 9 },
      (_, index) => `eks-workers-${index}`,
    );
    expectDeny(tooManyAsgs, "input_bounds_exceeded");

    const invalidLabel = baseInput();
    invalidLabel.policy.protectedLabelKey = "example.com/unprotected";
    expectDeny(invalidLabel, "protected_label_key_invalid");
  });

  test("current-node validation rejects a newly conflicting label", () => {
    const decision = planTrustedNodeLabel(baseInput());
    expect(decision.action).toBe("patch");
    if (decision.action !== "patch") return;

    const current: NodeSnapshot = {
      ...baseInput().node,
      labels: { ...baseInput().node.labels, [PROTECTED_LABEL]: "general" },
    };
    expect(validateReconciliationPlan(decision.plan, current)).toEqual({
      valid: false,
      reason: "protected_label_changed",
    });
  });

  test("BDD-M4a-2: remove-plan validation requires the same exact protected value", () => {
    const input = baseInput();
    input.autoScalingGroups[0].instances = [];
    input.node.labels[PROTECTED_LABEL] = "sensitive";
    const decision = planTrustedNodeLabel(input);
    expect(decision.action).toBe("revoke");
    if (decision.action !== "revoke") return;

    expect(validateReconciliationPlan(decision.plan, input.node)).toEqual({ valid: true });
    expect(
      validateReconciliationPlan(decision.plan, {
        ...input.node,
        labels: { ...input.node.labels, [PROTECTED_LABEL]: "general" },
      }),
    ).toEqual({ valid: false, reason: "protected_label_changed" });
    const labels = { ...input.node.labels };
    delete labels[PROTECTED_LABEL];
    expect(validateReconciliationPlan(decision.plan, { ...input.node, labels })).toEqual({
      valid: false,
      reason: "protected_label_changed",
    });
  });

  test("BDD-M4a-3: a conflicting protected value is denied and never removed", () => {
    const input = baseInput();
    input.node.labels[PROTECTED_LABEL] = "general";
    input.autoScalingGroups[0].instances = [];
    expectDeny(input, "protected_label_conflict");
  });

  test("BDD-M4a-3: malformed local identity never produces a revocation plan", () => {
    const input = baseInput();
    input.node.labels[PROTECTED_LABEL] = "sensitive";
    input.autoScalingGroups[0].instances = [];
    (input.node as unknown as { name: unknown }).name = undefined;
    expectDeny(input, "input_malformed");
  });
});
