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

/**
 * Cloudflare's definitive IPv4 proxy ranges as published at
 * https://www.cloudflare.com/ips-v4 on 2023-09-28. The component fails
 * closed when a range is absent from this pinned set so a package review is
 * required when Cloudflare changes the list.
 */
export const CLOUDFLARE_IPV4_ORIGIN_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

const CLOUDFLARE_IPV4_ORIGIN_CIDR_SET = new Set<string>(CLOUDFLARE_IPV4_ORIGIN_CIDRS);
const ALB_TLS_POLICY = "ELBSecurityPolicy-TLS13-1-2-2021-06";

const FQDN_REGEX = /^(?=.{1,253}$)([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

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

function componentInputs(args: CloudflareOriginIngressArgs): pulumi.Inputs {
  if (args.mode === "allowlistAop") return args as pulumi.Inputs;
  return {
    tier: args.tier,
    mode: args.mode,
    hostname: args.hostname,
    ...(args.listenerAuth !== undefined ? { listenerAuth: args.listenerAuth } : {}),
    cloudflareAccountId: args.cloudflareAccountId,
    ...(args.tunnelName !== undefined ? { tunnelName: args.tunnelName } : {}),
    service: args.service,
    ...(args.httpHostHeader !== undefined ? { httpHostHeader: args.httpHostHeader } : {}),
    ...(args.additionalRoutes !== undefined ? { additionalRoutes: args.additionalRoutes } : {}),
    runtime: args.runtime,
    tunnelSecretConfigured: true,
  };
}

function validateAllowlistAop(args: CloudflareOriginIngressAllowlistAopArgs): void {
  assertInputString(args.cloudflareZoneId, "cloudflareZoneId");
  assertInputString(args.loadBalancerSecurityGroupId, "loadBalancerSecurityGroupId");
  assertInputString(args.targetSecurityGroupId, "targetSecurityGroupId");
  assertInputString(args.loadBalancerArn, "loadBalancerArn");
  assertInputString(args.originServerCertificateArn, "originServerCertificateArn");
  assertInputString(args.originTargetGroupArn, "originTargetGroupArn");
  assertInputString(args.aopCaBundleS3Bucket, "aopCaBundleS3Bucket");
  assertInputString(args.aopCaBundleS3Key, "aopCaBundleS3Key");
  assertInputString(args.aopCaBundleS3ObjectVersion, "aopCaBundleS3ObjectVersion");
  assertInputString(
    args.authenticatedOriginPullCertificateId,
    "Authenticated Origin Pull certificate id",
  );
  if (!Number.isInteger(args.originPort) || args.originPort < 1 || args.originPort > 65535) {
    throw new Error("CloudflareOriginIngress: originPort must be between 1 and 65535");
  }
  if (args.cloudflareSourceCidrBlocks.length === 0) {
    throw new Error("CloudflareOriginIngress: at least one Cloudflare source CIDR is required");
  }
  const seen = new Set<string>();
  for (const cidr of args.cloudflareSourceCidrBlocks) {
    if (seen.has(cidr)) {
      throw new Error(`CloudflareOriginIngress: duplicate Cloudflare source CIDR "${cidr}"`);
    }
    seen.add(cidr);
    if (!CLOUDFLARE_IPV4_ORIGIN_CIDR_SET.has(cidr)) {
      throw new Error(
        `CloudflareOriginIngress: Cloudflare source CIDR "${cidr}" is not in the pinned official IPv4 range set`,
      );
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
    super(CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE, name, componentInputs(args), opts);
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
          tunnelSecret: pulumi.secret(args.tunnelSecret),
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
      const trustStore = new aws.lb.TrustStore(
        `${name}-aop-trust`,
        {
          caCertificatesBundleS3Bucket: args.aopCaBundleS3Bucket,
          caCertificatesBundleS3Key: args.aopCaBundleS3Key,
          caCertificatesBundleS3ObjectVersion: args.aopCaBundleS3ObjectVersion,
          tags: {
            "hulumi:component": CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE,
            "hulumi:hostname": args.hostname,
          },
        },
        { parent: this },
      );
      const listener = new aws.lb.Listener(
        `${name}-aop-listener`,
        {
          loadBalancerArn: args.loadBalancerArn,
          certificateArn: args.originServerCertificateArn,
          defaultActions: [{ type: "forward", targetGroupArn: args.originTargetGroupArn }],
          mutualAuthentication: {
            mode: "verify",
            trustStoreArn: trustStore.arn,
            ignoreClientCertificateExpiry: false,
            advertiseTrustStoreCaNames: "off",
          },
          port: args.originPort,
          protocol: "HTTPS",
          sslPolicy: ALB_TLS_POLICY,
          tags: {
            "hulumi:component": CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE,
            "hulumi:hostname": args.hostname,
          },
        },
        { parent: this },
      );
      resourceIds.push(trustStore.id, listener.id);

      const originEnforcementResources: pulumi.Resource[] = [listener];
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
        originEnforcementResources.push(sourceRule);
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
      originEnforcementResources.push(targetRule);

      const aopConfig: cloudflare.types.input.AuthenticatedOriginPullsConfig = {
        certId: args.authenticatedOriginPullCertificateId,
        enabled: true,
        hostname: args.hostname,
      };
      const aop = new cloudflare.AuthenticatedOriginPulls(
        `${name}-aop`,
        {
          zoneId: args.cloudflareZoneId,
          configs: [aopConfig],
        },
        { parent: this, dependsOn: originEnforcementResources },
      );
      resourceIds.push(aop.id);
      protectionLayers = [
        "cloudflare_source_restriction",
        "authenticated_origin_pull",
        "alb_mtls_verify",
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
