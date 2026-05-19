// BDD scenarios for M4 Cloudflare hardening policy rules.

import { describe, it, expect, beforeEach } from "vitest";
import type { PolicyResource, ResourceValidationArgs, StackValidationArgs } from "@pulumi/policy";

import {
  CF_DNS_1_RULE_ID,
  CF_DNSSEC_1_RULE_ID,
  CF_ORIGIN_1_RULE_ID,
  cfDns1NoDnsOnlyPublicAppRecord,
  cfDnssec1RequirePublicZoneDnssec,
  cfOrigin1RequireSecureOriginMode,
} from "../../src/cloudflare";

function makeResourceArgs(partial: Partial<ResourceValidationArgs>): ResourceValidationArgs {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    opts: {} as ResourceValidationArgs["opts"],
    isType: (() => false) as ResourceValidationArgs["isType"],
    asType: ((): undefined => undefined) as ResourceValidationArgs["asType"],
    getConfig: (() => ({})) as ResourceValidationArgs["getConfig"],
    ...partial,
  } as ResourceValidationArgs;
}

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

  it("reports CF_DNS_1 when raw cloudflare.DnsRecord models a public app with proxied=false", () => {
    const args = makeResourceArgs({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::raw-app`,
      name: "raw-app",
      props: {
        type: "CNAME",
        name: "app",
        content: "origin.example.com",
        proxied: false,
        tags: ["hulumi:purpose=public-app"],
      },
    });

    (
      cfDns1NoDnsOnlyPublicAppRecord.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_DNS_1_RULE_ID);
    expect(violations[0]).toContain(args.urn);
  });

  it("does NOT report when the record is a child of PublicHostname", () => {
    const args = makeResourceArgs({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${PUBLIC_HOSTNAME_TYPE}$${DNS_RECORD_TYPE}::managed-app`,
      name: "managed-app",
      props: { type: "CNAME", name: "app", content: "target.example.com", proxied: false },
    });

    (
      cfDns1NoDnsOnlyPublicAppRecord.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toEqual([]);
  });

  it("honors a scoped suppression with a non-empty justification", () => {
    const args = makeResourceArgs({
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
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: CF_DNS_1_RULE_ID,
            reason: "Legacy cutover window tracked in ticket EDGE-12.",
            urnScope: "*",
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
    });

    (
      cfDns1NoDnsOnlyPublicAppRecord.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

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

  it("reports CF_ORIGIN_1 when an application hostname has no CloudflareOriginIngress evidence", () => {
    const appRecord = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::app`,
      name: "app",
      props: {
        type: "CNAME",
        name: "app.example.com",
        content: "public-origin.example.com",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });

    (
      cfOrigin1RequireSecureOriginMode.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([appRecord]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(CF_ORIGIN_1_RULE_ID);
    expect(violations[0]).toContain(appRecord.urn);
  });

  it("does NOT report when matching CloudflareOriginIngress evidence is present", () => {
    const appRecord = makePolicyResource({
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
    const ingress = makePolicyResource({
      type: ORIGIN_INGRESS_TYPE,
      urn: `urn:pulumi:s::p::${ORIGIN_INGRESS_TYPE}::app-ingress`,
      name: "app-ingress",
      props: { mode: "tunnel", hostname: "app.example.com" },
    });

    (
      cfOrigin1RequireSecureOriginMode.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([appRecord, ingress]), report);

    expect(violations).toEqual([]);
  });

  it("reports when only unrelated CloudflareOriginIngress evidence exists for another hostname", () => {
    const appRecord = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::api`,
      name: "api",
      props: {
        type: "CNAME",
        name: "api.example.com",
        content: "public-origin.example.com",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });
    const unrelatedIngress = makePolicyResource({
      type: ORIGIN_INGRESS_TYPE,
      urn: `urn:pulumi:s::p::${ORIGIN_INGRESS_TYPE}::app-ingress`,
      name: "api.example.com",
      props: { mode: "tunnel", hostname: "app.example.com" },
    });

    (
      cfOrigin1RequireSecureOriginMode.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([appRecord, unrelatedIngress]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(appRecord.urn);
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
    const spoofedArgs = makeResourceArgs({
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
      cfDns1NoDnsOnlyPublicAppRecord.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(spoofedArgs, report);

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
