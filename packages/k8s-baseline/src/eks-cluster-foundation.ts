import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { analyzeCidrCoverage } from "./cidr-coverage";
import type {
  EksClusterEndpointMode,
  EksClusterFoundationArgs,
  EksClusterFoundationCreateArgs,
  EksClusterNodePoolArgs,
  EksClusterValidationExpectations,
  EksFoundationTier,
} from "./eks-cluster-foundation.args";
import { MAX_EKS_CLUSTER_NODE_POOLS } from "./eks-cluster-foundation.args";
import type { EksClusterFoundationOutputs } from "./eks-cluster-foundation.outputs";

export const EKS_CLUSTER_FOUNDATION_COMPONENT_TYPE = "hulumi:k8s:EksClusterFoundation";

const VALID_TIERS: ReadonlySet<EksFoundationTier> = new Set(["sandbox", "startup-hardened"]);
const VALID_ENDPOINT_MODES: ReadonlySet<EksClusterEndpointMode> = new Set([
  "private",
  "restricted-public",
]);
const DEFAULT_CLUSTER_LOG_TYPES = ["api", "audit", "authenticator"] as const;
const COMPONENT_TAGS = {
  "hulumi:component": "EksClusterFoundation",
} as const;

function validateStringInput(value: pulumi.Input<string>, label: string): void {
  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error(`EksClusterFoundation: ${label} must be non-empty`);
  }
}

function validateTier(tier: unknown): asserts tier is EksFoundationTier {
  if (typeof tier !== "string" || !VALID_TIERS.has(tier as EksFoundationTier)) {
    throw new Error('EksClusterFoundation: tier must be "sandbox" or "startup-hardened"');
  }
}

function endpointMode(args: EksClusterFoundationArgs): EksClusterEndpointMode {
  if (args.mode === "adopt") return args.expectedEndpointMode ?? "private";
  return args.endpoint?.mode ?? "private";
}

function validateEndpoint(args: EksClusterFoundationCreateArgs): void {
  const mode = endpointMode(args);
  if (!VALID_ENDPOINT_MODES.has(mode)) {
    throw new Error('EksClusterFoundation: endpoint.mode must be "private" or "restricted-public"');
  }
  const cidrs = args.endpoint?.publicAccessCidrs ?? [];
  if (mode === "private" && cidrs.length > 0) {
    throw new Error("EksClusterFoundation: publicAccessCidrs must be empty for private endpoint");
  }
  if (mode === "restricted-public") {
    if (cidrs.length === 0) {
      throw new Error(
        "EksClusterFoundation: publicAccessCidrs is required for restricted-public endpoint",
      );
    }
    const coverage = analyzeCidrCoverage(cidrs);
    if (coverage.malformed !== undefined) {
      throw new Error(
        `EksClusterFoundation: publicAccessCidrs contains malformed CIDR "${coverage.malformed}"`,
      );
    }
    if (coverage.coversInternet) {
      throw new Error(
        "EksClusterFoundation: publicAccessCidrs covers the entire internet; restricted-public requires operator CIDRs",
      );
    }
  }
}

function validateNodePool(pool: EksClusterNodePoolArgs): void {
  validateStringInput(pool.name, "nodePools[].name");
  if (pool.subnetIds.length === 0) {
    throw new Error("EksClusterFoundation: nodePools[].subnetIds must be non-empty");
  }
  if (pool.minSize < 0 || pool.desiredSize < pool.minSize || pool.maxSize < pool.desiredSize) {
    throw new Error(
      "EksClusterFoundation: node pool sizes must satisfy minSize <= desiredSize <= maxSize",
    );
  }
}

function validateArgs(args: EksClusterFoundationArgs): void {
  validateTier(args.tier);
  validateStringInput(args.clusterName, "clusterName");
  if (args.mode === "adopt") {
    if (
      args.expectedEndpointMode !== undefined &&
      !VALID_ENDPOINT_MODES.has(args.expectedEndpointMode)
    ) {
      throw new Error(
        'EksClusterFoundation: expectedEndpointMode must be "private" or "restricted-public"',
      );
    }
    return;
  }

  validateStringInput(args.roleArn, "roleArn");
  if (args.subnetIds.length < 2) {
    throw new Error("EksClusterFoundation: create mode requires at least two subnetIds");
  }
  validateEndpoint(args);
  const logs = args.enabledClusterLogTypes ?? DEFAULT_CLUSTER_LOG_TYPES;
  if (!logs.includes("audit")) {
    throw new Error('EksClusterFoundation: enabledClusterLogTypes must include "audit"');
  }
  const maxNodePools = args.maxNodePools ?? MAX_EKS_CLUSTER_NODE_POOLS;
  const nodePools = args.nodePools ?? [];
  if (nodePools.length > maxNodePools) {
    throw new Error(
      `EksClusterFoundation: nodePools has ${nodePools.length} entries; max ${maxNodePools}`,
    );
  }
  nodePools.forEach(validateNodePool);
  if (args.allowBroadPodAwsCredentials === true) {
    throw new Error(
      "EksClusterFoundation: broad pod AWS credentials are not allowed; use EKS Pod Identity associations",
    );
  }
}

function tags(
  tier: EksFoundationTier,
  extra?: pulumi.Input<Record<string, string>>,
): pulumi.Input<Record<string, string>> {
  return pulumi.output(extra ?? {}).apply((resolved) => ({
    ...resolved,
    ...COMPONENT_TAGS,
    "hulumi:tier": tier,
  }));
}

function endpointVpcConfig(
  args: EksClusterFoundationCreateArgs,
): aws.types.input.eks.ClusterVpcConfig {
  const mode = endpointMode(args);
  return {
    subnetIds: [...args.subnetIds],
    endpointPrivateAccess: true,
    endpointPublicAccess: mode === "restricted-public",
    ...(mode === "restricted-public"
      ? { publicAccessCidrs: [...(args.endpoint?.publicAccessCidrs ?? [])] }
      : {}),
  };
}

function expectations(args: EksClusterFoundationArgs): EksClusterValidationExpectations {
  return {
    endpointMode: endpointMode(args),
    auditLogsRequired: true,
    imdsV2Required: true,
    podIdentityPreferred: true,
  };
}

export class EksClusterFoundation
  extends pulumi.ComponentResource
  implements EksClusterFoundationOutputs
{
  public readonly clusterName: pulumi.Output<string>;
  public readonly ownedClusterResources: pulumi.Output<boolean>;
  public readonly endpointMode: pulumi.Output<EksClusterEndpointMode>;
  public readonly validationExpectations: pulumi.Output<EksClusterValidationExpectations>;
  public readonly addonNames: pulumi.Output<string[]>;
  public readonly nodePoolNames: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: EksClusterFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    validateArgs(args);
    super(EKS_CLUSTER_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);

    const childOptions = { parent: this } as const;
    const commonTags = tags(args.tier, args.tags);
    const mode = endpointMode(args);
    const addonNames: string[] = [];
    const nodePoolNames: string[] = [];

    if (args.mode === "create") {
      const cluster = new aws.eks.Cluster(
        `${name}-cluster`,
        {
          name: args.clusterName,
          roleArn: args.roleArn,
          vpcConfig: endpointVpcConfig(args),
          enabledClusterLogTypes: [...(args.enabledClusterLogTypes ?? DEFAULT_CLUSTER_LOG_TYPES)],
          ...(args.version !== undefined ? { version: args.version } : {}),
          tags: commonTags,
        },
        childOptions,
      );

      for (const addon of args.addons ?? []) {
        new aws.eks.Addon(
          `${name}-addon-${addon.name}`,
          {
            clusterName: cluster.name,
            addonName: addon.name,
            addonVersion: addon.version,
            resolveConflictsOnCreate: "OVERWRITE",
            resolveConflictsOnUpdate: "OVERWRITE",
            ...(addon.serviceAccountRoleArn !== undefined
              ? { serviceAccountRoleArn: addon.serviceAccountRoleArn }
              : {}),
            ...(addon.configurationValues !== undefined
              ? { configurationValues: addon.configurationValues }
              : {}),
            tags: commonTags,
          },
          childOptions,
        );
        addonNames.push(addon.name);
      }

      for (const association of args.podIdentityAssociations ?? []) {
        new aws.eks.PodIdentityAssociation(
          `${name}-pod-identity-${association.namespace}-${association.serviceAccount}`,
          {
            clusterName: cluster.name,
            namespace: association.namespace,
            serviceAccount: association.serviceAccount,
            roleArn: association.roleArn,
            tags: commonTags,
          },
          childOptions,
        );
      }

      for (const pool of args.nodePools ?? []) {
        const lt = new aws.ec2.LaunchTemplate(
          `${name}-${pool.name}-lt`,
          {
            namePrefix: `${name}-${pool.name}-`,
            metadataOptions: {
              httpEndpoint: "enabled",
              httpTokens: "required",
            },
            tagSpecifications: [
              {
                resourceType: "instance",
                tags: commonTags,
              },
            ],
            tags: commonTags,
          },
          childOptions,
        );
        new aws.eks.NodeGroup(
          `${name}-${pool.name}-ng`,
          {
            clusterName: cluster.name,
            nodeGroupName: `${name}-${pool.name}`,
            nodeRoleArn: pool.nodeRoleArn,
            subnetIds: [...pool.subnetIds],
            scalingConfig: {
              minSize: pool.minSize,
              desiredSize: pool.desiredSize,
              maxSize: pool.maxSize,
            },
            ...(pool.instanceTypes !== undefined ? { instanceTypes: [...pool.instanceTypes] } : {}),
            ...(pool.labels !== undefined ? { labels: pool.labels } : {}),
            ...(pool.taints !== undefined ? { taints: [...pool.taints] } : {}),
            launchTemplate: {
              id: lt.id,
              version: pulumi.interpolate`${lt.latestVersion}`,
            },
            tags: commonTags,
          },
          childOptions,
        );
        nodePoolNames.push(pool.name);
      }
    }

    this.clusterName = pulumi.output(args.clusterName);
    this.ownedClusterResources = pulumi.output(args.mode === "create");
    this.endpointMode = pulumi.output(mode);
    this.validationExpectations = pulumi.output(expectations(args));
    this.addonNames = pulumi.output(addonNames);
    this.nodePoolNames = pulumi.output(nodePoolNames);

    this.registerOutputs({
      clusterName: this.clusterName,
      ownedClusterResources: this.ownedClusterResources,
      endpointMode: this.endpointMode,
      validationExpectations: this.validationExpectations,
      addonNames: this.addonNames,
      nodePoolNames: this.nodePoolNames,
    });
  }
}
