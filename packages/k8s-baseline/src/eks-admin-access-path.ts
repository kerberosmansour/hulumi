import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type {
  EksAdminAccessPathArgs,
  EksAdminOperatorAccess,
  EksEndpointAccessMode,
  TemporaryBroadPublicAccess,
} from "./eks-admin-access-path.args";
import type {
  EksAdminAccessPathOutputs,
  EksEndpointAccessConfig,
} from "./eks-admin-access-path.outputs";

export const EKS_ADMIN_ACCESS_PATH_COMPONENT_TYPE = "hulumi:k8s:EksAdminAccessPath";

const HTTPS_PORT = 443;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BROAD_CIDRS = new Set(["0.0.0.0/0", "::/0"]);
const VALID_ENDPOINT_MODES: ReadonlySet<EksEndpointAccessMode> = new Set([
  "private",
  "restricted-public",
  "public-temporary",
]);

interface NormalizedArgs {
  endpointMode: EksEndpointAccessMode;
  endpointPublicAccess: boolean;
  endpointPrivateAccess: boolean;
  publicAccessCidrs: string[];
  operatorCidrBlocks: string[];
  operatorIpv6CidrBlocks: string[];
  operatorSourceSecurityGroupIds: pulumi.Input<string>[];
  createSecurityGroupRules: boolean;
  temporaryBroadPublicAccess?: TemporaryBroadPublicAccess;
}

function normalizeStringList(field: string, values: string[] | undefined): string[] {
  return (values ?? []).map((value) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      throw new Error(`EksAdminAccessPath: ${field} cannot contain blank entries`);
    }
    return trimmed;
  });
}

function hasBroadCidr(values: string[]): string | undefined {
  return values.find((value) => BROAD_CIDRS.has(value));
}

function requireTemporaryBroadPublicAccess(
  name: string,
  exception: TemporaryBroadPublicAccess | undefined,
): TemporaryBroadPublicAccess {
  if (exception === undefined) {
    throw new Error(
      `EksAdminAccessPath: temporaryBroadPublicAccess is required for broad public endpoint access (component "${name}")`,
    );
  }
  if (exception.reason.trim() === "") {
    throw new Error(
      `EksAdminAccessPath: temporaryBroadPublicAccess.reason is required (component "${name}")`,
    );
  }
  if (!DATE_ONLY_RE.test(exception.expiresOn)) {
    throw new Error(
      `EksAdminAccessPath: temporaryBroadPublicAccess.expiresOn must use YYYY-MM-DD (component "${name}")`,
    );
  }
  return {
    reason: exception.reason.trim(),
    expiresOn: exception.expiresOn,
    ...(exception.ticketUrl !== undefined ? { ticketUrl: exception.ticketUrl } : {}),
  };
}

function hasOperatorSource(operator: EksAdminOperatorAccess | undefined): boolean {
  return (
    (operator?.cidrBlocks?.length ?? 0) > 0 ||
    (operator?.ipv6CidrBlocks?.length ?? 0) > 0 ||
    (operator?.sourceSecurityGroupIds?.length ?? 0) > 0
  );
}

function normalizeArgs(name: string, args: EksAdminAccessPathArgs): NormalizedArgs {
  if (typeof args.clusterName === "string" && args.clusterName.trim() === "") {
    throw new Error(`EksAdminAccessPath: clusterName is required (component "${name}")`);
  }
  if (!VALID_ENDPOINT_MODES.has(args.endpointMode)) {
    throw new Error(
      `EksAdminAccessPath: endpointMode must be one of "private" | "restricted-public" | "public-temporary" (got "${String(args.endpointMode)}")`,
    );
  }

  const endpointMode = args.endpointMode;
  const publicAccessCidrs = normalizeStringList("publicAccessCidrs", args.publicAccessCidrs);
  const operatorCidrBlocks = normalizeStringList(
    "operatorAccess.cidrBlocks",
    args.operatorAccess?.cidrBlocks,
  );
  const operatorIpv6CidrBlocks = normalizeStringList(
    "operatorAccess.ipv6CidrBlocks",
    args.operatorAccess?.ipv6CidrBlocks,
  );
  const operatorSourceSecurityGroupIds = args.operatorAccess?.sourceSecurityGroupIds ?? [];
  const createSecurityGroupRules = args.createSecurityGroupRules !== false;

  if (endpointMode === "private" && publicAccessCidrs.length > 0) {
    throw new Error(
      `EksAdminAccessPath: publicAccessCidrs must be empty in private mode (component "${name}")`,
    );
  }
  if (endpointMode !== "private" && publicAccessCidrs.length === 0) {
    throw new Error(
      `EksAdminAccessPath: publicAccessCidrs is required for ${endpointMode} mode (component "${name}")`,
    );
  }

  const broadPublicCidr = hasBroadCidr(publicAccessCidrs);
  let temporaryBroadPublicAccess: TemporaryBroadPublicAccess | undefined;
  if (broadPublicCidr !== undefined && endpointMode !== "public-temporary") {
    throw new Error(
      `EksAdminAccessPath: publicAccessCidrs contains ${broadPublicCidr}; use endpointMode "public-temporary" with temporaryBroadPublicAccess instead (component "${name}")`,
    );
  }
  if (endpointMode === "public-temporary") {
    temporaryBroadPublicAccess = requireTemporaryBroadPublicAccess(
      name,
      args.temporaryBroadPublicAccess,
    );
  } else if (args.temporaryBroadPublicAccess !== undefined) {
    throw new Error(
      `EksAdminAccessPath: temporaryBroadPublicAccess is only valid in public-temporary mode (component "${name}")`,
    );
  }

  const broadOperatorCidr =
    hasBroadCidr(operatorCidrBlocks) ?? hasBroadCidr(operatorIpv6CidrBlocks);
  if (broadOperatorCidr !== undefined) {
    const field =
      broadOperatorCidr === "::/0" ? "operatorAccess.ipv6CidrBlocks" : "operatorAccess.cidrBlocks";
    throw new Error(
      `EksAdminAccessPath: ${field} contains ${broadOperatorCidr}; broad control-plane SG ingress is refused (component "${name}")`,
    );
  }

  const operatorSourcePresent = hasOperatorSource(args.operatorAccess);
  if (endpointMode === "private" && !operatorSourcePresent) {
    throw new Error(
      `EksAdminAccessPath: private endpoint requires operatorAccess so kubectl has a deterministic network path (component "${name}")`,
    );
  }
  if (
    operatorSourcePresent &&
    createSecurityGroupRules &&
    args.clusterSecurityGroupId === undefined
  ) {
    throw new Error(
      `EksAdminAccessPath: clusterSecurityGroupId is required when createSecurityGroupRules is true (component "${name}")`,
    );
  }

  return {
    endpointMode,
    endpointPublicAccess: endpointMode !== "private",
    endpointPrivateAccess: true,
    publicAccessCidrs,
    operatorCidrBlocks,
    operatorIpv6CidrBlocks,
    operatorSourceSecurityGroupIds,
    createSecurityGroupRules,
    ...(temporaryBroadPublicAccess !== undefined ? { temporaryBroadPublicAccess } : {}),
  };
}

function buildKubectlHint(config: NormalizedArgs): string {
  if (config.endpointMode === "private") {
    return "Use kubectl from the approved operator network path that can reach the private EKS endpoint.";
  }
  if (config.endpointMode === "restricted-public") {
    return `Use kubectl from the explicit public endpoint CIDR allow-list: ${config.publicAccessCidrs.join(", ")}. Private endpoint access remains enabled.`;
  }
  return `Temporary broad public EKS endpoint access expires on ${config.temporaryBroadPublicAccess!.expiresOn}; replace it with a private or restricted operator path.`;
}

export class EksAdminAccessPath
  extends pulumi.ComponentResource
  implements EksAdminAccessPathOutputs
{
  public readonly endpointPublicAccess: pulumi.Output<boolean>;
  public readonly endpointPrivateAccess: pulumi.Output<boolean>;
  public readonly publicAccessCidrs: pulumi.Output<string[]>;
  public readonly endpointAccessConfig: pulumi.Output<EksEndpointAccessConfig>;
  public readonly securityGroupRuleIds: pulumi.Output<string[]>;
  public readonly kubectlAccessHint: pulumi.Output<string>;
  public readonly policyExceptionReason: pulumi.Output<string | undefined>;
  public readonly accessSummary: pulumi.Output<{
    endpointMode: EksEndpointAccessMode;
    publicAccessCidrs: string[];
    operatorCidrBlocks: string[];
    operatorIpv6CidrBlocks: string[];
    operatorSourceSecurityGroupIds: string[];
    securityGroupIngressRuleCount: number;
  }>;

  constructor(name: string, args: EksAdminAccessPathArgs, opts?: pulumi.ComponentResourceOptions) {
    super(EKS_ADMIN_ACCESS_PATH_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    const config = normalizeArgs(name, args);
    const parent = { parent: this } as const;
    const description = args.operatorAccess?.description ?? "Hulumi EKS admin API access";
    const rules: aws.ec2.SecurityGroupRule[] = [];

    if (config.createSecurityGroupRules && args.clusterSecurityGroupId !== undefined) {
      config.operatorCidrBlocks.forEach((cidrBlock, idx) => {
        rules.push(
          new aws.ec2.SecurityGroupRule(
            `${name}-cidr-${idx}`,
            {
              type: "ingress",
              securityGroupId: args.clusterSecurityGroupId!,
              fromPort: HTTPS_PORT,
              toPort: HTTPS_PORT,
              protocol: "tcp",
              cidrBlocks: [cidrBlock],
              description,
            },
            parent,
          ),
        );
      });
      config.operatorIpv6CidrBlocks.forEach((ipv6CidrBlock, idx) => {
        rules.push(
          new aws.ec2.SecurityGroupRule(
            `${name}-ipv6-${idx}`,
            {
              type: "ingress",
              securityGroupId: args.clusterSecurityGroupId!,
              fromPort: HTTPS_PORT,
              toPort: HTTPS_PORT,
              protocol: "tcp",
              ipv6CidrBlocks: [ipv6CidrBlock],
              description,
            },
            parent,
          ),
        );
      });
      config.operatorSourceSecurityGroupIds.forEach((sourceSecurityGroupId, idx) => {
        rules.push(
          new aws.ec2.SecurityGroupRule(
            `${name}-source-sg-${idx}`,
            {
              type: "ingress",
              securityGroupId: args.clusterSecurityGroupId!,
              fromPort: HTTPS_PORT,
              toPort: HTTPS_PORT,
              protocol: "tcp",
              sourceSecurityGroupId,
              description,
            },
            parent,
          ),
        );
      });
    }

    const endpointAccessConfig: EksEndpointAccessConfig = {
      endpointPrivateAccess: config.endpointPrivateAccess,
      endpointPublicAccess: config.endpointPublicAccess,
      publicAccessCidrs: config.publicAccessCidrs,
    };
    const sourceSecurityGroupIds = config.operatorSourceSecurityGroupIds;

    this.endpointPublicAccess = pulumi.output(config.endpointPublicAccess);
    this.endpointPrivateAccess = pulumi.output(config.endpointPrivateAccess);
    this.publicAccessCidrs = pulumi.output(config.publicAccessCidrs);
    this.endpointAccessConfig = pulumi.output(endpointAccessConfig);
    this.securityGroupRuleIds =
      rules.length === 0 ? pulumi.output([]) : pulumi.all(rules.map((rule) => rule.id));
    this.kubectlAccessHint = pulumi.output(buildKubectlHint(config));
    this.policyExceptionReason = pulumi.output(
      config.temporaryBroadPublicAccess === undefined
        ? undefined
        : `HULUMI-EKS-CL-1 temporary broad public endpoint access until ${config.temporaryBroadPublicAccess.expiresOn}: ${config.temporaryBroadPublicAccess.reason}`,
    );
    this.accessSummary = pulumi.all(sourceSecurityGroupIds).apply((resolvedSourceSgs) => ({
      endpointMode: config.endpointMode,
      publicAccessCidrs: config.publicAccessCidrs,
      operatorCidrBlocks: config.operatorCidrBlocks,
      operatorIpv6CidrBlocks: config.operatorIpv6CidrBlocks,
      operatorSourceSecurityGroupIds: resolvedSourceSgs,
      securityGroupIngressRuleCount: rules.length,
    }));

    this.registerOutputs({
      endpointPublicAccess: this.endpointPublicAccess,
      endpointPrivateAccess: this.endpointPrivateAccess,
      publicAccessCidrs: this.publicAccessCidrs,
      endpointAccessConfig: this.endpointAccessConfig,
      securityGroupRuleIds: this.securityGroupRuleIds,
      kubectlAccessHint: this.kubectlAccessHint,
      policyExceptionReason: this.policyExceptionReason,
      accessSummary: this.accessSummary,
    });
  }
}
