// BDD scenarios for M4 cross-provider origin-bypass policy.

import { describe, it, expect, beforeEach } from "vitest";
import type { PolicyResource, StackValidationArgs } from "@pulumi/policy";

import { X_ORIGIN_1_RULE_ID, xOrigin1NoPublicAwsOriginBypass } from "../../src/platform";

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

function makeStackArgs(resources: PolicyResource[]): StackValidationArgs {
  return {
    resources,
    getConfig: (() => ({})) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

const DNS_RECORD_TYPE = "cloudflare:index/dnsRecord:DnsRecord";
const ORIGIN_INGRESS_TYPE = "hulumi:platform:CloudflareOriginIngress";

describe("HulumiOriginBypassPack X_ORIGIN_1 — public AWS origin bypass", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports X_ORIGIN_1 advisory when Cloudflare DNS points to a public ALB without ingress controls", () => {
    const record = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::app`,
      name: "app",
      props: {
        type: "CNAME",
        name: "app",
        content: "app-123.us-east-1.elb.amazonaws.com",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });

    (
      xOrigin1NoPublicAwsOriginBypass.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([record]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(X_ORIGIN_1_RULE_ID);
    expect(violations[0]).toMatch(/advisory/i);
    expect(violations[0]).toContain(record.urn);
  });

  it("does NOT report when CloudflareOriginIngress evidence is present", () => {
    const record = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::app`,
      name: "app",
      props: {
        type: "CNAME",
        name: "app",
        content: "app-123.us-east-1.elb.amazonaws.com",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });
    const ingress = makePolicyResource({
      type: ORIGIN_INGRESS_TYPE,
      urn: `urn:pulumi:s::p::${ORIGIN_INGRESS_TYPE}::app-ingress`,
      name: "app-ingress",
      props: { mode: "allowlistAop", hostname: "app.example.com" },
    });

    (
      xOrigin1NoPublicAwsOriginBypass.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([record, ingress]), report);

    expect(violations).toEqual([]);
  });

  it("ignores non-AWS origins", () => {
    const record = makePolicyResource({
      type: DNS_RECORD_TYPE,
      urn: `urn:pulumi:s::p::${DNS_RECORD_TYPE}::cdn`,
      name: "cdn",
      props: {
        type: "CNAME",
        name: "cdn",
        content: "storage.example.net",
        proxied: true,
        tags: ["hulumi:purpose=public-app"],
      },
    });

    (
      xOrigin1NoPublicAwsOriginBypass.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([record]), report);

    expect(violations).toEqual([]);
  });
});
