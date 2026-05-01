import type * as pulumi from "@pulumi/pulumi";

/** Bound on the add-on inventory per call. */
export const MAX_EKS_ADDONS = 32;

export interface EksAddonSpec {
  /** Add-on name (e.g. `vpc-cni`, `coredns`, `kube-proxy`, `aws-ebs-csi-driver`). */
  name: string;
  /**
   * Exact add-on version. Required. Refused if `"latest"`, empty, or otherwise
   * resolves to a non-pinned identifier.
   */
  version: string;
  /** Optional pre-existing IAM role ARN for IRSA-enabled add-ons. */
  serviceAccountRoleArn?: pulumi.Input<string>;
  /** AWS Backup-style conflict resolution. Default `"OVERWRITE"`. */
  resolveConflicts?: "NONE" | "OVERWRITE" | "PRESERVE";
  /** Custom add-on configuration (JSON-shaped). */
  configurationValues?: pulumi.Input<string>;
}

export interface EksAddonFoundationArgs {
  /** EKS cluster name to attach the add-ons to. */
  clusterName: pulumi.Input<string>;
  /** List of pinned add-on specs. Bounded at {@link MAX_EKS_ADDONS}. Refused if empty. */
  addons: EksAddonSpec[];
  tags?: Record<string, string>;
}
