import type * as pulumi from "@pulumi/pulumi";

export type SubnetOwnership = "shared" | "owned";

export interface EksSubnetTaggerArgs {
  /**
   * EKS cluster name. Used in the `kubernetes.io/cluster/<name>` tag value
   * (set to `ownership` — `"shared"` or `"owned"`).
   */
  clusterName: string;

  /**
   * `"shared"` if multiple clusters use the same subnets;
   * `"owned"` if this cluster owns them exclusively. Drives the
   * `kubernetes.io/cluster/<name>` tag value.
   */
  ownership: SubnetOwnership;

  /**
   * Subnet IDs to tag for ALB Controller's internet-facing
   * (`scheme: internet-facing`) auto-discovery. Each gets:
   *   - `kubernetes.io/role/elb=1`
   *   - `kubernetes.io/cluster/<clusterName>=<ownership>`
   * Optional. Refused if BOTH `publicSubnetIds` and `privateSubnetIds` are
   * absent at construction time.
   */
  publicSubnetIds?: pulumi.Input<pulumi.Input<string>[]>;

  /**
   * Subnet IDs to tag for ALB Controller's internal-only
   * (`scheme: internal`) auto-discovery. Each gets:
   *   - `kubernetes.io/role/internal-elb=1`
   *   - `kubernetes.io/cluster/<clusterName>=<ownership>`
   * Optional. Refused if BOTH lists are absent.
   */
  privateSubnetIds?: pulumi.Input<pulumi.Input<string>[]>;
}
