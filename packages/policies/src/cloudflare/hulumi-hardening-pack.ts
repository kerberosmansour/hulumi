import type {
  PolicyResource,
  ResourceValidationPolicy,
  StackValidationPolicy,
} from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { matchSuppression, type Suppression } from "../aws/suppressions";

export const CF_DNS_1_RULE_ID = "CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD";
export const CF_DNSSEC_1_RULE_ID = "CF_DNSSEC_1_REQUIRE_PUBLIC_ZONE_DNSSEC";
export const CF_ORIGIN_1_RULE_ID = "CF_ORIGIN_1_REQUIRE_SECURE_ORIGIN_MODE";

const DNS_RECORD_TYPES = [
  "cloudflare:index/dnsRecord:DnsRecord",
  "cloudflare:index/record:Record",
] as const;
const ZONE_TYPE = "cloudflare:index/zone:Zone";
const ZONE_DNSSEC_TYPE = "cloudflare:index/zoneDnssec:ZoneDnssec";
const PUBLIC_HOSTNAME_TYPE = "hulumi:cloudflare:PublicHostname";
const ZONE_FOUNDATION_TYPE = "hulumi:cloudflare:ZoneFoundation";
const ORIGIN_INGRESS_TYPE = "hulumi:platform:CloudflareOriginIngress";

const DOCS_URL =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/cloudflare-policy-packs.md";

function readSuppressions(config: Record<string, unknown> | undefined): Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.ruleId === "string" && typeof o.reason === "string" && o.reason.trim() !== "";
  });
}

function isDnsRecordType(type: string): boolean {
  return (DNS_RECORD_TYPES as readonly string[]).includes(type);
}

function isChildOf(urn: string, componentType: string): boolean {
  return urn.includes(`${componentType}$`);
}

function stringArrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.some((item) => item === needle);
}

function tagsMarkPublicApp(tags: unknown): boolean {
  if (Array.isArray(tags)) {
    return tags.includes("hulumi:purpose=public-app") || tags.includes("public-app");
  }
  if (tags !== null && typeof tags === "object") {
    const record = tags as Record<string, unknown>;
    return record["hulumi:purpose"] === "public-app" || record.purpose === "public-app";
  }
  return false;
}

function marksPublicApp(props: Record<string, unknown>): boolean {
  if (props.purpose === "public-app") return true;
  if (tagsMarkPublicApp(props.tags)) return true;
  if (typeof props.comment === "string" && props.comment.includes("hulumi:purpose=public-app")) {
    return true;
  }
  return stringArrayIncludes(props.hulumiControls, "public-app");
}

function isProxyEligiblePublicAppRecord(resource: {
  type: string;
  props: unknown;
  urn: string;
}): boolean {
  if (!isDnsRecordType(resource.type)) return false;
  const props = resource.props as Record<string, unknown>;
  const recordType = typeof props.type === "string" ? props.type.toUpperCase() : "";
  if (!["A", "AAAA", "CNAME"].includes(recordType)) return false;
  return marksPublicApp(props) || isChildOf(resource.urn, PUBLIC_HOSTNAME_TYPE);
}

function isDnsOnlyPublicAppRecord(args: { type: string; props: unknown; urn: string }): boolean {
  if (!isProxyEligiblePublicAppRecord(args)) return false;
  const props = args.props as Record<string, unknown>;
  return props.proxied !== true;
}

function publicZones(resources: readonly PolicyResource[]): PolicyResource[] {
  return resources.filter((resource) => {
    if (resource.type !== ZONE_TYPE) return false;
    const props = resource.props as Record<string, unknown>;
    return props.type !== "partial" && props.paused !== true;
  });
}

function normalizedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/\.$/u, "");
  return normalized.length > 0 ? normalized : undefined;
}

function addNormalized(candidates: Set<string>, value: unknown): void {
  const normalized = normalizedString(value);
  if (normalized !== undefined) candidates.add(normalized);
}

function stringPropCandidates(resource: PolicyResource, propNames: readonly string[]): Set<string> {
  const candidates = new Set<string>();
  const props = resource.props as Record<string, unknown>;
  for (const propName of propNames) addNormalized(candidates, props[propName]);
  return candidates;
}

function hasSharedCandidate(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function hasDependencyOn(resource: PolicyResource, target: PolicyResource): boolean {
  if (resource.dependencies.some((dependency) => dependency.urn === target.urn)) return true;
  for (const dependencies of Object.values(resource.propertyDependencies)) {
    if (
      Array.isArray(dependencies) &&
      dependencies.some((dependency) => dependency.urn === target.urn)
    ) {
      return true;
    }
  }
  return false;
}

function hasDnssecEvidenceForZone(
  resources: readonly PolicyResource[],
  zone: PolicyResource,
): boolean {
  const zoneCandidates = stringPropCandidates(zone, ["id", "zoneId", "zone", "name"]);
  return resources.some((resource) => {
    if (resource.type !== ZONE_DNSSEC_TYPE) return false;
    if (hasDependencyOn(resource, zone)) return true;
    const dnssecCandidates = stringPropCandidates(resource, ["zoneId", "zone", "name"]);
    return hasSharedCandidate(zoneCandidates, dnssecCandidates);
  });
}

function recordHostname(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return (
    normalizedString(props.hostname) ??
    normalizedString(props.name) ??
    normalizedString(resource.name)
  );
}

function ingressHostname(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return normalizedString(props.hostname);
}

function hasIngressEvidenceForRecord(
  resources: readonly PolicyResource[],
  record: PolicyResource,
): boolean {
  const hostname = recordHostname(record);
  if (hostname === undefined) return false;
  return resources.some((resource) => {
    if (resource.type !== ORIGIN_INGRESS_TYPE) return false;
    return ingressHostname(resource) === hostname;
  });
}

export const cfDns1NoDnsOnlyPublicAppRecord: ResourceValidationPolicy = {
  name: CF_DNS_1_RULE_ID,
  description: "Rejects DNS-only public application records that bypass Cloudflare proxying.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!isDnsOnlyPublicAppRecord(args)) return;
    if (isChildOf(args.urn, PUBLIC_HOSTNAME_TYPE)) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression(CF_DNS_1_RULE_ID, args.urn, suppressions).suppressed) return;
    reportViolation(
      `${CF_DNS_1_RULE_ID}: raw DNS-only public application record detected at ${args.urn}. Use @hulumi/cloudflare-baseline.PublicHostname or set an explicit scoped suppression with a justification. Docs: ${DOCS_URL}`,
    );
  },
};

export const cfDnssec1RequirePublicZoneDnssec: StackValidationPolicy = {
  name: CF_DNSSEC_1_RULE_ID,
  description: "Requires public Cloudflare zones to carry DNSSEC evidence.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    for (const zone of publicZones(args.resources)) {
      if (isChildOf(zone.urn, ZONE_FOUNDATION_TYPE)) continue;
      if (hasDnssecEvidenceForZone(args.resources, zone)) continue;
      if (matchSuppression(CF_DNSSEC_1_RULE_ID, zone.urn, suppressions).suppressed) continue;
      reportViolation(
        `${CF_DNSSEC_1_RULE_ID}: public Cloudflare zone ${zone.urn} has no ZoneFoundation or ZoneDnssec evidence. Use ZoneFoundation/DNSSEC or a migration suppression with justification. Docs: ${DOCS_URL}`,
      );
    }
  },
};

export const cfOrigin1RequireSecureOriginMode: StackValidationPolicy = {
  name: CF_ORIGIN_1_RULE_ID,
  description: "Requires application hostnames to carry secure origin-mode evidence.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    for (const resource of args.resources) {
      if (!isProxyEligiblePublicAppRecord(resource)) continue;
      if (hasIngressEvidenceForRecord(args.resources, resource)) continue;
      if (matchSuppression(CF_ORIGIN_1_RULE_ID, resource.urn, suppressions).suppressed) continue;
      reportViolation(
        `${CF_ORIGIN_1_RULE_ID}: application hostname ${resource.urn} has no CloudflareOriginIngress tunnel or allowlist+AOP evidence. Docs: ${DOCS_URL}`,
      );
    }
  },
};

export const hulumiCloudflareHardeningPackMetadata: PackMetadata = {
  id: "hulumi-cloudflare-hardening-pack",
  title: "Hulumi Cloudflare Hardening Pack",
  framework: "cloudflare",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: CF_DNS_1_RULE_ID,
      title: "No DNS-only public application records",
      description: cfDns1NoDnsOnlyPublicAppRecord.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IVS-06", "NIST-800-53-r5:SC-7"],
      docsUrl: DOCS_URL,
    },
    {
      id: CF_DNSSEC_1_RULE_ID,
      title: "Public Cloudflare zones require DNSSEC evidence",
      description: cfDnssec1RequirePublicZoneDnssec.description!,
      severity: "medium",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IVS-06", "NIST-800-53-r5:SC-20"],
      docsUrl: DOCS_URL,
    },
    {
      id: CF_ORIGIN_1_RULE_ID,
      title: "Application hostnames require secure origin evidence",
      description: cfOrigin1RequireSecureOriginMode.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["CCM:IVS-06", "NIST-800-53-r5:SC-7"],
      docsUrl: DOCS_URL,
    },
  ],
};
