import type * as pulumi from "@pulumi/pulumi";

export type EksEndpointAccessMode = "private" | "restricted-public" | "public-temporary";

export interface TemporaryBroadPublicAccess {
  /** Human-readable reason for temporarily allowing broad public endpoint access. */
  reason: string;
  /** Date by which the temporary broad public access must be removed, as YYYY-MM-DD. */
  expiresOn: string;
  /** Optional issue/change URL that tracks removal of the temporary exception. */
  ticketUrl?: string;
}

export interface EksAdminOperatorAccess {
  /**
   * IPv4 CIDRs that may reach the private EKS API endpoint through the cluster
   * security group. Broad `0.0.0.0/0` is always refused here.
   */
  cidrBlocks?: string[];
  /**
   * IPv6 CIDRs that may reach the private EKS API endpoint through the cluster
   * security group. Broad `::/0` is always refused here.
   */
  ipv6CidrBlocks?: string[];
  /**
   * Source security groups, commonly an AWS Client VPN endpoint SG or bastion SG,
   * that may reach the private EKS API endpoint.
   */
  sourceSecurityGroupIds?: pulumi.Input<string>[];
  /** Optional ingress-rule description. */
  description?: pulumi.Input<string>;
}

export interface EksAdminAccessPathArgs {
  /** EKS cluster name, used in audit outputs. */
  clusterName: pulumi.Input<string>;
  /**
   * Security group attached to the EKS control-plane endpoint ENIs. Required when
   * this component creates operator ingress rules.
   */
  clusterSecurityGroupId?: pulumi.Input<string>;
  /** Desired endpoint posture. Private endpoint remains enabled in all modes. */
  endpointMode: EksEndpointAccessMode;
  /**
   * Public endpoint allow-list for `restricted-public` or `public-temporary`.
   * `0.0.0.0/0` and `::/0` are refused unless `endpointMode` is
   * `public-temporary` and `temporaryBroadPublicAccess` is supplied.
   */
  publicAccessCidrs?: string[];
  /** Operator network path for private endpoint access. Required in `private` mode. */
  operatorAccess?: EksAdminOperatorAccess;
  /** Default true. Set false when another stack owns the SG ingress rules. */
  createSecurityGroupRules?: boolean;
  /** Required for broad public endpoint access in `public-temporary` mode. */
  temporaryBroadPublicAccess?: TemporaryBroadPublicAccess;
}
