import type * as pulumi from "@pulumi/pulumi";

export type EksFoundationTier = "sandbox" | "startup-hardened";
export type EksClusterFoundationMode = "create" | "adopt";
export type EksClusterEndpointMode = "private" | "restricted-public";

export const MAX_EKS_CLUSTER_NODE_POOLS = 8;

export interface EksClusterEndpointArgs {
  readonly mode?: EksClusterEndpointMode;
  readonly publicAccessCidrs?: readonly string[];
}

export interface EksClusterNodePoolArgs {
  readonly name: string;
  readonly nodeRoleArn: pulumi.Input<string>;
  readonly subnetIds: readonly pulumi.Input<string>[];
  readonly instanceTypes?: readonly pulumi.Input<string>[];
  readonly minSize: number;
  readonly desiredSize: number;
  readonly maxSize: number;
  readonly labels?: pulumi.Input<Record<string, string>>;
  readonly taints?: readonly pulumi.Input<{
    key: string;
    value?: string;
    effect: "NO_SCHEDULE" | "NO_EXECUTE" | "PREFER_NO_SCHEDULE";
  }>[];
}

export interface EksClusterAddonArgs {
  readonly name: string;
  readonly version: string;
  readonly serviceAccountRoleArn?: pulumi.Input<string>;
  readonly configurationValues?: pulumi.Input<string>;
}

export interface EksClusterPodIdentityAssociationArgs {
  readonly namespace: pulumi.Input<string>;
  readonly serviceAccount: pulumi.Input<string>;
  readonly roleArn: pulumi.Input<string>;
}

interface EksClusterFoundationBaseArgs {
  readonly tier: EksFoundationTier;
  readonly clusterName: pulumi.Input<string>;
  readonly tags?: pulumi.Input<Record<string, string>>;
}

export interface EksClusterFoundationCreateArgs extends EksClusterFoundationBaseArgs {
  readonly mode: "create";
  readonly roleArn: pulumi.Input<string>;
  readonly subnetIds: readonly pulumi.Input<string>[];
  readonly endpoint?: EksClusterEndpointArgs;
  readonly enabledClusterLogTypes?: readonly string[];
  readonly version?: pulumi.Input<string>;
  readonly addons?: readonly EksClusterAddonArgs[];
  readonly nodePools?: readonly EksClusterNodePoolArgs[];
  readonly maxNodePools?: number;
  readonly podIdentityAssociations?: readonly EksClusterPodIdentityAssociationArgs[];
  readonly allowBroadPodAwsCredentials?: boolean;
}

export interface EksClusterFoundationAdoptArgs extends EksClusterFoundationBaseArgs {
  readonly mode: "adopt";
  readonly expectedEndpointMode?: EksClusterEndpointMode;
}

export type EksClusterFoundationArgs =
  | EksClusterFoundationCreateArgs
  | EksClusterFoundationAdoptArgs;

export interface EksClusterValidationExpectations {
  readonly endpointMode: EksClusterEndpointMode;
  readonly auditLogsRequired: boolean;
  readonly imdsV2Required: boolean;
  readonly podIdentityPreferred: boolean;
}
