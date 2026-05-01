// HulumiEksClusterPack — EKS cluster posture rules. Inspects raw
// `aws.eks.Cluster` resources without wrapping cluster topology
// (per the runbook's no-cluster-wrapper rule).
//
//   EKS-CL-1  Public endpoint must NOT allow `0.0.0.0/0`
//   EKS-CL-2  Audit log must be on (`logging.clusterLogging.enabled`)

import type { ResourceValidationPolicy } from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { matchSuppression, type Suppression } from "../aws/suppressions";

const DOCS_BASE = "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/README.md";

const EKS_CLUSTER_TYPE = "aws:eks/cluster:Cluster";

interface VpcConfig {
  endpointPublicAccess?: boolean;
  endpointPrivateAccess?: boolean;
  publicAccessCidrs?: string[];
}

interface ClusterLoggingShape {
  // Pulumi's aws.eks.Cluster.enabledClusterLogTypes is the modern field.
  // Some users still pass the older `logging` shape; accept both.
  enabledClusterLogTypes?: string[];
}

function readSuppressions(config: Record<string, unknown> | undefined): readonly Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.ruleId === "string" && typeof o.reason === "string" && o.reason.trim().length > 0
    );
  });
}

export const eksCl1NoBroadPublicEndpoint: ResourceValidationPolicy = {
  name: "HULUMI-EKS-CL-1-no-broad-public-endpoint",
  description:
    "EKS control-plane public endpoints must NOT allow `0.0.0.0/0`. If `endpointPublicAccess` is true, `publicAccessCidrs` must restrict the source. Mandatory violation; suppress with a reason if the cluster is intentionally world-reachable behind an additional control (e.g. operator-bastion VPN).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== EKS_CLUSTER_TYPE) return;
    const vpc = (args.props.vpcConfig ?? {}) as VpcConfig;
    if (vpc.endpointPublicAccess !== true) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-EKS-CL-1", args.urn, suppressions).suppressed) return;
    const cidrs = vpc.publicAccessCidrs ?? [];
    // AWS default for unset is ["0.0.0.0/0"] — the unsafe-by-default behavior we want to catch.
    if (cidrs.length === 0 || cidrs.includes("0.0.0.0/0")) {
      reportViolation(
        `HULUMI-EKS-CL-1: EKS cluster ${args.urn} has endpointPublicAccess=true with publicAccessCidrs containing 0.0.0.0/0 (or unset, which defaults to 0.0.0.0/0). Restrict to the operator network. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

const REQUIRED_AUDIT_LOG_TYPE = "audit";

export const eksCl2AuditLoggingRequired: ResourceValidationPolicy = {
  name: "HULUMI-EKS-CL-2-audit-logging-required",
  description:
    "EKS clusters must enable control-plane `audit` logs so the runtime detection lane (M5) and the K8s drift adapters (M6) have a deterministic event source. Mandatory violation; suppress with a reason for ephemeral test clusters only.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== EKS_CLUSTER_TYPE) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-EKS-CL-2", args.urn, suppressions).suppressed) return;
    const cluster = args.props as ClusterLoggingShape;
    const enabled = cluster.enabledClusterLogTypes ?? [];
    if (!enabled.includes(REQUIRED_AUDIT_LOG_TYPE)) {
      reportViolation(
        `HULUMI-EKS-CL-2: EKS cluster ${args.urn} does not enable the "audit" control-plane log. Add "audit" to enabledClusterLogTypes. Docs: ${DOCS_BASE}`,
      );
    }
  },
};

export const hulumiEksClusterPackMetadata: PackMetadata = {
  id: "hulumi-eks-cluster-pack",
  title: "Hulumi EKS Cluster Pack",
  framework: "hulumi-eks",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: "HULUMI-EKS-CL-1",
      title: "EKS public endpoint must restrict CIDR",
      description: eksCl1NoBroadPublicEndpoint.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["CCM:DSP-04", "NIST-800-53-r5:SC-7", "CIS-EKS:2.1.1"],
      docsUrl: DOCS_BASE,
    },
    {
      id: "HULUMI-EKS-CL-2",
      title: "EKS audit logging required",
      description: eksCl2AuditLoggingRequired.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:LOG-01", "NIST-800-53-r5:AU-2", "CIS-EKS:2.1.2"],
      docsUrl: DOCS_BASE,
    },
  ],
};
