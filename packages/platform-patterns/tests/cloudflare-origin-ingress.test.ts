import { afterEach, describe, expect, it } from "vitest";

import { CloudflareOriginIngress } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function inputsFor(type: string): Record<string, unknown> | undefined {
  return registrations.find((r) => r.type === type)?.inputs;
}

describe("CloudflareOriginIngress", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("registers tunnel and public hostname config for tunnel mode", async () => {
    const ingress = new CloudflareOriginIngress("edge", {
      tier: "startup-hardened",
      mode: "tunnel",
      cloudflareAccountId: "acct_123",
      hostname: "app.example.com",
      service: "http://app.default.svc.cluster.local:8080",
      tunnelSecret: "AQIDBAUGBwgBAgMEBQYHCAECAwQFBgcIAQIDBAUGBwg=",
      runtime: { kind: "eks", automation: "managed-contract" },
    });

    await settlePulumi();

    expect(
      inputsFor("cloudflare:index/zeroTrustTunnelCloudflared:ZeroTrustTunnelCloudflared"),
    ).toMatchObject({ accountId: "acct_123", configSrc: "cloudflare" });
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
        cloudflareSourceCidrBlocks: ["203.0.113.0/24"],
        loadBalancerSecurityGroupId: "sg-lb",
        targetSecurityGroupId: "sg-target",
        originPort: 443,
        originCertificateReference: "",
        authenticatedOriginPullCertificateId: "",
        aopMode: "hostname",
      });
    }).toThrow(/Authenticated Origin Pull/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("registers AOP and AWS security-group restrictions for allowlist+AOP mode", async () => {
    const ingress = new CloudflareOriginIngress("aop", {
      tier: "startup-hardened",
      mode: "allowlistAop",
      cloudflareZoneId: "zone_123",
      hostname: "app.example.com",
      cloudflareSourceCidrBlocks: ["203.0.113.0/24"],
      loadBalancerSecurityGroupId: "sg-lb",
      targetSecurityGroupId: "sg-target",
      originPort: 443,
      originCertificateReference: "origin-ca-cert-param",
      authenticatedOriginPullCertificateId: "cert_123",
      aopMode: "hostname",
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
            cidrBlocks: ["203.0.113.0/24"],
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
    await expect(valueOf(ingress.protectionLayers)).resolves.toEqual(
      expect.arrayContaining([
        "cloudflare_source_restriction",
        "authenticated_origin_pull",
        "target_sg_restriction",
      ]),
    );
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
