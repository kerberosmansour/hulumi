import type * as pulumi from "@pulumi/pulumi";

/** Pod Security Admission level. `restricted` is the strongest. */
export type PsaLevel = "privileged" | "baseline" | "restricted";

/** Service-account token automount mode (M4 typed escape hatch). */
export type AutomountTokenMode = "disabled" | "required";

/** Bound on labels applied to the Namespace metadata. */
export const MAX_NAMESPACE_LABELS = 32;
/** Bound on `ResourceQuota.spec.hard` entries. */
export const MAX_QUOTA_ENTRIES = 32;
/** Bound on NetworkPolicy peers (per direction, per policy). */
export const MAX_NETWORK_POLICY_PEERS = 128;
export const RECOMMENDED_NETWORK_POLICY_PEERS = 32;

export interface NamespaceFoundationQuota {
  /** ResourceQuota `spec.hard` map. Bounded at 32 entries. */
  hard: Record<string, string>;
}

export interface NamespaceFoundationLimitRange {
  /** LimitRange entry shape (subset of K8s LimitRangeItem). */
  type: "Container" | "Pod" | "PersistentVolumeClaim";
  defaults?: { cpu?: string; memory?: string; "ephemeral-storage"?: string };
  defaultRequests?: { cpu?: string; memory?: string; "ephemeral-storage"?: string };
  max?: { cpu?: string; memory?: string; "ephemeral-storage"?: string };
  min?: { cpu?: string; memory?: string; "ephemeral-storage"?: string };
}

export interface NamespaceFoundationNetworkDefaults {
  /** Default `true`. Emits a deny-all `NetworkPolicy` for `Ingress` + `Egress`. */
  defaultDeny?: boolean;
  /** Default `true`. Emits a NetworkPolicy that allows DNS egress to `kube-system`. */
  allowDnsEgress?: boolean;
  /** Default `true`. Valid only with `defaultDeny: true`; Kubernetes NetworkPolicy has no standalone deny primitive for IMDS-only egress blocks. */
  denyImdsEgress?: boolean;
  /** Default `false`. When `true`, emit a NetworkPolicy allowing egress to the mesh ingress namespace. */
  allowMeshEgress?: boolean;
  /** Mesh ingress namespace to allow egress to when `allowMeshEgress` is `true`. */
  meshIngressNamespace?: pulumi.Input<string>;
}

export interface NamespaceFoundationArgs {
  /** Namespace name. Refused if empty, contains `/`, or contains `..`. */
  name: string;
  /** PSA enforcement level. Default `"baseline"` enforces, `"restricted"` audits/warns. */
  podSecurity?: PsaLevel;
  /** Audit/warn level. Default `"restricted"` (so `baseline`-enforced consumers see what restricted would catch). */
  podSecurityAuditAndWarn?: PsaLevel;
  /**
   * Default-namespace ServiceAccount token automount mode. M4 default is
   * `"disabled"` — the default ServiceAccount will not auto-mount its API
   * token; workloads that need API access bind their own SAs.
   */
  defaultServiceAccountAutomount?: AutomountTokenMode;
  /** Optional ResourceQuota. */
  quota?: NamespaceFoundationQuota;
  /** Optional LimitRange entries. */
  limitRanges?: NamespaceFoundationLimitRange[];
  /** Network policy defaults. Defaults to all-on except `allowMeshEgress`. */
  networkDefaults?: NamespaceFoundationNetworkDefaults;
  /** Extra labels merged onto the Namespace metadata. */
  labels?: Record<string, string>;
  /** Extra annotations merged onto the Namespace metadata. */
  annotations?: Record<string, string>;
  /** When `true`, the IMDS-deny NetworkPolicy carries a `hulumi.dev/cni-caveat` annotation reminding operators that NetworkPolicy enforcement requires a CNI plugin that supports it (e.g. Calico, Cilium). */
  cniCaveatNote?: boolean;
}
