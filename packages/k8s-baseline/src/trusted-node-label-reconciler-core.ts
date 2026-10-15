/**
 * Deterministic trust-decision kernel for a future EKS node-label reconciler.
 *
 * This module deliberately performs no I/O and is not exported by the package.
 * A later adapter must obtain the EKS, Auto Scaling and EC2 snapshots with
 * read-only AWS authority and pass them through this bounded decision surface.
 */

export type KubernetesTaintEffect = "NoSchedule" | "PreferNoSchedule" | "NoExecute";

export interface KubernetesTaint {
  key: string;
  value: string;
  effect: KubernetesTaintEffect;
}

export interface NodeSnapshot {
  name: string;
  uid: string;
  resourceVersion: string;
  providerId: string;
  labels: Record<string, string>;
  taints: KubernetesTaint[];
}

export interface TrustedNodeLabelPolicy {
  clusterName: string;
  nodeGroupName: string;
  awsAccountId: string;
  region: string;
  protectedLabelKey: string;
  protectedLabelValue: string;
  allowedInstanceTypes: string[];
  expectedTaints: KubernetesTaint[];
  maxEvidenceAgeMs: number;
  maxEvidenceSkewMs: number;
}

export interface EksNodeGroupAttestation {
  clusterName: string;
  nodeGroupName: string;
  status: string;
  autoScalingGroupNames: string[];
  scalingConfig: { minSize: number; desiredSize: number; maxSize: number };
  capturedAtEpochMs: number;
}

export interface AutoScalingGroupAttestation {
  name: string;
  instances: Array<{
    instanceId: string;
    lifecycleState: string;
    healthStatus: string;
  }>;
  capturedAtEpochMs: number;
}

export interface Ec2InstanceAttestation {
  instanceId: string;
  accountId: string;
  region: string;
  availabilityZone: string;
  instanceType: string;
  state: string;
  capturedAtEpochMs: number;
}

export interface ReconciliationInput {
  nowEpochMs: number;
  policy: TrustedNodeLabelPolicy;
  node: NodeSnapshot;
  nodeGroup: EksNodeGroupAttestation;
  autoScalingGroups: AutoScalingGroupAttestation[];
  ec2Instance: Ec2InstanceAttestation;
}

export type DenyReason =
  | "input_malformed"
  | "input_bounds_exceeded"
  | "protected_label_key_invalid"
  | "provider_id_malformed"
  | "evidence_from_future"
  | "evidence_stale"
  | "evidence_skew_exceeded"
  | "evidence_unavailable"
  | "node_group_mismatch"
  | "node_group_unavailable"
  | "asg_not_attested"
  | "asg_evidence_incomplete"
  | "membership_missing"
  | "membership_ambiguous"
  | "membership_unhealthy"
  | "instance_id_mismatch"
  | "account_mismatch"
  | "region_mismatch"
  | "availability_zone_mismatch"
  | "instance_type_denied"
  | "instance_not_running"
  | "node_zone_label_mismatch"
  | "node_instance_type_label_mismatch"
  | "expected_taint_missing"
  | "expected_taint_conflict"
  | "protected_label_conflict";

export type JsonPatchOperation =
  | { op: "test"; path: string; value: string }
  | { op: "add"; path: string; value: string }
  | { op: "remove"; path: string };

export interface ReconciliationPlan {
  mutation: "add" | "remove";
  nodeName: string;
  nodeUid: string;
  resourceVersion: string;
  providerId: string;
  instanceId?: string;
  protectedLabelKey: string;
  protectedLabelValue: string;
}

export type ReconciliationDecision =
  | { action: "deny"; reason: DenyReason }
  | { action: "noop"; instanceId: string }
  | { action: "patch"; plan: ReconciliationPlan; patch: JsonPatchOperation[] }
  | {
      action: "revoke";
      reason: DenyReason;
      plan: ReconciliationPlan;
      patch: JsonPatchOperation[];
    };

export type CapacityState =
  "invalid" | "zero_capacity" | "awaiting_nodes" | "reconciling" | "ready";

export type PlanValidation =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "node_name_changed"
        | "node_uid_changed"
        | "resource_version_changed"
        | "provider_id_changed"
        | "protected_label_changed";
    };

const MAX_ASGS = 8;
const MAX_ASG_INSTANCES = 2_048;
const MAX_ALLOWED_INSTANCE_TYPES = 16;
const MAX_EXPECTED_TAINTS = 16;
const MAX_NODE_LABELS = 256;
const MAX_NODE_TAINTS = 64;
const MAX_EVIDENCE_AGE_MS = 10 * 60 * 1_000;

const INSTANCE_ID_RE = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const PROVIDER_ID_RE =
  /^aws:\/\/\/([a-z]{2}(?:-gov)?-[a-z]+-\d[a-z])\/(i-[0-9a-f]{8}(?:[0-9a-f]{9})?)$/;
const AWS_ACCOUNT_ID_RE = /^\d{12}$/;
const AWS_REGION_RE = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const DNS_LABEL_RE = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const LABEL_NAME_RE = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;
const LABEL_VALUE_RE = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;
const BOUNDED_IDENTIFIER_RE = /^(?=.{1,100}$)[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;

function deny(reason: DenyReason): ReconciliationDecision {
  return { action: "deny", reason };
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidProtectedLabelKey(key: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 2) return false;
  const [prefix, name] = parts;
  if (
    prefix.length > 253 ||
    !prefix.split(".").every((label) => DNS_LABEL_RE.test(label)) ||
    !LABEL_NAME_RE.test(name)
  ) {
    return false;
  }
  return (
    prefix === "node-restriction.kubernetes.io" ||
    prefix.endsWith(".node-restriction.kubernetes.io")
  );
}

function isUniqueNonEmpty(values: string[], maximum: number): boolean {
  return (
    values.length > 0 &&
    values.length <= maximum &&
    values.every((value) => BOUNDED_IDENTIFIER_RE.test(value)) &&
    new Set(values).size === values.length
  );
}

function hasValidScalingBounds(nodeGroup: EksNodeGroupAttestation): boolean {
  const { minSize, desiredSize, maxSize } = nodeGroup.scalingConfig;
  return (
    isNonNegativeInteger(minSize) &&
    isNonNegativeInteger(desiredSize) &&
    isNonNegativeInteger(maxSize) &&
    minSize <= desiredSize &&
    desiredSize <= maxSize
  );
}

function jsonPointerEscape(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function canSafelyRevoke(policy: TrustedNodeLabelPolicy, node: NodeSnapshot): boolean {
  return (
    typeof policy.protectedLabelKey === "string" &&
    isValidProtectedLabelKey(policy.protectedLabelKey) &&
    typeof policy.protectedLabelValue === "string" &&
    LABEL_VALUE_RE.test(policy.protectedLabelValue) &&
    typeof node.name === "string" &&
    BOUNDED_IDENTIFIER_RE.test(node.name) &&
    typeof node.uid === "string" &&
    node.uid.length >= 1 &&
    node.uid.length <= 128 &&
    typeof node.resourceVersion === "string" &&
    node.resourceVersion.length >= 1 &&
    node.resourceVersion.length <= 128 &&
    typeof node.providerId === "string" &&
    node.providerId.length >= 1 &&
    node.providerId.length <= 256 &&
    node.labels !== null &&
    typeof node.labels === "object" &&
    !Array.isArray(node.labels) &&
    Object.keys(node.labels).length <= MAX_NODE_LABELS
  );
}

export function planTrustedNodeLabelFailure(
  policy: TrustedNodeLabelPolicy,
  node: NodeSnapshot,
  reason: DenyReason,
  instanceId?: string,
): ReconciliationDecision {
  const existing = node.labels?.[policy.protectedLabelKey];
  if (existing !== undefined && existing !== policy.protectedLabelValue) {
    return deny("protected_label_conflict");
  }
  if (existing !== policy.protectedLabelValue || !canSafelyRevoke(policy, node)) {
    return deny(reason);
  }

  const labelPath = `/metadata/labels/${jsonPointerEscape(policy.protectedLabelKey)}`;
  const plan: ReconciliationPlan = {
    mutation: "remove",
    nodeName: node.name,
    nodeUid: node.uid,
    resourceVersion: node.resourceVersion,
    providerId: node.providerId,
    ...(instanceId === undefined ? {} : { instanceId }),
    protectedLabelKey: policy.protectedLabelKey,
    protectedLabelValue: policy.protectedLabelValue,
  };
  return {
    action: "revoke",
    reason,
    plan,
    patch: [
      { op: "test", path: "/metadata/uid", value: node.uid },
      { op: "test", path: "/metadata/resourceVersion", value: node.resourceVersion },
      { op: "test", path: "/spec/providerID", value: node.providerId },
      { op: "test", path: labelPath, value: policy.protectedLabelValue },
      { op: "remove", path: labelPath },
    ],
  };
}

function evidenceFailure(input: ReconciliationInput): DenyReason | undefined {
  const timestamps = [
    input.nodeGroup.capturedAtEpochMs,
    ...input.autoScalingGroups.map((group) => group.capturedAtEpochMs),
    input.ec2Instance.capturedAtEpochMs,
  ];
  if (
    !Number.isSafeInteger(input.nowEpochMs) ||
    timestamps.some((timestamp) => !Number.isSafeInteger(timestamp))
  ) {
    return "input_malformed";
  }
  if (timestamps.some((timestamp) => timestamp > input.nowEpochMs)) {
    return "evidence_from_future";
  }
  if (
    timestamps.some((timestamp) => input.nowEpochMs - timestamp > input.policy.maxEvidenceAgeMs)
  ) {
    return "evidence_stale";
  }
  if (Math.max(...timestamps) - Math.min(...timestamps) > input.policy.maxEvidenceSkewMs) {
    return "evidence_skew_exceeded";
  }
  return undefined;
}

function inputFailure(input: ReconciliationInput): DenyReason | undefined {
  const { policy, node, nodeGroup, autoScalingGroups } = input;
  if (
    typeof policy.clusterName !== "string" ||
    !BOUNDED_IDENTIFIER_RE.test(policy.clusterName) ||
    typeof policy.nodeGroupName !== "string" ||
    !BOUNDED_IDENTIFIER_RE.test(policy.nodeGroupName) ||
    typeof policy.awsAccountId !== "string" ||
    !AWS_ACCOUNT_ID_RE.test(policy.awsAccountId) ||
    typeof policy.region !== "string" ||
    !AWS_REGION_RE.test(policy.region) ||
    typeof policy.protectedLabelValue !== "string" ||
    !LABEL_VALUE_RE.test(policy.protectedLabelValue) ||
    typeof node.name !== "string" ||
    !BOUNDED_IDENTIFIER_RE.test(node.name) ||
    typeof node.uid !== "string" ||
    node.uid.length < 1 ||
    node.uid.length > 128 ||
    typeof node.resourceVersion !== "string" ||
    node.resourceVersion.length < 1 ||
    node.resourceVersion.length > 128
  ) {
    return "input_malformed";
  }
  if (!isValidProtectedLabelKey(policy.protectedLabelKey)) {
    return "protected_label_key_invalid";
  }
  if (
    !isUniqueNonEmpty(policy.allowedInstanceTypes, MAX_ALLOWED_INSTANCE_TYPES) ||
    !isUniqueNonEmpty(nodeGroup.autoScalingGroupNames, MAX_ASGS) ||
    policy.expectedTaints.length === 0 ||
    policy.expectedTaints.length > MAX_EXPECTED_TAINTS ||
    Object.keys(node.labels).length > MAX_NODE_LABELS ||
    node.taints.length > MAX_NODE_TAINTS ||
    autoScalingGroups.length > MAX_ASGS ||
    autoScalingGroups.some(
      (group) =>
        group.instances.length > MAX_ASG_INSTANCES ||
        group.instances.some((instance) => !INSTANCE_ID_RE.test(instance.instanceId)),
    )
  ) {
    return "input_bounds_exceeded";
  }
  if (
    policy.expectedTaints.some(
      (taint) =>
        !LABEL_NAME_RE.test(taint.key) ||
        taint.value.length > 63 ||
        !["NoSchedule", "PreferNoSchedule", "NoExecute"].includes(taint.effect),
    ) ||
    new Set(policy.expectedTaints.map((taint) => `${taint.key}\u0000${taint.effect}`)).size !==
      policy.expectedTaints.length ||
    !hasValidScalingBounds(nodeGroup) ||
    !Number.isSafeInteger(policy.maxEvidenceAgeMs) ||
    policy.maxEvidenceAgeMs < 1 ||
    policy.maxEvidenceAgeMs > MAX_EVIDENCE_AGE_MS ||
    !Number.isSafeInteger(policy.maxEvidenceSkewMs) ||
    policy.maxEvidenceSkewMs < 0 ||
    policy.maxEvidenceSkewMs > policy.maxEvidenceAgeMs
  ) {
    return "input_malformed";
  }
  return undefined;
}

function attestMembership(input: ReconciliationInput, instanceId: string): DenyReason | undefined {
  const allowedAsgs = new Set(input.nodeGroup.autoScalingGroupNames);
  const snapshotNames = input.autoScalingGroups.map((group) => group.name);
  if (snapshotNames.some((name) => !allowedAsgs.has(name))) return "asg_not_attested";
  if (
    new Set(snapshotNames).size !== snapshotNames.length ||
    snapshotNames.length !== allowedAsgs.size ||
    input.nodeGroup.autoScalingGroupNames.some((name) => !snapshotNames.includes(name))
  ) {
    return "asg_evidence_incomplete";
  }

  const memberships = input.autoScalingGroups.flatMap((group) =>
    group.instances
      .filter((instance) => instance.instanceId === instanceId)
      .map((instance) => ({ group: group.name, instance })),
  );
  if (memberships.length === 0) return "membership_missing";
  if (memberships.length !== 1) return "membership_ambiguous";
  const membership = memberships[0].instance;
  if (membership.lifecycleState !== "InService" || membership.healthStatus !== "Healthy") {
    return "membership_unhealthy";
  }
  return undefined;
}

function attestEc2AndNode(
  input: ReconciliationInput,
  instanceId: string,
  availabilityZone: string,
): DenyReason | undefined {
  const { policy, ec2Instance, node } = input;
  if (ec2Instance.instanceId !== instanceId) return "instance_id_mismatch";
  if (ec2Instance.accountId !== policy.awsAccountId) return "account_mismatch";
  if (ec2Instance.region !== policy.region) return "region_mismatch";
  if (
    ec2Instance.availabilityZone !== availabilityZone ||
    availabilityZone.length !== policy.region.length + 1 ||
    !availabilityZone.startsWith(policy.region) ||
    !/^[a-z]$/.test(availabilityZone.at(-1) ?? "")
  ) {
    return "availability_zone_mismatch";
  }
  if (!policy.allowedInstanceTypes.includes(ec2Instance.instanceType)) {
    return "instance_type_denied";
  }
  if (ec2Instance.state !== "running") return "instance_not_running";
  if (node.labels["topology.kubernetes.io/zone"] !== ec2Instance.availabilityZone) {
    return "node_zone_label_mismatch";
  }
  if (node.labels["node.kubernetes.io/instance-type"] !== ec2Instance.instanceType) {
    return "node_instance_type_label_mismatch";
  }
  return undefined;
}

function attestTaints(input: ReconciliationInput): DenyReason | undefined {
  for (const expected of input.policy.expectedTaints) {
    const sameKey = input.node.taints.filter((taint) => taint.key === expected.key);
    if (sameKey.length === 0) return "expected_taint_missing";
    if (
      sameKey.length !== 1 ||
      sameKey[0].value !== expected.value ||
      sameKey[0].effect !== expected.effect
    ) {
      return "expected_taint_conflict";
    }
  }
  return undefined;
}

/**
 * Attest one Node against independent provider snapshots, then plan either no
 * mutation or one concurrency-bound protected-label addition/removal.
 */
export function planTrustedNodeLabel(input: ReconciliationInput): ReconciliationDecision {
  try {
    const shapeFailure = inputFailure(input);
    if (shapeFailure !== undefined) {
      return planTrustedNodeLabelFailure(input.policy, input.node, shapeFailure);
    }

    const provider = PROVIDER_ID_RE.exec(input.node.providerId);
    if (provider === null) {
      return planTrustedNodeLabelFailure(input.policy, input.node, "provider_id_malformed");
    }
    const [, availabilityZone, instanceId] = provider;

    const freshnessFailure = evidenceFailure(input);
    if (freshnessFailure !== undefined) {
      return planTrustedNodeLabelFailure(input.policy, input.node, freshnessFailure, instanceId);
    }

    if (
      input.nodeGroup.clusterName !== input.policy.clusterName ||
      input.nodeGroup.nodeGroupName !== input.policy.nodeGroupName
    ) {
      return planTrustedNodeLabelFailure(
        input.policy,
        input.node,
        "node_group_mismatch",
        instanceId,
      );
    }
    if (input.nodeGroup.status !== "ACTIVE" && input.nodeGroup.status !== "UPDATING") {
      return planTrustedNodeLabelFailure(
        input.policy,
        input.node,
        "node_group_unavailable",
        instanceId,
      );
    }

    const membershipFailure = attestMembership(input, instanceId);
    if (membershipFailure !== undefined) {
      return planTrustedNodeLabelFailure(input.policy, input.node, membershipFailure, instanceId);
    }

    const ec2Failure = attestEc2AndNode(input, instanceId, availabilityZone);
    if (ec2Failure !== undefined) {
      return planTrustedNodeLabelFailure(input.policy, input.node, ec2Failure, instanceId);
    }

    const taintFailure = attestTaints(input);
    if (taintFailure !== undefined) {
      return planTrustedNodeLabelFailure(input.policy, input.node, taintFailure, instanceId);
    }

    const existing = input.node.labels[input.policy.protectedLabelKey];
    if (existing !== undefined && existing !== input.policy.protectedLabelValue) {
      return deny("protected_label_conflict");
    }
    if (existing === input.policy.protectedLabelValue) {
      return { action: "noop", instanceId };
    }

    const plan: ReconciliationPlan = {
      mutation: "add",
      nodeName: input.node.name,
      nodeUid: input.node.uid,
      resourceVersion: input.node.resourceVersion,
      providerId: input.node.providerId,
      instanceId,
      protectedLabelKey: input.policy.protectedLabelKey,
      protectedLabelValue: input.policy.protectedLabelValue,
    };
    return {
      action: "patch",
      plan,
      patch: [
        { op: "test", path: "/metadata/uid", value: input.node.uid },
        {
          op: "test",
          path: "/metadata/resourceVersion",
          value: input.node.resourceVersion,
        },
        { op: "test", path: "/spec/providerID", value: input.node.providerId },
        {
          op: "add",
          path: `/metadata/labels/${jsonPointerEscape(input.policy.protectedLabelKey)}`,
          value: input.policy.protectedLabelValue,
        },
      ],
    };
  } catch {
    return deny("input_malformed");
  }
}

/** Recheck local Node identity immediately before sending a planned patch. */
export function validateReconciliationPlan(
  plan: ReconciliationPlan,
  currentNode: NodeSnapshot,
): PlanValidation {
  if (currentNode.name !== plan.nodeName) return { valid: false, reason: "node_name_changed" };
  if (currentNode.uid !== plan.nodeUid) return { valid: false, reason: "node_uid_changed" };
  if (currentNode.resourceVersion !== plan.resourceVersion) {
    return { valid: false, reason: "resource_version_changed" };
  }
  if (currentNode.providerId !== plan.providerId) {
    return { valid: false, reason: "provider_id_changed" };
  }
  const currentLabel = currentNode.labels[plan.protectedLabelKey];
  if (
    (plan.mutation === "add" && currentLabel !== undefined) ||
    (plan.mutation === "remove" && currentLabel !== plan.protectedLabelValue)
  ) {
    return { valid: false, reason: "protected_label_changed" };
  }
  return { valid: true };
}

/** Classify desired/observed capacity without turning scale-to-zero into an alarm. */
export function classifyNodeGroupCapacity(
  desiredSize: number,
  observedNodeCount: number,
): CapacityState {
  if (!isNonNegativeInteger(desiredSize) || !isNonNegativeInteger(observedNodeCount)) {
    return "invalid";
  }
  if (desiredSize === 0 && observedNodeCount === 0) return "zero_capacity";
  if (desiredSize > 0 && observedNodeCount === 0) return "awaiting_nodes";
  if (observedNodeCount < desiredSize) return "reconciling";
  return "ready";
}
