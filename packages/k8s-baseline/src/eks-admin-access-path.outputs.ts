import type * as pulumi from "@pulumi/pulumi";
import type { EksEndpointAccessMode } from "./eks-admin-access-path.args";

export interface EksEndpointAccessConfig {
  endpointPrivateAccess: boolean;
  endpointPublicAccess: boolean;
  publicAccessCidrs: string[];
}

export interface EksAdminAccessSummary {
  endpointMode: EksEndpointAccessMode;
  publicAccessCidrs: string[];
  operatorCidrBlocks: string[];
  operatorIpv6CidrBlocks: string[];
  operatorSourceSecurityGroupIds: string[];
  securityGroupIngressRuleCount: number;
}

export interface EksAdminAccessPathOutputs {
  /** `vpcConfig.endpointPublicAccess` value consumers can feed into EKS resources. */
  endpointPublicAccess: pulumi.Output<boolean>;
  /** `vpcConfig.endpointPrivateAccess` value consumers can feed into EKS resources. */
  endpointPrivateAccess: pulumi.Output<boolean>;
  /** `vpcConfig.publicAccessCidrs` value consumers can feed into EKS resources. */
  publicAccessCidrs: pulumi.Output<string[]>;
  /** Combined EKS endpoint access config. */
  endpointAccessConfig: pulumi.Output<EksEndpointAccessConfig>;
  /** IDs of security-group rules this component created. */
  securityGroupRuleIds: pulumi.Output<string[]>;
  /** Short operator-facing note for deterministic kubectl access docs. */
  kubectlAccessHint: pulumi.Output<string>;
  /** Optional policy-suppression note for temporary broad public endpoint access. */
  policyExceptionReason: pulumi.Output<string | undefined>;
  /** Machine-readable summary for downstream docs and audit evidence. */
  accessSummary: pulumi.Output<EksAdminAccessSummary>;
}
