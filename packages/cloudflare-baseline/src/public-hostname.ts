import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

import { assertValidTier } from "./tier";
import type { PublicHostnameArgs, PublicHostnameRecordType } from "./public-hostname.args";
import type {
  PublicHostnameOutputs,
  PublicHostnameProtectionMode,
} from "./public-hostname.outputs";

export const PUBLIC_HOSTNAME_COMPONENT_TYPE = "hulumi:cloudflare:PublicHostname";

const FQDN_REGEX = /^(?=.{1,253}$)([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const PROXY_ELIGIBLE_TYPES: readonly PublicHostnameRecordType[] = ["A", "AAAA", "CNAME"];

function isProxyEligible(recordType: PublicHostnameRecordType): boolean {
  return PROXY_ELIGIBLE_TYPES.includes(recordType);
}

function emitSecurityEvent(event: Record<string, unknown>): void {
  process.stderr.write(`security_event ${JSON.stringify(event)}\n`);
}

function validateArgs(name: string, args: PublicHostnameArgs): void {
  if (!FQDN_REGEX.test(args.hostname)) {
    throw new Error(
      `PublicHostname: hostname "${args.hostname}" must be a valid FQDN (no wildcards, no leading dots, must include a TLD)`,
    );
  }
  if (typeof args.zoneId === "string" && args.zoneId.trim().length === 0) {
    throw new Error("PublicHostname: zoneId must be a non-empty Cloudflare zone identifier");
  }
  if (args.purpose !== "public-app" && args.purpose !== "dns") {
    throw new Error(
      `PublicHostname: purpose must be one of "public-app" | "dns" (component "${name}")`,
    );
  }
  if (args.recordType === "MX" && args.priority === undefined) {
    throw new Error(`PublicHostname: MX records require priority (component "${name}")`);
  }
  if (!isProxyEligible(args.recordType) && args.proxied === true) {
    throw new Error(
      `PublicHostname: ${args.recordType} records are not Cloudflare proxy eligible (component "${name}")`,
    );
  }
  if (args.purpose === "public-app" && !isProxyEligible(args.recordType)) {
    throw new Error(
      `PublicHostname: public-app records must use A, AAAA, or CNAME so Cloudflare can proxy them (component "${name}")`,
    );
  }
  const effectiveProxied =
    args.purpose === "public-app" && isProxyEligible(args.recordType)
      ? (args.proxied ?? true)
      : false;
  if (args.purpose === "public-app" && effectiveProxied === false) {
    const just = args.dnsOnlyJustification;
    if (args.acknowledgeDnsOnlyExposure !== true || just === undefined || just.trim() === "") {
      throw new Error(
        "PublicHostname: proxied: false for public-app records requires acknowledgeDnsOnlyExposure: true and non-empty dnsOnlyJustification",
      );
    }
  }
}

export class PublicHostname extends pulumi.ComponentResource implements PublicHostnameOutputs {
  public readonly hostname: pulumi.Output<string>;
  public readonly recordId: pulumi.Output<string>;
  public readonly proxied: pulumi.Output<boolean>;
  public readonly protectionMode: pulumi.Output<PublicHostnameProtectionMode>;
  public readonly dnsOnlyJustification: pulumi.Output<string | undefined>;

  constructor(name: string, args: PublicHostnameArgs, opts?: pulumi.ComponentResourceOptions) {
    super(PUBLIC_HOSTNAME_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    validateArgs(name, args);

    const proxyEligible = isProxyEligible(args.recordType);
    const effectiveProxied =
      args.purpose === "public-app" && proxyEligible ? (args.proxied ?? true) : false;
    const dnsOnlyJustification = args.dnsOnlyJustification?.trim();

    if (args.purpose === "public-app" && effectiveProxied === false) {
      emitSecurityEvent({
        event: "dns_only_public_app_acknowledged",
        hostname: args.hostname,
        tier: args.tier,
        justification: dnsOnlyJustification,
      });
    }

    const recordArgs: cloudflare.DnsRecordArgs = {
      zoneId: args.zoneId,
      name: args.hostname,
      ttl: args.ttl ?? 1,
      type: args.recordType,
      content: args.target,
      ...(args.comment !== undefined ? { comment: args.comment } : {}),
      ...(args.priority !== undefined ? { priority: args.priority } : {}),
      ...(proxyEligible ? { proxied: effectiveProxied } : {}),
      tags: [
        "hulumi:component=PublicHostname",
        `hulumi:tier=${args.tier}`,
        `hulumi:purpose=${args.purpose}`,
        `hulumi:protection=${effectiveProxied ? "proxied" : "dns-only"}`,
      ],
    };
    const record = new cloudflare.DnsRecord(`${name}-record`, recordArgs, { parent: this });

    const protectionMode: PublicHostnameProtectionMode = effectiveProxied ? "proxied" : "dns-only";

    this.hostname = record.name;
    this.recordId = record.id;
    this.proxied = pulumi.output(effectiveProxied);
    this.protectionMode = pulumi.output(protectionMode);
    this.dnsOnlyJustification = pulumi.output(dnsOnlyJustification);

    this.registerOutputs({
      hostname: this.hostname,
      recordId: this.recordId,
      proxied: this.proxied,
      protectionMode: this.protectionMode,
      dnsOnlyJustification: this.dnsOnlyJustification,
    });
  }
}
