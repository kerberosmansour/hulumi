import type * as k8s from "@pulumi/kubernetes";
import type { Input } from "@pulumi/pulumi";

import type { KubernetesTaint } from "./trusted-node-label-reconciler-core";

export const DEFAULT_TRUSTED_NODE_LABEL_METRIC_NAMESPACE = "Hulumi/EksTrustedNodeLabelReconciler";

export interface EksTrustedNodeLabelReconcilerArgs {
  /** Provider for the target EKS cluster. */
  k8sProvider: k8s.Provider;
  /** Exact EKS cluster name. */
  clusterName: string;
  /** Exact EKS managed node-group name. */
  nodeGroupName: string;
  /** Twelve-digit AWS account that owns the cluster and instances. */
  awsAccountId: string;
  /** Exact AWS region for every provider call and IAM condition. */
  awsRegion: string;
  /** Existing namespace in which the controller is deployed. */
  namespace: string;
  /** Optional exact ServiceAccount name. Defaults to a name derived from the component name. */
  serviceAccountName?: string;
  /** Immutable controller image reference ending in @sha256:<64 lowercase hex>. */
  controllerImage: string;
  /** NodeRestriction-protected label key that the controller may add. */
  protectedLabelKey: string;
  /** Exact value that may be added for the protected label. */
  protectedLabelValue: string;
  /** Exact EC2 instance types allowed for this node group. */
  allowedInstanceTypes: readonly string[];
  /** Taints that independently identify the expected node-group posture. */
  expectedTaints: readonly KubernetesTaint[];
  /** SNS topic for failure and missing-label alarms. */
  alarmSnsTopicArn: Input<string>;
  /** Reconciliation interval, 15–900 seconds. Defaults to 60. */
  reconcileIntervalSeconds?: number;
  /** Maximum provider evidence age, 15–600 seconds. Defaults to 120. */
  maxEvidenceAgeSeconds?: number;
  /** Maximum cross-provider evidence skew, 1–60 seconds. Defaults to 15. */
  maxEvidenceSkewSeconds?: number;
  /** Maximum candidate Nodes per cycle, 1–500. Defaults to 200. */
  maxNodesPerCycle?: number;
  /** CloudWatch namespace. Defaults to Hulumi/EksTrustedNodeLabelReconciler. */
  metricNamespace?: string;
  /** Optional AWS tags for the IAM role, policy, Pod Identity association and alarms. */
  tags?: Input<Record<string, Input<string>>>;
}
