import type { PolicyResource, StackValidationPolicy } from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { matchSuppression, type Suppression } from "../aws/suppressions";
import { isUrnChildOfComponent } from "../urn";

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
const TUNNEL_TYPE = "cloudflare:index/zeroTrustTunnelCloudflared:ZeroTrustTunnelCloudflared";
const TUNNEL_CONFIG_TYPE =
  "cloudflare:index/zeroTrustTunnelCloudflaredConfig:ZeroTrustTunnelCloudflaredConfig";
const AOP_TYPE = "cloudflare:index/authenticatedOriginPulls:AuthenticatedOriginPulls";
const TRUST_STORE_TYPE = "aws:lb/trustStore:TrustStore";
const LISTENER_TYPE = "aws:lb/listener:Listener";
const SECURITY_GROUP_RULE_TYPE = "aws:ec2/securityGroupRule:SecurityGroupRule";
const ALB_TLS_POLICY = "ELBSecurityPolicy-TLS13-1-2-2021-06";
const CLOUDFLARE_IPV4_ORIGIN_CIDRS = new Set([
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
]);

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
  // Anchored URN type-chain check — see ../urn.ts. The previous form
  // `urn.includes(\`${componentType}$\`)` matched a substring anywhere in
  // the URN, including the operator-controlled logical-name suffix, so a
  // raw DnsRecord / zone named `hulumi:cloudflare:PublicHostname$x` could
  // bypass CF_DNS_1 / CF_DNSSEC_1.
  return isUrnChildOfComponent(urn, componentType);
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

function hasAcknowledgedPublicHostnameParent(
  resources: readonly PolicyResource[],
  record: PolicyResource,
): boolean {
  if (!isChildOf(record.urn, PUBLIC_HOSTNAME_TYPE)) return false;
  if (record.parent?.type !== PUBLIC_HOSTNAME_TYPE) return false;
  const parent = resources.find(
    (resource) => resource.type === PUBLIC_HOSTNAME_TYPE && resource.urn === record.parent?.urn,
  );
  if (parent === undefined) return false;
  const props = parent.props as Record<string, unknown>;
  const justification = props.dnsOnlyJustification;
  if (
    props.purpose !== "public-app" ||
    props.proxied !== false ||
    props.acknowledgeDnsOnlyExposure !== true ||
    typeof justification !== "string" ||
    justification.trim().length === 0
  ) {
    return false;
  }
  const parentHostname = normalizedString(props.hostname);
  const childHostname = recordHostname(record);
  return parentHostname !== undefined && parentHostname === childHostname;
}

function ingressHostname(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return normalizedString(props.hostname);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function exactString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function isDirectChildOf(
  resource: PolicyResource,
  parent: PolicyResource,
  childType: string,
): boolean {
  return (
    resource.type === childType &&
    resource.parent?.type === parent.type &&
    resource.parent.urn === parent.urn &&
    isUrnChildOfComponent(resource.urn, parent.type)
  );
}

function directChildren(
  resources: readonly PolicyResource[],
  parent: PolicyResource,
  childType: string,
): PolicyResource[] {
  return resources.filter((resource) => isDirectChildOf(resource, parent, childType));
}

function propertyDependsOn(
  resource: PolicyResource,
  property: string,
  target: PolicyResource,
): boolean {
  const dependencies = resource.propertyDependencies[property];
  return (
    Array.isArray(dependencies) &&
    dependencies.some(
      (dependency) => dependency.type === target.type && dependency.urn === target.urn,
    )
  );
}

function hasSecureTunnelEvidence(
  resources: readonly PolicyResource[],
  component: PolicyResource,
): boolean {
  const componentProps = component.props as Record<string, unknown>;
  const accountId = exactString(componentProps.cloudflareAccountId);
  if (accountId === undefined) return false;
  const hostname = ingressHostname(component);
  if (hostname === undefined) return false;

  const tunnels = directChildren(resources, component, TUNNEL_TYPE);
  const configs = directChildren(resources, component, TUNNEL_CONFIG_TYPE);
  if (tunnels.length !== 1 || configs.length !== 1) return false;

  const tunnel = tunnels[0];
  const tunnelProps = tunnel.props as Record<string, unknown>;
  if (tunnelProps.accountId !== accountId || tunnelProps.configSrc !== "cloudflare") return false;

  const configResource = configs[0];
  const configProps = configResource.props as Record<string, unknown>;
  if (
    configProps.accountId !== accountId ||
    configProps.source !== "cloudflare" ||
    !propertyDependsOn(configResource, "tunnelId", tunnel)
  ) {
    return false;
  }
  const config = objectValue(configProps.config);
  const ingresses = config?.ingresses;
  if (!Array.isArray(ingresses) || ingresses.length < 2) return false;
  const fallback = objectValue(ingresses.at(-1));
  if (fallback?.service !== "http_status:404" || fallback.hostname !== undefined) return false;

  return ingresses.slice(0, -1).some((entry) => {
    const route = objectValue(entry);
    if (normalizedString(route?.hostname) !== hostname) return false;
    if (exactString(route?.service) === undefined) return false;
    const request = objectValue(route?.originRequest);
    return request?.noTlsVerify === false && request.matchSnItoHost === true;
  });
}

function exactIngressRule(
  resource: PolicyResource,
  port: number,
  securityGroupId: string,
): Record<string, unknown> | undefined {
  const props = resource.props as Record<string, unknown>;
  if (
    props.type !== "ingress" ||
    props.fromPort !== port ||
    props.toPort !== port ||
    props.protocol !== "tcp" ||
    props.securityGroupId !== securityGroupId
  ) {
    return undefined;
  }
  return props;
}

function hasSecureAopEvidence(
  resources: readonly PolicyResource[],
  component: PolicyResource,
): boolean {
  const props = component.props as Record<string, unknown>;
  const hostname = ingressHostname(component);
  const zoneId = exactString(props.cloudflareZoneId);
  const certificateId = exactString(props.authenticatedOriginPullCertificateId);
  const loadBalancerSecurityGroupId = exactString(props.loadBalancerSecurityGroupId);
  const targetSecurityGroupId = exactString(props.targetSecurityGroupId);
  const loadBalancerArn = exactString(props.loadBalancerArn);
  const serverCertificateArn = exactString(props.originServerCertificateArn);
  const targetGroupArn = exactString(props.originTargetGroupArn);
  const caBucket = exactString(props.aopCaBundleS3Bucket);
  const caKey = exactString(props.aopCaBundleS3Key);
  const caObjectVersion = exactString(props.aopCaBundleS3ObjectVersion);
  const port = props.originPort;
  const cidrs = stringArray(props.cloudflareSourceCidrBlocks);
  if (
    hostname === undefined ||
    zoneId === undefined ||
    certificateId === undefined ||
    loadBalancerSecurityGroupId === undefined ||
    targetSecurityGroupId === undefined ||
    loadBalancerArn === undefined ||
    serverCertificateArn === undefined ||
    targetGroupArn === undefined ||
    caBucket === undefined ||
    caKey === undefined ||
    caObjectVersion === undefined ||
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    cidrs === undefined ||
    cidrs.length === 0 ||
    new Set(cidrs).size !== cidrs.length ||
    !cidrs.every((cidr) => CLOUDFLARE_IPV4_ORIGIN_CIDRS.has(cidr))
  ) {
    return false;
  }

  const aops = directChildren(resources, component, AOP_TYPE);
  const trustStores = directChildren(resources, component, TRUST_STORE_TYPE);
  const listeners = directChildren(resources, component, LISTENER_TYPE);
  const securityGroupRules = directChildren(resources, component, SECURITY_GROUP_RULE_TYPE);
  if (
    aops.length !== 1 ||
    trustStores.length !== 1 ||
    listeners.length !== 1 ||
    securityGroupRules.length !== cidrs.length + 1
  ) {
    return false;
  }

  const aopProps = aops[0].props as Record<string, unknown>;
  const configs = aopProps.configs;
  if (!Array.isArray(configs) || configs.length !== 1 || aopProps.zoneId !== zoneId) return false;
  const aopConfig = objectValue(configs[0]);
  if (
    aopConfig?.enabled !== true ||
    aopConfig.certId !== certificateId ||
    normalizedString(aopConfig.hostname) !== hostname
  ) {
    return false;
  }

  const trustStore = trustStores[0];
  const trustProps = trustStore.props as Record<string, unknown>;
  if (
    trustProps.caCertificatesBundleS3Bucket !== caBucket ||
    trustProps.caCertificatesBundleS3Key !== caKey ||
    trustProps.caCertificatesBundleS3ObjectVersion !== caObjectVersion
  ) {
    return false;
  }

  const listener = listeners[0];
  const listenerProps = listener.props as Record<string, unknown>;
  const actions = listenerProps.defaultActions;
  const mutualAuthentication = objectValue(listenerProps.mutualAuthentication);
  if (
    listenerProps.loadBalancerArn !== loadBalancerArn ||
    listenerProps.certificateArn !== serverCertificateArn ||
    listenerProps.protocol !== "HTTPS" ||
    listenerProps.port !== port ||
    listenerProps.sslPolicy !== ALB_TLS_POLICY ||
    !Array.isArray(actions) ||
    actions.length !== 1 ||
    mutualAuthentication?.mode !== "verify" ||
    mutualAuthentication.ignoreClientCertificateExpiry !== false ||
    exactString(mutualAuthentication.trustStoreArn) === undefined ||
    !propertyDependsOn(listener, "mutualAuthentication", trustStore)
  ) {
    return false;
  }
  const action = objectValue(actions[0]);
  if (action?.type !== "forward" || action.targetGroupArn !== targetGroupArn) return false;

  const sourceRules = securityGroupRules.filter((rule) => {
    const ruleProps = exactIngressRule(rule, port, loadBalancerSecurityGroupId);
    return ruleProps !== undefined && ruleProps.cidrBlocks !== undefined;
  });
  if (sourceRules.length !== cidrs.length) return false;
  for (const cidr of cidrs) {
    const matches = sourceRules.filter((rule) => {
      const ruleProps = rule.props as Record<string, unknown>;
      const blocks = stringArray(ruleProps.cidrBlocks);
      return blocks?.length === 1 && blocks[0] === cidr;
    });
    if (matches.length !== 1) return false;
  }

  const targetRules = securityGroupRules.filter((rule) => {
    const ruleProps = exactIngressRule(rule, port, targetSecurityGroupId);
    return (
      ruleProps !== undefined &&
      ruleProps.sourceSecurityGroupId === loadBalancerSecurityGroupId &&
      ruleProps.cidrBlocks === undefined
    );
  });
  if (targetRules.length !== 1) return false;
  return [listener, ...sourceRules, targetRules[0]].every((resource) =>
    hasDependencyOn(aops[0], resource),
  );
}

function hasIngressEvidenceForRecord(
  resources: readonly PolicyResource[],
  record: PolicyResource,
): boolean {
  const hostname = recordHostname(record);
  if (hostname === undefined) return false;
  return resources.some((resource) => {
    if (resource.type !== ORIGIN_INGRESS_TYPE) return false;
    if (ingressHostname(resource) !== hostname) return false;
    const props = resource.props as Record<string, unknown>;
    if (props.mode === "tunnel") return hasSecureTunnelEvidence(resources, resource);
    if (props.mode === "allowlistAop") return hasSecureAopEvidence(resources, resource);
    return false;
  });
}

export const cfDns1NoDnsOnlyPublicAppRecord: StackValidationPolicy = {
  name: CF_DNS_1_RULE_ID,
  description:
    "Rejects DNS-only public application records unless a concrete PublicHostname parent records an explicit acknowledgement and justification.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    for (const resource of args.resources) {
      if (!isDnsOnlyPublicAppRecord(resource)) continue;
      if (hasAcknowledgedPublicHostnameParent(args.resources, resource)) continue;
      if (matchSuppression(CF_DNS_1_RULE_ID, resource.urn, suppressions).suppressed) continue;
      reportViolation(
        `${CF_DNS_1_RULE_ID}: DNS-only public application record ${resource.urn} lacks a concrete matching PublicHostname parent with acknowledgeDnsOnlyExposure: true and a non-empty dnsOnlyJustification. Use @hulumi/cloudflare-baseline.PublicHostname or set an explicit scoped suppression with a justification. Docs: ${DOCS_URL}`,
      );
    }
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
