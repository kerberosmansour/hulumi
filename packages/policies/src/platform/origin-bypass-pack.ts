import type { PolicyResource, StackValidationPolicy } from "@pulumi/policy";

import type { PackMetadata } from "../metadata";

export const X_ORIGIN_1_RULE_ID = "X_ORIGIN_1_NO_PUBLIC_AWS_ORIGIN_BYPASS";

const DNS_RECORD_TYPES = [
  "cloudflare:index/dnsRecord:DnsRecord",
  "cloudflare:index/record:Record",
] as const;
const ORIGIN_INGRESS_TYPE = "hulumi:platform:CloudflareOriginIngress";
const DOCS_URL =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/origin-bypass-policy-pack.md";

function isDnsRecordType(type: string): boolean {
  return (DNS_RECORD_TYPES as readonly string[]).includes(type);
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

function isCloudflarePublicAppRecord(resource: PolicyResource): boolean {
  if (!isDnsRecordType(resource.type)) return false;
  const props = resource.props as Record<string, unknown>;
  const recordType = typeof props.type === "string" ? props.type.toUpperCase() : "";
  return ["A", "AAAA", "CNAME"].includes(recordType) && tagsMarkPublicApp(props.tags);
}

function pointsAtPublicAwsLoadBalancer(resource: PolicyResource): boolean {
  const props = resource.props as Record<string, unknown>;
  const target = typeof props.content === "string" ? props.content : "";
  return /\.elb\.amazonaws\.com$/i.test(target);
}

function normalizedHostname(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/\.$/u, "");
  return normalized.length > 0 ? normalized : undefined;
}

function recordHostname(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return (
    normalizedHostname(props.hostname) ??
    normalizedHostname(props.name) ??
    normalizedHostname(resource.name)
  );
}

function ingressHostname(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return normalizedHostname(props.hostname);
}

function hasOriginIngressForRecord(
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

export const xOrigin1NoPublicAwsOriginBypass: StackValidationPolicy = {
  name: X_ORIGIN_1_RULE_ID,
  description:
    "Detects Cloudflare-fronted public AWS origins that lack tunnel or allowlist+AOP evidence.",
  enforcementLevel: "advisory",
  validateStack: (args, reportViolation) => {
    for (const resource of args.resources) {
      if (!isCloudflarePublicAppRecord(resource)) continue;
      if (!pointsAtPublicAwsLoadBalancer(resource)) continue;
      if (hasOriginIngressForRecord(args.resources, resource)) continue;
      reportViolation(
        `${X_ORIGIN_1_RULE_ID} advisory: Cloudflare DNS record ${resource.urn} points at a public AWS load balancer without CloudflareOriginIngress tunnel or allowlist+AOP evidence. Docs: ${DOCS_URL}`,
        undefined,
      );
    }
  },
};

export const hulumiOriginBypassPackMetadata: PackMetadata = {
  id: "hulumi-origin-bypass-pack",
  title: "Hulumi Origin Bypass Pack",
  framework: "hulumi",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: X_ORIGIN_1_RULE_ID,
      title: "No public AWS origin bypass behind Cloudflare",
      description: xOrigin1NoPublicAwsOriginBypass.description!,
      severity: "high",
      enforcement: "advisory",
      frameworkIds: ["CCM:IVS-06", "NIST-800-53-r5:SC-7"],
      docsUrl: DOCS_URL,
    },
  ],
};
