import { describe, expect, it } from "vitest";
import * as pulumi from "@pulumi/pulumi";

interface Registration {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}

const registrations: Registration[] = [];

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    const inputs = { ...(args.inputs as Record<string, unknown>) };
    registrations.push({ type: args.type, name: args.name, inputs });
    return {
      id: `${args.name}_id`,
      state: {
        ...inputs,
        arn: `arn:mock:${args.type}:${args.name}`,
        id: `${args.name}_id`,
        name: inputs.name ?? args.name,
        nodeId: `node-${args.name}`,
        fullName: inputs.name !== undefined ? `example-org/${String(inputs.name)}` : args.name,
        defaultBranch: "main",
      },
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

async function settlePulumi(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function inputsFor(type: string): Record<string, unknown> | undefined {
  return registrations.find((registration) => registration.type === type)?.inputs;
}

describe("examples/edge-platform-smoke", () => {
  it("compiles package entrypoints and emits the expected edge resources", async () => {
    registrations.length = 0;

    const program = await import("../index");
    await settlePulumi();

    expect(inputsFor("cloudflare:index/zoneDnssec:ZoneDnssec")).toMatchObject({
      zoneId: "zone_123",
      status: "active",
    });
    expect(inputsFor("cloudflare:index/dnsRecord:DnsRecord")).toMatchObject({
      name: "app.example.com",
      proxied: true,
      type: "CNAME",
    });
    expect(
      registrations.filter(
        (registration) => registration.type === "cloudflare:index/ruleset:Ruleset",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      inputsFor(
        "cloudflare:index/zeroTrustTunnelCloudflaredConfig:ZeroTrustTunnelCloudflaredConfig",
      ),
    ).toMatchObject({
      config: {
        ingresses: expect.arrayContaining([
          expect.objectContaining({ hostname: "app.example.com" }),
        ]),
      },
    });
    expect(inputsFor("github:index/repositoryEnvironment:RepositoryEnvironment")).toMatchObject({
      environment: "prod",
    });
    expect(inputsFor("aws:iam/role:Role")).toBeDefined();
    expect(program.edgePolicyRuleIds).toContain("CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD");
    expect(program.edgePolicyRuleIds).toContain("DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS");
  });
});
