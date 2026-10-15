// BDD scenarios for M4 Cloudflare hardening policy rules.

import { describe, it, expect, beforeEach } from "vitest";
import type { PolicyResource, StackValidationArgs } from "@pulumi/policy";

import {
  CF_DNS_1_RULE_ID,
  CF_DNSSEC_1_RULE_ID,
  CF_ORIGIN_1_RULE_ID,
  cfDns1NoDnsOnlyPublicAppRecord,
  cfDnssec1RequirePublicZoneDnssec,
  cfOrigin1RequireSecureOriginMode,
} from "../../src/cloudflare";

function makePolicyResource(partial: Partial<PolicyResource>): PolicyResource {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    dependencies: [],
    propertyDependencies: {},
    ...partial,
  } as PolicyResource;
}

function makeStackArgs(
  resources: PolicyResource[],
  config: Record<string, unknown> = {},
): StackValidationArgs {
  return {
    resources,
    getConfig: (() => config) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

const DNS_RECORD_TYPE = "cloudflare:index/dnsRecord:DnsRecord";
const ZONE_TYPE = "cloudflare:index/zone:Zone";
const ZONE_DNSSEC_TYPE = "cloudflare:index/zoneDnssec:ZoneDnssec";
const PUBLIC_HOSTNAME_TYPE = "hulumi:cloudflare:PublicHostname";
const ZONE_FOUNDATION_TYPE = "hulumi:cloudflare:ZoneFoundation";
const ORIGIN_INGRESS_TYPE = "hulumi:platform:CloudflareOriginIngress";

describe("HulumiCloudflareHardeningPack CF_DNS_1 — raw DNS-only app record rejected", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  function validate(resources: PolicyResource[], config: Record<string, unknown> = {}): void {
    (
      cfDns1NoDnsOnlyPublicAppRecord.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs(resources, config), report);
  }

  function acknowledgedParent(
    props: Record<string, unknown> = {},
    type = PUBLIC_HOSTNAME_TYPE,
  ): PolicyResource {
    return makePolicyResource({
      type,
      urn: `urn:pulumi:s::p::${type}::managed-app`,
      name: "managed-app",
      props: {
        hostname: "app.example.com",
        purpose: "public-app",
        proxied: false,
        acknowledgeDnsOnlyExposure: true,
        dnsOnlyJustification: "Bounded migration with separately reviewed origin controls.",
        ...props,
      },
    });
  }

  function managedDnsOnlyRecord(parent?: PolicyResource): PolicyResource {
    return makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${PUBLIC_HOSTNAME_TYPE}$${DNS_RECORD_TYPE}::managed-app-record`,
      name: "managed-app-record",
      props: {
        type: "CNAME",
        name: "app.example.com",
        content: "origin.example.com",
        proxied: false,
        tags: ["hulumi:purpose=public-app"],
      },
      ...(parent === undefined ? {} : { parent }),
    });
  }

  it("reports CF_DNS_1 when raw cloudflare.DnsRecord models a public app with proxied=false", () => {
    const record = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::raw-app`,
      name: "raw-app",
      props: {
        type: "CNAME",
        name: "app.example.com",
        content: "origin.example.com",
        proxied: false,
        tags: ["hulumi:purpose=public-app"],
      },
    });
    validate([record]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_DNS_1_RULE_ID);
    expect(violations[0]).toContain(record.urn);
  });

  it("does NOT report when the concrete PublicHostname parent records matching acknowledgement", () => {
    const parent = acknowledgedParent();
    const record = managedDnsOnlyRecord(parent);
    validate([parent, record]);
    expect(violations).toEqual([]);
  });

  it("reports when a PublicHostname type-chain record has no concrete parent", () => {
    const record = managedDnsOnlyRecord();
    validate([record]);
    expect(violations).toHaveLength(1);
  });

  it("reports when the referenced parent is absent from the evaluated stack", () => {
    const parent = acknowledgedParent();
    const record = managedDnsOnlyRecord(parent);
    validate([record]);
    expect(violations).toHaveLength(1);
  });

  it("reports when parent evidence has the wrong type", () => {
    const parent = acknowledgedParent({}, "hulumi:cloudflare:LookalikeHostname");
    const record = managedDnsOnlyRecord(parent);
    validate([parent, record]);
    expect(violations).toHaveLength(1);
  });

  it.each([
    ["hostname mismatch", { hostname: "other.example.com" }],
    ["non-public purpose", { purpose: "dns" }],
    ["parent says proxied", { proxied: true }],
    ["missing acknowledgement", { acknowledgeDnsOnlyExposure: false }],
    ["blank justification", { dnsOnlyJustification: "   " }],
  ])("reports when PublicHostname evidence has %s", (_label, override) => {
    const parent = acknowledgedParent(override);
    const record = managedDnsOnlyRecord(parent);
    validate([parent, record]);
    expect(violations).toHaveLength(1);
  });

  it("does NOT report a proxied public application record", () => {
    const record = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::proxied-app`,
      name: "proxied-app",
      props: {
        type: "CNAME",
        name: "app.example.com",
        content: "origin.example.com",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });
    validate([record]);
    expect(violations).toEqual([]);
  });

  it("honors a scoped suppression with a non-empty justification", () => {
    const record = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::legacy-app`,
      name: "legacy-app",
      props: {
        type: "CNAME",
        name: "legacy",
        content: "legacy-origin.example.com",
        proxied: false,
        tags: ["hulumi:purpose=public-app"],
      },
    });
    validate([record], {
      suppressions: [
        {
          ruleId: CF_DNS_1_RULE_ID,
          reason: "Legacy cutover window tracked in ticket EDGE-12.",
          urnScope: record.urn,
        },
      ],
    });

    expect(violations).toEqual([]);
  });
});

describe("HulumiCloudflareHardeningPack CF_DNSSEC_1 — public zone DNSSEC required", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports CF_DNSSEC_1 when a public zone lacks ZoneFoundation or ZoneDnssec evidence", () => {
    const zone = makePolicyResource({
      type: ZONE_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_TYPE}::example-com`,
      name: "example-com",
      props: { zone: "example.com", type: "full" },
    });

    (
      cfDnssec1RequirePublicZoneDnssec.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([zone]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_DNSSEC_1_RULE_ID);
    expect(violations[0]).toContain(zone.urn);
  });

  it("does NOT report when the zone is managed by ZoneFoundation", () => {
    const zone = makePolicyResource({
      type: ZONE_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_FOUNDATION_TYPE}$${ZONE_TYPE}::managed-zone`,
      name: "managed-zone",
      props: { zone: "example.com", type: "full" },
    });

    (
      cfDnssec1RequirePublicZoneDnssec.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([zone]), report);

    expect(violations).toEqual([]);
  });

  it("does NOT report when the public zone has matching ZoneDnssec evidence", () => {
    const zone = makePolicyResource({
      type: ZONE_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_TYPE}::managed-zone`,
      name: "managed-zone",
      props: { id: "zone-123", zone: "example.com", type: "full" },
    });
    const dnssec = makePolicyResource({
      type: ZONE_DNSSEC_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_DNSSEC_TYPE}::managed-zone-dnssec`,
      name: "managed-zone-dnssec",
      props: { zoneId: "zone-123" },
    });

    (
      cfDnssec1RequirePublicZoneDnssec.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([zone, dnssec]), report);

    expect(violations).toEqual([]);
  });

  it("reports when only an unrelated ZoneDnssec resource exists for another zone", () => {
    const zone = makePolicyResource({
      type: ZONE_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_TYPE}::victim-zone`,
      name: "victim-zone",
      props: { id: "zone-victim", zone: "victim.example.com", type: "full" },
    });
    const unrelatedDnssec = makePolicyResource({
      type: ZONE_DNSSEC_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_DNSSEC_TYPE}::victim-zone`,
      name: "victim-zone",
      props: { zoneId: "zone-decoy" },
    });

    (
      cfDnssec1RequirePublicZoneDnssec.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([zone, unrelatedDnssec]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(zone.urn);
  });

  it("honors a migration suppression", () => {
    const zone = makePolicyResource({
      type: ZONE_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_TYPE}::migrating-zone`,
      name: "migrating-zone",
      props: { zone: "example.org", type: "full" },
    });

    (
      cfDnssec1RequirePublicZoneDnssec.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(
      makeStackArgs([zone], {
        suppressions: [
          {
            ruleId: CF_DNSSEC_1_RULE_ID,
            reason: "Registrar DNSSEC DS record change is scheduled.",
            urnScope: "*",
          },
        ],
      }),
      report,
    );

    expect(violations).toEqual([]);
  });
});

describe("HulumiCloudflareHardeningPack CF_ORIGIN_1 — secure origin evidence required", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  const TUNNEL_TYPE = "cloudflare:index/zeroTrustTunnelCloudflared:ZeroTrustTunnelCloudflared";
  const TUNNEL_CONFIG_TYPE =
    "cloudflare:index/zeroTrustTunnelCloudflaredConfig:ZeroTrustTunnelCloudflaredConfig";
  const AOP_TYPE = "cloudflare:index/authenticatedOriginPulls:AuthenticatedOriginPulls";
  const TRUST_STORE_TYPE = "aws:lb/trustStore:TrustStore";
  const LISTENER_TYPE = "aws:lb/listener:Listener";
  const SECURITY_GROUP_RULE_TYPE = "aws:ec2/securityGroupRule:SecurityGroupRule";

  function validate(resources: PolicyResource[]): void {
    (
      cfOrigin1RequireSecureOriginMode.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs(resources), report);
  }

  function appRecord(): PolicyResource {
    return makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${PUBLIC_HOSTNAME_TYPE}$${DNS_RECORD_TYPE}::app`,
      name: "app",
      props: {
        type: "CNAME",
        name: "app.example.com",
        content: "public-origin.example.com",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });
  }

  function ingress(
    mode: "tunnel" | "allowlistAop",
    props: Record<string, unknown> = {},
  ): PolicyResource {
    return makePolicyResource({
      type: ORIGIN_INGRESS_TYPE,
      urn: `urn:pulumi:s::p::${ORIGIN_INGRESS_TYPE}::app-ingress`,
      name: "app-ingress",
      props: {
        mode,
        hostname: "app.example.com",
        ...props,
      },
    });
  }

  function child(
    parent: PolicyResource,
    type: string,
    name: string,
    props: Record<string, unknown>,
    propertyDependencies: Record<string, PolicyResource[]> = {},
    dependencies: PolicyResource[] = [],
  ): PolicyResource {
    return makePolicyResource({
      type,
      urn: `urn:pulumi:s::p::${ORIGIN_INGRESS_TYPE}$${type}::${name}`,
      name,
      props,
      parent,
      propertyDependencies,
      dependencies,
    });
  }

  function tunnelTuple(
    configOverrides: Record<string, unknown> = {},
    configDependencies: Record<string, PolicyResource[]> | undefined = undefined,
  ): PolicyResource[] {
    const component = ingress("tunnel", { cloudflareAccountId: "acct_123" });
    const tunnel = child(component, TUNNEL_TYPE, "app-tunnel", {
      accountId: "acct_123",
      configSrc: "cloudflare",
    });
    const config = child(
      component,
      TUNNEL_CONFIG_TYPE,
      "app-tunnel-config",
      {
        accountId: "acct_123",
        tunnelId: "app-tunnel-id",
        source: "cloudflare",
        config: {
          ingresses: [
            {
              hostname: "app.example.com",
              service: "https://origin.internal",
              originRequest: { noTlsVerify: false, matchSnItoHost: true },
            },
            { service: "http_status:404" },
          ],
        },
        ...configOverrides,
      },
      configDependencies ?? { tunnelId: [tunnel] },
    );
    return [component, tunnel, config];
  }

  function aopTuple(): PolicyResource[] {
    const component = ingress("allowlistAop", {
      cloudflareZoneId: "zone_123",
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
    const trustStore = child(component, TRUST_STORE_TYPE, "app-aop-trust", {
      caCertificatesBundleS3Bucket: "edge-trust",
      caCertificatesBundleS3Key: "aop/app-root-ca.pem",
      caCertificatesBundleS3ObjectVersion: "ca-version-1",
      arn: "arn:aws:elasticloadbalancing:eu-west-2:123456789012:truststore/app/789",
    });
    const listener = child(
      component,
      LISTENER_TYPE,
      "app-aop-listener",
      {
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
          trustStoreArn: "arn:aws:elasticloadbalancing:eu-west-2:123456789012:truststore/app/789",
          ignoreClientCertificateExpiry: false,
        },
      },
      { mutualAuthentication: [trustStore] },
    );
    const sourceRule = child(component, SECURITY_GROUP_RULE_TYPE, "app-cf-source-0", {
      type: "ingress",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      cidrBlocks: ["173.245.48.0/20"],
      securityGroupId: "sg-lb",
    });
    const targetRule = child(component, SECURITY_GROUP_RULE_TYPE, "app-target-from-lb", {
      type: "ingress",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      sourceSecurityGroupId: "sg-lb",
      securityGroupId: "sg-target",
    });
    const aop = child(
      component,
      AOP_TYPE,
      "app-aop",
      {
        zoneId: "zone_123",
        configs: [{ certId: "cert_123", enabled: true, hostname: "app.example.com" }],
      },
      {},
      [listener, sourceRule, targetRule],
    );
    return [component, aop, trustStore, listener, sourceRule, targetRule];
  }

  it("reports CF_ORIGIN_1 when an application hostname has no CloudflareOriginIngress evidence", () => {
    const record = appRecord();
    validate([record]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_ORIGIN_1_RULE_ID);
    expect(violations[0]).toContain(record.urn);
  });

  it("reports when a matching component token has no concrete tunnel children", () => {
    validate([appRecord(), ingress("tunnel", { cloudflareAccountId: "acct_123" })]);
    expect(violations).toHaveLength(1);
  });

  it("does NOT report when an exact secure tunnel tuple is present", () => {
    validate([appRecord(), ...tunnelTuple()]);
    expect(violations).toEqual([]);
  });

  it.each([
    [
      "TLS verification disabled",
      {
        config: {
          ingresses: [
            {
              hostname: "app.example.com",
              service: "https://origin.internal",
              originRequest: { noTlsVerify: true },
            },
            { service: "http_status:404" },
          ],
        },
      },
      undefined,
    ],
    [
      "terminal fallback absent",
      {
        config: {
          ingresses: [
            {
              hostname: "app.example.com",
              service: "https://origin.internal",
              originRequest: { noTlsVerify: false, matchSnItoHost: true },
            },
          ],
        },
      },
      undefined,
    ],
    ["another account", { accountId: "acct_other" }, undefined],
    ["unbound tunnel id", {}, {}],
  ])("reports when tunnel evidence has %s", (_label, overrides, dependencies) => {
    validate([
      appRecord(),
      ...tunnelTuple(
        overrides as Record<string, unknown>,
        dependencies as Record<string, PolicyResource[]> | undefined,
      ),
    ]);
    expect(violations).toHaveLength(1);
  });

  it("does NOT report when an exact per-hostname AOP and ALB mTLS tuple is present", () => {
    validate([appRecord(), ...aopTuple()]);
    expect(violations).toEqual([]);
  });

  it.each([
    [
      "listener is absent",
      (resources: PolicyResource[]) => resources.filter((r) => r.type !== LISTENER_TYPE),
    ],
    [
      "trust store is absent",
      (resources: PolicyResource[]) => resources.filter((r) => r.type !== TRUST_STORE_TYPE),
    ],
    [
      "AOP is disabled",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === AOP_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  configs: [{ certId: "cert_123", enabled: false, hostname: "app.example.com" }],
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "AOP is not ordered after origin enforcement",
      (resources: PolicyResource[]) =>
        resources.map((resource) =>
          resource.type === AOP_TYPE
            ? ({ ...resource, dependencies: [] } as PolicyResource)
            : resource,
        ),
    ],
    [
      "AOP is bound to another hostname",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === AOP_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  configs: [{ certId: "cert_123", enabled: true, hostname: "other.example.com" }],
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "mTLS is passthrough",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === LISTENER_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  mutualAuthentication: { mode: "passthrough" },
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "client certificate expiry is ignored",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === LISTENER_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  mutualAuthentication: {
                    ...((r.props as Record<string, unknown>).mutualAuthentication as Record<
                      string,
                      unknown
                    >),
                    ignoreClientCertificateExpiry: true,
                  },
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "trust store is unbound",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === LISTENER_TYPE ? ({ ...r, propertyDependencies: {} } as PolicyResource) : r,
        ),
    ],
    [
      "listener uses another server certificate",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === LISTENER_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  certificateArn: "arn:aws:acm:eu-west-2:123456789012:certificate/other",
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "listener forwards to another target group",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === LISTENER_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  defaultActions: [
                    {
                      type: "forward",
                      targetGroupArn:
                        "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/other/999",
                    },
                  ],
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "CA bundle is unversioned",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === TRUST_STORE_TYPE
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  caCertificatesBundleS3ObjectVersion: undefined,
                },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "source rule is Internet-wide",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === SECURITY_GROUP_RULE_TYPE &&
          Array.isArray((r.props as Record<string, unknown>).cidrBlocks)
            ? ({
                ...r,
                props: { ...(r.props as Record<string, unknown>), cidrBlocks: ["0.0.0.0/0"] },
              } as PolicyResource)
            : r,
        ),
    ],
    [
      "target rule trusts another load balancer",
      (resources: PolicyResource[]) =>
        resources.map((r) =>
          r.type === SECURITY_GROUP_RULE_TYPE &&
          (r.props as Record<string, unknown>).sourceSecurityGroupId !== undefined
            ? ({
                ...r,
                props: {
                  ...(r.props as Record<string, unknown>),
                  sourceSecurityGroupId: "sg-other",
                },
              } as PolicyResource)
            : r,
        ),
    ],
  ])("reports when allowlist+AOP evidence has %s", (_label, mutate) => {
    validate([appRecord(), ...mutate(aopTuple())]);
    expect(violations).toHaveLength(1);
  });

  it("reports when only unrelated CloudflareOriginIngress evidence exists for another hostname", () => {
    const unrelatedIngress = ingress("tunnel", {
      hostname: "other.example.com",
      cloudflareAccountId: "acct_123",
    });
    validate([appRecord(), unrelatedIngress]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(appRecord().urn);
  });
});

// Cluster B regression — `isChildOf` in this pack used `urn.includes(\`${type}$\`)`
// over the full URN; the operator-controlled logical-name suffix could embed
// PUBLIC_HOSTNAME_TYPE or ZONE_FOUNDATION_TYPE and bypass CF_DNS_1 / CF_DNSSEC_1.
describe("HulumiCloudflareHardeningPack — forged-logical-name URN spoof", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };

  beforeEach(() => {
    violations = [];
  });

  it("CF_DNS_1 reports even when a raw DNS record's LOGICAL NAME embeds PublicHostname type", () => {
    // Raw DNS record marked as a public application whose logical name
    // carries the PublicHostname type token. Type chain is just the raw
    // DnsRecord, NOT a child of any PublicHostname component.
    const spoofedRecord = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::${PUBLIC_HOSTNAME_TYPE}$app-record`,
      name: `${PUBLIC_HOSTNAME_TYPE}$app-record`,
      // `purpose: "public-app"` makes this a real DNS-only public-app
      // record CF_DNS_1 should reject. Pre-fix, the spoofed logical name
      // made `isChildOf(urn, PUBLIC_HOSTNAME_TYPE)` substring-match `true`
      // → CF_DNS_1 early-returned and the violation never fired. Post-fix,
      // the anchored helper returns false (no real PublicHostname parent)
      // → the rule proceeds and reports as it should.
      props: { type: "A", proxied: false, purpose: "public-app" },
    });

    (
      cfDns1NoDnsOnlyPublicAppRecord.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([spoofedRecord]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_DNS_1_RULE_ID);
  });

  it("CF_DNSSEC_1 reports even when a raw zone's LOGICAL NAME embeds ZoneFoundation type", () => {
    const spoofedZone = makePolicyResource({
      type: ZONE_TYPE,
      urn: `urn:pulumi:s::p::${ZONE_TYPE}::${ZONE_FOUNDATION_TYPE}$evil-zone`,
      name: `${ZONE_FOUNDATION_TYPE}$evil-zone`,
      props: {},
    });

    (
      cfDnssec1RequirePublicZoneDnssec.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([spoofedZone]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_DNSSEC_1_RULE_ID);
  });
});
