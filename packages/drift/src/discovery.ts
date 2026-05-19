import { createHash } from "node:crypto";

import type {
  ReconcileScope,
  ReconcileTarget,
  ResourceIdentity,
  ResourceOwnershipEvidence,
  ResourceRelationship,
} from "./reconciler";

// Security-control services that are account-region singletons by nature:
// deleting one tears down the account's entire detection/posture surface.
// Treated as shared singletons even when discovery has no caller-supplied
// `singleton` flag, so the reconciler's singleton guard always fires.
const SECURITY_SINGLETON_TYPE =
  /^aws:guardduty\/detector:Detector$|^aws:securityhub\/account:Account$/;

export function isSecuritySingletonType(type: string): boolean {
  return SECURITY_SINGLETON_TYPE.test(type);
}

export interface PulumiStateResource {
  urn: string;
  type: string;
  id?: string;
  outputs?: Record<string, unknown>;
}

export interface PulumiStateExport {
  resources?: PulumiStateResource[];
  deployment?: {
    resources?: PulumiStateResource[];
  };
}

export interface CloudInventoryResource extends ResourceIdentity {
  ownership?: ResourceOwnershipEvidence[];
}

export interface DiscoveryScope extends ReconcileScope {
  urns?: string[];
  physicalIds?: string[];
  resourceTypes?: string[];
  tags?: Record<string, string>;
}

export interface DiscoveryDiagnostic {
  resourceRef: string;
  reason:
    | "account-out-of-scope"
    | "region-out-of-scope"
    | "prefix-out-of-scope"
    | "tag-out-of-scope"
    | "type-out-of-scope"
    | "urn-out-of-scope";
}

export interface DiscoverReconcileTargetsRequest {
  scope: DiscoveryScope;
  pulumiState?: PulumiStateExport;
  cloudResources: CloudInventoryResource[];
}

export interface DiscoverReconcileTargetsResult {
  targets: ReconcileTarget[];
  diagnostics: DiscoveryDiagnostic[];
}

export function discoverReconcileTargets(
  request: DiscoverReconcileTargetsRequest,
): DiscoverReconcileTargetsResult {
  assertExplicitSelector(request.scope);

  const diagnostics: DiscoveryDiagnostic[] = [];
  const stateResources = getStateResources(request.pulumiState);
  const scopedCloud = request.cloudResources.filter((resource) => {
    const reason = outOfScopeReason(resource, request.scope);
    if (reason !== undefined) {
      diagnostics.push({ resourceRef: stableRef(resource), reason });
      return false;
    }
    return true;
  });

  const cloudByPhysicalId = new Map<string, CloudInventoryResource>();
  for (const resource of scopedCloud) {
    if (resource.physicalId !== undefined) {
      cloudByPhysicalId.set(resource.physicalId, resource);
    }
  }

  const targets: ReconcileTarget[] = [];
  const matchedCloudIds = new Set<string>();

  for (const resource of stateResources) {
    if (!stateInScope(resource, request.scope)) {
      continue;
    }
    const physicalId = statePhysicalId(resource);
    const cloud = physicalId === undefined ? undefined : cloudByPhysicalId.get(physicalId);
    if (physicalId !== undefined && cloud !== undefined) {
      matchedCloudIds.add(physicalId);
    }
    const identity: ResourceIdentity = {
      provider: providerFromType(resource.type),
      type: resource.type,
      urn: resource.urn,
      ...(cloud?.region !== undefined ? { region: cloud.region } : {}),
      ...(cloud?.accountId !== undefined ? { accountId: cloud.accountId } : {}),
      ...(cloud?.tags !== undefined ? { tags: cloud.tags } : {}),
      ...(cloud?.createdAt !== undefined ? { createdAt: cloud.createdAt } : {}),
      ...(cloud?.singleton === true || isSecuritySingletonType(resource.type)
        ? { singleton: true }
        : cloud?.singleton !== undefined
          ? { singleton: cloud.singleton }
          : {}),
    };
    if (physicalId !== undefined) identity.physicalId = physicalId;
    targets.push({
      identity,
      inState: true,
      existsInCloud: cloud !== undefined,
      relationship: cloud === undefined ? "state-missing" : "state-owned",
      ownership: [{ signal: "pulumi-state", subject: resource.urn, confidence: "high" }],
    });
  }

  for (const resource of scopedCloud) {
    if (resource.physicalId !== undefined && matchedCloudIds.has(resource.physicalId)) {
      continue;
    }
    const ownership = ownershipEvidenceFor(resource, request.scope);
    const identity: ResourceIdentity =
      isSecuritySingletonType(resource.type) && resource.singleton !== true
        ? { ...resource, singleton: true }
        : resource;
    targets.push({
      identity,
      inState: false,
      existsInCloud: true,
      relationship: relationshipFor(identity, ownership),
      ownership,
    });
  }

  return {
    targets: targets.sort(compareTargets),
    diagnostics,
  };
}

function assertExplicitSelector(scope: DiscoveryScope): void {
  const hasTagSelector = scope.tags !== undefined && Object.keys(scope.tags).length > 0;
  const hasSelector =
    scope.resourcePrefix !== undefined ||
    hasTagSelector ||
    (scope.urns?.length ?? 0) > 0 ||
    (scope.physicalIds?.length ?? 0) > 0 ||
    (scope.resourceTypes?.length ?? 0) > 0;
  if (!hasSelector) {
    throw new Error("Discovery requires at least one explicit selector.");
  }
}

function getStateResources(state: PulumiStateExport | undefined): PulumiStateResource[] {
  return state?.deployment?.resources ?? state?.resources ?? [];
}

function statePhysicalId(resource: PulumiStateResource): string | undefined {
  if (resource.id !== undefined && resource.id.length > 0) return resource.id;
  for (const key of ["bucket", "name", "arn", "id"]) {
    const value = resource.outputs?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function providerFromType(type: string): ResourceIdentity["provider"] {
  if (type.startsWith("aws:")) return "aws";
  if (type.startsWith("github:")) return "github";
  if (type.startsWith("kubernetes:")) return "kubernetes";
  if (type.startsWith("pulumi:")) return "pulumi";
  return "unknown";
}

function outOfScopeReason(
  resource: CloudInventoryResource,
  scope: DiscoveryScope,
): DiscoveryDiagnostic["reason"] | undefined {
  if (
    scope.accountIds !== undefined &&
    resource.accountId !== undefined &&
    !scope.accountIds.includes(resource.accountId)
  ) {
    return "account-out-of-scope";
  }
  if (
    scope.regions !== undefined &&
    resource.region !== undefined &&
    !scope.regions.includes(resource.region)
  ) {
    return "region-out-of-scope";
  }
  if (scope.resourceTypes !== undefined && !scope.resourceTypes.includes(resource.type)) {
    return "type-out-of-scope";
  }
  if (scope.physicalIds !== undefined && !scope.physicalIds.includes(resource.physicalId ?? "")) {
    return "prefix-out-of-scope";
  }
  if (scope.resourcePrefix !== undefined && !matchesPrefix(resource, scope.resourcePrefix)) {
    return "prefix-out-of-scope";
  }
  if (scope.tags !== undefined && !matchesTags(resource.tags, scope.tags)) {
    return "tag-out-of-scope";
  }
  return undefined;
}

function stateInScope(resource: PulumiStateResource, scope: DiscoveryScope): boolean {
  if (scope.urns !== undefined && !scope.urns.includes(resource.urn)) return false;
  if (scope.resourceTypes !== undefined && !scope.resourceTypes.includes(resource.type))
    return false;
  const physicalId = statePhysicalId(resource);
  if (scope.physicalIds !== undefined && !scope.physicalIds.includes(physicalId ?? ""))
    return false;
  if (
    scope.resourcePrefix !== undefined &&
    physicalId !== undefined &&
    !physicalId.startsWith(scope.resourcePrefix)
  ) {
    return false;
  }
  return true;
}

function matchesPrefix(resource: CloudInventoryResource, prefix: string): boolean {
  return (
    (resource.physicalId ?? "").startsWith(prefix) || (resource.tags?.Name ?? "").startsWith(prefix)
  );
}

function matchesTags(
  tags: Record<string, string> | undefined,
  selector: Record<string, string>,
): boolean {
  if (tags === undefined) return false;
  return Object.entries(selector).every(([key, value]) => tags[key] === value);
}

function ownershipEvidenceFor(
  resource: CloudInventoryResource,
  scope: DiscoveryScope,
): ResourceOwnershipEvidence[] {
  const evidence: ResourceOwnershipEvidence[] = [...(resource.ownership ?? [])];
  if (scope.resourcePrefix !== undefined && matchesPrefix(resource, scope.resourcePrefix)) {
    evidence.push({
      signal: "name-prefix",
      subject: resource.physicalId ?? scope.resourcePrefix,
      confidence: "high",
    });
  }
  for (const [key, value] of Object.entries(resource.tags ?? {})) {
    if (key.startsWith("hulumi:")) {
      evidence.push({ signal: "tag", subject: `${key}=${value}`, confidence: "high" });
    }
  }
  return evidence;
}

function relationshipFor(
  resource: CloudInventoryResource,
  evidence: ResourceOwnershipEvidence[],
): ResourceRelationship {
  if (resource.singleton === true) return "shared-singleton";
  if (evidence.length === 0) return "unknown";
  return "cloud-only";
}

function stableRef(resource: CloudInventoryResource): string {
  return `<redacted:${createHash("sha256")
    .update(`${resource.type}:${resource.physicalId ?? resource.urn ?? "unknown"}`)
    .digest("hex")
    .slice(0, 12)}>`;
}

function compareTargets(a: ReconcileTarget, b: ReconcileTarget): number {
  return `${a.relationship ?? ""}:${a.identity.type}:${a.identity.urn ?? ""}:${a.identity.physicalId ?? ""}`.localeCompare(
    `${b.relationship ?? ""}:${b.identity.type}:${b.identity.urn ?? ""}:${b.identity.physicalId ?? ""}`,
  );
}
