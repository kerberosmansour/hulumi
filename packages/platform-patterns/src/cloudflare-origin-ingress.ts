import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as cloudflare from "@pulumi/cloudflare";

import type {
  CloudflareOriginIngressAllowlistAopArgs,
  CloudflareOriginIngressArgs,
  CloudflareOriginIngressTunnelArgs,
  OriginRuntimeContract,
} from "./cloudflare-origin-ingress.args";
import type {
  CloudflareOriginIngressOutputs,
  ListenerAuthRotationPlan,
} from "./cloudflare-origin-ingress.outputs";
import { assertValidTier } from "./tier";

export const CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE = "hulumi:platform:CloudflareOriginIngress";

const FQDN_REGEX = /^(?=.{1,253}$)([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const CIDR_REGEX = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/u;

function assertHostname(hostname: string): void {
  if (!FQDN_REGEX.test(hostname)) {
    throw new Error(`CloudflareOriginIngress: hostname "${hostname}" must be a valid FQDN`);
  }
}

function assertInputString(value: pulumi.Input<string>, label: string): void {
  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error(`CloudflareOriginIngress: ${label} must be non-empty`);
  }
}

function validateTunnelRoute(route: {
  readonly hostname: string;
  readonly service: pulumi.Input<string>;
  readonly httpHostHeader?: pulumi.Input<string>;
}): void {
  assertHostname(route.hostname);
  assertInputString(route.service, "service");
  if (route.httpHostHeader !== undefined) {
    assertInputString(route.httpHostHeader, "httpHostHeader");
  }
}

function tunnelIngress(route: {
  readonly hostname: string;
  readonly service: pulumi.Input<string>;
  readonly httpHostHeader?: pulumi.Input<string>;
}): cloudflare.types.input.ZeroTrustTunnelCloudflaredConfigConfigIngress {
  return {
    hostname: route.hostname,
    service: route.service,
    originRequest: {
      noTlsVerify: false,
      matchSnItoHost: true,
      ...(route.httpHostHeader !== undefined ? { httpHostHeader: route.httpHostHeader } : {}),
    },
  };
}

function tunnelRoutes(args: CloudflareOriginIngressTunnelArgs): Array<{
  readonly hostname: string;
  readonly service: pulumi.Input<string>;
  readonly httpHostHeader?: pulumi.Input<string>;
  readonly runtime: OriginRuntimeContract;
}> {
  return [
    {
      hostname: args.hostname,
      service: args.service,
      ...(args.httpHostHeader !== undefined ? { httpHostHeader: args.httpHostHeader } : {}),
      runtime: args.runtime,
    },
    ...(args.additionalRoutes ?? []).map((route) => ({
      hostname: route.hostname,
      service: route.service,
      ...(route.httpHostHeader !== undefined ? { httpHostHeader: route.httpHostHeader } : {}),
      runtime: route.runtime ?? args.runtime,
    })),
  ];
}

function assertListenerAuth(refs: CloudflareOriginIngressArgs["listenerAuth"]): void {
  if (refs === undefined) return;
  if (refs.currentSecretReference.trim().length === 0) {
    throw new Error("CloudflareOriginIngress: listenerAuth currentSecretReference is required");
  }
  if (refs.nextSecretReference !== undefined && refs.nextSecretReference.trim().length === 0) {
    throw new Error("CloudflareOriginIngress: listenerAuth nextSecretReference must be non-empty");
  }
}

function listenerAuthRotation(
  refs: CloudflareOriginIngressArgs["listenerAuth"],
): ListenerAuthRotationPlan | undefined {
  if (refs === undefined) return undefined;
  return {
    currentSecretReference: refs.currentSecretReference,
    ...(refs.nextSecretReference !== undefined
      ? { nextSecretReference: refs.nextSecretReference }
      : {}),
    steps: [
      "Deploy origin listener validation for the current secret reference.",
      "Publish the next secret reference and accept both values during rotation.",
      "Cut Cloudflare/origin traffic to the next reference, then retire the previous reference.",
    ],
  };
}

function validateAllowlistAop(args: CloudflareOriginIngressAllowlistAopArgs): void {
  assertInputString(args.cloudflareZoneId, "cloudflareZoneId");
  assertInputString(args.loadBalancerSecurityGroupId, "loadBalancerSecurityGroupId");
  assertInputString(args.targetSecurityGroupId, "targetSecurityGroupId");
  if (
    args.originCertificateReference.trim().length === 0 ||
    (typeof args.authenticatedOriginPullCertificateId === "string" &&
      args.authenticatedOriginPullCertificateId.trim().length === 0)
  ) {
    throw new Error(
      "CloudflareOriginIngress: Authenticated Origin Pull and origin certificate evidence are required for allowlist+AOP mode",
    );
  }
  if (!Number.isInteger(args.originPort) || args.originPort < 1 || args.originPort > 65535) {
    throw new Error("CloudflareOriginIngress: originPort must be between 1 and 65535");
  }
  if (args.cloudflareSourceCidrBlocks.length === 0) {
    throw new Error("CloudflareOriginIngress: at least one Cloudflare source CIDR is required");
  }
  for (const cidr of args.cloudflareSourceCidrBlocks) {
    if (!CIDR_REGEX.test(cidr)) {
      throw new Error(`CloudflareOriginIngress: invalid Cloudflare source CIDR "${cidr}"`);
    }
  }
}

export class CloudflareOriginIngress
  extends pulumi.ComponentResource
  implements CloudflareOriginIngressOutputs
{
  public readonly protectionLayers: pulumi.Output<string[]>;
  public readonly runtimeContracts: pulumi.Output<OriginRuntimeContract[]>;
  public readonly listenerAuthRotation: pulumi.Output<ListenerAuthRotationPlan | undefined>;
  public readonly degradedControls: pulumi.Output<string[]>;
  public readonly resourceIds: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: CloudflareOriginIngressArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    assertHostname(args.hostname);
    assertListenerAuth(args.listenerAuth);

    const degradedControls: string[] = [];
    const resourceIds: pulumi.Output<string>[] = [];
    let protectionLayers: string[];
    let runtimeContracts: OriginRuntimeContract[];

    if (args.mode === "tunnel") {
      assertInputString(args.cloudflareAccountId, "cloudflareAccountId");
      assertInputString(args.tunnelSecret, "tunnelSecret");
      assertInputString(args.service, "service");
      if (args.httpHostHeader !== undefined) {
        assertInputString(args.httpHostHeader, "httpHostHeader");
      }
      for (const route of args.additionalRoutes ?? []) {
        validateTunnelRoute(route);
      }

      const routes = tunnelRoutes(args);

      const tunnel = new cloudflare.ZeroTrustTunnelCloudflared(
        `${name}-tunnel`,
        {
          accountId: args.cloudflareAccountId,
          name: args.tunnelName ?? name,
          configSrc: "cloudflare",
          tunnelSecret: args.tunnelSecret,
        },
        { parent: this },
      );
      const config = new cloudflare.ZeroTrustTunnelCloudflaredConfig(
        `${name}-tunnel-config`,
        {
          accountId: args.cloudflareAccountId,
          tunnelId: tunnel.id,
          source: "cloudflare",
          config: {
            ingresses: [...routes.map(tunnelIngress), { service: "http_status:404" }],
          },
        },
        { parent: this },
      );
      resourceIds.push(tunnel.id, config.id);
      protectionLayers = ["cloudflare_tunnel"];
      runtimeContracts = routes.map((route) => route.runtime);
      if (routes.some((route) => route.runtime.automation === "cookbook-only")) {
        degradedControls.push("runtime_automation_cookbook_only");
      }
    } else {
      validateAllowlistAop(args);
      const aopConfig: cloudflare.types.input.AuthenticatedOriginPullsConfig = {
        certId: args.authenticatedOriginPullCertificateId,
        enabled: true,
        ...(args.aopMode === "hostname" ? { hostname: args.hostname } : {}),
      };
      const aop = new cloudflare.AuthenticatedOriginPulls(
        `${name}-aop`,
        {
          zoneId: args.cloudflareZoneId,
          configs: [aopConfig],
        },
        { parent: this },
      );
      resourceIds.push(aop.id);

      for (const [index, cidr] of args.cloudflareSourceCidrBlocks.entries()) {
        const sourceRule = new aws.ec2.SecurityGroupRule(
          `${name}-cf-source-${index}`,
          {
            type: "ingress",
            fromPort: args.originPort,
            toPort: args.originPort,
            protocol: "tcp",
            cidrBlocks: [cidr],
            securityGroupId: args.loadBalancerSecurityGroupId,
            description: `Cloudflare source CIDR for ${args.hostname}`,
          },
          { parent: this },
        );
        resourceIds.push(sourceRule.id);
      }
      const targetRule = new aws.ec2.SecurityGroupRule(
        `${name}-target-from-lb`,
        {
          type: "ingress",
          fromPort: args.originPort,
          toPort: args.originPort,
          protocol: "tcp",
          sourceSecurityGroupId: args.loadBalancerSecurityGroupId,
          securityGroupId: args.targetSecurityGroupId,
          description: `Origin target only accepts ${args.hostname} traffic from the load balancer SG`,
        },
        { parent: this },
      );
      resourceIds.push(targetRule.id);
      protectionLayers = [
        "cloudflare_source_restriction",
        "authenticated_origin_pull",
        "target_sg_restriction",
      ];
      runtimeContracts = [];
    }

    const rotation = listenerAuthRotation(args.listenerAuth);
    if (rotation !== undefined) {
      protectionLayers.push("listener_auth_header");
    }

    this.protectionLayers = pulumi.output(protectionLayers);
    this.runtimeContracts = pulumi.output(runtimeContracts);
    this.listenerAuthRotation = pulumi.output(rotation);
    this.degradedControls = pulumi.output(degradedControls);
    this.resourceIds = resourceIds.length > 0 ? pulumi.all(resourceIds) : pulumi.output([]);

    this.registerOutputs({
      protectionLayers: this.protectionLayers,
      runtimeContracts: this.runtimeContracts,
      listenerAuthRotation: this.listenerAuthRotation,
      degradedControls: this.degradedControls,
      resourceIds: this.resourceIds,
    });
  }
}
