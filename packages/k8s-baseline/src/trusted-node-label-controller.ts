import { createHash } from "node:crypto";

import type { TrustedNodeLabelAwsAdapter } from "./trusted-node-label-controller-aws";
import type { TrustedNodeLabelKubernetesAdapter } from "./trusted-node-label-controller-kubernetes";
import {
  classifyNodeGroupCapacity,
  planTrustedNodeLabel,
  validateReconciliationPlan,
  type DenyReason,
  type TrustedNodeLabelPolicy,
} from "./trusted-node-label-reconciler-core";

const PROVIDER_ID =
  /^aws:\/\/\/([a-z]{2}(?:-gov)?-[a-z]+-\d[a-z])\/(i-[0-9a-f]{8}(?:[0-9a-f]{9})?)$/u;

export type ControllerAuditEventName =
  | "cycle_complete"
  | "provider_failure"
  | "node_denied"
  | "node_noop"
  | "node_patched"
  | "stale_plan"
  | "patch_rejected"
  | "metric_publish_failed";

export interface ControllerAuditEvent {
  readonly timestamp: string;
  readonly event: ControllerAuditEventName;
  readonly reason?: string;
  readonly nodeRef?: string;
  readonly capacity?: string;
  readonly decisions?: number;
  readonly failures?: number;
  readonly missingTrustedLabels?: number;
}

export type ControllerAuditSink = (event: ControllerAuditEvent) => void;

export interface TrustedNodeLabelControllerConfig {
  readonly policy: TrustedNodeLabelPolicy;
  readonly reconcileIntervalMs: number;
}

export interface TrustedNodeLabelControllerDependencies {
  readonly aws: TrustedNodeLabelAwsAdapter;
  readonly kubernetes: TrustedNodeLabelKubernetesAdapter;
  readonly audit?: ControllerAuditSink;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface TrustedNodeLabelCycleResult {
  readonly capacity: ReturnType<typeof classifyNodeGroupCapacity>;
  readonly decisions: number;
  readonly failures: number;
  readonly missingTrustedLabels: number;
  readonly patched: number;
}

function defaultAudit(event: ControllerAuditEvent): void {
  console.log(JSON.stringify(event));
}

function emit(sink: ControllerAuditSink, event: ControllerAuditEvent): void {
  try {
    sink(event);
  } catch {
    // Audit sinks never gain authority over the reconciliation decision.
  }
}

function timestamp(now: () => number): string {
  return new Date(now()).toISOString();
}

function nodeRef(uid: string): string {
  return createHash("sha256").update(uid, "utf8").digest("hex").slice(0, 16);
}

function errorCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "unexpected_failure";
}

async function publishMetricsSafely(
  aws: TrustedNodeLabelAwsAdapter,
  audit: ControllerAuditSink,
  now: () => number,
  result: Omit<TrustedNodeLabelCycleResult, "capacity" | "patched">,
): Promise<void> {
  try {
    await aws.publishMetrics({
      decisions: result.decisions,
      failures: result.failures,
      missingTrustedLabels: result.missingTrustedLabels,
      timestamp: new Date(now()),
    });
  } catch (error) {
    emit(audit, {
      timestamp: timestamp(now),
      event: "metric_publish_failed",
      reason: errorCode(error),
    });
  }
}

export async function runTrustedNodeLabelControllerCycle(
  config: TrustedNodeLabelControllerConfig,
  dependencies: TrustedNodeLabelControllerDependencies,
): Promise<TrustedNodeLabelCycleResult> {
  const audit = dependencies.audit ?? defaultAudit;
  const now = dependencies.now ?? Date.now;
  let nodeGroup;
  let autoScalingGroups;
  let nodes;
  try {
    nodeGroup = await dependencies.aws.describeNodeGroup();
    autoScalingGroups = await dependencies.aws.describeAutoScalingGroups(
      nodeGroup.autoScalingGroupNames,
    );
    nodes = await dependencies.kubernetes.listCandidateNodes();
  } catch (error) {
    const result: TrustedNodeLabelCycleResult = {
      capacity: "invalid",
      decisions: 0,
      failures: 1,
      missingTrustedLabels: 0,
      patched: 0,
    };
    emit(audit, {
      timestamp: timestamp(now),
      event: "provider_failure",
      reason: errorCode(error),
    });
    await publishMetricsSafely(dependencies.aws, audit, now, result);
    return result;
  }

  const capacity = classifyNodeGroupCapacity(nodeGroup.scalingConfig.desiredSize, nodes.length);
  let decisions = 0;
  let failures = capacity === "invalid" || capacity === "awaiting_nodes" ? 1 : 0;
  let missingTrustedLabels = capacity === "awaiting_nodes" || capacity === "reconciling" ? 1 : 0;
  let patched = 0;

  for (const node of nodes) {
    decisions += 1;
    const ref = nodeRef(node.uid);
    const missingAtRead = node.labels[config.policy.protectedLabelKey] === undefined;
    const provider = PROVIDER_ID.exec(node.providerId);
    if (provider === null) {
      failures += 1;
      if (missingAtRead) missingTrustedLabels += 1;
      emit(audit, {
        timestamp: timestamp(now),
        event: "node_denied",
        reason: "provider_id_malformed" satisfies DenyReason,
        nodeRef: ref,
      });
      continue;
    }

    let ec2Instance;
    try {
      ec2Instance = await dependencies.aws.describeEc2Instance(provider[2]);
    } catch (error) {
      failures += 1;
      if (missingAtRead) missingTrustedLabels += 1;
      emit(audit, {
        timestamp: timestamp(now),
        event: "provider_failure",
        reason: errorCode(error),
        nodeRef: ref,
      });
      continue;
    }

    const decision = planTrustedNodeLabel({
      nowEpochMs: now(),
      policy: config.policy,
      node,
      nodeGroup,
      autoScalingGroups,
      ec2Instance,
    });
    if (decision.action === "deny") {
      failures += 1;
      if (missingAtRead) missingTrustedLabels += 1;
      emit(audit, {
        timestamp: timestamp(now),
        event: "node_denied",
        reason: decision.reason,
        nodeRef: ref,
      });
      continue;
    }
    if (decision.action === "noop") {
      emit(audit, { timestamp: timestamp(now), event: "node_noop", nodeRef: ref });
      continue;
    }

    try {
      const currentNode = await dependencies.kubernetes.getNode(decision.plan.nodeName);
      const validation = validateReconciliationPlan(decision.plan, currentNode);
      if (!validation.valid) {
        failures += 1;
        missingTrustedLabels += 1;
        emit(audit, {
          timestamp: timestamp(now),
          event: "stale_plan",
          reason: validation.reason,
          nodeRef: ref,
        });
        continue;
      }
      await dependencies.kubernetes.patchNode(decision.plan.nodeName, decision.patch);
      patched += 1;
      emit(audit, { timestamp: timestamp(now), event: "node_patched", nodeRef: ref });
    } catch (error) {
      failures += 1;
      missingTrustedLabels += 1;
      emit(audit, {
        timestamp: timestamp(now),
        event: "patch_rejected",
        reason: errorCode(error),
        nodeRef: ref,
      });
    }
  }

  const result: TrustedNodeLabelCycleResult = {
    capacity,
    decisions,
    failures,
    missingTrustedLabels,
    patched,
  };
  await publishMetricsSafely(dependencies.aws, audit, now, result);
  emit(audit, {
    timestamp: timestamp(now),
    event: "cycle_complete",
    capacity,
    decisions,
    failures,
    missingTrustedLabels,
  });
  return result;
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, milliseconds);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runTrustedNodeLabelController(
  config: TrustedNodeLabelControllerConfig,
  dependencies: TrustedNodeLabelControllerDependencies,
  signal: AbortSignal,
): Promise<void> {
  const sleep = dependencies.sleep ?? defaultSleep;
  while (!signal.aborted) {
    await runTrustedNodeLabelControllerCycle(config, dependencies);
    if (!signal.aborted) await sleep(config.reconcileIntervalMs, signal);
  }
}
