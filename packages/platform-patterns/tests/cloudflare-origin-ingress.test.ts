import { afterEach, describe, expect, it } from "vitest";

import { CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE, CloudflareOriginIngress } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function inputsFor(type: string): Record<string, unknown> | undefined {
  return registrations.find((r) => r.type === type)?.inputs;
}

describe("CloudflareOriginIngress", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("registers tunnel and public hostname config for tunnel mode", async () => {
    const literalTunnelSecret = "AQIDBAUGBwgBAgMEBQYHCAECAwQFBgcIAQIDBAUGBwg=";
    const ingress = new CloudflareOriginIngress("edge", {
      tier: "startup-hardened",
      mode: "tunnel",
      cloudflareAccountId: "acct_123",
      hostname: "app.example.com",
      service: "http://app.default.svc.cluster.local:8080",
      tunnelSecret: literalTunnelSecret,
      runtime: { kind: "eks", automation: "managed-contract" },
    });

    await settlePulumi();

    const componentInputs = inputsFor(CLOUDFLARE_ORIGIN_INGRESS_COMPONENT_TYPE);
    expect(componentInputs).not.toHaveProperty("tunnelSecret");
    const tunnelInputs = inputsFor(
      "cloudflare:index/zeroTrustTunnelCloudflared:ZeroTrustTunnelCloudflared",
    );
    expect(tunnelInputs).toMatchObject({ accountId: "acct_123", configSrc: "cloudflare" });
    expect(tunnelInputs?.tunnelSecret).not.toBe(literalTunnelSecret);
    expect(tunnelInputs?.tunnelSecret).toMatchObject({ value: literalTunnelSecret });
    expect(
      inputsFor(
        "cloudflare:index/zeroTrustTunnelCloudflaredConfig:ZeroTrustTunnelCloudflaredConfig",
      ),
    ).toMatchObject({
      accountId: "acct_123",
      config: {
        ingresses: expect.arrayContaining([
          expect.objectContaining({
            hostname: "app.example.com",
            service: "http://app.default.svc.cluster.local:8080",
          }),
        ]),
      },
    });
    await expect(valueOf(ingress.protectionLayers)).resolves.toContain("cloudflare_tunnel");
    await expect(valueOf(ingress.runtimeContracts)).resolves.toEqual([
      { kind: "eks", automation: "managed-contract" },
    ]);
  });

  it("supports one tunnel with multiple hostname routes and explicit origin host headers", async () => {
    const ingress = new CloudflareOriginIngress("api-edge", {
      tier: "startup-hardened",
      mode: "tunnel",
      cloudflareAccountId: "acct_123",
      tunnelName: "shared-api-edge",
      hostname: "platform-api.example.com",
      service: "http://platform-api.default.svc.cluster.local:9090",
      httpHostHeader: "platform-api.default.svc.cluster.local",
      tunnelSecret: "AQIDBAUGBwgBAgMEBQYHCAECAwQFBgcIAQIDBAUGBwg=",
      runtime: { kind: "eks", automation: "managed-contract" },
      additionalRoutes: [
        {
          hostname: "upstream-proxy.example.com",
          service: "http://upstream-proxy.default.svc.cluster.local:9091",
          httpHostHeader: "upstream-proxy.default.svc.cluster.local",
          runtime: { kind: "eks", automation: "cookbook-only", notes: "same namespace" },
        },
      ],
    });

    await settlePulumi();

    expect(
      registrations.filter(
        (r) => r.type === "cloudflare:index/zeroTrustTunnelCloudflared:ZeroTrustTunnelCloudflared",
      ),
    ).toHaveLength(1);
    expect(
      inputsFor(
        "cloudflare:index/zeroTrustTunnelCloudflaredConfig:ZeroTrustTunnelCloudflaredConfig",
      ),
    ).toMatchObject({
      config: {
        ingresses: [
          {
            hostname: "platform-api.example.com",
            service: "http://platform-api.default.svc.cluster.local:9090",
            originRequest: expect.objectContaining({
              httpHostHeader: "platform-api.default.svc.cluster.local",
              noTlsVerify: false,
            }),
          },
          {
            hostname: "upstream-proxy.example.com",
            service: "http://upstream-proxy.default.svc.cluster.local:9091",
            originRequest: expect.objectContaining({
              httpHostHeader: "upstream-proxy.default.svc.cluster.local",
              noTlsVerify: false,
            }),
          },
          { service: "http_status:404" },
        ],
      },
    });
    await expect(valueOf(ingress.runtimeContracts)).resolves.toEqual([
      { kind: "eks", automation: "managed-contract" },
      { kind: "eks", automation: "cookbook-only", notes: "same namespace" },
    ]);
    await expect(valueOf(ingress.degradedControls)).resolves.toEqual([
      "runtime_automation_cookbook_only",
    ]);
  });

  it("names cookbook-only runtime support explicitly", async () => {
    const ingress = new CloudflareOriginIngress("serverless", {
      tier: "sandbox",
      mode: "tunnel",
      cloudflareAccountId: "acct_123",
      hostname: "fn.example.com",
      service: "https://internal.example.local",
      tunnelSecret: "AQIDBAUGBwgBAgMEBQYHCAECAwQFBgcIAQIDBAUGBwg=",
      runtime: { kind: "serverless", automation: "cookbook-only" },
    });

    await settlePulumi();

    await expect(valueOf(ingress.runtimeContracts)).resolves.toEqual([
      { kind: "serverless", automation: "cookbook-only" },
    ]);
    await expect(valueOf(ingress.degradedControls)).resolves.toContain(
      "runtime_automation_cookbook_only",
    );
  });

  it("rejects allowlist+AOP mode without AOP evidence", () => {
    expect(() => {
      new CloudflareOriginIngress("bad", {
        tier: "startup-hardened",
        mode: "allowlistAop",
        cloudflareZoneId: "zone_123",
        hostname: "app.example.com",
        cloudflareSourceCidrBlocks: ["173.245.48.0/20"],
        loadBalancerSecurityGroupId: "sg-lb",
        targetSecurityGroupId: "sg-target",
        originPort: 443,
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/origin/123",
        originServerCertificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/server",
        originTargetGroupArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/origin/456",
        aopCaBundleS3Bucket: "edge-trust",
        aopCaBundleS3Key: "aop/app-root-ca.pem",
        aopCaBundleS3ObjectVersion: "ca-version-1",
        authenticatedOriginPullCertificateId: "",
      });
    }).toThrow(/Authenticated Origin Pull/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("registers per-hostname AOP, versioned ALB mTLS, and exact security-group restrictions", async () => {
    const ingress = new CloudflareOriginIngress("aop", {
      tier: "startup-hardened",
      mode: "allowlistAop",
      cloudflareZoneId: "zone_123",
      hostname: "app.example.com",
      cloudflareSourceCidrBlocks: ["173.245.48.0/20"],
      loadBalancerSecurityGroupId: "sg-lb",
      targetSecurityGroupId: "sg-target",
      originPort: 443,
      loadBalancerArn:
        "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/origin/123",
      originServerCertificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/server",
      originTargetGroupArn:
        "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/origin/456",
      aopCaBundleS3Bucket: "edge-trust",
      aopCaBundleS3Key: "aop/app-root-ca.pem",
      aopCaBundleS3ObjectVersion: "ca-version-1",
      authenticatedOriginPullCertificateId: "cert_123",
    });

    await settlePulumi();

    expect(
      inputsFor("cloudflare:index/authenticatedOriginPulls:AuthenticatedOriginPulls"),
    ).toMatchObject({
      zoneId: "zone_123",
      configs: [{ certId: "cert_123", enabled: true, hostname: "app.example.com" }],
    });
    expect(
      registrations.filter((r) => r.type === "aws:ec2/securityGroupRule:SecurityGroupRule"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputs: expect.objectContaining({
            securityGroupId: "sg-lb",
            cidrBlocks: ["173.245.48.0/20"],
          }),
        }),
        expect.objectContaining({
          inputs: expect.objectContaining({
            securityGroupId: "sg-target",
            sourceSecurityGroupId: "sg-lb",
          }),
        }),
      ]),
    );
    expect(inputsFor("aws:lb/trustStore:TrustStore")).toMatchObject({
      caCertificatesBundleS3Bucket: "edge-trust",
      caCertificatesBundleS3Key: "aop/app-root-ca.pem",
      caCertificatesBundleS3ObjectVersion: "ca-version-1",
    });
    expect(inputsFor("aws:lb/listener:Listener")).toMatchObject({
      loadBalancerArn:
        "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/origin/123",
      certificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/server",
      protocol: "HTTPS",
      port: 443,
      sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn:
            "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/origin/456",
        },
      ],
      mutualAuthentication: {
        mode: "verify",
        ignoreClientCertificateExpiry: false,
      },
    });
    await expect(valueOf(ingress.protectionLayers)).resolves.toEqual(
      expect.arrayContaining([
        "cloudflare_source_restriction",
        "authenticated_origin_pull",
        "alb_mtls_verify",
        "target_sg_restriction",
      ]),
    );
  });

  it.each([
    ["Internet-wide", "0.0.0.0/0"],
    ["invalid octets", "999.999.999.999/24"],
    ["non-canonical network", "173.245.48.1/20"],
    ["unrelated public range", "203.0.113.0/24"],
  ])("rejects %s source CIDR before registering provider resources", (_label, cidr) => {
    expect(() => {
      new CloudflareOriginIngress("bad-cidr", {
        tier: "startup-hardened",
        mode: "allowlistAop",
        cloudflareZoneId: "zone_123",
        hostname: "app.example.com",
        cloudflareSourceCidrBlocks: [cidr],
        loadBalancerSecurityGroupId: "sg-lb",
        targetSecurityGroupId: "sg-target",
        originPort: 443,
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/origin/123",
        originServerCertificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/server",
        originTargetGroupArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/origin/456",
        aopCaBundleS3Bucket: "edge-trust",
        aopCaBundleS3Key: "aop/app-root-ca.pem",
        aopCaBundleS3ObjectVersion: "ca-version-1",
        authenticatedOriginPullCertificateId: "cert_123",
      });
    }).toThrow(/Cloudflare source CIDR/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("rejects duplicate Cloudflare source CIDRs", () => {
    expect(() => {
      new CloudflareOriginIngress("duplicate-cidr", {
        tier: "startup-hardened",
        mode: "allowlistAop",
        cloudflareZoneId: "zone_123",
        hostname: "app.example.com",
        cloudflareSourceCidrBlocks: ["173.245.48.0/20", "173.245.48.0/20"],
        loadBalancerSecurityGroupId: "sg-lb",
        targetSecurityGroupId: "sg-target",
        originPort: 443,
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/origin/123",
        originServerCertificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/server",
        originTargetGroupArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/origin/456",
        aopCaBundleS3Bucket: "edge-trust",
        aopCaBundleS3Key: "aop/app-root-ca.pem",
        aopCaBundleS3ObjectVersion: "ca-version-1",
        authenticatedOriginPullCertificateId: "cert_123",
      });
    }).toThrow(/duplicate Cloudflare source CIDR/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("outputs listener auth rotation references without secret values", async () => {
    const ingress = new CloudflareOriginIngress("edge-listener-auth", {
      tier: "startup-hardened",
      mode: "tunnel",
      cloudflareAccountId: "acct_123",
      hostname: "app.example.com",
      service: "https://origin.local",
      tunnelSecret: "AQIDBAUGBwgBAgMEBQYHCAECAwQFBgcIAQIDBAUGBwg=",
      runtime: { kind: "ecs", automation: "cookbook-only" },
      listenerAuth: {
        currentSecretReference: "ssm:/edge/listener/current",
        nextSecretReference: "ssm:/edge/listener/next",
      },
    });

    await settlePulumi();

    await expect(valueOf(ingress.listenerAuthRotation)).resolves.toMatchObject({
      currentSecretReference: "ssm:/edge/listener/current",
      nextSecretReference: "ssm:/edge/listener/next",
      steps: expect.arrayContaining([expect.stringContaining("Deploy origin listener")]),
    });
  });
});
