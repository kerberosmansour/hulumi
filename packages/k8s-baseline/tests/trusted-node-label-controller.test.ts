import { describe, expect, test, vi } from "vitest";

import type { TrustedNodeLabelAwsAdapter } from "../src/trusted-node-label-controller-aws";
import type { TrustedNodeLabelKubernetesAdapter } from "../src/trusted-node-label-controller-kubernetes";
import {
  runTrustedNodeLabelControllerCycle,
  type ControllerAuditEvent,
} from "../src/trusted-node-label-controller";
import type {
  AutoScalingGroupAttestation,
  Ec2InstanceAttestation,
  EksNodeGroupAttestation,
  NodeSnapshot,
  TrustedNodeLabelPolicy,
} from "../src/trusted-node-label-reconciler-core";

const NOW = 1_800_000_000_000;
const LABEL_KEY = "identity.node-restriction.kubernetes.io/workload";

const policy: TrustedNodeLabelPolicy = {
  clusterName: "prod-eks",
  nodeGroupName: "trusted-workers",
  awsAccountId: "111122223333",
  region: "eu-west-2",
  protectedLabelKey: LABEL_KEY,
  protectedLabelValue: "trusted",
  allowedInstanceTypes: ["m7i.large"],
  expectedTaints: [{ key: "dedicated", value: "trusted", effect: "NoSchedule" }],
  maxEvidenceAgeMs: 120_000,
  maxEvidenceSkewMs: 15_000,
};

function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    name: "ip-10-0-0-10.eu-west-2.compute.internal",
    uid: "node-uid-sensitive",
    resourceVersion: "100",
    providerId: "aws:///eu-west-2a/i-0123456789abcdef0",
    labels: {
      "eks.amazonaws.com/nodegroup": "trusted-workers",
      "topology.kubernetes.io/zone": "eu-west-2a",
      "node.kubernetes.io/instance-type": "m7i.large",
    },
    taints: [{ key: "dedicated", value: "trusted", effect: "NoSchedule" }],
    ...overrides,
  };
}

const nodeGroup: EksNodeGroupAttestation = {
  clusterName: "prod-eks",
  nodeGroupName: "trusted-workers",
  status: "ACTIVE",
  autoScalingGroupNames: ["eks-trusted-workers-a1b2"],
  scalingConfig: { minSize: 1, desiredSize: 1, maxSize: 3 },
  capturedAtEpochMs: NOW - 300,
};

const autoScalingGroups: AutoScalingGroupAttestation[] = [
  {
    name: "eks-trusted-workers-a1b2",
    instances: [
      {
        instanceId: "i-0123456789abcdef0",
        lifecycleState: "InService",
        healthStatus: "Healthy",
      },
    ],
    capturedAtEpochMs: NOW - 200,
  },
];

const ec2Instance: Ec2InstanceAttestation = {
  instanceId: "i-0123456789abcdef0",
  accountId: "111122223333",
  region: "eu-west-2",
  availabilityZone: "eu-west-2a",
  instanceType: "m7i.large",
  state: "running",
  capturedAtEpochMs: NOW - 100,
};

function adapters(options: { currentNode?: NodeSnapshot; listedNodes?: NodeSnapshot[] } = {}) {
  const metrics: unknown[] = [];
  const patches: unknown[] = [];
  const aws: TrustedNodeLabelAwsAdapter = {
    describeNodeGroup: vi.fn(async () => nodeGroup),
    describeAutoScalingGroups: vi.fn(async () => autoScalingGroups),
    describeEc2Instance: vi.fn(async () => ec2Instance),
    publishMetrics: vi.fn(async (sample) => {
      metrics.push(sample);
    }),
  };
  const listed = options.listedNodes ?? [node()];
  const kubernetes: TrustedNodeLabelKubernetesAdapter = {
    listCandidateNodes: vi.fn(async () => listed),
    getNode: vi.fn(async () => options.currentNode ?? listed[0]),
    patchNode: vi.fn(async (name, patch) => {
      patches.push({ name, patch });
    }),
  };
  return { aws, kubernetes, metrics, patches };
}

function config() {
  return { policy, reconcileIntervalMs: 60_000 };
}

describe("trusted node-label controller", () => {
  test("BDD-M2-1 / outcome: real orchestration reaches the exact kernel patch after a current-node recheck", async () => {
    const deps = adapters();
    const audit: ControllerAuditEvent[] = [];
    const result = await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: (event) => audit.push(event),
      now: () => NOW,
    });

    expect(result).toEqual({
      capacity: "ready",
      decisions: 1,
      failures: 0,
      missingTrustedLabels: 0,
      patched: 1,
    });
    expect(deps.kubernetes.getNode).toHaveBeenCalledTimes(1);
    expect(deps.patches).toEqual([
      {
        name: "ip-10-0-0-10.eu-west-2.compute.internal",
        patch: [
          { op: "test", path: "/metadata/uid", value: "node-uid-sensitive" },
          { op: "test", path: "/metadata/resourceVersion", value: "100" },
          {
            op: "test",
            path: "/spec/providerID",
            value: "aws:///eu-west-2a/i-0123456789abcdef0",
          },
          {
            op: "add",
            path: "/metadata/labels/identity.node-restriction.kubernetes.io~1workload",
            value: "trusted",
          },
        ],
      },
    ]);
    expect(audit.map((event) => event.event)).toEqual(["node_patched", "cycle_complete"]);
  });

  test("BDD-M2-3 / TLA refinement: a resourceVersion change discards the plan and never patches", async () => {
    const deps = adapters({ currentNode: node({ resourceVersion: "101" }) });
    const audit: ControllerAuditEvent[] = [];
    const result = await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: (event) => audit.push(event),
      now: () => NOW,
    });

    expect(result).toMatchObject({ failures: 1, missingTrustedLabels: 1, patched: 0 });
    expect(deps.kubernetes.patchNode).not.toHaveBeenCalled();
    expect(audit).toContainEqual(
      expect.objectContaining({ event: "stale_plan", reason: "resource_version_changed" }),
    );
  });

  test("BDD-M4a-4: failed attestation revokes the exact label and records a bounded reason", async () => {
    const trusted = node({ labels: { ...node().labels, [LABEL_KEY]: "trusted" } });
    const deps = adapters({ listedNodes: [trusted], currentNode: trusted });
    deps.aws.describeEc2Instance = vi.fn(async () => ({
      ...ec2Instance,
      state: "stopped",
    }));
    const audit: ControllerAuditEvent[] = [];

    const result = await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: (event) => audit.push(event),
      now: () => NOW,
    });

    expect(result).toEqual({
      capacity: "ready",
      decisions: 1,
      failures: 1,
      missingTrustedLabels: 1,
      patched: 1,
    });
    expect(deps.patches).toEqual([
      {
        name: trusted.name,
        patch: [
          { op: "test", path: "/metadata/uid", value: trusted.uid },
          { op: "test", path: "/metadata/resourceVersion", value: trusted.resourceVersion },
          { op: "test", path: "/spec/providerID", value: trusted.providerId },
          {
            op: "test",
            path: "/metadata/labels/identity.node-restriction.kubernetes.io~1workload",
            value: "trusted",
          },
          {
            op: "remove",
            path: "/metadata/labels/identity.node-restriction.kubernetes.io~1workload",
          },
        ],
      },
    ]);
    expect(audit).toContainEqual(
      expect.objectContaining({ event: "node_revoked", reason: "instance_not_running" }),
    );
    expect(JSON.stringify(audit)).not.toContain(trusted.uid);
  });

  test("BDD-M4a-5: revocation-only candidates do not make node-group capacity look ready", async () => {
    const stale = node({
      name: "ip-10-0-0-99.eu-west-2.compute.internal",
      uid: "stale-node-uid",
      labels: {
        ...node().labels,
        "eks.amazonaws.com/nodegroup": "other-workers",
        [LABEL_KEY]: "trusted",
      },
    });
    const deps = adapters({ listedNodes: [stale], currentNode: stale });
    deps.aws.describeAutoScalingGroups = vi.fn(async () => [
      { ...autoScalingGroups[0], instances: [] },
    ]);
    const result = await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: () => undefined,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      capacity: "awaiting_nodes",
      decisions: 1,
      failures: 2,
      missingTrustedLabels: 1,
      patched: 1,
    });
  });

  test("BDD-M2-2: provider failure patches nothing and remains a bounded metric-bearing result", async () => {
    const deps = adapters();
    deps.aws.describeNodeGroup = vi.fn(async () => {
      throw Object.assign(new Error("secret provider response"), { code: "eks_describe_failed" });
    });
    const audit: ControllerAuditEvent[] = [];
    const result = await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: (event) => audit.push(event),
      now: () => NOW,
    });

    expect(result).toEqual({
      capacity: "invalid",
      decisions: 0,
      failures: 1,
      missingTrustedLabels: 0,
      patched: 0,
    });
    expect(deps.kubernetes.patchNode).not.toHaveBeenCalled();
    expect(deps.metrics).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("secret provider response");
    expect(audit[0]).toMatchObject({ event: "provider_failure", reason: "eks_describe_failed" });
  });

  test("BDD-M2-5: deliberate zero capacity is healthy and does not raise a missing-label sample", async () => {
    const deps = adapters({ listedNodes: [] });
    deps.aws.describeNodeGroup = vi.fn(async () => ({
      ...nodeGroup,
      scalingConfig: { minSize: 0, desiredSize: 0, maxSize: 3 },
    }));
    const result = await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: () => undefined,
      now: () => NOW,
    });
    expect(result).toEqual({
      capacity: "zero_capacity",
      decisions: 0,
      failures: 0,
      missingTrustedLabels: 0,
      patched: 0,
    });
  });

  test("BDD-M2-7: audit records contain hashes and stable codes, never raw Node identity", async () => {
    const deps = adapters({
      listedNodes: [node({ providerId: "malformed-provider-id" })],
    });
    const audit: ControllerAuditEvent[] = [];
    await runTrustedNodeLabelControllerCycle(config(), {
      ...deps,
      audit: (event) => audit.push(event),
      now: () => NOW,
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).toContain("provider_id_malformed");
    expect(serialized).not.toContain("node-uid-sensitive");
    expect(serialized).not.toContain("malformed-provider-id");
    expect(audit[0].nodeRef).toMatch(/^[a-f0-9]{16}$/u);
  });
});
